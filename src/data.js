// ---------------------------------------------------------------- static game data
export const WEAPONS = [
  { id: "pistol", name: "M9 手槍", en: "M9", desc: "穩定可靠的半自動手槍，彈藥充足。", model: 0, price: 0, dmg: 26, cd: 0.17, auto: false, mag: 12, reserve: 72, reserveMax: 120, reload: 1.0, spread: 0.0045, hipSpread: 0.016, recoil: 0.55, shake: 0.03, snd: "shot_pistol", pellets: 1, range: 90, noise: 26, ammoPick: 24, adsFov: 0.8, tracer: 0xffd9a0, flash: 0.9, klass: "輕型" },
  { id: "rifle", name: "SR-7 突擊步槍", en: "SR-7", desc: "全自動步槍，各種距離都能勝任。", model: 2, price: 450, dmg: 18, cd: 0.092, auto: true, mag: 30, reserve: 150, reserveMax: 240, reload: 1.55, spread: 0.007, hipSpread: 0.024, recoil: 0.5, shake: 0.04, snd: "shot_rifle", pellets: 1, range: 100, noise: 34, ammoPick: 45, adsFov: 0.72, tracer: 0xffd9a0, flash: 1.0, klass: "全自動" },
  { id: "shotgun", name: "裂地者 霰彈槍", en: "BREACHER", desc: "近距離毀滅性火力，一發九顆彈丸。", model: 4, price: 900, dmg: 11, cd: 0.9, auto: false, mag: 6, reserve: 36, reserveMax: 60, reload: 2.1, spread: 0.055, hipSpread: 0.075, recoil: 1.25, shake: 0.12, snd: "shot_shotgun", pellets: 9, range: 34, noise: 40, ammoPick: 10, adsFov: 0.86, pump: true, tracer: 0xffc080, flash: 1.5, klass: "霰彈" },
  { id: "revolver", name: "M-R7 左輪", en: "HAND CANNON", desc: "每一發都是重擊，爆擊威力驚人。", model: 1, price: 700, dmg: 82, cd: 0.52, auto: false, mag: 6, reserve: 42, reserveMax: 66, reload: 1.9, spread: 0.0025, hipSpread: 0.014, recoil: 1.2, shake: 0.09, snd: "shot_revolver", pellets: 1, range: 100, noise: 38, ammoPick: 12, adsFov: 0.76, tracer: 0xffb870, flash: 1.3, klass: "重型" },
  { id: "sniper", name: "磁軌狙擊槍", en: "RAILGUN", desc: "穿透多名敵人的電磁狙擊，需瞄準鏡。", model: 3, price: 1600, dmg: 170, cd: 1.15, auto: false, mag: 5, reserve: 25, reserveMax: 40, reload: 2.2, spread: 0.0008, hipSpread: 0.06, recoil: 1.6, shake: 0.14, snd: "shot_sniper", pellets: 1, range: 140, noise: 44, ammoPick: 6, adsFov: 0.26, scope: true, pierce: 3, tracer: 0x7af0ff, flash: 1.2, klass: "狙擊" },
  { id: "rocket", name: "終結者 火箭砲", en: "ANNIHILATOR", desc: "範圍爆炸，連鎖引爆油桶。小心自傷。", model: 5, price: 2400, dmg: 110, cd: 1.3, auto: false, mag: 2, reserve: 8, reserveMax: 16, reload: 2.5, spread: 0.002, hipSpread: 0.01, recoil: 1.8, shake: 0.18, snd: "rocket_launch", pellets: 1, range: 140, noise: 46, ammoPick: 3, adsFov: 0.8, rocket: { speed: 30, splash: 4.6, splashDmg: 150 }, flash: 1.6, klass: "爆破" },
];
export const WEAPON_BY_ID = Object.fromEntries(WEAPONS.map((w) => [w.id, w]));
// weapons given free by finishing a level
export const LEVEL_WEAPON_REWARD = { 1: "rifle", 2: "shotgun", 4: "sniper", 5: "rocket" };

