import "./style.css";
import "./platform.js";
import "./nozoom.js";
import { Game } from "./game.js";
import { Hud } from "./hud.js";
import { UI } from "./ui.js";
import { Input } from "./input.js";
import { settings } from "./save.js";
import { $ } from "./util.js";

const DEBUG = new URLSearchParams(location.search).has("debug");
async function main() {
  document.documentElement.style.setProperty("--fs", settings.ctrlScale);
  const hud = new Hud(); const input = new Input();
  let game;
  try { game = new Game($("c"), hud, input); } catch (e) { $("ldTxt").textContent = "無法啟動 WebGL：" + e.message; throw e; }
  const ui = new UI(game, hud);
  if (DEBUG) { game.exposeDebug(); window.__ui = ui; }
  window.__game = DEBUG ? game : undefined;
  ui.loading(true, "載入資源…"); $("sLoading").classList.add("show");
  try {
    await game.boot((p) => ui.loadProg(p));
  } catch (e) { console.error(e); $("ldTxt").textContent = "載入失敗：" + e.message; return; }
  game.start();
  await ui.toMenu();
  window.__ready = true;
}
main();
