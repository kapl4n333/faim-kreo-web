// Широкая раскладка «Автозалива» для ПК (контракт, раздел 15).
// Выбор раскладки только по ширине окна. Полноэкранный режим Telegram включается при входе в «Автозалив»
// и выключается при выходе, только если его включили мы. Ошибки этого режима страницу не ломают.
import {call, errorText, isAdmin, leaveTo, myRoles, redrawAll, state, telegram, escape} from "./bridge.js";
import {sectionById, visibleSections} from "./registry.js";
import {bindRail, railHtml} from "./ui/accounts-rail.js";
import {closeDetails, detailsKey} from "./ui/details.js";
import {failed, later, loading} from "./ui/empty.js";
import {closeMenu, menuOpen} from "./ui/tree.js";
import {icon} from "./ui/icons.js";

export const WIDE_MIN = 1280;
const V = new URL(import.meta.url).searchParams.get("v") || "dev";
const RAIL_POLL = 15000;
const PREFS = "ftask.wide";

// ---------- выбор раскладки и полноэкранный режим (чистые функции, есть тесты) ----------

export const pickLayout = (width) => (width >= WIDE_MIN ? "wide" : "narrow");

/** Что делать при входе в «Автозалив». Только Telegram на ПК и WebApp 8.0+ получает requestFullscreen. */
export function fullscreenPlan(t) {
  if (!t) return "none";
  const desktop = t.platform === "tdesktop" || t.platform === "macos";
  let v8 = false;
  try { v8 = typeof t.isVersionAtLeast === "function" && t.isVersionAtLeast("8.0"); } catch { v8 = false; }
  if (desktop && v8 && typeof t.requestFullscreen === "function") return t.isFullscreen ? "already" : "fullscreen";
  return typeof t.expand === "function" ? "expand" : "none";
}

const fs = {ours: false, lastError: null, plan: null};
export const fullscreenState = () => ({...fs});

export function enterFullscreen(t = telegram()) {
  const plan = fullscreenPlan(t);
  fs.plan = plan;
  try {
    if (plan === "fullscreen") { t.requestFullscreen(); fs.ours = true; }
    else if (plan === "expand") t.expand();
  } catch (e) {
    fs.lastError = String(e?.message || e);
    fs.ours = false;
    try { t?.expand?.(); } catch { /* окно остаётся каким было */ }
  }
  return plan;
}

export function exitFullscreen(t = telegram()) {
  if (!fs.ours) return false;
  fs.ours = false;
  try {
    if (t?.isFullscreen && typeof t.exitFullscreen === "function") { t.exitFullscreen(); return true; }
  } catch (e) { fs.lastError = String(e?.message || e); }
  return false;
}

function listenTelegram(t) {
  if (!t || typeof t.onEvent !== "function") return;
  try {
    t.onEvent("fullscreenFailed", (e) => { fs.ours = false; fs.lastError = e?.error || "failed"; console.warn("FTask: полноэкранный режим недоступен:", fs.lastError); });
    t.onEvent("fullscreenChanged", () => { if (!t.isFullscreen) fs.ours = false; applySafeArea(); });
    t.onEvent("viewportChanged", () => onResize());
    t.onEvent("contentSafeAreaChanged", applySafeArea);
    t.onEvent("safeAreaChanged", applySafeArea);
  } catch { /* старый клиент без событий */ }
}

function applySafeArea() {
  const t = telegram();
  let top = 0;
  try { top = (t?.isFullscreen ? (t.contentSafeAreaInset?.top || 0) + (t.safeAreaInset?.top || 0) : 0); } catch { top = 0; }
  document.documentElement.style.setProperty("--wide-top", `${top}px`);
}

// ---------- состояние ----------

const W = {section: "dashboard", params: {}, data: {}, sig: {}, errors: {}, loadedAt: {}, accounts: null, accountsAt: 0, mounted: false, inAuto: false, modules: {}};
try { const p = JSON.parse(localStorage.getItem(PREFS) || "{}"); if (p.section) W.section = p.section; if (p.params) W.params = p.params; } catch { /* нет хранилища */ }
const savePrefs = () => { try { localStorage.setItem(PREFS, JSON.stringify({section: W.section, params: W.params})); } catch { /* нет хранилища */ } };

