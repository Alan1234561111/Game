import * as THREE from "three";
import { glowTexture as makeGlowTexture } from "./assets.js";

export class Particles {
  constructor(scene, max, tex) {
    this.max = max; this.i = 0;
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3);
    this.age = new Float32Array(max).fill(99); this.life = new Float32Array(max).fill(1);
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max);
    this.c0 = new Float32Array(max * 4); this.c1 = new Float32Array(max * 4);
    this.grav = new Float32Array(max); this.drag = new Float32Array(max);
    this.aColor = new Float32Array(max * 4); this.aSize = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3); this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.aColor, 4); this.colAttr.setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr = new THREE.BufferAttribute(this.aSize, 1); this.sizeAttr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute("position", this.posAttr); g.setAttribute("aColor", this.colAttr); g.setAttribute("aSize", this.sizeAttr);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(32, 0, 32), 500);
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { uTex: { value: tex }, uScale: { value: 600 } },
      vertexShader: `attribute vec4 aColor; attribute float aSize; varying vec4 vC; uniform float uScale;
        void main(){ vC=aColor; vec4 mv = modelViewMatrix*vec4(position,1.0); vC.a *= smoothstep(0.5, 3.0, -mv.z); gl_Position = projectionMatrix*mv; gl_PointSize = max(0.0, aSize*uScale/max(0.1,-mv.z)); }`,
      fragmentShader: `uniform sampler2D uTex; varying vec4 vC; void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vC.rgb*t.rgb*vC.a*t.a, 1.0); }`,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  setScale(h, fov) { this.mat.uniforms.uScale.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2)); }
  emit(x, y, z, vx, vy, vz, life, s0, s1, c0, c1, grav = 0, drag = 0) {
    const k = this.i; this.i = (this.i + 1) % this.max;
    this.pos[k * 3] = x; this.pos[k * 3 + 1] = y; this.pos[k * 3 + 2] = z;
    this.vel[k * 3] = vx; this.vel[k * 3 + 1] = vy; this.vel[k * 3 + 2] = vz;
    this.age[k] = 0; this.life[k] = life; this.s0[k] = s0; this.s1[k] = s1;
    for (let j = 0; j < 4; j++) { this.c0[k * 4 + j] = c0[j]; this.c1[k * 4 + j] = c1[j]; }
    this.grav[k] = grav; this.drag[k] = drag;
  }
  update(dt) {
    for (let k = 0; k < this.max; k++) {
      const a = this.age[k];
      if (a >= this.life[k]) { this.aSize[k] = 0; continue; }
      const na = a + dt; this.age[k] = na;
      const t = Math.min(1, na / this.life[k]);
      const dr = Math.max(0, 1 - this.drag[k] * dt);
      this.vel[k * 3] *= dr; this.vel[k * 3 + 1] = this.vel[k * 3 + 1] * dr - this.grav[k] * dt; this.vel[k * 3 + 2] *= dr;
      this.pos[k * 3] += this.vel[k * 3] * dt; this.pos[k * 3 + 1] += this.vel[k * 3 + 1] * dt; this.pos[k * 3 + 2] += this.vel[k * 3 + 2] * dt;
      if (this.pos[k * 3 + 1] < 0.03 && this.grav[k] > 0) { this.pos[k * 3 + 1] = 0.03; this.vel[k * 3 + 1] *= -0.35; this.vel[k * 3] *= 0.6; this.vel[k * 3 + 2] *= 0.6; }
      this.aSize[k] = this.s0[k] + (this.s1[k] - this.s0[k]) * t;
      for (let j = 0; j < 4; j++) this.aColor[k * 4 + j] = this.c0[k * 4 + j] + (this.c1[k * 4 + j] - this.c0[k * 4 + j]) * t;
    }
    this.posAttr.needsUpdate = true; this.colAttr.needsUpdate = true; this.sizeAttr.needsUpdate = true;
  }
}

const rnd = (a, b) => a + Math.random() * (b - a);