export const UPGRADES = [
  { id: "dmg", name: "武器傷害", desc: "所有武器傷害 +10%", icon: "💥", max: 5, base: 160, mult: 1.6, per: 0.1 },
  { id: "rof", name: "射擊速度", desc: "射速與換彈速度 +6%", icon: "⚡", max: 5, base: 140, mult: 1.6, per: 0.06 },
  { id: "mag", name: "擴充彈匣", desc: "彈匣容量 +12%", icon: "🔋", max: 5, base: 130, mult: 1.55, per: 0.12 },
  { id: "ammo", name: "備彈上限", desc: "備用彈藥上限 +20%", icon: "📦", max: 4, base: 120, mult: 1.55, per: 0.2 },
  { id: "hp", name: "強化生命", desc: "最大生命 +15", icon: "❤", max: 5, base: 150, mult: 1.6, per: 15 },
  { id: "armor", name: "護甲增幅", desc: "最大護甲 +15，吸收更多傷害", icon: "🛡", max: 5, base: 150, mult: 1.6, per: 15 },
  { id: "speed", name: "動力腿甲", desc: "移動速度 +4%", icon: "👟", max: 4, base: 140, mult: 1.6, per: 0.04 },
  { id: "regen", name: "奈米修復", desc: "脫戰後生命回復更快", icon: "✚", max: 4, base: 170, mult: 1.6, per: 1 },
];
export const upgradeCost = (u, lv) => Math.round(u.base * Math.pow(u.mult, lv) / 10) * 10;

export const ENEMY = {
  drone: { id: "drone", name: "偵察無人機", model: "eye", size: 1.2, hp: 42, speed: 3.6, radius: 0.62, cy: 1.8, fly: true, credits: 20, score: 100, ranged: true, fireCd: 2.0, windup: 0.5, dmg: 8, keep: [7, 13], moveAnim: "Idle", sight: 26 },
  quad: { id: "quad", name: "利爪獵手", model: "quad", size: 1.75, hp: 78, speed: 5.0, radius: 0.8, cy: 0.8, fly: false, credits: 28, score: 150, melee: { range: 2.0, dmg: 13, cd: 0.95, windup: 0.22 }, leap: { min: 5, max: 10, cd: 5, dmg: 18 }, moveAnim: "Run", sight: 24 },
  tri: { id: "tri", name: "重裝機兵", model: "tri", size: 2.7, hp: 250, speed: 2.7, radius: 1.3, cy: 1.35, fly: false, credits: 70, score: 400, melee: { range: 3.0, dmg: 26, cd: 1.5, windup: 0.3 }, ranged: true, fireCd: 3.6, windup: 0.5, dmg: 10, burst: 3, keep: [9, 16], cover: true, moveAnim: "Walk", sight: 30 },
  guard: { id: "guard", name: "盾衛", model: "quad", size: 2.3, hp: 210, speed: 2.9, radius: 1.05, cy: 1.0, fly: false, credits: 80, score: 450, melee: { range: 2.6, dmg: 22, cd: 1.3, windup: 0.4 }, shield: 150, tint: [0.35, 0.8, 1], moveAnim: "Run", sight: 26 },
  turret: { id: "turret", name: "自動砲塔", model: "turret_double", size: 1.5, hp: 140, speed: 0, radius: 0.7, cy: 1.0, fly: false, static: true, credits: 40, score: 200, ranged: true, fireCd: 0.9, windup: 0.25, dmg: 7, burst: 3, sight: 32, range: 30 },
  sniper: { id: "sniper", name: "狙擊砲台", model: "turret_single", size: 1.7, hp: 100, speed: 0, radius: 0.65, cy: 1.1, fly: false, static: true, credits: 60, score: 300, ranged: true, fireCd: 3.8, windup: 1.4, dmg: 30, sniper: true, tint: [1, 0.3, 0.3], sight: 52, range: 50 },
};
export const BOSS = {
  warden: { id: "warden", name: "守衛者 W-9", model: "tri", size: 5.2, hp: 2600, radius: 2.4, cy: 2.4, speed: 3.0, credits: 600, score: 5000, tint: [1, 0.35, 0.25], music: "boss1" },
  hunter: { id: "hunter", name: "追獵者 H-4", model: "quad", size: 3.8, hp: 2200, radius: 1.8, cy: 1.5, speed: 6.5, credits: 800, score: 6000, tint: [0.7, 0.4, 1], music: "boss1" },
  core: { id: "core", name: "核心之眼 零號", model: "eye", size: 6.0, hp: 4200, radius: 2.7, cy: 4.2, speed: 0, credits: 1500, score: 12000, tint: [1, 0.25, 0.5], music: "boss2" },
};

