import { rng } from "./util.js";

// cell codes: 0 floor, 1 boundary wall (always solid), 2 solid block, 3 low cover (vaultable), 4 door (solid until opened)
export const C = { FLOOR: 0, BOUND: 1, BLOCK: 2, LOW: 3, DOOR: 4 };

class Grid {
  constructor(W, H, fill = 0) { this.W = W; this.H = H; this.g = new Uint8Array(W * H).fill(fill); }
  at(x, z) { return x < 0 || z < 0 || x >= this.W || z >= this.H ? 1 : this.g[z * this.W + x]; }
  set(x, z, v) { if (x >= 0 && z >= 0 && x < this.W && z < this.H) this.g[z * this.W + x] = v; }
  rect(x, z, w, h, v) { for (let j = z; j < z + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, v); }
  border(v = 1) { for (let i = 0; i < this.W; i++) { this.set(i, 0, v); this.set(i, this.H - 1, v); } for (let j = 0; j < this.H; j++) { this.set(0, j, v); this.set(this.W - 1, j, v); } }
  passable(x, z) { const c = this.at(x, z); return c === 0 || c === 4; }
  bfs(sx, sz, passDoors = true) {
    const { W, H } = this; const d = new Int16Array(W * H).fill(-1);
    const q = [sx + sz * W]; d[sx + sz * W] = 0;
    for (let h = 0; h < q.length; h++) {
      const id = q[h], x = id % W, z = (id / W) | 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz; if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
        const c = this.g[nz * W + nx]; if (!(c === 0 || (passDoors && c === 4))) continue;
        if (d[nz * W + nx] >= 0) continue; d[nz * W + nx] = d[id] + 1; q.push(nz * W + nx);
      }
    }
    return d;
  }
  openCount() { let n = 0; for (const c of this.g) if (c === 0 || c === 4) n++; return n; }
  reachableCount(sx, sz) { let n = 0; for (const v of this.bfs(sx, sz)) if (v >= 0) n++; return n; }
}

// try to place cover blocks without breaking connectivity
function scatter(G, R, n, code, start, ok, tries = 400) {
  const total = G.reachableCount(start.cx, start.cz);
  let placed = 0;
  for (let t = 0; t < tries && placed < n; t++) {
    const x = R.int(2, G.W - 3), z = R.int(2, G.H - 3);
    if (G.at(x, z) !== 0 || (ok && !ok(x, z))) continue;
    G.set(x, z, code);
    if (G.reachableCount(start.cx, start.cz) !== total - 1) { G.set(x, z, 0); continue; }
    placed++;
  }
  return placed;
}
function openNeighbors(G, x, z) { let n = 0; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (G.at(x + i, z + j) === 0) n++; return n; }

function bsp(G, R, x, z, w, h, o, rooms, links, depth = 0) {
  const canV = w >= o.minLeaf * 2, canH = h >= o.minLeaf * 2;
  const big = w > o.maxLeaf || h > o.maxLeaf;
  if ((canV || canH) && (big || (depth < 2 && R() < 0.85) || R() < 0.45)) {
    let vert = canV && (!canH || (w > h * 1.2 ? true : h > w * 1.2 ? false : R() < 0.5));
    let a, b;
    if (vert) { const cut = R.int(o.minLeaf, w - o.minLeaf); a = bsp(G, R, x, z, cut, h, o, rooms, links, depth + 1); b = bsp(G, R, x + cut, z, w - cut, h, o, rooms, links, depth + 1); }
    else { const cut = R.int(o.minLeaf, h - o.minLeaf); a = bsp(G, R, x, z, w, cut, o, rooms, links, depth + 1); b = bsp(G, R, x, z + cut, w, h - cut, o, rooms, links, depth + 1); }
    links.push([R.pick(a), R.pick(b)]);
    return a.concat(b);
  }
  const rw = R.int(Math.min(o.minRoom, w - 2), Math.max(Math.min(o.minRoom, w - 2), Math.min(o.maxRoom, w - 2)));
  const rh = R.int(Math.min(o.minRoom, h - 2), Math.max(Math.min(o.minRoom, h - 2), Math.min(o.maxRoom, h - 2)));
  const rx = x + 1 + R.int(0, Math.max(0, w - 2 - rw)), rz = z + 1 + R.int(0, Math.max(0, h - 2 - rh));
  const room = { x: rx, z: rz, w: rw, h: rh, cx: Math.floor(rx + rw / 2), cz: Math.floor(rz + rh / 2) };
  G.rect(rx, rz, rw, rh, 0); rooms.push(room);
  return [room];
}
function corridor(G, a, b, cw, mark) {
  let x = a.cx, z = a.cz;
  const horizFirst = true;
  const carve = (cx, cz) => { for (let i = 0; i < cw; i++) for (let j = 0; j < cw; j++) { if (G.at(cx + i, cz + j) !== 1 || (cx + i > 0 && cz + j > 0 && cx + i < G.W - 1 && cz + j < G.H - 1)) { G.set(cx + i, cz + j, 0); mark && mark.add((cz + j) * G.W + cx + i); } } };
  if (horizFirst) { while (x !== b.cx) { carve(x, z); x += Math.sign(b.cx - x); } while (z !== b.cz) { carve(x, z); z += Math.sign(b.cz - z); } carve(x, z); }
}