const typing = () => { const f = document.activeElement; return !!f && /^(INPUT|SELECT|TEXTAREA)$/.test(f.tagName); };
const blocked = () => typing() || menuOpen();

async function moduleOf(id) {
  if (!W.modules[id]) W.modules[id] = (await import(`./sections/${id}.js?v=${V}`)).default;
  return W.modules[id];
}

const ctx = {
  call, escape, isAdmin, roles: myRoles,
  get accounts() { return W.accounts; },
  get params() { return W.params; },
  local: {},
  go(section, params = {}) { closeMenu(); if (W.section !== section) closeDetails(); W.section = section; W.params = params; savePrefs(); drawShell(); loadSection(true); },
  setParams(params) { W.params = {...W.params, ...params}; savePrefs(); },
  redraw: () => drawMain(),
  reload: () => loadSection(true),
  openAccount(id) { ctx.go("accounts", {id}); },
};

// ---------- отрисовка ----------

function menuHtml() {
  const list = visibleSections(myRoles());
  const groups = [...new Set(list.map((s) => s.group))];
  return `<div class="wbrand"><div class="mark">F</div><div><div class="wbrand-n">FTask</div><div class="wbrand-s">Автозалив</div></div></div>
    <div class="wnav" role="navigation">${groups.map((g) => `<div class="wnav-g">${escape(g)}</div>${list.filter((s) => s.group === g).map((s) => `<button class="wnav-i${W.section === s.id ? " on" : ""}" data-wsec="${s.id}">${icon(s.icon)}<span>${escape(s.title)}</span>${s.stub ? '<em>шаг 3</em>' : ""}</button>`).join("")}`).join("")}</div>
    <div class="wnav-foot"><button class="wnav-i" data-wback>${icon("back")}<span>Другие разделы FTask</span></button><div class="wnav-me">${escape(state().me?.name || "")}</div></div>`;
}

function drawShell() {
  const el = document.getElementById("app");
  if (!el) return;
  if (!W.mounted || !el.querySelector(".wshell")) {
    el.innerHTML = `<div class="wshell"><aside class="wleft" id="wleft"></aside><section class="wmain"><div class="wmain-in" id="wmain"></div></section><aside class="wright" id="wright"></aside><aside class="wdetails" id="wdetails"></aside></div>`;
    W.mounted = true;
  }
  const left = document.getElementById("wleft");
  left.innerHTML = menuHtml();
  left.querySelectorAll("[data-wsec]").forEach((b) => { b.onclick = () => ctx.go(b.dataset.wsec, {}); });
  left.querySelector("[data-wback]").onclick = () => { exitFullscreen(); leaveTo("cat"); };
  drawRail();
  drawMain();
}

function drawRail() {
  const right = document.getElementById("wright");
  if (!right) return;
  const keepQ = document.activeElement?.matches?.("[data-wrailq]") ? document.activeElement.selectionStart : null;
  right.innerHTML = railHtml(W.accounts, W.section === "accounts" ? W.params.id : null);
  bindRail(right, {redraw: drawRail, onOpen: (id) => ctx.openAccount(id)});
  if (keepQ != null) { const i = right.querySelector("[data-wrailq]"); i.focus(); i.setSelectionRange(keepQ, keepQ); }
}

async function drawMain() {
  const main = document.getElementById("wmain");
  if (!main) return;
  const sec = sectionById(W.section) || sectionById("dashboard");
  if (!visibleSections(myRoles()).includes(sec)) { W.section = "dashboard"; return drawMain(); }
  if (sec.stub) { main.innerHTML = `<div class="whead"><h1>${escape(sec.title)}</h1></div>${later(sec.title)}`; return; }
  const data = W.data[sec.id];
  if (W.errors[sec.id] && !data) {
    main.innerHTML = `<div class="whead"><h1>${escape(sec.title)}</h1></div>${failed(W.errors[sec.id])}`;
    main.querySelector("[data-wretry]").onclick = () => loadSection(true);
    return;
  }
  if (!data) { main.innerHTML = `<div class="whead"><h1>${escape(sec.title)}</h1></div>${loading()}`; return; }
  const mod = await moduleOf(sec.id);
  // Поле поиска переживает перерисовку: фокус и курсор возвращаются на место.
  const f = document.activeElement;
  const keep = f && main.contains(f) && f.dataset?.wsearch ? {id: f.dataset.wsearch, pos: f.selectionStart} : null;
  main.innerHTML = mod.render(data, ctx);
  mod.bind?.(main, ctx);
  if (keep) { const i = main.querySelector(`[data-wsearch="${keep.id}"]`); if (i) { i.focus(); i.setSelectionRange(keep.pos, keep.pos); } }
}

