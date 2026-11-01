import { settings } from "./save.js";

const SFX = "ach alarm amb_city amb_hum amb_wind beam_loop boss_charge boss_roar boss_slam checkpoint dash death_drone death_heavy death_quad door_close door_open empty_click enemy_fire enemy_fire_heavy explode_small gen_explode heartbeat hit_armor hit_enemy hit_kill hit_marker jump land level_complete objective pickup_ammo pickup_armor pickup_cash pickup_health pickup_key player_armor player_die player_hurt reload_in reload_out rescue rocket_explode rocket_launch shield_break shield_hit shot_pistol shot_revolver shot_rifle shot_shotgun shot_sniper shotgun_pump sniper_charge spawn star step_concrete0 step_concrete1 step_concrete2 step_metal0 step_metal1 step_metal2 step_snow0 step_snow1 step_snow2 teleport turret_fire ui_back ui_buy ui_click ui_confirm ui_error ui_hover ui_open wave_start weapon_switch".split(" ");
let ctx = null, master = null, sfxGain = null, musGain = null, ambGain = null, comp = null;
const bufs = {}, musicBufs = {}, musicPending = {};
let unlocked = false;
const lastPlay = {};
let cur = null; // {key, src, gain}
let wantedKey = null, duck = 1, amb = null, wantedAmb = null;
const BASE = () => import.meta.env.BASE_URL;

