// Platform detection (iOS Safari needs special care: no user-scalable, expensive blur, small GPU budget)
const ua = navigator.userAgent || "";
export const isIOS = /iP(hone|ad|od)/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const coarse = (() => { try { return matchMedia("(pointer: coarse)").matches; } catch (_e) { return false; } })();
export const isMobile = isIOS || /Android|Mobile|CriOS|FxiOS/i.test(ua) || (coarse && navigator.maxTouchPoints > 0);
// pixel-ratio ceiling for the canvas; phones render ~1.5 css-pixel density max
export const DPR_CAP = isMobile ? 1.5 : 2;
export const ANISO = isMobile ? 2 : 4;
export const LOW_MEM = isMobile && ((navigator.deviceMemory && navigator.deviceMemory <= 3) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 3));
if (typeof document !== "undefined") {
  const add = () => { if (isMobile) document.body.classList.add("mobile"); if (isIOS) document.body.classList.add("ios"); };
  if (document.body) add(); else addEventListener("DOMContentLoaded", add);
}
