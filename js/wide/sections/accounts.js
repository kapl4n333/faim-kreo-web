// Аккаунты: таблица и карточка. В карточке: правка расписания, настройки «как в общих / своё», тексты кнопок,
// телефон и прокси. Все действия через существующие action, проверки на сервере.
import {call, escape, isAdmin, legacy} from "../bridge.js";
import {badge, reasonText, TYPE} from "../ui/badge.js";
import {confirmDialog, dialog, dialogMessage, errorOf} from "../ui/dialog.js";
import {noData} from "../ui/empty.js";
import {ago, localText, num, whenIso} from "../ui/format.js";
import {bindSort, bindToolbar, table, toolbar} from "../ui/table.js";
import {bindRowActions, rowActions} from "../ui/schedule-edit.js";
import {eventLabel} from "../ui/accounts-rail.js";
import {bindJobButtons, jobButtons} from "../ui/job-actions.js";
import {chooseProxy} from "../ui/proxy-pick.js";

const view = {q: "", status: "", tab: "schedule"};
const TABS = [["schedule", "Расписание"], ["history", "История"], ["settings", "Настройки"], ["texts", "Тексты кнопок"], ["link", "Ссылка"]];

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
  if (typeof v === "object" && "mode" in v) return v.mode === "percent" ? `${v.value}% историй` : `каждая ${v.value}-я`;
  if (typeof v === "object") return `<span class="mono">${escape(JSON.stringify(v))}</span>`;
  const s = String(v);
  return s.length > 160 ? `${escape(s.slice(0, 160))}…` : escape(s);
}

function cardTab(c) {
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
      const value = own ? c.settings.own[r.key] : (c.settings.global[r.key] ?? r.default);
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
      <div class="wacard-h"><div><div class="wacard-n">@${escape(a.account_name)}</div><div class="wmute">${escape(a.platform || "")} · пояс ${escape(a.timezone)}</div></div>${badge(a.status, {title: reasonText(a.status_reason)})}</div>
      <div class="wkv">
        <div><span>Телефон ${admin ? '<button class="wlink" data-wphone>изменить</button>' : ""}</span><b>${a.phone ? `${escape(a.phone.name)} ${a.phone.online ? badge("online") : badge("offline")}` : "нет"}</b></div>
        <div><span>Ник на телефоне</span><b>${escape(c.binding?.expected_handle || "—")}</b></div>
        <div><span>Прокси ${admin ? '<button class="wlink" data-wproxy>изменить</button>' : ""}</span><b>${a.proxy ? `${escape(a.proxy.host)}:${a.proxy.port}${a.proxy_source === "phone" ? " (телефона)" : ""}` : "—"}</b></div>
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

// ---------- действия карточки ----------

function editSetting(ctx, c, key) {
  const rec = c.settings.registry.find((r) => r.key === key);
  if (!rec) return;
  const own = Object.prototype.hasOwnProperty.call(c.settings.own, key);
  const value = own ? c.settings.own[key] : (c.settings.global[key] ?? rec.default);
  const shared = c.settings.global[key] ?? rec.default;
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

async function changePhone(ctx, c) {
  const tree = await call("device_tree");
  const phones = [...tree.workers.flatMap((w) => w.phones.map((p) => ({...p, worker: w.name}))), ...tree.unbound_phones];
  dialog({
    subtitle: `@${c.account.account_name}`.toUpperCase(), title: "Телефон аккаунта",
    body: `<div class="wform"><label class="wf"><span>Телефон</span><select data-f="phone"><option value="">Без телефона</option>${phones.map((p) => `<option value="${p.id}"${c.account.phone?.id === p.id ? " selected" : ""}>${escape(p.name || p.serial)}${p.worker ? ` · ${escape(p.worker)}` : ""}${p.online ? "" : " · не на связи"}</option>`).join("")}</select></label>
      <label class="wf"><span>Ник, который проверяется на телефоне</span><input data-f="handle" value="${escape(c.binding?.expected_handle || c.account.account_name)}"></label>
      <label class="wf"><span>Минимум между публикациями аккаунта, мин</span><input type="number" min="0" max="1440" data-f="gap" value="${escape(c.binding?.min_gap_minutes ?? 30)}"></label></div>`,
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
    root.querySelector("[data-wproxy]")?.addEventListener("click", () => chooseProxy(ctx, "account", c.account.id, `@${c.account.account_name}`, c.account.proxy_source === "account" ? c.account.proxy?.id : null));
  },
};
