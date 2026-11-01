import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
const q = new URLSearchParams(location.search);
const files = q.get("f").split(",");
const cols = +(q.get("cols") || 4), cw = +(q.get("cw") || 300), ch = +(q.get("ch") || 300);
const rows = Math.ceil(files.length / cols);
const cv = document.getElementById("c"); cv.width = cols * cw; cv.height = rows * ch;
const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true }); r.setSize(cols * cw, rows * ch, false);
r.setScissorTest(true);
const pm = new THREE.PMREMGenerator(r); const env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
const L = new GLTFLoader();
const rot = +(q.get("rot") || 0.6);
const items = await Promise.all(files.map((f) => new Promise((res) => L.load("/" + f.split(":")[0], (g) => { const k = f.split(":")[1]; if (k !== undefined) g.scene = g.scenes[+k]; res(g); }, undefined, () => res(null)))));
items.forEach((g, i) => {
  const cx = i % cols, cy = Math.floor(i / cols);
  const sc = new THREE.Scene(); sc.background = new THREE.Color(0x2a3040); sc.environment = env;
  sc.add(new THREE.HemisphereLight(0xffffff, 0x445, 1.2)); const dl = new THREE.DirectionalLight(0xffffff, 2); dl.position.set(3, 5, 4); sc.add(dl);
  const cam = new THREE.PerspectiveCamera(30, cw / ch, 0.01, 1000);
  if (g) {
    const o = g.scene.clone(); sc.add(o); sc.add(new THREE.AxesHelper(0.3)); o.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(o), c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3()), m = Math.max(s.x, s.y, s.z);
    o.rotation.y = rot; o.updateMatrixWorld(true);
    const d = m / Math.tan(15 * Math.PI / 180) * 0.62;
    cam.position.set(c.x, c.y + m * 0.1, c.z + d); cam.lookAt(c);
    window.__info = window.__info || {}; window.__info[files[i]] = { size: [s.x, s.y, s.z].map((v) => +v.toFixed(2)), anims: g.animations.map((a) => a.name) };
  }
  r.setViewport(cx * cw, (rows - 1 - cy) * ch, cw, ch); r.setScissor(cx * cw, (rows - 1 - cy) * ch, cw, ch);
  r.render(sc, cam);
});
window.__done = true;