// ---------- загрузка и опрос ----------

async function loadSection(force = false) {
  const sec = sectionById(W.section);
  if (!sec || sec.stub) return;
  const id = sec.id;
  try {
    const mod = await moduleOf(id);
    const data = await mod.load(ctx);
    W.loadedAt[id] = Date.now();
    delete W.errors[id];
    const sig = JSON.stringify(data);
    if (!force && sig === W.sig[id]) return;
    W.sig[id] = sig;
    W.data[id] = data;
    if (W.section !== id) return;
    if (blocked()) { W.pending = true; return; }
    drawMain();
  } catch (e) {
    W.errors[id] = errorText(e);
    W.loadedAt[id] = Date.now();
    if (W.section === id && (!W.data[id] || force)) drawMain();
  }
}

async function loadAccounts() {
  try {
    const d = await call("account_list");
    W.accountsAt = Date.now();
    const sig = JSON.stringify(d.accounts);
    if (sig === W.accountsSig) return;
    W.accountsSig = sig;
    W.accounts = d.accounts;
    if (!document.activeElement?.matches?.("[data-wrailq]") && !menuOpen()) drawRail();
  } catch { W.accountsAt = Date.now(); }
}

let ticking = false;
async function tick() {
  if (ticking || !W.inAuto || !active() || document.hidden) return;
  ticking = true;
  try {
    if (W.pending && !blocked()) { W.pending = false; drawMain(); }
    const sec = sectionById(W.section);
    if (sec?.poll && Date.now() - (W.loadedAt[sec.id] || 0) >= sec.poll) await loadSection(false);
    if (Date.now() - W.accountsAt >= RAIL_POLL) await loadAccounts();
  } finally { ticking = false; }
}
setInterval(tick, 1000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) tick(); });

// ---------- связь со старым кодом ----------

const active = () => W.inAuto && pickLayout(window.innerWidth) === "wide";
let lastLayout = pickLayout(window.innerWidth);
function onResize() {
  const now = pickLayout(window.innerWidth);
  if (now === lastLayout) return;
  lastLayout = now;
  if (state().tab === "auto") { W.mounted = false; redrawAll(); }
}
window.addEventListener("resize", onResize);


window.FTWide = {
  /** Вызывается старым render() при каждой отрисовке, до выбора вкладки. */
  onTab(tab) {
    if (tab === "auto" && !W.inAuto) { W.inAuto = true; enterFullscreen(); applySafeArea(); }
    else if (tab !== "auto" && W.inAuto) { W.inAuto = false; W.mounted = false; closeDetails(); closeMenu(); exitFullscreen(); document.body.classList.remove("wide"); }
  },
  wants: () => state().tab === "auto" && pickLayout(window.innerWidth) === "wide",
  /** Старый код зовёт render() на каждом своём опросе: каркас не пересобирается, если уже стоит. */
  render(el) {
    document.body.classList.add("wide");
    if (W.mounted && el.querySelector(".wshell")) return;
    drawShell();
    if (!W.data[W.section]) loadSection(true);
    if (!W.accounts) loadAccounts();
  },
  unmount() { if (W.mounted) { W.mounted = false; } document.body.classList.remove("wide"); },
  state: () => ({section: W.section, mounted: W.mounted, inAuto: W.inAuto, layout: pickLayout(window.innerWidth), fullscreen: fullscreenState()}),
};

listenTelegram(telegram());
// Модуль грузится после boot(): если «Автозалив» уже открыт, перерисовать.
try { if (state()?.me && state().tab === "auto") { window.FTWide.onTab("auto"); redrawAll(); } } catch { /* старый код ещё не готов */ }
