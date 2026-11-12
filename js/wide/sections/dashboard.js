// Дашборд: статусы аккаунтов и устройств, сегодня и завтра, что ждёт решения, планировщик, вступления.
// Просмотры и гео: «нет данных», пока нет сбора статистики с телефона. Цифры не придумываются.
import {escape} from "../bridge.js";
import {badge, reasonText, TYPE} from "../ui/badge.js";
import {noData} from "../ui/empty.js";
import {ago, num, timeOnly, whenIso, th} from "../ui/format.js";
import {table} from "../ui/table.js";
import {bindJobButtons, bulkDecide, bulkLabel, jobButtons, jobChoices} from "../ui/job-actions.js";
import {confirmDialog} from "../ui/dialog.js";
import {bindThreadsActivity, threadsActivity} from "../ui/threads-activity.js";
import {openDetails} from "../ui/details.js";
import {showToast} from "../bridge.js";

const picked = new Set();
const asJob = (r) => ({...r, kind: r.job_kind || r.kind});
// Снимок открывается в панели справа, а не новой вкладкой (в Telegram это уход из приложения).
const shotLabel = (s) => [s.screen || s.name || "снимок", s.at ? ago(s.at) : ""].filter(Boolean).join(" · ");
const shots = (r) => (r.shots?.length ? `<div class="wshots">${r.shots.map((s, i) => `<button class="wshot-s" data-wshot="${escape(r.id)}:${i}" title="${escape(shotLabel(s))}"><img src="${escape(s.url)}" alt="Снимок" loading="lazy"><span>${escape(s.screen || s.name || "")}</span></button>`).join("")}</div>` : "");

const tile = (label, value, tone, go) => `<button class="wkpi wb-${tone}" ${go ? `data-wgo="${go}"` : ""}><div class="wkpi-v">${num(value)}</div><div class="wkpi-l">${escape(label)}</div></button>`;

function dayTable(id, list) {
  return table(id, [
    {key: "local", label: "Время", width: "64px", html: (r) => `<span class="mono">${timeOnly(r.local)}</span>`},
    {key: "account_name", label: "Аккаунт", html: (r) => `@${escape(r.account_name)}${th(r)}`},
    {key: "content_type", label: "Тип", width: "86px", html: (r) => escape(TYPE[r.content_type] || r.content_type || "—")},
    {key: "title", label: "Материал", html: (r) => escape(r.title || (r.source === "old_form" ? "Новая задача" : "—"))},
    {key: "status", label: "Статус", width: "130px", value: (r) => r.job_status || r.state, html: (r) => badge(r.job_status || r.state)},
  ], list, {empty: "Ничего не запланировано"});
}

function planner(p) {
  if (!p) return noData();
  const r = p.last_run;
  const state = p.offline ? badge("offline", {label: "Не выходит на связь"}) : r?.outcome === "failed" ? badge("failed") : r ? badge("online", {label: "Работает"}) : badge("empty", {label: "Не запускался"});
  return `<dl class="wdl">
    <dt>Состояние</dt><dd>${state}</dd>
    <dt>Последний запуск</dt><dd>${r ? `${whenIso(r.started_at)} · ${escape(r.outcome || "идёт")}` : "—"}</dd>
    <dt>Результат</dt><dd>${r ? `принято ${num(r.accepted_count)}, отказ ${num(r.rejected_count)} из ${num(r.item_count)}` : "—"}</dd>
    <dt>Ошибка</dt><dd>${r?.error_code ? `<span class="wbad">${escape(r.error_code)}</span>` : "нет"}</dd>
    <dt>Следующая попытка</dt><dd>${r?.next_try_at ? whenIso(r.next_try_at) : "по расписанию"}</dd>
    <dt>Связь</dt><dd>${p.last_poll_at ? ago(p.last_poll_at) : "ни разу"}</dd>
    <dt>Ждут плана</dt><dd>${num(p.waiting)}</dd>
  </dl>`;
}

