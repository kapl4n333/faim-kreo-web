// Кластеры: группы аккаунтов Instagram с общим пулом. Список, карточка (аккаунты, пул, свои настройки), архив.
// Все действия — content_cluster_* на сервере (CreatorBot server/content/clusters.mjs), проверки там же.
import {call, escape, isAdmin, niches} from "../bridge.js";
import {badge, TYPE} from "../ui/badge.js";
import {confirmDialog, dialog, dialogMessage, errorOf} from "../ui/dialog.js";
import {noData} from "../ui/empty.js";
import {num} from "../ui/format.js";
import {bindSort, bindToolbar, table, toolbar} from "../ui/table.js";
import {readSetting, settingRow, settingsGrid, settingValue} from "../ui/settings-form.js";
import {clusterValue, coverageText, inheritedValue, rampInfo, rulesSummary} from "../ui/clusters.js";

const view = {q: "", tab: "accounts"};
const TABS = [["accounts", "Аккаунты"], ["pool", "Пул"], ["settings", "Настройки"]];
const saved = new Map(); // `${cluster}:${key}` → "ok" | текст ошибки
const CACHE_MS = 60000;
const FIRST_GROUPS = ["Кластер", "Разгон новых аккаунтов", "Здоровье клонов"];
const cache = {global: null, globalAt: 0, posters: null, postersAt: 0};

async function globalSettings() {
  if (cache.global && Date.now() - cache.globalAt < CACHE_MS) return cache.global;
  try { cache.global = await call("content_settings_get"); cache.globalAt = Date.now(); } catch { /* без общих: покажем значения по умолчанию */ }
  return cache.global;
}
/** Активные материалы пула (не папка историй): для выбора и для постеров в таблице пула. */
async function poolItems() {
  const d = await call("content_pool_list", {status: "active", pool: false});
  const list = (d.items || []).filter((i) => !i.platform || i.platform === "instagram");
  cache.posters = Object.fromEntries(list.map((i) => [i.id, i.poster_url || null]));
  cache.postersAt = Date.now();
  return list;
}
async function posters() {
  if (cache.posters && Date.now() - cache.postersAt < CACHE_MS) return cache.posters;
  try { await poolItems(); } catch { cache.posters = cache.posters || {}; }
  return cache.posters;
}

const nicheName = (id) => niches().find((n) => String(n.id) === String(id))?.name || `#${id}`;
const nicheChips = (ids) => (ids?.length ? `<div class="wchips">${ids.map((id) => `<span class="wchip">${escape(nicheName(id))}</span>`).join("")}</div>` : '<span class="wmute">нет</span>');

// ---------- список ----------

function listView(d) {
  const q = view.q.trim().toLowerCase();
  const list = d.clusters.filter((c) => !q || c.name.toLowerCase().includes(q));
  const tool = toolbar({
    search: {id: "q", placeholder: "Название", value: view.q},
    actions: '<button class="wbtn" data-wcdist>Раздать сейчас</button><button class="wbtn wbtn-p" data-wcnew>+ Новый кластер</button>',
  });
  const t = table("clusters", [
    {key: "name", label: "Кластер", html: (c) => `<b>${escape(c.name)}</b>${c.paused ? ` ${badge("paused")}` : ""}`},
    {key: "niche_ids", label: "Ниши", value: (c) => c.niche_ids.map(nicheName).join(", "), html: (c) => nicheChips(c.niche_ids)},
    {key: "accounts", label: "Аккаунтов", width: "110px", align: "right", html: (c) => num(c.accounts)},
    {key: "items", label: "Материалов в пуле", width: "150px", align: "right", html: (c) => num(c.items)},
    {key: "open", label: "Ждут", width: "90px", align: "right", html: (c) => num(c.open)},
    {key: "published", label: "Опубликовано", width: "130px", align: "right", html: (c) => `<b>${num(c.published)}</b>`},
  ], list, {rowAttr: (c) => `data-wcopen="${c.id}"`, empty: "Кластеров нет. Создай первый: «+ Новый кластер»."});
  return `<div class="whead"><h1>Кластеры</h1><div class="whead-s">${list.length} из ${d.clusters.length} · «Ждут» — назначено и ещё не вышло</div></div>${tool}<div class="wpanel">${t}</div>`;
}

