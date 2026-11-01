const KM = "Kevin MacLeod (incompetech.com)", KML = "CC BY 4.0", KMU = "https://incompetech.com/music/royalty-free/music.html";
export const CREDITS = [
  { group: "音樂 Music", items: [
    { name: "Cyborg Ninja（第 1 關・霓虹街區）", by: KM, lic: KML, url: KMU },
    { name: "Crusade - Heavy Industry（第 2 關・工業廠區）", by: KM, lic: KML, url: KMU },
    { name: "Machinations（第 3 關・地下實驗室）", by: KM, lic: KML, url: KMU },
    { name: "Frozen Star（第 4 關・雪原哨站）", by: KM, lic: KML, url: KMU },
    { name: "Hitman（第 5 關・夜之屋頂）", by: KM, lic: KML, url: KMU },
    { name: "Interloper（第 6 關・零號核心）", by: KM, lic: KML, url: KMU },
    { name: "Aggressor（首領戰 1）", by: KM, lic: KML, url: KMU },
    { name: "Impact Prelude（首領戰 2）", by: KM, lic: KML, url: KMU },
    { name: "Volatile Reaction（無盡生存）", by: KM, lic: KML, url: KMU },
    { name: "Eternal Hope（勝利）", by: KM, lic: KML, url: KMU },
    { name: "Dark City（主選單）", by: "cinameng（James Gargette）", lic: "CC0 1.0", url: "https://opengameart.org/content/dark-city-0" },
  ], note: "Kevin MacLeod 的曲目依 Creative Commons Attribution 4.0 授權使用（已剪輯為循環）。曲目已為遊戲循環而剪輯與響度標準化。" },
  { group: "3D 模型", items: [
    { name: "Sci-Fi Essentials Kit（機器人敵人、手槍／左輪／步槍／狙擊槍、補給箱、桶子、鑰匙卡）", by: "Quaternius", lic: "CC0 1.0", url: "https://quaternius.com/packs/scifiessentialskit.html" },
    { name: "霰彈槍與火箭筒模型", by: "Quaternius（經由 Poly Pizza）", lic: "CC0 1.0", url: "https://poly.pizza/" },
    { name: "Space Kit（砲塔、發電機、岩石、水晶、太空人、衛星天線）", by: "Kenney", lic: "CC0 1.0", url: "https://kenney.nl/assets/space-kit" },
  ] },
  { group: "環境貼圖 HDRI", items: [
    { name: "Shanghai Bund、Industrial Sunset 02 (Puresky)、Snowy Park 01、Rooftop Night", by: "Poly Haven 與其 HDRI 攝影師", lic: "CC0 1.0", url: "https://polyhaven.com/hdris" },
  ] },
  { group: "PBR 材質", items: [
    { name: "Asphalt031、Concrete034、Concrete042C、Concrete047A、CorrugatedSteel007A、DiamondPlate008C、Facade018A、Facade019A、Marble012、Metal038、Metal049A、Metal055A、MetalPlates006、MetalPlates015A、MetalPlates016A、MetalWalkway014、PaintedMetal008、Road012A、Rock058、Rust009、Snow006、Tiles107", by: "ambientCG（Lennart Demes）", lic: "CC0 1.0", url: "https://ambientcg.com/" },
  ] },
  { group: "音效", items: [
    { name: "Sci-fi Sounds", by: "Kenney", lic: "CC0 1.0", url: "https://kenney.nl/assets/sci-fi-sounds" },
    { name: "Impact Sounds", by: "Kenney", lic: "CC0 1.0", url: "https://kenney.nl/assets/impact-sounds" },
    { name: "Interface Sounds", by: "Kenney", lic: "CC0 1.0", url: "https://kenney.nl/assets/interface-sounds" },
    { name: "環境音、心跳、警報等合成音效", by: "本專案（程式合成並混音）", lic: "原創", url: "" },
  ], note: "音效經過剪輯、疊層、變調與混音後編碼為 MP3。" },
  { group: "程式與其他", items: [
    { name: "Three.js（3D 引擎）", by: "mrdoob 與貢獻者", lic: "MIT", url: "https://threejs.org/" },
    { name: "Vite（建置工具）", by: "Evan You 與貢獻者", lic: "MIT", url: "https://vite.dev/" },
    { name: "霓虹迷宮：全面進化 — 關卡、AI、介面與遊戲程式", by: "本專案（原創）", lic: "—", url: "" },
  ] },
];
export function creditsMarkdown() {
  let s = "# Credits & Licenses\n\nNeon Maze: Full Release — assets and licenses.\n\n";
  for (const g of CREDITS) { s += `## ${g.group}\n\n`; for (const i of g.items) s += `- **${i.name}** — ${i.by} — ${i.lic}${i.url ? ` — ${i.url}` : ""}${i.note ? `\n  - ${i.note}` : ""}\n`; if (g.note) s += `\n> ${g.note}\n`; s += "\n"; }
  s += "## Attribution (required by CC BY 4.0)\n\nMusic by Kevin MacLeod (incompetech.com). Licensed under Creative Commons: By Attribution 4.0 License — http://creativecommons.org/licenses/by/4.0/\n";
  return s;
}