function pathCells(G, from, to) {
  const d = G.bfs(to.cx, to.cz); const path = []; let x = from.cx, z = from.cz;
  for (let i = 0; i < 2000; i++) {
    path.push({ cx: x, cz: z }); if (x === to.cx && z === to.cz) break;
    let best = null, bd = d[z * G.W + x];
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, nz = z + dz; if (nx < 0 || nz < 0 || nx >= G.W || nz >= G.H) continue; const v = d[nz * G.W + nx]; if (v >= 0 && v < bd) { bd = v; best = [nx, nz]; } }
    if (!best) break; [x, z] = best;
  }
  return path;
}

function finalize(G, R, def, M) {
  // M: { start, exit, extra... } — compute spawn spots, enemy groups, props
  const { W, H } = G;
  const ds = G.bfs(M.start.cx, M.start.cz);
  const open = []; for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) if (G.at(x, z) === 0 && ds[z * W + x] >= 0) open.push({ cx: x, cz: z, d: ds[z * W + x], n: openNeighbors(G, x, z) });
  M.open = open; M.dist = ds;
  // checkpoints along path to exit (or to farthest)
  const far = open.reduce((a, b) => (b.d > a.d ? b : a), open[0]);
  const target = M.exit || far;
  const path = pathCells(G, M.start, target);
  M.path = path;
  if (!M.cps) { M.cps = []; for (const f of def.cpAt || [0.38, 0.72]) { const c = path[Math.floor(path.length * f)]; if (c) M.cps.push({ cx: c.cx, cz: c.cz }); } }
  // enemy groups
  const taken = [M.start, ...(M.cps || []), ...(M.gens || []), ...(M.keys || []), ...(M.pods || []), ...(M.pylons || [])];
  const spacing = (c, r) => taken.every((t) => Math.hypot(t.cx - c.cx, t.cz - c.cz) >= r);
  const cand = R.shuffle(open.filter((c) => c.d > (def.safeDist || 10) && c.n >= 5));
  const groups = []; const pop = def.pop || {};
  const mobile = []; for (const k of ["drone", "quad", "tri", "guard"]) for (let i = 0; i < (pop[k] || 0); i++) mobile.push(k);
  R.shuffle(mobile);
  const fixed = []; for (const k of ["turret", "sniper"]) for (let i = 0; i < (pop[k] || 0); i++) fixed.push(k);
  let gi = 0;
  for (let i = 0; i < mobile.length;) {
    const n = Math.min(mobile.length - i, R.int(1, 3));
    const c = cand.find((c) => spacing(c, 6)); if (!c) break;
    taken.push(c);
    const members = [];
    for (let k = 0; k < n; k++) members.push({ type: mobile[i + k], cx: c.cx, cz: c.cz, ox: (k - (n - 1) / 2) * 1.6, oz: (k % 2) * 1.2 - 0.6 });
    groups.push({ id: gi++, cx: c.cx, cz: c.cz, members }); i += n;
  }
  M.turrets = [];
  for (const k of fixed) {
    // fixed turrets prefer cells next to a wall
    const c = cand.find((c) => spacing(c, 5) && (G.at(c.cx + 1, c.cz) !== 0 || G.at(c.cx - 1, c.cz) !== 0 || G.at(c.cx, c.cz + 1) !== 0 || G.at(c.cx, c.cz - 1) !== 0)) || cand.find((c) => spacing(c, 4));
    if (!c) break; taken.push(c); M.turrets.push({ type: k, cx: c.cx, cz: c.cz });
  }
  M.groups = groups;
  // props (crates/barrels etc.)
  const props = []; const pc = R.shuffle(open.filter((c) => c.d > 4 && c.n >= 6));
  const nProps = def.props ?? Math.round(open.length / 14);
  for (let i = 0; i < nProps && i < pc.length; i++) {
    const c = pc[i]; if (taken.some((t) => Math.hypot(t.cx - c.cx, t.cz - c.cz) < 1.5)) continue;
    props.push({ kind: R() < 0.35 ? "barrel" : R() < 0.15 ? "barrelx" : "crate", cx: c.cx, cz: c.cz, ox: R() - 0.5, oz: R() - 0.5, rot: R() * 6.28 });
  }
  M.props = props;
  M.lampCells = R.shuffle(open.filter((c) => c.n >= 4)).slice(0, 80);
  return M;
}

