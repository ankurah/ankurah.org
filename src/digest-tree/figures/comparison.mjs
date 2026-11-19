import { $, escape, setup, playback } from "./shared.mjs";
import { comparisonState } from "./model.mjs";
setup();
const spanLabel = (range) =>
  range.first !== null
    ? `Albums ${range.first}${range.first !== range.last ? `–${range.last}` : ""}`
    : "Empty span";
try {
  const response = await fetch("trace.json");
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  let trace = data.cases.find((item) => item.id === $("#scenario").value);
  function render(step) {
    const state = comparisonState(trace, step);
    $("#other-count").textContent = trace.theirs;
    const grid = $("#members");
    if (grid.children.length !== trace.theirs)
      grid.innerHTML = Array.from(
        { length: trace.theirs },
        () => '<span class="member" aria-hidden="true"></span>',
      ).join("");
    [...grid.children].forEach((cell, index) => {
      const status = state.states.get(index + 1) || "";
      cell.className = `member ${status}`;
      cell.title = `Album ${index + 1}: ${status || "not examined"}`;
    });
    $("#requests").textContent = state.requests;
    $("#received").textContent = state.received;
    $("#differences").textContent = state.complete
      ? trace.differences.length
      : "—";
    $("#members").setAttribute(
      "aria-label",
      `${trace.theirs} albums. ${state.requests} page requests completed; ${state.received} member payloads returned.${state.complete ? ` ${trace.differences.length} differences found.` : ""}`,
    );
    const round = trace.rounds[step - 1];
    let title = "Ask about the shared address space.",
      body =
        "The two views can answer pages over the same spans. Press Next to make the first get_pages call.";
    if (round) {
      const summaries = round.answers
        .filter((a) => a.kind === "digests")
        .flatMap((a) => a.parts);
      const matches = summaries.filter((p) => p.equal).length;
      const returned = round.answers
        .filter((a) => a.kind === "members")
        .reduce((n, a) => n + a.members, 0);
      title = state.complete
        ? trace.differences.length
          ? "The differences are now visible."
          : "These sets agree."
        : `Round ${step}: skip what matches.`;
      body = `${round.requests} span${round.requests === 1 ? "" : "s"} requested in one call. `;
      if (summaries.length)
        body += `${matches} of ${summaries.length} returned span digests match; ${summaries.length - matches} need more detail. `;
      if (returned)
        body += `${returned} member payload${returned === 1 ? "" : "s"} returned for direct comparison. `;
      if (state.complete)
        body +=
          "Comparison reports observations; the caller decides what to apply.";
    }
    $("#caption").innerHTML = `<strong>${title}</strong><p>${body}</p>`;
    $("#responses").innerHTML = round
      ? round.answers
          .flatMap((answer) =>
            answer.kind === "digests"
              ? answer.parts.map(
                  (part) =>
                    `<div class="response-row"><span>${spanLabel(part.range)} · ${part.count} members</span><strong class="${part.equal ? "match" : "different"}">${part.equal ? "Digest matches · skip" : "Digest differs · descend"}</strong></div>`,
                )
              : [
                  `<div class="response-row"><span>${spanLabel(answer.range)}</span><strong>${answer.members} members returned</strong></div>`,
                ],
          )
          .join("")
      : "<p>No pages requested yet.</p>";
    $("#changes").innerHTML = state.complete
      ? trace.differences
          .map(
            (d) =>
              `<div class="change"><b>Album ${d.id}</b> · ${d.ours === null ? "missing locally" : "different payload"}<small>${escape(d.ours ?? "Absent")} → ${escape(d.theirs ?? "Absent")}</small></div>`,
          )
          .join("")
      : "";
  }
  $("#loading").hidden = true;
  $("#explorer").hidden = false;
  $("#response").open = new URLSearchParams(location.search).has("detail");
  const player = playback(trace.rounds.length, render);
  $("#scenario").addEventListener("change", () => {
    trace = data.cases.find((item) => item.id === $("#scenario").value);
    player.reset(trace.rounds.length);
  });
} catch (error) {
  $("#loading").className = "error";
  $("#loading").textContent =
    "The recorded trace could not be loaded. Open this figure through the documentation server; the surrounding chapter explains the same comparison.";
  console.error(error);
}
