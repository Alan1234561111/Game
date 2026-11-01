import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { pbr, cloneNode, normalise, glowTexture } from "./assets.js";
import { rng } from "./util.js";

export const CELL = 4, LOW_H = 1.05;
const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]];

class GB {
  constructor(colors) { this.p = []; this.n = []; this.u = []; this.c = colors ? [] : null; this.i = []; }
  quad(a, b, c, d, n, uv, col) {
    const base = this.p.length / 3;
    for (const v of [a, b, c, d]) { this.p.push(v[0], v[1], v[2]); this.n.push(n[0], n[1], n[2]); if (this.c) this.c.push(col[0], col[1], col[2]); }
    this.u.push(uv[0], uv[1], uv[2], uv[3], uv[4], uv[5], uv[6], uv[7]);
    this.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  get empty() { return this.p.length === 0; }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.u, 2));
    if (this.c) g.setAttribute("color", new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.i); g.computeBoundingSphere();
    return g;
  }
}
const hash = (a, b, c) => Math.abs(Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453) % 1;

export class Level {
  constructor(def, theme, M, sets, models) {
    this.def = def; this.theme = theme; this.M = M; this.G = M.G; this.W = M.G.W; this.H = M.G.H; this.g = M.G.g;
    this.sets = sets; this.models = models;
    this.SIZE_X = this.W * CELL; this.SIZE_Z = this.H * CELL;
    this.WH = theme.WH; this.WHo = theme.WHo;
    this.group = new THREE.Group();
    this.colliders = []; this.barrels = []; this.lamps = []; this.doorMeshes = new Map();
    this.pal = theme.neon.pal.map((c) => new THREE.Color(c));
    this.flick = [];
    this.rand = rng(def.seed + 99);
    this.materials = [];
    this.casters = [];
  }
  // ---------------------------------------------------------------- queries
  code(cx, cz) { return cx < 0 || cz < 0 || cx >= this.W || cz >= this.H ? 1 : this.g[cz * this.W + cx]; }
  hOf(c) { return c === 1 ? this.WHo : c === 3 ? LOW_H : this.WH; }
  tallSolid(cx, cz) { const c = this.code(cx, cz); return c === 1 || c === 2 || c === 4; }
  solidCell(cx, cz, feet = 0) { const c = this.code(cx, cz); if (c === 0) return false; if (c === 3) return feet < LOW_H - 0.12; return true; }
  isOpenCell(cx, cz) { return this.code(cx, cz) === 0; }
  walkable(cx, cz) { const c = this.code(cx, cz); return c === 0; }
  circleHits(x, z, r, feet = 0) {
    const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL), z0 = Math.floor((z - r) / CELL), z1 = Math.floor((z + r) / CELL);
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
      if (!this.solidCell(cx, cz, feet)) continue;
      const nx = Math.max(cx * CELL, Math.min(x, cx * CELL + CELL)), nz = Math.max(cz * CELL, Math.min(z, cz * CELL + CELL));
      const dx = x - nx, dz = z - nz; if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }
  propHit(x, z, r, feet = 0) {
    for (const c of this.colliders) { if (feet >= c.h - 0.12) continue; const dx = x - c.x, dz = z - c.z, rr = r + c.r; if (dx * dx + dz * dz < rr * rr) return c; }
    return null;
  }
  blocked(x, z, r, feet = 0) { return this.circleHits(x, z, r, feet) || !!this.propHit(x, z, r, feet); }
  groundAt(x, z, r) {
    let h = 0; const rr = r * 0.8;
    const x0 = Math.floor((x - rr) / CELL), x1 = Math.floor((x + rr) / CELL), z0 = Math.floor((z - rr) / CELL), z1 = Math.floor((z + rr) / CELL);
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) if (this.code(cx, cz) === 3) {
      const nx = Math.max(cx * CELL, Math.min(x, cx * CELL + CELL)), nz = Math.max(cz * CELL, Math.min(z, cz * CELL + CELL));
      const dx = x - nx, dz = z - nz; if (dx * dx + dz * dz < (rr + 0.05) * (rr + 0.05)) h = Math.max(h, LOW_H);
    }
    for (const c of this.colliders) { const dx = x - c.x, dz = z - c.z, q = rr + c.r; if (dx * dx + dz * dz < q * q) h = Math.max(h, c.h); }
    return h;
  }
  // 2D line of sight vs tall walls only
  los(x0, z0, x1, z1) {
    const dx = x1 - x0, dz = z1 - z0, d = Math.hypot(dx, dz); if (d < 0.01) return true;
    return this.ray2D(x0, z0, dx, dz, d) >= d - 0.02;
  }
  ray2D(ox, oz, dx, dz, maxD) {
    const len = Math.hypot(dx, dz); if (len < 1e-6) return maxD; dx /= len; dz /= len;
    let cx = Math.floor(ox / CELL), cz = Math.floor(oz / CELL);
    if (this.tallSolid(cx, cz)) return 0;
    const sx = dx < 0 ? -1 : 1, sz = dz < 0 ? -1 : 1;
    const tdx = dx === 0 ? Infinity : Math.abs(CELL / dx), tdz = dz === 0 ? Infinity : Math.abs(CELL / dz);
    let tx = dx === 0 ? Infinity : ((dx < 0 ? ox - cx * CELL : (cx + 1) * CELL - ox)) / Math.abs(dx);
    let tz = dz === 0 ? Infinity : ((dz < 0 ? oz - cz * CELL : (cz + 1) * CELL - oz)) / Math.abs(dz);
    for (let i = 0; i < 120; i++) {
      let t; if (tx < tz) { t = tx; tx += tdx; cx += sx; } else { t = tz; tz += tdz; cz += sz; }
      if (t > maxD) return maxD;
      if (this.tallSolid(cx, cz) && this.hOf(this.code(cx, cz)) > 1.7) return t;
    }
    return maxD;
  }
  // full 3D ray vs world (walls with heights, floor, ceiling). dir must be normalised.
  ray(ox, oy, oz, dx, dy, dz, maxT = 120) {
    let bestT = maxT, nx = 0, ny = 1, nz = 0, kind = null;
    if (dy < -1e-5) { const t = -oy / dy; if (t > 0 && t < bestT) { bestT = t; nx = 0; ny = 1; nz = 0; kind = "floor"; } }
    if (this.theme.ceil && dy > 1e-5) { const t = (this.WH - oy) / dy; if (t > 0 && t < bestT) { bestT = t; nx = 0; ny = -1; nz = 0; kind = "ceil"; } }
    const hd = Math.hypot(dx, dz);
    if (hd > 1e-6) {
      const ux = dx / hd, uz = dz / hd;
      let cx = Math.floor(ox / CELL), cz = Math.floor(oz / CELL);
      const sx = ux < 0 ? -1 : 1, sz = uz < 0 ? -1 : 1;
      const tdx = ux === 0 ? Infinity : Math.abs(CELL / ux), tdz = uz === 0 ? Infinity : Math.abs(CELL / uz);
      let tx = ux === 0 ? Infinity : ((ux < 0 ? ox - cx * CELL : (cx + 1) * CELL - ox)) / Math.abs(ux);
      let tz = uz === 0 ? Infinity : ((uz < 0 ? oz - cz * CELL : (cz + 1) * CELL - oz)) / Math.abs(uz);
      const maxD2 = bestT * hd;
      let tEntry = 0, axis = 0;
      for (let i = 0; i < 140; i++) {
        let tNext; if (tx < tz) { tNext = tx; tx += tdx; cx += sx; axis = 0; } else { tNext = tz; tz += tdz; cz += sz; axis = 1; }
        if (tNext > maxD2) break;
        const c = this.code(cx, cz);
        if (c !== 0) {
          const h = this.hOf(c);
          const tE = tNext / hd; const yE = oy + dy * tE;
          // exit of this cell
          const tExit = Math.min(tx, tz) / hd;
          if (yE <= h && yE >= -0.01) { if (tE < bestT) { bestT = tE; nx = axis === 0 ? -sx : 0; nz = axis === 1 ? -sz : 0; ny = 0; kind = c === 3 ? "low" : "wall"; } break; }
          if (dy < 0 && yE > h) { const tTop = (h - oy) / dy; if (tTop >= tE && tTop <= tExit && tTop < bestT) { bestT = tTop; nx = 0; ny = 1; nz = 0; kind = "top"; break; } }
        }
      }
    }
    // props (vertical cylinders)
    for (const c of this.colliders) {
      const px = ox - c.x, pz = oz - c.z; const a = dx * dx + dz * dz; if (a < 1e-8) continue;
      const b = px * dx + pz * dz, cc = px * px + pz * pz - c.r * c.r; const disc = b * b - a * cc; if (disc < 0) continue;
      const t = (-b - Math.sqrt(disc)) / a; if (t > 0 && t < bestT) { const y = oy + dy * t; if (y >= 0 && y <= c.h) { bestT = t; const hx = ox + dx * t - c.x, hz = oz + dz * t - c.z, l = Math.hypot(hx, hz) || 1; nx = hx / l; nz = hz / l; ny = 0; kind = "prop"; this._hitProp = c; } }
    }
    return { t: bestT, nx, ny, nz, kind, hit: kind !== null };
  }
  // point inside solid geometry (for projectiles)
  pointSolid(x, y, z) {
    if (y < 0) return "floor"; if (this.theme.ceil && y > this.WH) return "ceil";
    const c = this.code(Math.floor(x / CELL), Math.floor(z / CELL));
    if (c !== 0 && y <= this.hOf(c)) return "wall";
    for (const k of this.colliders) { const dx = x - k.x, dz = z - k.z; if (dx * dx + dz * dz < k.r * k.r && y <= k.h) return k; }
    return null;
  }
  cellCenter(cx, cz) { return [(cx + 0.5) * CELL, (cz + 0.5) * CELL]; }
  openDoors() {
    for (const d of this.M.doors || []) { this.g[d.cz * this.W + d.cx] = 0; const m = this.doorMeshes.get(d.cz * this.W + d.cx); if (m) m.userData.opening = true; }
    this.G.g = this.g;
  }

  // ---------------------------------------------------------------- build
  build(scene) {
    const T = this.theme, S = this.sets, W = this.W, H = this.H;
    const wallB = new GB(), wallI = new GB(), top = new GB(), low = new GB(), neon = new GB(true), hazard = new GB();
    const up = [0, 1, 0];
    const tw = T.tile.wall, tc = T.tile.cap;
    this.lampCandidates = [];
    for (let cz = 0; cz < H; cz++) for (let cx = 0; cx < W; cx++) {
      const c = this.code(cx, cz); if (c === 0) continue;
      if (c === 4) { this.buildDoor(cx, cz); continue; }
      const hh = this.hOf(c);
      const x0 = cx * CELL, x1 = x0 + CELL, z0 = cz * CELL, z1 = z0 + CELL;
      if (c !== 4) top.quad([x0, hh, z1], [x1, hh, z1], [x1, hh, z0], [x0, hh, z0], up, [x0 / tc, z1 / tc, x1 / tc, z1 / tc, x1 / tc, z0 / tc, x0 / tc, z0 / tc]);
      for (let k = 0; k < 4; k++) {
        const [nx, nz] = DIRS[k];
        const nc = this.code(cx + nx, cz + nz);
        if (!(nc === 0 || nc === 4 || (nc === 3 && c !== 3))) continue;
        const n = [nx, 0, nz];
        const right = [up[1] * n[2] - up[2] * n[1], 0, up[0] * n[1] - up[1] * n[0]];
        const cxw = (cx + 0.5) * CELL + nx * CELL / 2, czw = (cz + 0.5) * CELL + nz * CELL / 2;
        const a = [cxw - right[0] * CELL / 2, 0, czw - right[2] * CELL / 2], b = [cxw + right[0] * CELL / 2, 0, czw + right[2] * CELL / 2];
        const cc = [b[0], hh, b[2]], d = [a[0], hh, a[2]];
        const ua = (a[0] * right[0] + a[2] * right[2]) / (c === 3 ? tc : tw[0]), ub = (b[0] * right[0] + b[2] * right[2]) / (c === 3 ? tc : tw[0]);
        const vt = hh / (c === 3 ? tc : tw[1]);
        const gb = c === 3 ? low : c === 1 ? wallB : wallI;
        gb.quad(a, b, cc, d, n, [ua, 0, ub, 0, ub, vt, ua, vt]);
        this.lampCandidates.push({ cx, cz, k, nx, nz, cxw, czw, right, c, hh });
        if (c === 3) { this.lowTopStrip(neon, cxw, czw, nx, nz, right, hh, cx, cz); continue; }
        this.neonFace(neon, hazard, cx, cz, k, nx, nz, n, right, cxw, czw, hh);
      }
    }
    const mk = (geom, mat, name) => { const m = new THREE.Mesh(geom, mat); m.matrixAutoUpdate = false; m.updateMatrix(); m.name = name; this.group.add(m); this.casters.push(m); return m; };
    const wallMat = pbr(S.wall, { metalness: T.metal ?? 1, color: T.col.wall, emissiveIntensity: T.emis.wall ?? 1 }), blockMat = pbr(S.block, { metalness: T.metal ?? 1, color: T.col.block, emissiveIntensity: T.emis.block ?? 1 });
    const capMat = pbr(S.cap, { color: T.col.cap, noEmissive: true });
    this.materials.push(wallMat, blockMat, capMat);
    if (!wallB.empty) mk(wallB.build(), wallMat, "wallB").receiveShadow = true;
    if (!wallI.empty) mk(wallI.build(), blockMat, "wallI").receiveShadow = true;
    mk(top.build(), capMat, "top").receiveShadow = true;
    if (!low.empty) { const m = mk(low.build(), capMat, "low"); m.receiveShadow = true; }
    const neonMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: true }); this.materials.push(neonMat);
    if (!neon.empty) { const m = mk(neon.build(), neonMat, "neon"); this.casters.pop(); }
    if (!hazard.empty) { const hm = new THREE.MeshStandardMaterial({ map: this.hazardTex(), roughness: 0.7, metalness: 0.3, emissive: 0x442200, emissiveMap: this.hazardTex(), emissiveIntensity: 0.5 }); this.materials.push(hm); mk(hazard.build(), hm, "hazard"); }
    // floor
    const SX = this.SIZE_X, SZ = this.SIZE_Z;
    const fg = new THREE.PlaneGeometry(SX, SZ); fg.rotateX(-Math.PI / 2); fg.translate(SX / 2, 0, SZ / 2);
    const uv = fg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * SX / T.tile.floor, uv.getY(i) * SZ / T.tile.floor);
    const floorMat = pbr(S.floor, { metalness: T.metal ?? 1, color: T.col.floor, noEmissive: true, roughness: T.floorRough ?? 1 }); this.materials.push(floorMat);
    this.floor = new THREE.Mesh(fg, floorMat); this.floor.receiveShadow = true; this.group.add(this.floor);
    // outer ground
    const og = new THREE.PlaneGeometry(1400, 1400); og.rotateX(-Math.PI / 2); og.translate(SX / 2, -0.06, SZ / 2);
    const gcol = new THREE.Color(T.fog[0]).multiplyScalar(T.snowFloor ? 1.5 : 0.5);
    const groundMat = new THREE.MeshBasicMaterial({ color: gcol }); this.materials.push(groundMat);
    this.group.add(new THREE.Mesh(og, groundMat));
    // ceiling
    if (T.ceil) this.buildCeiling();
    this.buildLamps();
    this.buildProps();
    scene.add(this.group);
    return this;
  }
  hazardTex() {
    if (this._hz) return this._hz;
    const c = document.createElement("canvas"); c.width = c.height = 128; const x = c.getContext("2d");
    x.fillStyle = "#1a1a1a"; x.fillRect(0, 0, 128, 128); x.fillStyle = "#ffb020";
    for (let i = -4; i < 8; i++) { x.beginPath(); x.moveTo(i * 32, 128); x.lineTo(i * 32 + 16, 128); x.lineTo(i * 32 + 16 + 128, 0); x.lineTo(i * 32 + 128, 0); x.closePath(); x.fill(); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 2; this._hz = t; return t;
  }
  neonColor(cx, cz, k = 1.5) {
    const h = hash(cx, cz, 5); const P = this.pal;
    const t = Math.min(1, Math.max(0, (cx + cz) / (this.W + this.H - 4)));
    const c = P[0].clone().lerp(P[1], t);
    if (h > 0.9 && P[2]) c.copy(P[2]); else if (h < 0.1 && P[3]) c.copy(P[3]);
    return c.multiplyScalar(k);
  }
  lowTopStrip(neon, cxw, czw, nx, nz, right, hh, cx, cz) {
    const col = this.neonColor(cx, cz, 1.5), off = 0.02;
    const p = (s, y) => [cxw + right[0] * s + nx * off, y, czw + right[2] * s + nz * off];
    neon.quad(p(-CELL / 2, hh - 0.2), p(CELL / 2, hh - 0.2), p(CELL / 2, hh - 0.1), p(-CELL / 2, hh - 0.1), [nx, 0, nz], [0, 0, 1, 0, 1, 1, 0, 1], [col.r, col.g, col.b]);
  }
  neonFace(neon, hazard, cx, cz, k, nx, nz, n, right, cxw, czw, hh) {
    const T = this.theme, st = T.neon.style, off = 0.035;
    const p = (s, y) => [cxw + right[0] * s + nx * off, y, czw + right[2] * s + nz * off];
    const strip = (y0, y1, s0, s1, col) => neon.quad(p(s0, y0), p(s1, y0), p(s1, y1), p(s0, y1), n, [0, 0, 1, 0, 1, 1, 0, 1], [col.r, col.g, col.b]);
    const h1 = hash(cx, cz, k), h2 = hash(cz, cx, k + 7), dens = T.neon.dens;
    const col = this.neonColor(cx, cz, 1.7);
    if (st === "city") {
      strip(0.2, 0.34, -CELL / 2, CELL / 2, col);
      const yTop = Math.min(hh - 0.5, hh > 6 ? 4.2 : hh - 0.5);
      strip(yTop, yTop + 0.14, -CELL / 2, CELL / 2, col);
      if (hh <= 6) { const p2 = (s, d) => [cxw + right[0] * s - nx * d, hh + 0.012, czw + right[2] * s - nz * d]; neon.quad(p2(-CELL / 2, 0.22), p2(CELL / 2, 0.22), p2(CELL / 2, 0), p2(-CELL / 2, 0), [0, 1, 0], [0, 0, 1, 0, 1, 1, 0, 1], [col.r * 0.9, col.g * 0.9, col.b * 0.9]); }
      if (h1 > 1 - dens * 0.55) { const cb = this.neonColor(cx + 1, cz, 2.0); const y0 = hh > 6 ? 1.2 + hash(cx, cz, 9) * 3 : 0.6; strip(y0, Math.min(hh - 0.8, y0 + (hh > 6 ? 3.5 : 2.2)), -0.08, 0.08, cb); this.lamps.push({ x: cxw + nx * 2.6, y: 2.2, z: czw + nz * 2.6, r: cb.r / 2, g: cb.g / 2, b: cb.b / 2 }); }
      else if (h2 > 1 - dens * 0.5) { const cp = this.neonColor(cx, cz + 1, 0.6); const y0 = hh > 6 ? 2 + hash(cx, cz, 4) * 4 : 1.2; const y1 = y0 + 1.3; const fr = this.neonColor(cx, cz + 1, 1.6); strip(y0, y1, -1.0, 1.0, cp.clone().multiplyScalar(0.5)); strip(y0 - 0.1, y0, -1.1, 1.1, fr); strip(y1, y1 + 0.1, -1.1, 1.1, fr); strip(y0, y1, -1.1, -1.0, fr); strip(y0, y1, 1.0, 1.1, fr); this.lamps.push({ x: cxw + nx * 2.6, y: y0 + 0.7, z: czw + nz * 2.6, r: fr.r / 1.6, g: fr.g / 1.6, b: fr.b / 1.6 }); }
    } else if (st === "hazard") {
      // hazard band at the base + amber caged lamps
      const hq = (y0, y1) => { const u = CELL / 1.2; hazard.quad(p(-CELL / 2, y0), p(CELL / 2, y0), p(CELL / 2, y1), p(-CELL / 2, y1), n, [0, 0, u, 0, u, (y1 - y0) / 1.2, 0, (y1 - y0) / 1.2]); };
      hq(0.02, 0.4);
      if (hh > 4) { const ya = 3.2; strip(ya, ya + 0.1, -CELL / 2, CELL / 2, this.pal[0].clone().multiplyScalar(1.1)); }
      if (h1 > 1 - dens * 0.5) { const cl = this.pal[hash(cx, cz, 3) > 0.5 ? 0 : 1].clone().multiplyScalar(2.2); strip(2.6, 3.0, -0.35, 0.35, cl); strip(2.55, 2.6, -0.45, 0.45, new THREE.Color(0x222222)); this.lamps.push({ x: cxw + nx * 2.6, y: 2.8, z: czw + nz * 2.6, r: cl.r / 2.2, g: cl.g / 2.2, b: cl.b / 2.2 }); }
    } else if (st === "clean") {
      const cl = this.pal[0].clone().multiplyScalar(1.3);
      strip(1.35, 1.42, -CELL / 2, CELL / 2, cl); strip(0.05, 0.12, -CELL / 2, CELL / 2, cl.clone().multiplyScalar(0.5));
      if (h1 > 1 - dens * 0.4) { const cw = this.pal[1].clone().multiplyScalar(1.6); strip(1.7, 2.9, -0.9, 0.9, cw.clone().multiplyScalar(0.45)); strip(1.65, 1.7, -0.95, 0.95, cw); strip(2.9, 2.95, -0.95, 0.95, cw); this.lamps.push({ x: cxw + nx * 2.6, y: 2.3, z: czw + nz * 2.6, r: 0.7, g: 0.9, b: 1 }); }
    } else if (st === "lantern") {
      if (h1 > 0.8) { const cl = new THREE.Color(0xffb060).multiplyScalar(1.8); strip(2.4, 2.8, -0.2, 0.2, cl); this.lamps.push({ x: cxw + nx * 2.6, y: 2.6, z: czw + nz * 2.6, r: 1, g: 0.7, b: 0.4 }); }
      if (hh > 4 && h2 > 0.7) strip(0.1, 0.18, -CELL / 2, CELL / 2, this.pal[0].clone().multiplyScalar(0.8));
    }
  }
  buildDoor(cx, cz) {
    const g = new THREE.BoxGeometry(CELL, this.WH, CELL * 0.9); g.translate(0, this.WH / 2, 0);
    const col = new THREE.Color(0xff3a4a);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x2a3038, roughness: 0.4, metalness: 0.9, emissive: col, emissiveIntensity: 0.9 }));
    m.position.set((cx + 0.5) * CELL, 0, (cz + 0.5) * CELL); this.group.add(m); this.doorMeshes.set(cz * this.W + cx, m); this.materials.push(m.material);
    this.lamps.push({ x: m.position.x - 1.5, y: 2, z: m.position.z, r: 1, g: 0.2, b: 0.25 });
  }
  buildCeiling() {
    const T = this.theme, S = this.sets, SX = this.SIZE_X, SZ = this.SIZE_Z;
    const g = new THREE.PlaneGeometry(SX, SZ); g.rotateX(Math.PI / 2); g.translate(SX / 2, this.WH, SZ / 2);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * SX / T.tile.ceil, uv.getY(i) * SZ / T.tile.ceil);
    const m = pbr(S.ceil, { color: 0x9aa4ac, noEmissive: true }); this.materials.push(m);
    const mesh = new THREE.Mesh(g, m); this.group.add(mesh);
    // ceiling panels
    const spots = [];
    for (let cz = 0; cz < this.H; cz++) for (let cx = 0; cx < this.W; cx++) if (this.code(cx, cz) === 0 && cx % 2 === 0 && cz % 2 === 0) spots.push([cx, cz]);
    const bg = new THREE.BoxGeometry(1.8, 0.08, 0.7);
    const im = new THREE.InstancedMesh(bg, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), spots.length); this.materials.push(im.material);
    const mtx = new THREE.Matrix4(), col = new THREE.Color();
    spots.forEach(([cx, cz], i) => { mtx.makeTranslation((cx + 0.5) * CELL + 1, this.WH - 0.05, (cz + 0.5) * CELL); im.setMatrixAt(i, mtx); col.copy(this.pal[1]).multiplyScalar(2.4); im.setColorAt(i, col); if (hash(cx, cz, 2) > 0.9) this.flick.push(i); this.lamps.push({ x: (cx + 0.5) * CELL + 1, y: this.WH - 0.5, z: (cz + 0.5) * CELL, r: 0.8, g: 0.95, b: 1 }); });
    this.panels = im; this.group.add(im);
  }
  buildLamps() {
    const T = this.theme;
    if (!T.lampPost) return;
    const R = this.rand, posts = [], heads = [], cones = [];
    const cands = R.shuffle((this.M.lampCells || []).filter((c) => this.tallSolid(c.cx - 1, c.cz) || this.tallSolid(c.cx + 1, c.cz) || this.tallSolid(c.cx, c.cz - 1) || this.tallSolid(c.cx, c.cz + 1)));
    const used = []; const max = T.snowFloor ? 14 : 18;
    const lampCols = T.lamp.map((c) => new THREE.Color(c));
    for (const c of cands) {
      if (used.length >= max) break;
      if (used.some((u) => Math.hypot(u.cx - c.cx, u.cz - c.cz) < 5)) continue;
      let dir = null; for (const [dx, dz] of DIRS) if (this.tallSolid(c.cx + dx, c.cz + dz)) { dir = [dx, dz]; break; } if (!dir) continue;
      used.push(c);
      const px = (c.cx + 0.5) * CELL + dir[0] * 1.55, pz = (c.cz + 0.5) * CELL + dir[1] * 1.55, H = 4.6;
      const pole = new THREE.CylinderGeometry(0.07, 0.1, H, 6); pole.translate(px, H / 2, pz); posts.push(pole);
      const hx = px - dir[0] * 0.9, hz = pz - dir[1] * 0.9;
      const arm = new THREE.BoxGeometry(Math.abs(dir[0]) ? 0.95 : 0.1, 0.08, Math.abs(dir[1]) ? 0.95 : 0.1); arm.translate(px - dir[0] * 0.45, H, pz - dir[1] * 0.45); posts.push(arm);
      const col = lampCols[Math.floor(R() * lampCols.length)];
      const head = new THREE.BoxGeometry(0.55, 0.1, 0.3); head.translate(hx, H - 0.04, hz);
      const cols = new Float32Array(head.attributes.position.count * 3); for (let i = 0; i < cols.length; i += 3) { cols[i] = col.r * 2.6; cols[i + 1] = col.g * 2.6; cols[i + 2] = col.b * 2.6; }
      head.setAttribute("color", new THREE.BufferAttribute(cols, 3)); heads.push(head);
      const cone = new THREE.ConeGeometry(2.3, H - 0.1, 14, 1, true); cone.translate(0, -(H - 0.1) / 2, 0); cone.translate(hx, H - 0.06, hz);
      const cc = new Float32Array(cone.attributes.position.count * 3); for (let i = 0; i < cc.length; i += 3) { cc[i] = col.r; cc[i + 1] = col.g; cc[i + 2] = col.b; }
      cone.setAttribute("color", new THREE.BufferAttribute(cc, 3)); cones.push(cone);
      this.lamps.push({ x: hx, y: H - 0.6, z: hz, r: col.r, g: col.g, b: col.b, post: true });
    }
    if (posts.length) { const m = new THREE.Mesh(mergeGeometries(posts), new THREE.MeshStandardMaterial({ color: 0x20242e, roughness: 0.6, metalness: 0.8 })); this.group.add(m); this.materials.push(m.material); m.castShadow = true; }
    if (heads.length) { const m = new THREE.Mesh(mergeGeometries(heads), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })); this.group.add(m); this.materials.push(m.material); }
    if (cones.length) {
      const mat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
        uniforms: { uInt: { value: T.snowFloor ? 0.2 : 0.16 } },
        vertexColors: true,
        vertexShader: `varying vec3 vC; varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vC=color; vY=position.y; vec4 mv=modelViewMatrix*vec4(position,1.0); vV=normalize(-mv.xyz); vN=normalize(normalMatrix*normal); gl_Position=projectionMatrix*mv; }`,
        fragmentShader: `uniform float uInt; varying vec3 vC; varying float vY; varying vec3 vN; varying vec3 vV; void main(){ float f=abs(dot(normalize(vN),normalize(vV))); float a=pow(f,1.6)*uInt; gl_FragColor=vec4(vC*a,1.0); }`,
      });
      const m = new THREE.Mesh(mergeGeometries(cones), mat); m.frustumCulled = false; m.renderOrder = 3; this.group.add(m); this.materials.push(mat); this.cones = m;
    }
  }
  buildProps() {
    const M = this.models, props = this.M.props || [], T = this.theme;
    const R = this.rand;
    const wrapProp = (name, size, tint) => { const o = cloneNode(M.props, name); if (!o) return null; const n = normalise(o, size); n.wrap.traverse((q) => { if (q.isMesh) { q.castShadow = true; q.receiveShadow = true; if (tint) { q.material = q.material.clone(); q.material.color.multiply(tint); } } }); return n; };
    for (const p of props) {
      let [x, z] = this.cellCenter(p.cx, p.cz); x += p.ox * 1.4; z += p.oz * 1.4;
      if (p.kind === "crate") {
        const big = R() < 0.6; const n = wrapProp(R() < 0.5 ? (big ? "Prop_Crate_Large" : "Prop_Crate") : (big ? "Prop_Crate_Tarp_Large" : "Prop_Crate_Tarp"), big ? 1.9 : 1.15);
        if (!n) continue; n.wrap.position.set(x, 0, z); n.wrap.rotation.y = Math.floor(p.rot / 1.5708) * 1.5708 + (R() - 0.5) * 0.25; this.group.add(n.wrap);
        const h = n.size.y;
        if (big) { const ang = n.wrap.rotation.y, ox = Math.cos(ang) * 0.5, oz = -Math.sin(ang) * 0.5; this.colliders.push({ x: x + ox, z: z + oz, r: 0.55, h }, { x: x - ox, z: z - oz, r: 0.55, h }, { x, z, r: 0.5, h }); } else this.colliders.push({ x, z, r: 0.58, h });
      } else if (p.kind === "barrel") {
        const n = wrapProp("Prop_Barrel1", 1.15); if (!n) continue; n.wrap.position.set(x, 0, z); this.group.add(n.wrap); this.colliders.push({ x, z, r: 0.46, h: n.size.y });
      } else if (p.kind === "barrelx") {
        const n = wrapProp("Prop_Barrel2_Closed", 1.2, new THREE.Color(1.5, 0.35, 0.3)); if (!n) continue; n.wrap.position.set(x, 0, z); this.group.add(n.wrap);
        const col = { x, z, r: 0.5, h: n.size.y, barrel: true }; this.colliders.push(col);
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex || (this.glowTex = glowTexture(32)), color: 0xff3a20, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false, opacity: 0.6 })); glow.scale.setScalar(1.6); glow.position.set(x, 0.75, z); this.group.add(glow);
        this.barrels.push({ x, z, hp: 30, obj: n.wrap, col, glow });
      }
    }
    this.buildDecor();
  }
  buildDecor() {
    const K = this.models.kenney, style = this.def.style, R = this.rand, M = this.M;
    const spots = R.shuffle((M.open || []).filter((c) => c.n >= 8 && (c.d || 0) > 6)); let si = 0;
    const take = (minGap = 3) => { while (si < spots.length) { const c = spots[si++]; if (this.colliders.every((k) => Math.hypot(k.x - (c.cx + 0.5) * CELL, k.z - (c.cz + 0.5) * CELL) > minGap)) return c; } return null; };
    const place = (name, size, count, r, h, tint, emissive, minGap = 3.2) => {
      for (let i = 0; i < count; i++) {
        const c = take(minGap); if (!c) return; const o = cloneNode(K, name); if (!o) return;
        const n = normalise(o, size); const x = (c.cx + 0.5) * CELL + (R() - 0.5), z = (c.cz + 0.5) * CELL + (R() - 0.5);
        n.wrap.position.set(x, 0, z); n.wrap.rotation.y = R() * 6.28;
        n.wrap.traverse((q) => { if (q.isMesh) { q.castShadow = true; q.receiveShadow = true; q.material = q.material.clone(); if (tint) q.material.color.multiply(tint); if (emissive) { q.material.emissive = emissive.clone(); q.material.emissiveIntensity = 0.9; } } });
        this.group.add(n.wrap); this.colliders.push({ x, z, r: r * (size / 3), h: h ?? n.size.y });
      }
    };
    if (style === "outpost") { place("rock_largeA", 4.2, 5, 1.0, 2.6, new THREE.Color(0.55, 0.58, 0.65)); place("rock_largeB", 3.4, 5, 1.0, 2.2, new THREE.Color(0.55, 0.58, 0.65)); place("satelliteDish_large", 3.4, 1, 0.9, 3, new THREE.Color(0.7, 0.75, 0.85)); }
    else if (style === "core") { place("rock_crystalsLargeA", 3.6, 5, 1.0, 3, new THREE.Color(1.4, 0.4, 1.2), new THREE.Color(0.6, 0.05, 0.4)); place("rock_crystalsLargeB", 3.0, 4, 1.0, 2.6, new THREE.Color(0.5, 0.7, 1.5), new THREE.Color(0.05, 0.2, 0.6)); }
    else if (style === "rooftop") { place("satelliteDish_large", 3.2, 2, 0.9, 2.8, new THREE.Color(0.6, 0.6, 0.7)); place("machine_wireless", 2.2, 5, 1.0, 1.4, new THREE.Color(0.6, 0.65, 0.8)); place("barrels", 1.5, 4, 1.0, 0.9, new THREE.Color(0.6, 0.6, 0.65)); }
    else if (style === "factory") { place("machine_barrelLarge", 2.4, 5, 1.0, 1.6, new THREE.Color(0.7, 0.65, 0.6)); place("barrels", 1.6, 4, 1.0, 0.9, new THREE.Color(0.8, 0.7, 0.6)); }
    else if (style === "lab") this.buildTubes(spots, take);
    else if (style === "street") { place("machine_wireless", 2.0, 3, 1.0, 1.3, new THREE.Color(0.55, 0.6, 0.75)); }
  }
  buildTubes(spots, take) {
    const R = this.rand; const n = 9;
    const glass = new THREE.MeshStandardMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.2, emissive: 0x2a9cc0, emissiveIntensity: 0.45, depthWrite: false });
    const base = new THREE.MeshStandardMaterial({ color: 0x2a323c, roughness: 0.35, metalness: 0.9 });
    const liquid = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 0.9, 1).multiplyScalar(1.4), toneMapped: false, transparent: true, opacity: 0.55 });
    this.materials.push(glass, base, liquid);
    for (let i = 0; i < n; i++) {
      const c = take(3.5); if (!c) break; const x = (c.cx + 0.5) * CELL, z = (c.cz + 0.5) * CELL;
      const g = new THREE.Group();
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 2.7, 16, 1, true), glass); cyl.position.y = 1.45; g.add(cyl);
      const liq = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 2.2, 14), liquid); liq.position.y = 1.35; g.add(liq);
      const b1 = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.85, 0.2, 16), base); b1.position.y = 0.1; g.add(b1);
      const b2 = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.7, 0.2, 16), base); b2.position.y = 2.8; g.add(b2);
      g.position.set(x, 0, z); this.group.add(g); this.colliders.push({ x, z, r: 0.75, h: 2.8, glass: true });
      this.lamps.push({ x, y: 1.4, z, r: 0.2, g: 0.8, b: 1 });
    }
  }
  setShadows(on) { for (const m of this.casters) m.castShadow = on; this.group.traverse((o) => { if (o.isMesh && o.userData.shadowOK) o.castShadow = on; }); }
  update(dt, time) {
    for (const [, m] of this.doorMeshes) if (m.userData.opening) { m.position.y -= dt * 3; if (m.position.y < -this.WH - 0.2) { m.visible = false; m.userData.opening = false; } }
    if (this.panels && this.flick.length) {
      const c = new THREE.Color();
      for (const i of this.flick) { const on = Math.sin(time * 9 + i * 1.7) * Math.sin(time * 3.3 + i) > -0.3 || Math.sin(time * 40 + i) > 0.9; c.copy(this.pal[1]).multiplyScalar(on ? 2.4 : 0.15); this.panels.setColorAt(i, c); }
      this.panels.instanceColor.needsUpdate = true;
    }
  }
  dispose(scene) {
    scene.remove(this.group);
    this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    for (const m of this.materials) m.dispose();
  }
}