// ----------------------------------------------------------------------------------------------
function genStreet(def, R) {
  const W = def.W, H = def.H, G = new Grid(W, H, 2); G.border(1);
  const vr = [4, 14, 24], hr = [4, 14, 24];
  for (const x of vr) G.rect(x, 1, 2, H - 2, 0);
  for (const z of hr) G.rect(1, z, W - 2, 2, 0);
  // alleys and courtyards through blocks
  for (let bi = 0; bi < 3; bi++) for (let bj = 0; bj < 3; bj++) {
    const x0 = bi === 0 ? 1 : vr[bi - 1] + 2, x1 = bi === 2 ? W - 2 : vr[bi] - 1;
    const z0 = bj === 0 ? 1 : hr[bj - 1] + 2, z1 = bj === 2 ? H - 2 : hr[bj] - 1;
    if (bi === 2 && x1 - x0 < 3) continue;
    const w = x1 - x0 + 1, h = z1 - z0 + 1; if (w < 4 || h < 4) continue;
    const r = R();
    if (r < 0.55) { const ax = x0 + R.int(1, w - 2); G.rect(ax, z0, 1, h, 0); if (w > 6) G.rect(x0 + Math.floor(w / 2) - 1, z0 + Math.floor(h / 2) - 1, 3, 3, 0); }
    else if (r < 0.9) { const az = z0 + R.int(1, h - 2); G.rect(x0, az, w, 1, 0); if (h > 6) G.rect(x0 + Math.floor(w / 2) - 1, z0 + Math.floor(h / 2) - 1, 3, 3, 0); }
    else { G.rect(x0 + 1, z0 + 1, w - 2, h - 2, 0); G.rect(x0 + 2, z0 + 2, Math.max(1, w - 4), Math.max(1, h - 4), 2); }
  }
  // plazas at some intersections
  G.rect(2, 2, 6, 6, 0); G.rect(W - 8, H - 8, 6, 6, 0); G.rect(12, 12, 5, 5, 0);
  const start = { cx: W - 5, cz: H - 5, yaw: Math.PI * 0.75 };
  const exit = { cx: 4, cz: 4 };
  scatter(G, R, 34, 3, start, (x, z) => Math.hypot(x - start.cx, z - start.cz) > 5 && Math.hypot(x - exit.cx, z - exit.cz) > 4 && openNeighbors(G, x, z) >= 7);
  // keep start & exit open
  return finalize(G, R, def, { G, start, exit });
}

function genBspLevel(def, R, o) {
  const W = def.W, H = def.H, G = new Grid(W, H, 2); G.border(1);
  const rooms = [], links = [];
  const region = o.region || [1, 1, W - 2, H - 2];
  bsp(G, R, region[0], region[1], region[2], region[3], o, rooms, links);
  const mark = new Set();
  for (const [a, b] of links) corridor(G, a, b, o.cw, mark);
  // extra loops
  for (let i = 0; i < (o.loops ?? 2); i++) { const a = R.pick(rooms), b = R.pick(rooms); if (a !== b) corridor(G, a, b, o.cw, mark); }
  return { G, rooms, mark };
}