// ---------- карточка ----------

function effective(d, key) { return clusterValue(key, {values: d.cs.values, registry: d.cs.registry, global: d.global}); }

export function cardSummary(d) {
  return rulesSummary({accounts: d.card.accounts.length, reserve: effective(d, "cluster.reserve_per_type"), maxParallel: effective(d, "cluster.max_parallel_per_item"),
    repeatDays: effective(d, "cluster.repeat_after_days"), paused: d.card.cluster.paused});
}

function accountsTab(d) {
  const tool = '<div class="wtool"><span class="wmute">Аккаунт состоит максимум в одном кластере. Аккаунтам без телефона материалы не раздаются.</span><div class="wtool-sp"></div><button class="wbtn wbtn-p" data-wcaddacc>+ Добавить аккаунты</button></div>';
  return tool + table("cl-accs", [
    {key: "account_name", label: "Аккаунт", html: (a) => `<button class="wlink" data-wcacc="${a.account_id}">@${escape(a.account_name)}</button>`},
    {key: "has_phone", label: "Телефон", width: "100px", html: (a) => (a.has_phone ? "да" : '<span class="wbad">нет</span>')},
    {key: "open", label: "Ждут", width: "90px", align: "right", html: (a) => num(a.open)},
    {key: "published", label: "Опубликовано", width: "130px", align: "right", html: (a) => num(a.published)},
    {key: "ramp", label: "Разгон", width: "170px", value: (a) => rampInfo(a.ramp)?.day, html: (a) => { const r = rampInfo(a.ramp); return r ? `<span title="${escape(r.phase)}">${escape(r.text)}</span>` : '<span class="wmute">—</span>'; }},
    {key: "act", label: "", width: "90px", sort: false, html: (a) => `<button class="wbtn wbtn-s" data-wcrmacc="${a.account_id}">Убрать</button>`},
  ], d.card.accounts, {empty: "Аккаунтов нет. Добавь: «+ Добавить аккаунты»."});
}

function poolTab(d) {
  const items = d.card.items;
  const total = d.card.accounts.length;
  const manual = items.filter((i) => i.source === "manual").length;
  const poster = (i) => { const url = d.posters?.[i.id]; return `<div class="wm-it">${url ? `<img src="${escape(url)}" alt="" loading="lazy">` : '<span class="wm-noimg"></span>'}</div>`; };
  const tool = `<div class="wtool"><span class="wmute">Вручную: ${manual} · из ниш: ${items.length - manual}. Материал из ниши уходит из пула, только если сменить ниши кластера.</span><div class="wtool-sp"></div><button class="wbtn wbtn-p" data-wcadditem>+ Добавить из пула</button></div>`;
  return tool + table("cl-items", [
    {key: "poster", label: "", width: "46px", sort: false, html: poster},
    {key: "title", label: "Материал", html: (i) => `<div class="wm-t">${escape(i.title || "Без названия")}</div><div class="wmute">#${i.id}</div>`},
    {key: "content_type", label: "Тип", width: "100px", html: (i) => escape(TYPE[i.content_type] || i.content_type)},
    {key: "source", label: "Источник", width: "110px", html: (i) => (i.source === "manual" ? "вручную" : "ниша")},
    {key: "published", label: "Покрытие", width: "230px", html: (i) => escape(coverageText(i.published, total))},
    {key: "assigned", label: "Назначено", width: "110px", align: "right", html: (i) => num(i.assigned)},
    {key: "act", label: "", width: "190px", sort: false, html: (i) => (i.source === "manual" ? `<button class="wbtn wbtn-s" data-wcrmitem="${i.id}">Убрать</button>` : '<span class="wmute" title="Материал попал в пул через ниши кластера">чтобы убрать — смени ниши</span>')},
  ], items, {empty: "Пул пуст. Добавь материалы или выбери ниши кластера."});
}

