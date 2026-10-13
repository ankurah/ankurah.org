#!/usr/bin/env python3
"""Import the actual October 13 study, verifying every timing against raw Criterion JSON.

Usage: python3 scripts/import-local-benchmarks.py /path/to/lww-performance-2026-10-13
This is an evidence importer, not a benchmark generator. Dates with unknown times
remain date-only. Later commits/tags are never attributed to these source patches.
"""
import argparse
import hashlib
import json
import re
import shutil
from pathlib import Path


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2, allow_nan=False) + '\n')


def import_study(source, site):
    meta = json.loads((source / 'metadata.json').read_text())
    results = json.loads((source / 'results.json').read_text())
    target = site / 'performance/evidence/local-2026-10-13'
    target.mkdir(parents=True, exist_ok=True)
    if digest(source / 'branch.diff') != meta['diff_sha256']:
        raise ValueError('Source patch hash does not match the study metadata')
    for name in ['metadata.json', 'results.json', 'branch.diff', 'main-lane-harness.patch', 'branch-lane-harness.patch']:
        shutil.copyfile(source / name, target / name)
    # Include the human report as plain text; it retains the original raw names.
    shutil.copyfile(source / 'report.md', target / 'report.txt')
    runs = []
    for revision in ['main', 'branch']:
        for variant in ['clone', 'borrowed', 'lanes', 'lanes-repeat']:
            run_id = f'local-20261013-{revision}-{variant}'
            is_lane = variant.startswith('lanes')
            harness_relative = 'tests/benches/lane_perf.rs' if is_lane else 'core/benches/event_dag_borrowed.rs' if variant == 'borrowed' else 'core/benches/event_dag.rs'
            harness = source / revision / harness_relative
            harness_name = f'{revision}-{variant}.rs'
            shutil.copyfile(harness, target / harness_name)
            asset_base = 'evidence/local-2026-10-13/'
            source_meta = {
                'sha': meta['main_sha'], 'repository': 'ankurah/ankurah',
                'label': 'Main before LWW change' if revision == 'main' else 'LWW candidate source patch',
                'ref': 'main' if revision == 'main' else meta['branch'],
                'committed_at': '2026-10-07T17:57:45-07:00',
            }
            if revision == 'branch':
                source_meta.update(patch_sha256=meta['diff_sha256'], patch_url=asset_base + 'branch.diff')
                del source_meta['committed_at']
            description = 'Sled + local transport' if is_lane else 'Borrowed fixture' if variant == 'borrowed' else 'Clone included'
            run = {
                'id': run_id, 'recorded_at': '2026-10-13', 'kind': 'local', 'status': 'ok', 'source': source_meta,
                'markers': [{'kind': 'main', 'label': 'main', 'url': f'https://github.com/ankurah/ankurah/commit/{meta["main_sha"]}'}] if revision == 'main' else [],
                'runner': {'id': 'local-daniel-m4max-20261013', 'label': 'Apple M4 Max', 'hardware': meta['hardware'], 'os': meta['os']},
                'harness': {'id': f'oct13-{variant.removesuffix("-repeat")}', 'sha256': digest(harness), 'description': description, 'source_url': asset_base + harness_name},
                'compiler': {'version': meta['rustc']},
                'profile': 'release', 'lockfile_sha256': digest(source / revision / 'Cargo.lock'),
                'raw_url': asset_base + run_id + '.json',
                'parameters': {'warmup_s': 1, 'measurement_s': 3, 'requested_samples': 40, 'criterion': '0.5.1'},
                'measurements': [],
            }
            raw = {'study': '2026-10-13 local exploratory study', 'source': source_meta, 'measurements': {}}
            for result in [r for r in results if r['source'] == revision and r['harness'] == variant]:
                original = result['case']
                raw_dir = source / 'raw' / f'{revision}-{variant}' / original
                evidence = {name: json.loads((raw_dir / (name + '.json')).read_text()) for name in ['benchmark', 'estimates', 'sample']}
                median = evidence['estimates']['median']
                if median['point_estimate'] != result['median_ns'] or median['confidence_interval'] != result['median_ci_ns']:
                    raise ValueError(f'Raw evidence differs from summary: {revision}/{variant}/{original}')
                raw['measurements'][original] = evidence
                workload = original
                if revision == 'branch' and original.startswith('layers/diamond_chain_drain/'):
                    workload = original.replace('diamond_chain_drain', 'diamond_chain_prepare')
                family = 'layers-prepare' if 'diamond_chain_prepare' in workload else 'layers-drain' if 'diamond_chain_drain' in workload else 'lanes' if is_lane else 'compare'
                series = f'local-20261013-{variant.removesuffix("-repeat")}-{family}-v1'
                case_parameters = {'fixture': original, 'samples': len(evidence['sample']['times'])}
                if original.startswith('compare/diamond_chain/'):
                    case_parameters.update(diamonds=int(original.rsplit('/', 1)[-1]), compared_tips='two concurrent tips of final diamond', divergence_edges_to_meet=1)
                measurement = {
                    'workload': workload, 'unit': 'ns', 'series': series,
                    'median': median['point_estimate'], 'lower': median['confidence_interval']['lower_bound'],
                    'upper': median['confidence_interval']['upper_bound'], 'confidence_level': median['confidence_interval']['confidence_level'],
                    'samples': len(evidence['sample']['times']), 'parameters': case_parameters,
                }
                if workload != original:
                    measurement['original_workload'] = original
                run['measurements'].append(measurement)
            if variant == 'borrowed':
                log = (source / (revision + '-borrowed.log')).read_text()
                counts = dict(re.findall(r'^READ_COUNT (\S+) (\d+)$', log, re.M))
                raw['read_count_log'] = [line for line in log.splitlines() if line.startswith('READ_COUNT ')]
                for case, count in counts.items():
                    workload = 'compare/' + case
                    parameters = next(m['parameters'] for m in run['measurements'] if m['workload'] == workload)
                    run['measurements'].append({'workload': workload, 'unit': 'reads', 'series': 'local-20261013-borrowed-read-count-v1', 'median': int(count), 'lower': None, 'upper': None, 'confidence_level': None, 'parameters': {**{key: value for key, value in parameters.items() if key != 'samples'}, 'executions': 1, 'outside_timed_loop': True}})
            if not run['measurements']:
                raise ValueError(f'No measurements for {run_id}')
            write_json(target / (run_id + '.json'), raw)
            runs.append(run)
    write_json(site / 'performance/history.json', {'schema_version': 1, 'runs': runs, 'attempts': []})
    print(f'Imported {len(runs)} actual runs, {sum(len(r["measurements"]) for r in runs)} measurements')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    args = parser.parse_args()
    import_study(args.source, Path(__file__).resolve().parents[1])
