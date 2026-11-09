import {manageClones} from '../ui/clones.js';
import {phoneSetupHtml, screenSetsHtml} from "../ui/screen-setup.js";
// Устройства: дерево «Все → ПК → телефон → аккаунты» и живая консоль справа.
// «+» на каждом уровне описан сервером (add.kind, add.apply, add.candidates): страница только вызывает указанный action.
import {call, errorText, escape, isAdmin, legacy, showToast} from "../bridge.js";
/* global openExt */
import {confirmDialog, dialog, dialogMessage, errorOf} from "../ui/dialog.js";
import {chooseProxy} from "../ui/proxy-pick.js";
import {badge, dot, reasonText, TYPE} from "../ui/badge.js";
import {closeDetails, detailsKey, openDetails, setDetailsBody} from "../ui/details.js";
import {ago, localText, slowSelect} from "../ui/format.js";
import {bindToolbar, toolbar} from "../ui/table.js";
import {bindTree, tree} from "../ui/tree.js";
import {eventLabel} from "../ui/accounts-rail.js";
import {bindJobButtons, bindPhoneButtons, jobButtons, modeBadge, phoneButtons} from "../ui/job-actions.js";

const CONSOLE_MS = 3000;
const view = {q: "", status: ""};
let data = null;

const proxyText = (p) => (p ? `${escape(p.host)}:${p.port}${p.country ? ` · ${escape(p.country)}` : ""}` : '<span class="wmute">—</span>');
const phoneName = (p) => escape(p.name || p.serial);
const quiet = (iso) => `<span title="${escape(iso || "")}">${ago(iso)}</span>`;

function matches(text) { return !view.q || String(text || "").toLowerCase().includes(view.q.toLowerCase()); }

function accountNode(a) {
  return {
    key: `account:${a.id}`,
    cells: [`${dot(a.status)}<span class="wtn-n">@${escape(a.account_name)}</span>`, badge(a.status, {title: reasonText(a.status_reason)}), a.last_action ? `${escape(eventLabel(a.last_action.type))} · ${ago(a.last_action.at)}` : '<span class="wmute">—</span>', '<span class="wmute">аккаунт</span>', proxyText(a.proxy), a.next_local ? localText(a.next_local) : '<span class="wmute">—</span>'],
    menu: [{label: "Открыть консоль", act: "console"}, {label: "Карточка аккаунта", act: "card"}, {label: "Отвязать от телефона", act: "unbind", admin: true}, {label: "Прокси аккаунта", act: "proxy_account", admin: true}],
  };
}

function phoneNode(p) {
  const status = p.online ? "online" : "offline";
  const accounts = p.accounts.filter((a) => matches(a.account_name) || matches(p.name) || matches(p.serial));
  return {
    key: `phone:${p.id}`,
    cells: [`${dot(status)}<span class="wtn-n">${phoneName(p)}</span><span class="wmute mono">${escape(p.serial)}</span>${phoneSetupHtml(p)}`, `${badge(status)}${p.paused ? badge("paused") : ""}`, quiet(p.last_seen_at), `${modeBadge(p.mode, p.mode_reason)} ${isAdmin() ? phoneButtons(p) : ""}<button class="wbtn wbtn-s" data-wsetup="${p.id}">Проверить и настроить</button>`, proxyText(p.proxy), `<span class="wmute">${p.accounts.length} акк.</span>`],
    children: accounts.map(accountNode),
    add: p.add ? {label: `Аккаунт${p.add.candidates.length ? ` · свободных ${p.add.candidates.length}` : ""}`, disabled: !p.add.candidates.length, title: p.add.candidates.length ? "" : "Свободных аккаунтов нет"} : null,
    menu: [{label: "Клоны и аккаунты", act: "clones", admin: true}, {label: "Открыть консоль", act: "console"}, {label: p.paused ? "Снять паузу" : "Пауза", act: p.paused ? "resume" : "pause", admin: true}, {label: "Прокси телефона", act: "proxy_phone", admin: true}, {label: "Отвязать от ПК", act: "phone_free", admin: true}],
  };
}

