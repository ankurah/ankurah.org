const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const model = require('../performance/model.js');
const seed = JSON.parse(fs.readFileSync(path.join(__dirname, '../performance/history.json')));
const copy = value => JSON.parse(JSON.stringify(value));

// Synthetic test-only records: never loaded by the published page.
function fixture(id = 'fixture-1') {
    const run = copy(seed.runs[0]);
    run.id = id;
    run.measurements = [run.measurements[0]];
    return { schema_version: 1, runs: [run], attempts: [] };
}

test('checked-in evidence has eight actual runs and exact raw medians/intervals', () => {
    model.validateHistory(seed);
    assert.equal(seed.runs.length, 8);
    for (const run of seed.runs) {
        const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '../performance', run.raw_url)));
        assert.match(run.harness.sha256, /^[a-f0-9]{64}$/);
        assert.ok(fs.existsSync(path.join(__dirname, '../performance', run.harness.source_url)));
        for (const m of run.measurements) {
            if (m.unit === 'reads') continue;
            const original = raw.measurements[m.original_workload || m.workload];
            assert.equal(m.median, original.estimates.median.point_estimate);
            assert.equal(m.lower, original.estimates.median.confidence_interval.lower_bound);
            assert.equal(m.upper, original.estimates.median.confidence_interval.upper_bound);
            assert.equal(m.samples, original.sample.times.length);
        }
    }
});

test('republication is idempotent; repeat attempts remain; markers are merged', () => {
    const first = fixture(), tagged = copy(first), repeat = fixture('fixture-repeat');
    tagged.runs[0].markers.push({ kind: 'release', label: 'TEST release', url: 'https://example.com/test' });
    const merged = model.mergeHistories([first, tagged, repeat]);
    assert.equal(merged.runs.length, 2);
    assert.equal(merged.runs[0].markers.length, 2);
    assert.equal(model.mergeHistories([merged, merged]).runs.length, 2);
});

test('different values cannot reuse an immutable run ID', () => {
    const a = fixture(), b = copy(a);
    b.runs[0].measurements[0].median += 1;
    assert.throws(() => model.mergeHistories([a, b]), /Conflicting/);
});

test('evidence class, runner, compiler and explicit semantics separate lines', () => {
    const a = fixture().runs[0];
    for (const change of [r => r.kind = 'hosted', r => r.runner.id = 'other', r => r.compiler.version = 'other', r => r.measurements[0].series = 'new-semantics']) {
        const b = copy(a); change(b);
        assert.notEqual(model.seriesKey(a, a.measurements[0]), model.seriesKey(b, b.measurements[0]));
    }
    const layer = seed.runs.flatMap(run => run.measurements.filter(m => m.workload.startsWith('layers/')).map(m => ({ run, m })));
    assert.ok(layer.some(p => p.m.workload.includes('drain')));
    assert.ok(layer.some(p => p.m.workload.includes('prepare') && p.m.original_workload.includes('drain')));
    assert.equal(new Set(layer.filter(p => p.m.workload.includes('prepare')).map(p => p.run.source.patch_sha256)).size, 1);
});

test('historical source date sorts backfills independently of measurement date', () => {
    const a = fixture('old').runs[0], b = fixture('new').runs[0];
    a.recorded_at = '2030-01-01'; a.source.committed_at = '2025-01-01';
    b.recorded_at = '2026-01-01'; b.source.committed_at = '2026-01-01'; b.source.sha = 'b'.repeat(40);
    const sorted = model.orderPoints([b, a].map(run => ({ run, measurement: run.measurements[0] })));
    assert.equal(sorted[0].run.id, 'old');
    assert.equal(model.sourceDate(a), '2025-01-01');
});

test('invalid intervals, nonfinite medians, duplicate workloads and schema drift fail closed', () => {
    for (const change of [h => h.schema_version = 2, h => h.runs[0].measurements[0].median = Infinity, h => h.runs[0].measurements[0].lower = -1, h => h.runs[0].measurements.push(h.runs[0].measurements[0])]) {
        const h = fixture(); change(h); assert.throws(() => model.validateHistory(h));
    }
});

test('units scale from nanoseconds; read counts never acquire time units', () => {
    assert.deepEqual(model.displayUnit('ns', 125000), { label: 'µs', divisor: 1000 });
    assert.deepEqual(model.displayUnit('ns', 12500000), { label: 'ms', divisor: 1000000 });
    assert.deepEqual(model.displayUnit('reads', 12500000), { label: 'event reads', divisor: 1 });
});

test('untrusted data cannot create script or cross-origin http links', () => {
    assert.equal(model.safeURL('javascript:alert(1)', 'https://ankurah.org/performance/'), null);
    assert.equal(model.safeURL('data:text/html,x', 'https://ankurah.org/performance/'), null);
    assert.equal(model.safeURL('http://evil.example/x', 'https://ankurah.org/performance/'), null);
    assert.equal(model.safeURL('history.json', 'https://ankurah.org/performance/'), 'https://ankurah.org/performance/history.json');
});

test('empty histories and explicit unmeasured coverage are accepted without fabricated points', () => {
    const h = { schema_version: 1, runs: [], attempts: [], coverage: [{source: {sha: 'a'.repeat(40)}, markers: [], status: 'unsupported', reason: 'Old API'}] };
    const merged = model.mergeHistories([h]);
    assert.equal(merged.runs.length, 0);
    assert.equal(merged.coverage[0].status, 'unsupported');
});


