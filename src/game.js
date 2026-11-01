import * as THREE from "three";
import { Renderer, TIERS, TIER_ORDER } from "./render.js";
import { loadModels, loadSet, loadEnv, waitTextures, glowTexture, cloneNode, normalise, findNode, setTexManager } from "./assets.js";
import { Level, CELL, LOW_H } from "./level.js";
import { generate, generateArena } from "./mapgen.js";
import { THEMES, LEVELS, WEAPONS, WEAPON_BY_ID, ENEMY, BOSS, UPGRADES, LEVEL_WEAPON_REWARD, SURVIVAL, ACHIEVEMENTS, KILLFEED, TIPS } from "./data.js";
import { WeaponView } from "./weapons.js";
import { Enemy, Boss, Flow, buildTemplates } from "./enemies.js";
import { FX } from "./fx.js";
import { Objectives } from "./objectives.js";
import { save, persist, settings, buzz, isTouchDevice } from "./save.js";
import { isMobile, LOW_MEM } from "./platform.js";
import * as A from "./audio.js";
import { clamp, lerp, rnd, damp, angDiff, pick, PI2, rng } from "./util.js";

const V3 = THREE.Vector3;
function rayCyl(ox, oy, oz, dx, dy, dz, cx, cz, r, y0, y1) {
  const px = ox - cx, pz = oz - cz, a = dx * dx + dz * dz; if (a < 1e-9) return -1;
  const b = px * dx + pz * dz, c = px * px + pz * pz - r * r; const disc = b * b - a * c; if (disc < 0) return -1;
  const sq = Math.sqrt(disc); let t = (-b - sq) / a; if (t < 0) { t = (-b + sq) / a; if (t < 0) return -1; }
  const y = oy + dy * t; if (y < y0 || y > y1) return -1; return t;
}
// 困難 = the original balance; 普通 is the new easier baseline; 簡單 is very forgiving.
const DIFF = [
  { name: "簡單", hp: 0.55, dmg: 0.35, spread: 1.9, lead: 0.3, cd: 1.5, wind: 1.5, boss: 0.95, bossCd: 1.6, shield: 0.8, cnt: 0.5, amb: 0.5, pk: 1.7, gen: 0.45, pspd: 0.75, regenDelay: 2.2, regenMul: 2.2, assist: 1.25 },
  { name: "普通", hp: 0.75, dmg: 0.6, spread: 1.5, lead: 0.6, cd: 1.25, wind: 1.3, boss: 0.93, bossCd: 1.3, shield: 0.8, cnt: 0.7, amb: 0.6, pk: 1.4, gen: 0.6, pspd: 0.85, regenDelay: 3, regenMul: 1.6, assist: 1 },
  { name: "困難", hp: 1, dmg: 1, spread: 1, lead: 1, cd: 1, wind: 1, boss: 1, bossCd: 1, shield: 1, cnt: 1, amb: 1, pk: 1, gen: 1, pspd: 1, regenDelay: 4.5, regenMul: 1, assist: 0.8 },
];

