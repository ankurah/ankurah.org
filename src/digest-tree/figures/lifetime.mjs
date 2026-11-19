import { $, setup } from "./shared.mjs";
import { liveTrees } from "./model.mjs";
setup();
let state;
function render(message) {
  const live = liveTrees(state);
  for (const key of ["a", "b"]) {
    const card = $(`#tree-${key}`),
      created = key === "a" || state.createdB;
    card.className = `tree-card ${live[key] ? "live" : "expired"}`;
    card.querySelector(".state").textContent = live[key]
      ? "Available to the Node's maintenance worker"
      : created
        ? "No live owner remains"
        : "Not opened yet";
    const owners = [];
    if (state.retained === key) owners.push("LRU handle");
    if (key === "a" && state.view) owners.push("Caller’s view");
    if (key === "a" && state.stream) owners.push("Caller’s stream");
    card.querySelector(".owners").innerHTML = owners
      .map((owner) => `<span class="pill">${owner}</span>`)
      .join("");
    card.querySelector(".weak").textContent = live[key]
      ? "Weak reference upgrades to the live tree."
      : created
        ? "Weak reference expired; it cannot keep a tree alive."
        : "No registry entry.";
  }
  $("#view").checked = state.view;
  $("#stream").checked = state.stream;
  $("#view").disabled = !live.a;
  $("#stream").disabled = !live.a;
  $("#storage-b").hidden = !state.createdB;
  $("#caption").innerHTML =
    `<strong>${message}</strong><p>${live.a ? "A remains available to maintenance while any displayed owner keeps it alive." : "Reopen A to obtain another view or stream. Its durable cursor supports catch-up; a missing or invalid boundary requires reconstruction."}</p>`;
}
function reset() {
  state = { retained: "a", view: true, stream: false, createdB: false };
  render("A has two strong owners: the LRU and a view.");
}
$("#open-a").addEventListener("click", () => {
  const alive = liveTrees(state).a;
  state.retained = "a";
  render(
    alive
      ? "Opening A reuses its live tree and retains it again."
      : "Opening A reconciles its durable contents and registers a live tree.",
  );
});
$("#open-b").addEventListener("click", () => {
  state.createdB = true;
  state.retained = "b";
  render("B takes the LRU's one slot. A loses only that owner.");
});
$("#view").addEventListener("change", () => {
  state.view = $("#view").checked;
  render(state.view ? "A new view owns A." : "The caller released A's view.");
});
$("#stream").addEventListener("change", () => {
  state.stream = $("#stream").checked;
  render(
    state.stream
      ? "The stream owns A independently of its originating view."
      : "The caller released A's stream.",
  );
});
$("#reset").addEventListener("click", reset);
reset();
