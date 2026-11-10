import {manageClones} from '../ui/clones.js';
// Аккаунты: таблица и карточка. В карточке: правка расписания, настройки «как в общих / своё», тексты кнопок,
// телефон и прокси. Все действия через существующие action, проверки на сервере.
import {call, escape, isAdmin, legacy} from "../bridge.js";
import {badge, reasonText, TYPE} from "../ui/badge.js";
import {confirmDialog, dialog, dialogMessage, errorOf} from "../ui/dialog.js";
import {noData} from "../ui/empty.js";
import {ago, localText, num, slowSelect, slowText, whenIso} from "../ui/format.js";
import {bindSort, bindToolbar, table, toolbar} from "../ui/table.js";
import {bindRowActions, rowActions} from "../ui/schedule-edit.js";
import {eventLabel} from "../ui/accounts-rail.js";
import {bindJobButtons, jobButtons} from "../ui/job-actions.js";
import {chooseProxy} from "../ui/proxy-pick.js";
import {settingValue} from "../ui/settings-form.js";
import {healthHtml, rampBadge} from "../ui/clusters.js";

const view = {q: "", status: "", tab: "schedule"};
const TABS = [["schedule", "Расписание"], ["warmup", "Прогрев"], ["history", "История"], ["settings", "Настройки"], ["texts", "Тексты кнопок"], ["link", "Ссылка"]];

function listView(d) {
  const q = view.q.trim().toLowerCase();
  const list = d.accounts.filter((a) => (!view.status || a.status === view.status) && (!q || a.account_name.toLowerCase().includes(q) || (a.phone?.name || "").toLowerCase().includes(q)));
  const tool = toolbar({
    search: {id: "q", placeholder: "Ник или телефон", value: view.q},
    filters: [{id: "status", label: "Статус", value: view.status, options: [["", "Все"], ["working", "Работает"], ["attention", "Внимание"], ["paused", "Пауза"], ["no_phone", "Без телефона"]]}],
  });
  const t = table("accounts", [
    {key: "account_name", label: "Ник", html: (a) => `<b>@${escape(a.account_name)}</b>`},
    {key: "phone", label: "Телефон", width: "150px", value: (a) => a.phone?.name, html: (a) => (a.phone ? `${escape(a.phone.name)} ${a.phone.online ? "" : '<span class="wbad">не на связи</span>'}` : '<span class="wmute">нет</span>')},
    {key: "proxy", label: "Прокси", width: "170px", value: (a) => a.proxy?.host, html: (a) => (a.proxy ? `${escape(a.proxy.host)}:${a.proxy.port}${a.proxy_source === "phone" ? ' <span class="wmute">телефона</span>' : ""}` : '<span class="wmute">—</span>')},
    {key: "status", label: "Статус", width: "200px", html: (a) => `${badge(a.status)} <span class="wmute">${escape(a.status === "working" ? "" : reasonText(a.status_reason))}</span>${a.ramp ? ` ${rampBadge(a.ramp)}` : ""}`},
    {key: "cluster", label: "Кластер", width: "140px", value: (a) => a.cluster?.name, html: (a) => (a.cluster ? `<button class="wlink" data-wcluster="${a.cluster.id}">${escape(a.cluster.name)}</button>` : '<span class="wmute">—</span>')},
    {key: "health", label: "Проверка", width: "150px", value: (a) => a.health?.at, html: (a) => healthHtml(a.health)},
    {key: "next_run_at", label: "Ближайшая публикация", width: "170px", html: (a) => (a.next_local ? localText(a.next_local) : '<span class="wmute">—</span>')},
    {key: "last_action", label: "Последнее действие", width: "190px", value: (a) => a.last_action?.at, html: (a) => (a.last_action ? `${escape(eventLabel(a.last_action.type))} · ${ago(a.last_action.at)}` : '<span class="wmute">—</span>')},
    {key: "joins", label: "Вступления 7 дн / всего", width: "160px", align: "right", value: (a) => a.joins.total, html: (a) => `${num(a.joins.d7)} / <b>${num(a.joins.total)}</b>`},
  ], list, {rowAttr: (a) => `data-wopen="${a.id}"`, empty: "Аккаунтов нет"});
  return `<div class="whead"><h1>Аккаунты</h1><div class="whead-s">${list.length} из ${d.accounts.length}</div></div>${tool}<div class="wpanel">${t}</div>`;
}

