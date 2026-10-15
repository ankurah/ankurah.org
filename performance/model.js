/* Shared by the browser and the dependency-free chart tests. */
(function (root) {
    'use strict';
    const kinds = ['local', 'hosted', 'stable'];
    const finite = value => typeof value === 'number' && Number.isFinite(value);
    const required = (condition, message) => { if (!condition) throw new Error(message); };
    const text = value => typeof value === 'string' && value.length > 0;

    function validateHistory(history) {
        required(history && history.schema_version === 1 && Array.isArray(history.runs), 'Unsupported history format');
        required(history.runs.length <= 20000, 'History is too large');
        const ids = new Set();
        for (const run of history.runs) {
            required(text(run.id) && !ids.has(run.id), 'Duplicate or missing run ID');
            ids.add(run.id);
            required(kinds.includes(run.kind), 'Unknown evidence class');
            required(run.source && /^[a-f0-9]{40}$/.test(run.source.sha), 'Invalid source revision');
            required(run.source.committed_at === undefined || (text(run.source.committed_at) && Number.isFinite(Date.parse(run.source.committed_at))), 'Invalid source date');
            required(!run.source.patch_sha256 || /^[a-f0-9]{64}$/.test(run.source.patch_sha256), 'Invalid patch identity');
            required(text(run.recorded_at) && Number.isFinite(Date.parse(run.recorded_at)), 'Invalid measurement date');
            required(run.runner && text(run.runner.id) && text(run.runner.label), 'Missing runner identity');
            required(run.harness && text(run.harness.id) && text(run.harness.sha256), 'Missing harness identity');
            required(run.compiler && text(run.compiler.version) && text(run.profile), 'Missing compiler/profile');
            required(Array.isArray(run.markers) && run.markers.every(m => ['main', 'release', 'pr'].includes(m.kind) && text(m.label)), 'Invalid markers');
            required(Array.isArray(run.measurements) && run.measurements.length > 0, 'Empty measurement run');
            const workloads = new Set();
            for (const m of run.measurements) {
                required(text(m.workload) && text(m.series) && ['ns', 'reads'].includes(m.unit), 'Invalid workload');
                const key = [m.workload, m.unit, m.series].join('|');
                required(!workloads.has(key), 'Duplicate workload in a run');
                workloads.add(key);
                required(finite(m.median) && m.median >= 0, 'Invalid median');
                if (m.unit === 'ns') {
                    required(finite(m.lower) && finite(m.upper) && m.lower >= 0 && m.lower <= m.median && m.median <= m.upper, 'Invalid confidence interval');
                    required(finite(m.confidence_level) && m.confidence_level > 0 && m.confidence_level < 1, 'Invalid confidence level');
                } else {
                    required(Number.isInteger(m.median) && m.lower == null && m.upper == null, 'Read counts must be exact');
                }
            }
        }
        required(history.attempts === undefined || Array.isArray(history.attempts), 'Invalid attempts');
        for (const attempt of history.attempts || []) {
            required(text(attempt.id) && kinds.includes(attempt.kind) && ['unsupported', 'failed'].includes(attempt.status) && text(attempt.reason), 'Invalid unmeasured attempt');
        }
        required(history.coverage === undefined || Array.isArray(history.coverage), 'Invalid coverage');
        for (const entry of history.coverage || []) {
            required(entry.source && (entry.source.sha === null ? text(entry.source.label) : /^[a-f0-9]{40}$/.test(entry.source.sha)) && ['pending', 'requested', 'measured', 'unsupported', 'failed'].includes(entry.status), 'Invalid coverage entry');
            required(Array.isArray(entry.markers), 'Missing coverage markers');
        }
        required(history.benchmarks === undefined || Array.isArray(history.benchmarks), 'Invalid benchmark catalog');
        for (const target of history.benchmarks || []) {
            required(text(target.id) && text(target.package) && text(target.target), 'Invalid benchmark target');
            required(['registered', 'discovered', 'unsupported', 'failed'].includes(target.status), 'Invalid benchmark status');
            required(Array.isArray(target.workloads) && target.workloads.every(workload => text(workload.id) && ['ns', 'reads'].includes(workload.unit)), 'Invalid catalog workloads');
        }
        return history;
    }

    function canonicalJSON(value) {
        return JSON.stringify(value, (_, value) => value && typeof value === 'object' && !Array.isArray(value)
            ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value);
    }

    function runIdentity(run) {
        const { markers, ...immutable } = run;
        return canonicalJSON(immutable);
    }

    function mergeHistories(histories) {
        const runs = new Map(), attempts = new Map(), coverage = new Map(), benchmarks = new Map();
        for (const history of histories) {
            validateHistory(history);
            for (const run of history.runs) {
                const existing = runs.get(run.id);
                if (existing) {
                    required(runIdentity(existing) === runIdentity(run), 'Conflicting run identity');
                    const markers = new Map([...existing.markers, ...run.markers].map(m => [m.kind + ':' + m.label, m]));
                    runs.set(run.id, { ...existing, markers: [...markers.values()] });
                } else runs.set(run.id, run);
            }
            for (const target of history.benchmarks || []) benchmarks.set(target.id, target);
            for (const attempt of history.attempts || []) attempts.set(attempt.id, attempt);
            for (const entry of history.coverage || []) coverage.set([entry.kind, entry.source.sha || entry.source.label].join(':'), entry);
        }
        return { schema_version: 1, runs: [...runs.values()], attempts: [...attempts.values()], coverage: [...coverage.values()], benchmarks: [...benchmarks.values()] };
    }

    function benchmarkRows(history) {
        const rows = new Map();
        // Observed samples keep removed/renamed workloads reachable even if the
        // current catalog is empty or no longer registers their old target.
        for (const run of history.runs) for (const measurement of run.measurements) {
            const row = rows.get(measurement.workload) || { id: measurement.workload, units: [] };
            if (!row.units.includes(measurement.unit)) row.units.push(measurement.unit);
            rows.set(row.id, row);
        }
        for (const target of history.benchmarks || []) {
            if (!target.workloads.length) rows.set('target:' + target.id, {
                id: 'target:' + target.id, target, targetOnly: true, units: []
            });
            for (const workload of target.workloads) {
                const existing = rows.get(workload.id);
                rows.set(workload.id, {
                    ...existing, id: workload.id, target, description: workload.description,
                    units: [...new Set([...(existing?.units || []), workload.unit])]
                });
            }
        }
        return [...rows.values()].sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
    }

    function workloadName(row) {
        return row.id.replace(/^(ankurah-core\/event_dag|ankurah-tests\/lane_perf)\//, '');
    }
    function suggestedFamilies(rows) {
        // This is navigation only. The discovered catalog and measured history remain complete.
        return [
            ['single_writer_commit', 'Local commit', 'durable_lww_overwrite'],
            ['commit_to_subscriber_latency', 'Subscriber update', 'server_edit_to_client_change'],
            ['fresh_fetch_snapshot', 'First fetch', '100'],
            ['bridge_catchup', 'Reconnect and catch-up', '1000'],
            ['subscription_establishment', 'Subscription initialization', '100'],
            ['compare/diamond_chain', 'Shared-history comparison', '64'],
            ['compare/linear_deep', 'Deep-history comparison', '1000'],
            ['compare/wide_antichain', 'Wide-frontier comparison', '64'],
        ].map(([id, label, size]) => {
            const variants = rows.filter(row => !row.targetOnly && workloadName(row).startsWith(id + '/'))
                .sort((a, b) => workloadName(a).localeCompare(workloadName(b), 'en', { numeric: true }));
            const preferred = variants.find(row => workloadName(row) === id + '/' + size)?.id;
            return { id, label, variants, preferred };
        }).filter(family => family.variants.length);
    }

    function sourceDate(run) { return run.source.patch_sha256 ? run.recorded_at : run.source.committed_at; }
    function sourceKey(run) { return run.source.sha + ':' + (run.source.patch_sha256 || ''); }
    function environmentKey(run) {
        return canonicalJSON([run.runner.id, run.runner.hardware, run.runner.os, run.compiler.target]);
    }
    function environmentLabel(run) {
        return [run.runner.hardware || run.runner.label, run.runner.os || 'OS not recorded', run.compiler.target].filter(Boolean).join(' · ');
    }
    function seriesKey(run, measurement) {
        // Keep changed environments/settings separate even if a producer reuses a series label.
        return canonicalJSON([measurement.series, environmentKey(run), run.compiler.version, run.profile, run.parameters, measurement.parameters]);
    }
    function points(history, selection) {
        return history.runs.filter(run => !selection.environment || environmentKey(run) === selection.environment).flatMap(run => run.measurements
            .filter(m => m.workload === selection.workload && m.unit === selection.unit)
            .map(measurement => ({ run, measurement, series: seriesKey(run, measurement) })))
            .filter(point => !selection.series || point.series === selection.series);
    }
    function groupSeries(points) {
        const groups = new Map();
        for (const point of points) {
            if (!groups.has(point.series)) groups.set(point.series, []);
            groups.get(point.series).push(point);
        }
        return groups;
    }
    function orderPoints(input) {
        const revisions = new Map();
        for (const point of input) {
            const key = sourceKey(point.run);
            const date = sourceDate(point.run);
            if (!revisions.has(key)) revisions.set(key, { key, date });
        }
        const ordered = [...revisions.values()].sort((a, b) => (a.date ? Date.parse(a.date) : Infinity) - (b.date ? Date.parse(b.date) : Infinity) || a.key.localeCompare(b.key));
        const position = new Map(ordered.map((revision, i) => [revision.key, i]));
        return input.slice().sort((a, b) => position.get(sourceKey(a.run)) - position.get(sourceKey(b.run)) || Date.parse(a.run.recorded_at) - Date.parse(b.run.recorded_at) || a.run.id.localeCompare(b.run.id));
    }
    function displayUnit(unit, maximum) {
        if (unit === 'reads') return { label: 'event reads', divisor: 1 };
        if (maximum >= 1e6) return { label: 'ms', divisor: 1e6 };
        if (maximum >= 1e3) return { label: 'µs', divisor: 1e3 };
        return { label: 'ns', divisor: 1 };
    }
    function safeURL(value, base) {
        if (!text(value)) return null;
        try {
            const url = new URL(value, base);
            const origin = new URL(base).origin;
            if (url.protocol === 'https:' || (url.origin === origin && ['http:', 'file:'].includes(url.protocol))) return url.href;
        } catch (_) { /* Invalid links are displayed as text. */ }
        return null;
    }
    const api = { validateHistory, mergeHistories, benchmarkRows, workloadName, suggestedFamilies, sourceDate, sourceKey, environmentKey, environmentLabel, seriesKey, points, groupSeries, orderPoints, displayUnit, safeURL };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.PerformanceModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
