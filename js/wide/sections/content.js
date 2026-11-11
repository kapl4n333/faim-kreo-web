// Контент: пул материалов. По умолчанию список: у материала сводка по аккаунтам (вышло, в плане, ошибки), клик — разбивка
// по аккаунтам справа. «Таблица» — прежняя матрица «материалы × аккаунты», когда аккаунтов немного.
// Назначение и снятие — через content_assign / content_assignment_cancel: дубли, права и «взято телефоном» проверяет сервер.
import {call, escape, legacy} from "../bridge.js";
import {badge, reasonText, STATUS, TYPE} from "../ui/badge.js";
import {confirmDialog, dialog, dialogMessage, errorOf} from "../ui/dialog.js";
import {openDetails, setDetailsBody} from "../ui/details.js";
import {noData} from "../ui/empty.js";
import {ago, localText, whenIso} from "../ui/format.js";
import {bindRowActions, rowActions} from "../ui/schedule-edit.js";
import {bindToolbar, toolbar} from "../ui/table.js";
import {openMenu} from "../ui/tree.js";

const view = {content_type: "", status: "active", show: "", target: "", period: "", q: "", mode: "list", all: false};
try { const m = localStorage.getItem("wcontent.mode"); if (m === "table" || m === "list") view.mode = m; } catch { /* без памяти браузера */ }
const picked = new Set();
const OUTCOME = {created: "назначено", duplicate: "уже было — не назначено", bad_item: "материал не активен", bad_type: "тип не подходит аккаунту", bad_account: "аккаунт недоступен", no_phone: "у аккаунта нет телефона", forbidden: "нет прав"};

function periodRange(p) {
  const days = {d7: 7, d30: 30, d90: 90}[p];
  return days ? {from: new Date(Date.now() - days * 86400000).toISOString()} : {};
}

const pad = (n) => String(n).padStart(2, "0");
const shortWhen = (iso) => { const d = new Date(iso); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };

function cellHtml(cell, item, account) {
  const [label, tone] = STATUS[cell.state] || ["?", "mute"];
  const when = cell.run_at ? whenIso(cell.run_at) : "";
  const tip = [label, when, reasonText(cell.wait_reason || cell.reason), cell.job_status ? `задание: ${(STATUS[cell.job_status] || [cell.job_status])[0]}` : "", cell.state === "empty" ? "клик — назначить" : ""].filter(Boolean).join(" · ");
  const text = cell.state === "empty" ? "" : (cell.state === "scheduled" || cell.state === "published") && cell.run_at ? shortWhen(cell.run_at) : label;
  return `<td class="wcell wc-${cell.state} wb-${tone}" data-wcell="${item.id}:${account.id}" title="${escape(tip)}"><span>${escape(text)}</span></td>`;
}

async function assignPairs(ctx, itemIds, accountIds, confirm = []) {
  const {results} = await call("content_assign", {item_ids: itemIds, account_ids: accountIds, confirm_repeat_pairs: confirm});
  return results;
}

/** Назначение одной пары: дубль — только после явного «Да». */
async function assignOne(ctx, itemId, accountId) {
  try {
    let [r] = await assignPairs(ctx, [itemId], [accountId]);
    if (r.outcome === "duplicate") {
      const prev = (r.prior?.jobs || []).map((j) => `задание #${j.id}: ${(STATUS[j.status] || [j.status])[0]}${j.at ? `, ${whenIso(j.at)}` : ""}`).concat((r.prior?.assignments || []).map((a) => `назначение #${a.id}: ${(STATUS[a.state] || [a.state])[0]}`));
      if (!(await confirmDialog("Этот файл уже был на аккаунте", `${prev.join("; ")}. Назначить ещё раз как повтор?`, {ok: "Да, повторить"}))) return;
      [r] = await assignPairs(ctx, [itemId], [accountId], [{item_id: itemId, account_id: accountId}]);
    }
    if (r.outcome !== "created") await confirmDialog("Не назначено", OUTCOME[r.outcome] || r.outcome, {ok: "Понятно"});
  } catch (e) {
    await confirmDialog("Не назначено", errorOf(e), {ok: "Понятно"});
  }
  ctx.reload();
}