function cardTab(c) {
  if (view.tab === "warmup") return warmupView(c);
  if (view.tab === "schedule") {
    return table("acc-sched", [
      {key: "edit_local", label: "Время", width: "150px", html: (r) => (r.edit_local ? localText(r.edit_local) : '<span class="wmute">не выбрано</span>')},
      {key: "content_type", label: "Тип", width: "90px", html: (r) => escape(TYPE[r.content_type] || r.content_type)},
      {key: "title", label: "Материал", html: (r) => escape(r.title || `#${r.item_id}`)},
      {key: "state", label: "Статус", width: "150px", value: (r) => r.job_status || r.state, html: (r) => badge(r.job_status || r.state)},
      {key: "wait_reason", label: "Причина", width: "170px", html: (r) => escape(reasonText(r.wait_reason) || "—")},
      {key: "caption", label: "Подпись", html: (r) => (r.caption ? `<span class="wclip">${escape(r.caption)}</span>` : '<span class="wmute">—</span>')},
      {key: "act", label: "", width: "260px", sort: false, html: (r) => rowActions(r)},
    ], c.schedule, {empty: "Назначений нет"});
  }
  if (view.tab === "history") {
    const jobs = table("acc-jobs", [
      {key: "id", label: "#", width: "60px", html: (j) => `<span class="mono">${j.id}</span>`},
      {key: "local", label: "Время", width: "150px", html: (j) => (j.local ? localText(j.local) : "—")},
      {key: "content_type", label: "Тип", width: "90px", html: (j) => escape(TYPE[j.content_type] || j.kind)},
      {key: "status", label: "Статус", width: "150px", html: (j) => badge(j.status)},
      {key: "error_code", label: "Ошибка", html: (j) => `${escape(reasonText(j.error_code) || j.error_code || "—")}${j.error_message ? `<div class="wmute wclip" title="${escape(j.error_message)}">${escape(j.error_message)}</div>` : ""}`},
      {key: "act", label: "", width: "250px", sort: false, html: (j) => jobButtons(j)},
      {key: "post_url", label: "Пост", width: "80px", html: (j) => (j.post_url ? `<a href="${escape(j.post_url)}" target="_blank" rel="noopener">открыть</a>` : "—")},
    ], c.jobs, {empty: "Заданий не было"});
    const events = c.events.slice(-80).reverse().map((e) => `<div class="wl"><span class="wl-t">${whenIso(e.at)}</span><span class="wl-j">#${e.job_id}</span><span class="wl-s">${escape(e.source || "")}</span><span class="wl-e">${escape(eventLabel(e.type))}</span></div>`).join("") || '<div class="wmute">Событий нет</div>';
    return `<div class="wgrid wgrid-2"><section class="wcard"><h2>Задания <span>${c.jobs.length}</span></h2>${jobs}</section><section class="wcard"><h2>События</h2><div class="wconlog mono">${events}</div></section></div>`;
  }
  if (view.tab === "settings") {
    const groups = [...new Set(c.settings.registry.filter((r) => r.scope !== "global").map((r) => r.group))];
    return `<div class="wgrid wgrid-2">${groups.map((g) => `<section class="wcard wcard-free"><h2>${escape(g)}</h2><table class="wt"><tbody>${c.settings.registry.filter((r) => r.group === g && r.scope !== "global").map((r) => {
      const own = Object.prototype.hasOwnProperty.call(c.settings.own, r.key);
      const value = c.settings.effective?.[r.key] ?? (own ? c.settings.own[r.key] : (c.settings.global[r.key] ?? r.default));
      return `<tr><td>${escape(r.label)}</td><td style="width:120px">${own ? badge("working", {label: "Своё"}) : badge("empty", {label: "Как в общих"})}</td><td>${settingValue(value)}</td><td class="a-right" style="width:90px"><button class="wbtn wbtn-s" data-wset="${escape(r.key)}">Изменить</button></td></tr>`;
    }).join("")}</tbody></table></section>`).join("")}</div>`;
  }
  if (view.tab === "texts") {
    return `<div class="wtool"><span class="wmute">Свои тексты: ${c.button_texts.length}. Общий пул: ${num(c.global_button_texts.enabled)} включено из ${num(c.global_button_texts.count)}.</span><div class="wtool-sp"></div><button class="wbtn wbtn-p" data-waddtexts>+ Добавить тексты</button></div>` + table("acc-texts", [
      {key: "text", label: "Текст", html: (t) => escape(t.text)},
      {key: "enabled", label: "Включён", width: "110px", html: (t) => `<label class="wsw"><input type="checkbox" data-wtext="${t.id}"${t.enabled ? " checked" : ""}> ${t.enabled ? "да" : "нет"}</label>`},
      {key: "use_count", label: "Использован", width: "120px", align: "right", html: (t) => num(t.use_count)},
    ], c.button_texts, {empty: "Своих текстов нет, берутся общие"});
  }
  return `<dl class="wdl wdl-wide"><dt>Ссылка-приглашение</dt><dd>${c.link.invite_link ? `<span class="mono">${escape(c.link.invite_link)}</span>` : '<span class="wmute">нет</span>'}</dd>
    <dt>Код источника</dt><dd class="mono">${escape(c.link.code || "—")}</dd>
    <dt>Ошибка ссылки</dt><dd>${c.link.link_error ? `<span class="wbad">${escape(c.link.link_error)}</span>` : "нет"}</dd>
    <dt>Своя ссылка для историй</dt><dd>${c.settings.own.story_link_url ? escape(c.settings.own.story_link_url) : '<span class="wmute">не задана, берётся приглашение</span>'} <button class="wbtn wbtn-s" data-wset="story_link_url">Изменить</button></dd></dl>`;
}

