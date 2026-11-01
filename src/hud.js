import * as THREE from "three";
import { $, clamp, fmtNum } from "./util.js";
import { settings, save } from "./save.js";
import { CELL } from "./level.js";
import { WEAPONS } from "./data.js";

const SHORT = { pistol: "M9", rifle: "SR-7", shotgun: "BRCH", revolver: "M-R7", sniper: "RAIL", rocket: "ANNI" };
export class Hud {
  constructor() {
    this.el = {}; for (const id of ["hud", "crosshair", "hitm", "scope", "dmgInd", "lowhp", "objPanel", "objTitle", "objText", "objFill", "wayp", "waypD", "radar", "killfeed", "bossBar", "bossName", "bossFill", "bossShield", "hpFill", "hpTxt", "arFill", "arTxt", "wName", "ammoMag", "ammoRes", "reloadBar", "creditBox", "toasts", "banner", "bannerT", "bannerS", "progRing", "progFill", "progTxt", "fpsTxt", "achToast", "sub", "subName", "subText", "subCount", "dashFill", "wslots", "flashOv", "bDash", "ammoBox", "radarWrap"]) this.el[id] = $(id);
    this.rctx = this.el.radar.getContext("2d");
    this.cache = {}; this.bannerT = 0; this.v = new THREE.Vector3();
  }
  show(b) { this.el.hud.classList.toggle("hidden", !b); }
  setObjective(t, text, f) { if (this.cache.ot !== t) { this.cache.ot = t; this.el.objTitle.textContent = t; this.el.objPanel.classList.remove("pop"); void this.el.objPanel.offsetWidth; this.el.objPanel.classList.add("pop"); } if (this.cache.otx !== text) { this.cache.otx = text; this.el.objText.textContent = text; } this.setObjProgress(f); }
  setObjProgress(f) { const v = Math.round(clamp(f || 0, 0, 1) * 100); if (this.cache.of !== v) { this.cache.of = v; this.el.objFill.style.width = v + "%"; } }
  setHP(hp, hpMax, ar, arMax, vis) {
    const h = Math.round(hp), a = Math.round(ar);
    if (this.cache.hp !== h || this.cache.hm !== hpMax) { this.cache.hp = h; this.cache.hm = hpMax; this.el.hpFill.style.width = (hp / hpMax * 100) + "%"; this.el.hpTxt.textContent = h; this.el.lowhp.style.opacity = hp / hpMax < 0.3 ? 1 : 0; this.el.hpFill.classList.toggle("low", hp / hpMax < 0.3); }
    if (this.cache.ar !== a || this.cache.am !== arMax) { this.cache.ar = a; this.cache.am = arMax; this.el.arFill.style.width = (ar / arMax * 100) + "%"; this.el.arTxt.textContent = a; }
  }
  setWeapon(w) { this.el.wName.textContent = w.name; this.cache.wn = w.id; }
  setAmmo(w, a, s, rel) {
    if (!a) return; const k = a.mag + "/" + a.reserve + "/" + (rel >= 0);
    if (this.cache.ammo !== k) { this.cache.ammo = k; this.el.ammoMag.textContent = a.mag; this.el.ammoRes.textContent = "/ " + a.reserve; this.el.ammoMag.classList.toggle("empty", a.mag === 0); this.el.ammoMag.classList.toggle("lowa", a.mag > 0 && a.mag <= Math.ceil(s.magMax * 0.25)); }
    if (rel >= 0) { this.el.reloadBar.style.display = "block"; this.el.reloadBar.firstElementChild.style.width = Math.round(rel * 100) + "%"; } else if (this.cache.rl !== -1) this.el.reloadBar.style.display = "none"; this.cache.rl = rel >= 0 ? 1 : -1;
  }
  slots(list, cur) {
    const el = this.el.wslots; el.innerHTML = list.map((w) => `<button data-slot="${WEAPONS.indexOf(w) + 1}" class="${w.id === cur ? "cur" : ""}"><b>${WEAPONS.indexOf(w) + 1}</b><span>${SHORT[w.id]}</span></button>`).join(""); this.cache.slotsCur = cur;
  }
  setCredits(n) { this.el.creditBox.textContent = "◈ " + fmtNum(n); }
  dashCd(f) { const v = Math.round(f * 100); if (this.cache.dc !== v) { this.cache.dc = v; this.el.dashFill.style.height = (100 - v) + "%"; this.el.bDash.classList.toggle("ready", v >= 100); } }
  dashFlash() { const f = this.el.flashOv; f.style.opacity = 0.35; f.style.background = "radial-gradient(circle, transparent 40%, rgba(120,220,255,.6))"; setTimeout(() => { f.style.opacity = 0; }, 140); }
  crosshair(spread, ads, w) { const px = Math.round(6 + spread * 900 * (1 - ads * 0.4)); if (this.cache.ch !== px) { this.cache.ch = px; this.el.crosshair.style.setProperty("--gap", px + "px"); } const o = ads > 0.5 && w.scope ? 0 : 1 - ads * 0.5; if (this.cache.co !== o) { this.cache.co = o; this.el.crosshair.style.opacity = o; } }
  scope(on) { this.el.scope.classList.toggle("on", !!on); this.el.crosshair.classList.toggle("hide", !!on && false); }
  hitmarker(kind) { const h = this.el.hitm; h.className = ""; void h.offsetWidth; h.className = "on " + kind; }
  damage(angWorld, yaw, dmg) {
    const rel = angWorld - (yaw + Math.PI); const d = document.createElement("div"); d.className = "di"; d.style.transform = `rotate(${-rel}rad)`; this.el.dmgInd.appendChild(d); setTimeout(() => d.remove(), 900);
    const f = this.el.flashOv; f.style.background = "radial-gradient(circle, transparent 35%, rgba(255,40,40,.55))"; f.style.opacity = 0.7; clearTimeout(this._ft); this._ft = setTimeout(() => { f.style.opacity = 0; }, 160);
  }
  toast(text, kind = "info") {
    const t = document.createElement("div"); t.className = "toast " + kind; t.textContent = text; const c = this.el.toasts; c.appendChild(t); while (c.children.length > 4) c.firstChild.remove(); setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 400); }, 2400);
  }
  killfeed(text) { const t = document.createElement("div"); t.className = "kf"; t.textContent = "✖ " + text; const c = this.el.killfeed; c.appendChild(t); while (c.children.length > 4) c.firstChild.remove(); setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 400); }, 3200); }
  banner(t, s) { const b = this.el.banner; this.el.bannerT.textContent = t; this.el.bannerS.textContent = s || ""; b.classList.remove("on"); void b.offsetWidth; b.classList.add("on"); }
  achievement(a) { const e = this.el.achToast; e.innerHTML = `<span class="ai">${a.icon}</span><div><small>成就解鎖</small><b>${a.name}</b></div>`; e.classList.remove("on"); void e.offsetWidth; e.classList.add("on"); }
  boss(b) {
    const bb = this.el.bossBar; if (!bb.classList.contains("on")) { bb.classList.add("on"); this.el.bossName.textContent = b.def.name; }
    const f = clamp(b.hp / b.hpMax, 0, 1); this.el.bossFill.style.width = (f * 100) + "%"; bb.classList.toggle("shielded", !!b.invuln);
    this.el.bossShield.style.opacity = b.invuln ? 1 : 0; this.el.bossName.textContent = b.def.name + (b.invuln ? "　🛡 護盾運作中" : b.phase > 1 ? "　‹ 階段 " + b.phase + " ›" : "");
  }
  hideBoss() { this.el.bossBar.classList.remove("on"); }
  progressRing(f, txt) { const e = this.el.progRing; if (f < 0) { e.classList.remove("on"); return; } e.classList.add("on"); this.el.progFill.style.width = Math.round(clamp(f, 0, 1) * 100) + "%"; this.el.progTxt.textContent = txt || ""; }
  fps(t) { this.el.fpsTxt.textContent = t; }
  subtitle(name, text, i, n) { const s = this.el.sub; s.classList.add("on"); this.el.subName.textContent = name; this.el.subText.textContent = text; this.el.subCount.textContent = (i + 1) + " / " + n; this.el.subText.classList.remove("type"); void this.el.subText.offsetWidth; this.el.subText.classList.add("type"); }
  hideSubtitle() { this.el.sub.classList.remove("on"); }
  hideOverlay() { document.querySelectorAll(".screen.ov").forEach((e) => e.classList.remove("show")); }
  showPause(b) { $("sPause").classList.toggle("show", b); }
  // per-frame: waypoint & weapon slot highlight
  frame(G) {
    if (!this._rz) { this._rz = true; addEventListener("resize", () => { this._W = innerWidth; this._H = innerHeight; }); }
    const wp = G.objectives && G.objectives.waypoint(), e = this.el.wayp;
    if (wp && !G.player.dead) {
      this.v.set(wp.x, wp.y, wp.z).project(G.cam); const behind = this.v.z > 1; let x = this.v.x, y = this.v.y;
      if (behind) { x = -x; y = -y; } let onscreen = !behind && Math.abs(x) < 0.92 && Math.abs(y) < 0.86;
      if (!onscreen) { const m = Math.max(Math.abs(x), Math.abs(y)) || 1; x = x / m * 0.9; y = y / m * 0.82; }
      const W = this._W || (this._W = innerWidth), H = this._H || (this._H = innerHeight); const c = this.cache;
      if (!c.wpOn) { e.style.display = "block"; c.wpOn = true; }
      const tx = Math.round((x * 0.5 + 0.5) * W), ty = Math.round((-y * 0.5 + 0.5) * H);
      if (c.wpx !== tx || c.wpy !== ty) { c.wpx = tx; c.wpy = ty; e.style.transform = "translate3d(" + tx + "px," + ty + "px,0)"; }
      if (c.wpEdge !== !onscreen) { c.wpEdge = !onscreen; e.classList.toggle("edge", !onscreen); }
      const dm = Math.round(wp.d); if (c.wpd !== dm) { c.wpd = dm; this.el.waypD.textContent = dm + "m"; }
    } else if (this.cache.wpOn !== false) { e.style.display = "none"; this.cache.wpOn = false; }
    if (this.cache.slotsCur !== G.player.cur) { this.slots(G.ownedList(), G.player.cur); }
    // low-hp heartbeat is handled by css pulse
    const inv = G.player.iframes > 0 && G.player.iframes < 3.2 && !G.player.dead; if (this.cache.inv !== inv) { this.cache.inv = inv; this.el.crosshair.classList.toggle("inv", inv); }
  }
  radar(G) {
    const c = this.rctx, S = 260, p = G.player, L = G.level; if (!L) return; const R = 30, k = S / 2 / R;
    c.clearRect(0, 0, S, S);
    c.save(); c.beginPath(); c.arc(S / 2, S / 2, S / 2 - 2, 0, 6.2832); c.clip();
    c.fillStyle = "rgba(8,12,34,0.72)"; c.fillRect(0, 0, S, S);
    c.translate(S / 2, S / 2); c.rotate(p.yaw); c.scale(k, k); c.translate(-p.x, -p.z);
    const cx0 = Math.max(0, Math.floor((p.x - R) / CELL)), cx1 = Math.min(L.W - 1, Math.floor((p.x + R) / CELL)), cz0 = Math.max(0, Math.floor((p.z - R) / CELL)), cz1 = Math.min(L.H - 1, Math.floor((p.z + R) / CELL));
    for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) { const code = L.code(cx, cz); if (code === 0) continue; c.fillStyle = code === 3 ? "rgba(120,170,255,0.28)" : code === 4 ? "rgba(255,80,90,0.7)" : "rgba(70,110,230,0.55)"; c.fillRect(cx * CELL, cz * CELL, CELL + 0.1, CELL + 0.1); }
    for (const t of G.pickups) { c.fillStyle = t.kind === "health" ? "#4f8" : t.kind === "ammo" ? "#fc4" : t.kind === "armor" ? "#4af" : "#ec3"; c.beginPath(); c.arc(t.x, t.z, 1.2, 0, 6.28); c.fill(); }
    for (const e of G.enemies) { if (e.dead) continue; const alert = e.state === "combat" || e.state === "alert"; c.fillStyle = e.boss ? "#ff3a6a" : alert ? "#ff4040" : "#c06070"; c.beginPath(); c.arc(e.x, e.z, e.boss ? 2.8 : e.def.static ? 1.6 : 1.5, 0, 6.28); c.fill(); }
    c.restore();
    // objective markers (clamped to the rim)
    const marks = G.objectives ? G.objectives.markers() : [];
    for (const m of marks) {
      const dx = m.x - p.x, dz = m.z - p.z; const sx = dx * Math.cos(p.yaw) - dz * Math.sin(p.yaw), sy = dx * Math.sin(p.yaw) + dz * Math.cos(p.yaw);
      let rx = sx * k, ry = sy * k; const d = Math.hypot(rx, ry), max = S / 2 - 14; if (d > max) { rx *= max / d; ry *= max / d; }
      c.save(); c.translate(S / 2 + rx, S / 2 + ry); c.rotate(Math.PI / 4); c.fillStyle = "#ffd23a"; c.shadowColor = "#ffb000"; c.shadowBlur = 8; c.fillRect(-7, -7, 14, 14); c.restore();
    }
    c.save(); c.translate(S / 2, S / 2); c.fillStyle = "#6ff"; c.beginPath(); c.moveTo(0, -11); c.lineTo(8, 9); c.lineTo(0, 5); c.lineTo(-8, 9); c.closePath(); c.fill(); c.restore();
  }
}