function settingsTab(d) {
  const c = d.card.cluster, own = d.cs.values || {};
  const can = isAdmin();
  const has = (key) => Object.prototype.hasOwnProperty.call(own, key);
  const row = (r) => {
    const shared = inheritedValue(r.key, {registry: d.cs.registry, global: d.global});
    return settingRow(r, {
      value: has(r.key) ? own[r.key] : shared, can, state: saved.get(`${c.id}:${r.key}`),
      tag: has(r.key) ? ` ${badge("working", {label: "Своё у кластера"})} <span class="wmute">в общих: ${settingValue(shared)}</span>` : ' <span class="wmute">как в общих</span>',
      actions: can ? `<button class="wbtn wbtn-s" data-wcsave="${escape(r.key)}">Сохранить</button>${has(r.key) ? `<button class="wbtn wbtn-s" data-wcinherit="${escape(r.key)}">Как в общих</button>` : ""}` : "",
    });
  };
  const n = d.cs.registry.filter((r) => has(r.key)).length;
  // Правила самого кластера, разгон и проверка — первыми, дальше остальное в порядке реестра.
  const first = (r) => (FIRST_GROUPS.includes(r.group) ? FIRST_GROUPS.indexOf(r.group) : FIRST_GROUPS.length);
  const list = d.cs.registry.map((r, i) => [r, i]).sort((x, y) => first(x[0]) - first(y[0]) || x[1] - y[1]).map(([r]) => r);
  return `<div class="wtool"><span class="wmute">Своих значений у кластера: ${n}. Действуют на аккаунты кластера, у которых нет своего значения. «Как в общих» убирает значение кластера.</span></div>${settingsGrid(list, row)}`;
}

function cardView(d) {
  const c = d.card.cluster, accs = d.card.accounts, items = d.card.items;
  const own = d.cs.registry.filter((r) => Object.prototype.hasOwnProperty.call(d.cs.values || {}, r.key)).length;
  const counts = {accounts: accs.length, pool: items.length, settings: own};
  const tabs = TABS.map(([k, l]) => `<button class="wtab${view.tab === k ? " on" : ""}" data-wctab="${k}">${l}${counts[k] ? ` <span class="wmute">${counts[k]}</span>` : ""}</button>`).join("");
  const body = view.tab === "pool" ? poolTab(d) : view.tab === "settings" ? settingsTab(d) : accountsTab(d);
  const sum = (key) => accs.reduce((s, a) => s + Number(a[key] || 0), 0);
  return `<div class="whead"><button class="wlink" data-wclist>← Все кластеры</button></div>
    <div class="wacard">
      <div class="wacard-h"><div><div class="wacard-n">${escape(c.name)}</div><div class="wmute">Instagram</div></div>
        <div class="wtool" style="margin:0">${c.paused ? badge("paused", {title: "Новое не раздаётся"}) : badge("working", {label: "Раздаёт"})}
          <button class="wbtn" data-wcedit>Изменить</button><button class="wbtn" data-wcdist>Раздать сейчас</button><button class="wbtn wbtn-d" data-wcarchive>В архив</button></div></div>
      <p>${escape(cardSummary(d))}</p>
      <div class="wkv">
        <div><span>Ниши</span>${nicheChips(c.niche_ids)}</div>
        <div><span>Аккаунтов (с телефоном)</span><b>${num(accs.length)} (${num(accs.filter((a) => a.has_phone).length)})</b></div>
        <div><span>Материалов в пуле</span><b>${num(items.length)}</b></div>
        <div><span>Ждут / опубликовано</span><b>${num(sum("open"))} / ${num(sum("published"))}</b></div>
      </div>
    </div>
    <div class="wtabs">${tabs}</div>
    <div class="wtabbody">${body}</div>`;
}

// ---------- действия ----------