test('separate unmapped Cargo publications and evidence classes remain visible', () => {
    const entries = [
        { source: { sha: null, label: 'ankurah@0.1.0' }, kind: 'hosted', markers: [], status: 'unsupported' },
        { source: { sha: null, label: 'ankurah@0.2.0' }, kind: 'hosted', markers: [], status: 'unsupported' },
        { source: { sha: null, label: 'ankurah@0.1.0' }, kind: 'stable', markers: [], status: 'unsupported' },
    ];
    const h = { schema_version: 1, runs: [], coverage: entries };
    assert.equal(model.mergeHistories([h, h]).coverage.length, 3);
});

test('source dates are ordered by instant across timezone offsets', () => {
    const a = fixture('later').runs[0], b = fixture('earlier').runs[0];
    a.source.committed_at = '2026-10-07T23:00:00-07:00';
    b.source.committed_at = '2026-10-08T01:00:00+00:00'; b.source.sha = 'b'.repeat(40);
    const sorted = model.orderPoints([a, b].map(run => ({ run, measurement: run.measurements[0] })));
    assert.equal(sorted[0].run.id, 'earlier');
});

// Local backfill is a real snapshot; failed setup attempts never become points.
test('backfill snapshot retains local provenance and exact raw Criterion medians', () => {
    const history = JSON.parse(fs.readFileSync(path.join(__dirname, '../performance/backfill/history.json')));
    model.validateHistory(history);
    for (const run of history.runs) {
        assert.equal(run.kind, 'local');
        assert.ok(run.source.committed_at);
        assert.match(run.raw_url, /^backfill\/runs\/[A-Za-z0-9_-]+\/raw.json$/);
        const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '../performance', run.raw_url)));
        assert.ok(fs.existsSync(path.join(__dirname, '../performance', run.harness.source_url)));
        for (const m of run.measurements) {
            const original = raw[m.workload];
            assert.equal(m.median, original.estimates.median.point_estimate);
            assert.equal(m.lower, original.estimates.median.confidence_interval.lower_bound);
            assert.equal(m.upper, original.estimates.median.confidence_interval.upper_bound);
            assert.equal(m.samples, original.sample.times.length);
        }
    }
    for (const attempt of history.attempts || []) assert.ok(!attempt.measurements);
});

function catalog(workloads = [], status = 'registered') {
    return { schema_version: 1, runs: [], benchmarks: [{ id: 'future-package/new-target', package: 'future-package', target: 'new-target', status, workloads }] };
}

test('a newly registered Cargo target is navigable before enumeration or samples', () => {
    const history = model.mergeHistories([catalog()]);
    const rows = model.benchmarkRows(history);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, 'target:future-package/new-target');
    assert.equal(rows[0].targetOnly, true);
    assert.equal(history.runs.length, 0);
});

test('unknown catalog workloads appear without samples and their first sample fills the same row', () => {
    const workload = 'future-package/new-target/a-new-operation/2048';
    const registered = catalog([{ id: workload, unit: 'ns' }], 'discovered');
    const before = model.mergeHistories([registered]);
    assert.equal(model.benchmarkRows(before)[0].id, workload);
    assert.equal(model.points(before, { kind: 'local', workload, unit: 'ns' }).length, 0);
    const measured = fixture(); measured.runs[0].measurements[0].workload = workload;
    const after = model.mergeHistories([before, measured]);
    assert.equal(model.benchmarkRows(after).length, 1);
    assert.equal(model.points(after, { kind: 'local', workload, unit: 'ns' }).length, 1);
});

test('failed targets stay visible and an empty or renamed catalog never hides measured history', () => {
    const failed = catalog([], 'unsupported'); failed.benchmarks[0].reason = 'Requires a service';
    const history = model.mergeHistories([fixture(), failed, { schema_version: 1, runs: [], benchmarks: [] }]);
    assert.equal(model.benchmarkRows(history).length, 2);
    assert.equal(model.benchmarkRows(history).find(row => row.targetOnly).target.reason, 'Requires a service');
    assert.ok(model.benchmarkRows(history).some(row => row.id === fixture().runs[0].measurements[0].workload));
});

test('same named Criterion workloads in different package/target namespaces remain independent', () => {
    const a = catalog([{ id: 'future-package/new-target/repeated-name', unit: 'ns' }], 'discovered');
    const b = catalog([{ id: 'other-package/other-target/repeated-name', unit: 'ns' }], 'discovered');
    Object.assign(b.benchmarks[0], { id: 'other-package/other-target', package: 'other-package', target: 'other-target' });
    assert.equal(model.benchmarkRows(model.mergeHistories([a, b])).length, 2);
});

test('duplicate IDs cannot silently replace provenance, while object key ordering is immaterial', () => {
    const original = fixture(), changed = copy(original);
    changed.runs[0].runner.id = 'different-machine';
    assert.throws(() => model.mergeHistories([original, changed]), /Conflicting/);
    const reordered = copy(original);
    reordered.runs[0] = Object.fromEntries(Object.entries(reordered.runs[0]).reverse());
    assert.equal(model.mergeHistories([original, reordered]).runs.length, 1);
    const invalidDate = copy(original); invalidDate.runs[0].source.committed_at = 'unknown';
    assert.throws(() => model.validateHistory(invalidDate), /source date/);
});
