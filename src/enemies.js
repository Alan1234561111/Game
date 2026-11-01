import * as THREE from "three";
import { cloneSkinned, cloneNode, normalise } from "./assets.js";
import { ENEMY, BOSS } from "./data.js";
import { CELL } from "./level.js";
import { rnd, angDiff, damp, clamp, pick } from "./util.js";

const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
export class Flow {
  constructor(level) { this.L = level; this.W = level.W; this.H = level.H; this.dist = new Int16Array(this.W * this.H).fill(9999); this.cx = -1; this.cz = -1; }
  compute(px, pz) {
    const L = this.L, W = this.W, H = this.H;
    const cx = clamp(Math.floor(px / CELL), 0, W - 1), cz = clamp(Math.floor(pz / CELL), 0, H - 1);
    if (cx === this.cx && cz === this.cz && !this.dirty) return;
    this.cx = cx; this.cz = cz; this.dirty = false; this.dist.fill(9999);
    const q = [cx + cz * W]; this.dist[q[0]] = 0;
    for (let h = 0; h < q.length; h++) {
      const id = q[h], x = id % W, z = (id / W) | 0, d = this.dist[id];
      for (const [dx, dz] of N8) {
        const nx = x + dx, nz = z + dz; if (nx < 0 || nz < 0 || nx >= W || nz >= H || L.code(nx, nz) !== 0) continue;
        if (dx && dz && (L.code(x + dx, z) !== 0 || L.code(x, z + dz) !== 0)) continue;
        const nid = nx + nz * W; if (this.dist[nid] > d + 1) { this.dist[nid] = d + 1; q.push(nid); }
      }
    }
  }
  target(x, z) {
    const L = this.L, W = this.W, H = this.H, cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    if (cx < 0 || cz < 0 || cx >= W || cz >= H) return null;
    let best = this.dist[cx + cz * W], bx = cx, bz = cz;
    for (const [dx, dz] of N8) {
      const nx = cx + dx, nz = cz + dz; if (nx < 0 || nz < 0 || nx >= W || nz >= H || L.code(nx, nz) !== 0) continue;
      if (dx && dz && (L.code(cx + dx, cz) !== 0 || L.code(cx, cz + dz) !== 0)) continue;
      const d = this.dist[nx + nz * W]; if (d < best) { best = d; bx = nx; bz = nz; }
    }
    if (best >= 9999) return null;
    return [(bx + 0.5) * CELL, (bz + 0.5) * CELL, best];
  }
  dAt(x, z) { const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL); return cx < 0 || cz < 0 || cx >= this.W || cz >= this.H ? 9999 : this.dist[cx + cz * this.W]; }
}

// ---------------- templates (models normalised to size 1)
export function buildTemplates(models) {
  const t = {};
  for (const [id, k] of [["drone", "eye"], ["quad", "quad"], ["tri", "tri"]]) {
    const g = models[k]; const root = cloneSkinned(g.scene); const n = normalise(root, 1);
    t[k] = { proto: n.wrap, clips: g.animations, h: n.size.y };
  }
  return t;
}
const MODEL_YAW = { eye: 0, quad: 0, tri: 0 };
export function setModelYaw(o) { Object.assign(MODEL_YAW, o); }

const tmp = new THREE.Vector3();
let laserGeo = null;

