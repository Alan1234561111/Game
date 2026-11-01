// Robust zoom prevention for iOS Safari (user-scalable=no is ignored since iOS 10).
const NP = { passive: false };
const stop = (e) => { if (e.cancelable) e.preventDefault(); };
["gesturestart", "gesturechange", "gestureend"].forEach((t) => document.addEventListener(t, stop, NP));
document.addEventListener("touchmove", (e) => { if ((e.touches && e.touches.length > 1) || (e.scale !== undefined && e.scale !== 1)) stop(e); }, NP);
// block double-tap zoom on the game surface (menus rely on click, so only the play surface is filtered)
let lastEnd = 0;
document.addEventListener("touchend", (e) => {
  const now = Date.now(), t = e.target;
  if (now - lastEnd < 320 && t && t.closest && t.closest("#touch,#hud,#c,.tb,#ammoBox")) stop(e);
  lastEnd = now;
}, NP);
document.addEventListener("dblclick", stop, NP);
// desktop pinch / ctrl+wheel / ctrl +/- zoom
addEventListener("wheel", (e) => { if (e.ctrlKey) stop(e); }, NP);
addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && ["+", "-", "=", "0"].includes(e.key)) stop(e); });
// keep the page pinned (no rubber-band / address-bar scroll)
addEventListener("scroll", () => { if (scrollY !== 0 || scrollX !== 0) scrollTo(0, 0); }, { passive: true });
if (window.visualViewport) {
  visualViewport.addEventListener("resize", () => { if (visualViewport.scale > 1.001) { document.documentElement.style.zoom = ""; } });
}
