October 13, 2026 local exploratory study
======================================

These files contain actual measurements imported from an independent local run,
not generated chart fixtures. Eight runs cover two source states with clone-included
and borrowed-fixture DAG timing, plus two alternating end-to-end lane runs per
source. Exact event-read counts were recorded outside the timed loop.

Main source SHA: ebdb1727254c675a4d37236ecf23c16c06c4df12
Candidate: that SHA plus branch.diff
Candidate patch SHA-256: 387ca056a7bf54ddb16f48bea8529e37cf2171ec879daaaf11a7fd7670b937ab

The candidate was uncommitted when measured. It must not be retroactively labeled
as a later commit, PR merge, or release measurement. The main source commit date
is 2026-10-07T17:57:45-07:00; the measurement date is 2026-10-13. An exact run time
was not recorded here. The chart uses the known study date for the source patch.

Machine: Apple M4 Max, 128 GiB, macOS 26.7.1 (25G241).
Compiler: rustc 1.97.0-nightly (ca9a134e0 2026-04-26).
The compiler target triple was not recorded in the retained study metadata.
Criterion 0.5.1; release profile; one second warm-up, three second requested
measurement, 40 requested samples. Lanes override subscriber latency to 30 and
bridge catch-up to 10. Raw samples give the actual count.

Files named local-20261013-*.json contain exact Criterion benchmark, estimates,
and sample JSON for the plotted workloads. The borrowed files also retain the
actual READ_COUNT log lines. *.rs files are the exact harness source; file hashes
appear in history.json. The fallible read/body API and context_async readiness
fixes used for lane measurement are preserved in *-lane-harness.patch.

The importer checks each timing against raw estimates before writing the chart
history. results.json is the original summary, report.txt the original narrative,
and metadata.json the original environment record. No later benchmark was run to
create this website.

Comparability decisions
-----------------------
- Clone-included and borrowed-fixture timings are separate series.
- Comparison-only workloads retain equivalent fixture and timing boundaries
  across the main and candidate harness API adaptation. Their exact differing
  harness source hashes remain visible; their explicit study series is shared.
- Layer construction differs: main drains the old layer iterator; candidate
  prepares and validates the entire batch. The original candidate raw name was
  layers/diamond_chain_drain/N; the chart labels it diamond_chain_prepare/N and
  preserves original_workload. These are separate workloads and never one line.
- Repeated lane runs remain separate; they are not averaged or treated as new
  source revisions. Samples within one run are not independent repeated runs.
- Event reads count getter calls, not Criterion's fixture-elements throughput.
- Main and patch values can be compared within this exploratory working-machine
  study. No point joins future hosted or stable-runner measurements.

Limitations
-----------
Working-machine contention and small differences need further alternating runs.
The DAG map has no property operations and does not measure storage latency or
full LWW folding. End-to-end lanes use Sled and local process transport, not a
public network. The study did not measure every historical release, multiple
unresolved meets, saturated generations, or the broader lineage/bridge workload.
The discarded shared-build-cache attempt was excluded from all files here.

This evidence is retained in the site repository so it survives CI artifact
expiry. Future CI evidence is retained separately in ankurah's benchmark-data Git
branch; each published run links its immutable raw record and workflow execution.
