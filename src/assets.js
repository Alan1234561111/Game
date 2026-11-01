import * as THREE from "three";
import { ANISO } from "./platform.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";

const BASE = () => import.meta.env.BASE_URL;
export const cloneSkinned = (src) => SkeletonUtils.clone(src);

// all gltf files
export async function loadModels(manager) {
  const loader = new GLTFLoader(manager);
  const load = (n) => new Promise((res, rej) => loader.load(BASE() + "models/" + n, res, undefined, rej));
  const names = { eye: "EyeDrone.glb", quad: "QuadShell.glb", tri: "Trilobite.glb", weapons: "weapons.glb", props: "props.glb", kenney: "kenney.glb" };
  const out = {};
  await Promise.all(Object.entries(names).map(async ([k, f]) => { out[k] = await load(f); }));
  return out;
}
export function findNode(gltf, name) {
  let out = null;
  for (const sc of gltf.scenes) sc.traverse((o) => { if (!out && o.name === name) out = o; });
  return out;
}
export function cloneNode(gltf, name) { const n = findNode(gltf, name); return n ? n.clone(true) : null; }

// normalise: scale so largest dimension == size, feet at y=0, centred on xz. returns wrapper group
export function normalise(root, size, opts = {}) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const sz = new THREE.Vector3(); box.getSize(sz);
  const s = size / Math.max(sz.x, sz.y, sz.z);
  const wrap = new THREE.Group();
  wrap.add(root);
  root.scale.multiplyScalar(s);
  root.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(root);
  const c = new THREE.Vector3(); b2.getCenter(c);
  root.position.x -= c.x; root.position.z -= c.z; root.position.y -= opts.center ? c.y : b2.min.y;
  return { wrap, scale: s, size: sz.multiplyScalar(s) };
}

// ---- textures
const texCache = {};
const tl = new THREE.TextureLoader();
export function setTexManager(m) { tl.manager = m; }
let pending = 0, waiters = [];
const done = () => { pending--; if (pending <= 0) { pending = 0; waiters.splice(0).forEach((f) => f()); } };
export const waitTextures = () => (pending === 0 ? Promise.resolve() : new Promise((r) => waiters.push(r)));
function tex(url, srgb) {
  const key = url + (srgb ? "s" : "l");
  if (texCache[key]) return texCache[key];
  pending++;
  const t = tl.load(url, done, undefined, done);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = ANISO;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  texCache[key] = t; return t;
}
export function loadSet(name, withEmissive) {
  const b = BASE() + "tex2/" + name;
  const s = { map: tex(b + "_c.jpg", true), normalMap: tex(b + "_n.jpg", false), orm: tex(b + "_o.jpg", false) };
  if (withEmissive) s.emissiveMap = tex(b + "_e.jpg", true);
  return s;
}
export function pbr(set, opts = {}) {
  const { noEmissive, ...rest } = opts; opts = rest; opts.noEmissive = noEmissive;
  const o = Object.assign({ map: set.map, normalMap: set.normalMap, roughnessMap: set.orm, metalnessMap: set.orm, roughness: 1, metalness: 1, envMapIntensity: 1 }, opts);
  delete o.noEmissive;
  if (set.emissiveMap && !opts.noEmissive) { o.emissiveMap = set.emissiveMap; o.emissive = new THREE.Color(0xffffff); o.emissiveIntensity = opts.emissiveIntensity ?? 1.2; }
  return new THREE.MeshStandardMaterial(o);
}

// ---- environments (HDRI): small RGBE for lighting (PMREM), jpg for the visible sky
const envCache = {};
export async function loadEnv(name, renderer, wantBg) {
  if (envCache[name]) return envCache[name];
  const pm = new THREE.PMREMGenerator(renderer);
  const out = {};
  const hdr = await new Promise((res, rej) => new HDRLoader().setDataType(THREE.HalfFloatType).load(BASE() + `hdri/${name}_env.hdr`, res, undefined, rej));
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  out.env = pm.fromEquirectangular(hdr).texture; hdr.dispose();
  if (wantBg) {
    out.bg = await new Promise((res, rej) => tl.load(BASE() + `hdri/${name}_bg.jpg`, res, undefined, rej));
    out.bg.mapping = THREE.EquirectangularReflectionMapping; out.bg.colorSpace = THREE.SRGBColorSpace; out.bg.wrapS = THREE.RepeatWrapping;
    out.bg.minFilter = THREE.LinearMipmapLinearFilter; out.bg.generateMipmaps = true; out.bg.anisotropy = ANISO;
  }
  pm.dispose();
  envCache[name] = out; return out;
}
export function glowTexture(size = 64, stops) {
  const c = document.createElement("canvas"); c.width = c.height = size;
  const x = c.getContext("2d");
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  (stops || [[0, "rgba(255,255,255,1)"], [0.25, "rgba(255,255,255,0.65)"], [0.6, "rgba(255,255,255,0.15)"], [1, "rgba(255,255,255,0)"]]).forEach(([o, col]) => g.addColorStop(o, col));
  x.fillStyle = g; x.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
