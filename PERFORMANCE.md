# Benchmark page maintenance

`performance/index.html` is a standalone page with its own benchmark sidebar,
header navigation, and dependency-free SVG line charts. `performance/model.js` owns validation, evidence/series isolation, chronological
source ordering, deduplication, and units; `performance/dashboard.js` renders controls,
confidence intervals, keyboard-operable points, metadata, and a complete table.
The CSS follows the existing site colors and contains horizontal chart/table
scrolling on narrow screens, with a workload selector replacing the desktop sidebar. No chart library, application server, or cross-repo credential
is needed.

The page loads its checked-in local study immediately and then requests
`https://raw.githubusercontent.com/ankurah/ankurah/benchmark-data/history.json`.
New catalog entries and measurements on that versioned Git branch are visible without a site rebuild
(after normal GitHub raw-file cache delay). If the remote history is missing or
unavailable, the page says coverage is unknown and retains the local evidence.
An incompatible schema fails visibly rather than treating bad data as a point.

## Data contract

The producer is `tools/benchmarks/` in the ankurah repository. Both repositories
use schema version 1: `runs`, optional failed `attempts`, optional `coverage`, and optional `benchmarks`. The benchmark catalog identifies Cargo targets and their discovered Criterion workloads; registered targets without workload names and discovered workloads without samples are navigable immediately. New workload IDs need no UI edit. The navigation is the union of catalog entries and measured workload IDs, so removed/renamed benchmarks keep their historical samples.
A run contains source identity/date, measurement date, evidence class, explicit
series identity, source/release/PR markers, runner/compiler/profile/harness and
lockfile provenance, settings, immutable raw URLs, and workload measurements.
Only `ns` medians with confidence intervals and exact `reads` counts are rendered.
A source patch has a separate SHA-256 and never inherits a later commit/PR label.

The chart groups by the producer's explicit compatibility series and additionally
separates evidence class, compiler, profile, and machine ID. The producer must
change the series identity when fixture meaning, timing boundaries, build
profile, compiler or runner conditions become incompatible. Source lockfile
changes remain provenance: changing a source dependency is part of the source
revision being measured. Published repeats retain their run IDs. Republication of
the same ID is idempotent; conflicting measured values under one ID fail closed.

The x-axis spaces revisions evenly in source-date order (study date for uncommitted
patches), rather than scaling distance by elapsed time. Longer histories scroll
horizontally to keep neighboring revisions distinct. Measurement time stays
separate in the table. At a repeated revision, the line follows its
first recorded run and all repeats remain individual points. Lines are guides,
not interpolated observations. Discovered release/PR coverage records include
pending, requested, failed and unsupported states, including unmappable Cargo
publications. An absent historical date cannot quietly be replaced with the
measurement date on the chart.

## Local evidence

The original checked-in comparison comes from the October 13, 2026 local study.
Its eight runs contain 72 timings and 22 exact event-read counts in
`performance/history.json`. The raw medians, intervals, samples, exact harness
source, source patch, method and original report are retained under
`performance/evidence/local-2026-10-13/`.

To reproduce the import from that original evidence directory:

```sh
python3 scripts/import-local-benchmarks.py /path/to/lww-performance-2026-10-13
```

This importer verifies every timing against the actual Criterion estimates. It
preserves the historically named candidate layer raw ID in `original_workload`
while labeling its different semantics `diamond_chain_prepare`. Main's drain
workload remains separate. No later CI measurement or old July baseline is
fabricated from this evidence.

## Local historical backfill

`performance/backfill/history.json` is a separate snapshot of actual local
historical runs and their coverage/diagnostics. It uses the same schema and is
merged by the page without changing the comparison study. Each point retains its
original source date, exact measured time, local machine class and instrument
adapter provenance. A failed compile or missing source never creates a point.

Refresh the snapshot from the canonical local runner output:

```sh
python3 scripts/import-local-backfill.py /path/to/local-backfill
```

An audited index projection can be supplied with `--history /path/to/snapshot-history.json`.
It may add verified source-tree equivalence or compatibility annotations while
retaining the measured SHA and exact raw evidence. The current reviewed PR-head
point explicitly identifies its byte-identical later merge; it is not relabeled
as a run of the merge commit.

The importer preserves raw/adapter files byte-for-byte and rejects changes under
an existing immutable record ID. Bulk compiler logs remain in the canonical local
output. Historical timing population is resumable; the snapshot's coverage status
is the evidence of progress, not a promise that every revision already has data.
The future automated data branch remains the canonical CI store.

## Validation and preview

```sh
node --test tests/performance.test.cjs
python3 scripts/check-links.py
mdbook build
cp -R performance images book/
cp index.html styles.css book/
python3 -m http.server 8765 --bind 127.0.0.1 --directory book
```

Open `http://127.0.0.1:8765/performance/`. Tests use synthetic records only
inside the test process; the page never fetches test fixture data. The existing
site deployment workflow runs the chart tests and copies the standalone assets after the documentation build. The dashboard is
not embedded in mdBook; the landing page links to `/performance/`.

## Activation

Review and land the site change through the existing Pages deployment. Separately
review and activate the producer workflow in ankurah; see its
`tools/benchmarks/README.md` for the exact GitHub permissions, durable data branch,
runner isolation, environment variables, and bounded historical dispatcher.
No site publishing token or webhook is required for incoming data. Until the
producer publishes, the CI history link can legitimately return 404 and the page
reports it. Hosted output must not be renamed to stable output to fill that gap.

Existing broader benchmark work (additional lineage/bridge workloads, unresolved
meets, saturation, and expanded end-to-end attribution) remains separate.