function workerNode(w) {
  const phones = w.phones.filter((p) => matches(p.name) || matches(p.serial) || matches(w.name) || p.accounts.some((a) => matches(a.account_name)));
  return {
    key: `worker:${w.id}`,
    cells: [`${dot(w.status)}<span class="wtn-n">${escape(w.name)}</span><span class="wmute">ПК</span>`, badge(w.status), quiet(w.last_seen_at), `<span class="mono">${escape(w.app_version || "—")}</span>`, '<span class="wmute">—</span>', `<span class="wmute">${w.phones.length} тел.</span>`],
    children: phones.map(phoneNode),
    add: w.add ? {label: `Телефон${w.add.candidates.length ? ` · найдено по ADB ${w.add.candidates.length}` : ""}`, disabled: !w.add.candidates.length, title: w.add.candidates.length ? "" : "Этот ПК не видит новых телефонов по ADB"} : null,
    menu: [w.status === "revoked" ? null : {label: "Отозвать ПК", act: "revoke", admin: true}, w.deletable ? {label: "Удалить ПК", act: "delete_worker", admin: true} : null].filter(Boolean),
  };
}

function statusOk(node) {
  if (!view.status) return true;
  const want = view.status;
  const any = (n) => (n.key.startsWith("account:") ? data_status(n.key) === want : (want === "online" || want === "offline") && n.cells[1].includes(want === "online" ? "На связи" : "Не на связи")) || (n.children || []).some(any);
  return any(node);
}
const data_status = (key) => {
  const id = key.split(":")[1];
  const all = [...data.workers.flatMap((w) => w.phones), ...data.unbound_phones].flatMap((p) => p.accounts).concat(data.unbound_accounts);
  return all.find((a) => String(a.id) === id)?.status;
};

function nodes() {
  const top = [{
    key: "all",
    cells: [`<span class="wtn-n">Все устройства</span>`, "", "", "", "", `<span class="wmute">${data.workers.length} ПК</span>`],
    children: data.workers.filter((w) => w.status !== "revoked").map(workerNode).filter(statusOk),
    add: data.add ? {label: "ПК · код сопряжения"} : null,
  }];
  const revoked = data.workers.filter((w) => w.status === "revoked");
  if (revoked.length) top.push({key: "revoked-workers", cells: ['<span class="wtn-n">Отозванные ПК</span>', "", "", "", "", `<span class="wmute">${revoked.length}</span>`], children: revoked.map(workerNode)});
  if (data.unbound_phones.length) top.push({key: "unbound-phones", cells: ['<span class="wtn-n">Телефоны без ПК</span>', "", "", "", "", `<span class="wmute">${data.unbound_phones.length}</span>`], children: data.unbound_phones.map(phoneNode).filter(statusOk)});
  if (data.unbound_accounts.length) top.push({key: "unbound-accounts", cells: ['<span class="wtn-n">Аккаунты без телефона</span>', "", "", "", "", `<span class="wmute">${data.unbound_accounts.length}</span>`], children: data.unbound_accounts.filter((a) => matches(a.account_name)).map(accountNode).filter(statusOk)});
  return top;
}

// ---------- консоль ----------

const con = {key: null, target: null, lastId: 0, timer: null, jobs: [], events: [], ctx: null};

function consoleShell(title) {
  return `<div class="wscreen"><div class="wscreen-ph">Экран телефона</div><div class="wmute">появится позже</div></div>
    <div class="wcon-h">Задания</div><div id="wconjobs" class="wconjobs"></div>
    <div class="wcon-h">События <span class="wlive">● обновление каждые 3 с</span></div><div id="wconlog" class="wconlog mono"></div>`;
}

function drawConsole(fresh) {
  const jobs = document.getElementById("wconjobs");
  const log = document.getElementById("wconlog");
  if (!jobs || !log) return;
  jobs.innerHTML = con.jobs.length ? con.jobs.map((j) => `<div class="wconjob"><span class="mono">#${j.id}</span> ${escape(TYPE[j.content_type] || j.kind)} · @${escape(j.account_name)} ${badge(j.status)}<span class="wmute">${j.local ? localText(j.local) : ""}</span>${j.error_code ? `<span class="wbad">${escape(reasonText(j.error_code) || j.error_code)}</span>` : ""}${j.error_message ? `<div class="wmute">${escape(j.error_message)}</div>` : ""}${jobButtons(j)}</div>`).join("") : '<div class="wmute">Заданий не было</div>';
  bindJobButtons(jobs, () => (con.ctx ? pullConsole(con.ctx, true) : null));
  const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
  const line = (e) => `<div class="wl"><span class="wl-t">${new Date(e.at).toLocaleTimeString("ru-RU")}</span><span class="wl-j">#${e.job_id}</span><span class="wl-s">${escape(e.source || "")}</span><span class="wl-e">${escape(eventLabel(e.type))}</span><span class="wl-d">${escape(detailText(e.type === "evidence" ? {экран: e.detail?.screen, причина: e.detail?.reason} : e.detail))}</span>${e.image_url ? `<a class="wshot" href="${escape(e.image_url)}" target="_blank" rel="noopener"><img src="${escape(e.image_url)}" alt="Снимок экрана" loading="lazy"></a>` : ""}</div>`;
  if (fresh) log.innerHTML = con.events.length ? con.events.map(line).join("") : '<div class="wmute">Событий нет</div>';
  else if (fresh === false && con.newEvents?.length) { if (log.querySelector(".wmute")) log.innerHTML = ""; log.insertAdjacentHTML("beforeend", con.newEvents.map(line).join("")); }
  if (atBottom || fresh) log.scrollTop = log.scrollHeight;
}