function cardView(c) {
  const a = c.account;
  const admin = isAdmin();
  const tabs = TABS.map(([k, l]) => `<button class="wtab${view.tab === k ? " on" : ""}" data-wtab="${k}">${l}</button>`).join("");
  return `<div class="whead"><button class="wlink" data-wlist>← Все аккаунты</button></div>
    <div class="wacard">
      <div class="wacard-h"><div><div class="wacard-n">@${escape(a.account_name)}</div><div class="wmute">${escape(a.platform || "")} · пояс ${escape(a.timezone)}</div></div><div>${a.ramp ? `${rampBadge(a.ramp)} ` : ""}${badge(a.status, {title: reasonText(a.status_reason)})}</div></div>
      <div class="wkv">
        <div><span>Телефон ${admin ? '<button class="wlink" data-wphone>изменить</button>' : ""}${a.phone ? ' <button class="wlink" data-wverify>проверить</button>' : ""}</span><b>${a.phone ? `${escape(a.phone.name)} ${a.phone.online ? badge("online") : badge("offline")}` : "нет"}</b></div>
        <div><span>Приложение</span><b>${escape(c.binding?.app_package || "com.instagram.android")}</b></div>
        <div><span>Ник на телефоне</span><b>${escape(c.binding?.expected_handle || "—")}</b></div>
        <div><span>Прокси ${admin ? '<button class="wlink" data-wproxy>изменить</button>' : ""}</span><b>${a.proxy ? `${escape(a.proxy.host)}:${a.proxy.port}${a.proxy_source === "phone" ? " (телефона)" : ""}` : "—"}</b></div>
        <div><span>Ближайшая публикация</span><b>${a.next_local ? localText(a.next_local) : "—"}</b></div>
        <div><span>Последнее действие</span><b>${a.last_action ? `${escape(eventLabel(a.last_action.type))} · ${ago(a.last_action.at)}` : "—"}</b></div>
        <div><span>Вступления 24 ч / 7 дн / всего</span><b>${num(a.joins.d1)} / ${num(a.joins.d7)} / ${num(a.joins.total)}</b></div>
        <div><span>Медленный режим</span><b>${c.binding ? slowText(c.binding.min_gap_minutes) : "—"}</b></div>
        <div><span>Кластер</span><b>${a.cluster ? `<button class="wlink" data-wcluster="${a.cluster.id}">${escape(a.cluster.name)}</button>` : "—"}</b></div>
        <div><span>Последняя проверка</span><b>${healthHtml(a.health)}</b></div>
      </div>
      ${a.status !== "working" && a.status_reason ? `<div class="wwarn">${escape(reasonText(a.status_reason))}</div>` : ""}
    </div>
    <div class="wtabs">${tabs}</div>
    <div class="wtabbody">${cardTab(c)}</div>`;
}