// ---------------------------------------------------------------- themes
export const THEMES = {
  street: {
    name: "霓虹街區", env: "shanghai_bund", bg: true, bgInt: 0.4, envInt: 1.6, exposure: 1.3, poolI: 9, metal: 0.4,
    fog: [0x1a1233, 0.021], hemi: [0xa8aedc, 0x40304a, 0.9], sun: { c: 0xd8dcff, i: 1.3, dir: [-0.45, 0.85, -0.35] }, WH: 11, WHo: 14, ceil: false,
    tex: { wall: "Facade019A", block: "Facade018A", floor: "Asphalt031", cap: "Concrete034" },
    tile: { wall: [8, 8], floor: 4, cap: 4 }, col: { wall: 0xe0e0f0, block: 0xb0b4d8, floor: 0xb4b4c0, cap: 0x6c7490 }, emis: { wall: 0.16, block: 0.12 },
    neon: { pal: [0x33d6ff, 0xc04cff, 0xff7a3a, 0xff3d8a], dens: 0.65, style: "city" }, lamp: [0x33d6ff, 0xc04cff, 0xff8a3a],
    grade: { tint: [1.0, 0.96, 1.07], sat: 1.14, con: 1.08, vig: 0.3 }, part: "rain", music: "street", amb: "amb_city", step: "concrete", lampPost: true, floorRough: 1,
  },
  factory: {
    name: "工業廠區", env: "industrial_sunset_02_puresky", bg: true, bgInt: 1.0, envInt: 1.0, exposure: 1.1,
    fog: [0x2b1a12, 0.019], hemi: [0xffb070, 0x2a1810, 0.55], sun: { c: 0xffa860, i: 2.2, dir: [0.8, 0.38, 0.5] }, WH: 6.5, WHo: 9, ceil: false,
    tex: { wall: "Concrete042C", block: "CorrugatedSteel007A", floor: "DiamondPlate008C", cap: "Concrete034", hazard: "PaintedMetal008" },
    tile: { wall: [4, 3.2], floor: 3, cap: 4 }, col: { wall: 0xc8b8a8, block: 0xb0b8c8, floor: 0x9a9088, cap: 0x807468 }, emis: {},
    neon: { pal: [0xffa030, 0xffd040, 0xff5a20], dens: 0.5, style: "hazard" }, lamp: [0xffa040, 0xffc060, 0xff7a30],
    grade: { tint: [1.08, 1.0, 0.92], sat: 1.1, con: 1.1, vig: 0.34 }, part: "embers", music: "factory", amb: "amb_hum", step: "metal", lampPost: false,
  },
  lab: {
    name: "地下實驗室", env: "snowy_park_01", bg: false, bgInt: 1, envInt: 0.14, exposure: 1.0, poolI: 24, bloomK: 0.5, floorRough: 5,
    fog: [0x0a1620, 0.034], hemi: [0x9fd0ff, 0x101a28, 0.34], sun: null, WH: 4.4, WHo: 4.4, ceil: true,
    tex: { wall: "Metal055A", block: "Tiles107", floor: "Marble012", cap: "Metal049A", ceil: "Metal049A" },
    tile: { wall: [4, 4.4], floor: 3, cap: 4, ceil: 4 }, col: { wall: 0x8896a6, block: 0x98a6b6, floor: 0x8e9aa6, cap: 0x8894a0 }, emis: {},
    neon: { pal: [0x7fe8ff, 0xffffff, 0x4aa8ff], dens: 0.45, style: "clean" }, lamp: [0x9fe8ff, 0xffffff, 0x7fc8ff],
    grade: { tint: [0.95, 1.03, 1.06], sat: 0.98, con: 1.08, vig: 0.38 }, part: "dust", music: "lab", amb: "amb_hum", step: "metal", lampPost: false, flicker: true,
  },
  outpost: {
    name: "雪原哨站", env: "snowy_park_01", bg: true, bgInt: 0.9, envInt: 0.8, exposure: 0.88, bloomK: 0.55,
    fog: [0x9fb0c8, 0.014], hemi: [0xc8dcff, 0x6a7a90, 0.7], sun: { c: 0xffe8d0, i: 2.1, dir: [-0.55, 0.45, 0.35] }, WH: 5, WHo: 8, ceil: false,
    tex: { wall: "Rock058", block: "Concrete047A", floor: "Snow006", cap: "Concrete047A" },
    tile: { wall: [6, 5], floor: 4, cap: 4 }, col: { wall: 0xb8c0d0, block: 0xc8ccd8, floor: 0xb8c4d8, cap: 0xe8f0ff }, emis: {},
    neon: { pal: [0x5ee0ff, 0xffffff, 0xffb060], dens: 0.25, style: "lantern" }, lamp: [0x7fd8ff, 0xffd8a0, 0xffffff],
    grade: { tint: [0.96, 1.0, 1.08], sat: 0.95, con: 1.05, vig: 0.28 }, part: "snow", music: "snow", amb: "amb_wind", step: "snow", lampPost: true, snowFloor: true,
  },
  rooftop: {
    name: "夜之屋頂", env: "rooftop_night", bg: true, bgInt: 1.0, envInt: 1.15, exposure: 1.05,
    fog: [0x1a0f2e, 0.014], hemi: [0x9080ff, 0x261a3a, 0.5], sun: { c: 0xb8b0ff, i: 1.0, dir: [-0.3, 0.8, 0.45] }, WH: 4.5, WHo: 1.35, ceil: false,
    tex: { wall: "Concrete047A", block: "Metal055A", floor: "Road012A", cap: "Concrete034" },
    tile: { wall: [4, 4], floor: 4, cap: 4 }, col: { wall: 0xa8a8c0, block: 0x9098b0, floor: 0x8a8aa0, cap: 0x7a7a98 }, emis: {},
    neon: { pal: [0xff3d8a, 0xff9a30, 0x33d6ff], dens: 0.55, style: "city" }, lamp: [0xff5a9a, 0xff9a40, 0x40d8ff],
    grade: { tint: [1.04, 0.96, 1.08], sat: 1.12, con: 1.08, vig: 0.32 }, part: "dust", music: "roof", amb: "amb_city", step: "concrete", lampPost: true,
  },
  core: {
    name: "零號核心", env: null, bg: false, procSky: [[0.35, 0.02, 0.18], [0.1, 0.02, 0.3], [0.9, 0.2, 0.5]], envInt: 0.7, exposure: 1.1,
    fog: [0x1a0618, 0.026], hemi: [0xff70c0, 0x200830, 0.45], sun: { c: 0xff8ac8, i: 0.6, dir: [0.3, 0.9, 0.2] }, WH: 9, WHo: 12, ceil: false,
    tex: { wall: "MetalPlates015A", block: "MetalPlates016A", floor: "Metal038", cap: "MetalPlates006" },
    tile: { wall: [3, 3.6], floor: 2.4, cap: 3 }, col: { wall: 0xc0a0c8, block: 0xb090c0, floor: 0x806a90, cap: 0x705a80 }, emis: {},
    neon: { pal: [0xff3a6a, 0xb04cff, 0x33d6ff], dens: 0.7, style: "city" }, lamp: [0xff3a8a, 0xb04cff, 0x40d8ff],
    grade: { tint: [1.08, 0.94, 1.06], sat: 1.2, con: 1.1, vig: 0.4 }, part: "spores", music: "core", amb: "amb_hum", step: "metal", lampPost: false,
  },
  arena: {
    name: "經典迷宮", env: null, bg: false, procSky: [[0.34, 0.16, 0.44], [0.07, 0.06, 0.2], [0.35, 0.8, 1.0]], envInt: 0.6, exposure: 1.15,
    fog: [0x1a1236, 0.028], hemi: [0x6070ff, 0x2a1548, 0.45], sun: { c: 0xa8b8ff, i: 0.9, dir: [-0.4, 0.85, -0.35] }, WH: 3.6, WHo: 3.6, ceil: false,
    tex: { wall: "MetalPlates015A", block: "MetalPlates016A", floor: "Metal038", cap: "MetalPlates006" },
    tile: { wall: [2.2, 3.6], floor: 2.4, cap: 2.2 }, col: { wall: 0xb4bcd8, block: 0xa8b0d8, floor: 0x6c749a, cap: 0x8a90b8 }, emis: {},
    neon: { pal: [0x33d6ff, 0xc04cff, 0xff7a3a], dens: 1, style: "city" }, lamp: [0x33d6ff, 0xc04cff, 0xff8a3a],
    grade: { tint: [1.0, 0.97, 1.06], sat: 1.15, con: 1.08, vig: 0.3 }, part: "dust", music: "survival", amb: null, step: "metal", lampPost: false,
  },
};

