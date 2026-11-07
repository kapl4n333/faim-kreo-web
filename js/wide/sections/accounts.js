// Аккаунты: таблица всех аккаунтов и карточка аккаунта. Шаг 2: только чтение.
import {escape} from "../bridge.js";
import {badge, reasonText, TYPE} from "../ui/badge.js";
import {noData} from "../ui/empty.js";
import {ago, localText, num, whenIso} from "../ui/format.js";
import {bindSort, bindToolbar, table, toolbar} from "../ui/table.js";
import {eventLabel} from "../ui/accounts-rail.js";

const view = {q: "", status: "", tab: "schedule"};
const TABS = [["schedule", "Расписание"], ["history", "История"], ["settings", "Настройки"], ["texts", "Тексты кнопок"], ["link", "Ссылка"]];

function listView(d, ctx) {
  const q = view.q.trim().toLowerCase();
  const list = d.accounts.filter((a) => (!view.status || a.status === view.status) && (!q || a.account_name.toLowerCase().includes(q) || (a.phone?.name || "").toLowerCase().includes(q)));
  const tool = toolbar({
    search: {id: "q", placeholder: "Ник или телефон", value: view.q},
    filters: [{id: "status", label: "Статус", value: view.status, options: [["", "Все"], ["working", "Работает"], ["attention", "Внимание"], ["paused", "Пауза"], ["no_phone", "Без телефона"]]}],
  });
  const t = table("accounts", [
    {key: "account_name", label: "Ник", html: (a) => `<b>@${escape(a.account_name)}</b>`},
    {key: "phone", label: "Телефон", width: "150px", value: (a) => a.phone?.name, html: (a) => (a.phone ? `${escape(a.phone.name)} ${a.phone.online ? "" : '<span class="wbad">не на связи</span>'}` : '<span class="wmute">нет</span>')},
    {key: "proxy", label: "Прокси", width: "160px", value: (a) => a.proxy?.host, html: (a) => (a.proxy ? `${escape(a.proxy.host)}:${a.proxy.port}` : '<span class="wmute">—</span>')},
    {key: "status", label: "Статус", width: "200px", html: (a) => `${badge(a.status)} <span class="wmute">${escape(a.status === "working" ? "" : reasonText(a.status_reason))}</span>`},
    {key: "next_run_at", label: "Ближайшая публикация", width: "170px", html: (a) => (a.next_local ? localText(a.next_local) : '<span class="wmute">—</span>')},
    {key: "last_action", label: "Последнее действие", width: "190px", value: (a) => a.last_action?.at, html: (a) => (a.last_action ? `${escape(eventLabel(a.last_action.type))} · ${ago(a.last_action.at)}` : '<span class="wmute">—</span>')},
    {key: "joins", label: "Вступления 7 дн / всего", width: "160px", align: "right", value: (a) => a.joins.total, html: (a) => `${num(a.joins.d7)} / <b>${num(a.joins.total)}</b>`},
  ], list, {rowAttr: (a) => `data-wopen="${a.id}"`, empty: "Аккаунтов нет"});
  return `<div class="whead"><h1>Аккаунты</h1><div class="whead-s">${list.length} из ${d.accounts.length}</div></div>${tool}<div class="wpanel">${t}</div>`;
}

function settingValue(v) {
  if (v == null || v === "") return '<span class="wmute">пусто</span>';
  if (typeof v === "boolean") return v ? "да" : "нет";
  if (Array.isArray(v) && v.every((x) => x && x.from)) return v.map((x) => `${x.from}–${x.to}`).join(", ");
  if (typeof v === "object" && "min" in v && "max" in v) return `${v.min}–${v.max} в ${v.period === "week" ? "неделю" : "день"}`;
  if (typeof v === "object") return `<span class="mono">${escape(JSON.stringify(v))}</span>`;
  const s = String(v);
  return s.length > 160 ? `${escape(s.slice(0, 160))}…` : escape(s);
}