async function cancelOne(ctx, cell, item, account) {
  if (!(await confirmDialog("Снять назначение?", `«${item.title || `#${item.id}`}» с @${account.account_name}.`, {ok: "Снять", danger: true}))) return;
  try { await call("content_assignment_cancel", {id: cell.assignment_id}); } catch (e) { await confirmDialog("Не снято", errorOf(e), {ok: "Понятно"}); }
  ctx.reload();
}

/** Аккаунты, куда вообще можно поставить материал: есть телефон, это не Threads. view.all — показать всех. */
const usable = (accounts) => accounts.filter((a) => view.all || (a.phone && a.platform !== "threads"));

/** Аккаунты по кластерам: [{key, name, accounts}], «Без кластера» в конце. */
function byCluster(accounts) {
  const groups = new Map();
  for (const a of accounts) {
    const key = a.cluster ? `c:${a.cluster.id}` : "none";
    if (!groups.has(key)) groups.set(key, {key, name: a.cluster ? a.cluster.name : "Без кластера", accounts: []});
    groups.get(key).accounts.push(a);
  }
  return [...groups.values()].sort((x, y) => (x.key === "none") - (y.key === "none") || x.name.localeCompare(y.name));
}

/** Сколько клеток в каком состоянии у материала по этим аккаунтам. */
export function summaryOf(item, accounts) {
  const n = {published: 0, scheduled: 0, waiting: 0, taken: 0, failed: 0, empty: 0, total: 0};
  for (const a of accounts) {
    const st = item.cells[a.id]?.state || "blocked";
    if (st === "blocked") continue;
    n.total++;
    if (st in n) n[st]++;
  }
  return n;
}

const PARTS = [["published", "вышло", "ok"], ["taken", "публикуется", "accent"], ["scheduled", "в плане", "info"], ["waiting", "ждёт плана", "warn"], ["failed", "ошибка", "bad"], ["empty", "не назначено", "mute"]];

function summaryHtml(n) {
  if (!n.total) return '<span class="wmute">некуда ставить</span>';
  const bar = PARTS.filter(([k]) => n[k]).map(([k, , tone]) => `<i class="wb-${tone}" style="flex:${n[k]}"></i>`).join("");
  const chips = PARTS.filter(([k]) => n[k]).map(([k, label, tone]) => `<span class="wci-n wb-${tone}"><b>${n[k]}</b> ${label}</span>`).join("");
  return `<div class="wci-bar">${bar}</div><div class="wci-chips">${chips}<span class="wmute">из ${n.total}</span></div>`;
}

/** Назначить или снять: аккаунты сгруппированы по кластерам, кластер отмечается целиком. */
function bulkDialog(ctx, d, mode, ids = [...picked]) {
  const accounts = mode === "cancel" ? d.accounts : usable(d.accounts).filter((a) => a.phone);
  const stateOf = (a) => {
    if (ids.length !== 1) return "";
    const st = d.items.find((i) => i.id === ids[0])?.cells[a.id]?.state;
    return st && st !== "empty" && st !== "blocked" ? (STATUS[st] || [st])[0] : "";
  };
  const groups = byCluster(accounts).map((g) => `<div class="wdg"><label class="wdg-h"><input type="checkbox" data-wgroup="${escape(g.key)}"> <b>${escape(g.name)}</b> <span class="wmute">${g.accounts.length}</span></label>
    <div class="wchecks">${g.accounts.map((a) => { const now = stateOf(a); return `<label><input type="checkbox" value="${a.id}" data-wg="${escape(g.key)}"${now && mode === "assign" ? " disabled" : ""}> @${escape(a.account_name)}<small>${escape(now || (a.phone ? a.phone.name : "нет телефона"))}</small></label>`; }).join("")}</div></div>`).join("");
  const body = `<p class="wdlg-p">Материалов: ${ids.length}. Отметь кластер целиком или отдельные аккаунты.</p>${groups || '<p class="wmute">Нет аккаунтов с телефоном.</p>'}<div data-wres class="wres"></div>`;
  dialog({
    subtitle: ids.length === 1 ? `#${ids[0]}` : "МАССОВО", title: mode === "assign" ? "Назначить" : "Снять назначение", body, wide: true,
    actions: [{id: "close", label: "Закрыть"}, {id: "go", label: mode === "assign" ? "Назначить" : "Снять", primary: mode === "assign", danger: mode === "cancel"}],
    onAction: async (id, box) => {
      if (id !== "go") return false;
      const accIds = [...box.querySelectorAll(".wchecks input:checked")].map((i) => Number(i.value));
      if (!accIds.length) { dialogMessage(box, "Выбери аккаунты."); return false; }
      const out = box.querySelector("[data-wres]");
      try {
        if (mode === "assign") {
          const results = await assignPairs(ctx, ids, accIds);
          const made = results.filter((r) => r.outcome === "created").length, dup = results.filter((r) => r.outcome === "duplicate").length;
          const bad = results.filter((r) => r.outcome !== "created" && r.outcome !== "duplicate");
          out.innerHTML = `<div>Назначено: <b class="wok">${made}</b>${dup ? ` · уже было, пропущено: ${dup}` : ""}</div>`
            + bad.map((r) => `<div>#${r.item_id} → @${escape(d.accounts.find((a) => a.id === r.account_id)?.account_name || r.account_id)}: <b class="wbad">${escape(OUTCOME[r.outcome] || r.outcome)}</b></div>`).join("")
            + (dup ? '<p class="wmute">Повтор того же файла на аккаунт — в таблице, по одной клетке, с подтверждением.</p>' : "");
        } else {
          let done = 0, skipped = 0;
          for (const itemId of ids) {
            const item = d.items.find((i) => i.id === itemId);
            for (const a of accIds) {
              const cell = item?.cells[a];
              if (!cell?.assignment_id || !["waiting", "scheduled"].includes(cell.state)) continue;
              try { await call("content_assignment_cancel", {id: cell.assignment_id}); done++; } catch { skipped++; }
            }
          }
          out.innerHTML = `<div>Снято: <b>${done}</b>${skipped ? `, не снято (уже взято телефоном или изменилось): ${skipped}` : ""}.</div>`;
        }
        picked.clear();
        ctx.reload();
      } catch (e) { dialogMessage(box, errorOf(e)); }
      return false;
    },
  });
  document.querySelectorAll("[data-wgroup]").forEach((g) => {
    g.onchange = () => document.querySelectorAll(`[data-wg="${CSS.escape(g.dataset.wgroup)}"]`).forEach((cb) => { if (!cb.disabled) cb.checked = g.checked; });
  });
}

async function archive(ctx) {
  if (!(await confirmDialog("В архив?", `Материалов: ${picked.size}. Уже идущие задания доработают.`, {ok: "В архив"}))) return;
  for (const id of picked) { try { await call(view.status === "archived" ? "content_item_restore" : "content_item_archive", {id}); } catch { /* показано ниже общим обновлением */ } }
  picked.clear();
  ctx.reload();
}

function listHtml(items, accounts) {
  const all = items.length && items.every((i) => picked.has(i.id));
  return `<div class="wci-list"><label class="wci-all"><input type="checkbox" data-wpickall${all ? " checked" : ""}> Выбрать все на странице</label>
    ${items.map((i) => `<div class="wci${picked.has(i.id) ? " on" : ""}" data-wrow="${i.id}">
      <input type="checkbox" data-wpick="${i.id}"${picked.has(i.id) ? " checked" : ""}>
      ${i.poster_url ? `<img src="${escape(i.poster_url)}" alt="" loading="lazy">` : '<span class="wm-noimg"></span>'}
      <div class="wci-t" data-wopenitem="${i.id}"><b>${escape(i.title || "Без названия")}</b><div class="wmute">#${i.id} · ${escape(TYPE[i.content_type] || i.content_type)}${i.pool ? " · папка" : ""} · ${ago(i.created_at)}${i.media_count > 1 ? ` · файлов ${i.media_count}` : ""}</div></div>
      <div class="wci-s" data-wopenitem="${i.id}">${summaryHtml(summaryOf(i, accounts))}</div>
      <div class="wci-a"><button class="wbtn wbtn-s wbtn-p" data-wassign="${i.id}">Назначить</button><button class="wbtn wbtn-s" data-wopenitem="${i.id}">Подробно</button></div>
    </div>`).join("")}</div>`;
}

function tableHtml(items, accounts) {
  const all = items.every((i) => picked.has(i.id));
  const head = `<tr><th class="wm-item"><label class="wm-pick"><input type="checkbox" data-wpickall${all ? " checked" : ""}> Материал</label></th><th class="wm-type">Тип</th>${accounts.map((a) => `<th class="wm-acc" title="${escape(a.phone ? a.phone.name : "нет телефона")}"><div>@${escape(a.account_name)}</div><small>${escape(a.cluster ? a.cluster.name : a.phone ? a.phone.name : "нет телефона")}</small></th>`).join("")}</tr>`;
  const rows = items.map((i) => `<tr data-witem="${i.id}"><th class="wm-item"><div class="wm-it"><input type="checkbox" data-wpick="${i.id}"${picked.has(i.id) ? " checked" : ""}>${i.poster_url ? `<img src="${escape(i.poster_url)}" alt="" loading="lazy">` : '<span class="wm-noimg"></span>'}<div data-wopenitem="${i.id}"><div class="wm-t">${escape(i.title || "Без названия")}</div><div class="wmute">#${i.id} · ${ago(i.created_at)}${i.media_count > 1 ? ` · файлов ${i.media_count}` : ""}</div></div></div></th><td class="wm-type">${escape(TYPE[i.content_type] || i.content_type)}${i.pool ? " · папка" : ""}</td>${accounts.map((a) => cellHtml(i.cells[a.id] || {state: "blocked"}, i, a)).join("")}</tr>`).join("");
  const legend = ["empty", "waiting", "scheduled", "taken", "published", "failed", "blocked"].map((s) => `<span class="wleg wc-${s} wb-${(STATUS[s] || [0, "mute"])[1]}"><i></i>${escape(s === "empty" ? "Не назначено" : STATUS[s][0])}</span>`).join("");
  return `<div class="wlegend">${legend}</div><div class="wpanel wmatrix-wrap"><table class="wmatrix"><thead>${head}</thead><tbody>${rows}</tbody></table></div>`;
}

/** Фильтр «Показать» по сводке материала. */
function shows(item, accounts) {
  const n = summaryOf(item, accounts);
  switch (view.show) {
    case "failed": return n.failed > 0;
    case "nowhere": return n.total > 0 && n.empty === n.total;
    case "partial": return n.empty > 0;
    case "planned": return n.scheduled + n.waiting + n.taken > 0;
    case "done": return n.total > 0 && n.published === n.total;
    default: return true;
  }
}

export default {
  load: () => call("content_matrix", {
    content_type: view.content_type || undefined, status: view.status, limit: 100,
    account_ids: view.target.startsWith("a:") ? [Number(view.target.slice(2))] : undefined, ...periodRange(view.period),
  }),
  render(d) {
    const q = view.q.trim().toLowerCase();
    for (const id of [...picked]) if (!d.items.some((i) => i.id === id)) picked.delete(id);
    let accounts = usable(d.accounts);
    if (view.target.startsWith("c:")) accounts = accounts.filter((a) => a.cluster && `c:${a.cluster.id}` === view.target);
    const items = d.items.filter((i) => (!q || (i.title || "").toLowerCase().includes(q) || String(i.id) === q) && shows(i, accounts));
    const clusters = byCluster(usable(d.accounts)).filter((g) => g.key !== "none");
    const sel = picked.size;
    const tool = toolbar({
      search: {id: "q", placeholder: "Название или номер", value: view.q},
      filters: [
        {id: "content_type", label: "Тип", value: view.content_type, options: [["", "Все"], ["reel", "Reels"], ["carousel", "Карусели"], ["story", "Истории"], ["story_pool", "Папка историй"]]},
        {id: "show", label: "Показать", value: view.show, options: [["", "Все"], ["failed", "Есть ошибки"], ["nowhere", "Нигде не стоит"], ["partial", "Не на всех"], ["planned", "В плане"], ["done", "Вышло везде"]]},
        {id: "target", label: "Где", value: view.target, options: [["", "Все аккаунты"], ...clusters.map((g) => [g.key, `Кластер: ${g.name}`]), ...usable(d.accounts).map((a) => [`a:${a.id}`, "@" + a.account_name])]},
        {id: "period", label: "Добавлены", value: view.period, options: [["", "За всё время"], ["d7", "7 дней"], ["d30", "30 дней"], ["d90", "90 дней"]]},
        {id: "status", label: "Пул", value: view.status, options: [["active", "Активные"], ["archived", "Архив"]]},
      ],
    });
    const hidden = d.accounts.length - usable(d.accounts).length;
    const actions = `<div class="wtool">
        <div class="wrq-seg"><button class="wbtn${view.mode === "list" ? " wbtn-p" : ""}" data-wmode="list">Список</button><button class="wbtn${view.mode === "table" ? " wbtn-p" : ""}" data-wmode="table">Таблица</button></div>
        ${hidden || view.all ? `<button class="wbtn${view.all ? " wbtn-p" : ""}" data-wallacc title="Аккаунты без телефона и Threads">${view.all ? "Показаны все аккаунты" : `Скрыто аккаунтов: ${hidden}`}</button>` : ""}
        <div class="wtool-sp"></div><span class="wmute">${sel ? `выбрано ${sel}` : ""}</span>
        <button class="wbtn" data-wbulk="assign"${sel ? "" : " disabled"}>Назначить выбранное</button>
        <button class="wbtn" data-wbulk="cancel"${sel ? "" : " disabled"}>Снять</button>
        <button class="wbtn" data-wbulk="archive"${sel ? "" : " disabled"}>${view.status === "archived" ? "Вернуть из архива" : "В архив"}</button>
        <button class="wbtn wbtn-p" data-wupload>+ Загрузить</button></div>`;
    const head = `<div class="whead"><h1>Контент</h1><div class="whead-s">Материалов ${items.length}${d.next_before_id ? "+" : ""} · аккаунтов ${accounts.length}</div></div>`;
    if (!items.length) return `${head}${tool}${actions}${noData("Нет материалов под эти фильтры.")}`;
    return `${head}${tool}${actions}${view.mode === "table" ? tableHtml(items, accounts) : listHtml(items, accounts)}`;
  },
  bind(root, ctx) {
    const d = ctx.data;
    // Поиск, «Показать» и кластер считаются на месте; аккаунт, тип, период и пул — новый запрос.
    bindToolbar(root, (id, value) => {
      const local = id === "q" || id === "show" || (id === "target" && !value.startsWith("a:") && !view.target.startsWith("a:"));
      view[id] = value;
      if (local) ctx.redraw(); else ctx.reload();
    });
    root.querySelectorAll("[data-wmode]").forEach((b) => { b.onclick = () => { view.mode = b.dataset.wmode; try { localStorage.setItem("wcontent.mode", view.mode); } catch { /* ничего */ } ctx.redraw(); }; });
    const allAcc = root.querySelector("[data-wallacc]");
    if (allAcc) allAcc.onclick = () => { view.all = !view.all; ctx.redraw(); };
    root.querySelectorAll("[data-wopenitem]").forEach((el) => { el.onclick = () => openItem(ctx, Number(el.dataset.wopenitem)); });
    root.querySelectorAll("[data-wassign]").forEach((b) => { b.onclick = () => bulkDialog(ctx, d, "assign", [Number(b.dataset.wassign)]); });
    root.querySelectorAll("[data-wpick]").forEach((cb) => { cb.onchange = () => { const id = Number(cb.dataset.wpick); cb.checked ? picked.add(id) : picked.delete(id); ctx.redraw(); }; });
    const all = root.querySelector("[data-wpickall]");
    if (all) all.onchange = () => { root.querySelectorAll("[data-wpick]").forEach((cb) => { const id = Number(cb.dataset.wpick); all.checked ? picked.add(id) : picked.delete(id); }); ctx.redraw(); };
    root.querySelectorAll("[data-wbulk]").forEach((b) => { b.onclick = () => (b.dataset.wbulk === "archive" ? archive(ctx) : bulkDialog(ctx, d, b.dataset.wbulk)); });
    const up = root.querySelector("[data-wupload]");
    if (up) up.onclick = () => legacy.openAddItem(() => ctx.reload());
    root.querySelectorAll("[data-wcell]").forEach((td) => {
      td.onclick = (e) => {
        e.stopPropagation();
        const [itemId, accountId] = td.dataset.wcell.split(":").map(Number);
        const item = d.items.find((i) => i.id === itemId), account = d.accounts.find((a) => a.id === accountId);
        const cell = item?.cells[accountId];
        if (!item || !account || !cell) return;
        if (cell.state === "empty") return assignOne(ctx, itemId, accountId);
        if (cell.state === "waiting" || cell.state === "scheduled") {
          return openMenu(td, [
            {label: "Изменить время и подпись", onClick: () => openItem(ctx, itemId, accountId)},
            {label: "Снять назначение", onClick: () => cancelOne(ctx, cell, item, account)},
            {label: "Открыть материал", onClick: () => openItem(ctx, itemId, accountId)},
          ]);
        }
        openItem(ctx, itemId, accountId);
      };
    });
  },
};

async function openItem(ctx, id, accountId = null) {
  openDetails(`item:${id}`, {subtitle: "МАТЕРИАЛ", title: `#${id}`, body: '<div class="wempty"><div class="spin"></div></div>'});
  try {
    const d = await call("content_item_detail", {id});
    const it = d.item;
    const media = it.media.map((m) => (m.media_kind === "video" ? `<video src="${escape(m.url)}" muted controls preload="metadata"></video>` : `<img src="${escape(m.url)}" alt="">`)).join("");
    const rows = d.per_account.map((r) => `<div class="wpa${accountId && r.account_id === accountId ? " on" : ""}">
        <div class="wpa-1"><b>@${escape(r.account_name)}</b>${badge(r.job_status || r.state)}<span class="wmute">${r.edit_local ? localText(r.edit_local) : "время не выбрано"}${r.edit_timezone ? ` · ${escape(r.edit_timezone)}` : ""}</span></div>
        ${r.wait_reason ? `<div class="wwarn">${escape(reasonText(r.wait_reason))}</div>` : ""}
        <div class="wpa-cap">${r.caption ? escape(r.caption) : r.content_type === "story" ? `<span class="wmute">история: ссылка ${r.story_link?.enabled ? "есть" : "нет"}</span>` : '<span class="wmute">подписи пока нет</span>'}</div>
        <div class="wpa-act">${rowActions(r)}</div>
      </div>`).join("") || '<div class="wmute">Ни на один аккаунт не назначено.</div>';
    const body = setDetailsBody(`<div class="wdmedia">${media || '<div class="wmute">Нет превью</div>'}</div>
      <dl class="wdl"><dt>Название</dt><dd>${escape(it.title || "—")}</dd><dt>Тип</dt><dd>${escape(TYPE[it.content_type] || it.content_type)}</dd><dt>Добавлен</dt><dd>${whenIso(it.created_at)}</dd><dt>Заметка для подписи</dt><dd>${it.note ? escape(it.note) : '<span class="wmute">нет</span>'}</dd></dl>
      <div class="wcon-h">По аккаунтам</div>${rows}`);
    bindRowActions(body, d.per_account, () => { openItem(ctx, id, accountId); ctx.reload(); });
    const mine = accountId && d.per_account.find((r) => r.account_id === accountId && r.editable);
    if (mine) body.querySelector(`[data-wedit="${mine.id}"]`)?.scrollIntoView({block: "center"});
  } catch (e) {
    setDetailsBody(`<div class="wbad">${escape(errorOf(e))}</div>`);
  }
}