function detailText(d) {
  if (!d || typeof d !== "object") return d == null ? "" : String(d);
  return Object.entries(d).map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`).join(" ").slice(0, 300);
}

async function pullConsole(ctx, first) {
  if (!con.target) return;
  con.ctx = ctx;
  const key = con.key;
  try {
    const d = await ctx.call("device_console", {...con.target, after_id: first ? 0 : con.lastId});
    if (key !== con.key) return;
    con.jobs = d.jobs;
    if (first) { con.events = d.events; drawConsole(true); }
    else { con.newEvents = d.events; con.events.push(...d.events); drawConsole(false); }
    con.lastId = d.last_id;
  } catch (e) {
    if (first) setDetailsBody(`<div class="wbad">${escape(e.message || "Ошибка")}</div>`);
  }
}

function openConsole(ctx, nodeKey) {
  const [kind, id] = nodeKey.split(":");
  const target = kind === "phone" ? {phone_id: Number(id)} : {account_id: Number(id)};
  const all = [...data.workers.flatMap((w) => w.phones), ...data.unbound_phones];
  const title = kind === "phone" ? (all.find((p) => String(p.id) === id)?.name || all.find((p) => String(p.id) === id)?.serial || `Телефон ${id}`) : `@${all.flatMap((p) => p.accounts).concat(data.unbound_accounts).find((a) => String(a.id) === id)?.account_name || id}`;
  stopConsole();
  con.key = nodeKey; con.target = target; con.lastId = 0; con.jobs = []; con.events = [];
  openDetails(`console:${nodeKey}`, {subtitle: kind === "phone" ? "КОНСОЛЬ ТЕЛЕФОНА" : "КОНСОЛЬ АККАУНТА", title, body: consoleShell(title), onClose: stopConsole});
  pullConsole(ctx, true);
  con.timer = setInterval(() => { if (!document.hidden) pullConsole(ctx, false); }, CONSOLE_MS);
  ctx.setParams({console: nodeKey});
  ctx.redraw();
}

function stopConsole() { clearInterval(con.timer); con.timer = null; con.target = null; con.key = null; }

export default {
  load: async (ctx) => { const [tree, screens] = await Promise.all([ctx.call("device_tree"), ctx.call("device_screen_sets")]); return (data = {...tree, ...screens}); },
  render(d, ctx) {
    data = d;
    const columns = [{label: "Устройство"}, {label: "Статус", width: "170px"}, {label: "Последняя связь", width: "150px"}, {label: "Режим / версия", width: "210px"}, {label: "Прокси", width: "170px"}, {label: "Ближайшая", width: "130px"}];
    const tool = toolbar({
      search: {id: "q", placeholder: "Поиск: ПК, телефон, ник", value: view.q},
      filters: [{id: "status", label: "Статус", value: view.status, options: [["", "Все"], ["online", "На связи"], ["offline", "Не на связи"], ["attention", "Внимание"], ["paused", "Пауза"]]}],
      actions: `<button class="wbtn" data-wdownload title="Установщик PostBot для нового ПК: спросит папку и поставит всё сам">⬇ Скачать программу</button>${isAdmin() ? '<button class="wbtn wbtn-p" data-wpair>+ Добавить ПК</button>' : ""}`,
    });
    const selected = con.key || null;
    return `<div class="whead"><h1>Устройства</h1><div class="whead-s">Обновлено ${ago(d.server_now)}</div></div>${tool}<div class="wpanel">${tree(columns, nodes(), {selected})}</div>${screenSetsHtml(d)}`;
  },
  bind(root, ctx) {
    root.querySelectorAll("[data-wsetup]").forEach((b) => { b.onclick = async (event) => {
      event.stopPropagation(); b.disabled = true;
      try { await ctx.call("device_phone_setup", {id: Number(b.dataset.wsetup)}); await ctx.reload(); }
      catch (e) { await confirmDialog("Не удалось запустить настройку", errorOf(e), {ok: "Понятно"}); b.disabled = false; }
    }; });
    root.querySelectorAll("[data-wscreen-decision]").forEach((b) => { b.onclick = async () => {
      b.disabled = true;
      try { await ctx.call("device_screen_decide", {set_id: Number(b.dataset.wscreenSet), phone_id: Number(b.dataset.wscreenPhone), decision: b.dataset.wscreenDecision}); await ctx.reload(); }
      catch (e) { await confirmDialog("Подтверждение не принято", errorOf(e), {ok: "Понятно"}); b.disabled = false; }
    }; });
    bindToolbar(root, (id, value) => { view[id] = value; ctx.redraw(); });
    bindTree(root, {
      redraw: ctx.redraw,
      onSelect: (key) => { if (key.startsWith("phone:") || key.startsWith("account:")) openConsole(ctx, key); },
      menus: (key) => {
        const node = [...nodes()].flatMap(function flat(n) { return [n, ...(n.children || []).flatMap(flat)]; }).find((n) => n.key === key);
        return (node?.menu || []).filter((m) => !m.admin || isAdmin()).map((m) => ({label: m.label, onClick: () => menuAction(ctx, m.act, key)}));
      },
    });
    // Консоль открыта, а раздел перерисовали: таймер уже идёт, панель на месте.
    if (con.key && detailsKey() !== `console:${con.key}`) stopConsole();
    if (!con.key && ctx.params.console && !detailsKey()) openConsole(ctx, ctx.params.console);
    root.querySelector("[data-wpair]")?.addEventListener("click", () => pairDialog(ctx));
    root.querySelector("[data-wdownload]")?.addEventListener("click", async () => {
      try {
        const r = await call("postbot_installer", {});
        if (!r.url) throw new Error(r.error === "no_release" ? "На сервере ещё нет выпуска PostBot" : "Ссылка не получена");
        // В Telegram ссылка открывается во внешнем браузере: там файл и скачивается.
        openExt(r.url);
        showToast("Скачивается install-postbot.cmd — запусти его, он спросит папку", "ok");
      } catch (e) { showToast(errorText(e), "err"); }
    });
    root.querySelector("[data-wnewjob]")?.addEventListener("click", () => legacy.openJobWizard(() => ctx.reload()));
    root.querySelectorAll("[data-wadd]").forEach((b) => { b.onclick = (e) => { e.stopPropagation(); addDialog(ctx, b.dataset.wadd); }; });
    bindPhoneButtons(root, () => ctx.reload());
  },
};

export const _closeConsole = () => { stopConsole(); closeDetails(); };

// ---------- действия (админ; сервер проверяет права сам) ----------

const allPhones = () => [...data.workers.flatMap((w) => w.phones), ...data.unbound_phones];
const allAccounts = () => [...allPhones().flatMap((p) => p.accounts), ...data.unbound_accounts];

function pairDialog(ctx) {
  dialog({
    subtitle: "НОВЫЙ ПК", title: "Код сопряжения",
    body: '<label class="wf"><span>Имя ПК (видно в дереве)</span><input data-f="name" maxlength="60" placeholder="Например, OFFICE-PC"></label><div data-wcode></div>',
    actions: [{id: "close", label: "Закрыть"}, {id: "go", label: "Получить код", primary: true}],
    onAction: async (id, box) => {
      if (id !== "go") return false;
      try {
        const r = await call("device_pair_code", {name: box.querySelector('[data-f="name"]').value});
        box.querySelector("[data-wcode]").innerHTML = `<div class="wcode mono">${escape(r.code)}</div><p class="wmute">Введи код в PostBot на этом ПК в течение ${Math.round(r.expires_in_sec / 60)} минут. Код одноразовый.</p>`;
        ctx.reload();
      } catch (e) { dialogMessage(box, errorOf(e)); }
      return false;
    },
  });
}

function addDialog(ctx, nodeKey) {
  const [kind, id] = nodeKey.split(":");
  if (nodeKey === "all") return pairDialog(ctx);
  if (kind === "worker") {
    const w = data.workers.find((x) => String(x.id) === id);
    const c = w?.add?.candidates || [];
    return dialog({
      subtitle: `ПК ${w?.name || ""}`.toUpperCase(), title: "Привязать телефон",
      body: `<p class="wdlg-p">Телефоны, которые этот ПК видит по ADB и которые ещё ни к одному ПК не привязаны.</p><label class="wf"><span>Телефон</span><select data-f="p">${c.map((p) => `<option value="${p.phone_id}">${escape(p.name || p.serial)} · ${escape(p.serial)}${p.online ? "" : " · не на связи"}</option>`).join("")}</select></label>`,
      actions: [{id: "close", label: "Закрыть"}, {id: "go", label: "Привязать", primary: true}],
      onAction: async (a, box) => {
        if (a !== "go") return false;
        try { await call(w.add.apply, {id: Number(box.querySelector('[data-f="p"]').value), worker_id: w.id}); ctx.reload(); return true; } catch (e) { dialogMessage(box, errorOf(e)); return false; }
      },
    });
  }
  if (kind === "phone") {
    const p = allPhones().find((x) => String(x.id) === id);
    const c = p?.add?.candidates || [];
    return dialog({
      subtitle: `ТЕЛЕФОН ${p?.name || p?.serial || ""}`.toUpperCase(), title: "Привязать аккаунт",
      body: `<div class="wform"><label class="wf"><span>Аккаунт без телефона</span><select data-f="a">${c.map((x) => `<option value="${x.account_id}">@${escape(x.account_name)}</option>`).join("")}</select></label>
        <label class="wf"><span>Ник на телефоне (пусто — как у аккаунта)</span><input data-f="h"></label>
        <label class="wf"><span>Медленный режим</span>${slowSelect("g", 0)}</label></div>`,
      actions: [{id: "close", label: "Закрыть"}, {id: "go", label: "Привязать", primary: true}],
      onAction: async (a, box) => {
        if (a !== "go") return false;
        const f = (n) => box.querySelector(`[data-f="${n}"]`).value;
        try { await call(p.add.apply, {account_id: Number(f("a")), phone_id: p.id, ...(f("h").trim() ? {expected_handle: f("h").trim()} : {}), min_gap_minutes: Number(f("g"))}); ctx.reload(); return true; } catch (e) { dialogMessage(box, errorOf(e)); return false; }
      },
    });
  }
  return undefined;
}

async function menuAction(ctx, act, key) {
  const n = Number(key.split(":")[1]);
  try {
    if (act === "clones") return manageClones(n,()=>ctx.reload());
    if (act === "console") return openConsole(ctx, key);
    if (act === "card") return ctx.openAccount(n);
    if (act === "pause" || act === "resume") { await call(act === "pause" ? "device_phone_pause" : "device_phone_resume", {id: n}); return ctx.reload(); }
    if (act === "proxy_phone") { const p = allPhones().find((x) => x.id === n); return chooseProxy(ctx, "phone", n, p?.name || p?.serial || `Телефон ${n}`, p?.proxy?.id ?? null); }
    if (act === "proxy_account") { const a = allAccounts().find((x) => x.id === n); return chooseProxy(ctx, "account", n, `@${a?.account_name || n}`, a?.proxy_source === "account" ? a.proxy?.id : null); }
    if (act === "unbind") {
      const a = allAccounts().find((x) => x.id === n);
      if (!(await confirmDialog("Отвязать аккаунт от телефона?", `@${a?.account_name || n}: новые публикации на него назначить будет нельзя, уже запланированные будут ждать телефона.`, {ok: "Отвязать", danger: true}))) return undefined;
      await call("device_binding_delete", {account_id: n});
      return ctx.reload();
    }
    if (act === "phone_free") {
      if (!(await confirmDialog("Отвязать телефон от ПК?", "Задания на него перестанут выдаваться, пока его снова не привяжут.", {ok: "Отвязать", danger: true}))) return undefined;
      await call("device_phone_set_worker", {id: n, worker_id: null});
      return ctx.reload();
    }
    if (act === "delete_worker") {
      const w = data.workers.find((x) => x.id === n);
      if (!(await confirmDialog("Удалить ПК?", `«${w?.name || n}» исчезнет из списка. Он ни разу не выполнял заданий, история не теряется.`, {ok: "Удалить", danger: true}))) return undefined;
      await call("device_worker_delete", {id: n});
      return ctx.reload();
    }
    if (act === "revoke") {
      if (!(await confirmDialog("Отозвать ПК?", "Его токен перестанет работать. Вернуть можно только новым кодом сопряжения.", {ok: "Отозвать", danger: true}))) return undefined;
      await call("device_worker_revoke", {id: n});
      return ctx.reload();
    }
  } catch (e) {
    await confirmDialog("Не вышло", errorOf(e), {ok: "Понятно"});
  }
  return undefined;
}
