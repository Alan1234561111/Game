import { $, fmtTime, fmtNum, pick } from "./util.js";
import { save, persist, settings, saveSettings, resetSave } from "./save.js";
import { WEAPONS, LEVELS, UPGRADES, upgradeCost, THEMES, SURVIVAL, ACHIEVEMENTS, TIPS, PROLOGUE, ENDING, LEVEL_WEAPON_REWARD, WEAPON_BY_ID } from "./data.js";
import { CREDITS } from "./credits.js";
import * as A from "./audio.js";

const DEBUG = new URLSearchParams(location.search).has("debug");
export class UI {
  constructor(game, hud) {
    this.g = game; this.hud = hud; this.hist = []; this.cur = null; this.curDef = null; this.busy = false; this.shopTab = "w";
    game.ui = this;
    document.addEventListener("pointerdown", () => A.unlockAudio(), { capture: true });
    $("app").addEventListener("click", (e) => this.onClick(e));
    $("app").addEventListener("pointerenter", () => {}, true);
    document.querySelectorAll(".btn,.tab,.lc").forEach(() => {});
    this.g.input.onPause = () => this.onPauseKey();
    if (DEBUG) $("btnSkip").style.display = "";
    addEventListener("keydown", (e) => { if (e.code === "Escape") { if (this.g.mode === "pause") { this.g.resume(); } else if (this.cur && this.cur !== "sMain" && this.g.mode === "menu") this.back(); } });
    document.addEventListener("pointerover", (e) => { if (e.pointerType === "mouse" && e.target.closest && e.target.closest(".btn")) A.play("ui_hover", { vol: 0.25, minGap: 0.06, jitter: 0 }); });
  }
  onPauseKey() { if (this.g.mode === "play") this.g.pause(); }
  // ---------------------------------------------------------- screen mgmt
  hideAll() { document.querySelectorAll(".screen").forEach((e) => e.classList.remove("show")); this.cur = null; }
  go(id, push = true) { if (this.cur && push) this.hist.push(this.cur); document.querySelectorAll(".screen:not(.ov)").forEach((e) => e.classList.remove("show")); $(id).classList.add("show"); this.cur = id; this.render(id); }
  back() { const p = this.hist.pop() || "sMain"; if (this.ret === "pause" && (p === "sMain" || !p)) { this.closeSettingsToPause(); return; } this.go(p, false); A.play("ui_back", { vol: 0.5 }); }
  render(id) {
    $("mainCredits").textContent = "◈ " + fmtNum(save.credits); document.querySelectorAll("[data-cr]").forEach((e) => { e.textContent = "◈ " + fmtNum(save.credits); });
    if (id === "sMain") this.renderMain(); else if (id === "sLevels") this.renderLevels(); else if (id === "sShop") this.renderShop(); else if (id === "sSettings") this.renderSettings(); else if (id === "sAch") this.renderAch(); else if (id === "sLb") this.renderLb(); else if (id === "sCredits") this.renderCredits();
  }
  loading(on, text) { const s = $("sLoading"); s.classList.toggle("show", on); if (on) { $("ldTxt").textContent = text || "載入中…"; $("ldTip").textContent = "💡 " + pick(TIPS); this.loadProg(0.08); } }
  loadProg(p) { $("ldFill").style.width = Math.round(p * 100) + "%"; }
  // ---------------------------------------------------------- menu
  nextLevelId() { for (let i = 1; i <= 6; i++) if (!save.levels[i]) return i; return 6; }
  syncDiff() {
    document.querySelectorAll("[data-diff]").forEach((b) => b.classList.toggle("on", +b.dataset.diff === (settings.difficulty ?? 1)));
    const s = document.querySelector('[data-sel="difficulty"]'); if (s) s.value = settings.difficulty ?? 1;
  }
  renderMain() {
    this.syncDiff();
    const n = this.nextLevelId(), cleared = Object.keys(save.levels).length;
    $("btnContinue").textContent = cleared === 0 ? "▶ 開始戰役" : cleared >= 6 ? "▶ 再次挑戰 第 6 關" : `▶ 繼續戰役　第 ${n} 關`;
    $("mainProg").textContent = `戰役 ${cleared}/6　★ ${Object.values(save.levels).reduce((a, l) => a + l.stars, 0)}/18`;
  }
  renderLevels() {
    const unlocked = DEBUG ? 6 : save.unlocked; let h = "";
    for (const d of LEVELS) {
      const sv = save.levels[d.id], lock = d.id > unlocked;
      h += `<button class="lc ${lock ? "lock" : ""}" data-level="${d.id}" style="--c:${d.color}"><div class="no">${String(d.id).padStart(2, "0")}</div>${lock ? '<div class="lk">🔒</div>' : d.boss ? '<div class="tg">BOSS</div>' : ""}<div class="nm">${d.name}</div><div class="en">${d.en}</div><div class="sb">${d.sub}</div><div class="st"><span>${[1, 2, 3].map((i) => `<span class="${sv && sv.stars >= i ? "" : "off"}">★</span>`).join("")}</span><small>${sv ? "最佳 " + fmtTime(sv.best) + "　⌛" + fmtTime(d.par) : "⌛ 目標 " + fmtTime(d.par)}</small></div></button>`;
    }
    const best = save.stats.survBest;
    h += `<button class="lc" data-survival="1" style="--c:${SURVIVAL.color}"><div class="no">∞</div><div class="tg">ENDLESS</div><div class="nm">${SURVIVAL.name}</div><div class="en">${SURVIVAL.en}</div><div class="sb">${SURVIVAL.sub}</div><div class="st"><span></span><small>最高波數 ${best}</small></div></button>`;
    $("levelGrid").innerHTML = h;
  }
  renderShop() {
    $("shopBody").innerHTML = ""; document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("on", t.dataset.tab === this.shopTab));
    let h = '<div class="cards">';
    if (this.shopTab === "w") {
      const bar = (v) => `<div class="t"><i style="width:${Math.min(100, v * 100)}%"></i></div>`;
      for (const w of WEAPONS) {
        const own = !!save.owned[w.id], rew = Object.entries(LEVEL_WEAPON_REWARD).find(([, v]) => v === w.id);
        h += `<div class="card"><div class="h"><b>${w.name}</b><small>${w.klass}</small></div><div class="d">${w.desc}</div>
          <div class="stat"><span>傷害</span>${bar(w.dmg * w.pellets / (w.id === "sniper" ? 170 : w.id === "rocket" ? 150 : 100))}</div>
          <div class="stat"><span>射速</span>${bar(1 / w.cd / 11)}</div>
          <div class="stat"><span>彈匣</span>${bar(w.mag / 30)}</div>
          <div class="b">${own ? '<div class="own">✔ 已擁有</div>' : `<button class="btn sm" style="width:100%" data-buyw="${w.id}" ${save.credits < w.price ? "disabled" : ""}>◈ ${fmtNum(w.price)}　購買${rew ? "（第 " + rew[0] + " 關獎勵）" : ""}</button>`}</div></div>`;
      }
    } else {
      for (const u of UPGRADES) {
        const lv = save.upgrades[u.id] || 0, max = lv >= u.max, cost = upgradeCost(u, lv);
        h += `<div class="card"><div class="h"><b>${u.icon} ${u.name}</b><small>LV ${lv}/${u.max}</small></div><div class="d">${u.desc}</div><div class="pips">${Array.from({ length: u.max }, (_, i) => `<i class="${i < lv ? "on" : ""}"></i>`).join("")}</div>
          <div class="b">${max ? '<div class="own">已滿級</div>' : `<button class="btn sm" style="width:100%" data-buyu="${u.id}" ${save.credits < cost ? "disabled" : ""}>◈ ${fmtNum(cost)}　升級</button>`}</div></div>`;
      }
    }
    $("shopBody").innerHTML = h + "</div>";
    document.querySelectorAll("[data-cr]").forEach((e) => { e.textContent = "◈ " + fmtNum(save.credits); });
  }
  renderSettings() {
    const S = settings;
    const sl = (k, label, min, max, step, fmt = (v) => v.toFixed(2)) => `<div class="sr"><span>${label}</span><input type="range" data-set="${k}" min="${min}" max="${max}" step="${step}" value="${S[k]}"><span class="v" data-v="${k}">${fmt(S[k])}</span></div>`;
    const tg = (k, label) => `<div class="sr"><span>${label}</span><button class="sw ${S[k] ? "on" : ""}" data-tog="${k}"></button></div>`;
    const sel = (k, label, opts) => `<div class="sr"><span>${label}</span><select data-sel="${k}">${opts.map(([v, t]) => `<option value="${v}" ${String(S[k]) === String(v) ? "selected" : ""}>${t}</option>`).join("")}</select></div>`;
    $("setBody").innerHTML = `<div class="set-g"><h3>畫面</h3>${sel("quality", "畫質", [["auto", "自動（依裝置調整）"], ["high", "高（陰影、AO、泛光）"], ["medium", "中（泛光、抗鋸齒）"], ["lite", "輕量（手機建議）"], ["low", "低（省電流暢）"]])}${sl("fov", "視野角 FOV", 60, 110, 1, (v) => v + "°")}${tg("fps", "顯示 FPS")}${tg("shake", "鏡頭晃動")}</div>
      <div class="set-g"><h3>聲音</h3>${sl("music", "音樂音量", 0, 1, 0.05, (v) => Math.round(v * 100) + "%")}${sl("sfx", "音效音量", 0, 1, 0.05, (v) => Math.round(v * 100) + "%")}${tg("mute", "靜音")}${tg("vib", "震動回饋")}</div>
      <div class="set-g"><h3>操作</h3>${sl("sens", "視角靈敏度", 0.3, 2.5, 0.05, (v) => v.toFixed(2))}${sl("adsSens", "瞄準靈敏度倍率", 0.2, 1, 0.05, (v) => v.toFixed(2))}${tg("invert", "反轉上下視角")}${sel("aimAssist", "瞄準輔助（觸控）", [[0, "關閉"], [1, "標準"], [1.5, "強（預設）"]])}${tg("autoFire", "自動開火（觸控，準心對準敵人）")}${sl("ctrlScale", "按鈕大小", 0.8, 1.35, 0.05, (v) => Math.round(v * 100) + "%")}</div>
      <div class="set-g"><h3>遊戲</h3>${sel("difficulty", "難度", [[0, "簡單"], [1, "普通"], [2, "困難"]])}<div class="sr"><span>重置所有存檔</span><button class="btn sm danger" data-act="reset">重置</button></div></div>`;
    $("setBody").querySelectorAll("[data-set]").forEach((el) => el.addEventListener("input", () => { const k = el.dataset.set; settings[k] = +el.value; const f = { fov: (v) => v + "°", music: (v) => Math.round(v * 100) + "%", sfx: (v) => Math.round(v * 100) + "%", adsSens: (v) => v.toFixed(2), sens: (v) => v.toFixed(2), ctrlScale: (v) => Math.round(v * 100) + "%" }[k] || ((v) => v); $("setBody").querySelector(`[data-v="${k}"]`).textContent = f(settings[k]); this.applySetting(k); }));
    $("setBody").querySelectorAll("[data-tog]").forEach((el) => el.addEventListener("click", () => { const k = el.dataset.tog; settings[k] = !settings[k]; el.classList.toggle("on", settings[k]); A.play("ui_click", { vol: 0.5 }); this.applySetting(k); }));
    $("setBody").querySelectorAll("[data-sel]").forEach((el) => el.addEventListener("change", () => { const k = el.dataset.sel; settings[k] = k === "quality" ? el.value : +el.value; if (k === "difficulty") this.syncDiff(); this.applySetting(k); }));
  }
  applySetting(k) {
    saveSettings();
    if (k === "music" || k === "sfx" || k === "mute") A.applyVolumes();
    if (k === "quality") this.g.setQuality(settings.quality);
    if (k === "fov") this.g.R.setFov(settings.fov);
    if (k === "ctrlScale") document.documentElement.style.setProperty("--fs", settings.ctrlScale);
    if (k === "fps" && !settings.fps) this.hud.fps("");
  }
  renderAch() {
    const n = ACHIEVEMENTS.filter((a) => save.ach[a.id]).length; $("achCount").textContent = n + " / " + ACHIEVEMENTS.length;
    $("achBody").innerHTML = '<div class="cards">' + ACHIEVEMENTS.map((a) => `<div class="ach ${save.ach[a.id] ? "on" : ""}"><span class="ai">${a.icon}</span><div><b>${a.name}</b><small>${a.desc}</small></div></div>`).join("") + "</div>";
  }
  renderLb() {
    const rows = save.lb.map((r, i) => `<div class="lbrow"><span class="r">${i + 1}</span><span>${esc(r.name)}<br><small>${new Date(r.date).toLocaleDateString()}</small></span><span>第 ${r.wave} 波</span><span>${fmtNum(r.score)}</span></div>`).join("");
    $("lbBody").innerHTML = `<div class="lbname"><input id="nameIn" maxlength="10" value="${esc(save.name)}" placeholder="你的名字"><button class="btn sm" data-act="savename">儲存</button></div><div class="lbrow h"><span>#</span><span>玩家</span><span>波數</span><span>分數</span></div>${rows || '<p style="text-align:center;opacity:.6;padding:20px">尚無紀錄，去挑戰無盡生存吧！</p>'}`;
  }
  renderCredits() {
    $("credBody").innerHTML = '<div class="cg">' + CREDITS.map((g) => `<h3>${g.group}</h3>${g.items.map((i) => `<div class="ci"><b>${i.name}</b><span class="l">${i.lic}</span><div class="by">${i.by}${i.url ? ` · <a href="${i.url}" target="_blank" rel="noopener">${i.url.replace(/^https?:\/\//, "")}</a>` : ""}</div>${i.note ? `<div class="cnote">${i.note}</div>` : ""}</div>`).join("")}${g.note ? `<div class="cnote">${g.note}</div>` : ""}`).join("") + '<div class="cnote" style="margin-top:14px">Music by Kevin MacLeod (incompetech.com). Licensed under Creative Commons: By Attribution 4.0 License — http://creativecommons.org/licenses/by/4.0/</div></div>';
  }
  // ---------------------------------------------------------- actions
  onClick(e) {
    const t = e.target.closest("button"); if (!t) return;
    A.unlockAudio();
    if (t.dataset.diff !== undefined) { settings.difficulty = +t.dataset.diff; saveSettings(); A.play("ui_click", { vol: 0.5 }); this.syncDiff(); return; }
    if (t.dataset.level) { this.launchLevel(+t.dataset.level); return; }
    if (t.dataset.survival) { this.launchSurvival(); return; }
    if (t.dataset.tab) { this.shopTab = t.dataset.tab; A.play("ui_click", { vol: 0.5 }); this.renderShop(); return; }
    if (t.dataset.buyw) { const w = WEAPON_BY_ID[t.dataset.buyw]; if (save.credits >= w.price && !save.owned[w.id]) { save.credits -= w.price; save.owned[w.id] = true; save.stats.spent += w.price; persist(); A.play("ui_buy", { vol: 0.8 }); this.g.checkAchievements(); this.renderShop(); this.shopFlash(); } else A.play("ui_error"); return; }
    if (t.dataset.buyu) { const u = UPGRADES.find((x) => x.id === t.dataset.buyu), lv = save.upgrades[u.id] || 0, c = upgradeCost(u, lv); if (lv < u.max && save.credits >= c) { save.credits -= c; save.upgrades[u.id] = lv + 1; save.stats.spent += c; persist(); A.play("ui_buy", { vol: 0.8 }); this.g.checkAchievements(); this.renderShop(); this.shopFlash(); } else A.play("ui_error"); return; }
    const act = t.dataset.act; if (!act) return;
    A.play(act === "back" ? "ui_back" : "ui_click", { vol: 0.6 });
    switch (act) {
      case "continue": this.launchLevel(this.nextLevelId()); break;
      case "levels": this.go("sLevels"); break;
      case "survival": this.launchSurvival(); break;
      case "shop": this.go("sShop"); break;
      case "ach": this.go("sAch"); break;
      case "lb": this.go("sLb"); break;
      case "settings": this.ret = null; this.go("sSettings"); break;
      case "credits": this.go("sCredits"); break;
      case "back": this.back(); break;
      case "savename": { const v = ($("nameIn").value || "獵手").trim().slice(0, 10) || "獵手"; save.name = v; persist(); this.hud.toast && 0; $("nameIn").blur(); break; }
      case "reset": if (confirm("確定要重置所有進度嗎？此動作無法復原。")) { resetSave(); persist(); this.render("sSettings"); } break;
      case "resume": this.g.resume(); break;
      case "pause-settings": this.ret = "pause"; $("sPause").classList.remove("show"); this.hist = []; this.cur = null; $("sSettings").classList.add("show"); this.cur = "sSettings"; this.render("sSettings"); break;
      case "restart": this.hud.hideOverlay(); $("sPause").classList.remove("show"); this.g.input.enabled = false; this.relaunch(); break;
      case "skip": this.g.resume(); this.g.objectives && this.g.objectives.debugComplete(); break;
      case "quit": persist(); this.hud.hideOverlay(); this.toMenu(); break;
      case "respawn": this.g.respawn(); break;
      case "cut-next": this.g.nextLine(); break;
      case "cut-skip": this.g.skipCutscene(); break;
      case "res-next": this.launchLevel(this.curDef.id + 1); break;
      case "res-retry": this.relaunch(); break;
      case "res-shop": this.go("sShop"); this.hist = ["sResultBack"]; break;
      case "res-menu": this.toMenu(); break;
      case "res-end": this.playEnding(); break;
    }
  }
  closeSettingsToPause() { $("sSettings").classList.remove("show"); $("sPause").classList.add("show"); this.cur = null; this.ret = null; }
  contextLost(on) {
    let el = document.getElementById("ctxLost");
    if (!el) { el = document.createElement("div"); el.id = "ctxLost"; el.style.cssText = "position:fixed;inset:0;z-index:999;background:rgba(2,4,14,.94);display:none;align-items:center;justify-content:center;flex-direction:column;gap:14px;color:#e8f4ff;font-size:16px;text-align:center;padding:24px"; el.innerHTML = '<div>畫面暫時中斷，正在恢復…</div><button class="btn primary" id="ctxReload" style="display:none">重新載入遊戲</button>'; document.body.appendChild(el); el.querySelector("#ctxReload").addEventListener("click", () => location.reload()); }
    el.style.display = on ? "flex" : "none"; clearTimeout(this._ctxT);
    if (on) this._ctxT = setTimeout(() => { const b = el.querySelector("#ctxReload"); if (b) b.style.display = "inline-block"; }, 4000);
  }
  shopFlash() { const el = $("shopBody"); el.style.opacity = 0.6; setTimeout(() => { el.style.opacity = 1; }, 80); }
  async toMenu() {
    this.hideAll(); this.hist = []; this.loading(true, "返回主選單…");
    try { await this.g.enterMenu(); } catch (e) { console.error(e); }
    this.loading(false); this.go("sMain", false);
  }
  relaunch() { if (!this.curDef) return this.toMenu(); this.curDef.id === "survival" ? this.launchSurvival() : this.launchLevel(this.curDef.id); }
  async launchLevel(id) {
    const def = LEVELS[id - 1]; if (!def || this.busy) return; this.busy = true; this.curDef = def; this.hideAll(); this.hist = [];
    this.loading(true, `第 ${id} 關　${def.name}`); this.loadProg(0.15);
    try {
      await new Promise((r) => setTimeout(r, 60));
      await this.g.startMission(def); this.loadProg(1);
    } catch (e) { console.error(e); this.busy = false; this.loading(false); this.go("sMain", false); alert("載入失敗：" + e.message); return; }
    await new Promise((r) => setTimeout(r, 250));
    this.loading(false); this.busy = false;
    A.playMusic(this.g.theme.music, { fade: 2 });
    const go = () => this.g.playCutscene(def.brief, "brief", () => this.g.beginPlay());
    if (id === 1 && !save.seenIntro) { save.seenIntro = true; persist(); this.g.playCutscene(PROLOGUE, "orbit", go); } else go();
  }
  async launchSurvival() {
    if (this.busy) return; this.busy = true; this.curDef = SURVIVAL; this.hideAll(); this.hist = [];
    this.loading(true, "無盡生存"); this.loadProg(0.2);
    try { await new Promise((r) => setTimeout(r, 60)); await this.g.startMission(SURVIVAL); this.loadProg(1); } catch (e) { console.error(e); this.busy = false; this.loading(false); this.go("sMain", false); return; }
    await new Promise((r) => setTimeout(r, 200)); this.loading(false); this.busy = false;
    this.g.beginPlay(); this.hud.banner("無盡生存", "撐過越多波越好");
  }
  showResults(R) {
    const ok = R.success; $("resTitle").textContent = R.survival ? "生存結束" : ok ? "任務完成" : "任務失敗"; $("resTitle").style.color = ok || R.survival ? "" : "#ff4060"; $("resName").textContent = R.name;
    $("resStars").innerHTML = R.survival ? `<span style="font-size:22px;letter-spacing:2px;color:#c9f">第 ${R.wave} 波</span>` : [1, 2, 3].map((i) => `<span class="s ${R.stars >= i ? "" : "off"}" style="animation-delay:${0.3 + i * 0.35}s">★</span>`).join("");
    const rows = [["擊殺", R.kills], ["命中率", R.acc + "%"], ["時間", fmtTime(R.time)], ["倒下次數", R.deaths], ["晶片收集", R.chips], ["獲得晶片", "◈ " + fmtNum(R.credits + (R.bonus || 0))]];
    if (R.survival) rows.unshift(["分數", fmtNum(R.score)]); else if (ok) rows.splice(2, 1, ["時間", fmtTime(R.time) + " / " + fmtTime(R.par)]);
    $("resGrid").innerHTML = rows.map(([a, b]) => `<div class="rg"><span>${a}</span><b>${b}</b></div>`).join("");
    $("resReward").innerHTML = R.reward ? `🔓 解鎖新武器：${R.reward.name}` : R.survival && R.rank && R.rank <= 10 ? `🏆 排行榜第 ${R.rank} 名` : ok && R.bonus ? `任務獎勵 +${R.bonus} 晶片` : "";
    const b = [];
    if (R.survival) b.push(["res-retry", "再戰一次", "primary"]);
    else if (ok) { if (R.id < 6) b.push(["res-next", "下一關 ▶", "primary"]); else b.push(["res-end", "結局 ▶", "primary"]); b.push(["res-retry", "重玩本關", ""]); }
    else b.push(["res-retry", "重新挑戰", "primary"]);
    b.push(["res-shop", "◈ 商店", ""], ["res-menu", "主選單", ""]);
    $("resBtns").innerHTML = b.map(([a, t, c]) => `<button class="btn ${c}" data-act="${a}">${t}</button>`).join("");
    this.hist = []; this.go("sResult", false); this.hist = ["sResult"];
    if (R.stars === 3) A.play("star", { vol: 0.8 });
  }
  showDead() {
    $("deadTxt").textContent = ["你倒下了……", "機器人佔了上風。", "別放棄，獵手！"][(this.g.stats.deaths) % 3]; $("sDead").classList.add("show");
  }
  playEnding() {
    this.hideAll(); A.playMusic("victory", { once: false, fade: 1.5 });
    this.g.playCutscene(ENDING, "ending", () => { this.hist = []; this.go("sCredits", false); this.hist = ["sMain"]; this.g.mode = "result"; this.g.enterMenu().then(() => { this.go("sCredits", false); }); });
  }
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
