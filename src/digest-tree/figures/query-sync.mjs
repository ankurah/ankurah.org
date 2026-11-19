import { $, setup, playback } from "./shared.mjs";

setup();

const states = {
  unknown: ["", "Not compared"],
  equal: ["equal", "Digest agrees · skip"],
  different: ["different", "Needs more detail"],
  repair: ["repair", "Repair in progress"],
  covered: ["covered", "Target heads covered"],
};

function frames() {
  const scenario = $("#scenario").value;
  const live = $("#request").value === "live";
  const cold = scenario === "cold";
  const equal = scenario === "equal";
  const result = [];
  let current = {
    stage: "capture",
    local: cold ? "No known query members" : "Known query members",
    localDetail: "Local canonical state remains the source of entity heads.",
    remote: "Prepare a target",
    remoteDetail: "A capture holds one authorized tree version for this comparison.",
    spans: ["unknown", "unknown", "unknown"],
    delivery: "No entity repair delivered yet.",
    standing: live ? "Standing subscription: not installed yet." : "",
  };
  function add(change) {
    current = { ...current, ...change };
    result.push(current);
  }
  add({
    title: "Begin with the Selection and known digest.",
    detail: "The peers also agree on the key specification used to order the members. The request carries a summary instead of every known member and head.",
  });
  if (live) add({
    standing: "Reactor subscription installed before the target is captured.",
    title: "Install the standing subscription first.",
    detail: "The peer's Reactor starts tracking this Selection before comparison captures its target. Initialization and subsequent live updates have different owners.",
  });
  add({
    remote: "Authorized target captured",
    remoteDetail: "Its retained tree version stays fixed while ordinary maintenance continues.",
    title: "Capture one version, then compare the digests.",
    detail: "The peer binds the capture to this connection, Selection and credentials. It can read that version through short storage snapshots without holding an engine lock across network waits.",
  });
  if (equal) {
    add({
      stage: "compare",
      spans: ["equal", "equal", "equal"],
      title: "Matching digests take the short path.",
      detail: "With the same Selection and key specification, matching digests let the requester skip further page requests and entity repair.",
      delivery: "No entity repairs needed for this comparison.",
    });
  } else {
    add({
      stage: "compare",
      spans: cold ? ["different", "different", "different"] : ["equal", "different", "equal"],
      title: cold ? "An empty local result still needs the target's members." : "Follow pages only into differing spans.",
      detail: cold
        ? "There are no known query members to skip. Comparison obtains member descriptions in bounded pages; cold initialization still has to transfer the missing data."
        : "The first page accompanies the target. Further pages subdivide differing spans until member descriptions identify the work; matching spans need no further descent.",
    });
    add({
      stage: "repair",
      spans: cold ? ["repair", "repair", "repair"] : ["equal", "repair", "equal"],
      title: "Repair against current canonical heads.",
      detail: "A member description is not entity state. The requester checks its current head, then asks for bounded repair. State initializes a missing entity; causal events reconcile known versions.",
      delivery: "Attributed repair batches arrive on the existing peer update channel.",
    });
    if (scenario === "retry") {
      add({
        remote: "Retained version unavailable",
        remoteDetail: "The old capture cannot answer another page consistently.",
        local: "Applied repairs retained",
        spans: ["unknown", "covered", "unknown"],
        title: "A lost capture requires a fresh comparison.",
        detail: "Retention exhaustion or an invalidated history must not produce a mixture of tree versions. Already-applied entity repairs stay in canonical state.",
        delivery: "Earlier repair batches remain applied.",
      });
      add({
        stage: "capture",
        remote: "Fresh authorized target",
        remoteDetail: "A renewed capture may describe a later result.",
        spans: ["unknown", "unknown", "unknown"],
        title: "Advertise the current known digest and begin again.",
        detail: "The new comparison can skip progress already present locally. Restarting does not reset the operation's work allowance or deadline.",
      });
      add({
        stage: "repair",
        spans: ["equal", "equal", "repair"],
        title: "Continue with the remaining differences.",
        detail: "The fresh target may include newer changes. Comparison and repair continue within the remaining policy limits; this illustration assumes they can finish.",
        delivery: "Only the remaining repairs need to be delivered.",
      });
    }
    add({
      stage: "cover",
      spans: ["covered", "covered", "covered"],
      local: "Target heads covered",
      title: "Coverage permits a newer local version.",
      detail: "Every target member must be locally present at its captured head or a descendant. Concurrent heads require causal repair. A local-only member is reconciled by an authorized identity read; absence alone does not delete it.",
      localDetail: "For example: captured head h2 is covered by local h2, or by h3 that descends from h2.",
      delivery: "Repair delivery and causal coverage have been checked.",
    });
  }
  add({
    stage: "cover",
    local: "Target covered",
    remote: "Comparison resources released",
    remoteDetail: "The captured target has served its purpose.",
    standing: live ? "Reactor continues to deliver standing live-query updates." : "",
    title: live ? "Initialization finishes; live changes continue." : "Fetch can finish.",
    detail: live
      ? "Comparison has covered this target. The standing Reactor subscription continues to track query membership and deliver live changes through the peer update channel."
      : "Completion covers the captured target. It does not require discarding additional local state, or promise that both participants will stay equal after the request returns.",
  });
  return result;
}

function render(step) {
  const frame = frames()[step];
  for (const item of document.querySelectorAll(".stages li")) {
    if (item.dataset.stage === frame.stage) item.setAttribute("aria-current", "step");
    else item.removeAttribute("aria-current");
  }
  for (const [selector, value] of [
    ["#local", frame.local], ["#local-detail", frame.localDetail],
    ["#remote", frame.remote], ["#remote-detail", frame.remoteDetail],
    ["#delivery", frame.delivery], ["#standing", frame.standing],
    ["#caption strong", frame.title], ["#caption p", frame.detail],
  ]) $(selector).textContent = value;
  $("#standing").hidden = !frame.standing;
  document.querySelectorAll(".span").forEach((element, index) => {
    const [style, label] = states[frame.spans[index]];
    element.className = `span ${style}`;
    element.querySelector("span").textContent = label;
  });
}

const player = playback(frames().length - 1, render);
for (const selector of ["#scenario", "#request"]) {
  $(selector).addEventListener("change", () => player.reset(frames().length - 1));
}