export default {
  load: (ctx) => ctx.call("desk_overview"),
  render(d) {
    const a = d.accounts, dev = d.devices;
    // Решённое или ушедшее само больше не отмечено (Fable review: счётчик врал).
    const live = new Set(d.decisions.filter((r) => r.kind === "job").map((r) => String(r.id)));
    for (const id of [...picked]) if (!live.has(id)) picked.delete(id);
    const decisions = table("dash-dec", [
      {key: "sel", label: '<input type="checkbox" data-wpickall title="Отметить все">', raw: true, width: "28px", sort: false, html: (r) => (r.kind === "job" && jobChoices(asJob(r)).length ? `<input type="checkbox" data-wpick="${escape(r.id)}"${picked.has(String(r.id)) ? " checked" : ""}>` : "")},
      {key: "account_name", label: "Аккаунт", width: "150px", html: (r) => `@${escape(r.account_name)}${th(r)}`},
      {key: "kind", label: "Что", width: "110px", html: (r) => (r.kind === "job" ? `Задание #${r.id}` : `Назначение #${r.id}`)},
      {key: "status", label: "Статус", width: "140px", html: (r) => badge(r.status)},
      {key: "error_code", label: "Причина", width: "30%", html: (r) => `${escape(reasonText(r.error_code) || r.stage || "—")}${r.error_message ? `<div class="wmute wclip" title="${escape(r.error_message)}">${escape(r.error_message)}</div>` : ""}${shots(r)}`},
      {key: "at", label: "Когда", width: "110px", html: (r) => ago(r.at)},
      {key: "act", label: "Решение", width: "250px", sort: false, html: (r) => (r.kind === "job" ? jobButtons(asJob(r)) : "")},
    ], d.decisions, {empty: "Решений не ждёт ничего"});
    const joins = table("dash-joins", [
      {key: "account_name", label: "Аккаунт", html: (r) => `@${escape(r.account_name)}${th(r)}`},
      {key: "d1", label: "24 ч", width: "70px", align: "right", html: (r) => num(r.d1)},
      {key: "d7", label: "7 дней", width: "70px", align: "right", html: (r) => num(r.d7)},
      {key: "total", label: "Всего", width: "70px", align: "right", html: (r) => `<b>${num(r.total)}</b>`},
    ], d.joins, {empty: "Вступлений нет"});
    return `<div class="whead"><h1>Дашборд</h1><div class="whead-s">Пояс ${escape(d.timezone)} · аккаунтов ${num(d.account_count)}</div></div>
      <div class="wkpis">
        ${tile("Работают", a.working, "ok", "accounts")}${tile("Пауза", a.paused, "warn", "accounts")}${tile("Внимание", a.attention, "bad", "accounts")}${tile("Без телефона", a.no_phone, "mute", "accounts")}
        <div class="wkpi-gap"></div>
        ${tile("ПК на связи", dev.workers.online, "ok", "devices")}${tile("ПК не на связи", dev.workers.offline, dev.workers.offline ? "bad" : "mute", "devices")}
        ${tile("Телефоны на связи", dev.phones.online, "ok", "devices")}${tile("Телефоны не на связи", dev.phones.offline, dev.phones.offline ? "bad" : "mute", "devices")}
      </div>
      <div class="wgrid wgrid-3">
        <section class="wcard"><h2>Сегодня · ${escape(d.today)} <span>${d.schedule.today.length}</span></h2>${dayTable("dash-today", d.schedule.today)}</section>
        <section class="wcard"><h2>Завтра · ${escape(d.tomorrow)} <span>${d.schedule.tomorrow.length}</span></h2>${dayTable("dash-tom", d.schedule.tomorrow)}</section>
        <section class="wcard"><h2>Планировщик</h2>${planner(d.planner)}</section>
      </div>
      ${d.decisions.length ? `<section class="wcard wcard-alert"><h2>Ждут решения <span>${d.decisions.length}</span></h2>
        <div class="wbulk" data-wbulk>${["not_published", "cancel", "published", "retry"].map((n) => `<button class="wbtn wbtn-s${n === "cancel" ? " wbtn-d" : ""}" data-wbulkact="${n}" disabled>${bulkLabel(n)}</button>`).join("")}<span class="wmute" data-wpicked></span></div>${decisions}</section>` : ""}
      <section class="wcard"><h2>Threads: что делал ИИ <span>${(d.threads || []).length}</span></h2>${threadsActivity(d.threads, {withAccount: true})}</section>
      <div class="wgrid wgrid-3">
        <section class="wcard"><h2>Вступления в канал</h2>${joins}</section>
        <section class="wcard"><h2>Просмотры</h2>${d.metrics?.views ? "" : noData("Сбора статистики с телефона пока нет.")}</section>
        <section class="wcard"><h2>Гео</h2>${d.metrics?.geo ? "" : noData("Сбора статистики с телефона пока нет.")}</section>
      </div>`;
  },
  bind(root, ctx) {
    root.querySelectorAll("[data-wgo]").forEach((b) => { b.onclick = () => ctx.go(b.dataset.wgo); });
    bindJobButtons(root, () => ctx.reload());
    bindThreadsActivity(root);
    const jobs = (d) => (d?.decisions || []).filter((r) => r.kind === "job").map(asJob);
    const chosen = () => jobs(ctx.data).filter((j) => picked.has(String(j.id)));
    const refresh = () => {
      const list = chosen();
      // Кнопка активна, только если решение подходит хоть одному отмеченному; число — сколько из них подходит.
      root.querySelectorAll("[data-wbulkact]").forEach((b) => {
        const n = list.filter((j) => jobChoices(j).includes(b.dataset.wbulkact)).length;
        b.disabled = !n; b.textContent = `${bulkLabel(b.dataset.wbulkact)}${n ? ` (${n})` : ""}`;
      });
      const lab = root.querySelector("[data-wpicked]"); if (lab) lab.textContent = list.length ? `Отмечено: ${list.length}` : "Отметь задания галочками";
      const all = root.querySelector("[data-wpickall]"); const boxes = [...root.querySelectorAll("[data-wpick]")];
      if (all) { all.checked = boxes.length > 0 && boxes.every((c) => c.checked); all.indeterminate = boxes.some((c) => c.checked) && !all.checked; }
    };
    root.querySelectorAll("[data-wpick]").forEach((c) => { c.onclick = (e) => e.stopPropagation(); c.onchange = () => { c.checked ? picked.add(c.dataset.wpick) : picked.delete(c.dataset.wpick); c.blur(); refresh(); }; });
    root.querySelector("[data-wpickall]")?.addEventListener("change", (e) => {
      const on = e.target.checked;
      root.querySelectorAll("[data-wpick]").forEach((c) => { c.checked = on; on ? picked.add(c.dataset.wpick) : picked.delete(c.dataset.wpick); });
      e.target.blur(); refresh();
    });
    root.querySelectorAll("[data-wbulkact]").forEach((b) => { b.onclick = () => {
      bulkDecide(b.dataset.wbulkact, chosen(), async (made, skipped, errors) => {
        picked.clear();
        await ctx.reload();
        if (errors.length) await confirmDialog("Готово не всё", `Сделано: ${made}. Пропущено (не подходит): ${skipped}. Ошибки: ${errors.join("; ")}`, {ok: "Понятно"});
        else showToast(`Сделано: ${made}${skipped ? ` · пропущено: ${skipped}` : ""}`, "ok");
      });
    }; });
    root.querySelectorAll("[data-wshot]").forEach((b) => { b.onclick = (e) => {
      e.stopPropagation();
      const [id, i] = b.dataset.wshot.split(":");
      const row = (ctx.data?.decisions || []).find((r) => String(r.id) === id);
      const shot = row?.shots?.[Number(i)];
      if (!shot) return;
      openDetails(`shot:${id}:${i}`, {subtitle: `СНИМОК · ЗАДАНИЕ #${id}`, title: shotLabel(shot), body: `<div class="wshot-big"><img src="${escape(shot.url)}" alt="Снимок экрана" data-wshotimg><div class="wmute" data-wshotnote>Ссылка живёт час. Не открылась — обнови раздел.</div></div>`});
    }; });
    refresh();
  },
};