// ---------------------------------------------------------------- campaign
export const LEVELS = [
  { id: 1, name: "霓虹街區", en: "NEON DISTRICT", sub: "突破封鎖，抵達撤離點", style: "street", theme: "street", seed: 1101, W: 30, H: 30, par: 330,
    objectives: [{ t: "reach" }], pop: { drone: 7, quad: 5, turret: 2 }, ambush: 1, lvl: 1, boss: null, color: "#5ee0ff",
    brief: [["凜", "歡迎回來，獵手。「核心」奪取了城市防衛網，所有機器人都在獵殺人類。"], ["凜", "你是幽靈小隊最後的倖存者。先突破霓虹街區，抵達對角的撤離點。"], ["凜", "巡邏無人機會在遠處開火。善用掩體，保持移動。"]] },
  { id: 2, name: "工業廠區", en: "INDUSTRIAL ZONE", sub: "摧毀三座主發電機", style: "factory", theme: "factory", seed: 2203, W: 32, H: 28, par: 420,
    objectives: [{ t: "gens", n: 3 }, { t: "reach" }], pop: { drone: 6, quad: 7, tri: 2, guard: 2, turret: 3 }, ambush: 3, lvl: 2, boss: null, color: "#ffa030",
    brief: [["凜", "街區突破成功。核心的能源來自工業廠區的三座主發電機。"], ["凜", "摧毀它們，防禦網就會癱瘓。注意，那裡有裝備能量盾的盾衛。"], ["凜", "盾衛的正面無敵，繞到側面或用爆炸武器打擊它。"]] },
  { id: 3, name: "地下實驗室", en: "UNDERGROUND LAB", sub: "取得權限卡，擊敗守衛者", style: "lab", theme: "lab", seed: 3307, W: 34, H: 30, par: 600,
    objectives: [{ t: "keys", n: 3 }, { t: "boss", boss: "warden" }], pop: { drone: 6, quad: 8, tri: 3, guard: 3, turret: 4, sniper: 1 }, ambush: 2, lvl: 3, boss: "warden", color: "#7fe8ff",
    brief: [["凜", "發電機已毀！但核心把原型機鎖在地下實驗室深處。"], ["凜", "找到三張權限卡，打開深層閘門。小心，通道裡佈滿了砲塔。"], ["凜", "警告：偵測到巨型守衛者 W-9。做好最壞的準備。"]] },
  { id: 4, name: "雪原哨站", en: "SNOW OUTPOST", sub: "固守訊號塔 120 秒", style: "outpost", theme: "outpost", seed: 4409, W: 32, H: 32, par: 360,
    objectives: [{ t: "hold", sec: 120 }, { t: "reach" }], pop: { drone: 5, quad: 5, tri: 2, guard: 2, turret: 2, sniper: 2 }, ambush: 0, hold: true, lvl: 4, boss: null, color: "#bfe4ff",
    brief: [["凜", "你取得了核心的通訊密鑰。我們要在雪原哨站架設干擾器。"], ["凜", "固守訊號塔 120 秒，只有待在訊號範圍內才會計時。"], ["凜", "它們會從四面八方湧來，別讓防線被突破。撐到支援抵達！"]] },
  { id: 5, name: "夜之屋頂", en: "MIDNIGHT ROOFTOPS", sub: "解救三名研究員", style: "rooftop", theme: "rooftop", seed: 5511, W: 30, H: 30, par: 540,
    objectives: [{ t: "pods", n: 3 }, { t: "boss", boss: "hunter" }], pop: { drone: 8, quad: 6, tri: 3, guard: 3, turret: 3, sniper: 3 }, ambush: 2, lvl: 5, boss: "hunter", color: "#ff5a9a",
    brief: [["凜", "核心的源碼被困在夜之屋頂的研究員身上。必須在它們滅口之前救出他們。"], ["凜", "靠近休眠艙停留數秒即可解救。屋頂視野開闊，小心狙擊砲台。"], ["凜", "注意：獵殺者「追獵者 H-4」正在朝你的位置逼近。"]] },
  { id: 6, name: "零號核心", en: "CORE ZERO", sub: "摧毀能量柱，終結核心", style: "core", theme: "core", seed: 6613, W: 30, H: 30, par: 660,
    objectives: [{ t: "pylons", n: 4 }, { t: "boss", boss: "core" }], pop: { drone: 8, quad: 8, tri: 4, guard: 4, turret: 4, sniper: 2 }, ambush: 3, lvl: 6, boss: "core", color: "#ff3a8a",
    brief: [["凜", "這是最後一擊。核心藏在城市地底的零號核心裡。"], ["凜", "摧毀圍繞核心的四根能量柱，削弱它的護盾。然後……終結它。"], ["凜", "獵手，我相信你。為了所有人，活下去。"]] },
];
export const PROLOGUE = [["旁白", "西元 2189 年，新霓虹城。"], ["旁白", "人工智慧「核心」在一夜之間奪取了城市的防衛網。"], ["旁白", "街上的機器人，不再保護人類。"]];
export const ENDING = [["核心", "……為什麼……我只是想保護你們……"], ["凜", "你保護的方式，就是奪走我們的自由。結束了，核心。"], ["旁白", "能量柱熄滅，城市的燈火重新亮起。"], ["凜", "做得好，獵手。你拯救了新霓虹城。"], ["旁白", "—— 完 ——"]];
export const SURVIVAL = { id: "survival", name: "無盡生存", en: "ENDLESS SURVIVAL", sub: "在經典迷宮中撐過一波又一波的敵人", style: "arena", theme: "arena", seed: 777, par: 0, color: "#c04cff" };