export class Enemy {
  constructor(G, def, tpl, o = {}) {
    this.G = G; this.def = def; this.id = def.id; this.boss = !!def.boss;
    const L = G.level;
    this.x = o.x; this.z = o.z; this.y = 0; this.yaw = o.yaw ?? Math.random() * 6.28; this.vy = 0;
    this.group = o.group ?? -1;
    const hpm = G.diff.hp;
    this.hpMax = Math.round(def.hp * hpm * (def.boss ? G.diff.boss : 1) * (o.hpMul ?? 1)); this.hp = this.hpMax;
    this.shield = def.shield ? def.shield * hpm * G.diff.shield : 0; this.shieldMax = this.shield;
    this.radius = def.radius; this.colR = def.colR ?? def.radius;
    this.spd = def.speed * (0.92 + Math.random() * 0.16) * (o.spdMul ?? 1);
    this.dead = false; this.state = "spawn"; this.t = 0; this.spawnT = o.instant ? 0.01 : 0.9; this.stagger = 0;
    this.cd = rnd(0.5, 2); this.windT = 0; this.hitFlash = 0; this.alertT = 0; this.seen = false; this.lastSeen = -99; this.losT = 0;
    this.strafeDir = Math.random() < 0.5 ? 1 : -1; this.strafeT = rnd(0.5, 2);
    this.wp = null; this.waitT = rnd(0, 2); this.homeX = this.x; this.homeZ = this.z;
    this.burst = 0; this.burstT = 0; this.melT = 0; this.leapT = 0; this.leapCd = rnd(1, 4); this.leapV = null;
    this.coverT = 0; this.cover = null; this.dmgMul = 1; this.fireMul = 1;
    this.awake = !!o.awake;
    // visuals
    this.root = new THREE.Group(); this.mats = []; this.mixer = null; this.actions = {}; this.curAnim = null;
    if (def.model === "eye" || def.model === "quad" || def.model === "tri") {
      const tp = tpl[def.model]; this.model = cloneSkinned(tp.proto); this.h = tp.h * def.size; this.mixer = new THREE.AnimationMixer(this.model);
      for (const c of tp.clips) this.actions[c.name] = this.mixer.clipAction(c);
      this.modelYaw = MODEL_YAW[def.model] || 0;
    } else {
      const n = normalise(cloneNode(G.models.kenney, def.model), 1); this.model = n.wrap; this.h = n.size.y * def.size; this.modelYaw = 0;
    }
    this.model.scale.setScalar(def.size);
    this.root.add(this.model);
    const tint = def.tint ? new THREE.Color(def.tint[0], def.tint[1], def.tint[2]) : null;
    this.model.traverse((q) => {
      if (q.isMesh || q.isSkinnedMesh) {
        q.material = q.material.clone(); q.frustumCulled = false; q.castShadow = true;
        if (tint) { q.material.color.multiply(tint); }
        if (!q.material.emissive) q.material.emissive = new THREE.Color(0, 0, 0);
        q.userData.baseEm = q.material.emissive.clone(); q.userData.baseEmI = q.material.emissiveIntensity ?? 1;
        this.mats.push(q.material); q.userData.mat = q.material;
      }
    });
    this.hitH = this.h; this.hitY0 = def.fly ? def.cy - this.h / 2 : 0;
    this.root.position.set(this.x, 0, this.z);
    G.scene.add(this.root);
    this.play(def.moveAnim === "Idle" ? "Idle" : "Idle", 0);
    if (def.sniper) {
      if (!laserGeo) { laserGeo = new THREE.BoxGeometry(0.03, 0.03, 1); laserGeo.translate(0, 0, 0.5); }
      this.laser = new THREE.Mesh(laserGeo, new THREE.MeshBasicMaterial({ color: 0xff2030, toneMapped: false, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
      this.laser.visible = false; this.laser.frustumCulled = false; G.scene.add(this.laser);
    }
    this.spawnFx = false;
  }
  play(name, fade = 0.2, once = false) {
    if (!this.mixer) return; const a = this.actions[name]; if (!a || this.curAnim === a) return;
    a.reset(); a.enabled = true; a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity); a.clampWhenFinished = once;
    if (this.curAnim) this.curAnim.fadeOut(fade); a.fadeIn(fade).play(); this.curAnim = a;
  }
  get cy() { return this.def.fly ? this.y + this.def.cy : this.y + this.def.cy; }
  centerY() { return this.hitY0 + this.y + this.hitH * 0.5; }
  // --- damage
  hurt(dmg, o = {}) {
    if (this.dead || this.state === "spawn") return 0;
    const G = this.G;
    if (this.invuln) { G.fx.sparks(tmp.set(this.x, this.centerY(), this.z), new THREE.Vector3(0, 1, 0), 4, [0.6, 0.8, 1]); G.sfxAt("shield_hit", this.x, this.z, { vol: 0.6 }); return 0; }
    if (this.shield > 0 && !o.explosive) {
      // frontal shield
      let front = true;
      if (o.fromX !== undefined) { const a = Math.atan2(o.fromX - this.x, o.fromZ - this.z); front = Math.abs(angDiff(this.yaw, a)) < 1.25; }
      if (front) {
        this.shield -= dmg; G.sfxAt("shield_hit", this.x, this.z, { vol: 0.9 });
        this.shieldFlash = 0.12;
        if (o.point) G.fx.sparks(o.point, o.normal || new THREE.Vector3(0, 1, 0), 8, [0.4, 0.85, 1]);
        if (this.shield <= 0) { this.shield = 0; G.sfxAt("shield_break", this.x, this.z, {}); G.fx.explosion(tmp.set(this.x, this.centerY(), this.z), 0.4); G.msg("盾牌破碎！", "info"); }
        this.alerted(true);
        return 0;
      }
    }
    if (o.crit) dmg *= 1.9;
    this.hp -= dmg; this.hitFlash = 0.1;
    this.alerted(true);
    if (this.hp <= 0) { this.die(o); return dmg; }
    if (!this.boss && dmg > this.hpMax * 0.14 && !this.def.static) { this.stagger = 0.22; this.play("Hit", 0.05, true); }
    return dmg;
  }
  alerted(byHit) {
    if (this.dead) return;
    this.awake = true;
    if (this.state === "patrol" || this.state === "idle" || this.state === "spawn") { this.state = "alert"; this.alertT = byHit ? 0.15 : rnd(0.35, 0.7); }
    this.lastSeen = this.G.time;
    if (this.group >= 0 && !this.boss) for (const e of this.G.enemies) if (e !== this && e.group === this.group && !e.dead && (e.state === "patrol" || e.state === "idle")) { e.awake = true; e.state = "alert"; e.alertT = rnd(0.3, 0.9); }
  }
  die(o) {
    this.dead = true; this.state = "dead"; this.deathT = this.boss ? 2.2 : 0.55;
    if (this.laser) this.laser.visible = false;
    this.G.onKill(this, o);
    if (this.mixer) this.play("TurnOff", 0.05, true);
  }
  // --- senses
  canSee(px, pz, dist) {
    const G = this.G, p = G.player;
    let sight = this.def.sight * (p.crouch ? 0.72 : 1) * (p.sprinting ? 1.15 : 1);
    if (this.awake) sight *= 1.5;
    if (dist > sight) return false;
    if (!this.awake && !this.def.static) { const a = Math.atan2(px - this.x, pz - this.z); if (Math.abs(angDiff(this.yaw, a)) > 1.25 && dist > 5) return false; }
    return G.level.los(this.x, this.z, px, pz);
  }
  move(dx, dz, dt) {
    const L = this.G.level, r = this.colR;
    let nx = this.x + dx * dt, nz = this.z + dz * dt;
    if (!L.blocked(nx, this.z, r, this.def.fly ? 0 : 0)) this.x = nx;
    if (!L.blocked(this.x, nz, r, 0)) this.z = nz;
  }
  steerTo(tx, tz, sp, dt) {
    const dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz) || 1;
    this.move(dx / d * sp, dz / d * sp, dt);
    return d;
  }
  chaseStep(dt, mul = 1, directDist = 10) {
    const G = this.G, p = G.player, dx = p.x - this.x, dz = p.z - this.z, d = Math.hypot(dx, dz);
    let tx = p.x, tz = p.z;
    const direct = d < directDist && G.level.los(this.x, this.z, p.x, p.z);
    if (!direct) { const t = G.flow.target(this.x, this.z); if (t) { tx = t[0]; tz = t[1]; } }
    const sp = this.spd * mul;
    const px = this.x, pz = this.z;
    const dd = Math.hypot(tx - this.x, tz - this.z) || 1;
    this.move((tx - this.x) / dd * sp, (tz - this.z) / dd * sp, dt);
    // stuck wiggle
    if (Math.hypot(this.x - px, this.z - pz) < sp * dt * 0.2) { const a = this.yaw + Math.PI / 2 * this.strafeDir; this.move(Math.sin(a) * sp, Math.cos(a) * sp, dt); }
    return d;
  }
  faceTo(tx, tz, dt, k = 8) { const a = Math.atan2(tx - this.x, tz - this.z); this.yaw += angDiff(this.yaw, a) * (1 - Math.exp(-k * dt)); }
  separate(dt) {
    for (const o of this.G.enemies) {
      if (o === this || o.dead || o.def.static) continue;
      const dx = this.x - o.x, dz = this.z - o.z, rr = (this.radius + o.radius) * 0.75, d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-4) { const d = Math.sqrt(d2), f = (rr - d) / rr * 3.5; this.move(dx / d * f, dz / d * f, dt); }
    }
  }
  aimPoint(out) { const p = this.G.player; return out.set(p.x, p.y + (p.crouch ? 0.6 : 1.0), p.z); }
  shoot(speed, dmg, o = {}) {
    const G = this.G, p = G.player;
    const sx = this.x + Math.sin(this.yaw) * this.radius * 0.8, sz = this.z + Math.cos(this.yaw) * this.radius * 0.8, sy = this.def.fly ? this.y + this.def.cy : this.y + (o.y ?? this.h * 0.62);
    const t = this.aimPoint(new THREE.Vector3());
    const dist = Math.hypot(t.x - sx, t.z - sz);
    // light target leading
    speed *= G.diff.pspd;
    const lead = (o.lead ?? 0.35) * G.diff.lead * dist / speed;
    t.x += (p.vx || 0) * lead; t.z += (p.vz || 0) * lead;
    const dir = new THREE.Vector3(t.x - sx, t.y - sy, t.z - sz).normalize();
    const sp = (o.spread ?? 0.02) * G.diff.spread; dir.x += rnd(-sp, sp); dir.y += rnd(-sp, sp); dir.z += rnd(-sp, sp); dir.normalize();
    G.spawnProj({ x: sx, y: sy, z: sz, dx: dir.x, dy: dir.y, dz: dir.z, speed, dmg: dmg * G.diff.dmg * this.dmgMul, color: o.color ?? 0xff4060, size: o.size ?? 0.3, life: o.life ?? 5, owner: this, homing: o.homing, splash: o.splash });
    return dir;
  }
  setEmissive(r, g, b, k) { for (const m of this.mats) { m.emissive.setRGB(r * k, g * k, b * k); m.emissiveIntensity = 1; } }
  clearEmissive() { for (const m of this.mats) { m.emissive.setRGB(0, 0, 0); } }
  // --- main update
  update(dt) {
    const G = this.G, p = G.player;
    this.t += dt;
    if (this.mixer) this.mixer.update(dt);
    if (this.state === "dead") { this.deathT -= dt; const k = Math.max(0, this.deathT / (this.boss ? 2.2 : 0.55)); this.root.position.y += (this.def.fly ? -dt * 4 : 0); this.root.scale.setScalar(Math.max(0.01, k * 0.6 + 0.4 * (k > 0.5 ? 1 : k * 2))); this.setEmissive(1, 0.5, 0.2, (1 - k) * 2); if (this.deathT <= 0) this.remove = true; return; }
    if (this.state === "spawn") {
      this.spawnT -= dt; const k = 1 - Math.max(0, this.spawnT) / 0.9;
      if (!this.spawnFx) { this.spawnFx = true; G.fx.spawnBurst(tmp.set(this.x, 0.5, this.z), this.def.fly ? [1, 0.4, 0.5] : [0.4, 0.9, 1]); G.sfxAt("spawn", this.x, this.z, { vol: 0.6 }); }
      this.model.scale.setScalar(this.def.size * (0.2 + 0.8 * Math.min(1, k * 1.2)));
      this.setEmissive(0.3, 0.9, 1, (1 - k) * 2.5);
      this.syncRoot(dt);
      if (this.spawnT <= 0) { this.model.scale.setScalar(this.def.size); this.clearEmissive(); this.state = this.awake ? "combat" : "patrol"; this.play(this.def.moveAnim || "Idle"); }
      return;
    }
    // hit flash
    if (this.hitFlash > 0) { this.hitFlash -= dt; this.setEmissive(1, 0.9, 0.8, 1.8 * (this.hitFlash / 0.1)); if (this.hitFlash <= 0) this.clearEmissive(); }
    else if (this.windT > 0) { const k = 1 - this.windT / (this.windTotal || 1); this.setEmissive(1, 0.15, 0.05, 0.4 + 1.6 * k * (0.6 + 0.4 * Math.sin(this.t * 30))); }
    if (this.shieldFlash > 0) this.shieldFlash -= dt;
    const dx = p.x - this.x, dz = p.z - this.z, dist = Math.hypot(dx, dz);
    this.losT -= dt;
    if (this.losT <= 0) { this.losT = 0.12 + Math.random() * 0.06; this.seen = !p.dead && this.canSee(p.x, p.z, dist); if (this.seen) { this.lastSeen = G.time; if (!this.awake || this.state === "patrol" || this.state === "idle") this.alerted(false); } }
    if (this.stagger > 0) { this.stagger -= dt; this.syncRoot(dt); return; }
    this.think(dt, dx, dz, dist);
    if (!this.def.static) this.separate(dt);
    this.syncRoot(dt);
  }
  syncRoot(dt) {
    const d = this.def;
    let y = this.y;
    if (d.fly) y += Math.sin(this.t * 2.2 + this.x) * 0.18 + d.cy - this.h / 2 + (this.h > 0 ? 0 : 0);
    this.root.position.set(this.x, y, this.z);
    this.root.rotation.y = this.yaw + this.modelYaw;
  }
  think(dt, dx, dz, dist) {
    const G = this.G, d = this.def;
    if (this.state === "patrol") {
      if (d.static) { this.yaw += dt * 0.5 * Math.sin(this.t * 0.5 + this.x) ; return; }
      this.play(d.fly ? "Idle" : "Walk");
      if (this.waitT > 0) { this.waitT -= dt; this.play("Idle"); return; }
      if (!this.wp) {
        for (let i = 0; i < 6; i++) { const a = Math.random() * 6.28, r = rnd(3, 9), wx = this.homeX + Math.cos(a) * r, wz = this.homeZ + Math.sin(a) * r; if (!G.level.blocked(wx, wz, this.colR + 0.3, 0) && G.level.los(this.x, this.z, wx, wz)) { this.wp = [wx, wz]; break; } }
        if (!this.wp) { this.waitT = 1; return; }
      }
      const dd = this.steerTo(this.wp[0], this.wp[1], this.spd * 0.4, dt); this.faceTo(this.wp[0], this.wp[1], dt, 5);
      if (dd < 0.8) { this.wp = null; this.waitT = rnd(1, 3.5); }
      return;
    }
    if (this.state === "alert") {
      this.faceTo(G.player.x, G.player.z, dt, 14); this.alertT -= dt;
      if (this.alertT <= 0) { this.state = "combat"; this.play(d.moveAnim || "Idle"); G.sfxAt(d.ranged && !d.melee ? "enemy_fire" : "spawn", this.x, this.z, { vol: 0.35, rate: 1.7 }); }
      return;
    }
    // combat
    if (!this.seen && G.time - this.lastSeen > 9 && !this.boss && !d.static) { this.state = "patrol"; this.awake = false; this.homeX = this.x; this.homeZ = this.z; this.wp = null; return; }
    if (d.static) return this.thinkStatic(dt, dx, dz, dist);
    if (d.fly) return this.thinkFlyer(dt, dx, dz, dist);
    if (d.leap || (d.melee && !d.ranged)) return this.thinkMelee(dt, dx, dz, dist);
    return this.thinkHeavy(dt, dx, dz, dist);
  }
  thinkStatic(dt, dx, dz, dist) {
    const d = this.def, G = this.G;
    if (this.seen && dist < d.range) {
      this.faceTo(G.player.x, G.player.z, dt, d.sniper ? 4 : 9);
      this.cd -= dt;
      if (this.burst > 0) {
        this.burstT -= dt;
        if (this.burstT <= 0) { this.burst--; this.burstT = 0.11; this.shoot(d.sniper ? 120 : 24, d.dmg, { color: d.sniper ? 0xff3040 : 0xff8040, size: d.sniper ? 0.2 : 0.22, spread: 0.015, lead: 0.1 }); G.sfxAt(d.sniper ? "enemy_fire_heavy" : "turret_fire", this.x, this.z, { vol: 0.8 }); }
      } else if (this.windT > 0) {
        this.windT -= dt; if (this.laser) { this.updateLaser(); }
        if (this.windT <= 0) { if (this.laser) this.laser.visible = false; this.burst = d.burst || 1; this.burstT = 0; this.clearEmissive(); }
      } else if (this.cd <= 0) { this.windT = this.windTotal = (d.windup) * this.G.diff.wind; this.cd = d.fireCd * this.G.diff.cd * (0.9 + Math.random() * 0.3); if (d.sniper) { G.sfxAt("sniper_charge", this.x, this.z, { vol: 0.8 }); if (this.laser) this.laser.visible = true; } }
    } else { if (this.laser) this.laser.visible = false; if (this.windT > 0) { this.windT = 0; this.clearEmissive(); } }
  }
  updateLaser() {
    const G = this.G, p = G.player, sx = this.x, sy = this.y + this.h * 0.7, sz = this.z;
    const dx = p.x - sx, dy = p.y + 1 - sy, dz = p.z - sz, d = Math.hypot(dx, dy, dz);
    this.laser.position.set(sx, sy, sz); this.laser.lookAt(p.x, p.y + 1, p.z); this.laser.scale.set(1, 1, d); this.laser.material.opacity = 0.3 + 0.6 * (1 - this.windT / this.windTotal);
  }
  thinkFlyer(dt, dx, dz, dist) {
    const d = this.def, G = this.G, p = G.player;
    this.faceTo(p.x, p.z, dt, 9);
    const [kmin, kmax] = d.keep; this.cd -= dt; this.strafeT -= dt;
    if (this.strafeT <= 0) { this.strafeT = rnd(1, 2.5); if (Math.random() < 0.6) this.strafeDir *= -1; }
    let mx = 0, mz = 0; const ux = dx / (dist || 1), uz = dz / (dist || 1);
    if (!this.seen) { this.chaseStep(dt, 1, 4); }
    else {
      if (dist > kmax) { mx += ux; mz += uz; } else if (dist < kmin) { mx -= ux; mz -= uz; }
      mx += -uz * this.strafeDir * 0.8; mz += ux * this.strafeDir * 0.8;
      const l = Math.hypot(mx, mz) || 1; this.move(mx / l * this.spd, mz / l * this.spd, dt);
    }
    if (this.windT > 0) { this.windT -= dt; if (this.windT <= 0) { this.clearEmissive(); this.shoot(15, d.dmg, { color: 0xff5070, size: 0.28 }); G.sfxAt("enemy_fire", this.x, this.z, { vol: 0.8 }); this.play("Attack", 0.05, true); } }
    else if (this.seen && this.cd <= 0 && dist < 28) { this.windT = this.windTotal = (d.windup) * this.G.diff.wind; this.cd = d.fireCd * this.G.diff.cd * rnd(0.8, 1.2); G.sfxAt("enemy_fire", this.x, this.z, { vol: 0.25, rate: 0.6 }); }
  }
  thinkMelee(dt, dx, dz, dist) {
    const d = this.def, G = this.G, p = G.player, m = d.melee;
    this.cd -= dt; this.leapCd -= dt;
    if (this.leapT > 0) {
      this.leapT -= dt; const sp = 15;
      this.move(this.leapV[0] * sp, this.leapV[1] * sp, dt);
      this.y = Math.max(0, Math.sin((1 - this.leapT / 0.5) * Math.PI) * 1.4);
      if (!this.leapHit && dist < this.radius + 0.9 && p.y < this.y + 1.2) { this.leapHit = true; G.damagePlayer(d.leap.dmg * G.diff.dmg, this.x, this.z, "melee"); }
      if (this.leapT <= 0) { this.y = 0; this.play(d.moveAnim); this.cd = 0.4; }
      return;
    }
    if (this.windT > 0) {
      this.windT -= dt; this.faceTo(p.x, p.z, dt, 12);
      if (this.windT <= 0) {
        this.clearEmissive();
        if (this.pendingLeap) { this.pendingLeap = false; this.leapT = 0.5; this.leapHit = false; const l = Math.hypot(dx, dz) || 1; this.leapV = [dx / l, dz / l]; this.play("Charge", 0.05, true); G.sfxAt("boss_slam", this.x, this.z, { vol: 0.35, rate: 1.8 }); }
        else if (dist < m.range + this.radius * 0.6 + 0.5) { G.damagePlayer(m.dmg * G.diff.dmg, this.x, this.z, "melee"); G.sfxAt("hit_armor", this.x, this.z, { vol: 0.6, rate: 0.8 }); }
        this.play(d.moveAnim, 0.1);
      }
      return;
    }
    this.faceTo(p.x, p.z, dt, 10);
    if (d.leap && this.leapCd <= 0 && this.seen && dist > d.leap.min && dist < d.leap.max) { this.windT = this.windTotal = (0.35) * this.G.diff.wind; this.pendingLeap = true; this.leapCd = d.leap.cd * rnd(0.8, 1.3); this.play("Attack", 0.05, true); return; }
    if (dist < m.range + this.radius * 0.6) { if (this.cd <= 0) { this.windT = this.windTotal = (m.windup) * this.G.diff.wind; this.cd = m.cd * this.G.diff.cd; this.play("Attack", 0.05, true); } return; }
    this.play(d.moveAnim, 0.25);
    this.chaseStep(dt, 1, 12);
  }
  thinkHeavy(dt, dx, dz, dist) {
    const d = this.def, G = this.G, p = G.player;
    this.cd -= dt;
    if (this.coverT > 0) {
      this.coverT -= dt;
      if (this.cover) { const dd = this.steerTo(this.cover[0], this.cover[1], this.spd * 1.3, dt); this.faceTo(this.cover[0], this.cover[1], dt, 8); if (dd < 0.7) { this.cover = null; this.play("Idle", 0.2); } }
      else this.faceTo(p.x, p.z, dt, 5);
      return;
    }
    if (this.burst > 0) {
      this.faceTo(p.x, p.z, dt, 12); this.burstT -= dt;
      if (this.burstT <= 0) { this.burst--; this.burstT = 0.2; this.shoot(17, d.dmg, { color: 0xff6030, size: 0.34, spread: 0.03 }); G.sfxAt("enemy_fire_heavy", this.x, this.z, { vol: 0.8 }); this.play("AttackAuto", 0.05, true); if (this.burst === 0 && d.cover && Math.random() < 0.55) this.takeCover(); }
      return;
    }
    if (this.windT > 0) { this.windT -= dt; this.faceTo(p.x, p.z, dt, 12); if (this.windT <= 0) { this.clearEmissive(); if (this.pendingMelee) { this.pendingMelee = false; if (dist < d.melee.range + this.radius * 0.7 + 0.6) { G.damagePlayer(d.melee.dmg * G.diff.dmg, this.x, this.z, "melee"); G.sfxAt("boss_slam", this.x, this.z, { vol: 0.5 }); G.shake(0.2); } } else { this.burst = d.burst || 3; this.burstT = 0; } } return; }
    const [kmin, kmax] = d.keep || [0, 99];
    this.faceTo(p.x, p.z, dt, 8);
    if (d.melee && dist < d.melee.range + this.radius * 0.7 && this.cd <= 0) { this.windT = this.windTotal = (d.melee.windup) * this.G.diff.wind; this.pendingMelee = true; this.cd = d.melee.cd * this.G.diff.cd; this.play("Attack", 0.05, true); return; }
    if (d.ranged && this.seen && dist < kmax + 6 && this.cd <= 0 && dist > 3) { this.windT = this.windTotal = (d.windup) * this.G.diff.wind; this.cd = d.fireCd * this.G.diff.cd * rnd(0.85, 1.2); this.play("Idle", 0.1); return; }
    // move
    this.strafeT -= dt; if (this.strafeT <= 0) { this.strafeT = rnd(1, 2.2); this.strafeDir *= Math.random() < 0.5 ? -1 : 1; }
    this.play(d.moveAnim, 0.25);
    if (d.ranged && this.seen && dist < kmax && dist > kmin) {
      const ux = dx / dist, uz = dz / dist; this.move(-uz * this.strafeDir * this.spd * 0.7, ux * this.strafeDir * this.spd * 0.7, dt);
    } else if (d.ranged && this.seen && dist < kmin) { const ux = dx / dist, uz = dz / dist; this.move(-ux * this.spd * 0.8, -uz * this.spd * 0.8, dt); }
    else this.chaseStep(dt, d.shield ? 1.05 : 1, 10);
  }
  takeCover() {
    const G = this.G, p = G.player, L = G.level; let best = null, bd = 1e9;
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * 6.28, r = rnd(5, 12), cx = this.x + Math.cos(a) * r, cz = this.z + Math.sin(a) * r;
      if (L.blocked(cx, cz, this.colR + 0.2, 0)) continue; if (L.los(cx, cz, p.x, p.z)) continue; if (!L.los(this.x, this.z, cx, cz)) continue;
      const dd = Math.hypot(cx - this.x, cz - this.z); if (dd < bd) { bd = dd; best = [cx, cz]; }
    }
    if (best) { this.cover = best; this.coverT = rnd(2.2, 3.6); this.play(this.def.moveAnim, 0.2); }
  }
  dispose() {
    const G = this.G; G.scene.remove(this.root);
    if (this.laser) { G.scene.remove(this.laser); this.laser.material.dispose(); }
    for (const m of this.mats) m.dispose();
  }
}