/** Выбор нескольких строк галочками, с поиском. Promise<id[] | null>. */
function pickDialog({subtitle, title, rows, empty, ok = "Добавить"}) {
  return new Promise((resolve) => {
    let result = null;
    const list = rows.length
      ? `<input class="winput" type="search" placeholder="Поиск" data-wpq style="width:100%;box-sizing:border-box;margin-bottom:8px"><div class="wchecks">${rows.map((r) => `<label data-wpt="${escape(r.text.toLowerCase())}"><input type="checkbox" value="${r.id}"> ${r.html}</label>`).join("")}</div>`
      : `<p class="wdlg-p">${escape(empty)}</p>`;
    const root = dialog({subtitle, title, body: list, wide: true,
      actions: [{id: "close", label: "Закрыть"}, ...(rows.length ? [{id: "ok", label: ok, primary: true}] : [])],
      onAction: (id, box) => {
        if (id !== "ok") return false;
        const ids = [...box.querySelectorAll(".wchecks input:checked")].map((i) => Number(i.value));
        if (!ids.length) { dialogMessage(box, "Ничего не выбрано."); return false; }
        result = ids;
        return true;
      }});
    const q = root.querySelector("[data-wpq]");
    if (q) q.oninput = () => { const s = q.value.trim().toLowerCase(); root.querySelectorAll("[data-wpt]").forEach((l) => { l.style.display = !s || l.dataset.wpt.includes(s) ? "" : "none"; }); };
    const watch = new MutationObserver(() => { if (!root.isConnected) { watch.disconnect(); resolve(result); } });
    watch.observe(document.body, {childList: true});
  });
}

function editCluster(ctx, c = null) {
  const list = niches();
  const on = new Set((c?.niche_ids || []).map(String));
  dialog({
    subtitle: c ? "КЛАСТЕР" : "НОВЫЙ КЛАСТЕР", title: c ? c.name : "Новый кластер",
    body: `<div class="wform"><label class="wf"><span>Название</span><input data-f="name" maxlength="80" value="${escape(c?.name || "")}"></label>
      <div class="wf"><span>Ниши: материалы этих ниш попадут в пул сами</span>${list.length ? `<div class="wchecks">${list.map((n) => `<label><input type="checkbox" data-wniche value="${n.id}"${on.has(String(n.id)) ? " checked" : ""}> ${escape(n.name)}</label>`).join("")}</div>` : '<span class="wmute">Ниш нет. Их заводят в каталоге (Админка → Ниши).</span>'}</div>
      <label class="wsw"><input type="checkbox" data-f="paused"${c?.paused ? " checked" : ""}> Пауза: новое не раздаётся, уже назначенное остаётся</label>
      <p class="wmute">Платформа: Instagram.</p></div>`,
    actions: [{id: "close", label: "Закрыть"}, {id: "save", label: c ? "Сохранить" : "Создать", primary: true}],
    onAction: async (id, box) => {
      if (id !== "save") return false;
      const name = box.querySelector('[data-f="name"]').value.trim();
      if (!name) { dialogMessage(box, "Нужно название."); return false; }
      const body = {name, niche_ids: [...box.querySelectorAll("[data-wniche]:checked")].map((i) => Number(i.value)), paused: box.querySelector('[data-f="paused"]').checked};
      try {
        const r = await call("content_cluster_save", c ? {id: c.id, ...body} : body);
        if (c) ctx.reload(); else { view.tab = "accounts"; ctx.go("clusters", {id: r.cluster.id}); }
        return true;
      } catch (e) { dialogMessage(box, errorOf(e)); return false; }
    },
  });
}

async function distribute(ctx) {
  try {
    const r = await call("content_cluster_distribute", {});
    const made = Number(r.made || 0);
    await confirmDialog("Раздача прошла", made ? `Новых назначений: ${made}. Время и подписи выберет планировщик.` : "Новых назначений нет: у аккаунтов уже есть запас, пул пройден или у аккаунтов нет телефона.", {ok: "Понятно"});
  } catch (e) { await confirmDialog("Не раздано", errorOf(e), {ok: "Понятно"}); }
  ctx.reload();
}