function genFactory(def, R) {
  const { G, rooms, mark } = genBspLevel(def, R, { minLeaf: 8, maxLeaf: 13, minRoom: 5, maxRoom: 10, cw: 2, loops: 3 });
  // pillars / covers inside rooms
  for (const r of rooms) {
    if (r.w >= 7 && r.h >= 7) { for (const [px, pz] of [[r.x + 2, r.z + 2], [r.x + r.w - 4, r.z + 2], [r.x + 2, r.z + r.h - 4], [r.x + r.w - 4, r.z + r.h - 4]]) { let okp = true; for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) if (mark.has((pz + j) * G.W + px + i)) okp = false; if (okp && R() < 0.8) G.rect(px, pz, 2, 2, 2); } }
  }
  const sorted = rooms.slice().sort((a, b) => (a.cx + a.cz) - (b.cx + b.cz));
  const sroom = sorted[0];
  const start = { cx: sroom.cx, cz: sroom.cz, yaw: -Math.PI / 4 };
  G.set(start.cx, start.cz, 0);
  scatter(G, R, 40, 3, start, (x, z) => Math.hypot(x - start.cx, z - start.cz) > 4 && openNeighbors(G, x, z) >= 6);
  const d = G.bfs(start.cx, start.cz);
  const byDist = rooms.slice().sort((a, b) => d[b.cz * G.W + b.cx] - d[a.cz * G.W + a.cx]);
  const gens = [];
  for (const r of byDist) { if (gens.length >= 3) break; if (r === sroom) continue; if (gens.every((g) => Math.hypot(g.cx - r.cx, g.cz - r.cz) > 9)) gens.push({ cx: r.cx, cz: r.cz }); }
  const exitRoom = sorted[Math.min(1, sorted.length - 1)] === sroom ? sorted[2] : sorted[1];
  const exit = { cx: exitRoom.cx, cz: exitRoom.cz };
  for (const g of gens) G.rect(g.cx - 1, g.cz - 1, 3, 3, 0);
  G.rect(exit.cx - 1, exit.cz - 1, 3, 3, 0);
  return finalize(G, R, def, { G, start, exit, gens, rooms, cpAt: [0.3, 0.6] });
}

