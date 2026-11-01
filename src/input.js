import { settings, isTouchDevice } from "./save.js";

const $ = (id) => document.getElementById(id);
export class Input {
  constructor() {
    this.enabled = false;
    this.mx = 0; this.my = 0; this.lookX = 0; this.lookY = 0;
    this.btnFire = false; this.mouseFire = false; this.adsHeld = false; this.adsLatch = false;
    this.keys = {}; this.q = new Set(); this.slotQ = []; this.wheelQ = 0;
    this.joy = null; this.lookId = -1; this.lookLX = 0; this.lookLY = 0; this.sprintLatch = false; this.joyFull = false;
    this.locked = false; this.wasLocked = false; this.touchMode = isTouchDevice; this.gpActive = false; this.gpPrev = {};
    this.R = 58; this.onPause = () => {};
    this.touch = $("touch"); this.joyBase = $("joyBase"); this.joyKnob = $("joyKnob"); this.canvas = $("c");
    document.body.classList.toggle("touchmode", this.touchMode);
    this.bind();
  }
  take(n) { if (this.q.has(n)) { this.q.delete(n); return true; } return false; }
  takeSlot() { return this.slotQ.length ? this.slotQ.shift() : 0; }
  takeWheel() { const w = this.wheelQ; this.wheelQ = 0; return w; }
  bind() {
    const { touch, joyBase, joyKnob, canvas } = this;
    touch.addEventListener("pointerdown", (e) => {
      if (!this.enabled) return; e.preventDefault();
      if (e.pointerType === "mouse") {
        if (!this.locked) { try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (_e) { /* ignore */ } }
        if (e.button === 0) this.mouseFire = true; else if (e.button === 2) this.adsHeld = true;
        return;
      }
      this.touchMode = true; document.body.classList.add("touchmode");
      try { touch.setPointerCapture(e.pointerId); } catch (_e) { /* ignore */ }
      const half = settings.hand === "left" ? e.clientX > innerWidth * 0.5 : e.clientX < innerWidth * 0.5;
      if (half && !this.joy) {
        this.joy = { id: e.pointerId, ox: e.clientX, oy: e.clientY };
        joyBase.style.display = "block"; joyBase.style.left = e.clientX + "px"; joyBase.style.top = e.clientY + "px"; joyKnob.style.transform = "translate(0px,0px)";
      } else if (this.lookId < 0) { this.lookId = e.pointerId; this.lookLX = e.clientX; this.lookLY = e.clientY; }
    });
    touch.addEventListener("pointermove", (e) => {
      if (!this.enabled) return;
      if (this.joy && e.pointerId === this.joy.id) {
        let dx = e.clientX - this.joy.ox, dy = e.clientY - this.joy.oy; const l = Math.hypot(dx, dy), R = this.R * (settings.ctrlScale || 1);
        if (l > R) { dx = dx / l * R; dy = dy / l * R; }
        joyKnob.style.transform = `translate(${dx}px,${dy}px)`;
        this.mx = dx / R; this.my = -dy / R; if (Math.hypot(this.mx, this.my) < 0.14) { this.mx = 0; this.my = 0; }
        this.joyFull = l > R * 1.02; joyBase.classList.toggle("full", this.joyFull);
      } else if (e.pointerId === this.lookId && e.pointerType !== "mouse") {
        this.lookX += e.clientX - this.lookLX; this.lookY += e.clientY - this.lookLY; this.lookLX = e.clientX; this.lookLY = e.clientY;
      }
    });
    const up = (e) => {
      if (this.joy && e.pointerId === this.joy.id) { this.joy = null; this.mx = 0; this.my = 0; this.joyFull = false; joyBase.style.display = "none"; }
      if (e.pointerId === this.lookId) this.lookId = -1;
      if (e.pointerType === "mouse") { if (e.button === 0) this.mouseFire = false; else if (e.button === 2) this.adsHeld = false; }
    };
    touch.addEventListener("pointerup", up); touch.addEventListener("pointercancel", up); touch.addEventListener("lostpointercapture", up);
    document.addEventListener("mousemove", (e) => { if (this.enabled && this.locked) { this.lookX += e.movementX * 0.42; this.lookY += e.movementY * 0.42; } });
    document.addEventListener("pointerlockchange", () => {
      this.locked = document.pointerLockElement === canvas;
      if (this.locked) this.wasLocked = true;
      else if (this.wasLocked) { this.wasLocked = false; this.mouseFire = false; this.adsHeld = false; if (this.enabled) this.onPause(); }
    });
    addEventListener("wheel", (e) => { if (this.enabled) this.wheelQ += Math.sign(e.deltaY); }, { passive: true });
    // action buttons
    const hold = (id, on, off) => { const el = $(id); if (!el) return; el.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); try { el.setPointerCapture(e.pointerId); } catch (_e) { /* ignore */ } el.classList.add("down"); on(e); }); const u = () => { el.classList.remove("down"); off && off(); }; ["pointerup", "pointercancel", "lostpointercapture"].forEach((n) => el.addEventListener(n, u)); };
    hold("bFire", () => { this.btnFire = true; }, () => { this.btnFire = false; });
    hold("bAds", () => { this.adsLatch = !this.adsLatch; $("bAds").classList.toggle("on", this.adsLatch); });
    hold("bJump", () => this.q.add("jump"));
    { // dash: tap = dash, long press = crouch
      let t = null, long = false;
      hold("bDash", () => { long = false; clearTimeout(t); t = setTimeout(() => { long = true; this.q.add("crouch"); try { navigator.vibrate && navigator.vibrate(15); } catch (_e) { /* ignore */ } }, 330); },
        () => { clearTimeout(t); if (!long) this.q.add("dash"); });
    }
    hold("bReload", () => this.q.add("reload"));
    $("ammoBox").addEventListener("pointerdown", (e) => { if (!document.body.classList.contains("touchmode")) return; e.preventDefault(); e.stopPropagation(); this.q.add("swapNext"); });
    $("wslots").addEventListener("pointerdown", (e) => { const b = e.target.closest("[data-slot]"); if (b) { e.preventDefault(); e.stopPropagation(); this.slotQ.push(+b.dataset.slot); } });
    $("bPause").addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); this.onPause(); });
    addEventListener("keydown", (e) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Tab"].includes(e.code) && this.enabled) e.preventDefault();
      if (e.repeat) return;
      this.keys[e.code] = true;
      if (!this.enabled) return;
      switch (e.code) {
        case "KeyR": this.q.add("reload"); break;
        case "Space": this.q.add("jump"); break;
        case "ControlLeft": case "KeyC": this.q.add("crouch"); break;
        case "KeyQ": case "KeyF": this.q.add("dash"); break;
        case "Escape": case "KeyP": this.onPause(); break;
        case "KeyE": this.q.add("swapNext"); break;
        default: if (/^Digit[1-6]$/.test(e.code)) this.slotQ.push(+e.code.slice(5));
      }
    });
    addEventListener("keyup", (e) => { this.keys[e.code] = false; });
    addEventListener("blur", () => { this.keys = {}; this.btnFire = false; this.mouseFire = false; this.adsHeld = false; });
    document.addEventListener("contextmenu", (e) => e.preventDefault());
  }
  reset() {
    this.mx = this.my = 0; this.lookX = this.lookY = 0; this.joy = null; this.lookId = -1; this.btnFire = false; this.mouseFire = false; this.keys = {}; this.q.clear(); this.slotQ.length = 0; this.wheelQ = 0;
    this.adsLatch = false; this.adsHeld = false; this.sprintLatch = false; this.joyFull = false;
    this.joyBase.style.display = "none"; ["bFire", "bAds", "bSprint"].forEach((i) => { const el = $(i); if (el) { el.classList.remove("down"); el.classList.remove("on"); } });
  }
  pollGamepad(dt) {
    const gps = navigator.getGamepads ? navigator.getGamepads() : []; let gp = null; for (const g of gps) if (g && g.connected) { gp = g; break; }
    if (!gp) return null;
    const dz = (v) => (Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82);
    const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
    const edge = (i, name) => { const p = b(i); if (p && !this.gpPrev[i]) this.q.add(name); this.gpPrev[i] = p; };
    edge(0, "jump"); edge(1, "crouch"); edge(2, "reload"); edge(3, "swapNext"); edge(5, "dash");
    const st = b(9); if (st && !this.gpPrev[9] && this.enabled) this.onPause(); this.gpPrev[9] = st;
    const dl = b(14), dr = b(15); if (dl && !this.gpPrev[14]) this.wheelQ -= 1; if (dr && !this.gpPrev[15]) this.wheelQ += 1; this.gpPrev[14] = dl; this.gpPrev[15] = dr;
    const lx = dz(gp.axes[0]), ly = dz(gp.axes[1]), rx = dz(gp.axes[2]), ry = dz(gp.axes[3]);
    const active = lx || ly || rx || ry || b(7) || b(6);
    if (active) this.gpActive = true;
    return { mx: lx, my: -ly, lx: rx * 520 * dt, ly: ry * 380 * dt, fire: b(7), ads: b(6), sprint: b(10) };
  }
  poll(dt) {
    const k = this.keys;
    const kx = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0), ky = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
    let mx = this.mx + kx, my = this.my + ky;
    const gp = this.pollGamepad(dt);
    if (gp) { mx += gp.mx; my += gp.my; }
    const l = Math.hypot(mx, my); if (l > 1) { mx /= l; my /= l; }
    const turn = (k.ArrowRight ? 1 : 0) - (k.ArrowLeft ? 1 : 0);
    const lx = this.lookX + turn * 520 * dt + (gp ? gp.lx : 0), ly = this.lookY + (gp ? gp.ly : 0);
    this.lookX = 0; this.lookY = 0;
    const fire = this.btnFire || this.mouseFire || !!(gp && gp.fire);
    const ads = this.adsHeld || this.adsLatch || !!(gp && gp.ads);
    const sprint = !!(k.ShiftLeft || k.ShiftRight) || this.joyFull || this.sprintLatch || !!(gp && gp.sprint);
    return { mx, my, lx, ly, fire, ads, sprint, touch: !!this.joy || this.lookId >= 0 };
  }
}
