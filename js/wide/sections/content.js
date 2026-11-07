// Контент: матрица «материалы × аккаунты». Шаг 2: только чтение.
// На шаге 3 клик по клетке вызывает существующие content_assign / content_assignment_cancel, все проверки остаются на сервере.
import {escape} from "../bridge.js";
import {badge, reasonText, STATUS, TYPE} from "../ui/badge.js";
import {openDetails, setDetailsBody} from "../ui/details.js";
import {noData} from "../ui/empty.js";
import {ago, localText, whenIso} from "../ui/format.js";
import {bindToolbar, toolbar} from "../ui/table.js";

const view = {content_type: "", status: "active", cell_state: "", account: "", period: "", q: ""};
const STEP3 = "Назначение и снятие будут на шаге 3";

function periodRange(p) {
  if (!p) return {};
  const days = {d7: 7, d30: 30, d90: 90}[p];
  return days ? {from: new Date(Date.now() - days * 86400000).toISOString()} : {};
}

const pad = (n) => String(n).padStart(2, "0");
const shortWhen = (iso) => { const d = new Date(iso); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };

function cellHtml(cell, item, account) {
  const [label, tone] = STATUS[cell.state] || ["?", "mute"];
  const when = cell.run_at ? whenIso(cell.run_at) : "";
  const tip = [label, when, reasonText(cell.wait_reason || cell.reason), cell.job_status ? `задание: ${(STATUS[cell.job_status] || [cell.job_status])[0]}` : ""].filter(Boolean).join(" · ");
  const text = cell.state === "empty" ? "" : (cell.state === "scheduled" || cell.state === "published") && cell.run_at ? shortWhen(cell.run_at) : label;
  return `<td class="wcell wc-${cell.state} wb-${tone}" data-wcell="${item.id}:${account.id}" title="${escape(tip)}"><span>${escape(text)}</span></td>`;
}

export default {
  load: (ctx) => ctx.call("content_matrix", {
    content_type: view.content_type || undefined, status: view.status, cell_state: view.cell_state || undefined,
    account_ids: view.account ? [Number(view.account)] : undefined, ...periodRange(view.period),
  }),
  render(d, ctx) {
    const q = view.q.trim().toLowerCase();
    const items = d.items.filter((i) => !q || (i.title || "").toLowerCase().includes(q) || String(i.id) === q);
    const accounts = d.accounts;
    const allAccounts = ctx.accounts || accounts;
    const tool = toolbar({
      search: {id: "q", placeholder: "Название или номер", value: view.q},
      filters: [
        {id: "content_type", label: "Тип", value: view.content_type, options: [["", "Все"], ["reel", "Reels"], ["carousel", "Карусели"], ["story", "Истории"]]},
        {id: "status", label: "Пул", value: view.status, options: [["active", "Активные"], ["archived", "Архив"]]},
        {id: "cell_state", label: "Клетки", value: view.cell_state, options: [["", "Любые"], ["empty", "Не назначено"], ["waiting", "Ждёт плана"], ["scheduled", "Запланировано"], ["taken", "Взято телефоном"], ["published", "Вышло"], ["failed", "Сорвалось"]]},
        {id: "account", label: "Аккаунт", value: view.account, options: [["", "Все"], ...allAccounts.map((a) => [String(a.id), "@" + a.account_name])]},
        {id: "period", label: "Добавлены", value: view.period, options: [["", "За всё время"], ["d7", "7 дней"], ["d30", "30 дней"], ["d90", "90 дней"]]},
      ],
      actions: `<button class="wbtn" disabled title="${STEP3}">Назначить выбранное</button><button class="wbtn" disabled title="Загрузка будет на шаге 3">+ Загрузить</button>`,
    });
    const legend = ["empty", "waiting", "scheduled", "taken", "published", "failed", "blocked"].map((s) => `<span class="wleg wc-${s} wb-${(STATUS[s] || [0, "mute"])[1]}"><i></i>${escape(s === "empty" ? "Не назначено" : STATUS[s][0])}</span>`).join("");
    if (!items.length) return `<div class="whead"><h1>Контент</h1></div>${tool}${noData("В пуле нет материалов под эти фильтры.")}`;
    const head = `<tr><th class="wm-item">Материал</th><th class="wm-type">Тип</th>${accounts.map((a) => `<th class="wm-acc" title="${escape(a.phone ? a.phone.name : "нет телефона")}"><div>@${escape(a.account_name)}</div><small>${escape(a.phone ? a.phone.name : "нет телефона")}</small></th>`).join("")}</tr>`;
    const rows = items.map((i) => `<tr data-witem="${i.id}"><th class="wm-item"><div class="wm-it">${i.poster_url ? `<img src="${escape(i.poster_url)}" alt="" loading="lazy">` : '<span class="wm-noimg"></span>'}<div><div class="wm-t">${escape(i.title || "Без названия")}</div><div class="wmute">#${i.id} · ${ago(i.created_at)}${i.media_count > 1 ? ` · файлов ${i.media_count}` : ""}</div></div></div></th><td class="wm-type">${escape(TYPE[i.content_type] || i.content_type)}</td>${accounts.map((a) => cellHtml(i.cells[a.id] || {state: "blocked"}, i, a)).join("")}</tr>`).join("");
    return `<div class="whead"><h1>Контент</h1><div class="whead-s">Материалов ${items.length}${d.next_before_id ? "+" : ""} · аккаунтов ${accounts.length}</div></div>${tool}
      <div class="wlegend">${legend}</div>
      <div class="wpanel wmatrix-wrap"><table class="wmatrix"><thead>${head}</thead><tbody>${rows}</tbody></table></div>`;
  },
  bind(root, ctx) {
    bindToolbar(root, (id, value) => { view[id] = value; if (id === "q") ctx.redraw(); else ctx.reload(); });
    root.querySelectorAll("tr[data-witem] th.wm-item").forEach((th) => { th.onclick = () => openItem(ctx, Number(th.parentElement.dataset.witem)); });
    root.querySelectorAll("[data-wcell]").forEach((td) => { td.onclick = () => openItem(ctx, Number(td.dataset.wcell.split(":")[0]), Number(td.dataset.wcell.split(":")[1])); });
  },
};