function genLab(def, R) {
  const W = def.W, H = def.H;
  const ax = W - 9, az = Math.floor(H / 2); // arena centre
  const { G, rooms, mark } = genBspLevel(def, R, { minLeaf: 5, maxLeaf: 9, minRoom: 4, maxRoom: 7, cw: 1, loops: 3, region: [1, 1, W - 18, H - 2] });
  // octagonal boss arena
  const r = 6;
  for (let z = -r; z <= r; z++) for (let x = -r; x <= r; x++) { if (Math.abs(x) + Math.abs(z) <= r * 1.45 && Math.abs(x) <= r && Math.abs(z) <= r) G.set(ax + x, az + z, 0); }
  // inner pillars
  for (const [px, pz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) G.rect(ax + px, az + pz, 1, 1, 2);
  // door corridor on the west side
  const doorX = ax - r - 1;
  const west = rooms.reduce((a, b) => (Math.abs(b.cx - doorX) + Math.abs(b.cz - az) < Math.abs(a.cx - doorX) + Math.abs(a.cz - az) ? b : a));
  corridor(G, west, { cx: doorX, cz: az }, 2, mark);
  const doors = [];
  for (let j = 0; j < 2; j++) { G.set(doorX + 1, az + j, 4); doors.push({ cx: doorX + 1, cz: az + j }); }
  G.border(1);
  const sorted = rooms.slice().sort((a, b) => (a.cx + a.cz) - (b.cx + b.cz));
  const sroom = sorted[0];
  const start = { cx: sroom.cx, cz: sroom.cz, yaw: -Math.PI / 4 };
  scatter(G, R, 22, 3, start, (x, z) => x < ax - r - 2 && Math.hypot(x - start.cx, z - start.cz) > 4 && openNeighbors(G, x, z) >= 6);
  const d = G.bfs(start.cx, start.cz);
  const cand = rooms.filter((r2) => r2 !== sroom && r2.cx < ax - r - 2).sort((a, b) => d[b.cz * G.W + b.cx] - d[a.cz * G.W + a.cx]);
  const keys = [];
  for (const sp of [8, 5, 0]) for (const r2 of cand) { if (keys.length >= 3) break; if (keys.every((k) => Math.hypot(k.cx - r2.cx, k.cz - r2.cz) > sp)) keys.push({ cx: r2.cx, cz: r2.cz }); }
  const arena = { cx: ax, cz: az, r };
  const M = finalize(G, R, def, { G, start, exit: { cx: doorX - 1, cz: az }, keys, doors, arena, rooms, cpAt: [0.35, 0.7] });
  M.cps.push({ cx: ax - r + 2, cz: az });
  M.groups = M.groups.filter((g) => g.cx < ax - r - 1);
  M.turrets = M.turrets.filter((t) => t.cx < ax - r - 1);
  return M;
}

function genOutpost(def, R) {
  const W = def.W, H = def.H, G = new Grid(W, H, 0); G.border(1);
  // irregular rocky rim
  for (let i = 0; i < W; i++) for (const side of [0, 1]) { const t = R.int(1, 3); for (let k = 0; k < t; k++) G.set(i, side ? H - 1 - k : k, 1); }
  for (let j = 0; j < H; j++) for (const side of [0, 1]) { const t = R.int(1, 3); for (let k = 0; k < t; k++) G.set(side ? W - 1 - k : k, j, 1); }
  const cx = Math.floor(W / 2), cz = Math.floor(H / 2);
  const start = { cx, cz: H - 5, yaw: 0 };
  const exit = { cx, cz: 4 };
  const huts = [[5, 6, 4, 3], [23, 6, 4, 4], [5, 21, 4, 4], [23, 22, 4, 3], [11, 11, 3, 3], [18, 18, 3, 3], [9, 17, 3, 2], [20, 10, 3, 2]];
  for (const [x, z, w, h] of huts) { G.rect(x + R.int(-1, 1), z + R.int(-1, 1), w, h, 2); }
  // rocks
  for (let i = 0; i < 12; i++) { const x = R.int(3, W - 4), z = R.int(3, H - 4); if (Math.hypot(x - cx, z - cz) < 7 || Math.hypot(x - start.cx, z - start.cz) < 5 || Math.hypot(x - exit.cx, z - exit.cz) < 5) continue; G.rect(x, z, R.int(1, 2), R.int(1, 2), 1); }
  // clear beacon area & lanes
  G.rect(cx - 4, cz - 4, 9, 9, 0); G.rect(cx - 1, 2, 3, H - 4, 0); G.rect(2, cz - 1, W - 4, 3, 0);
  G.rect(start.cx - 3, start.cz - 2, 7, 4, 0); G.rect(exit.cx - 3, exit.cz - 2, 7, 4, 0);
  // sandbag ring around beacon with openings
  for (let a = 0; a < 16; a++) { const ang = a / 16 * Math.PI * 2; if (a % 4 === 0) continue; const x = Math.round(cx + Math.cos(ang) * 3.6), z = Math.round(cz + Math.sin(ang) * 3.6); G.set(x, z, 3); }
  scatter(G, R, 34, 3, start, (x, z) => Math.hypot(x - start.cx, z - start.cz) > 4 && Math.hypot(x - cx, z - cz) > 3 && openNeighbors(G, x, z) >= 7);
  const M = finalize(G, R, def, { G, start, exit, beacon: { cx, cz, r: 4.2 }, cps: [{ cx, cz: cz + 5 }], safeDist: 8 });
  return M;
}

function genRooftop(def, R) {
  const W = def.W, H = def.H, G = new Grid(W, H, 0); G.border(1);
  const start = { cx: W - 5, cz: H - 5, yaw: Math.PI * 0.75 };
  const arena = { cx: 6, cz: 6, r: 5 };
  const blocks = [];
  for (let i = 0; i < 16; i++) { const w = R.int(2, 4), h = R.int(2, 3), x = R.int(3, W - 4 - w), z = R.int(3, H - 4 - h); if (Math.hypot(x - start.cx, z - start.cz) < 6 || Math.hypot(x + w / 2 - arena.cx, z + h / 2 - arena.cz) < 8) continue; if (blocks.some((b) => x < b.x + b.w + 3 && x + w + 3 > b.x && z < b.z + b.h + 3 && z + h + 3 > b.z)) continue; blocks.push({ x, z, w, h }); G.rect(x, z, w, h, 2); }
  scatter(G, R, 46, 3, start, (x, z) => Math.hypot(x - start.cx, z - start.cz) > 4 && openNeighbors(G, x, z) >= 6);
  // arena cover (inside)
  for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2], [0, -3], [0, 3]]) G.set(arena.cx + dx, arena.cz + dz, 3);
  const d0 = G.bfs(start.cx, start.cz);
  const cand = []; for (let z = 3; z < H - 3; z++) for (let x = 3; x < W - 3; x++) if (G.at(x, z) === 0 && d0[z * W + x] > 14 && Math.hypot(x - arena.cx, z - arena.cz) > 9 && openNeighbors(G, x, z) >= 5) cand.push({ cx: x, cz: z });
  R.shuffle(cand);
  const pods = []; for (const c of cand) { if (pods.length >= 3) break; if (pods.every((p) => Math.hypot(p.cx - c.cx, p.cz - c.cz) > 10)) pods.push(c); }
  return finalize(G, R, def, { G, start, exit: { cx: arena.cx, cz: arena.cz + 1 }, pods, arena, cpAt: [0.4, 0.75] });
}