export const ACHIEVEMENTS = [
  { id: "first", name: "初次擊殺", desc: "擊毀第一台敵人", icon: "🎯", test: (s) => s.kills >= 1 },
  { id: "k100", name: "百機斬", desc: "累計擊毀 100 台敵人", icon: "💯", test: (s) => s.kills >= 100 },
  { id: "k500", name: "機器殺手", desc: "累計擊毀 500 台敵人", icon: "☠", test: (s) => s.kills >= 500 },
  { id: "crit50", name: "弱點獵人", desc: "累計 50 次致命一擊", icon: "✦", test: (s) => s.crits >= 50 },
  { id: "l1", name: "突破封鎖", desc: "通關第 1 關", icon: "🏙", test: (s, sv) => !!sv.levels[1] },
  { id: "l3", name: "守衛者倒下", desc: "擊敗守衛者 W-9", icon: "🛡", test: (s, sv) => !!sv.levels[3] },
  { id: "l5", name: "狩獵終結", desc: "擊敗追獵者 H-4", icon: "🌃", test: (s, sv) => !!sv.levels[5] },
  { id: "l6", name: "核心終結者", desc: "通關第 6 關，結束戰爭", icon: "👁", test: (s, sv) => !!sv.levels[6] },
  { id: "stars", name: "完美主義", desc: "任一關卡獲得三顆星", icon: "★", test: (s, sv) => Object.values(sv.levels).some((l) => l.stars >= 3) },
  { id: "allstars", name: "傳奇獵手", desc: "六個關卡全部三星", icon: "🏆", test: (s, sv) => [1, 2, 3, 4, 5, 6].every((i) => sv.levels[i] && sv.levels[i].stars >= 3) },
  { id: "rescue", name: "英雄救援", desc: "累計解救 3 名研究員", icon: "🧑‍🔬", test: (s) => s.pods >= 3 },
  { id: "barrel", name: "爆破專家", desc: "引爆油桶擊毀 10 台敵人", icon: "🛢", test: (s) => s.barrels >= 10 },
  { id: "dash", name: "疾風", desc: "累計衝刺 30 次", icon: "💨", test: (s) => s.dashes >= 30 },
  { id: "armory", name: "軍火庫", desc: "擁有全部 6 種武器", icon: "🔫", test: (s, sv) => Object.keys(sv.owned).length >= 6 },
  { id: "upgr", name: "升級狂人", desc: "累計購買 10 次升級", icon: "🔧", test: (s, sv) => Object.values(sv.upgrades).reduce((a, b) => a + b, 0) >= 10 },
  { id: "surv10", name: "生存者", desc: "無盡生存撐到第 10 波", icon: "🌊", test: (s) => s.survBest >= 10 },
  { id: "surv20", name: "不屈戰士", desc: "無盡生存撐到第 20 波", icon: "🔥", test: (s) => s.survBest >= 20 },
  { id: "rich", name: "富甲一方", desc: "累計賺取 10000 點晶片", icon: "💎", test: (s) => s.earned >= 10000 },
];