async function openItem(ctx, id, accountId = null) {
  openDetails(`item:${id}`, {subtitle: "МАТЕРИАЛ", title: `#${id}`, body: '<div class="wempty"><div class="spin"></div></div>'});
  try {
    const d = await ctx.call("content_item_detail", {id});
    const it = d.item;
    const media = it.media.map((m) => (m.media_kind === "video" ? `<video src="${escape(m.url)}" muted controls preload="metadata"></video>` : `<img src="${escape(m.url)}" alt="">`)).join("");
    const rows = d.per_account.map((r) => `<div class="wpa${accountId && r.account_id === accountId ? " on" : ""}">
        <div class="wpa-1"><b>@${escape(r.account_name)}</b>${badge(r.job_status || r.state)}<span class="wmute">${r.local_time ? localText(r.local_time) : "время не выбрано"}${r.timezone ? ` · ${escape(r.timezone)}` : ""}</span></div>
        ${r.wait_reason ? `<div class="wwarn">${escape(reasonText(r.wait_reason))}</div>` : ""}
        <div class="wpa-cap">${r.caption ? escape(r.caption) : '<span class="wmute">подписи пока нет</span>'}</div>
      </div>`).join("") || '<div class="wmute">Ни на один аккаунт не назначено.</div>';
    setDetailsBody(`<div class="wdmedia">${media || '<div class="wmute">Нет превью</div>'}</div>
      <dl class="wdl"><dt>Название</dt><dd>${escape(it.title || "—")}</dd><dt>Тип</dt><dd>${escape(TYPE[it.content_type] || it.content_type)}</dd><dt>Добавлен</dt><dd>${whenIso(it.created_at)}</dd><dt>Заметка для подписи</dt><dd>${it.note ? escape(it.note) : '<span class="wmute">нет</span>'}</dd></dl>
      <div class="wcon-h">По аккаунтам</div>${rows}`);
  } catch (e) {
    setDetailsBody(`<div class="wbad">${escape(e.message || "Ошибка")}</div>`);
  }
}