function genCore(def, R) {
  const W = def.W, H = def.H, G = new Grid(W, H, 1);
  const ac = { cx: 15, cz: 11 }, ar = 7.3;
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) if (Math.hypot(x - ac.cx, z - ac.cz) <= ar) G.set(x, z, 0);
  // approach: start room, serpentine halls
  G.rect(2, 24, 8, 4, 0); // start
  G.rect(9, 25, 14, 2, 0); // east corridor
  G.rect(21, 18, 2, 8, 0); // north to hall
  G.rect(17, 17, 9, 3, 0); // hall
  G.rect(16, 15, 3, 3, 0); // enter arena
  G.rect(2, 14, 6, 8, 0); G.rect(7, 18, 8, 2, 0); G.rect(14, 18, 3, 2, 0); // west wing hall
  G.rect(4, 22, 2, 2, 0);
  // pylons
  const pylons = [[0, -4.6], [4.6, 0], [0, 4.6], [-4.6, 0]].map(([dx, dz]) => ({ cx: Math.round(ac.cx + dx), cz: Math.round(ac.cz + dz) }));
  for (const [dx, dz] of [[3, 3], [-3, 3], [3, -3], [-3, -3]]) G.set(Math.round(ac.cx + dx * 1.0), Math.round(ac.cz + dz * 1.0), 3);
  const start = { cx: 4, cz: 26, yaw: -Math.PI / 2 };
  const arena = { cx: ac.cx, cz: ac.cz, r: ar };
  G.border(1);
  scatter(G, R, 18, 3, start, (x, z) => Math.hypot(x - start.cx, z - start.cz) > 4 && Math.hypot(x - ac.cx, z - ac.cz) > 3 && openNeighbors(G, x, z) >= 6);
  const M = finalize(G, R, def, { G, start, exit: { cx: ac.cx, cz: ac.cz + 4 }, pylons, arena, cpAt: [0.3, 0.55, 0.8] });
  M.groups = M.groups.filter((g) => Math.hypot(g.cx - ac.cx, g.cz - ac.cz) > ar - 1);
  M.turrets = M.turrets.filter((t) => Math.hypot(t.cx - ac.cx, t.cz - ac.cz) > ar - 1);
  return M;
}

export function generate(def) {
  const R = rng(def.seed);
  switch (def.style) {
    case "street": return genStreet(def, R);
    case "factory": return genFactory(def, R);
    case "lab": return genLab(def, R);
    case "outpost": return genOutpost(def, R);
    case "rooftop": return genRooftop(def, R);
    case "core": return genCore(def, R);
    default: throw new Error("unknown style " + def.style);
  }
}

// classic arena (survival) = the original 16x16 maze
const ARENA = [
  "BBBBBBBBBBBBBBBB", "B......#.......B", "B.##...#..##...B", "B.#.........#..B", "B.#..####...#..B", "B......#.......B", "BBB.#..#..###..B", "B...#.........BB",
  "B.###...##.....B", "B.......#...#..B", "B..##.......#..B", "B...#..###..#..B", "B.....#........B", "B.##..#..##.##.B", "B..............B", "BBBBBBBBBBBBBBBB",
];
export function generateArena() {
  const W = 16, H = 16, G = new Grid(W, H, 0);
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) { const c = ARENA[z][x]; G.set(x, z, c === "B" ? 1 : c === "#" ? 2 : 0); }
  const R = rng(7);
  const start = { cx: 1, cz: 1, yaw: -Math.PI / 2 };
  const M = { G, start, exit: null, cps: [], groups: [], turrets: [], props: [] };
  const open = []; for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) if (G.at(x, z) === 0) open.push({ cx: x, cz: z, d: 0, n: openNeighbors(G, x, z) });
  M.open = open; M.lampCells = open.slice();
  const pc = R.shuffle(open.filter((c) => c.n >= 8 && Math.hypot(c.cx - 1.5, c.cz - 1.5) > 3.2));
  for (const c of pc) { if (M.props.length >= 9) break; if (M.props.every((p) => Math.hypot(p.cx - c.cx, p.cz - c.cz) > 2.5)) M.props.push({ kind: M.props.length % 3 === 0 ? "barrel" : M.props.length % 4 === 1 ? "barrelx" : "crate", cx: c.cx, cz: c.cz, ox: R() - 0.5, oz: R() - 0.5, rot: Math.floor(R() * 4) * Math.PI / 2 }); }
  return M;
}
