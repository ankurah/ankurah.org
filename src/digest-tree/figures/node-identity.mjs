import { $, escape, setup, playback } from "./shared.mjs";

setup();

const explanations = {
  reopen: [
    ["Start with one running Node.", "K₁ is saved in storage. E₁ identifies this Node's local entities and catalog bindings."],
    ["Release the original Node and its work.", "An ordinary shutdown leaves the stored key and canonical data in place. It does not call reset."],
    ["Storage outlives the Node.", "The application can reopen it later. Identity comes from the retained key, not from keeping a Node object alive."],
    ["Construct the successor.", "The new Node gets E₂ immediately. Its key lookup and initialization run asynchronously."],
    ["Same identity, fresh local ownership.", "wait_ready() has completed. K₁ is unchanged; E₂ is new. Create new Contexts, queries and replication interests."],
  ],
  reset: [
    ["Start with one running Node.", "K₁ is saved in storage. E₁ identifies this Node's local entities and catalog bindings."],
    ["Halt before wiping.", "reset() closes admission, stops connections and services, and drains this Node's work. The old Node cannot accept more work."],
    ["Successful reset leaves empty storage.", "The native wipe removes canonical data, event history, the persisted key and derived trees. The original Node remains halted."],
    ["Construct a successor only after success.", "The new Node gets E₂. With no stored key, the default constructor creates and persists a new key during initialization."],
    ["New key, new epoch, new working set.", "wait_ready() has completed. K₂ identifies the successor to peers; E₂ identifies its local objects. E₁ never becomes running again."],
  ],
};

const player = playback(4, (step) => {
  const resetting = $("#outcome").value === "reset";
  const wiped = resetting && step >= 2;
  const ready = step === 4;
  $("#stored").textContent = wiped ? (ready ? "Key K₂" : "No stored key") : "Key K₁";
  $("#data").textContent = wiped
    ? (ready ? "Fresh catalog; no prior application data." : "Prior data and history removed.")
    : "Entity state and history retained.";
  $("#original").textContent = step === 0 ? "Running" : resetting ? "Halted" : "Dropped";
  $("#original-detail").textContent = step === 0
    ? "Presents K₁ to peers."
    : resetting ? "Terminal: cannot resume." : "Its local objects were released.";
  $("#original-card").classList.toggle("inactive", step > 0);
  $("#successor").textContent = ready ? "Running" : step === 3 ? "Startup" : "Not constructed";
  $("#successor-detail").textContent = ready
    ? `Presents ${resetting ? "K₂" : "K₁"} to peers. Uses fresh epoch E₂.`
    : step === 3 ? "Fresh epoch E₂. Waiting for initialization." : "No successor exists yet.";
  $("#successor-card").classList.toggle("inactive", !ready);
  const [title, detail] = explanations[resetting ? "reset" : "reopen"][step];
  $("#caption").innerHTML = `<strong>${escape(title)}</strong><p>${escape(detail)}</p>`;
});

$("#outcome").addEventListener("change", () => player.reset());
