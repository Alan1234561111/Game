import * as THREE from "three";
import { cloneNode, normalise } from "./assets.js";
import { WEAPONS } from "./data.js";
import { damp } from "./util.js";

// barrel direction in the source models: 'pistol/revolver/rifle/sniper/rocket' point to -X, shotgun to +Z
const VIEW = {
  pistol: { rot: -Math.PI / 2, len: 0.30, pos: [0.15, -0.14, -0.20] },
  revolver: { rot: -Math.PI / 2, len: 0.36, pos: [0.15, -0.14, -0.20] },
  rifle: { rot: -Math.PI / 2, len: 0.58, pos: [0.16, -0.15, -0.14] },
  shotgun: { rot: Math.PI, len: 0.72, pos: [0.16, -0.14, -0.10] },
  sniper: { rot: -Math.PI / 2, len: 0.88, pos: [0.15, -0.14, -0.06] },
  rocket: { rot: -Math.PI / 2, len: 0.64, pos: [0.19, -0.19, -0.12] },
};

export class WeaponView {
  constructor(models, glowTex) {
    this.scene = new THREE.Scene(); this.cam = new THREE.PerspectiveCamera(58, 1, 0.02, 20);
    this.scene.add(this.cam);
    this.hemi = new THREE.HemisphereLight(0xcfd8ff, 0x303040, 1.3); this.scene.add(this.hemi);
    this.key = new THREE.DirectionalLight(0xfff0e0, 2.2); this.key.position.set(0.5, 1, 0.8); this.scene.add(this.key);
    this.rim = new THREE.DirectionalLight(0x80b0ff, 1.2); this.rim.position.set(-1, 0.3, -0.5); this.scene.add(this.rim);
    this.holder = new THREE.Group(); this.cam.add(this.holder);
    this.models = {}; this.cur = null;
    for (const w of WEAPONS) {
      const src = models.weapons.scenes[w.model];
      const o = src.clone(true);
      const v = VIEW[w.id];
      // orient: rotate so the barrel points to -Z
      const inner = new THREE.Group(); inner.add(o); inner.rotation.y = v.rot;
      const n = normalise(inner, v.len, {});
      n.wrap.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(n.wrap);
      const sz = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
      // pivot at rear end (max z), x centre, y centre
      const g = new THREE.Group(); g.add(n.wrap);
      n.wrap.position.set(-c.x, -c.y, -box.max.z);
      g.userData = { len: sz.z, halfH: sz.y / 2, w: w, base: v.pos.slice() };
      // muzzle marker
      const mz = new THREE.Object3D(); mz.position.set(0, sz.y * 0.28, -sz.z - 0.02); g.add(mz); g.userData.muzzle = mz;
      // flash sprite
      const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffd9a0, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false, opacity: 0 }));
      fl.scale.setScalar(0.35); mz.add(fl); g.userData.flash = fl;
      g.traverse((q) => { if (q.isMesh) { q.frustumCulled = false; if (q.material) { q.material = q.material.clone(); q.material.envMapIntensity = 0.7; } } });
      g.visible = false; this.holder.add(g); this.models[w.id] = g;
    }
    this.id = null; this.t = 0; this.recoil = 0; this.recoilRot = 0; this.reloadT = -1; this.reloadDur = 1; this.switchT = 1; this.ads = 0;
    this.bobT = 0; this.swayX = 0; this.swayY = 0; this.pump = 0; this.flashT = 0; this.sprint = 0; this.kickX = 0;
    this.prev = null;
  }
  setEnv(env, intensity) { this.scene.environment = env; this.scene.environmentIntensity = intensity; }
  equip(id, instant) {
    if (this.id === id) return;
    this.prev = this.id; this.id = id;
    for (const k in this.models) this.models[k].visible = k === id;
    this.cur = this.models[id]; this.switchT = instant ? 1 : 0;
  }
  fire(w) { this.recoil = Math.min(1.6, this.recoil + w.recoil * 0.55); this.recoilRot = Math.min(1.4, this.recoilRot + w.recoil * 0.5); this.kickX = (Math.random() - 0.5) * 0.4 * w.recoil; this.flashT = 0.06; if (w.pump) this.pump = 1; if (this.cur) { const f = this.cur.userData.flash; f.material.rotation = Math.random() * 6.28; f.scale.setScalar(0.28 + w.flash * 0.18); f.material.color.setHex(w.id === "sniper" ? 0x7af0ff : 0xffd9a0); } }
  startReload(dur) { this.reloadT = 0; this.reloadDur = dur; }
  cancelReload() { this.reloadT = -1; }
  update(dt, st) {
    // st: {moving(0..1 speed), sprint(bool), ads(0..1), lookDX, lookDY, grounded, vy, crouch}
    const g = this.cur; if (!g) return;
    const u = g.userData;
    this.t += dt;
    this.bobT += dt * (3 + st.moving * 6);
    const bobA = st.grounded ? st.moving : 0.2;
    const adsK = 1 - st.ads * 0.85;
    let x = u.base[0], y = u.base[1], z = u.base[2];
    // ADS: bring the sights to the centre
    const ax = 0, ay = -(u.halfH * 0.85 + 0.012), az = u.base[2] + 0.02;
    x += (ax - x) * st.ads; y += (ay - y) * st.ads; z += (az - z) * st.ads;
    this.swayX = damp(this.swayX, -st.lookDX * 0.0006, 8, dt); this.swayY = damp(this.swayY, st.lookDY * 0.0006, 8, dt);
    this.swayX = Math.max(-0.05, Math.min(0.05, this.swayX)); this.swayY = Math.max(-0.05, Math.min(0.05, this.swayY));
    x += this.swayX * adsK + Math.cos(this.bobT) * 0.012 * bobA * adsK;
    y += this.swayY * adsK + Math.abs(Math.sin(this.bobT)) * 0.016 * bobA * adsK - (st.crouch ? 0.01 : 0);
    this.sprint = damp(this.sprint, st.sprint ? 1 : 0, 9, dt);
    // recoil
    this.recoil = damp(this.recoil, 0, 14, dt); this.recoilRot = damp(this.recoilRot, 0, 11, dt); this.kickX = damp(this.kickX, 0, 12, dt);
    this.pump = Math.max(0, this.pump - dt / 0.6);
    z += this.recoil * 0.06 * (1 - st.ads * 0.4); y += this.recoil * 0.008; x += this.kickX * 0.01;
    let rx = this.recoilRot * 0.07 * (1 - st.ads * 0.5) + this.swayY * 2, ry = this.swayX * 2 + this.sprint * 0.55, rz = this.sprint * -0.25 + this.swayX * 1.5;
    x -= this.sprint * 0.07; y -= this.sprint * 0.08; rx -= this.sprint * 0.2;
    // pump
    if (this.pump > 0) { const p = Math.sin(this.pump * Math.PI); z += p * 0.05; rx += p * 0.08; }
    // switch
    if (this.switchT < 1) { this.switchT = Math.min(1, this.switchT + dt / 0.38); const k = 1 - Math.pow(1 - this.switchT, 3); y -= (1 - k) * 0.35; rx -= (1 - k) * 0.8; }
    // reload
    if (this.reloadT >= 0) {
      this.reloadT += dt; const k = Math.min(1, this.reloadT / this.reloadDur);
      const dip = Math.sin(k * Math.PI); const e = dip < 0.5 ? dip * 2 : 1;
      y -= Math.min(1, dip * 1.6) * 0.14; rx -= Math.min(1, dip * 1.6) * 0.65; rz += Math.sin(k * Math.PI * 2) * 0.12; x -= Math.min(1, dip * 1.6) * 0.04;
      if (k >= 1) this.reloadT = -1;
    }
    g.position.set(x, y, z); g.rotation.set(rx, ry, rz);
    // flash
    this.flashT = Math.max(0, this.flashT - dt);
    u.flash.material.opacity = this.flashT > 0 ? 1 : 0;
  }
  muzzleWorld(out) { if (!this.cur) return out.set(0, 0, 0); this.cam.updateMatrixWorld(true); return this.cur.userData.muzzle.getWorldPosition(out); }
  get reloading() { return this.reloadT >= 0; }
}