// ---------- действия карточки ----------

function editSetting(ctx, c, key) {
  const rec = c.settings.registry.find((r) => r.key === key);
  if (!rec) return;
  const own = Object.prototype.hasOwnProperty.call(c.settings.own, key);
  const value = c.settings.effective?.[key] ?? (own ? c.settings.own[key] : (c.settings.global[key] ?? rec.default));
  const shared = c.settings.effective_global?.[key] ?? c.settings.global[key] ?? rec.default;
  const accountOnly = rec.scope === "account";
  dialog({
    subtitle: `@${c.account.account_name}`.toUpperCase(), title: rec.label,
    body: `<div class="wform">${accountOnly ? "" : `<div class="wseg"><label><input type="radio" name="wmode" value="inherit"${own ? "" : " checked"}> Как в общих <small>(${settingValue(shared)})</small></label><label><input type="radio" name="wmode" value="set"${own ? " checked" : ""}> Своё</label></div>`}
      <div class="wf" data-wfield>${legacy.field(rec, value, "wsetv", false)}</div>${rec.hint ? `<p class="wmute">${escape(rec.hint)}</p>` : ""}</div>`,
    actions: [{id: "close", label: "Закрыть"}, {id: "save", label: "Сохранить", primary: true}],
    onAction: async (id, box) => {
      if (id !== "save") return false;
      const mode = accountOnly ? "set" : box.querySelector('input[name="wmode"]:checked').value;
      try {
        await call("content_settings_set", {scope: c.account.id, key, mode, ...(mode === "set" ? {value: legacy.readField(rec, box.querySelector("[data-wfield]"))} : {})});
        ctx.reload();
        return true;
      } catch (e) { dialogMessage(box, errorOf(e)); return false; }
    },
  });
}

function addTexts(ctx, c) {
  dialog({
    subtitle: `@${c.account.account_name}`.toUpperCase(), title: "Тексты кнопки",
    body: `<label class="wf"><span>По одному на строку, до 80 символов. Повторы пропускаются.</span><textarea rows="8" data-f="t"></textarea></label>`,
    actions: [{id: "close", label: "Закрыть"}, {id: "save", label: "Добавить", primary: true}],
    onAction: async (id, box) => {
      if (id !== "save") return false;
      try {
        const r = await call("content_button_texts_add", {account_id: c.account.id, text: box.querySelector('[data-f="t"]').value});
        ctx.reload();
        dialogMessage(box, `Добавлено ${r.added}, пропущено ${r.skipped}.`, "ok");
        return r.skipped === 0;
      } catch (e) { dialogMessage(box, errorOf(e)); return false; }
    },
  });
}