function cardTab(c) {
  if (view.tab === "schedule") {
    return table("acc-sched", [
      {key: "local_time", label: "Время", width: "150px", html: (r) => (r.local_time ? localText(r.local_time) : '<span class="wmute">не выбрано</span>')},
      {key: "content_type", label: "Тип", width: "90px", html: (r) => escape(TYPE[r.content_type] || r.content_type)},
      {key: "title", label: "Материал", html: (r) => escape(r.title || `#${r.item_id}`)},
      {key: "state", label: "Статус", width: "150px", value: (r) => r.job_status || r.state, html: (r) => badge(r.job_status || r.state)},
      {key: "wait_reason", label: "Причина", width: "180px", html: (r) => escape(reasonText(r.wait_reason) || "—")},
      {key: "caption", label: "Подпись", html: (r) => (r.caption ? `<span class="wclip">${escape(r.caption)}</span>` : '<span class="wmute">—</span>')},
    ], c.schedule, {empty: "Назначений нет"});
  }
  if (view.tab === "history") {
    const jobs = table("acc-jobs", [
      {key: "id", label: "#", width: "60px", html: (j) => `<span class="mono">${j.id}</span>`},
      {key: "local", label: "Время", width: "150px", html: (j) => (j.local ? localText(j.local) : "—")},
      {key: "content_type", label: "Тип", width: "90px", html: (j) => escape(TYPE[j.content_type] || j.kind)},
      {key: "status", label: "Статус", width: "150px", html: (j) => badge(j.status)},
      {key: "error_code", label: "Ошибка", html: (j) => escape(j.error_code || "—")},
      {key: "post_url", label: "Пост", width: "80px", html: (j) => (j.post_url ? `<a href="${escape(j.post_url)}" target="_blank" rel="noopener">открыть</a>` : "—")},
    ], c.jobs, {empty: "Заданий не было"});
    const events = c.events.slice(-80).reverse().map((e) => `<div class="wl"><span class="wl-t">${whenIso(e.at)}</span><span class="wl-j">#${e.job_id}</span><span class="wl-s">${escape(e.source || "")}</span><span class="wl-e">${escape(eventLabel(e.type))}</span></div>`).join("") || '<div class="wmute">Событий нет</div>';
    return `<div class="wgrid wgrid-2"><section class="wcard"><h2>Задания <span>${c.jobs.length}</span></h2>${jobs}</section><section class="wcard"><h2>События</h2><div class="wconlog mono">${events}</div></section></div>`;
  }
  if (view.tab === "settings") {
    const groups = [...new Set(c.settings.registry.map((r) => r.group))];
    return `<div class="wgrid wgrid-2">${groups.map((g) => `<section class="wcard"><h2>${escape(g)}</h2><table class="wt"><tbody>${c.settings.registry.filter((r) => r.group === g && r.scope !== "global").map((r) => {
      const own = Object.prototype.hasOwnProperty.call(c.settings.own, r.key);
      const value = own ? c.settings.own[r.key] : (c.settings.global[r.key] ?? r.default);
      return `<tr><td>${escape(r.label)}</td><td style="width:120px">${own ? badge("working", {label: "Своё"}) : badge("empty", {label: "Как в общих"})}</td><td>${settingValue(value)}</td></tr>`;
    }).join("") || '<tr class="wt-empty"><td>Только общие</td></tr>'}</tbody></table></section>`).join("")}</div>`;
  }
  if (view.tab === "texts") {
    return `<p class="wmute">Свои тексты: ${c.button_texts.length}. Общий пул: ${num(c.global_button_texts.enabled)} включено из ${num(c.global_button_texts.count)}.</p>` + table("acc-texts", [
      {key: "text", label: "Текст", html: (t) => escape(t.text)},
      {key: "enabled", label: "Включён", width: "100px", html: (t) => (t.enabled ? "да" : "нет")},
      {key: "use_count", label: "Использован", width: "120px", align: "right", html: (t) => num(t.use_count)},
    ], c.button_texts, {empty: "Своих текстов нет, берутся общие"});
  }
  return `<dl class="wdl wdl-wide"><dt>Ссылка-приглашение</dt><dd>${c.link.invite_link ? `<span class="mono">${escape(c.link.invite_link)}</span>` : '<span class="wmute">нет</span>'}</dd>
    <dt>Код источника</dt><dd class="mono">${escape(c.link.code || "—")}</dd>
    <dt>Ошибка ссылки</dt><dd>${c.link.link_error ? `<span class="wbad">${escape(c.link.link_error)}</span>` : "нет"}</dd>
    <dt>Своя ссылка для историй</dt><dd>${c.settings.own.story_link_url ? escape(c.settings.own.story_link_url) : '<span class="wmute">не задана, берётся приглашение</span>'}</dd></dl>`;
}