async function archiveCluster(ctx, c) {
  if (!(await confirmDialog(`Убрать «${c.name}» в архив?`, "Аккаунты выйдут из кластера, незапланированные резервы снимутся. Запланированное и история останутся.", {ok: "В архив", danger: true}))) return;
  try { await call("content_cluster_archive", {id: c.id}); ctx.go("clusters", {}); } catch (e) { await confirmDialog("Не вышло", errorOf(e), {ok: "Понятно"}); ctx.reload(); }
}

async function addAccounts(ctx, d) {
  const c = d.card.cluster;
  let all;
  try { all = (await call("account_list")).accounts; } catch (e) { return confirmDialog("Не загрузилось", errorOf(e), {ok: "Понятно"}); }
  const cand = all.filter((a) => (a.platform || "instagram") === c.platform && String(a.cluster?.id) !== String(c.id));
  const ids = await pickDialog({subtitle: c.name.toUpperCase(), title: "Добавить аккаунты", empty: "Все аккаунты Instagram уже в этом кластере.",
    rows: cand.map((a) => ({id: a.id, text: `${a.account_name} ${a.cluster?.name || ""}`,
      html: `@${escape(a.account_name)}<small>${a.cluster ? `сейчас в «${escape(a.cluster.name)}»` : escape(a.phone ? a.phone.name : "нет телефона")}</small>`}))});
  if (!ids) return;
  const moving = cand.filter((a) => ids.includes(a.id) && a.cluster);
  if (moving.length && !(await confirmDialog("Перенести из других кластеров?", `${moving.map((a) => `@${a.account_name} (из «${a.cluster.name}»)`).join(", ")} перейдут в «${c.name}». Незапланированные резервы прежнего кластера снимутся, запланированное и история останутся.`, {ok: "Перенести"}))) return;
  try { await call("content_cluster_accounts", {id: c.id, add: ids}); } catch (e) { await confirmDialog("Не добавлено", errorOf(e), {ok: "Понятно"}); }
  ctx.reload();
}

async function removeAccount(ctx, d, accountId) {
  const a = d.card.accounts.find((x) => String(x.account_id) === String(accountId));
  if (!(await confirmDialog(`Убрать @${a?.account_name || accountId} из кластера?`, "Незапланированные резервы снимутся. Запланированное и история останутся.", {ok: "Убрать", danger: true}))) return;
  try { await call("content_cluster_accounts", {id: d.card.cluster.id, remove: [Number(accountId)]}); } catch (e) { await confirmDialog("Не убрано", errorOf(e), {ok: "Понятно"}); }
  ctx.reload();
}

async function addItems(ctx, d) {
  const c = d.card.cluster;
  let list;
  try { list = await poolItems(); } catch (e) { return confirmDialog("Не загрузилось", errorOf(e), {ok: "Понятно"}); }
  const inPool = new Set(d.card.items.map((i) => String(i.id)));
  const cand = list.filter((i) => !inPool.has(String(i.id)));
  const thumb = (i) => (i.poster_url ? `<img src="${escape(i.poster_url)}" alt="" loading="lazy" style="width:24px;height:32px;object-fit:cover;border-radius:4px">` : "");
  const ids = await pickDialog({subtitle: c.name.toUpperCase(), title: "Добавить из пула", empty: "Все активные материалы Instagram уже в пуле кластера.",
    rows: cand.map((i) => ({id: i.id, text: `${i.title || ""} #${i.id} ${TYPE[i.content_type] || ""}`,
      html: `${thumb(i)} ${escape(i.title || "Без названия")} <span class="wmute">#${i.id}</span><small>${escape(TYPE[i.content_type] || i.content_type)}</small>`}))});
  if (!ids) return;
  try { await call("content_cluster_items", {id: c.id, add: ids}); } catch (e) { await confirmDialog("Не добавлено", errorOf(e), {ok: "Понятно"}); }
  ctx.reload();
}