export class FX {
  constructor(scene) {
    this.glowTex = makeGlowTexture(64);
    this.p = new Particles(scene, 900, this.glowTex);
    // debris
    this.NDEB = 40;
    this.debMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x555d70, metalness: 0.9, roughness: 0.4, emissive: 0x331100, emissiveIntensity: 0.6 }), this.NDEB);
    this.debMesh.frustumCulled = false; this.debMesh.count = this.NDEB;
    this.deb = Array.from({ length: this.NDEB }, () => ({ life: 0, max: 1, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Vector3(), s: 0.1 }));
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3();
    this.debI = 0;
    scene.add(this.debMesh);
    for (let i = 0; i < this.NDEB; i++) { this._m.makeScale(0, 0, 0); this.debMesh.setMatrixAt(i, this._m); }
    // tracers
    this.tracers = [];
    const tg = new THREE.BoxGeometry(0.025, 0.025, 1); tg.translate(0, 0, -0.5);
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ color: 0xaaf0ff, toneMapped: false, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      m.visible = false; m.frustumCulled = false; m.userData.t = 0; scene.add(m); this.tracers.push(m);
    }
    this.ti = 0;
    // rings (shock waves) - flat expanding discs
    this.rings = [];
    const rg = new THREE.RingGeometry(0.85, 1, 32); rg.rotateX(-Math.PI / 2);
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xffa050, toneMapped: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide }));
      m.visible = false; m.userData.t = 0; scene.add(m); this.rings.push(m);
    }
    this.ri = 0;
    // decals
    this.ND = 140; this.di = 0;
    const dc = document.createElement("canvas"); dc.width = dc.height = 64; const x = dc.getContext("2d");
    let gr = x.createRadialGradient(32, 32, 0, 32, 32, 30); gr.addColorStop(0, "rgba(0,0,0,0.95)"); gr.addColorStop(0.18, "rgba(0,0,0,0.9)"); gr.addColorStop(0.3, "rgba(20,14,10,0.55)"); gr.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    const dt = new THREE.CanvasTexture(dc);
    const dg = new THREE.PlaneGeometry(1, 1);
    this.decalMesh = new THREE.InstancedMesh(dg, new THREE.MeshBasicMaterial({ map: dt, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, color: 0xffffff }), this.ND);
    this.decalMesh.frustumCulled = false; this.decalMesh.count = this.ND;
    for (let i = 0; i < this.ND; i++) { this._m.makeScale(0, 0, 0); this.decalMesh.setMatrixAt(i, this._m); }
    scene.add(this.decalMesh);
    this.decalLife = new Float32Array(this.ND);
    // flash lights
    this.flashL = new THREE.PointLight(0xffc880, 0, 16, 2); scene.add(this.flashL); this.flashT = 0; this.flashMax = 0.08; this.flashI = 0;
    this.explL = new THREE.PointLight(0xff8040, 0, 22, 2); scene.add(this.explL); this.explT = 0; this.explI = 0;
    this.scene = scene; this.weather = null;
  }
  decal(pos, n, size = 0.18) {
    const i = this.di; this.di = (this.di + 1) % this.ND;
    const up = new THREE.Vector3(0, 0, 1), q = new THREE.Quaternion().setFromUnitVectors(up, n);
    q.multiply(new THREE.Quaternion().setFromAxisAngle(up, Math.random() * 6.28));
    const s = size * (0.8 + Math.random() * 0.5);
    this._m.compose(new THREE.Vector3(pos.x + n.x * 0.012, pos.y + n.y * 0.012, pos.z + n.z * 0.012), q, new THREE.Vector3(s, s, s));
    this.decalMesh.setMatrixAt(i, this._m); this.decalMesh.instanceMatrix.needsUpdate = true;
  }
  flash(pos, color, intensity = 30, dur = 0.08) { this.flashL.position.copy(pos); this.flashL.color.setHex(color); this.flashI = intensity; this.flashT = this.flashMax = dur; }
  setWeather(kind, scale) {
    if (this.weather) { this.scene.remove(this.weather); this.weather.geometry.dispose(); this.weather.material.dispose(); this.weather = null; }
    if (!kind || !scale) return;
    const P = { rain: { n: 1600, box: [34, 18, 34], speed: 16, sway: 0, size: 0.7, col: [0.65, 0.78, 1.0], a: 0.5, kind: 0 },
      snow: { n: 1400, box: [36, 16, 36], speed: 1.6, sway: 1.2, size: 0.07, col: [1, 1, 1], a: 0.85, kind: 1 },
      embers: { n: 520, box: [34, 12, 34], speed: -1.4, sway: 1.0, size: 0.06, col: [1, 0.55, 0.15], a: 1.6, kind: 2 },
      dust: { n: 600, box: [30, 8, 30], speed: 0.1, sway: 0.5, size: 0.05, col: [0.9, 0.95, 1], a: 0.4, kind: 3 },
      spores: { n: 700, box: [32, 14, 32], speed: -0.7, sway: 0.9, size: 0.1, col: [1, 0.3, 0.8], a: 1.2, kind: 2 } }[kind];
    if (!P) return;
    const n = Math.round(P.n * scale), pos = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) pos[i] = Math.random();
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e5);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { uTime: { value: 0 }, uC: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(...P.box) }, uSpeed: { value: P.speed }, uSway: { value: P.sway }, uSize: { value: P.size }, uCol: { value: new THREE.Vector3(...P.col) }, uA: { value: P.a }, uKind: { value: P.kind }, uScale: { value: 600 } },
      vertexShader: `uniform float uTime, uSpeed, uSway, uSize, uScale, uA; uniform vec3 uC, uBox, uCol; uniform int uKind; varying float vA; varying float vK;
        void main(){ vec3 p = position*uBox; float s = position.x*37.0+position.z*11.0;
          p.y -= uTime*uSpeed*(0.8+0.4*fract(s)); p.x += sin(uTime*0.7+s)*uSway; p.z += cos(uTime*0.6+s*1.3)*uSway;
          vec3 w = uC + mod(p-uC+uBox*0.5, uBox) - uBox*0.5; w.y = mod(w.y, uBox.y);
          vec4 mv = modelViewMatrix*vec4(w,1.0); gl_Position = projectionMatrix*mv;
          float d = -mv.z; vA = uA*smoothstep(0.3,2.0,d)*(1.0-smoothstep(uBox.x*0.3,uBox.x*0.5,d)); vK = float(uKind);
          float tw = uKind>=2 ? 0.6+0.4*sin(uTime*3.0+s) : 1.0; vA *= tw;
          gl_PointSize = clamp(uSize*(uKind==0?1.6:1.0)*uScale/max(0.1,d), 1.0, uKind==0?48.0:22.0); }`,
      fragmentShader: `uniform vec3 uCol; varying float vA; varying float vK;
        void main(){ vec2 c = gl_PointCoord-0.5; float a;
          if (vK < 0.5) { a = smoothstep(0.5,0.0,abs(c.y)*0.0+abs(c.x)*10.0) * smoothstep(0.5,0.35,abs(c.y)); a*=0.7; }
          else { a = smoothstep(0.5,0.0,length(c)); a*=a; }
          gl_FragColor = vec4(uCol*a*vA, 1.0); }`,
    });
    this.weather = new THREE.Points(g, mat); this.weather.frustumCulled = false; this.weather.renderOrder = 4; this.scene.add(this.weather);
  }
  setScale(h, fov) { this.p.setScale(h, fov); if (this.weather) this.weather.material.uniforms.uScale.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2)); }
  tracer(from, to, color = 0xaaf0ff) {
    const m = this.tracers[this.ti]; this.ti = (this.ti + 1) % this.tracers.length;
    m.position.copy(from); m.lookAt(to); m.scale.set(1, 1, from.distanceTo(to)); m.material.color.setHex(color);
    m.visible = true; m.userData.t = 0.09; m.material.opacity = 1;
  }
  sparks(pos, normal, n = 10, color = [1, 0.75, 0.35]) {
    for (let i = 0; i < n; i++) {
      const sp = rnd(2, 7);
      this.p.emit(pos.x, pos.y, pos.z,
        normal.x * sp + rnd(-2, 2), normal.y * sp + rnd(0, 3), normal.z * sp + rnd(-2, 2),
        rnd(0.25, 0.6), 0.09, 0.02, [color[0], color[1], color[2], 1], [1, 0.3, 0.1, 0], 12, 0.5);
    }
    this.p.emit(pos.x + normal.x * 0.05, pos.y + normal.y * 0.05, pos.z + normal.z * 0.05, 0, 0, 0, 0.1, 0.5, 0.9, [1, 0.85, 0.6, 0.9], [1, 0.5, 0.2, 0], 0, 0);
  }
  hitFlesh(pos, n = 8) {
    for (let i = 0; i < n; i++) {
      const sp = rnd(1.5, 5);
      this.p.emit(pos.x, pos.y, pos.z, rnd(-1, 1) * sp, rnd(-0.3, 1) * sp, rnd(-1, 1) * sp, rnd(0.2, 0.45), 0.1, 0.02, [0.6, 0.9, 1, 1], [0.3, 0.5, 1, 0], 10, 0.4);
    }
    this.p.emit(pos.x, pos.y, pos.z, 0, 0, 0, 0.12, 0.7, 1.1, [0.8, 1, 1, 0.9], [0.3, 0.7, 1, 0], 0, 0);
  }
  ring(pos, size = 4, color = 0xffa050, t = 0.45) {
    const m = this.rings[this.ri]; this.ri = (this.ri + 1) % this.rings.length;
    m.position.set(pos.x, Math.max(0.05, pos.y * 0.25 + 0.05), pos.z); m.userData.t = t; m.userData.max = t; m.userData.size = size;
    m.material.color.setHex(color); m.visible = true; m.scale.setScalar(0.1);
  }
  explosion(pos, big = 1) {
    const n = Math.round(36 * big);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, e = rnd(-0.2, 1), sp = rnd(2, 9) * big;
      this.p.emit(pos.x, pos.y, pos.z, Math.cos(a) * sp * (1 - e * 0.4), e * sp + 1.5, Math.sin(a) * sp * (1 - e * 0.4), rnd(0.4, 1.0), 0.14 * big, 0.03, [1, 0.8, 0.4, 1], [1, 0.2, 0.05, 0], 9, 0.8);
    }
    for (let i = 0; i < 9; i++) {
      this.p.emit(pos.x + rnd(-0.3, 0.3), pos.y + rnd(-0.3, 0.3), pos.z + rnd(-0.3, 0.3), rnd(-1, 1), rnd(-0.3, 1.2), rnd(-1, 1), rnd(0.35, 0.7), 1.4 * big, 3.4 * big, [1, 0.7, 0.3, 0.85], [0.9, 0.15, 0.05, 0], 0, 1.5);
    }
    this.p.emit(pos.x, pos.y, pos.z, 0, 0, 0, 0.22, 2.2 * big, 4.5 * big, [1, 0.95, 0.8, 1], [1, 0.5, 0.2, 0], 0, 0);
    this.ring(pos, 5 * big);
    this.explL.position.set(pos.x, pos.y + 0.6, pos.z); this.explI = 160 * big; this.explT = 0.5;
    // debris
    for (let i = 0; i < 7; i++) {
      const d = this.deb[this.debI]; this.debI = (this.debI + 1) % this.NDEB;
      const a = Math.random() * 6.283, sp = rnd(2.5, 7);
      d.p.copy(pos); d.v.set(Math.cos(a) * sp, rnd(2.5, 6.5), Math.sin(a) * sp); d.r.set(rnd(-9, 9), rnd(-9, 9), rnd(-9, 9));
      d.life = d.max = rnd(0.9, 1.6); d.s = rnd(0.05, 0.14) * big; d.rot = new THREE.Vector3();
    }
  }
  muzzleSmoke(pos, dir) {
    for (let i = 0; i < 3; i++) this.p.emit(pos.x, pos.y, pos.z, dir.x * 2 + rnd(-0.4, 0.4), dir.y * 2 + rnd(0, 0.5), dir.z * 2 + rnd(-0.4, 0.4), 0.5, 0.08, 0.3, [0.5, 0.55, 0.7, 0.18], [0.3, 0.3, 0.4, 0], 0, 2);
  }
  pickupBurst(pos, color) {
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * 6.283, sp = rnd(1, 3.5);
      this.p.emit(pos.x, pos.y + 0.4, pos.z, Math.cos(a) * sp, rnd(1, 4), Math.sin(a) * sp, rnd(0.4, 0.8), 0.12, 0.02, [color[0], color[1], color[2], 1], [color[0], color[1], color[2], 0], 6, 0.5);
    }
    this.ring(pos, 2.2, new THREE.Color(color[0], color[1], color[2]).getHex(), 0.5);
  }
  spawnBurst(pos, color = [0.4, 0.9, 1]) {
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * 6.283, sp = rnd(1, 4);
      this.p.emit(pos.x, pos.y, pos.z, Math.cos(a) * sp, rnd(-1, 3), Math.sin(a) * sp, rnd(0.4, 0.9), 0.12, 0.02, [color[0], color[1], color[2], 1], [color[0], color[1], color[2], 0], 3, 0.5);
    }
    this.p.emit(pos.x, pos.y, pos.z, 0, 0, 0, 0.35, 0.6, 3.2, [color[0], color[1], color[2], 0.9], [color[0], color[1], color[2], 0], 0, 0);
    this.ring(pos, 3, new THREE.Color(color[0], color[1], color[2]).getHex(), 0.5);
  }
  update(dt, time = 0, cam = null) {
    this.p.update(dt);
    if (this.weather && cam) { const u = this.weather.material.uniforms; u.uTime.value = time; u.uC.value.copy(cam.position); }
    if (this.flashT > 0) { this.flashT -= dt; this.flashL.intensity = Math.max(0, this.flashT / this.flashMax) * this.flashI; } else this.flashL.intensity = 0;
    if (this.explT > 0) { this.explT -= dt; this.explL.intensity = Math.max(0, this.explT / 0.5) * this.explI; } else this.explL.intensity = 0;
    for (const m of this.tracers) if (m.visible) { m.userData.t -= dt; m.material.opacity = Math.max(0, m.userData.t / 0.09); if (m.userData.t <= 0) m.visible = false; }
    for (const m of this.rings) if (m.visible) {
      m.userData.t -= dt; const k = 1 - Math.max(0, m.userData.t) / m.userData.max;
      m.scale.setScalar(0.2 + k * m.userData.size); m.material.opacity = (1 - k) * 0.9;
      if (m.userData.t <= 0) m.visible = false;
    }
    for (let i = 0; i < this.NDEB; i++) {
      const d = this.deb[i];
      if (d.life <= 0) continue;
      d.life -= dt;
      if (d.life <= 0) { this._m.makeScale(0, 0, 0); this.debMesh.setMatrixAt(i, this._m); continue; }
      d.v.y -= 16 * dt; d.p.addScaledVector(d.v, dt);
      if (d.p.y < d.s) { d.p.y = d.s; d.v.y *= -0.4; d.v.x *= 0.7; d.v.z *= 0.7; }
      d.rot.addScaledVector(d.r, dt);
      this._e.set(d.rot.x, d.rot.y, d.rot.z); this._q.setFromEuler(this._e);
      const sc = d.s * Math.min(1, d.life / 0.3);
      this._s.set(sc * 1.6, sc, sc * 1.2);
      this._m.compose(d.p, this._q, this._s);
      this.debMesh.setMatrixAt(i, this._m);
    }
    this.debMesh.instanceMatrix.needsUpdate = true;
  }
  deathBurst(pos, size = 1, color = [0.5, 0.9, 1]) {
    for (let i = 0; i < 26; i++) { const a = Math.random() * 6.283, e = rnd(-0.3, 1), sp = rnd(2, 7) * size; this.p.emit(pos.x, pos.y, pos.z, Math.cos(a) * sp, e * sp + 1.5, Math.sin(a) * sp, rnd(0.4, 0.9), 0.1 * size, 0.02, [color[0], color[1], color[2], 1], [1, 0.3, 0.1, 0], 8, 0.6); }
    this.p.emit(pos.x, pos.y, pos.z, 0, 0, 0, 0.3, 0.9 * size, 2.4 * size, [1, 0.9, 0.7, 0.9], [1, 0.4, 0.2, 0], 0, 0);
    for (let i = 0; i < 4; i++) { const d = this.deb[this.debI]; this.debI = (this.debI + 1) % this.NDEB; const a = Math.random() * 6.283, sp = rnd(2, 5); d.p.copy(pos); d.v.set(Math.cos(a) * sp, rnd(2.5, 5), Math.sin(a) * sp); d.r.set(rnd(-9, 9), rnd(-9, 9), rnd(-9, 9)); d.life = d.max = rnd(0.8, 1.4); d.s = rnd(0.05, 0.12) * size; d.rot = new THREE.Vector3(); }
  }
  clear() {
    for (let i = 0; i < this.ND; i++) { this._m.makeScale(0, 0, 0); this.decalMesh.setMatrixAt(i, this._m); } this.decalMesh.instanceMatrix.needsUpdate = true; this.flashT = 0; this.explT = 0;
    this.p.age.fill(99); this.p.aSize.fill(0);
    this.deb.forEach((d) => { d.life = 0; });
    for (let i = 0; i < this.NDEB; i++) { this._m.makeScale(0, 0, 0); this.debMesh.setMatrixAt(i, this._m); }
    this.debMesh.instanceMatrix.needsUpdate = true;
    this.tracers.forEach((m) => { m.visible = false; }); this.rings.forEach((m) => { m.visible = false; });
  }
}