export class Game {
  constructor(canvas, hud, input) {
    this.canvas = canvas; this.hud = hud; this.input = input;
    this.mode = "boot"; this.time = 0; this.last = 0; this.enemies = []; this.pickups = []; this.targets = []; this.projs = []; this.tele = []; this.cps = [];
    this.player = this.newPlayer(); this.assistSlow = 1; this.assistE = null; this.diff = DIFF[1]; this.DIFF = DIFF; this.stats = this.newStats(); this.level = null; this.flow = null; this.objectives = null;
    this.scene = new THREE.Scene(); this.cam = new THREE.PerspectiveCamera(75, 1, 0.05, isMobile ? 170 : 420); this.scene.add(this.cam);
    this.R = new Renderer(canvas);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x222244, 0.5); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 1); this.scene.add(this.sun); this.scene.add(this.sun.target);
    this.poolLights = []; this.lampT = 0;
    this.glowTex = glowTexture(64);
    this.fx = new FX(this.scene);
    this.shakeT = 0; this.hitStop = 0; this.camRoll = 0; this.fovKick = 0; this.menuT = 0; this.cut = null; this.god = false; this.debug = false;
    this.tierName = null; this.fpsAcc = 0; this.fpsN = 0; this.lowCount = 0; this.highCount = 0; this.dynScale = 1; this.fpsShow = 0;
    this.tempV = new V3(); this.muzzleV = new V3();
    this.beamMesh = null; this.beamLoop = null;
    this.beam = { start: () => this.beamStart(), stop: () => this.beamStop(), set: (x, y, z, dx, dz) => this.beamSet(x, y, z, dx, dz) };
    this.pylonsLeft = 0; this.boss = null; this.themeKey = null; this.envCache = {};
    this.R.onResize = (w, h) => { this.fx.setScale(h * this.R.pr, this.cam.fov); };
    addEventListener("resize", () => this.R.resize());
    document.addEventListener("visibilitychange", () => { if (document.hidden && this.mode === "play") this.pause(); A.onVisibility && A.onVisibility(document.hidden); });
    addEventListener("pagehide", () => { if (this.mode === "play") this.pause(); });
    this.R.onLost = () => { if (this.mode === "play") this.pause(); this.ui && this.ui.contextLost(true); };
    this.R.onRestored = () => { this.ui && this.ui.contextLost(false); };
  }
  newPlayer() { return { x: 0, z: 0, y: 0, vy: 0, vx: 0, vz: 0, yaw: 0, pitch: 0, hp: 100, hpMax: 100, armor: 0, armorMax: 50, dead: false, crouch: false, sprinting: false, grounded: true, ads: 0, dashT: 0, dashCd: 0, dashDir: [0, 1], iframes: 0, lastHurt: -99, eye: 1.62, pitchKick: 0, yawKick: 0, ammo: {}, cur: "pistol", fireCd: 0, reloadT: -1, bloom: 0, stepD: 0, bobT: 0, speedNow: 0, deadT: 0, trigger: false }; }
  newStats() { return { kills: 0, shots: 0, hits: 0, crits: 0, time: 0, deaths: 0, credits: 0, chips: 0, damageTaken: 0, barrels: 0, dashes: 0, pods: 0, bosses: 0 }; }

  // ------------------------------------------------------------- boot
  async boot(progress) {
    const t0 = performance.now();
    const models = await loadModels(); this.models = models; progress && progress(0.3);
    this.tpl = buildTemplates(models);
    this.wv = new WeaponView(models, this.glowTex);
    this.R.setTier(this.pickTier(), this.scene, this.cam, this.wv.scene, this.wv.cam); this.applyTierExtras();
    this.R.r.compile && 0;
    A.initAudio();
    await Promise.race([A.loadAudio(() => {}), new Promise((r) => setTimeout(r, 8000))]);
    progress && progress(0.8);
    this.mode = "menu";
    return performance.now() - t0;
  }
  pickTier() {
    if (this.tierName && settings.quality === "auto") return this.tierName;
    const q = settings.quality;
    if (q && q !== "auto" && TIERS[q]) return q;
    return isMobile ? (LOW_MEM ? "low" : "lite") : "high";
  }
  applyTierExtras() {
    const T = this.R.tier; this.tierName = this.R.tierName;
    // pooled lights (count fixed per tier)
    for (const l of this.poolLights) this.scene.remove(l);
    this.poolLights = [];
    for (let i = 0; i < T.lights; i++) { const l = new THREE.PointLight(0xffffff, 0, 15, 2); this.scene.add(l); this.poolLights.push(l); }
    this.sun.castShadow = T.shadows > 0 && !!this.sunOn;
    if (this.sun.castShadow) {
      const s = this.sun.shadow; s.mapSize.set(T.shadows, T.shadows); const c = s.camera; c.left = -34; c.right = 34; c.top = 34; c.bottom = -34; c.near = 1; c.far = 140; s.bias = -0.0004; s.normalBias = 0.06; c.updateProjectionMatrix();
      if (s.map) { s.map.dispose(); s.map = null; }
    }
    if (this.level) this.level.setShadows(T.shadows > 0);
    this.fx.setWeather(this.theme ? this.theme.part : null, this.tierName === "high" ? 1 : this.tierName === "medium" ? 0.6 : this.tierName === "lite" ? 0.4 : 0.25);
    this.R.rebind(this.scene);
    if (this.theme) this.R.setGrade(this.theme.grade, this.theme.exposure);
    this.R.setFov(settings.fov);
    this.fx.setScale(this.R.h * this.R.pr, this.cam.fov);
  }
  setQuality(q) { settings.quality = q; this.tierName = null; const n = this.pickTier(); this.R.setTier(n, this.scene, this.cam, this.wv.scene, this.wv.cam); this.applyTierExtras(); this.dynScale = 1; this.R.setDynScale(1); }

  // ------------------------------------------------------------- theme / level
  procSky(cols) {
    const c = document.createElement("canvas"); c.width = 1024; c.height = 512; const x = c.getContext("2d");
    const rgb = (a, k = 1) => `rgb(${Math.min(255, a[0] * 255 * k) | 0},${Math.min(255, a[1] * 255 * k) | 0},${Math.min(255, a[2] * 255 * k) | 0})`;
    const g = x.createLinearGradient(0, 0, 0, 512); g.addColorStop(0, rgb(cols[1], 0.5)); g.addColorStop(0.42, rgb(cols[0], 1)); g.addColorStop(0.5, rgb(cols[2], 0.7)); g.addColorStop(0.58, rgb(cols[0], 0.5)); g.addColorStop(1, rgb(cols[1], 0.3));
    x.fillStyle = g; x.fillRect(0, 0, 1024, 512);
    const rg = x.createRadialGradient(256, 230, 0, 256, 230, 190); rg.addColorStop(0, rgb(cols[2], 1)); rg.addColorStop(1, "rgba(0,0,0,0)"); x.globalCompositeOperation = "lighter"; x.fillStyle = rg; x.fillRect(0, 0, 1024, 512);
    x.globalCompositeOperation = "source-over"; const R = rng(5);
    for (let i = 0; i < 260; i++) { x.fillStyle = `rgba(255,255,255,${0.2 + R() * 0.7})`; const s = R() * 1.8; x.fillRect(R() * 1024, R() * 220, s, s); }
    const t = new THREE.CanvasTexture(c); t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  async loadTheme(T, key) {
    const wantE = T.tex.wall.startsWith("Facade");
    const sets = { wall: loadSet(T.tex.wall, wantE), block: loadSet(T.tex.block, wantE), floor: loadSet(T.tex.floor), cap: loadSet(T.tex.cap) };
    if (T.tex.ceil) sets.ceil = loadSet(T.tex.ceil);
    let env;
    if (T.env) env = await loadEnv(T.env, this.R.r, T.bg);
    else { if (!this.envCache[key]) { const sky = this.procSky(T.procSky); const pm = new THREE.PMREMGenerator(this.R.r); this.envCache[key] = { env: pm.fromEquirectangular(sky).texture, bg: sky }; pm.dispose(); } env = this.envCache[key]; }
    await waitTextures();
    return { sets, env };
  }
  applyTheme(T, env) {
    this.theme = T;
    this.scene.fog = new THREE.FogExp2(T.fog[0], T.fog[1]);
    this.scene.environment = env.env; this.scene.environmentIntensity = T.envInt;
    if (env.bg) { this.scene.background = env.bg; this.scene.backgroundIntensity = T.bgInt || 1; } else this.scene.background = new THREE.Color(T.fog[0]).multiplyScalar(0.8);
    this.wv.setEnv(env.env, T.envInt * 0.9);
    this.hemi.color.setHex(T.hemi[0]); this.hemi.groundColor.setHex(T.hemi[1]); this.hemi.intensity = T.hemi[2];
    this.sunOn = !!T.sun;
    if (T.sun) { this.sun.color.setHex(T.sun.c); this.sun.intensity = T.sun.i; this.sunDir = new V3(...T.sun.dir).normalize(); } else this.sun.intensity = 0;
    this.sun.castShadow = this.R.tier.shadows > 0 && this.sunOn;
    this.R.setGrade(T.grade, T.exposure); if (this.R.bloom) this.R.bloom.strength = this.R.tier.bloom * (T.bloomK ?? 1);
    this.fx.setWeather(T.part, this.tierName === "high" ? 1 : this.tierName === "medium" ? 0.6 : this.tierName === "lite" ? 0.4 : 0.25);
    this.fx.setScale(this.R.h * this.R.pr, this.cam.fov);
    if (this.sun.castShadow && !this.sun.shadow.map) this.applyTierExtras();
  }
  clearMission() {
    for (const e of this.enemies) e.dispose(); this.enemies = [];
    for (const p of this.pickups) this.scene.remove(p.obj); this.pickups = [];
    for (const t of this.targets) { this.scene.remove(t.obj); } this.targets = [];
    for (const p of this.projs) this.scene.remove(p.obj); this.projs = [];
    for (const t of this.tele) { this.scene.remove(t.mesh); } this.tele = [];
    for (const c of this.cps) { this.scene.remove(c.obj); } this.cps = [];
    if (this.objectives) { this.objectives.dispose(); this.objectives = null; }
    if (this.level) { this.level.dispose(this.scene); this.level = null; }
    this.beamStop(); this.boss = null; this.fx.clear(); this.hud.hideBoss();
  }
  // build a world (for menu or mission)
  async buildWorld(def, isSurvival) {
    this.clearMission();
    const T = THEMES[def.theme];
    const M = isSurvival ? generateArena() : generate(def);
    const { sets, env } = await this.loadTheme(T, def.theme);
    this.applyTheme(T, env);
    const L = new Level(def, T, M, sets, this.models); L.build(this.scene); L.setShadows(this.R.tier.shadows > 0);
    this.level = L; this.M = M; this.def = def; this.flow = new Flow(L);
    this.updatePoolLights(true);
    return L;
  }
  // ------------------------------------------------------------- mission
  async startMission(def, o = {}) {
    const isSurv = def.id === "survival"; this.menuWorld = false; this.mode = "loading"; this.settleT = 3;
    this.diff = DIFF[settings.difficulty ?? 1];
    A.stopMusic(0.6);
    await this.buildWorld(def, isSurv);
    const L = this.level, M = this.M;
    this.survival = isSurv; this.stats = this.newStats(); this.missionTime = 0; this.revived = 0; this.over = false;
    this.computeUpgrades();
    const p = this.player = this.newPlayer();
    const [sx, sz] = L.cellCenter(M.start.cx, M.start.cz);
    p.x = sx; p.z = sz; p.yaw = M.start.yaw ?? 0;
    { const pc = M.path && M.path[Math.min(10, M.path.length - 1)]; let best = -1e9; const tz = pc ? L.cellCenter(pc.cx, pc.cz) : null;
      for (let i = 0; i < 24; i++) { const yw = (i / 24) * PI2, dx = -Math.sin(yw), dz = -Math.cos(yw); let sc = Math.min(L.ray2D(sx, sz, dx, dz, 30), 30); if (tz) { const tx = tz[0] - sx, tzz = tz[1] - sz, l = Math.hypot(tx, tzz) || 1; sc += 14 * (dx * tx + dz * tzz) / l; } if (sc > best) { best = sc; p.yaw = yw; } } } p.pitch = 0; p.hpMax = 100 + this.up.hp; p.hp = p.hpMax; p.armorMax = 50 + this.up.armor; p.armor = Math.round(p.armorMax * 0.5);
    this.initAmmo(); p.cur = save.owned[save.lastWeapon] ? save.lastWeapon : "pistol"; this.wv.equip(p.cur, true);
    this.checkpoint = { x: sx, z: sz, yaw: p.yaw, name: "起點" };
    this.spawnWorldEntities(def, isSurv);
    this.objectives = new Objectives(this, def, isSurv);
    this.flow.compute(p.x, p.z);
    this.hud.setObjective(this.objectives.title(), this.objectives.text(), this.objectives.frac());
    this.updateCamera(0.016, true);
    return def;
  }
  computeUpgrades() {
    const u = save.upgrades || {}, g = (id) => u[id] || 0;
    this.up = { dmg: 1 + g("dmg") * 0.1, rof: 1 + g("rof") * 0.06, mag: 1 + g("mag") * 0.12, ammo: 1 + g("ammo") * 0.2, hp: g("hp") * 15, armor: g("armor") * 15, speed: 1 + g("speed") * 0.04, regen: g("regen") };
  }
  ws(w) { const U = this.up; return { magMax: Math.round(w.mag * U.mag), resMax: Math.round(w.reserveMax * U.ammo), cd: w.cd / U.rof, dmg: w.dmg * U.dmg, reload: w.reload / U.rof }; }
  initAmmo() {
    const p = this.player; p.ammo = {};
    for (const w of WEAPONS) if (save.owned[w.id]) { const s = this.ws(w); p.ammo[w.id] = { mag: s.magMax, reserve: Math.min(s.resMax, Math.round(w.reserve * this.up.ammo)) }; }
  }
  spawnWorldEntities(def, isSurv) {
    const L = this.level, M = this.M, R = L.rand;
    const lvl = def.lvl || 1; const hpMul = 1 + (lvl - 1) * 0.07;
    if (!isSurv) {
      const keepP = this.diff.cnt; for (const g of M.groups) for (const m of g.members) { if (keepP < 1 && R() > keepP) continue; const [x, z] = L.cellCenter(m.cx, m.cz); this.addEnemy(m.type, x + m.ox, z + m.oz, { group: g.id, hpMul, instant: true }); }
      for (const t of M.turrets) { if (keepP < 1 && R() > Math.min(1, keepP + 0.2)) continue; const [x, z] = L.cellCenter(t.cx, t.cz); const e = this.addEnemy(t.type, x, z, { hpMul, instant: true }); e.yaw = this.openYaw(t.cx, t.cz); }
      // checkpoints
      for (const c of M.cps) this.addCheckpoint(c);
      // pickups
      const spots = R.shuffle(M.open.filter((c) => c.d > 3 && c.n >= 5)); let i = 0;
      const place = (kind, n) => { for (let k = 0; k < n && i < spots.length; k++, i++) { const c = spots[i]; const [x, z] = L.cellCenter(c.cx, c.cz); this.addPickup(kind, x + (R() - 0.5) * 1.6, z + (R() - 0.5) * 1.6); } };
      const pk = this.diff.pk; place("health", Math.round(5 * pk)); place("ammo", Math.round(6 * pk)); place("armor", Math.round(3 * pk)); place("chip", 10);
    } else {
      const spots = R.shuffle(M.open.filter((c) => c.n >= 6)); for (let i = 0; i < 4 && i < spots.length; i++) { const [x, z] = L.cellCenter(spots[i].cx, spots[i].cz); this.addPickup(["health", "ammo", "armor", "ammo"][i], x, z); }
    }
  }
  openYaw(cx, cz) {
    const L = this.level; let best = 0, bd = -1;
    for (let k = 0; k < 8; k++) { const a = k / 8 * PI2; let d = 0; for (let s = 1; s < 8; s++) { if (L.code(Math.floor(cx + 0.5 + Math.sin(a) * s), Math.floor(cz + 0.5 + Math.cos(a) * s)) !== 0) break; d = s; } if (d > bd) { bd = d; best = a; } }
    return best;
  }
  addEnemy(type, x, z, o = {}) {
    const def = BOSS[type] ? null : ENEMY[type]; if (!def) return null;
    const e = new Enemy(this, def, this.tpl, Object.assign({ x, z }, o)); this.enemies.push(e); return e;
  }
  addBoss(bid, x, z, o = {}) { const e = new Boss(this, bid, this.tpl, Object.assign({ x, z }, o)); this.enemies.push(e); this.boss = e; return e; }
  addCheckpoint(c) {
    const L = this.level, [x, z] = L.cellCenter(c.cx, c.cz);
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.07, 8, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 1, 0.6).multiplyScalar(2), toneMapped: false })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.1; g.add(ring);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 5, 20, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 1, 0.5), transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); beam.position.y = 2.5; g.add(beam);
    g.position.set(x, 0, z); this.scene.add(g); this.cps.push({ x, z, obj: g, ring, beam, done: false });
  }
  // ------------------------------------------------------------- pickups
  addPickup(kind, x, z, o = {}) {
    let obj; const col = { health: [0.3, 1, 0.5], ammo: [1, 0.8, 0.3], armor: [0.3, 0.7, 1], chip: [1, 0.85, 0.2], key: [1, 0.3, 0.3] }[kind] || [1, 1, 1];
    const g = new THREE.Group();
    if (kind === "health" || kind === "ammo" || kind === "key") {
      const n = normalise(cloneNode(this.models.props, kind === "health" ? "Prop_HealthPack" : kind === "ammo" ? "Prop_Ammo" : "Prop_KeyCard"), kind === "key" ? 0.9 : 0.65, { center: true });
      n.wrap.traverse((q) => { if (q.isMesh) q.castShadow = false; }); g.add(n.wrap);
    } else if (kind === "armor") {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), new THREE.MeshStandardMaterial({ color: 0x3a9cff, emissive: 0x1a60ff, emissiveIntensity: 1.2, metalness: 0.8, roughness: 0.25 })); m.scale.y = 1.4; g.add(m);
    } else {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.85, 0.2).multiplyScalar(2.2), toneMapped: false })); g.add(m);
    }
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: new THREE.Color(col[0], col[1], col[2]), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.55, toneMapped: false })); sp.scale.setScalar(kind === "chip" ? 0.9 : 1.5); g.add(sp);
    g.position.set(x, 0.9, z); this.scene.add(g);
    const pk = { kind, x, z, obj: g, t: Math.random() * 6, life: o.life ?? 1e9, value: o.value };
    this.pickups.push(pk); return pk;
  }
  updatePickups(dt) {
    const p = this.player;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const k = this.pickups[i]; k.t += dt; k.life -= dt;
      k.obj.rotation.y += dt * 2; k.obj.position.y = 0.85 + Math.sin(k.t * 2.5) * 0.1;
      if (k.life < 4) k.obj.visible = Math.sin(k.t * 20) > 0;
      if (k.life <= 0) { this.scene.remove(k.obj); this.pickups.splice(i, 1); continue; }
      const dx = p.x - k.x, dz = p.z - k.z, d2 = dx * dx + dz * dz;
      const mag = (k.kind === "chip" ? 3.2 : 1.7); if (d2 < mag * mag && !p.dead) {
        if (d2 < 5 && k.kind === "chip") { /* magnet */ }
        if (this.collect(k)) { this.fx.pickupBurst({ x: k.x, y: 0.2, z: k.z }, { health: [0.3, 1, 0.5], ammo: [1, 0.8, 0.3], armor: [0.3, 0.7, 1], chip: [1, 0.85, 0.2], key: [1, 0.3, 0.3] }[k.kind]); this.scene.remove(k.obj); this.pickups.splice(i, 1); }
      }
    }
  }
  collect(k) {
    const p = this.player;
    switch (k.kind) {
      case "health": if (p.hp >= p.hpMax) return false; p.hp = Math.min(p.hpMax, p.hp + 35); this.sfx("pickup_health", { vol: 0.8 }); this.hud.toast("生命 +35", "good"); break;
      case "armor": if (p.armor >= p.armorMax) return false; p.armor = Math.min(p.armorMax, p.armor + 30); this.sfx("pickup_armor", { vol: 0.8 }); this.hud.toast("護甲 +30", "info"); break;
      case "ammo": {
        let any = false; for (const w of WEAPONS) { const a = p.ammo[w.id]; if (!a) continue; const s = this.ws(w), add = Math.max(1, Math.round(w.ammoPick * this.up.ammo * (w.id === p.cur ? 1 : 0.6))); if (a.reserve < s.resMax) { a.reserve = Math.min(s.resMax, a.reserve + add); any = true; } }
        if (!any) return false; this.sfx("pickup_ammo", { vol: 0.8 }); this.hud.toast("彈藥補給", "info"); break;
      }
      case "chip": { const v = k.value || 25; this.addCredits(v); this.stats.chips++; this.sfx("pickup_cash", { vol: 0.6 }); this.hud.toast("晶片 +" + v, "gold"); break; }
      case "key": return false;
    }
    return true;
  }
  addCredits(n) { n = Math.round(n); this.stats.credits += n; save.credits += n; save.stats.earned += n; this.hud.setCredits(save.credits); }

  // ------------------------------------------------------------- audio helpers
  sfx(name, o) { return A.play(name, o); }
  sfxAt(name, x, z, o = {}) { const p = this.player; return A.playAt(name, x - p.x, z - p.z, p.yaw, o); }
  noise(x, z, r) {
    for (const e of this.enemies) { if (e.dead || e.boss || (e.state !== "patrol" && e.state !== "idle")) continue; const d = Math.hypot(e.x - x, e.z - z); if (d < r * (this.level.los(e.x, e.z, x, z) ? 1 : 0.55)) e.alerted(false); }
  }
  msg(t, kind) { this.hud.toast(t, kind); }
  shake(a) { this.shakeT = Math.min(1, this.shakeT + a); }
  // ------------------------------------------------------------- death / damage
  damagePlayer(dmg, sx, sz, kind) {
    const p = this.player; if (p.dead || this.god || p.iframes > 0 || this.mode !== "play") return;
    dmg = Math.max(1, dmg);
    this.stats.damageTaken += dmg;
    let abs = Math.min(p.armor, dmg * 0.6); p.armor -= abs; const hp = dmg - abs; p.hp -= hp; p.lastHurt = this.time;
    this.sfx(abs > 0 && p.armor > 0 ? "player_armor" : "player_hurt", { vol: 0.9, minGap: 0.08 }); if (abs > 0 && p.armor <= 0) this.sfx("shield_break", { vol: 0.5 });
    this.shake(0.25 + Math.min(0.4, dmg * 0.01)); buzz(40); this.hud.damage(Math.atan2(sx - p.x, sz - p.z), p.yaw, dmg); this.camRoll += (Math.random() - 0.5) * 0.08;
    if (p.hp <= 0) this.killPlayer();
  }
  killPlayer() {
    const p = this.player; p.hp = 0; p.dead = true; p.deadT = 0; this.stats.deaths++; save.stats.deaths++; this.sfx("player_die", { vol: 1 });
    this.beamStop(); buzz(200);
    if (this.wv.reloading) this.wv.cancelReload(); p.reloadT = -1; p.ads = 0; this.hud.scope(false);
  }
  respawn() {
    const p = this.player, c = this.checkpoint; this.deadShown = false; p.dead = false; p.x = c.x; p.z = c.z; p.yaw = c.yaw; p.y = 0; p.vy = 0; p.hp = p.hpMax; p.armor = Math.max(p.armor, Math.round(p.armorMax * 0.5)); p.iframes = 3; p.pitch = 0; p.pitchKick = 0; p.deadT = 0;
    for (const w of WEAPONS) { const a = p.ammo[w.id]; if (a) { const s = this.ws(w); a.mag = Math.max(a.mag, Math.ceil(s.magMax * 0.5)); a.reserve = Math.max(a.reserve, Math.round(s.resMax * 0.3)); } }
    for (const e of this.enemies) if (!e.dead && !e.boss && Math.hypot(e.x - p.x, e.z - p.z) < 14) { e.x += (e.x - p.x) * 0.9; e.z += (e.z - p.z) * 0.9; if (this.level.blocked(e.x, e.z, e.colR, 0)) { e.x = e.homeX; e.z = e.homeZ; } e.state = "patrol"; e.awake = false; }
    this.revived++; this.flow.dirty = true; this.flow.compute(p.x, p.z); this.mode = "play"; this.input.enabled = true; this.input.reset();
    this.hud.show(true); this.hud.hideOverlay(); this.sfx("teleport", { vol: 0.8 });
    this.fx.spawnBurst({ x: p.x, y: 1, z: p.z }, [0.4, 1, 0.7]);
  }
  // ------------------------------------------------------------- kills
  onKill(e, o = {}) {
    const d = e.def, st = this.stats;
    st.kills++; save.stats.kills++; if (o.crit) { st.crits++; save.stats.crits++; }
    if (o.barrel) { st.barrels++; save.stats.barrels++; }
    const cr = Math.round(d.credits * (e.boss ? 1 : 1)); this.addCredits(cr); this.score = (this.score || 0) + d.score;
    this.hud.killfeed((KILLFEED[e.id] || d.name) + " +" + cr);
    this.sfxAt(e.id === "tri" || e.boss ? "death_heavy" : e.id === "drone" ? "death_drone" : "death_quad", e.x, e.z, { vol: 0.9 });
    this.fx.deathBurst({ x: e.x, y: e.centerY(), z: e.z }, Math.min(2.5, e.h * 0.6 + 0.5), e.def.fly ? [1, 0.4, 0.5] : [0.5, 0.9, 1]);
    if (e.boss) { this.fx.explosion({ x: e.x, y: e.centerY(), z: e.z }, 1.8); this.shake(0.8); this.hitStop = 0.25; st.bosses++; save.stats.bosses++; }
    if (!e.boss && !this.survivalNoDrops) { const r = Math.random() / (1 + (this.diff.pk - 1) * 0.6); if (r < 0.2) this.addPickup("health", e.x, e.z, { life: 25 }); else if (r < 0.5) this.addPickup("ammo", e.x, e.z, { life: 25 }); else if (r < 0.58) this.addPickup("armor", e.x, e.z, { life: 25 }); }
    if (o.hitmark !== false) this.hud.hitmarker("kill");
    if (this.objectives) this.objectives.onKill(e);
    this.checkAchievements();
  }
  checkAchievements() {
    for (const a of ACHIEVEMENTS) { if (save.ach[a.id]) continue; if (a.test(save.stats, save)) { save.ach[a.id] = Date.now(); this.hud.achievement(a); this.sfx("ach", { vol: 0.8 }); persist(); } }
  }
  // ------------------------------------------------------------- projectiles
  spawnProj(o) {
    let m = this.projPool && this.projPool.pop();
    if (!m) {
      const g = new THREE.Group(); const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })); const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false, opacity: 0.8 }));
      g.add(core); g.add(sp); g.userData = { core, sp }; m = g;
    }
    const col = new THREE.Color(o.color); m.userData.core.material.color.copy(col).multiplyScalar(2.5); m.userData.sp.material.color.copy(col); m.userData.core.scale.setScalar(o.size); m.userData.sp.scale.setScalar(o.size * 4.2);
    m.position.set(o.x, o.y, o.z); this.scene.add(m);
    this.projs.push({ obj: m, x: o.x, y: o.y, z: o.z, vx: o.dx * o.speed, vy: o.dy * o.speed, vz: o.dz * o.speed, speed: o.speed, dmg: o.dmg, life: o.life, size: o.size, owner: o.owner, homing: o.homing, player: !!o.player, splash: o.splash, color: o.color, trail: 0 });
  }
  freeProj(i) { const p = this.projs[i]; this.scene.remove(p.obj); (this.projPool || (this.projPool = [])).push(p.obj); this.projs.splice(i, 1); }
  updateProjs(dt) {
    const L = this.level, pl = this.player;
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const q = this.projs[i]; q.life -= dt;
      if (q.life <= 0) { if (q.splash) this.rocketBoom(q); this.freeProj(i); continue; }
      if (q.homing && !pl.dead) { const dx = pl.x - q.x, dy = pl.y + 1 - q.y, dz = pl.z - q.z, d = Math.hypot(dx, dy, dz) || 1, k = Math.min(1, q.homing * dt); q.vx += (dx / d * q.speed - q.vx) * k; q.vy += (dy / d * q.speed - q.vy) * k; q.vz += (dz / d * q.speed - q.vz) * k; }
      const steps = Math.max(1, Math.ceil(q.speed * dt / 0.5)), sdt = dt / steps; let dead = false;
      for (let s = 0; s < steps && !dead; s++) {
        q.x += q.vx * sdt; q.y += q.vy * sdt; q.z += q.vz * sdt;
        const hit = L.pointSolid(q.x, q.y, q.z);
        if (hit) {
          if (q.splash) this.rocketBoom(q); else { this.fx.sparks({ x: q.x, y: q.y, z: q.z }, new V3(-q.vx, -q.vy, -q.vz).normalize(), 6, q.player ? [1, 0.8, 0.4] : [1, 0.4, 0.4]); }
          dead = true; break;
        }
        if (q.player) {
          for (const e of this.enemies) {
            if (e.dead || e.state === "spawn") continue; const dx = q.x - e.x, dz = q.z - e.z, rr = e.radius * 0.9 + 0.2;
            if (dx * dx + dz * dz < rr * rr && q.y > e.hitY0 + e.y - 0.2 && q.y < e.hitY0 + e.y + e.hitH + 0.2) { this.rocketBoom(q, e); dead = true; break; }
          }
          if (!dead) for (const t of this.targets) { if (t.dead) continue; const dx = q.x - t.x, dz = q.z - t.z; if (dx * dx + dz * dz < (t.r + 0.2) ** 2 && q.y < t.h) { this.rocketBoom(q); dead = true; break; } }
        } else if (!pl.dead) {
          const dx = q.x - pl.x, dz = q.z - pl.z, rr = 0.45 + q.size * 0.6; const top = pl.y + (pl.crouch ? 1.2 : 1.8);
          if (dx * dx + dz * dz < rr * rr && q.y > pl.y && q.y < top) { if (q.splash) this.explodeAt(q.x, q.y, q.z, 3, q.dmg, q.owner, true); else this.damagePlayer(q.dmg, q.x - q.vx, q.z - q.vz, "proj"); this.fx.sparks({ x: q.x, y: q.y, z: q.z }, new V3(-q.vx, 0, -q.vz).normalize(), 6, [1, 0.4, 0.4]); dead = true; }
        }
      }
      if (dead) { this.freeProj(i); continue; }
      q.obj.position.set(q.x, q.y, q.z);
      q.trail -= dt; if (q.trail <= 0) { q.trail = 0.035; if (!q._c0) { const c = new THREE.Color(q.color); q._c0 = [c.r, c.g, c.b, 0.6]; q._c1 = [c.r, c.g, c.b, 0]; } this.fx.p.emit(q.x, q.y, q.z, 0, 0, 0, 0.3, q.size * (q.player ? 1.6 : 1.1), 0.02, q._c0, q._c1, 0, 0); }
    }
  }
  rocketBoom(q, direct) {
    const r = WEAPON_BY_ID.rocket.rocket; this.explodeAt(q.x, q.y, q.z, r.splash, q.dmg, null, true, direct);
  }
  // radial explosion: damages enemies, targets, barrels (+player if self)
  explodeAt(x, y, z, radius, dmg, owner, hurtPlayer, direct, barrel) {
    const L = this.level, pl = this.player;
    this.fx.explosion({ x, y, z }, Math.min(1.6, radius / 3.6)); this.sfxAt(radius > 3 ? "rocket_explode" : "explode_small", x, z, { vol: 1 });
    this.shake(Math.max(0, 0.5 - Math.hypot(pl.x - x, pl.z - z) / 25));
    this.noise(x, z, 30);
    const fromPlayer = !(owner instanceof Enemy);
    if (fromPlayer) {
      for (const e of this.enemies) {
        if (e.dead || e.state === "spawn") continue;
        const d = Math.hypot(e.x - x, e.z - z) - e.radius * 0.7; if (d > radius) continue;
        const f = clamp(1 - Math.max(0, d) / radius, 0.2, 1); const dm = (e === direct ? dmg : dmg * f * 0.8) * this.up.dmg;
        e.hurt(dm, { explosive: true, barrel });
      }
      for (const t of this.targets) { if (t.dead) continue; const d = Math.hypot(t.x - x, t.z - z) - t.r; if (d < radius) this.hurtTarget(t, dmg * clamp(1 - Math.max(0, d) / radius, 0.3, 1)); }
    }
    for (const b of L.barrels) { if (b.dead) continue; const d = Math.hypot(b.x - x, b.z - z); if (d < radius && d > 0.01) b.hp -= dmg; if (b.hp <= 0) this.blowBarrel(b, true); }
    if (hurtPlayer && !pl.dead) { const d = Math.hypot(pl.x - x, pl.z - z); if (d < radius) { const f = 1 - d / radius; this.damagePlayer(dmg * f * (fromPlayer ? 0.35 : 1), x, z, "explosion"); } }
  }
  blowBarrel(b) {
    if (b.dead) return; b.dead = true; b.obj.visible = false; b.glow.visible = false; const L = this.level; const i = L.colliders.indexOf(b.col); if (i >= 0) L.colliders.splice(i, 1);
    this.explodeAt(b.x, 0.8, b.z, 5, 120, null, true, null, true);
    this.fx.decal(new V3(b.x, 0.01, b.z), new V3(0, 1, 0), 2.4);
  }
  // ------------------------------------------------------------- targets (generators / pylons)
  addTarget(o) {
    const L = this.level; const t = Object.assign({ hp: 400, hpMax: 400, r: 1.2, h: 3, dead: false }, o); t.hpMax = t.hp;
    const col = { x: t.x, z: t.z, r: t.r, h: t.h }; L.colliders.push(col); t.col = col; this.targets.push(t); return t;
  }
  hurtTarget(t, dmg) {
    if (t.dead || !t.active) return; t.hp -= dmg; t.flash = 0.12;
    if (t.hp <= 0) {
      t.dead = true; this.fx.explosion({ x: t.x, y: t.h * 0.5, z: t.z }, 1.4); this.sfxAt("gen_explode", t.x, t.z, { vol: 1 }); this.shake(0.6);
      const i = this.level.colliders.indexOf(t.col); if (i >= 0) this.level.colliders.splice(i, 1);
      t.obj.visible = false; if (t.onDestroy) t.onDestroy(t);
    } else { this.sfxAt("hit_armor", t.x, t.z, { vol: 0.5 }); }
  }
  // ------------------------------------------------------------- telegraphs / shockwave / laser line
  telegraph(x, z, r, dur, color, cb) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.06, z); m.scale.setScalar(r); this.scene.add(m);
    const edge = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); edge.position.z = 0.001; m.add(edge);
    this.tele.push({ mesh: m, t: 0, dur, cb, r });
  }
  telegraphLine(x, z, dx, dz, len, dur, persist) {
    const g = new THREE.BoxGeometry(1.4, 0.04, 1); g.translate(0, 0, 0.5);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xff3040, transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
    m.position.set(x, 0.07, z); m.scale.set(1, 1, len); m.rotation.y = Math.atan2(dx, dz); this.scene.add(m);
    this.tele.push({ mesh: m, t: 0, dur, line: true, persist });
  }
  updateTele(dt) {
    for (let i = this.tele.length - 1; i >= 0; i--) {
      const t = this.tele[i]; t.t += dt; const k = t.t / t.dur;
      if (!t.line) { t.mesh.material.opacity = 0.12 + 0.35 * k; t.mesh.children[0].material.opacity = 0.5 + 0.5 * Math.sin(t.t * 25); }
      else t.mesh.material.opacity = 0.2 + 0.3 * Math.abs(Math.sin(t.t * 18));
      if (t.t >= t.dur) { this.scene.remove(t.mesh); t.mesh.geometry.dispose(); t.mesh.material.dispose(); this.tele.splice(i, 1); if (t.cb) t.cb(); }
    }
  }
  shockwave(x, z, maxR, dmg, owner) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48), new THREE.MeshBasicMaterial({ color: 0xff5030, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.12, z); this.scene.add(ring);
    this.waves = this.waves || []; this.waves.push({ ring, x, z, r: 1, maxR, dmg, hit: false, speed: 16 });
  }
  updateWaves(dt) {
    if (!this.waves) return; const p = this.player;
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i]; w.r += w.speed * dt; w.ring.scale.setScalar(w.r); w.ring.material.opacity = 0.9 * (1 - w.r / w.maxR);
      const d = Math.hypot(p.x - w.x, p.z - w.z);
      if (!w.hit && Math.abs(d - w.r) < 1.2 && p.y < 0.7 && !p.dead) { w.hit = true; this.damagePlayer(w.dmg * this.diff.dmg, w.x, w.z, "shock"); }
      if (w.r >= w.maxR) { this.scene.remove(w.ring); w.ring.geometry.dispose(); w.ring.material.dispose(); this.waves.splice(i, 1); }
    }
  }
  beamStart() {
    if (this.beamMesh) return; const g = new THREE.CylinderGeometry(0.35, 0.35, 1, 10, 1, true); g.rotateX(Math.PI / 2); g.translate(0, 0, 0.5);
    this.beamMesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.2, 0.5).multiplyScalar(3), toneMapped: false, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); this.beamMesh.frustumCulled = false; this.scene.add(this.beamMesh);
    this.beamLoop = A.loopHandle("beam_loop", 0.9); this.beamLoop.set(1);
  }
  beamSet(x, y, z, dx, dz) { if (!this.beamMesh) return; const L = this.level; const d = Math.min(45, L.ray2D(x, z, dx, dz, 45)); this.beamMesh.position.set(x, y, z); this.beamMesh.scale.set(1 + Math.sin(this.time * 40) * 0.2, 1 + Math.sin(this.time * 33) * 0.2, d); this.beamMesh.lookAt(x + dx, y, z + dz); }
  beamStop() { if (this.beamMesh) { this.scene.remove(this.beamMesh); this.beamMesh.geometry.dispose(); this.beamMesh.material.dispose(); this.beamMesh = null; } if (this.beamLoop) { this.beamLoop.stop(); this.beamLoop = null; } }

  // ------------------------------------------------------------- player update
  // ---- touch aim assist ------------------------------------------------
  assistK() { return this.input.touchMode ? (settings.aimAssist ?? 1.5) * this.diff.assist : 0; }
  updateAssist(dt, inp) {
    this.assistE = null; this.assistSlow = 1;
    const k = this.assistK(); if (k <= 0 || this.mode !== "play") return;
    const p = this.player, o = this.cam.position, f = this.forward(this.tempV);
    const cone = (0.17 - 0.07 * p.ads) * k; this.assistCone = cone; let best = null, bestA = cone;
    for (const e of this.enemies) {
      if (e.dead || e.state === "spawn" || e.invuln) continue;
      const tx = e.x - o.x, ty = e.hitY0 + e.y + e.hitH * 0.55 - o.y, tz = e.z - o.z, d = Math.sqrt(tx * tx + ty * ty + tz * tz);
      if (d < 1.5 || d > 48) continue;
      const c = (f.x * tx + f.y * ty + f.z * tz) / d; if (c < 0.88) continue;
      const a = Math.max(0, Math.acos(Math.min(1, c)) - Math.atan(e.radius * 0.7 / d));
      if (a >= bestA) continue;
      if (this.level.ray(o.x, o.y, o.z, tx / d, ty / d, tz / d, d).t < d - 0.5) continue;
      best = e; bestA = a; this.assistTx = tx; this.assistTy = ty; this.assistTz = tz;
    }
    if (!best) return;
    this.assistE = best; this.assistA = bestA;
    const near = 1 - bestA / cone; // 0 at the cone edge, 1 dead centre
    this.assistSlow = 1 - 0.55 * (0.35 + 0.65 * near) * Math.min(1, k);
    const drag = Math.abs(inp.lx) + Math.abs(inp.ly) > 4 ? 0.25 : 1; // deliberate swipes override the pull
    const ty = this.assistTy, hd = Math.hypot(this.assistTx, this.assistTz);
    let dy = Math.atan2(-this.assistTx, -this.assistTz) - p.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const dp = Math.atan2(ty, hd) - p.pitch, rate = Math.min(1, dt * 2.4 * k * drag);
    p.yaw += dy * rate; p.pitch = clamp(p.pitch + dp * rate, -1.45, 1.45);
  }
  bendAim(fwd) { // hitscan tolerance: pull shots toward the assisted target
    const e = this.assistE; if (!e || e.dead) return;
    const tx = this.assistTx, ty = this.assistTy, tz = this.assistTz, d = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1, b = Math.min(0.9, 0.75 * Math.min(1.2, this.assistK()));
    fwd.set(fwd.x + (tx / d - fwd.x) * b, fwd.y + (ty / d - fwd.y) * b, fwd.z + (tz / d - fwd.z) * b).normalize();
  }
  forward(out, yawOff = 0, pitchOff = 0) { const p = this.player, yaw = p.yaw + yawOff, pit = p.pitch + p.pitchKick + pitchOff; return out.set(-Math.sin(yaw) * Math.cos(pit), Math.sin(pit), -Math.cos(yaw) * Math.cos(pit)); }
  equip(id) {
    const p = this.player; if (p.cur === id || !save.owned[id]) return;
    p.cur = id; this.wv.equip(id); p.reloadT = -1; this.wv.cancelReload(); p.fireCd = Math.max(p.fireCd, 0.3); p.ads = 0; save.lastWeapon = id;
    this.sfx("weapon_switch", { vol: 0.7 }); this.hud.setWeapon(WEAPON_BY_ID[id]); this.hud.scope(false);
  }
  ownedList() { return WEAPONS.filter((w) => save.owned[w.id]); }
  startReload() {
    const p = this.player, w = WEAPON_BY_ID[p.cur], a = p.ammo[p.cur], s = this.ws(w);
    if (p.reloadT >= 0 || a.mag >= s.magMax || a.reserve <= 0) return false;
    p.reloadT = 0; p.reloadDur = s.reload; this.wv.startReload(s.reload); this.sfx("reload_out", { vol: 0.7 }); p.reloadSnd = false; return true;
  }
  updateWeapon(dt, inp) {
    const p = this.player, w = WEAPON_BY_ID[p.cur], a = p.ammo[p.cur], s = this.ws(w);
    const own = this.ownedList();
    const slot = this.input.takeSlot(); if (slot) { const ww = WEAPONS[slot - 1]; if (ww && save.owned[ww.id]) this.equip(ww.id); }
    const wheel = this.input.takeWheel(); let sw = this.input.take("swapNext") ? 1 : wheel;
    if (sw) { const i = own.findIndex((x) => x.id === p.cur); this.equip(own[(i + sw + own.length) % own.length].id); }
    if (this.input.take("reload")) this.startReload();
    p.fireCd -= dt; p.bloom = Math.max(0, p.bloom - dt * 0.05);
    if (p.reloadT >= 0) {
      p.reloadT += dt; if (!p.reloadSnd && p.reloadT > p.reloadDur * 0.6) { p.reloadSnd = true; this.sfx("reload_in", { vol: 0.7 }); }
      if (p.reloadT >= p.reloadDur) { p.reloadT = -1; const need = s.magMax - a.mag, take = Math.min(need, a.reserve); a.mag += take; a.reserve -= take; if (w.pump) this.sfx("shotgun_pump", { vol: 0.7 }); this.hud.setAmmo(w, a, s); }
    }
    const trig = inp.fire || this.autoFireNow;
    const sprintBlock = p.sprinting && p.sprintT > 0.25;
    if (trig && !sprintBlock && p.reloadT < 0 && p.fireCd <= 0 && this.wv.switchT >= 0.7) {
      if (w.auto || !p.trigger) this.fire(w, a, s, inp);
    }
    if (!trig) p.trigger = false; else if (p.reloadT < 0 && p.fireCd <= 0) p.trigger = true;
    if (trig && p.reloadT < 0 && a.mag <= 0 && p.fireCd <= 0) { if (!this.startReload()) { if (!p.trigger || w.auto) { this.sfx("empty_click", { vol: 0.6, minGap: 0.25 }); p.fireCd = 0.25; } } }
    const wantAds = inp.ads && !sprintBlock && p.reloadT < 0;
    p.ads = damp(p.ads, wantAds ? 1 : 0, 13, dt);
    const scoped = w.scope && p.ads > 0.82; if (scoped !== this.scoped) { this.scoped = scoped; this.hud.scope(scoped); this.wv.holder.visible = !scoped; }
    // auto fire assist (touch option)
    this.autoFireNow = false;
    if (settings.autoFire && this.input.touchMode && !inp.fire) {
      this._afT = (this._afT || 0) - dt;
      if (this._afT <= 0) { this._afT = 0.06; const o = this.cam.position, d = this.forward(this.tempV); for (const e of this.enemies) { if (e.dead || e.state === "spawn") continue; const t = rayCyl(o.x, o.y, o.z, d.x, d.y, d.z, e.x, e.z, e.radius * 0.85, e.hitY0 + e.y, e.hitY0 + e.y + e.hitH); if (t > 0 && t < w.range * 0.7 && this.level.ray(o.x, o.y, o.z, d.x, d.y, d.z, t).t >= t - 0.1) { this._afOn = 0.15; break; } } }
      if (this._afOn > 0) { this._afOn -= dt; this.autoFireNow = true; }
    }
  }
  fire(w, a, s, inp) {
    const p = this.player, L = this.level;
    if (a.mag <= 0) return;
    a.mag--; p.fireCd = s.cd; this.stats.shots++; save.stats.shots++;
    this.sfx(w.snd, { vol: 1, jitter: 0.05, minGap: 0 });
    this.wv.fire(w);
    const mz = this.wv.muzzleWorld(this.muzzleV);
    this.fx.flash(mz, w.id === "sniper" ? 0x7af0ff : 0xffc880, 22 * w.flash, 0.07);
    this.fx.muzzleSmoke(mz, this.forward(new V3()));
    const cam = this.cam.position;
    const spdMove = Math.min(1, p.speedNow / 6);
    let spread = lerp(w.hipSpread, w.spread, p.ads) * (1 + spdMove * 0.8 + (p.grounded ? 0 : 1.5)) * (p.crouch ? 0.7 : 1) + p.bloom;
    p.bloom = Math.min(0.03, p.bloom + w.recoil * 0.0025);
    const kick = w.recoil * 0.011 * (1 - p.ads * 0.35); p.pitchKick += kick * 1.2; p.pitch += kick * 0.35; p.yawKick += rnd(-1, 1) * kick * 0.5;
    this.shake(w.shake * 0.6 * (1 - p.ads * 0.5)); this.fovKick = Math.max(this.fovKick, w.recoil * 0.012); buzz(12);
    this.noise(p.x, p.z, w.noise);
    const fwd = this.forward(new V3()); this.bendAim(fwd); const right = new V3(Math.cos(p.yaw), 0, -Math.sin(p.yaw)); const up = new V3().crossVectors(right, fwd).normalize();
    if (w.rocket) {
      const t = L.ray(cam.x, cam.y, cam.z, fwd.x, fwd.y, fwd.z, 80).t; const aim = new V3(cam.x + fwd.x * Math.min(t, 60), cam.y + fwd.y * Math.min(t, 60), cam.z + fwd.z * Math.min(t, 60));
      const dir = aim.clone().sub(mz).normalize();
      this.spawnProj({ x: mz.x, y: mz.y, z: mz.z, dx: dir.x, dy: dir.y, dz: dir.z, speed: w.rocket.speed, dmg: w.rocket.splashDmg, color: 0xffa040, size: 0.3, life: 5, player: true, splash: true });
      this.sfx("rocket_launch", { vol: 0.5 }); if (a.mag <= 0) this.autoReloadT = 0.5; return;
    }
    let tracers = 0, anyHit = false, anyCrit = false;
    for (let i = 0; i < w.pellets; i++) {
      const r = spread * Math.sqrt(Math.random()), th = Math.random() * PI2; const dir = new V3().copy(fwd).addScaledVector(right, Math.cos(th) * r).addScaledVector(up, Math.sin(th) * r).normalize();
      const res = this.hitscan(cam, dir, w, s, i === 0 || w.pellets <= 3 || tracers < 3);
      if (res.hit) anyHit = true; if (res.crit) anyCrit = true;
      if (tracers < (w.pellets > 3 ? 3 : 1) && res.end) { this.fx.tracer(mz, res.end, w.tracer); tracers++; }
    }
    if (anyHit) { this.stats.hits++; save.stats.hits++; this.hud.hitmarker(anyCrit ? "crit" : "hit"); this.sfx("hit_marker", { vol: 0.35, minGap: 0.04 }); }
    if (w.pump) setTimeout(() => this.mode === "play" && this.sfx("shotgun_pump", { vol: 0.6 }), 350);
    this.hud.setAmmo(w, a, s);
    if (a.mag <= 0) this.autoReloadT = 0.45;
  }
  hitscan(o, d, w, s, wantFx) {
    const L = this.level, p = this.player;
    L._hitProp = null;
    const wr = L.ray(o.x, o.y, o.z, d.x, d.y, d.z, w.range); const tWall = wr.t;
    const hits = [];
    for (const e of this.enemies) { if (e.dead || e.state === "spawn") continue; const t = rayCyl(o.x, o.y, o.z, d.x, d.y, d.z, e.x, e.z, e.radius * 0.85, e.hitY0 + e.y, e.hitY0 + e.y + e.hitH); if (t >= 0 && t <= tWall + 0.02) hits.push({ t, e }); }
    for (const tg of this.targets) { if (tg.dead || !tg.active) continue; const t = rayCyl(o.x, o.y, o.z, d.x, d.y, d.z, tg.x, tg.z, tg.r, 0, tg.h); if (t >= 0 && t <= tWall + 0.05) hits.push({ t, tg }); }
    hits.sort((a, b) => a.t - b.t);
    const out = { hit: false, crit: false, end: new V3(o.x + d.x * tWall, o.y + d.y * tWall, o.z + d.z * tWall) };
    const pierce = w.pierce || 1; let n = 0, lastT = 0;
    for (const h of hits) {
      if (n >= pierce) break;
      const pt = new V3(o.x + d.x * h.t, o.y + d.y * h.t, o.z + d.z * h.t); let dmg = s.dmg;
      if (w.pellets > 1) dmg *= clamp(1 - (h.t - 6) / (w.range - 6) * 0.75, 0.25, 1);
      if (h.e) {
        const e = h.e; const crit = pt.y > e.hitY0 + e.y + e.hitH * 0.74; const nrm = new V3(-d.x, -d.y, -d.z);
        const dealt = e.hurt(dmg, { crit, fromX: p.x, fromZ: p.z, point: pt, normal: nrm });
        if (dealt > 0) { out.hit = true; if (crit) out.crit = true; this.fx.hitFlesh(pt, crit ? 12 : 6); this.sfxAt(crit ? "hit_kill" : "hit_enemy", e.x, e.z, { vol: crit ? 0.7 : 0.55, minGap: 0.03 }); }
        else if (e.shield > 0 || e.invuln) out.hit = out.hit || false;
        n++; lastT = h.t;
        if (e.shield > 0 || e.invuln) break;
      } else { this.hurtTarget(h.tg, dmg); out.hit = true; this.fx.sparks(pt, new V3(-d.x, 0.3, -d.z).normalize(), 8); n++; }
    }
    if (n < pierce || !hits.length) {
      // wall impact
      if (wr.kind && wr.t < w.range - 0.5) {
        const pt = out.end; const nrm = new V3(wr.nx, wr.ny, wr.nz);
        if (wr.kind === "prop") { const c = L._hitProp; const b = c && c.barrel ? L.barrels.find((q) => q.col === c) : null; if (b && !b.dead) { b.hp -= s.dmg; this.fx.sparks(pt, nrm, 5); if (b.hp <= 0) this.blowBarrel(b); } else this.fx.sparks(pt, nrm, 4, [0.8, 0.9, 1]); }
        else { if (wantFx) { this.fx.sparks(pt, nrm, w.pellets > 3 ? 3 : 7); this.fx.decal(pt, nrm, w.id === "sniper" ? 0.3 : 0.2); } }
      }
    }
    return out;
  }
  updatePlayer(dt, inp) {
    const p = this.player, L = this.level;
    if (p.dead) { p.deadT += dt; p.pitch = damp(p.pitch, -0.6, 3, dt); p.eye = damp(p.eye, 0.35, 5, dt); return; }
    // look (with touch aim assist: slowdown + gentle magnetism near enemies)
    this.updateAssist(dt, inp);
    const sens = settings.sens * lerp(1, settings.adsSens, p.ads) * (this.input.touchMode ? 0.0044 : 0.0037) * this.assistSlow;
    p.yaw -= inp.lx * sens; p.pitch -= inp.ly * sens * (settings.invert ? -1 : 1); p.pitch = clamp(p.pitch, -1.45, 1.45);
    p.pitchKick = damp(p.pitchKick, 0, 7, dt); p.yawKick = damp(p.yawKick, 0, 7, dt); p.yaw += p.yawKick * dt * 6;
    if (this.input.take("crouch")) { p.crouch = !p.crouch; }
    const firing = inp.fire;
    p.sprinting = inp.sprint && inp.my > 0.3 && !p.crouch && p.grounded && !this.input.adsLatch && !(firing && p.fireCd > -0.2);
    p.sprintT = p.sprinting ? (p.sprintT || 0) + dt : 0;
    let spd = 5.4 * this.up.speed * (p.crouch ? 0.5 : 1) * (p.sprinting ? 1.55 : 1) * lerp(1, 0.62, p.ads);
    const f = Math.sin(p.yaw), c = Math.cos(p.yaw);
    let tx = (-f * inp.my + c * inp.mx) * spd, tz = (-c * inp.my - f * inp.mx) * spd;
    // dash
    p.dashCd -= dt; p.iframes -= dt;
    if (this.input.take("dash") && p.dashCd <= 0) {
      let dx = tx, dz = tz; if (Math.hypot(dx, dz) < 0.1) { dx = -f; dz = -c; } const l = Math.hypot(dx, dz); p.dashDir = [dx / l, dz / l]; p.dashT = 0.2; p.dashCd = 2.2; p.iframes = Math.max(p.iframes, 0.28); this.sfx("dash", { vol: 0.8 }); this.stats.dashes++; save.stats.dashes++; this.fovKick = 0.12; this.hud.dashFlash(); this.checkAchievements();
    }
    if (p.dashT > 0) { p.dashT -= dt; tx = p.dashDir[0] * 24; tz = p.dashDir[1] * 24; p.vx = tx; p.vz = tz; }
    else { const k = p.grounded ? 14 : 3.2; p.vx = damp(p.vx, tx, k, dt); p.vz = damp(p.vz, tz, k, dt); }
    // move with sub-steps
    const steps = Math.max(1, Math.ceil(Math.hypot(p.vx, p.vz) * dt / 0.3)), sdt = dt / steps, R = 0.42;
    for (let i = 0; i < steps; i++) {
      const nx = p.x + p.vx * sdt; if (!L.blocked(nx, p.z, R, p.y)) p.x = nx;
      const nz = p.z + p.vz * sdt; if (!L.blocked(p.x, nz, R, p.y)) p.z = nz;
    }
    p.speedNow = Math.hypot(p.vx, p.vz);
    // vertical
    const ground = L.groundAt(p.x, p.z, R);
    if (p.grounded && this.input.take("jump")) { p.vy = 7.6; p.grounded = false; this.sfx("jump", { vol: 0.5 }); }
    this.input.take("jump");
    if (!p.grounded || p.y > ground + 0.01) {
      p.vy -= 22 * dt; p.y += p.vy * dt;
      if (p.y <= ground) { if (p.vy < -7) { this.sfx("land", { vol: 0.7 }); this.shake(0.12); } p.y = ground; p.vy = 0; p.grounded = true; } else p.grounded = false;
    } else { p.y = ground; p.grounded = true; p.vy = 0; }
    // steps
    if (p.grounded && p.speedNow > 1.2) { p.stepD += p.speedNow * dt; const stride = p.sprinting ? 2.0 : p.crouch ? 3.2 : 2.5; if (p.stepD > stride) { p.stepD = 0; this.sfx(`step_${this.theme.step}${(Math.random() * 3) | 0}`, { vol: p.crouch ? 0.12 : p.sprinting ? 0.4 : 0.28, jitter: 0.15 }); } }
    p.bobT += dt * p.speedNow * (p.sprinting ? 0.9 : 1.1);
    // regen
    if (this.time - p.lastHurt > this.diff.regenDelay && p.hp < p.hpMax) p.hp = Math.min(p.hpMax, p.hp + dt * (2.5 + this.up.regen * 1.5) * this.diff.regenMul);
    p.eye = damp(p.eye, p.crouch ? 1.08 : 1.62, 12, dt);
    this.flow.compute(p.x, p.z);
    if (this.autoReloadT > 0) { this.autoReloadT -= dt; if (this.autoReloadT <= 0 && p.reloadT < 0) this.startReload(); }
  }
  updateCamera(dt, snap) {
    const p = this.player, cam = this.cam;
    const bob = p.grounded && !p.dead ? Math.sin(p.bobT * 1.8) * 0.032 * Math.min(1, p.speedNow / 5) * (1 - p.ads * 0.8) : 0;
    const sh = this.shakeT * this.shakeT * settings.shake;
    cam.position.set(p.x + (Math.random() - 0.5) * sh * 0.08, p.y + p.eye + bob + (Math.random() - 0.5) * sh * 0.08, p.z + (Math.random() - 0.5) * sh * 0.08);
    this.shakeT = Math.max(0, this.shakeT - dt * 1.6);
    this.camRoll = damp(this.camRoll, 0, 8, dt);
    const strafeRoll = -(p.vx * Math.cos(p.yaw) - p.vz * Math.sin(p.yaw)) * 0.0035;
    cam.rotation.order = "YXZ"; cam.rotation.set(p.pitch + p.pitchKick + (Math.random() - 0.5) * sh * 0.02, p.yaw, this.camRoll + strafeRoll + (p.dead ? Math.min(0.5, p.deadT * 0.8) : 0) + (Math.random() - 0.5) * sh * 0.02);
    // fov
    const w = WEAPON_BY_ID[p.cur]; this.fovKick = Math.max(0, this.fovKick - dt * 0.5);
    const mul = lerp(1, w.adsFov, p.ads) * (1 + (p.sprinting ? 0.05 : 0) + this.fovKick);
    if (Math.abs(mul - this.R.fovMul) > 0.002) { this.R.fovMul = mul; this.R.applyFov(); }
  }
  updatePoolLights(force, dt = 0.016, focus) {
    if (!this.poolLights.length || !this.level) return;
    const f = focus || this.cam.position; this.lampT -= dt;
    if (this.lampT <= 0 || force) {
      this.lampT = 0.2; const ls = this.level.lamps; const sel = [];
      for (let i = 0; i < ls.length; i++) { const l = ls[i]; const d = (l.x - f.x) ** 2 + (l.z - f.z) ** 2 + (l.y - f.y) ** 2 * 0.2; if (d > 26 * 26) continue; sel.push([d, l]); }
      sel.sort((a, b) => a[0] - b[0]); const want = sel.slice(0, this.poolLights.length).map((s) => s[1]);
      for (const pl of this.poolLights) { if (pl.userData.lamp && !want.includes(pl.userData.lamp)) { pl.userData.lamp = null; } }
      for (const l of want) { if (this.poolLights.some((pl) => pl.userData.lamp === l)) continue; const slot = this.poolLights.find((pl) => !pl.userData.lamp && (pl.intensity < 0.5 || force)); if (slot) { slot.userData.lamp = l; slot.position.set(l.x, l.y, l.z); slot.color.setRGB(l.r * 0.6 + 0.4, l.g * 0.6 + 0.4, l.b * 0.6 + 0.4).multiplyScalar(0.9); } }
    }
    const I = (this.theme && this.theme.poolI) || 22;
    for (const pl of this.poolLights) { const tgt = pl.userData.lamp ? I : 0; pl.intensity = force ? tgt : damp(pl.intensity, tgt, 6, dt); }
  }

  // ------------------------------------------------------------- play loop
  updatePlay(dt) {
    const p = this.player, inp = p.dead || this.over ? { mx: 0, my: 0, lx: 0, ly: 0, fire: false, ads: false, sprint: false } : this.input.poll(dt);
    if (p.dead || this.over) this.input.poll(dt);
    this.time += dt; if (!p.dead) { this.missionTime += dt; save.stats.playtime += dt; }
    this.updatePlayer(dt, inp);
    if (!p.dead) this.updateWeapon(dt, inp);
    for (let i = this.enemies.length - 1; i >= 0; i--) { const e = this.enemies[i]; e.update(dt); if (e.remove) { e.dispose(); this.enemies.splice(i, 1); if (e === this.boss) this.boss = null; } }
    for (const t of this.targets) { if (t.flash > 0) { t.flash -= dt; t.obj.traverse((q) => { if (q.isMesh && q.material.emissive) q.material.emissive.setRGB(t.flash * 6, t.flash * 3, t.flash * 2); }); } if (t.update) t.update(dt); }
    this.updateProjs(dt); this.updateTele(dt); this.updateWaves(dt); this.updatePickups(dt);
    this.updateCheckpoints(dt);
    if (this.objectives) this.objectives.update(dt);
    this.level.update(dt, this.time);
    for (const b of this.level.barrels) if (!b.dead) b.glow.material.opacity = 0.45 + Math.sin(this.time * 4 + b.x) * 0.15;
    if (p.iframes > 0 && p.iframes < 3 && !p.dead) { /* respawn blink handled in hud */ }
    if (p.dead && !this.survival && p.deadT > 1.6 && !this.deadShown && !this.over) { this.deadShown = true; this.mode = "dead"; this.input.enabled = false; try { document.exitPointerLock(); } catch (_e) { /* ignore */ } this.ui.showDead(); }
    this.updateCamera(dt);
    this.wv.update(dt, { moving: Math.min(1, p.speedNow / 6), sprint: p.sprinting, ads: p.ads, lookDX: inp.lx, lookDY: inp.ly, grounded: p.grounded, crouch: p.crouch });
    this.fx.update(dt, this.time, this.cam);
    this.updatePoolLights(false, dt, this.cam.position);
    this.updateSun();
    this.updateHud(dt);
    if (this.boss && !this.boss.dead && this.boss.active) this.hud.boss(this.boss);
    if (this.endT !== undefined && this.endT !== null) { this.endT -= dt; if (this.endT <= 0) { this.endT = null; this.showResults(); } }
  }
  updateSun() {
    if (!this.sunOn) return; const p = this.player;
    this.sun.position.set(p.x + this.sunDir.x * 70, this.sunDir.y * 70, p.z + this.sunDir.z * 70); this.sun.target.position.set(p.x, 0, p.z); this.sun.target.updateMatrixWorld();
  }
  updateCheckpoints(dt) {
    const p = this.player;
    for (let i = 0; i < this.cps.length; i++) {
      const c = this.cps[i]; c.ring.rotation.z += dt * 1.5; c.ring.scale.setScalar(1 + Math.sin(this.time * 3 + i) * 0.04);
      if (c.done || p.dead) continue;
      if (Math.hypot(p.x - c.x, p.z - c.z) < 2.4) {
        c.done = true; this.checkpoint = { x: c.x, z: c.z, yaw: p.yaw, name: "檢查點 " + (i + 1) };
        c.ring.material.color.setRGB(1.2, 1.4, 1.6); c.beam.material.opacity = 0.05;
        p.hp = Math.min(p.hpMax, p.hp + p.hpMax * 0.4); p.armor = Math.min(p.armorMax, p.armor + 20);
        this.sfx("checkpoint", { vol: 0.9 }); this.hud.toast("✔ 檢查點已儲存", "good"); this.hud.banner("檢查點", "進度已儲存"); persist();
        if (this.objectives) this.objectives.onCheckpoint(i);
        for (const w of WEAPONS) { const a = p.ammo[w.id]; if (a) { const s = this.ws(w); a.reserve = Math.min(s.resMax, a.reserve + Math.round(w.ammoPick * 0.7)); } }
      }
    }
  }
  updateHud(dt) {
    const p = this.player, w = WEAPON_BY_ID[p.cur], a = p.ammo[p.cur];
    this.hud.frame(this);
    this._hf = (this._hf || 0) + 1;
    if (this._hf % (isMobile ? 4 : 2) === 0) this.hud.radar(this);
    this.hud.setHP(p.hp, p.hpMax, p.armor, p.armorMax, p.iframes > 0 && p.iframes < 3.2 && p.deadT === 0 ? 0 : 1);
    this.hud.setAmmo(w, a, this.ws(w), p.reloadT >= 0 ? p.reloadT / p.reloadDur : -1);
    this.hud.dashCd(clamp(1 - p.dashCd / 2.2, 0, 1));
    const spd = lerp(w.hipSpread, w.spread, p.ads) * (1 + Math.min(1, p.speedNow / 6) * 0.8) + p.bloom; this.hud.crosshair(spd, p.ads, w);
  }
  // ------------------------------------------------------------- main frame
  start() {
    const loop = (now) => { requestAnimationFrame(loop); this.frame(now); };
    requestAnimationFrame(loop);
  }
  frame(now) {
    const rawDt = (now - (this.last || now)) / 1000; let dt = Math.min(0.05, rawDt); this.last = now;
    if (dt <= 0) dt = 0.001;
    if (this.mode === "boot") return;
    this.fpsAdapt(Math.min(rawDt, 1));
    if (this.hitStop > 0) { this.hitStop -= dt; dt *= 0.12; }
    if (this.mode === "play") this.updatePlay(dt);
    else if (this.mode === "cutscene") this.updateCutscene(dt);
    else if (this.mode === "menu" || this.mode === "result" || this.mode === "pause" || this.mode === "dead") this.updateIdle(dt);
    if (this.level) this.R.setDyn(this.player.dead ? 0.5 : (this.mode === "play" ? clamp((this.player.hp < 30 ? (30 - this.player.hp) / 30 : 0) + (this.time - this.player.lastHurt < 0.4 ? 0.3 : 0), 0, 1) * 0.8 : 0), null, 0, this.time);
    this.R.render();
  }
  updateIdle(dt) {
    this.time += dt;
    if (this.mode === "menu" || this.mode === "result") this.menuCam(dt);
    if (this.level) { this.level.update(dt, this.time); this.fx.update(dt, this.time, this.cam); this.updatePoolLights(false, dt, this.cam.position); }
    if (this.mode === "pause" || this.mode === "dead") { /* frozen */ }
  }
  menuCam(dt) {
    if (!this.level) return; this.menuT += dt;
    const path = this.M.path; const L = this.level;
    if (!this.menuPts) { this.menuPts = path.map((c) => L.cellCenter(c.cx, c.cz)); this.menuLen = 0; const P = this.menuPts; this.menuCum = [0]; for (let i = 1; i < P.length; i++) { this.menuLen += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); this.menuCum.push(this.menuLen); } }
    const sample = (s) => { s = ((s % this.menuLen) + this.menuLen) % this.menuLen; const C = this.menuCum; let i = 1; while (i < C.length - 1 && C[i] < s) i++; const k = (s - C[i - 1]) / Math.max(0.001, C[i] - C[i - 1]); const a = this.menuPts[i - 1], b = this.menuPts[i]; return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]; };
    const s = this.menuT * 3.2 + 20; const a = sample(s), b = sample(s + 7);
    const p = this.player; const h = 3.0 + Math.sin(this.menuT * 0.35) * 0.9;
    this.cam.position.set(a[0], h, a[1]);
    const tx = b[0], tz = b[1]; const yaw = Math.atan2(-(tx - a[0]), -(tz - a[1]));
    p.yaw = this.menuYaw === undefined ? yaw : this.menuYaw + angDiff(this.menuYaw, yaw) * Math.min(1, dt * 2.5); this.menuYaw = p.yaw;
    this.cam.rotation.order = "YXZ"; this.cam.rotation.set(0.12 + Math.sin(this.menuT * 0.5) * 0.04, p.yaw, Math.sin(this.menuT * 0.4) * 0.025);
    this.R.fovMul = 1; this.R.applyFov();
    p.x = a[0]; p.z = a[1]; p.y = 0;
  }
  fpsAdapt(dt) {
    this.fpsAcc += dt; this.fpsN++; this.fpsShow += dt;
    if (dt > 0.12) this.hitches = (this.hitches || 0) + 1;
    if (this.fpsAcc < 1.0) return;
    const fps = this.fpsN / this.fpsAcc, hitches = this.hitches || 0; this.fpsAcc = 0; this.fpsN = 0; this.hitches = 0; this.fpsFps = fps;
    // reference refresh rate: highest sustained fps seen (30 in iOS low-power mode, 60 normally, capped)
    this.fpsRef = Math.min(60, Math.max(this.fpsRef || 30, fps));
    if (settings.fps) this.hud.fps(Math.round(fps) + " FPS · " + this.tierName + (this.dynScale < 1 ? " · " + Math.round(this.dynScale * 100) + "%" : ""));
    if (settings.quality !== "auto" || this.mode === "boot" || document.hidden || this.mode === "pause" || this.R.lost) return;
    if (this.mode !== "cutscene" && this.mode !== "play" && this.mode !== "menu") return;
    if (this.settleT === undefined) this.settleT = 3; // ignore warm-up (shader compiles / texture uploads)
    if (this.settleT > 0) { this.settleT -= 1; return; }
    const ref = Math.max(30, this.fpsRef), minDyn = isMobile ? 0.55 : 0.7;
    const low = fps < ref * 0.82 || hitches >= 3, high = fps > ref * 0.94 && hitches === 0;
    if (low) { this.lowCount++; this.highCount = 0; } else if (high) { this.highCount++; this.lowCount = 0; } else { this.lowCount = 0; this.highCount = 0; }
    if (this.lowCount >= 2) {
      this.lowCount = 0;
      if (this.dynScale > minDyn + 0.01) { this.dynScale = Math.max(minDyn, this.dynScale - 0.12); this.R.setDynScale(this.dynScale); }
      else { const i = TIER_ORDER.indexOf(this.tierName); if (i < TIER_ORDER.length - 1) { this.R.setTier(TIER_ORDER[i + 1], this.scene, this.cam, this.wv.scene, this.wv.cam); this.applyTierExtras(); this.dynScale = 0.9; this.R.setDynScale(0.9); this.settleT = 3; } }
    } else if (this.highCount >= 6 && this.dynScale < 1) { this.highCount = 0; this.dynScale = Math.min(1, this.dynScale + 0.08); this.R.setDynScale(this.dynScale); }
  }
  // ------------------------------------------------------------- flow control
  async enterMenu() {
    this.ui && this.ui.loading(true, "載入城市…");
    if (!this.menuWorld || !this.level) { await this.buildWorld(LEVELS[0], false); this.menuWorld = true; }
    this.survival = false; this.menuPts = null; this.menuYaw = undefined;
    this.player = this.newPlayer(); this.wv.holder.visible = false; this.hud.show(false); this.hud.hideBoss(); this.hud.hideOverlay();
    this.mode = "menu"; this.input.enabled = false; this.over = false; this.endT = null;
    A.playMusic("menu"); A.playAmbient(null);
    this.ui && this.ui.loading(false);
  }
  beginPlay() {
    this.mode = "play"; this.input.enabled = true; this.input.reset(); this.wv.holder.visible = true; this.cut = null;
    this.hud.show(true); this.hud.hideSubtitle(); this.hud.setWeapon(WEAPON_BY_ID[this.player.cur]); this.hud.slots(this.ownedList(), this.player.cur);
    this.hud.setCredits(save.credits);
    this.menuWorld = false;
    A.playMusic(this.theme.music, { fade: 2 }); A.playAmbient(this.theme.amb);
    A.preloadMusic(["boss1", "boss2"]);
    this.last = performance.now();
  }
  pause() {
    if (this.mode !== "play") return; this.mode = "pause"; this.input.enabled = false; try { document.exitPointerLock(); } catch (_e) { /* ignore */ }
    this.hud.showPause(true); A.setDuck(0.35); this.input.reset(); persist();
  }
  resume() { if (this.mode !== "pause") return; this.mode = "play"; this.input.enabled = true; this.input.reset(); this.hud.showPause(false); A.setDuck(1); this.last = performance.now(); }
  // --- cutscenes (camera crane + subtitles)
  playCutscene(lines, kind, done) {
    this.mode = "cutscene"; this.input.enabled = false; this.wv.holder.visible = false; this.hud.show(false);
    const dur = Math.max(5, lines.length * 3.6);
    this.cut = { t: 0, dur, lines, idx: -1, lineT: 99, done, kind, lineDur: 3.6 };
    this.nextLine();
  }
  nextLine() {
    const c = this.cut; if (!c) return; c.idx++;
    if (c.idx >= c.lines.length) { const d = c.done; this.cut = null; this.hud.hideSubtitle(); d && d(); return; }
    c.lineT = 0; this.hud.subtitle(c.lines[c.idx][0], c.lines[c.idx][1], c.idx, c.lines.length); this.sfx("ui_click", { vol: 0.35 });
  }
  skipCutscene() { const c = this.cut; if (!c) return; const d = c.done; this.cut = null; this.hud.hideSubtitle(); d && d(); }
  updateCutscene(dt) {
    const c = this.cut; if (!c) return; this.time += dt; c.t += dt; c.lineT += dt;
    if (c.lineT > c.lineDur + Math.min(1.2, c.lines[c.idx][1].length * 0.012)) this.nextLine();
    if (!this.cut) return;
    const L = this.level, p = this.player, M = this.M; const k = Math.min(1, c.t / c.dur), e = k * k * (3 - 2 * k);
    if (c.kind === "brief") {
      const [sx, sz] = L.cellCenter(M.start.cx, M.start.cz), yaw = p.yaw;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      const fromX = sx - fx * 16 + Math.cos(yaw) * 10 * (1 - e), fromZ = sz - fz * 16 + Math.sin(-yaw) * 10 * (1 - e);
      const px = lerp(fromX, p.x, e), pz = lerp(fromZ, p.z, e), py = lerp(26, 1.62, e * e);
      this.cam.position.set(px, py, pz);
      const lx = lerp(sx + fx * 6, p.x + fx * 10, e), lz = lerp(sz + fz * 6, p.z + fz * 10, e), ly = lerp(0, 1.6, e);
      this.cam.lookAt(lx, ly, lz);
      this.cam.rotation.z = 0;
    } else {
      const cx = c.kind === "ending" && M.arena ? L.cellCenter(M.arena.cx, M.arena.cz)[0] : L.SIZE_X / 2, cz = c.kind === "ending" && M.arena ? L.cellCenter(M.arena.cx, M.arena.cz)[1] : L.SIZE_Z / 2;
      const a = c.t * 0.12, r = c.kind === "ending" ? 13 : 24; this.cam.position.set(cx + Math.cos(a) * r, 8 + Math.sin(c.t * 0.3) * 2, cz + Math.sin(a) * r); this.cam.lookAt(cx, 1.5, cz);
    }
    this.R.fovMul = 1; this.R.applyFov();
    this.level.update(dt, this.time); this.fx.update(dt, this.time, this.cam); this.updatePoolLights(false, dt, this.cam.position);
    for (const e2 of this.enemies) { if (e2.mixer) e2.mixer.update(dt * 0.3); }
  }
  // --- mission results
  completeMission() {
    if (this.over) return; this.over = true; this.endT = 2.4; this.god = this.god; this.player.iframes = 99;
    this.sfx("level_complete", { vol: 1 }); this.hud.banner("任務完成", this.def.name); this.success = true; this.beamStop();
    A.stopMusic(1.2);
    for (const e of this.enemies) if (!e.dead && !e.boss) { e.hurt(9999, { silent: true }); }
  }
  failSurvival() { if (this.over) return; this.over = true; this.success = false; this.endT = 1.8; A.stopMusic(1.5); }
  showResults() {
    const st = this.stats, def = this.def, surv = this.survival; this.mode = "result"; this.input.enabled = false; try { document.exitPointerLock(); } catch (_e) { /* ignore */ }
    this.wv.holder.visible = false; this.hud.show(false); this.hud.hideBoss(); this.hud.hideOverlay(); this.hud.scope(false);
    const acc = st.shots ? Math.round(st.hits / st.shots * 100) : 0;
    const R = { success: this.success, name: def.name, id: def.id, kills: st.kills, acc, time: this.missionTime, credits: st.credits, deaths: st.deaths, chips: st.chips, survival: surv };
    if (surv) {
      R.wave = this.objectives.wave; R.score = Math.round(this.score || 0);
      save.stats.survBest = Math.max(save.stats.survBest, R.wave); save.lb.push({ name: save.name, wave: R.wave, score: R.score, kills: st.kills, date: Date.now() }); save.lb.sort((a, b) => b.wave - a.wave || b.score - a.score); save.lb = save.lb.slice(0, 10);
      R.rank = save.lb.findIndex((x) => x.date === save.lb[save.lb.findIndex((y) => y.score === R.score && y.wave === R.wave)]?.date) + 1;
    } else if (this.success) {
      const stars = 1 + (this.missionTime <= def.par ? 1 : 0) + (this.revived === 0 ? 1 : 0); R.stars = stars; R.par = def.par;
      const bonus = 150 * def.lvl + (stars - 1) * 100; this.addCredits(bonus); R.bonus = bonus; R.credits = st.credits;
      const old = save.levels[def.id] || { stars: 0, best: 1e9, clears: 0 };
      save.levels[def.id] = { stars: Math.max(old.stars, stars), best: Math.min(old.best, this.missionTime), clears: old.clears + 1 };
      save.unlocked = Math.max(save.unlocked, Math.min(6, def.id + 1)); save.stats.levels++;
      const rw = LEVEL_WEAPON_REWARD[def.id]; if (rw && !save.owned[rw]) { save.owned[rw] = true; R.reward = WEAPON_BY_ID[rw]; }
      if (this.revived === 0) { /* flawless */ }
      A.playMusic("victory", { once: true, fade: 1 });
    }
    this.checkAchievements(); persist();
    if (!this.success) A.playMusic("menu", { fade: 2 });
    this.ui.showResults(R);
  }
  // debugging helpers
  exposeDebug() {
    this.debug = true;
    window.__g = this;
  }
  dispose() { this.clearMission(); }
}