export function initAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC || ctx) return;
  ctx = new AC();
  master = ctx.createGain();
  comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
  master.connect(comp); comp.connect(ctx.destination);
  sfxGain = ctx.createGain(); sfxGain.connect(master);
  musGain = ctx.createGain(); musGain.connect(master);
  ambGain = ctx.createGain(); ambGain.connect(master);
  applyVolumes();
}
export function applyVolumes() {
  if (!ctx) return;
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(settings.mute ? 0 : 1, t, 0.05);
  sfxGain.gain.setTargetAtTime(settings.sfx, t, 0.05);
  musGain.gain.setTargetAtTime(settings.music * 0.85 * duck, t, 0.15);
  ambGain.gain.setTargetAtTime(settings.sfx * 0.35, t, 0.1);
}
export function setDuck(d) { duck = d; applyVolumes(); }
function decode(url) {
  return fetch(url).then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }).then((ab) => new Promise((res, rej) => { try { const p = ctx.decodeAudioData(ab, res, rej); if (p && p.catch) p.catch(rej); } catch (e) { rej(e); } }));
}
export async function loadAudio(onProgress) {
  if (!ctx) { SFX.forEach(() => onProgress && onProgress()); return; }
  const base = BASE() + "sfx/";
  await Promise.all(SFX.map(async (n) => { try { bufs[n] = await decode(base + n + ".mp3"); } catch (e) { console.warn("sfx fail", n); } onProgress && onProgress(); }));
}
export function unlockAudio() {
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume();
  if (!unlocked) {
    unlocked = true;
    if (wantedKey) playMusic(wantedKey);
    if (wantedAmb) playAmbient(wantedAmb);
  }
}
export function audioReady() { return !!ctx && unlocked; }
export function loadMusic(key) {
  if (!ctx) return Promise.resolve(null);
  if (musicBufs[key]) return Promise.resolve(musicBufs[key]);
  if (musicPending[key]) return musicPending[key];
  musicPending[key] = decode(BASE() + `music/${key}.mp3`).then((b) => { musicBufs[key] = b; return b; }).catch((e) => { console.warn("music fail", key); return null; });
  return musicPending[key];
}
export function preloadMusic(keys) { keys.forEach(loadMusic); }
export async function playMusic(key, o = {}) {
  wantedKey = key;
  if (!ctx || !unlocked) return;
  if (cur && cur.key === key) return;
  const b = await loadMusic(key);
  if (!b || wantedKey !== key || !ctx) return;
  if (cur && cur.key === key) return;
  const fade = o.fade ?? 1.6, t = ctx.currentTime;
  const old = cur;
  if (old) { old.gain.gain.cancelScheduledValues(t); old.gain.gain.setValueAtTime(old.gain.gain.value, t); old.gain.gain.linearRampToValueAtTime(0, t + fade); try { old.src.stop(t + fade + 0.1); } catch (_e) { /* ignore */ } }
  const src = ctx.createBufferSource(); src.buffer = b; src.loop = !o.once;
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + fade);
  src.connect(g); g.connect(musGain); src.start(t, o.offset || 0);
  cur = { key, src, gain: g };
}
export function stopMusic(fade = 1) {
  wantedKey = null; if (!ctx || !cur) return;
  const t = ctx.currentTime, old = cur; cur = null;
  old.gain.gain.cancelScheduledValues(t); old.gain.gain.setValueAtTime(old.gain.gain.value, t); old.gain.gain.linearRampToValueAtTime(0, t + fade);
  try { old.src.stop(t + fade + 0.1); } catch (_e) { /* ignore */ }
}
export function currentMusic() { return cur && cur.key; }
export function playAmbient(name) {
  wantedAmb = name;
  if (!ctx || !unlocked) return;
  if (amb && amb.name === name) return;
  const t = ctx.currentTime;
  if (amb) { const o = amb; o.g.gain.cancelScheduledValues(t); o.g.gain.linearRampToValueAtTime(0, t + 1.2); try { o.src.stop(t + 1.4); } catch (_e) { /* ignore */ } amb = null; }
  if (!name || !bufs[name]) return;
  const src = ctx.createBufferSource(); src.buffer = bufs[name]; src.loop = true;
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + 1.5);
  src.connect(g); g.connect(ambGain); src.start(); amb = { name, src, g };
}
let voices = 0; const MAX_VOICES = 20;
export function onVisibility(hidden) { if (!ctx) return; try { if (hidden) ctx.suspend(); else ctx.resume(); } catch (_e) { /* ignore */ } }
if (typeof addEventListener !== "undefined") { const re = () => { if (ctx && ctx.state !== "running" && ctx.state !== "closed") { try { ctx.resume(); } catch (_e) { /* ignore */ } } }; ["touchend", "pointerdown", "keydown"].forEach((t) => addEventListener(t, re, { passive: true, capture: true })); }
export function play(name, o = {}) {
  if (!ctx || !unlocked || settings.mute) return null;
  const b = bufs[name]; if (!b) return null;
  const now = ctx.currentTime, minGap = o.minGap ?? 0.03;
  if (lastPlay[name] && now - lastPlay[name] < minGap) return null;
  lastPlay[name] = now;
  if (ctx.state !== "running" && ctx.state !== "closed") { try { ctx.resume(); } catch (_e) { /* ignore */ } }
  if (voices >= MAX_VOICES && !o.force) return null; // cap simultaneous sounds (keeps iOS audio thread smooth)
  const s = ctx.createBufferSource(); s.buffer = b; voices++; s.onended = () => { voices = Math.max(0, voices - 1); };
  s.playbackRate.value = (o.rate ?? 1) * (1 + (Math.random() - 0.5) * (o.jitter ?? 0.08));
  const g = ctx.createGain(); g.gain.value = o.vol ?? 1;
  let node = s; node.connect(g); node = g;
  if (o.pan !== undefined && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, o.pan)); node.connect(p); node = p; }
  if (o.lp && ctx.createBiquadFilter) { const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = o.lp; node.connect(f); node = f; }
  node.connect(sfxGain); s.start(0);
  return s;
}
export function playAt(name, dx, dz, camYaw, o = {}) {
  const d = Math.hypot(dx, dz);
  const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
  const pan = d > 0.01 ? (dx * rx + dz * rz) / d : 0;
  const vol = (o.vol ?? 1) * Math.max(0.1, 1 / (1 + d * 0.085));
  return play(name, Object.assign({}, o, { pan: pan * 0.85, vol, lp: d > 28 ? 2400 : undefined }));
}
export function loopHandle(name, vol = 1) {
  if (!ctx || !unlocked || !bufs[name]) return { set() {}, stop() {} };
  const s = ctx.createBufferSource(); s.buffer = bufs[name]; s.loop = true; const g = ctx.createGain(); g.gain.value = 0; s.connect(g); g.connect(sfxGain); s.start();
  return { set(v) { g.gain.setTargetAtTime(v * vol, ctx.currentTime, 0.05); }, stop() { g.gain.setTargetAtTime(0, ctx.currentTime, 0.05); try { s.stop(ctx.currentTime + 0.3); } catch (_e) { /* ignore */ } } };
}
export function audioInfo() { return { state: ctx && ctx.state, sfx: Object.keys(bufs).length, music: Object.keys(musicBufs), unlocked, cur: cur && cur.key }; }