async function removeItem(ctx, d, itemId) {
  const i = d.card.items.find((x) => String(x.id) === String(itemId));
  if (!(await confirmDialog("Убрать материал из пула?", `«${i?.title || `#${itemId}`}»: незапланированные резервы снимутся, запланированное и вышедшее останутся.`, {ok: "Убрать", danger: true}))) return;
  try { await call("content_cluster_items", {id: d.card.cluster.id, remove: [Number(itemId)]}); } catch (e) { await confirmDialog("Не убрано", errorOf(e), {ok: "Понятно"}); }
  ctx.reload();
}

async function setSetting(ctx, root, d, key, mode, button) {
  const c = d.card.cluster;
  const rec = d.cs.registry.find((r) => r.key === key);
  if (!rec) return;
  button.disabled = true;
  try {
    await call("content_cluster_setting_set", {id: c.id, key, mode, ...(mode === "set" ? {value: readSetting(root, rec)} : {})});
    saved.set(`${c.id}:${key}`, "ok");
    ctx.reload();
  } catch (e) {
    saved.set(`${c.id}:${key}`, errorOf(e) + (e.data?.why ? ` (${e.data.why})` : ""));
    ctx.redraw();
  } finally { button.disabled = false; }
}

export default {
  async load(ctx) {
    if (!ctx.params.id) return {list: await call("content_cluster_list")};
    const id = Number(ctx.params.id);
    const [card, cs, global, pics] = await Promise.all([call("content_cluster_card", {id}), call("content_cluster_settings", {id}), globalSettings(), posters()]);
    const shown = Object.fromEntries(card.items.map((i) => [i.id, pics?.[i.id] || null]));
    return {card, cs, global, posters: shown};
  },
  render(d, ctx) {
    if (ctx.params.id && d.card && String(d.card.cluster.id) === String(ctx.params.id)) return cardView(d);
    if (ctx.params.id) return '<div class="wempty"><div class="spin"></div></div>';
    return d.list ? listView(d.list) : noData();
  },
  bind(root, ctx) {
    const d = ctx.data;
    bindToolbar(root, (id, value) => { view[id] = value; ctx.redraw(); });
    bindSort(root, ctx.redraw);
    root.querySelectorAll("[data-wcopen]").forEach((tr) => { tr.onclick = () => { view.tab = "accounts"; ctx.go("clusters", {id: Number(tr.dataset.wcopen)}); }; });
    root.querySelector("[data-wcnew]")?.addEventListener("click", () => editCluster(ctx));
    root.querySelectorAll("[data-wcdist]").forEach((b) => { b.onclick = () => distribute(ctx); });
    root.querySelector("[data-wclist]")?.addEventListener("click", () => ctx.go("clusters", {}));
    if (!d?.card) return;
    const c = d.card.cluster;
    root.querySelectorAll("[data-wctab]").forEach((b) => { b.onclick = () => { view.tab = b.dataset.wctab; ctx.redraw(); }; });
    root.querySelector("[data-wcedit]")?.addEventListener("click", () => editCluster(ctx, c));
    root.querySelector("[data-wcarchive]")?.addEventListener("click", () => archiveCluster(ctx, c));
    root.querySelector("[data-wcaddacc]")?.addEventListener("click", () => addAccounts(ctx, d));
    root.querySelector("[data-wcadditem]")?.addEventListener("click", () => addItems(ctx, d));
    root.querySelectorAll("[data-wcacc]").forEach((b) => { b.onclick = () => ctx.openAccount(Number(b.dataset.wcacc)); });
    root.querySelectorAll("[data-wcrmacc]").forEach((b) => { b.onclick = () => removeAccount(ctx, d, b.dataset.wcrmacc); });
    root.querySelectorAll("[data-wcrmitem]").forEach((b) => { b.onclick = () => removeItem(ctx, d, b.dataset.wcrmitem); });
    root.querySelectorAll("[data-wcsave]").forEach((b) => { b.onclick = () => setSetting(ctx, root, d, b.dataset.wcsave, "set", b); });
    root.querySelectorAll("[data-wcinherit]").forEach((b) => { b.onclick = () => setSetting(ctx, root, d, b.dataset.wcinherit, "inherit", b); });
  },
};
