// Let the embedded explainers fit their content without nested scrollbars.
window.addEventListener("message", (event) => {
  if (
    event.origin !== location.origin ||
    event.data?.type !== "digest-figure-height"
  )
    return;
  const height = event.data.height;
  if (!Number.isFinite(height) || height < 100 || height > 5000) return;
  for (const frame of document.querySelectorAll("iframe.digest-figure")) {
    if (frame.contentWindow === event.source)
      frame.style.height = `${Math.ceil(height)}px`;
  }
});