function cardView(c) {
  const a = c.account;
  const tabs = TABS.map(([k, l]) => `<button class="wtab${view.tab === k ? " on" : ""}" data-wtab="${k}">${l}</button>`).join("");
  return `<div class="whead"><button class="wlink" data-wlist>← Все аккаунты</button></div>
    <div class="wacard">
      <div class="wacard-h"><div><div class="wacard-n">@${escape(a.account_name)}</div><div class="wmute">${escape(a.platform || "")} · пояс ${escape(a.timezone)}</div></div>${badge(a.status, {title: reasonText(a.status_reason)})}</div>
      <div class="wkv">
        <div><span>Телефон</span><b>${a.phone ? `${escape(a.phone.name)} ${a.phone.online ? badge("online") : badge("offline")}` : "нет"}</b></div>
        <div><span>Ник на телефоне</span><b>${escape(c.binding?.expected_handle || "—")}</b></div>
        <div><span>Прокси</span><b>${a.proxy ? `${escape(a.proxy.host)}:${a.proxy.port}` : "—"}</b></div>
        <div><span>Ближайшая публикация</span><b>${a.next_local ? localText(a.next_local) : "—"}</b></div>
        <div><span>Последнее действие</span><b>${a.last_action ? `${escape(eventLabel(a.last_action.type))} · ${ago(a.last_action.at)}` : "—"}</b></div>
        <div><span>Вступления 24 ч / 7 дн / всего</span><b>${num(a.joins.d1)} / ${num(a.joins.d7)} / ${num(a.joins.total)}</b></div>
        <div><span>Интервал на телефоне</span><b>${c.binding ? `${num(c.binding.min_gap_minutes)} мин` : "—"}</b></div>
      </div>
      ${a.status !== "working" && a.status_reason ? `<div class="wwarn">${escape(reasonText(a.status_reason))}</div>` : ""}
    </div>
    <div class="wtabs">${tabs}</div>
    <div class="wtabbody">${cardTab(c)}</div>`;
}

export default {
  async load(ctx) {
    if (ctx.params.id) return {card: await ctx.call("account_card", {id: ctx.params.id})};
    return {list: await ctx.call("account_list")};
  },
  render(d, ctx) {
    if (ctx.params.id && d.card && String(d.card.account.id) === String(ctx.params.id)) return cardView(d.card);
    if (ctx.params.id) return '<div class="wempty"><div class="spin"></div></div>';
    return d.list ? listView(d.list, ctx) : noData();
  },
  bind(root, ctx) {
    bindToolbar(root, (id, value) => { view[id] = value; ctx.redraw(); });
    bindSort(root, ctx.redraw);
    root.querySelectorAll("[data-wopen]").forEach((tr) => { tr.onclick = () => ctx.openAccount(Number(tr.dataset.wopen)); });
    root.querySelectorAll("[data-wtab]").forEach((b) => { b.onclick = () => { view.tab = b.dataset.wtab; ctx.redraw(); }; });
    const back = root.querySelector("[data-wlist]");
    if (back) back.onclick = () => ctx.go("accounts", {});
  },
};
