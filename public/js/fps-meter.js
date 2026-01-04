// public/js/fps-meter.js
(() => {
  // Create overlay
  const el = document.createElement("div");
  el.id = "fpsMeter";
  el.style.position = "fixed";
  el.style.left = "10px";
  el.style.top = "10px";
  el.style.zIndex = "999999";
  el.style.padding = "6px 8px";
  el.style.background = "rgba(0,0,0,0.7)";
  el.style.border = "2px solid #fff";
  el.style.color = "#fff";
  el.style.font = '12px "Press Start 2P", monospace';
  el.style.lineHeight = "1.4";
  el.style.pointerEvents = "none";
  el.style.whiteSpace = "pre";
  document.addEventListener("DOMContentLoaded", () => {
    document.body.appendChild(el);
  });

  let frames = 0;
  let last = performance.now();
  let lastReport = last;

  function tick() {
    const now = performance.now();
    frames++;

    if (now - lastReport >= 1000) {
      const fps = Math.round((frames * 1000) / (now - lastReport));
      const ms = (now - last).toFixed(1);
      el.textContent = `FPS: ${fps}\nMS:  ${ms}`;
      frames = 0;
      lastReport = now;
    }

    last = now;
    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);

  // Optional: toggle with F key
  let visible = true;
  window.addEventListener("keydown", (e) => {
    if (e.key === "f" || e.key === "F") {
      visible = !visible;
      el.style.display = visible ? "block" : "none";
    }
  });
})();
