// Устройства: дерево «Все → ПК → телефон → аккаунты» и живая консоль справа.
// Шаг 2: только чтение. «+» и действия меню видны, но выключены до шага 3.
import {escape} from "../bridge.js";
import {badge, dot, reasonText, TYPE} from "../ui/badge.js";
import {closeDetails, detailsKey, openDetails, setDetailsBody} from "../ui/details.js";
import {ago, localText} from "../ui/format.js";
import {bindToolbar, toolbar} from "../ui/table.js";
import {bindTree, tree} from "../ui/tree.js";
import {eventLabel} from "../ui/accounts-rail.js";

const STEP3 = "Будет на шаге 3";
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
    menu: [{label: "Открыть консоль", act: "console"}, {label: "Карточка аккаунта", act: "card"}, {label: "Сменить телефон", disabled: true}, {label: "Назначить прокси", disabled: true}],
  };
}

function phoneNode(p) {
  const status = p.online ? "online" : "offline";
  const accounts = p.accounts.filter((a) => matches(a.account_name) || matches(p.name) || matches(p.serial));
  return {
    key: `phone:${p.id}`,
    cells: [`${dot(status)}<span class="wtn-n">${phoneName(p)}</span><span class="wmute mono">${escape(p.serial)}</span>`, `${badge(status)}${p.paused ? badge("paused") : ""}`, quiet(p.last_seen_at), `<span class="mono">${escape(p.mode || "—")}</span>`, proxyText(p.proxy), `<span class="wmute">${p.accounts.length} акк.</span>`],
    children: accounts.map(accountNode),
    add: p.add ? {label: `Аккаунт${p.add.candidates.length ? ` · свободных ${p.add.candidates.length}` : ""}`, disabled: true, title: STEP3} : null,
    menu: [{label: "Открыть консоль", act: "console"}, {label: p.paused ? "Снять паузу" : "Пауза", disabled: true}, {label: "Назначить прокси", disabled: true}],
  };
}

function workerNode(w) {
  const phones = w.phones.filter((p) => matches(p.name) || matches(p.serial) || matches(w.name) || p.accounts.some((a) => matches(a.account_name)));
  return {
    key: `worker:${w.id}`,
    cells: [`${dot(w.status)}<span class="wtn-n">${escape(w.name)}</span><span class="wmute">ПК</span>`, badge(w.status), quiet(w.last_seen_at), `<span class="mono">${escape(w.app_version || "—")}</span>`, '<span class="wmute">—</span>', `<span class="wmute">${w.phones.length} тел.</span>`],
    children: phones.map(phoneNode),
    add: w.add ? {label: `Телефон${w.add.candidates.length ? ` · найдено по ADB ${w.add.candidates.length}` : ""}`, disabled: true, title: STEP3} : null,
    menu: [{label: "Код сопряжения", disabled: true}, {label: "Отозвать ПК", disabled: true}],
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
    children: data.workers.map(workerNode).filter(statusOk),
    add: data.add ? {label: "ПК · код сопряжения", disabled: true, title: STEP3} : null,
  }];
  if (data.unbound_phones.length) top.push({key: "unbound-phones", cells: ['<span class="wtn-n">Телефоны без ПК</span>', "", "", "", "", `<span class="wmute">${data.unbound_phones.length}</span>`], children: data.unbound_phones.map(phoneNode).filter(statusOk)});
  if (data.unbound_accounts.length) top.push({key: "unbound-accounts", cells: ['<span class="wtn-n">Аккаунты без телефона</span>', "", "", "", "", `<span class="wmute">${data.unbound_accounts.length}</span>`], children: data.unbound_accounts.filter((a) => matches(a.account_name)).map(accountNode).filter(statusOk)});
  return top;
}

// ---------- консоль ----------

const con = {key: null, target: null, lastId: 0, timer: null, jobs: [], events: []};

function consoleShell(title) {
  return `<div class="wscreen"><div class="wscreen-ph">Экран телефона</div><div class="wmute">появится позже</div></div>
    <div class="wcon-h">Задания</div><div id="wconjobs" class="wconjobs"></div>
    <div class="wcon-h">События <span class="wlive">● обновление каждые 3 с</span></div><div id="wconlog" class="wconlog mono"></div>`;
}

function drawConsole(fresh) {
  const jobs = document.getElementById("wconjobs");
  const log = document.getElementById("wconlog");
  if (!jobs || !log) return;
  jobs.innerHTML = con.jobs.length ? con.jobs.map((j) => `<div class="wconjob"><span class="mono">#${j.id}</span> ${escape(TYPE[j.content_type] || j.kind)} · @${escape(j.account_name)} ${badge(j.status)}<span class="wmute">${j.local ? localText(j.local) : ""}</span>${j.error_code ? `<span class="wbad">${escape(j.error_code)}</span>` : ""}</div>`).join("") : '<div class="wmute">Заданий не было</div>';
  const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
  const line = (e) => `<div class="wl"><span class="wl-t">${new Date(e.at).toLocaleTimeString("ru-RU")}</span><span class="wl-j">#${e.job_id}</span><span class="wl-s">${escape(e.source || "")}</span><span class="wl-e">${escape(e.type)}</span><span class="wl-d">${escape(detailText(e.detail))}</span></div>`;
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
  load: async (ctx) => (data = await ctx.call("device_tree")),
  render(d, ctx) {
    data = d;
    const columns = [{label: "Устройство"}, {label: "Статус", width: "170px"}, {label: "Последняя связь", width: "150px"}, {label: "Режим / версия", width: "130px"}, {label: "Прокси", width: "170px"}, {label: "Ближайшая", width: "130px"}];
    const tool = toolbar({
      search: {id: "q", placeholder: "Поиск: ПК, телефон, ник", value: view.q},
      filters: [{id: "status", label: "Статус", value: view.status, options: [["", "Все"], ["online", "На связи"], ["offline", "Не на связи"], ["attention", "Внимание"], ["paused", "Пауза"]]}],
      actions: `<button class="wbtn" disabled title="${STEP3}">+ Добавить</button>`,
    });
    const selected = con.key || null;
    return `<div class="whead"><h1>Устройства</h1><div class="whead-s">Обновлено ${ago(d.server_now)}</div></div>${tool}<div class="wpanel">${tree(columns, nodes(), {selected})}</div>`;
  },
  bind(root, ctx) {
    bindToolbar(root, (id, value) => { view[id] = value; ctx.redraw(); });
    bindTree(root, {
      redraw: ctx.redraw,
      onSelect: (key) => { if (key.startsWith("phone:") || key.startsWith("account:")) openConsole(ctx, key); },
      menus: (key) => {
        const node = [...nodes()].flatMap(function flat(n) { return [n, ...(n.children || []).flatMap(flat)]; }).find((n) => n.key === key);
        return (node?.menu || []).map((m) => ({
          label: m.label, disabled: m.disabled, title: m.disabled ? STEP3 : "",
          onClick: () => { if (m.act === "console") openConsole(ctx, key); if (m.act === "card") ctx.openAccount(Number(key.split(":")[1])); },
        }));
      },
    });
    // Консоль открыта, а раздел перерисовали: таймер уже идёт, панель на месте.
    if (con.key && detailsKey() !== `console:${con.key}`) stopConsole();
    if (!con.key && ctx.params.console && !detailsKey()) openConsole(ctx, ctx.params.console);
  },
};

export const _closeConsole = () => { stopConsole(); closeDetails(); };
