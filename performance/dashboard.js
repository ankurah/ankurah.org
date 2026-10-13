(function () {
    'use strict';
    const root = document.getElementById('performance-dashboard');
    if (!root) return;
    const model = window.PerformanceModel;
    const get = id => document.getElementById(id);
    const controls = { kind: get('perf-kind'), workload: get('perf-workload'), unit: get('perf-unit'), series: get('perf-series') };
    const explanations = {
        local: 'Local working-machine measurements. Each line uses one workload definition and measurement configuration.',
        hosted: 'Hosted CI · shared machines. Use these measurements to inspect execution; runner jitter limits performance claims.',
        stable: 'Stable runner · only points collected under an explicitly configured, consistent environment appear here.'
    };
    let history;
    const number = value => new Intl.NumberFormat('en', { maximumSignificantDigits: 5 }).format(value);
    const element = (tag, text, parent) => {
        const node = document.createElement(tag);
        if (text !== undefined) node.textContent = text;
        if (parent) parent.append(node);
        return node;
    };
    function link(parent, label, url) {
        const href = model.safeURL(url, document.baseURI);
        const node = element(href ? 'a' : 'span', label, parent);
        if (href) node.href = href;
        return node;
    }
    function optionList(select, values, preferred) {
        const old = select.value;
        select.replaceChildren();
        for (const [value, label] of values) {
            const option = element('option', label, select);
            option.value = value;
        }
        const allowed = values.map(item => item[0]);
        select.value = allowed.includes(old) ? old : allowed.includes(preferred) ? preferred : (allowed[0] || '');
    }
    function sourceLabel(run, short = false) {
        if (run.source.patch_sha256) return short ? 'patch ' + run.source.patch_sha256.slice(0, 7) : (run.source.label || 'Source patch');
        return short ? run.source.sha.slice(0, 8) : (run.source.label || run.source.sha.slice(0, 8));
    }
    function visibleMarkers(markers) {
        const rank = marker => /^ankurah@\d/.test(marker.label) ? 0 : /^ankurah-v?\d/.test(marker.label) ? 1 : marker.kind === 'pr' ? 2 : marker.kind === 'main' ? 3 : 4;
        return markers.slice().sort((a, b) => rank(a) - rank(b)).slice(0, 3);
    }
    function selection() { return Object.fromEntries(Object.entries(controls).map(([name, control]) => [name, control.value])); }
    function update(changed = 'kind') {
        get('perf-context').textContent = explanations[controls.kind.value];
        if (changed === 'kind') optionList(controls.workload, workloadRows().map(row => [row.id, row.targetOnly ? row.target.id + ' · awaiting workloads' : row.id]), 'compare/diamond_chain/64');
        const row = workloadRows().find(row => row.id === controls.workload.value);
        if (changed === 'kind' || changed === 'workload') optionList(controls.unit, (row?.units || []).map(value => [value, value === 'ns' ? 'Time' : 'Event reads']), 'ns');
        const candidates = model.points(history, selection());
        const series = new Map();
        for (const point of candidates) {
            const run = point.run;
            if (!series.has(point.series)) series.set(point.series, [point.series, `${run.harness.description || run.harness.id} · ${run.runner.label} · ${run.compiler.version} · ${point.measurement.series}`]);
        }
        const historicalSeries = candidates.find(point => point.run.markers.some(marker => ['release', 'pr'].includes(marker.kind)))?.series;
        if (changed !== 'series') optionList(controls.series, [...series.values()], historicalSeries || [...series.keys()].find(key => key.includes('borrowed')));
        const selected = model.orderPoints(candidates.filter(point => point.series === controls.series.value && model.sourceDate(point.run)));
        get('perf-results').hidden = !selected.length;
        get('perf-empty').hidden = !!selected.length;
        get('perf-empty').textContent = row?.targetOnly
            ? `${row.target.id} is a registered Cargo benchmark target (${row.target.status}). ${row.target.reason || 'Workload names will appear after the instrument compiles and enumerates them.'} No values have been inferred.`
            : `No ${controls.kind.value} measurements are available for this workload.${row?.target ? ' It is registered in the benchmark catalog; its history begins with its first actual measurement.' : ' Unmeasured history is unknown.'} Select another evidence class to inspect any available results.`;
        for (const control of [controls.workload, controls.unit, controls.series]) control.disabled = !control.options.length;
        const attempts = history.attempts.filter(attempt => attempt.kind === controls.kind.value);
        get('perf-attempts').hidden = !attempts.length;
        const list = get('perf-attempts').querySelector('ul');
        list.replaceChildren();
        for (const attempt of attempts) {
            const item = element('li', `${attempt.source?.sha?.slice(0, 8) || attempt.id}: ${attempt.status} — ${attempt.reason} `, list);
            if (attempt.run_url) link(item, 'Run log', attempt.run_url);
            if (attempt.raw_url) { item.append(' '); link(item, 'Diagnostic evidence', attempt.raw_url); }
        }
        for (const button of get('perf-workload-nav').querySelectorAll('button')) button.setAttribute('aria-current', button.dataset.workload === controls.workload.value ? 'true' : 'false');
        renderCoverage();
        if (selected.length) draw(selected);
    }
    function workloadRows() { return model.benchmarkRows(history); }
    function workloadLabel(row) {
        if (row.targetOnly) return row.target.target + ' · ' + row.target.status;
        const workload = row.id;
        const [group, name, size] = workload.split('/');
        if (group === 'compare') return ({ diamond_chain: 'Shared history', linear_deep: 'Linear history', wide_antichain: 'Wide frontier', disjoint: 'Disjoint histories' }[name] || name) + ' · ' + size;
        if (group === 'layers') return (name === 'diamond_chain_prepare' ? 'Prepare batch' : 'Drain layers') + ' · ' + size;
        if (group === 'bridge_catchup') return 'Bridge catch-up · ' + name;
        if (group === 'single_writer_commit') return 'Durable LWW overwrite';
        if (group === 'commit_to_subscriber_latency') return 'Subscriber notification';
        const prefix = row.target ? row.target.id + '/' : '';
        const nameWithoutTarget = prefix && workload.startsWith(prefix) ? workload.slice(prefix.length) : workload;
        return row.description || nameWithoutTarget.replaceAll('_', ' ').replaceAll('/', ' · ');
    }
    function workloadGroup(row) {
        if (row.targetOnly) return 'Registered targets';
        if (row.id.startsWith('compare/')) return 'Causal comparison';
        if (row.id.startsWith('layers/')) return 'Layer work';
        if (/^(bridge_catchup|single_writer_commit|commit_to_subscriber_latency)\//.test(row.id)) return 'End-to-end lanes';
        return row.target?.package || row.id.split('/')[0].replaceAll('_', ' ');
    }
    function renderNavigation() {
        const nav = get('perf-workload-nav');
        nav.replaceChildren();
        const groups = new Map();
        const rows = workloadRows();
        const targets = rows.filter(row => row.targetOnly).length;
        get('perf-workload-count').textContent = `${rows.length - targets} workload${rows.length - targets === 1 ? '' : 's'}` + (targets ? ` · ${targets} target${targets === 1 ? '' : 's'}` : '');
        for (const row of rows) {
            const label = workloadGroup(row);
            if (!groups.has(label)) groups.set(label, []);
            groups.get(label).push(row);
        }
        const preferred = ['Causal comparison', 'Layer work', 'End-to-end lanes'];
        const rank = label => preferred.includes(label) ? preferred.indexOf(label) : preferred.length;
        for (const [label, workloads] of [...groups].sort((a, b) => rank(a[0]) - rank(b[0]))) {
            const section = element('section', undefined, nav);
            section.className = 'benchmark-group';
            element('h3', label, section);
            for (const row of workloads) {
                const button = element('button', workloadLabel(row), section);
                button.type = 'button';
                button.dataset.workload = row.id;
                button.title = row.id;
                button.addEventListener('click', () => {
                    controls.workload.value = row.id;
                    controls.workload.dispatchEvent(new Event('change', { bubbles: true }));
                });
            }
        }
    }
    function renderCoverage() {
        const entries = (history.coverage || []).filter(entry => !entry.kind || entry.kind === controls.kind.value);
        get('perf-coverage').hidden = !entries.length;
        const counts = new Map();
        for (const entry of entries) counts.set(entry.status, (counts.get(entry.status) || 0) + 1);
        get('perf-coverage-summary').textContent = `${entries.length} discovered source revisions · ${[...counts].map(([status, count]) => `${count} ${status}`).join(' · ')}. Coverage is for the selected evidence class; select a matching series above to see its actual points.`;
        const list = get('perf-coverage').querySelector('ul');
        list.replaceChildren();
        for (const entry of entries) {
            const item = element('li', `${entry.source.sha ? entry.source.sha.slice(0, 8) : entry.source.label} · ${entry.status}${entry.reason ? ' — ' + entry.reason : ''} · `, list);
            entry.markers.forEach((marker, i) => { if (i) item.append(' · '); link(item, marker.label, marker.url); });
        }
    }
    function svgElement(tag, attrs, parent, text) {
        const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
        for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
        if (text !== undefined) node.textContent = text;
        parent.append(node);
        return node;
    }
    function draw(points) {
        const maximum = Math.max(...points.map(p => p.measurement.upper ?? p.measurement.median));
        const unit = model.displayUnit(controls.unit.value, maximum);
        const roughStep = maximum > 0 ? maximum * 1.1 / 4 : 0.25;
        const magnitude = 10 ** Math.floor(Math.log10(roughStep));
        const step = [1, 2, 5, 10].find(value => value * magnitude >= roughStep) * magnitude;
        const ticks = Math.ceil((maximum || 1) / step);
        const maxY = ticks * step;
        const revisions = [...new Set(points.map(p => model.sourceKey(p.run)))];
        // Leave room for each revision and its repeats, even when commits share a timestamp.
        const chartWidth = Math.max(780, 170 + (revisions.length - 1) * 56);
        const positions = new Map(revisions.map((key, i) => [key, revisions.length === 1 ? (chartWidth + 10) / 2 : 90 + i * (chartWidth - 170) / (revisions.length - 1)]));
        const repeats = new Map();
        for (const point of points) {
            const key = model.sourceKey(point.run);
            if (!repeats.has(key)) repeats.set(key, []);
            repeats.get(key).push(point);
        }
        const x = point => {
            const group = repeats.get(model.sourceKey(point.run));
            return positions.get(model.sourceKey(point.run)) + (group.indexOf(point) - (group.length - 1) / 2) * Math.min(10, 40 / group.length);
        };
        const y = value => 285 - value / maxY * 235;
        get('perf-chart-title').textContent = controls.workload.value;
        get('perf-count').textContent = `${points.length} run${points.length === 1 ? '' : 's'} · ${revisions.length} source revision${revisions.length === 1 ? '' : 's'}`;
        get('perf-series-notes').textContent = `${points[0].run.harness.description || points[0].run.harness.id} · ${unit.label} · lower is less work`;
        const exact = controls.unit.value === 'reads';
        get('perf-chart-note').textContent = (exact ? 'Exact getter calls in one untimed fixture execution. No confidence interval.' : 'Bars show each run’s confidence interval for the median. Repeats are offset slightly; the line follows the first recorded run at each revision.') + ' Revisions are evenly spaced in source-date order; horizontal distance does not represent elapsed time.';
        const svg = get('perf-chart');
        svg.setAttribute('viewBox', `0 0 ${chartWidth} 350`);
        svg.style.setProperty('--chart-width', `${chartWidth}px`);
        svg.replaceChildren();
        svgElement('title', { id: 'perf-svg-title' }, svg, controls.workload.value);
        svgElement('desc', { id: 'perf-svg-description' }, svg, `${points.length} measurements in ${unit.label}. Exact values and evidence are in the table below. ${get('perf-chart-note').textContent}`);
        svgElement('text', { x: 18, y: 24 }, svg, unit.label);
        for (let i = 0; i <= ticks; i++) {
            const value = step * i;
            svgElement('line', { x1: 76, x2: chartWidth - 52, y1: y(value), y2: y(value), class: 'perf-grid' }, svg);
            svgElement('text', { x: 66, y: y(value) + 4, 'text-anchor': 'end' }, svg, number(value / unit.divisor));
        }
        const firstRuns = revisions.map(key => repeats.get(key)[0]);
        if (revisions.length > 1) svgElement('polyline', { points: firstRuns.map(p => `${x(p)},${y(p.measurement.median)}`).join(' '), class: 'perf-line' }, svg);
        let lastLabelX = -Infinity;
        const finalLabelX = positions.get(revisions[revisions.length - 1]);
        for (let i = 0; i < revisions.length; i++) {
            const labelX = positions.get(revisions[i]);
            // Several merges may share a day. Keep every point, but leave room
            // between date labels and reserve the last revision's label.
            if (i !== revisions.length - 1 && (labelX - lastLabelX < 160 || (i > 0 && finalLabelX - labelX < 160))) continue;
            lastLabelX = labelX;
            const point = repeats.get(revisions[i])[0];
            svgElement('text', { x: positions.get(revisions[i]), y: 312, 'text-anchor': 'middle' }, svg, model.sourceDate(point.run).slice(0, 10));
            const markers = [...new Map(repeats.get(revisions[i]).flatMap(p => p.run.markers).map(marker => [marker.kind + ':' + marker.label, marker])).values()];
            const label = markers.length ? visibleMarkers(markers)[0].label + (markers.length > 1 ? ` +${markers.length - 1}` : '') : sourceLabel(point.run, true);
            const anchor = i === revisions.length - 1 && revisions.length > 1 ? 'end' : 'middle';
            svgElement('text', { x: positions.get(revisions[i]), y: 332, 'text-anchor': anchor }, svg, label.length > 28 ? label.slice(0, 27) + '…' : label);
        }
        for (const point of points) {
            const m = point.measurement, cx = x(point), cy = y(m.median);
            if (!exact) {
                svgElement('line', { x1: cx, x2: cx, y1: y(m.lower), y2: y(m.upper), class: 'perf-interval' }, svg);
                for (const value of [m.lower, m.upper]) svgElement('line', { x1: cx - 5, x2: cx + 5, y1: y(value), y2: y(value), class: 'perf-interval' }, svg);
            }
            const kind = point.run.markers.some(m => m.kind === 'release') ? 'release' : point.run.markers.some(m => m.kind === 'pr') ? 'pr' : point.run.markers.some(m => m.kind === 'main') ? 'main' : 'patch';
            const attrs = { class: `perf-point perf-point-${kind}`, tabindex: '0', role: 'button', 'aria-label': `${sourceLabel(point.run)}, ${number(m.median / unit.divisor)} ${unit.label}. Show measurement details.` };
            let node;
            if (kind === 'release') node = svgElement('polygon', { ...attrs, points: `${cx},${cy - 7} ${cx + 7},${cy} ${cx},${cy + 7} ${cx - 7},${cy}` }, svg);
            else if (kind === 'pr') node = svgElement('rect', { ...attrs, x: cx - 5, y: cy - 5, width: 10, height: 10 }, svg);
            else node = svgElement('circle', { ...attrs, cx, cy, r: 5 }, svg);
            svgElement('title', {}, node, attrs['aria-label']);
            for (const event of ['click', 'focus', 'mouseenter']) node.addEventListener(event, () => showDetail(point, unit));
            node.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); showDetail(point, unit); } });
        }
        drawTable(points, unit);
        showDetail(points[points.length - 1], unit);
    }
    function showDetail(point, unit) {
        const { run, measurement: m } = point;
        const detail = get('perf-detail');
        detail.replaceChildren();
        element('h3', `${sourceLabel(run)} · ${number(m.median / unit.divisor)} ${unit.label}`, detail);
        element('p', m.unit === 'reads' ? 'Exact event reads; one untimed execution.' : `${number(m.confidence_level * 100)}% confidence interval: ${number(m.lower / unit.divisor)}–${number(m.upper / unit.divisor)} ${unit.label}${m.samples ? ` · ${m.samples} samples` : ''}`, detail);
        const metadata = element('dl', undefined, detail);
        const rows = [
            ['Source date', model.sourceDate(run) + (run.source.patch_sha256 ? ' · study date (uncommitted patch)' : '')],
            ['Source', run.source.sha + (run.source.patch_sha256 ? ` + patch ${run.source.patch_sha256}` : '')],
            ['Harness', `${run.harness.id} · SHA-256 ${run.harness.sha256}`],
            ['Compiler', `${run.compiler.version}${run.compiler.target ? ` · ${run.compiler.target}` : ''} · profile ${run.profile}`],
            ['Runner', `${run.runner.label} · ${run.runner.os || 'OS not recorded'} · ${run.runner.hardware || run.runner.id}`],
            ['Lockfile', run.lockfile_sha256 || 'Not recorded'],
            ['Settings', JSON.stringify(m.unit === 'reads' ? m.parameters : { ...run.parameters, ...m.parameters })],
            ['Measured', run.recorded_at + (run.run_url ? '' : ' · local run, no CI URL')],
            ['Series', m.series]
        ];
        if (run.source.merged_tree_equivalent) rows.push(['Merged equivalent', `${run.source.merged_tree_equivalent.sha} · identical source tree; measured SHA remains ${run.source.sha.slice(0, 8)}`]);
        if (m.original_workload) rows.push(['Raw workload', m.original_workload]);
        for (const [name, value] of rows) { element('dt', name, metadata); element('dd', value, metadata); }
        const links = element('p', undefined, detail);
        const targets = [['Source', `https://github.com/ankurah/ankurah/commit/${run.source.sha}`], ['Raw measurements', run.raw_url], ['Harness source', run.harness.source_url], ['Source patch', run.source.patch_url], ['CI run', run.run_url]];
        if (run.source.merged_tree_equivalent) targets.push(['Merged equivalent', run.source.merged_tree_equivalent.url]);
        for (const [label, url] of targets.filter(([, url]) => url)) { if (links.childNodes.length) links.append(' · '); link(links, label, url); }
        if (run.markers.length) {
            const markers = element(run.markers.length > 3 ? 'details' : 'p', undefined, detail);
            if (run.markers.length > 3) element('summary', run.markers.length + ' source markers', markers);
            else markers.append('Markers: ');
            run.markers.forEach((marker, i) => { if (i) markers.append(' · '); link(markers, marker.label, marker.url); });
        }
    }
    function drawTable(points, unit) {
        get('perf-caption').textContent = `${controls.workload.value} · values in ${unit.label}`;
        const body = get('perf-table').querySelector('tbody');
        body.replaceChildren();
        for (const point of points) {
            const { run, measurement: m } = point;
            const row = element('tr', undefined, body), source = element('td', undefined, row);
            element('span', sourceLabel(run), source).className = 'perf-source';
            element('small', sourceLabel(run, true), source).className = 'perf-source';
            visibleMarkers(run.markers).forEach(marker => { source.append(' '); link(source, marker.label, marker.url); });
            if (run.markers.length > 3) element('small', ` + ${run.markers.length - 3} markers in details`, source);
            element('td', number(m.median / unit.divisor), row);
            element('td', m.unit === 'reads' ? 'Exact count' : `${number(m.lower / unit.divisor)}–${number(m.upper / unit.divisor)} (${number(m.confidence_level * 100)}%)`, row);
            element('td', run.recorded_at.slice(0, 10), row);
            const evidence = element('td', undefined, row);
            const button = element('button', 'Details', evidence);
            button.type = 'button';
            button.setAttribute('aria-label', 'Details for ' + sourceLabel(run) + ' measured ' + run.recorded_at);
            button.addEventListener('click', () => showDetail(point, unit));
            if (run.raw_url) { evidence.append(' · '); link(evidence, 'Raw', run.raw_url); }
        }
    }
    async function load(url) {
        const response = await fetch(url, { signal: AbortSignal.timeout(8000), cache: 'no-cache' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return model.validateHistory(await response.json());
    }
    async function start() {
        const remote = load(root.dataset.remote).then(value => ({ value }), error => ({ error }));
        const backfill = load(root.dataset.backfill).then(value => ({ value }), error => ({ error }));
        let selectionChanged = false;
        for (const [key, control] of Object.entries(controls)) control.addEventListener('change', () => {
            selectionChanged = true;
            update(key);
        });
        function show(histories) {
            history = model.mergeHistories(histories);
            renderNavigation();
            if (!selectionChanged) {
                controls.kind.value = history.runs.some(run => run.kind === 'stable') ? 'stable' : history.runs.some(run => run.kind === 'local') ? 'local' : 'hosted';
                controls.series.value = '';
            }
            root.querySelector('.perf-controls').hidden = false;
            update();
        }
        let local;
        try {
            local = await load(root.dataset.local);
            show([local]);
            get('performance-status').textContent = 'Local study loaded. Checking the versioned CI history…';
        } catch (_) { /* CI data can still provide the page if local evidence is unavailable. */ }
        const localBackfill = await backfill;
        const localHistories = [...(local ? [local] : []), ...(localBackfill.value ? [localBackfill.value] : [])];
        if (localHistories.length) show(localHistories);
        const backfillNote = localBackfill.value?.runs.length ? ` ${localBackfill.value.runs.length} local backfill runs loaded.` : '';
        const result = await remote;
        if (result.value) {
            show([...localHistories, result.value]);
            get('performance-status').textContent = 'CI history loaded from the versioned benchmark-data branch.' + (local ? ' Checked-in local evidence is also available.' : ' Local study evidence could not be loaded.') + backfillNote;
        } else if (localHistories.length) {
            get('performance-status').textContent = 'CI history is unavailable. Showing checked-in local evidence.' + backfillNote + (localBackfill.value?.coverage.length ? ' See the local coverage catalog for remaining gaps.' : ' Coverage of main and releases is unknown.');
        } else throw new Error('No history could be loaded. Use the evidence files linked below.');
    }
    start().catch(error => { get('performance-status').textContent = error.message; });
})();
