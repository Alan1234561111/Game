import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { FXAAPass } from "three/examples/jsm/postprocessing/FXAAPass.js";

import { isMobile, DPR_CAP } from "./platform.js";
export const TIERS = {
  high: { dpr: 1.5, composer: true, bloomRes: 0.75, bloom: 0.62, samples: 2, ao: true, fxaa: false, shadows: 2048, lights: 4 },
  medium: { dpr: 1.25, composer: true, bloomRes: 0.5, bloom: 0.6, samples: 0, ao: false, fxaa: true, shadows: 0, lights: 2 },
  lite: { dpr: 1.25, composer: true, bloomRes: 0.25, bloom: 0.5, samples: 0, ao: false, fxaa: false, shadows: 0, lights: 2, lite: true },
  low: { dpr: 1, composer: false, bloomRes: 0.5, bloom: 0, samples: 0, ao: false, fxaa: false, shadows: 0, lights: 0 },
};
export const TIER_ORDER = ["high", "medium", "lite", "low"];

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uTint: { value: new THREE.Vector3(1, 1, 1) }, uSat: { value: 1.1 }, uCon: { value: 1.05 }, uVig: { value: 0.3 }, uDmg: { value: 0 }, uFlash: { value: new THREE.Vector4(1, 1, 1, 0) }, uAb: { value: 0.0 }, uTime: { value: 0 }, uGrain: { value: 0.02 }, uLow: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec3 uTint; uniform float uSat, uCon, uVig, uDmg, uAb, uTime, uGrain, uLow; uniform vec4 uFlash; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
    void main(){
      vec2 d = vUv - 0.5; float r2 = dot(d,d);
      float ab = uAb * r2 * 2.0;
      vec3 c; c.r = texture2D(tDiffuse, vUv + d*ab).r; c.g = texture2D(tDiffuse, vUv).g; c.b = texture2D(tDiffuse, vUv - d*ab).b;
      c *= uTint;
      float l = dot(c, vec3(0.2126,0.7152,0.0722));
      c = mix(vec3(l), c, uSat);
      c = (c - 0.18) * uCon + 0.18; c = max(c, 0.0);
      float v = smoothstep(0.1, 0.62, r2 * 1.6);
      c *= 1.0 - v * uVig * 1.6;
      c = mix(c, c * vec3(1.0, 0.25, 0.2), v * uDmg);
      c += vec3(1.0,0.12,0.1) * v * uDmg * 0.25;
      c = mix(c, uFlash.rgb * 1.2, uFlash.a);
      c += (h(vUv * 800.0 + uTime) - 0.5) * uGrain;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    let r;
    try { r = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, powerPreference: "high-performance", stencil: false, alpha: false, preserveDrawingBuffer: false }); }
    catch (e) { throw new Error("WebGL 無法啟動：" + e.message); }
    this.r = r;
    this.lost = false; this.onLost = null; this.onRestored = null;
    canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); this.lost = true; this.onLost && this.onLost(); }, false);
    canvas.addEventListener("webglcontextrestored", () => { this.lost = false; this.resize(true); this.onRestored && this.onRestored(); }, false);
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.1;
    r.autoClear = false;
    r.shadowMap.enabled = false; r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.tier = TIERS.high; this.tierName = "high"; this.dynScale = 1;
    this.w = 1; this.h = 1; this.pr = 1; this.composer = null; this.onResize = null; this.fovBase = 80; this.fovMul = 1;
  }
  setTier(name, scene, cam, wScene, wCam) {
    this.tierName = name; this.tier = TIERS[name];
    this.scene = scene; this.cam = cam; this.wScene = wScene; this.wCam = wCam;
    this.r.shadowMap.enabled = this.tier.shadows > 0;
    this.buildComposer(); this.resize(true);
  }
  rebind(scene) { this.scene = scene; this.buildComposer(); this.resize(true); }
  buildComposer() {
    if (this.composer) { this.composer.dispose(); this.composer = null; this.bloom = null; this.grade = null; this.ao = null; }
    if (!this.tier.composer) { this.r.toneMappingExposure = this.exposure || 1.1; return; }
    const size = this.r.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: this.tier.samples });
    const c = new EffectComposer(this.r, rt);
    c.addPass(new RenderPass(this.scene, this.cam));
    if (this.tier.ao) {
      const ao = new GTAOPass(this.scene, this.cam, size.x, size.y);
      ao.output = GTAOPass.OUTPUT.Default; ao.blendIntensity = 0.9;
      try { ao.updateGtaoMaterial({ radius: 1.1, distanceExponent: 1.5, thickness: 1.5, scale: 1.2, samples: 12, distanceFallOff: 1, screenSpaceRadius: false }); ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 }); } catch (_e) { /* ignore */ }
      c.addPass(ao); this.ao = ao;
    }
    const p2 = new RenderPass(this.wScene, this.wCam); p2.clear = false; p2.clearDepth = true; c.addPass(p2);
    const bloom = new UnrealBloomPass(new THREE.Vector2(size.x * this.tier.bloomRes, size.y * this.tier.bloomRes), this.tier.bloom, 0.6, 0.85);
    c.addPass(bloom); this.bloom = bloom;
    const grade = new ShaderPass(GradeShader); c.addPass(grade); this.grade = grade;
    c.addPass(new OutputPass());
    if (this.tier.fxaa) { try { c.addPass(new FXAAPass()); } catch (_e) { /* ignore */ } }
    this.composer = c;
  }
  setGrade(g, exposure) {
    this.exposure = exposure; if (!this.composer) this.r.toneMappingExposure = exposure; else this.r.toneMappingExposure = exposure;
    if (!this.grade) return; const u = this.grade.uniforms;
    u.uTint.value.set(g.tint[0], g.tint[1], g.tint[2]); u.uSat.value = g.sat; u.uCon.value = g.con; u.uVig.value = g.vig;
  }
  setDyn(dmg, flash, ab, t) { if (!this.grade) return; const u = this.grade.uniforms; u.uDmg.value = dmg; u.uAb.value = ab; u.uTime.value = t % 10; if (flash) u.uFlash.value.set(flash[0], flash[1], flash[2], flash[3]); else u.uFlash.value.w = 0; }
  setDynScale(s) { this.dynScale = s; this.resize(true); }
  setFov(f) { this.fovBase = f; this.resize(true); }
  resize(force) {
    const w = Math.max(1, this.canvas.clientWidth || window.innerWidth), h = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    const pr = Math.max(0.5, Math.min(window.devicePixelRatio || 1, DPR_CAP, this.tier.dpr) * this.dynScale);
    if (!force && w === this.w && h === this.h && pr === this.pr) return;
    this.w = w; this.h = h; this.pr = pr;
    this.r.setPixelRatio(pr); this.r.setSize(w, h, false);
    if (this.composer) { this.composer.setPixelRatio(pr); this.composer.setSize(w, h); if (this.bloom) this.bloom.resolution.set(w * pr * this.tier.bloomRes, h * pr * this.tier.bloomRes); }
    this.applyFov();
    if (this.onResize) this.onResize(w, h, pr);
  }
  applyFov() {
    if (!this.cam || !this.wCam) return;
    const asp = this.w / this.h;
    // user FOV is the horizontal FOV at 16:9; keep that horizontal extent in portrait with a floor
    const hf = this.fovBase * Math.PI / 180;
    const ref = 16 / 9;
    const vf0 = 2 * Math.atan(Math.tan(hf / 2) / ref);
    let vf = asp >= 1 ? vf0 * 180 / Math.PI : 2 * Math.atan(Math.tan(Math.min(hf, 1.7) / 2) / asp) * 180 / Math.PI;
    vf = Math.max(50, Math.min(105, vf)) * this.fovMul;
    this.vf = vf; this.cam.aspect = asp; this.cam.fov = vf; this.cam.updateProjectionMatrix();
    this.wCam.aspect = asp; this.wCam.fov = 58; this.wCam.updateProjectionMatrix();
  }
  render() {
    if (this.lost) return;
    if (this.composer) { this.composer.render(); return; }
    const r = this.r; r.setRenderTarget(null); r.clear(); r.render(this.scene, this.cam); r.clearDepth(); r.render(this.wScene, this.wCam);
  }
}
