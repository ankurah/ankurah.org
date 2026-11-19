import { $, setup, playback } from "./shared.mjs";

setup();

const maintenance = [
  {
    canonical: "A",
    view: "A",
    durable: "A · C0",
    working: "No private candidate.",
    title: "Start from a caught-up tree.",
    detail:
      "The canonical state and the durable tree both describe A. C0 records the tree's completed source boundary.",
  },
  {
    canonical: "A",
    view: "Needs catch-up",
    durable: "A · C0",
    working:
      "The background worker is notified before polling the canonical commit.",
    title: "Invalidate before the commit can become uncertain.",
    detail:
      "The old tree must not answer as current. The wake survives cancellation of the request that initiated the write.",
  },
  {
    canonical: "B",
    view: "Needs catch-up",
    durable: "A · C0",
    working: "Canonical state B and its change marker are committed together.",
    title: "The entity becomes durable first.",
    detail:
      "The derived tree may still be behind. Losing its unflushed updates cannot undo the canonical commit.",
  },
  {
    canonical: "B",
    view: "Needs catch-up",
    durable: "A · C0",
    working: "Private candidate: tree B; source validation is pending.",
    title: "Reconcile privately from canonical state.",
    detail:
      "The worker reads one source boundary and updates a private buffered tree. Readers cannot see a partially consumed scan.",
  },
  {
    canonical: "B",
    view: "B",
    durable: "A · C0",
    working:
      "Validated buffered version: B · C1. Its tree writes remain pending.",
    title: "Validate the boundary, then publish the complete version.",
    detail:
      "The maintained tree can describe B while its durable base still describes A. This small batch has not reached the write-behind threshold.",
  },
];

const endings = {
  flush: [
    {
      canonical: "B",
      view: "B",
      durable: "A · C0",
      working:
        "Tree transaction: verify the durable generation under its named lock.",
      title: "A deadline, threshold or explicit call starts a flush.",
      detail:
        "The flush prepares tree records, member lookup, generation log and C1 in one transaction. A competing durable generation requires reconciliation instead of overwrite.",
    },
    {
      canonical: "B",
      view: "B",
      durable: "B · C1",
      working:
        "The atomic tree transaction committed. No pending tree writes remain.",
      title: "The durable tree catches up.",
      detail:
        "The records and their recovery cursor advance together. A later restart begins with this complete durable version.",
    },
  ],
  restart: [
    {
      canonical: "B",
      view: "No Node",
      durable: "A · C0",
      working: "The in-memory B version is lost before its tree flush.",
      title: "Stop the process before persistence.",
      detail:
        "Canonical B survives. Durable tree A and cursor C0 still agree, so recovery has a sound starting point without an asynchronous destructor flush.",
    },
    {
      canonical: "B",
      view: "Opening",
      durable: "A · C0",
      working:
        "The new Node opens A · C0 and reconstructs the pending changes.",
      title: "Reopen and reconcile before serving the tree.",
      detail:
        "An unlimited selection scans canonical changes since C0. A limited selection rereads the engine query result. Recovery need not replay every intermediate event.",
    },
    {
      canonical: "B",
      view: "B",
      durable: "A · C0",
      working: "Recovery validated and published a complete B version.",
      title: "Recovered reads describe canonical B.",
      detail:
        "The saved member lookup supplies former keys and heads for members that moved or left. Only the validated recovered version is published.",
    },
    {
      canonical: "B",
      view: "B",
      durable: "B · C1",
      working:
        "The recovered tree and its new cursor have been flushed atomically.",
      title: "Persist the recovered version.",
      detail:
        "Write-behind resumes normally. C1 labels this recovered boundary; it is not a promise that the cursor bytes match those of the interrupted process.",
    },
  ],
};

function frames() {
  return [...maintenance, ...endings[$("#outcome").value]];
}

function render(step) {
  const state = frames()[step];
  for (const field of ["canonical", "view", "durable"]) {
    const element = $(`#${field}`);
    element.textContent = state[field];
    element.classList.toggle("new", state[field].startsWith("B"));
  }
  $("#working").textContent = state.working;
  $("#caption strong").textContent = state.title;
  $("#caption p").textContent = state.detail;
}

const player = playback(frames().length - 1, render);
$("#outcome").addEventListener("change", () =>
  player.reset(frames().length - 1),
);
