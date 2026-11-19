import { $, setup, playback } from "./shared.mjs";
import { transactionState } from "./model.mjs";
setup();
function render(step) {
  const outcome = $("#outcome").value,
    state = transactionState(outcome, step);
  for (const kind of ["entity", "tree"]) {
    const el = $(`#${kind}-version`);
    el.textContent = `Version ${state[kind]}`;
    el.className = `version ${state[kind] === "B" ? "new" : ""}`;
  }
  const titles = [
    "Begin with a consistent committed state.",
    "Write the entity's candidate state.",
    "Apply the matching tree change.",
    "Commit is the atomic boundary.",
    "Publish the committed cache changes.",
  ];
  const descriptions = [
    "The persisted tree describes version A of the entity. No candidate has been written.",
    "The caller prepares version B through its storage transaction before making map calls. Other readers still see committed state.",
    "The adapter acquires the tree's named lock and applies the member and digest changes through the same transaction. Neither candidate has landed.",
    "Both persistent records now describe B. The adapter's pending cache publication has not yet been reported landed.",
    "After commit succeeds, landed publishes eligible record-cache changes. No second durable transaction is needed.",
  ];
  let pending = [
    "No transaction writes yet.",
    "Transaction: entity B prepared; tree still to apply.",
    "Transaction: entity B + tree B prepared.",
    "Storage transaction committed.",
    "Commit reported landed.",
  ][step];
  if (step >= 3 && outcome !== "commit") {
    titles[step] =
      outcome === "rollback"
        ? "Drop the candidates together."
        : "The commit refuses the conflicting attempt.";
    descriptions[step] =
      "This attempt publishes neither its entity candidate nor its tree candidate. It must not report its cache changes landed.";
    pending =
      outcome === "rollback"
        ? "Transaction rolled back. Neither candidate persisted."
        : "Transaction conflicted. Neither candidate persisted.";
  }
  $("#transaction-status").textContent = pending;
  $("#cache-status").textContent = state.landed
    ? "Record cache: committed generation B may now be retained."
    : state.entity === "B"
      ? "Record cache: B's publication is pending. Reads reconcile with the committed generation."
      : "Record cache: no B records published.";
  $("#caption").innerHTML =
    `<strong>${titles[step]}</strong><p>${descriptions[step]}</p>`;
  [...$("#timeline").children].forEach((el, i) =>
    el.classList.toggle("done", i < step),
  );
}
const player = playback(4, render);
$("#outcome").addEventListener("change", () => player.reset());