// PostBot opens Instagram on the bound phone, reads the handle on the profile and compares it. Publishes nothing.
async function verifyAccount(ctx, c) {
  const name = `@${c.account.account_name}`;
  if (!(await confirmDialog("Проверить аккаунт?", `PostBot откроет Instagram на телефоне ${c.account.phone?.name || ""} и сверит ник с ${c.binding?.expected_handle || c.account.account_name}. Ничего не публикует.`, {ok: "Проверить"}))) return;
  try {
    await call("device_job_create", {kind: "verify_account", account_id: c.account.id, idempotency_key: `verify-${c.account.id}-${Date.now()}`});
    await confirmDialog("Проверка поставлена", `${name}: телефон возьмёт её в ближайшие 30 секунд. Итог — в «Истории» аккаунта: «Готово» значит ник совпал.`, {ok: "Понятно"});
  } catch (e) { await confirmDialog("Не поставлено", errorOf(e), {ok: "Понятно"}); }
  ctx.reload();
}

export function warmupView(c) {
  const w = c.warmup || {}, empty = {sessions: 0, reels: 0, likes: 0, minutes: 0};
  const stats = (label, s) => `<section class="wcard"><h2>${label}</h2><dl class="wdl"><dt>Сессий</dt><dd>${num(s.sessions)}</dd><dt>Роликов</dt><dd>${num(s.reels)}</dd><dt>Лайков</dt><dd>${num(s.likes)}</dd><dt>Минут</dt><dd>${num(s.minutes)}</dd></dl></section>`;
  return `<div class="wtool"><span class="wmute">Автопрогрев ${w.enabled ? "включён" : "выключен"}. Настройки — во вкладке «Настройки», группа «Прогрев». Разовый запуск доступен и при выключенном автопрогреве.</span><button class="wbtn wbtn-p" data-wwarmup${c.account.phone ? "" : " disabled"}>Прогреть сейчас</button></div>
    <div class="wgrid wgrid-2">${stats("Сегодня", w.today || empty)}${stats("За 7 дней", w.d7 || empty)}</div>
    <section class="wcard wcard-free"><h2>Ближайшие сессии</h2>${table("acc-warmup", [
      {key: "local", label: "Когда", html: (j) => localText(j.local)},
      {key: "minutes", label: "Минут", html: (j) => num(j.minutes)},
      {key: "status", label: "Статус", html: (j) => badge(j.status)},
      {key: "act", label: "", html: (j) => jobButtons({...j, kind: "warmup_reels"})},
    ], w.upcoming || [], {empty: "Запланированных сессий нет"})}</section>`;
}

async function warmupNow(ctx, c) {
  const range = c.warmup?.default_minutes || {min: 6, max: 15};
  const minutes = Math.round((range.min + range.max) / 2);
  if (!(await confirmDialog("Прогреть аккаунт сейчас?", `@${c.account.account_name}: просмотр Reels и лайки по настройкам, ${minutes} мин. Телефон ${c.account.phone?.name || ""} возьмёт задание, когда освободится. Перед началом PostBot сверит ник.`, {ok: "Прогреть"}))) return;
  try {
    await call("device_job_create", {kind: "warmup_reels", account_id: c.account.id, minutes});
    ctx.reload();
  } catch (e) { await confirmDialog("Прогрев не поставлен", errorOf(e), {ok: "Понятно"}); }
}