// ======================================================================= BOSSES
export class Boss extends Enemy {
  constructor(G, bid, tpl, o) {
    const b = BOSS[bid];
    const def = Object.assign({}, b, { boss: true, id: bid, fly: bid === "core", sight: 200, moveAnim: bid === "hunter" ? "Run" : bid === "warden" ? "Walk" : "Idle", static: false, colR: bid === "core" ? 0.5 : bid === "warden" ? 1.5 : 1.2 });
    super(G, def, tpl, Object.assign({ instant: false, awake: true }, o));
    this.active = false; this.invuln = true; this.bid = bid; this.phase = 1; this.atk = null; this.atkCd = 2.2; this.summonCd = 8; this.invuln = false; this.homeX = this.x; this.homeZ = this.z;
    this.state = "spawn"; this.spawnT = 1.4; this.hpFrac = 1; this.dmgMul = 1;
    this.arenaX = o.arenaX ?? this.x; this.arenaZ = o.arenaZ ?? this.z; this.arenaR = o.arenaR ?? 20;
    if (bid === "core") { this.hitY0 = def.cy - this.h / 2; }
  }
  activate() { this.active = true; this.invuln = this.bid === "core" ? this.G.pylonsLeft > 0 : false; this.atkCd = 1.8; this.G.sfx("boss_roar", { vol: 1 }); }
  think(dt, dx, dz, dist) {
    const G = this.G, p = G.player;
    if (!this.active) { this.faceTo(p.x, p.z, dt, 1.5); if (this.bid === "core") this.invuln = true; return; }
    this.hpFrac = this.hp / this.hpMax;
    const np = this.hpFrac < 0.33 ? 3 : this.hpFrac < 0.66 ? 2 : 1;
    if (np !== this.phase) { this.phase = np; this.onPhase(np); }
    this.atkCd -= dt; this.summonCd -= dt;
    this["think_" + this.bid](dt, dx, dz, dist);
  }
  onPhase(n) {
    const G = this.G; G.sfx("boss_roar", { vol: 1 }); G.shake(0.6); G.msg(n === 2 ? "⚠ " + this.def.name + " 進入第二階段！" : "⚠ " + this.def.name + " 暴走了！", "warn");
    G.fx.explosion({ x: this.x, y: this.def.cy, z: this.z }, 1.4); this.atk = null; this.windT = 0; this.clearEmissive(); this.atkCd = 1.6;
    if (this.bid === "warden" && n >= 2) this.summon("drone", 2 + n);
    if (this.bid === "hunter" && n >= 2) this.summon("quad", 2);
    if (this.bid === "core") { this.summon("drone", 3); }
    if (this.bid === "warden" && n === 3) { this.spd *= 1.35; }
    if (this.bid === "hunter" && n === 3) { this.spd *= 1.25; }
    if (this.bid === "warden") this.dmgMul = n === 3 ? 1.4 : 1;
  }
  summon(type, n) {
    const G = this.G; n = Math.max(1, Math.round(n * G.diff.amb));
    for (let i = 0; i < n; i++) {
      for (let tries = 0; tries < 10; tries++) {
        const a = Math.random() * 6.28, r = rnd(5, Math.min(11, this.arenaR - 1)), x = this.arenaX + Math.cos(a) * r, z = this.arenaZ + Math.sin(a) * r;
        if (!G.level.blocked(x, z, 1.2, 0)) { G.addEnemy(type, x, z, { awake: true, hpMul: 0.8 }); break; }
      }
    }
    G.sfx("alarm", { vol: 0.5 });
  }
  clampArena() {
    const dx = this.x - this.arenaX, dz = this.z - this.arenaZ, d = Math.hypot(dx, dz), R = this.arenaR - this.colR - 1;
    if (d > R) { this.x = this.arenaX + dx / d * R; this.z = this.arenaZ + dz / d * R; }
  }
  fan(n, arc, speed, dmg, o) {
    const G = this.G, p = G.player;
    const sx = this.x, sz = this.z, sy = this.y + (this.def.fly ? this.def.cy : this.h * 0.6);
    const base = Math.atan2(p.x - sx, p.z - sz);
    const tp = new THREE.Vector3(p.x, p.y + 1, p.z); const dyBase = (tp.y - sy) / Math.max(1, Math.hypot(p.x - sx, p.z - sz));
    for (let i = 0; i < n; i++) {
      const a = base + (n === 1 ? 0 : (i / (n - 1) - 0.5) * arc);
      G.spawnProj({ x: sx + Math.sin(a) * this.radius * 0.6, y: sy, z: sz + Math.cos(a) * this.radius * 0.6, dx: Math.sin(a), dy: dyBase * 0.8, dz: Math.cos(a), speed, dmg: dmg * G.diff.dmg * this.dmgMul, color: o.color ?? 0xff4060, size: o.size ?? 0.45, life: 6, owner: this, homing: o.homing });
    }
    G.sfx("enemy_fire_heavy", { vol: 0.9 });
  }
  ring(n, speed, dmg, o = {}) {
    const G = this.G, sy = this.y + (this.def.fly ? this.def.cy : 1.2), off = o.off || 0;
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + off; G.spawnProj({ x: this.x + Math.sin(a) * this.radius, y: sy, z: this.z + Math.cos(a) * this.radius, dx: Math.sin(a), dy: 0, dz: Math.cos(a), speed, dmg: dmg * G.diff.dmg * this.dmgMul, color: o.color ?? 0xff7a30, size: 0.42, life: 7, owner: this }); }
    G.sfx("enemy_fire_heavy", { vol: 0.8, rate: 0.8 });
  }
  // ---- Warden: slow heavy walker
  think_warden(dt, dx, dz, dist) {
    const G = this.G, p = G.player;
    if (!this.atk) {
      this.faceTo(p.x, p.z, dt, 5);
      if (dist > 9) { this.play("Walk", 0.3); const t = G.flow.target(this.x, this.z); const direct = G.level.los(this.x, this.z, p.x, p.z); const tx = direct || !t ? p.x : t[0], tz = direct || !t ? p.z : t[1]; const dd = Math.hypot(tx - this.x, tz - this.z) || 1; this.move((tx - this.x) / dd * this.spd, (tz - this.z) / dd * this.spd, dt); }
      else if (dist < 5) { this.play("Idle", 0.3); }
      else this.play("Idle", 0.3);
      this.clampArena();
      if (this.atkCd <= 0) {
        let pick_ = ["volley", "volley"]; if (dist < 7) pick_.push("swipe", "swipe"); if (this.phase >= 2) pick_.push("slam", "slam"); if (this.phase >= 3) pick_.push("spiral", "spiral");
        const k = pick(pick_); this.atk = { k, t: 0, n: 0 }; this.windT = this.windTotal = (k === "slam" ? 1.1 : k === "swipe" ? 0.5 : 0.7) * this.G.diff.wind;
        if (k === "slam") { this.play("Attack", 0.1, true); G.sfx("boss_charge", { vol: 0.9 }); G.telegraph(this.x, this.z, 12, 1.1, 0xff3030, () => this.doSlam()); }
        else if (k === "swipe") this.play("Attack", 0.05, true); else if (k === "spiral") G.sfx("boss_charge", { vol: 0.8, rate: 1.3 }); else this.play("AttackAuto", 0.1, true);
      }
      return;
    }
    const a = this.atk; this.faceTo(p.x, p.z, dt, a.k === "slam" ? 1 : 6);
    if (a.k === "volley") { this.windT -= dt; if (this.windT <= 0) { this.clearEmissive(); a.t += dt; if (a.t >= (a.n === 0 ? 0 : 0.5)) { a.t = 0; a.n++; this.fan(this.phase === 1 ? 3 : 5, this.phase === 1 ? 0.5 : 0.9, 14 + this.phase * 2, 11, { color: 0xff5a30 }); if (a.n >= (this.phase === 3 ? 4 : 3)) this.endAtk(1.6); } } }
    else if (a.k === "swipe") { this.windT -= dt; if (this.windT <= 0) { this.clearEmissive(); if (dist < 7.5) { G.damagePlayer(30 * G.diff.dmg, this.x, this.z, "melee"); G.shake(0.5); } G.sfx("boss_slam", { vol: 0.9 }); G.fx.ring({ x: this.x, y: 0, z: this.z }, 8, 0xff6030, 0.4); this.endAtk(1.2); } }
    else if (a.k === "slam") { this.windT -= dt; if (this.windT <= 0) { this.clearEmissive(); this.endAtk(1.8); } }
    else if (a.k === "spiral") { this.windT -= dt; if (this.windT <= 0) { this.clearEmissive(); a.t += dt; if (a.t >= 0.28) { a.t = 0; a.n++; this.ring(8, 11, 9, { off: a.n * 0.33 }); if (a.n >= 7) this.endAtk(2); } } }
  }
  doSlam() {
    const G = this.G; G.sfx("boss_slam", { vol: 1 }); G.shake(0.9); G.fx.explosion({ x: this.x, y: 0.4, z: this.z }, 0.9);
    G.shockwave(this.x, this.z, 13, 28, this);
  }
  endAtk(cd) { this.atk = null; this.atkCd = (cd * (this.phase === 3 ? 0.6 : 1) + rnd(0, 0.5)) * this.G.diff.bossCd; this.windT = 0; this.clearEmissive(); }
  // ---- Hunter: fast stalker; dash charges + spit fans
  think_hunter(dt, dx, dz, dist) {
    const G = this.G, p = G.player;
    if (this.state === "dead") return;
    if (!this.atk) {
      this.faceTo(p.x, p.z, dt, 8); this.strafeT -= dt; if (this.strafeT <= 0) { this.strafeT = rnd(0.8, 1.8); this.strafeDir *= Math.random() < 0.5 ? -1 : 1; }
      this.play("Run", 0.2);
      const ux = dx / (dist || 1), uz = dz / (dist || 1);
      if (dist > 12) this.chaseStep(dt, 1, 14); else if (dist < 6) this.move(-ux * this.spd * 0.6 - uz * this.strafeDir * this.spd * 0.5, -uz * this.spd * 0.6 + ux * this.strafeDir * this.spd * 0.5, dt); else this.move(-uz * this.strafeDir * this.spd * 0.8, ux * this.strafeDir * this.spd * 0.8, dt);
      this.clampArena();
      if (this.atkCd <= 0 && this.seen) {
        const opts = ["fan", "charge", "charge"]; if (this.phase >= 2) opts.push("burst", "leapcombo"); const k = pick(opts);
        this.atk = { k, t: 0, n: 0 }; this.windT = this.windTotal = (k === "charge" ? 0.8 : 0.55) * this.G.diff.wind; this.play("Charge", 0.1, true);
        if (k === "charge") { G.sfx("boss_charge", { vol: 0.8, rate: 1.4 }); this.atk.dir = [dx / dist, dz / dist]; G.telegraphLine(this.x, this.z, this.atk.dir[0], this.atk.dir[1], 24, 0.8); }
      }
      return;
    }
    const a = this.atk;
    if (a.k === "fan") { this.faceTo(p.x, p.z, dt, 10); this.windT -= dt; if (this.windT <= 0) { this.clearEmissive(); if (a.t === 0 || a.t > 0.25) { a.t = 0.001; a.n++; this.fan(5, 0.8, 16, 9, { color: 0xb060ff }); if (a.n >= (this.phase >= 3 ? 3 : 2)) this.endAtk(1.4); } else a.t += dt; } }
    else if (a.k === "burst") { this.faceTo(p.x, p.z, dt, 10); this.windT -= dt; if (this.windT <= 0) { this.clearEmissive(); a.t += dt; if (a.t > 0.12) { a.t = 0; a.n++; this.fan(1, 0, 24, 9, { color: 0xc080ff, size: 0.35 }); if (a.n >= 8) this.endAtk(1.5); } } }
    else if (a.k === "charge" || a.k === "leapcombo") {
      if (this.windT > 0) { this.windT -= dt; this.faceTo(this.x + a.dir[0], this.z + a.dir[1], dt, 16); if (this.windT <= 0) { this.clearEmissive(); a.go = 0.55; G.sfx("boss_slam", { vol: 0.5, rate: 1.6 }); this.play("Run", 0.05); } }
      else { a.go -= dt; const sp = 26; this.move(a.dir[0] * sp, a.dir[1] * sp, dt); if (!a.hit && dist < this.radius + 1.0) { a.hit = true; G.damagePlayer(28 * G.diff.dmg, this.x, this.z, "melee"); G.shake(0.5); } if (a.go <= 0) { if (a.k === "leapcombo" && a.n < 1) { a.n++; a.hit = false; this.windT = this.windTotal = (0.4) * this.G.diff.wind; a.dir = [dx / dist, dz / dist]; G.telegraphLine(this.x, this.z, a.dir[0], a.dir[1], 22, 0.4); } else this.endAtk(1.4); } }
    }
    if (this.summonCd <= 0 && this.phase >= 2) { this.summonCd = 18; this.summon("quad", 2); }
    this.clampArena();
  }
  // ---- Core: floating eye, shielded until pylons are down
  think_core(dt, dx, dz, dist) {
    const G = this.G, p = G.player;
    this.invuln = G.pylonsLeft > 0;
    this.faceTo(p.x, p.z, dt, 3);
    this.y = 0; this.model.position.y = 0;
    this.play("Idle", 0.3);
    // slow drift around the arena centre
    const ang = this.t * 0.25; const tx = this.arenaX + Math.cos(ang) * 6, tz = this.arenaZ + Math.sin(ang) * 6; this.x += (tx - this.x) * dt * 0.8; this.z += (tz - this.z) * dt * 0.8;
    if (this.invuln) { this.setEmissive(0.2, 0.6, 1, 0.5 + 0.2 * Math.sin(this.t * 4)); }
    else if (this.windT <= 0 && this.hitFlash <= 0) this.clearEmissive();
    if (!this.atk) {
      if (this.atkCd <= 0 && this.seen !== undefined) {
        const opts = ["fan", "fan", "meteor"]; if (this.phase >= 2) opts.push("beam", "spiral"); if (this.phase >= 3) opts.push("meteor", "spiral", "beam"); const k = G.pylonsLeft > 0 ? pick(["fan", "spiral"]) : pick(opts);
        this.atk = { k, t: 0, n: 0 }; this.windT = this.windTotal = (k === "beam" ? 1.2 : 0.7) * this.G.diff.wind; G.sfx("boss_charge", { vol: 0.8 });
        if (k === "beam") { this.atk.ang = Math.atan2(p.x - this.x, p.z - this.z) - 0.9; this.atk.sweep = 1.8 * (Math.random() < 0.5 ? 1 : -1); if (this.atk.sweep < 0) this.atk.ang += 1.8; }
      }
      return;
    }
    const a = this.atk;
    if (a.k === "fan") { this.windT -= dt; if (this.windT <= 0) { this.clearEmissive(); a.t += dt; if (a.t > 0.5 || a.n === 0) { a.t = 0; a.n++; this.fan(this.phase >= 2 ? 7 : 5, 1.0, 15, 10, { color: 0xff3a8a, size: 0.5 }); if (a.n >= (this.phase === 3 ? 4 : 3)) this.endAtk(1.7); } } }
    else if (a.k === "spiral") { this.windT -= dt; if (this.windT <= 0) { this.clearEmissive(); a.t += dt; if (a.t > 0.22) { a.t = 0; a.n++; this.ring(10, 10, 8, { color: 0xb04cff, off: a.n * 0.4 }); if (a.n >= 9) this.endAtk(1.8); } } }
    else if (a.k === "meteor") { this.windT -= dt; if (this.windT <= 0) { this.clearEmissive(); a.t += dt; if (a.t > 0.35) { a.t = 0; a.n++; const r = rnd(0, 9), an = Math.random() * 6.28; const mx = a.n % 2 ? p.x + Math.cos(an) * r * 0.4 : this.arenaX + Math.cos(an) * r, mz = a.n % 2 ? p.z + Math.sin(an) * r * 0.4 : this.arenaZ + Math.sin(an) * r; G.telegraph(mx, mz, 3.4, 1.0, 0xff3a8a, () => G.explodeAt(mx, 0.5, mz, 3.6, 28, this, true)); if (a.n >= 9) this.endAtk(2.2); } } }
    else if (a.k === "beam") {
      if (this.windT > 0) { this.windT -= dt; G.telegraphLine(this.x, this.z, Math.sin(a.ang), Math.cos(a.ang), 40, 0.05, 1); if (this.windT <= 0) { this.clearEmissive(); a.on = 1.8 / Math.abs(a.sweep) * 1.0; G.beam.start(); } }
      else {
        a.ang += a.sweep * dt * 0.55; a.on -= dt; const dx2 = Math.sin(a.ang), dz2 = Math.cos(a.ang);
        G.beam.set(this.x, this.def.cy * 0.7, this.z, dx2, dz2);
        // hit test: distance from player to the ray in XZ
        const rx = p.x - this.x, rz = p.z - this.z, along = rx * dx2 + rz * dz2, perp = Math.abs(rx * dz2 - rz * dx2);
        if (along > 0 && perp < 1.1 && p.y < 1.6) { a.tick = (a.tick || 0) - dt; if (a.tick <= 0) { a.tick = 0.25; G.damagePlayer(9 * G.diff.dmg, this.x, this.z, "beam"); } }
        if (a.on <= 0) { G.beam.stop(); this.endAtk(2); }
      }
    }
    if (this.summonCd <= 0 && this.phase >= 2) { this.summonCd = 16; this.summon("drone", this.phase === 3 ? 3 : 2); }
  }
  die(o) { if (this.G.beam) this.G.beam.stop(); super.die(o); }
}
export { BOSS, ENEMY };
