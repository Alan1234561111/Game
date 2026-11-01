const KEY = "neonmaze.full.v1";
const SKEY = "neonmaze.full.settings.v1";

const defaultSave = () => ({
  v: 1, credits: 300, unlocked: 1, seenIntro: false,
  levels: {}, // id -> {stars, best, time, clears}
  owned: { pistol: true }, upgrades: {}, ach: {}, lb: [],
  stats: { kills: 0, shots: 0, hits: 0, crits: 0, deaths: 0, playtime: 0, levels: 0, barrels: 0, dashes: 0, bosses: 0, pods: 0, survBest: 0, spent: 0, earned: 0 },
  lastWeapon: "pistol", name: "獵手",
});
export const save = defaultSave();
try { const o = JSON.parse(localStorage.getItem(KEY) || "null"); if (o && o.v === 1) { Object.assign(save, o); save.stats = Object.assign(defaultSave().stats, o.stats || {}); } } catch (_e) { /* ignore */ }
export function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (_e) { /* ignore */ } }
export function resetSave() { Object.assign(save, defaultSave()); persist(); }

const defaults = {
  quality: "auto", sens: 1, adsSens: 0.7, invert: false, fov: 80, sfx: 0.9, music: 0.6, mute: false, vib: true, fps: false,
  ctrlScale: 1, difficulty: 1, aimAssist: 1.5, shake: 1, autoFire: false, hand: "right",
};
export const settings = Object.assign({}, defaults);
try { Object.assign(settings, JSON.parse(localStorage.getItem(SKEY) || "{}")); } catch (_e) { /* ignore */ }
export function saveSettings() { try { localStorage.setItem(SKEY, JSON.stringify(settings)); } catch (_e) { /* ignore */ } }
export function buzz(ms) { if (!settings.vib) return; try { if (navigator.vibrate) navigator.vibrate(ms); } catch (_e) { /* ignore */ } }
export const isTouchDevice = (() => {
  try { return matchMedia("(pointer: coarse)").matches || (navigator.maxTouchPoints > 0 && !matchMedia("(pointer: fine)").matches); } catch (_e) { return false; }
})();
try { if (isTouchDevice && !Object.prototype.hasOwnProperty.call(JSON.parse(localStorage.getItem(SKEY) || "{}"), "autoFire")) settings.autoFire = true; } catch (_e) { /* ignore */ }
