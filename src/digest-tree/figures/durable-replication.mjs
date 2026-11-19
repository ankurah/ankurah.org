import { $, escape, setup, playback } from "./shared.mjs";

setup();

const aurora = { title: "Aurora", detail: "Published · creation event stored" };
const notebook = { title: "Notebook", detail: "Draft · not published" };
const bside = { title: "B-side", detail: "Published · creation event stored" };
const fieldnote = { title: "Field note", detail: "Favorite · not published" };
const departed = { title: "Aurora", detail: "Outside published Selection · creation + exit events retained", retained: true };

function frames() {
  const direction = $("#directions").value;
  const exiting = $("#scenario").value === "exit";
  const leftInitial = [aurora, notebook];
  const rightInitial = [bside, fieldnote];
  const leftSynced = [...leftInitial, ...(direction === "same" ? [bside] : direction === "different" ? [fieldnote] : [])];
  const rightSynced = [...rightInitial, aurora];
  const leftDeparted = [departed, ...leftSynced.slice(1)];
  const rightDeparted = [...rightInitial, departed];
  const reverse = direction === "same" ? "B-side" : "Field note";
  if (exiting) return [
    {
      left: leftSynced, right: rightSynced, state: "CaughtUp · earlier capture",
      coverage: "Right has covered a capture that included Aurora.",
      title: "Start with accepted history on both Nodes.",
      detail: "Aurora is part of the published Selection. Each stored copy is backed by its creation event.",
    },
    {
      left: leftDeparted, right: rightSynced, state: "Earlier capture remains covered",
      coverage: "A previous CaughtUp value does not cover this later write.",
      title: "Left unpublishes Aurora while disconnected.",
      detail: "Left commits the change and its event locally. The caller does not wait for Right; Right's earlier state still says published.",
    },
    {
      left: leftDeparted, right: rightSynced, state: "Comparing · fresh source capture",
      coverage: "The new source Selection excludes Aurora.",
      title: "Reconnect and compare again.",
      detail: "Aurora appears only in Right's old selected set. An authorized identity read can supply the exit event; absence itself never permits deletion.",
    },
    {
      left: leftDeparted, right: rightDeparted, state: "Comparing · exit applied",
      coverage: "Aurora has left the selected membership; its history remains.",
      title: "Apply the exit event atomically.",
      detail: "Right now stores the creation and exit events. Its published query excludes Aurora, but the entity has not been erased.",
    },
    {
      left: leftDeparted, right: rightDeparted, state: "CaughtUp · new capture",
      coverage: "The completed target is covered, with retained history outside it.",
      title: "Membership and retention answer different questions.",
      detail: "The interest chooses what to maintain. Retaining accepted history makes later reentry and causal repair possible; custody and reclamation need separate guarantees.",
    },
  ];
  return [
    {
      left: leftInitial, right: rightInitial, state: "Connecting",
      coverage: "No completed source capture yet.",
      title: "Each receiver owns its interest.",
      detail: direction === "one"
        ? "Right requests published albums from Left. There is no reverse interest; a connection alone does not create one."
        : `Right requests published albums. Left separately requests ${direction === "same" ? "published albums" : "favorites"} from Right.`,
    },
    {
      left: leftInitial, right: rightInitial, state: "Connecting",
      coverage: "Local storage and peer coverage are distinct.",
      title: "Each Node's local records are already durable.",
      detail: "The local commits stored state and events without waiting for replication. A slow or disconnected receiver does not prevent those commits from completing.",
    },
    {
      left: leftInitial, right: rightInitial, state: "Comparing · source captured",
      coverage: "Left's captured published Selection contains Aurora.",
      title: "Capture selected membership, then compare digests.",
      detail: "Notebook is not in Left's published Selection. The generic tree supplies bounded pages; no whole entity result set is needed for an unlimited replication interest.",
    },
    {
      left: leftSynced, right: rightSynced, state: "Comparing · missing history applied",
      coverage: "Right accepts Aurora with its supporting events.",
      title: "Transfer history through the normal event path.",
      detail: direction === "one"
        ? "Right receives Aurora's history. Its own B-side and Field note remain local; no reverse interest sends them to Left."
        : `Right receives Aurora. The independent reverse interest supplies ${reverse} to Left. Invalid or unavailable required history cannot establish coverage.`,
    },
    {
      left: leftSynced, right: rightSynced, state: "CaughtUp · captured source covered",
      coverage: "This target is covered; a later source change needs another sweep.",
      title: "Coverage does not require identical stored sets.",
      detail: "Extra local records and causally newer versions are allowed. The worker starts another sweep after its current polling interval; it does not promise permanent equality.",
    },
  ];
}

function render(step) {
  const direction = $("#directions").value;
  $("#reverse").hidden = direction === "one";
  $("#reverse-selection").textContent = `Left holds the handle · ${direction === "same" ? "published" : "favorite"} = true`;
  const frame = frames()[step];
  for (const [selector, records] of [["#left-records", frame.left], ["#right-records", frame.right]]) {
    $(selector).innerHTML = records.map((record) => `<li${record.retained ? ' class="retained"' : ""}><strong>${escape(record.title)}</strong><span>${escape(record.detail)}</span></li>`).join("");
  }
  for (const [selector, value] of [["#state", frame.state], ["#coverage", frame.coverage], ["#caption strong", frame.title], ["#caption p", frame.detail]]) {
    $(selector).textContent = value;
  }
}

const player = playback(4, render);
for (const selector of ["#directions", "#scenario"]) {
  $(selector).addEventListener("change", () => player.reset(4));
}
