import * as THREE from "three";
import { cloneNode, normalise } from "./assets.js";
import { CELL } from "./level.js";
import { BOSS, ENEMY } from "./data.js";
import { rnd, pick, fmtTime, clamp } from "./util.js";
import { save } from "./save.js";
import * as A from "./audio.js";

const V3 = THREE.Vector3;
export class Objectives {
  constructor(G, def, surv) {
    this.G = G; this.def = def; this.surv = surv; this.i = 0; this.objs = []; this.markersList = []; this.done = false; this.ambushes = 0; this.dispose_ = [];
    this.wave = 0;
    G.pylonsLeft = 0; G.boss = null;
    if (surv) { this.initSurvival(); return; }
    const L = G.level, M = G.M, K = G.models.kenney;
    for (const o of def.objectives) {
      const ob = { t: o.t, n: o.n || 0, c: 0, sec: o.sec || 0, done: false };
      if (o.t === "gens") {
        for (const c of M.gens || []) { const [x, z] = L.cellCenter(c.cx, c.cz); const n = normalise(cloneNode(K, "machine_generatorLarge"), 3.4); n.wrap.position.set(x, 0, z); n.wrap.traverse((q) => { if (q.isMesh) { q.castShadow = true; q.material = q.material.clone(); } }); G.scene.add(n.wrap); const t = G.addTarget({ x, z, r: 1.45, h: n.size.y, hp: Math.round(420 * G.diff.gen), obj: n.wrap, active: true, kind: "gen", onDestroy: () => { ob.c++; this.progress(ob); } }); this.addGlow(t, x, z, n.size.y, [1, 0.5, 0.15]); }
        ob.n = (M.gens || []).length;
      } else if (o.t === "pylons") {
        for (const c of M.pylons || []) { const [x, z] = L.cellCenter(c.cx, c.cz); const n = normalise(cloneNode(K, "rock_crystalsLargeA"), 4.4); n.wrap.position.set(x, 0, z); n.wrap.traverse((q) => { if (q.isMesh) { q.material = q.material.clone(); q.material.color.set(0xff5ad0); q.material.emissive = new THREE.Color(0.9, 0.1, 0.6); q.material.emissiveIntensity = 1.2; } }); G.scene.add(n.wrap); const t = G.addTarget({ x, z, r: 1.3, h: 4.4, hp: Math.round(700 * G.diff.gen), obj: n.wrap, active: true, kind: "pylon", onDestroy: () => { ob.c++; G.pylonsLeft--; this.progress(ob); this.reinforce(2); if (G.boss && !G.boss.dead && G.boss.active) G.boss.invuln = G.pylonsLeft > 0; if (G.pylonsLeft === 0) { G.msg("核心護盾已解除！", "warn"); G.hud.banner("護盾解除", "全力攻擊核心！"); } } }); this.addGlow(t, x, z, 4.4, [1, 0.2, 0.7]); G.pylonsLeft++; }
        ob.n = (M.pylons || []).length;
      } else if (o.t === "keys") {
        ob.items = []; for (const c of M.keys || []) { const [x, z] = L.cellCenter(c.cx, c.cz); const g = new THREE.Group(); const n = normalise(cloneNode(G.models.props, "Prop_KeyCard"), 1.0, { center: true }); g.add(n.wrap); const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.glowTex, color: 0xff4050, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.8, toneMapped: false })); sp.scale.setScalar(2.2); g.add(sp); const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 9, 8, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.2, 0.3), transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide })); beam.position.y = 4; g.add(beam); g.position.set(x, 1.1, z); G.scene.add(g); ob.items.push({ x, z, g, got: false }); this.dispose_.push(g); }
        ob.n = (M.keys || []).length;
      } else if (o.t === "pods") {
        ob.items = []; for (const c of M.pods || []) { const [x, z] = L.cellCenter(c.cx, c.cz); const g = new THREE.Group(); const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 2.6, 18, 1, true), new THREE.MeshStandardMaterial({ color: 0xa0f0ff, transparent: true, opacity: 0.25, roughness: 0.05, emissive: 0x2090c0, emissiveIntensity: 0.6, depthWrite: false, side: THREE.DoubleSide })); glass.position.y = 1.5; const baseM = new THREE.MeshStandardMaterial({ color: 0x2a323c, metalness: 0.9, roughness: 0.35 }); const b1 = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.3, 0.25, 18), baseM); b1.position.y = 0.12; const b2 = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.0, 0.25, 18), baseM); b2.position.y = 2.85; g.add(glass, b1, b2); const an = normalise(cloneNode(K, Math.random() < 0.5 ? "astronautA" : "astronautB"), 1.7); an.wrap.position.y = 0.3; g.add(an.wrap); const ring = new THREE.Mesh(new THREE.RingGeometry(2.7, 3.0, 40), new THREE.MeshBasicMaterial({ color: 0x44ffcc, transparent: true, opacity: 0.45, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; g.add(ring); const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.glowTex, color: 0x44ffcc, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.5, toneMapped: false })); sp.scale.setScalar(3.5); sp.position.y = 1.5; g.add(sp); g.position.set(x, 0, z); G.scene.add(g); L.colliders.push({ x, z, r: 1.15, h: 3 }); ob.items.push({ x, z, g, an: an.wrap, glass, ring, prog: 0, got: false }); this.dispose_.push(g); }
        ob.n = (M.pods || []).length;
      } else if (o.t === "hold") {
        const [x, z] = L.cellCenter(M.beacon.cx, M.beacon.cz); ob.x = x; ob.z = z; ob.R = 11; ob.time = 0; ob.waveT = 6; ob.waves = 0;
        const g = new THREE.Group(); const n = normalise(cloneNode(K, "machine_wireless"), 4.2); g.add(n.wrap);
        const ring = new THREE.Mesh(new THREE.RingGeometry(ob.R - 0.25, ob.R, 72), new THREE.MeshBasicMaterial({ color: 0x44ddff, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; g.add(ring);
        const disc = new THREE.Mesh(new THREE.CircleGeometry(ob.R, 48), new THREE.MeshBasicMaterial({ color: 0x44ddff, transparent: true, opacity: 0.06, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending })); disc.rotation.x = -Math.PI / 2; disc.position.y = 0.05; g.add(disc);
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 30, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0x66ddff, transparent: true, opacity: 0.25, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); beam.position.y = 15; g.add(beam);
        g.position.set(x, 0, z); G.scene.add(g); ob.g = g; ob.ring = ring; ob.disc = disc; this.dispose_.push(g); L.colliders.push({ x, z, r: 1.0, h: 4 });
      } else if (o.t === "boss") {
        const a = M.arena, [x, z] = L.cellCenter(a.cx, a.cz); ob.x = x; ob.z = z; ob.R = a.r * CELL; ob.bid = o.boss;
        ob.boss = G.addBoss(o.boss, x, z, { arenaX: x, arenaZ: z, arenaR: ob.R, instant: false });
        ob.boss.homeX = x; ob.boss.homeZ = z; ob.started = false;
      } else if (o.t === "reach") {
        const [x, z] = L.cellCenter(M.exit.cx, M.exit.cz); ob.x = x; ob.z = z;
        const g = new THREE.Group(); const ring = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.1, 8, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.85, 0.3).multiplyScalar(2.2), toneMapped: false })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.12; g.add(ring);
        const ring2 = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.06, 8, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.6, 0.2).multiplyScalar(2), toneMapped: false })); ring2.rotation.x = Math.PI / 2; ring2.position.y = 0.12; g.add(ring2);
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 40, 20, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.75, 0.25), transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide })); beam.position.y = 20; g.add(beam);
        g.position.set(x, 0, z); g.visible = false; G.scene.add(g); ob.g = g; ob.ring = ring; ob.ring2 = ring2; this.dispose_.push(g);
      }
      this.objs.push(ob);
    }
    this.enter();
  }
  addGlow(t, x, z, h, col) {
    const G = this.G; const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.glowTex, color: new THREE.Color(col[0], col[1], col[2]), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.55, toneMapped: false })); sp.scale.setScalar(5); sp.position.set(0, h * 0.6, 0); t.obj.add(sp);
    const pl = new THREE.PointLight(new THREE.Color(col[0], col[1], col[2]), 0, 14, 2); G.scene.add(pl); pl.position.set(x, h * 0.6, z); t.light = pl; this.dispose_.push(pl);
    t.update = (dt) => { sp.material.opacity = 0.4 + Math.sin(G.time * 3 + x) * 0.15; };
  }
  get cur() { return this.objs[this.i]; }
  title() { if (this.surv) return "無盡生存"; const o = this.cur; return o ? { reach: "前往撤離點", gens: "摧毀發電機", keys: "取得權限卡", hold: "固守訊號塔", pods: "解救研究員", pylons: "摧毀能量柱", boss: "擊敗首領" }[o.t] : "完成"; }
  text() {
    if (this.surv) { return this.waveText || "準備迎戰"; }
    const o = this.cur; if (!o) return "";
    switch (o.t) {
      case "reach": return "抵達地圖上的金色撤離點";
      case "gens": return `發電機 ${o.c} / ${o.n}`;
      case "pylons": return `能量柱 ${o.c} / ${o.n}` + (o.c >= o.n ? " — 核心護盾已解除" : "");
      case "keys": return `權限卡 ${o.c} / ${o.n}` + (o.c >= o.n ? " — 前往深層閘門" : "");
      case "pods": return `已解救 ${o.c} / ${o.n}　靠近休眠艙並停留`;
      case "hold": return o.inside ? `訊號穩定　剩餘 ${fmtTime(o.sec - o.time)}` : "回到訊號範圍內！";
      case "boss": return o.boss && o.boss.active ? BOSS[o.bid].name : "進入競技場";
    }
    return "";
  }
  frac() { if (this.surv) return this.waveFrac || 0; const o = this.cur; if (!o) return 1; if (o.t === "hold") return o.time / o.sec; if (o.t === "boss") return o.boss && o.boss.active ? 1 - o.boss.hp / o.boss.hpMax : 0; if (o.n) return o.c / o.n; return 0; }
  progress(ob) {
    const G = this.G; G.sfx("objective", { vol: 0.8 });
    if (ob.c >= ob.n) { this.complete(ob); } else { G.msg(`${this.title()} ${ob.c} / ${ob.n}`, "good"); G.hud.setObjective(this.title(), this.text(), this.frac()); }
  }
  enter() {
    const o = this.cur, G = this.G; if (!o) return;
    if (o.t === "reach") { o.g.visible = true; G.sfx("objective", { vol: 0.6 }); }
    if (o.t === "hold") { G.hud.banner("固守訊號塔", "待在範圍內撐過 " + o.sec + " 秒"); }
    G.hud.setObjective(this.title(), this.text(), this.frac());
  }
  complete(ob) {
    const G = this.G; ob.done = true; G.sfx("objective", { vol: 1 }); G.hud.banner("目標完成", this.title());
    if (ob.t === "keys") { G.level.openDoors(); G.sfx("door_open", { vol: 1 }); G.shake(0.5); G.msg("深層閘門已開啟", "warn"); G.flow.dirty = true; }
    this.i++;
    if (this.i >= this.objs.length) { this.done = true; setTimeout(() => G.completeMission(), 400); return; }
    this.enter();
  }
  reinforce(n) {
    const G = this.G, L = G.level, p = G.player; let spawned = 0;
    for (let t = 0; t < 40 && spawned < n; t++) {
      const c = pick(G.M.open); if (!c) break; const [x, z] = L.cellCenter(c.cx, c.cz); const d = Math.hypot(x - p.x, z - p.z); if (d < 14 || d > 36) continue; if (L.los(x, z, p.x, p.z) && d < 20) continue;
      const type = pick(["drone", "quad", "quad", "drone", this.def.lvl >= 3 ? "tri" : "quad"]); G.addEnemy(type, x, z, { awake: true, hpMul: 0.9 }); spawned++;
    }
    if (spawned) G.sfx("alarm", { vol: 0.35 });
  }
  onCheckpoint(i) {
    const G = this.G; if (this.surv) return;
    if (this.ambushes < Math.ceil((this.def.ambush || 0) * G.diff.amb) && !(this.cur && this.cur.t === "boss")) { this.ambushes++; G.hud.banner("⚠ 伏擊", "敵人包圍了你！"); this.reinforce(Math.max(2, Math.round((3 + this.def.lvl) * G.diff.amb))); G.sfx("alarm", { vol: 0.6 }); }
  }
  onKill(e) {
    if (this.surv) { this.alive = Math.max(0, this.alive - 1); return; }
    const o = this.cur; if (o && o.t === "boss" && e.boss && e === o.boss) { this.G.hud.hideBoss(); A.playMusic(this.G.theme.music, { fade: 3 }); this.complete(o); }
  }
  markers() {
    if (this.surv) return [];
    const o = this.cur; if (!o) return []; const out = [];
    if (o.t === "reach") out.push({ x: o.x, z: o.z });
    if (o.t === "gens" || o.t === "pylons") for (const t of this.G.targets) if (!t.dead && t.kind === (o.t === "gens" ? "gen" : "pylon")) out.push({ x: t.x, z: t.z });
    if (o.t === "keys") { for (const k of o.items) if (!k.got) out.push({ x: k.x, z: k.z }); if (o.c >= o.n) { const d = this.G.M.doors[0]; if (d) { const [x, z] = this.G.level.cellCenter(d.cx, d.cz); out.push({ x, z }); } } }
    if (o.t === "pods") for (const k of o.items) if (!k.got) out.push({ x: k.x, z: k.z });
    if (o.t === "hold") out.push({ x: o.x, z: o.z });
    if (o.t === "boss") out.push({ x: o.boss && o.boss.active ? o.boss.x : o.x, z: o.boss && o.boss.active ? o.boss.z : o.z });
    return out;
  }
  waypoint() { const m = this.markers(); const p = this.G.player; let best = null, bd = 1e9; for (const k of m) { const d = Math.hypot(k.x - p.x, k.z - p.z); if (d < bd) { bd = d; best = k; } } return best ? { x: best.x, y: 1.5, z: best.z, d: bd } : null; }
  debugComplete() { if (this.surv) { this.G.failSurvival(); return; } for (let guard = 0; !this.done && guard < 30; guard++) { const o = this.cur; if (o.t === "boss") { o.boss.invuln = false; o.boss.active = true; if (o.boss.state === "spawn") o.boss.state = "combat"; o.boss.hurt(1e9, {}); if (this.cur === o && !o.done) { o.boss.dead = true; this.onKill(o.boss); } } else { o.c = o.n; this.complete(o); } } }
  // --------------------------------------------------------- per frame
  update(dt) {
    const G = this.G, p = G.player, t = G.time;
    if (this.surv) return this.updateSurvival(dt);
    for (const o of this.objs) {
      if (o.t === "gens" || o.t === "pylons") { /* targets handle themselves */ }
      if (o.t === "keys") for (const k of o.items) { if (k.got) continue; k.g.rotation.y += dt * 2; k.g.position.y = 1.1 + Math.sin(t * 2.5 + k.x) * 0.15; if (!p.dead && Math.hypot(p.x - k.x, p.z - k.z) < 1.9) { k.got = true; G.scene.remove(k.g); o.c++; G.sfx("pickup_key", { vol: 1 }); G.fx.pickupBurst({ x: k.x, y: 0.5, z: k.z }, [1, 0.3, 0.4]); this.progress(o); } }
      if (o.t === "pods") for (const k of o.items) {
        k.ring.rotation.z += dt * 0.5; if (k.got) continue; const d = Math.hypot(p.x - k.x, p.z - k.z);
        if (!p.dead && d < 3.4) { k.prog += dt / 3; k.ring.material.opacity = 0.45 + k.prog * 0.5; G.hud.progressRing(k.prog, "解救中…"); if (k.prog >= 1) { k.got = true; o.c++; G.sfx("rescue", { vol: 1 }); G.stats.pods++; save.stats.pods++; G.addCredits(100); G.hud.progressRing(-1); k.glass.visible = false; k.ring.visible = false; G.fx.spawnBurst({ x: k.x, y: 1.2, z: k.z }, [0.4, 1, 0.8]); setTimeout(() => { k.an.visible = false; G.fx.spawnBurst({ x: k.x, y: 1.2, z: k.z }, [0.4, 1, 0.8]); G.sfx("teleport", { vol: 0.7 }); }, 1400); G.checkAchievements(); this.progress(o); } }
        else { if (k.prog > 0) { k.prog = Math.max(0, k.prog - dt * 0.5); } G.hud.progressRing(-1); }
        k.an.rotation.y = Math.sin(t * 0.8) * 0.4;
      }
      if (o.t === "hold") {
        o.ring.rotation.z += dt * 0.1; const act = o === this.cur; const inside = !p.dead && Math.hypot(p.x - o.x, p.z - o.z) < o.R; o.inside = inside;
        o.ring.material.color.setHex(inside ? 0x44ff99 : 0xff6a50); o.disc.material.color.setHex(inside ? 0x44ff99 : 0xff6a50);
        if (act) {
          if (inside) o.time += dt;
          o.waveT -= dt; if (o.waveT <= 0 && o.time < o.sec - 12) { o.waveT = Math.max(12, 20 - o.waves * 2); o.waves++; G.hud.banner("敵人來襲", "第 " + o.waves + " 波"); this.holdWave(o); }
          if (this._ht === undefined || t - this._ht > 0.25) { this._ht = t; G.hud.setObjective(this.title(), this.text(), this.frac()); }
          if (o.time >= o.sec) { o.c = 1; o.n = 1; this.complete(o); }
        }
      }
      if (o.t === "reach") {
        o.ring.rotation.z += dt; o.ring2.rotation.z -= dt * 1.5;
        if (o === this.cur && !p.dead && Math.hypot(p.x - o.x, p.z - o.z) < 2.4) { G.fx.pickupBurst({ x: o.x, y: 0.2, z: o.z }, [1, 0.85, 0.3]); this.complete(o); }
      }
      if (o.t === "boss") {
        const b = o.boss; if (!b) continue;
        if (o === this.cur && !o.started && b.state !== "spawn" && !p.dead) {
          const d = Math.hypot(p.x - o.x, p.z - o.z);
          if (d < o.R + 2.5 && G.level.code(Math.floor(p.x / CELL), Math.floor(p.z / CELL)) === 0) {
            o.started = true; b.activate(); G.hud.banner("⚠ BOSS", BOSS[o.bid].name); A.playMusic(BOSS[o.bid].music, { fade: 1.2 }); G.shake(0.6); G.hud.setObjective(this.title(), this.text(), this.frac());
          }
        }
        if (o.started && this._bt !== undefined && t - this._bt < 0.3) {} else { this._bt = t; if (o === this.cur) G.hud.setObjective(this.title(), this.text(), this.frac()); }
      }
    }
    // pylon lights
    for (const tg of G.targets) if (tg.light) { tg.light.intensity = tg.dead ? 0 : 30 + Math.sin(t * 3) * 6; }
    if (this._lastText !== this.text()) { this._lastText = this.text(); G.hud.setObjective(this.title(), this.text(), this.frac()); }
    G.hud.setObjProgress(this.frac());
  }
  holdWave(o) {
    const G = this.G, L = G.level, p = G.player; const n = 3 + Math.min(4, o.waves);
    const types = ["drone", "quad", "quad", "tri", "drone", "guard", "quad"]; let sp = 0;
    for (let tries = 0; tries < 60 && sp < n; tries++) {
      const c = pick(G.M.open); const [x, z] = L.cellCenter(c.cx, c.cz); const d = Math.hypot(x - o.x, z - o.z); if (d < 18 || d > 34) continue; if (L.los(x, z, p.x, p.z) && Math.hypot(x - p.x, z - p.z) < 16) continue;
      G.addEnemy(types[(o.waves + sp) % types.length], x, z, { awake: true, hpMul: 1 }); sp++;
    }
    G.sfx("alarm", { vol: 0.5 });
  }
  // --------------------------------------------------------- survival
  initSurvival() { this.wave = 0; this.breakT = 4; this.queue = []; this.alive = 0; this.waveActive = false; this.spawnT = 0; this.waveText = "準備迎戰"; this.waveFrac = 0; this.G.survivalNoDrops = false; this.G.hud.setObjective("無盡生存", "第一波即將開始", 0); }
  startWave() {
    const G = this.G, n = ++this.wave; let budget = 5 + n * 2.6; const q = [];
    const tp = [["drone", 2, 1], ["quad", 2, 1], ["tri", 5, 3], ["guard", 6, 5], ["turret", 4, 6]];
    while (budget > 0) { const avail = tp.filter((x) => n >= x[2] && x[1] <= budget); if (!avail.length) break; const w = avail.map((x) => (x[0] === "tri" || x[0] === "guard" ? 0.6 : x[0] === "turret" ? 0.35 : 1.2)); let r = Math.random() * w.reduce((a, b) => a + b, 0), k = 0; while (r > w[k]) { r -= w[k]; k++; } const t = avail[k]; q.push(t[0]); budget -= t[1]; }
    this.queue = q; this.total = q.length; this.alive = 0; this.waveActive = true; this.spawnT = 0.5; this.hpMul = 1 + n * 0.05;
    G.hud.banner("第 " + n + " 波", "共 " + q.length + " 個敵人"); G.sfx("wave_start", { vol: 0.9 });
  }
  updateSurvival(dt) {
    const G = this.G, p = G.player, L = G.level;
    if (!this.waveActive) {
      this.breakT -= dt; this.waveText = this.wave === 0 ? `首波倒數 ${Math.ceil(this.breakT)}` : `第 ${this.wave} 波完成　下一波 ${Math.ceil(this.breakT)}`; this.waveFrac = 0;
      if (this.breakT <= 0) this.startWave();
    } else {
      this.spawnT -= dt;
      if (this.queue.length && this.spawnT <= 0 && G.enemies.filter((e) => !e.dead).length < 18) {
        this.spawnT = Math.max(0.35, 1.4 - this.wave * 0.05); const type = this.queue.shift();
        for (let t = 0; t < 40; t++) { const c = pick(G.M.open); const [x, z] = L.cellCenter(c.cx, c.cz); const d = Math.hypot(x - p.x, z - p.z); if (d < 14) continue; if (type === "turret" && c.n < 6) continue; const e = G.addEnemy(type, x, z, { awake: true, hpMul: this.hpMul }); if (e) { this.alive++; e.homeX = x; break; } }
      }
      this.waveText = `第 ${this.wave} 波　剩餘敵人 ${this.alive + this.queue.length}`; this.waveFrac = 1 - (this.alive + this.queue.length) / Math.max(1, this.total);
      if (!this.queue.length && this.alive <= 0) {
        this.waveActive = false; this.breakT = 7; const bonus = 40 + this.wave * 12; G.addCredits(bonus); G.hud.banner("第 " + this.wave + " 波完成", "獎勵 +" + bonus + " 晶片"); G.sfx("objective", { vol: 0.8 });
        const p2 = G.player; p2.hp = Math.min(p2.hpMax, p2.hp + 30); p2.armor = Math.min(p2.armorMax, p2.armor + 20);
        const spots = L.rand.shuffle(G.M.open.filter((c) => c.n >= 6)); ["health", "ammo", "ammo", "armor"].forEach((k, i) => { const c = spots[i]; if (c) { const [x, z] = L.cellCenter(c.cx, c.cz); G.addPickup(k, x, z, { life: 40 }); } });
        G.checkAchievements(); G.stats.survWave = this.wave; save.stats.survBest = Math.max(save.stats.survBest, this.wave);
      }
    }
    if (this._lastText !== this.waveText) { this._lastText = this.waveText; G.hud.setObjective("第 " + Math.max(1, this.wave) + " 波", this.waveText, this.waveFrac); }
    G.hud.setObjProgress(this.waveFrac);
    if (p.dead && p.deadT > 0.4 && !G.over) G.failSurvival();
  }
  dispose() { const G = this.G; for (const g of this.dispose_) { G.scene.remove(g); if (g.dispose) g.dispose(); } this.dispose_ = []; }
}
