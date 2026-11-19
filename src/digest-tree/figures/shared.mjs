export const $ = (selector) => document.querySelector(selector);
export const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

export function setup() {
  try {
    const root = parent.document.documentElement;
    const theme = () => {
      document.documentElement.dataset.theme =
        /(?:^|\s)(navy|coal|ayu)(?:\s|$)/.test(root.className)
          ? "dark"
          : "light";
    };
    if (parent !== window) {
      theme();
      new MutationObserver(theme).observe(root, {
        attributes: true,
        attributeFilter: ["class"],
      });
    } else {
      document.documentElement.dataset.theme = matchMedia(
        "(prefers-color-scheme:dark)",
      ).matches
        ? "dark"
        : "light";
    }
  } catch {
    /* The standalone figure also works outside the book's origin. */
  }
  const resize = () =>
    parent.postMessage(
      {
        type: "digest-figure-height",
        height: document.body.getBoundingClientRect().height,
      },
      location.origin,
    );
  new ResizeObserver(resize).observe(document.body);
  window.addEventListener("load", resize);
}

export function playback(max, render) {
  let step = 0,
    timer;
  const play = $("#play"),
    slider = $("#progress");
  function stop() {
    clearInterval(timer);
    timer = undefined;
    play.textContent = "Play";
    play.setAttribute("aria-pressed", "false");
  }
  function show(value) {
    step = Math.max(0, Math.min(max, value));
    slider.value = step;
    slider.max = max;
    $("#previous").disabled = step === 0;
    $("#next").disabled = step === max;
    $("#step").textContent = `${step} / ${max}`;
    if (step === max) stop();
    render(step);
  }
  play.addEventListener("click", () => {
    if (timer) return stop();
    if (step === max) show(0);
    play.textContent = "Pause";
    play.setAttribute("aria-pressed", "true");
    timer = setInterval(() => show(step + 1), 1900);
  });
  $("#previous").addEventListener("click", () => {
    stop();
    show(step - 1);
  });
  $("#next").addEventListener("click", () => {
    stop();
    show(step + 1);
  });
  slider.addEventListener("input", () => {
    stop();
    show(Number(slider.value));
  });
  window.addEventListener("pagehide", stop);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
  });
  show(0);
  return {
    reset(newMax = max) {
      stop();
      max = newMax;
      show(0);
    },
  };
}