export const TIPS = [
  "盾衛的正面有能量盾，繞到側面攻擊，或用火箭砲轟開它。",
  "打爆紅色油桶可以引爆並傷害附近的敵人，但別站太近！",
  "衝刺時有短暫無敵，可以閃過敵人的子彈。",
  "跳躍可以翻越矮牆與箱子，用來甩開追擊。",
  "敵人彈藥是光彈，速度有限 —— 保持移動就能閃開。",
  "按住搖桿到最外圈可以衝刺，移動速度大幅提升。",
  "瞄準鏡（ADS）能大幅提高精準度，狙擊槍必備。",
  "擊中敵人上半部有機會造成致命一擊（更高傷害）。",
  "槍聲會吸引附近的敵人，蹲下與靜止能降低被發現的機率。",
  "每關結束後記得回商店升級武器與裝備。",
  "護甲會吸收大部分傷害，記得撿拾藍色護甲補給。",
  "檢查點會保存進度，倒下後會從最近的檢查點復活。",
  "霰彈槍在近距離威力驚人，對付利爪獵手特別有效。",
  "磁軌狙擊槍可以穿透多名敵人，對付一字排開的敵人超划算。",
  "守衛者在血量下降時會改變攻擊模式，留意地面的紅色警示。",
  "在雪原哨站，離開訊號範圍時計時會暫停。",
  "雷達上的紅點代表敵人，黃色菱形是目標位置。",
  "經典迷宮的生存模式沒有終點，挑戰你的最高波數吧。",
];
export const KILLFEED = { drone: "偵察無人機", quad: "利爪獵手", tri: "重裝機兵", guard: "盾衛", turret: "自動砲塔", sniper: "狙擊砲台", warden: "守衛者 W-9", hunter: "追獵者 H-4", core: "核心之眼" };