async function changePhone(ctx, c) {
  if(c.binding?.app_package && c.binding.app_package!=="com.instagram.android")return manageClones(c.binding.phone_id,()=>ctx.reload());
  const tree = await call("device_tree");
  const phones = [...tree.workers.flatMap((w) => w.phones.map((p) => ({...p, worker: w.name}))), ...tree.unbound_phones];
  dialog({
    subtitle: `@${c.account.account_name}`.toUpperCase(), title: "Телефон аккаунта",
    body: `<div class="wform"><label class="wf"><span>Телефон</span><select data-f="phone"><option value="">Без телефона</option>${phones.map((p) => `<option value="${p.id}"${c.account.phone?.id === p.id ? " selected" : ""}>${escape(p.name || p.serial)}${p.worker ? ` · ${escape(p.worker)}` : ""}${p.online ? "" : " · не на связи"}</option>`).join("")}</select></label>
      <label class="wf"><span>Ник, который проверяется на телефоне</span><input data-f="handle" value="${escape(c.binding?.expected_handle || c.account.account_name)}"></label>
      <label class="wf"><span>Медленный режим</span>${slowSelect("gap", c.binding?.min_gap_minutes ?? 0)}</label></div>`,
    actions: [{id: "close", label: "Закрыть"}, {id: "save", label: "Сохранить", primary: true}],
    onAction: async (id, box) => {
      if (id !== "save") return false;
      const f = (n) => box.querySelector(`[data-f="${n}"]`).value;
      try {
        if (!f("phone")) await call("device_binding_delete", {account_id: c.account.id});
        else await call("device_binding_set", {account_id: c.account.id, phone_id: Number(f("phone")), expected_handle: f("handle"), min_gap_minutes: Number(f("gap"))});
        ctx.reload();
        return true;
      } catch (e) { dialogMessage(box, errorOf(e)); return false; }
    },
  });
}

export default {
  async load(ctx) {
    if (ctx.params.id) return {card: await call("account_card", {id: ctx.params.id})};
    return {list: await call("account_list")};
  },
  render(d, ctx) {
    if (ctx.params.id && d.card && String(d.card.account.id) === String(ctx.params.id)) return cardView(d.card);
    if (ctx.params.id) return '<div class="wempty"><div class="spin"></div></div>';
    return d.list ? listView(d.list) : noData();
  },
  bind(root, ctx) {
    const c = ctx.data?.card;
    bindToolbar(root, (id, value) => { view[id] = value; ctx.redraw(); });
    bindSort(root, ctx.redraw);
    bindJobButtons(root, () => ctx.reload());
    root.querySelectorAll("[data-wopen]").forEach((tr) => { tr.onclick = () => ctx.openAccount(Number(tr.dataset.wopen)); });
    root.querySelectorAll("[data-wcluster]").forEach((b) => { b.onclick = (e) => { e.stopPropagation(); ctx.go("clusters", {id: Number(b.dataset.wcluster)}); }; });
    root.querySelectorAll("[data-wtab]").forEach((b) => { b.onclick = () => { view.tab = b.dataset.wtab; ctx.redraw(); }; });
    const back = root.querySelector("[data-wlist]");
    if (back) back.onclick = () => ctx.go("accounts", {});
    if (!c) return;
    bindRowActions(root, c.schedule, () => ctx.reload());
    root.querySelectorAll("[data-wset]").forEach((b) => { b.onclick = () => editSetting(ctx, c, b.dataset.wset); });
    root.querySelector("[data-waddtexts]")?.addEventListener("click", () => addTexts(ctx, c));
    root.querySelectorAll("[data-wtext]").forEach((cb) => {
      cb.onchange = async () => {
        try { await call("content_button_text_update", {id: Number(cb.dataset.wtext), enabled: cb.checked}); } catch (e) { await confirmDialog("Не сохранено", errorOf(e), {ok: "Понятно"}); }
        ctx.reload();
      };
    });
    root.querySelector("[data-wphone]")?.addEventListener("click", () => changePhone(ctx, c));
    root.querySelector("[data-wverify]")?.addEventListener("click", () => verifyAccount(ctx, c));
    root.querySelector("[data-wwarmup]")?.addEventListener("click", () => warmupNow(ctx, c));
    root.querySelector("[data-wproxy]")?.addEventListener("click", () => chooseProxy(ctx, "account", c.account.id, `@${c.account.account_name}`, c.account.proxy_source === "account" ? c.account.proxy?.id : null));
  },
};
