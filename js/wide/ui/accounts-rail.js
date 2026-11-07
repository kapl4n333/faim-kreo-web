// Правая колонка аккаунтов: общая для всех разделов. Данные: account_list.
import {escape} from "../bridge.js";
import {dot, reasonText, STATUS} from "./badge.js";
import {ago} from "./format.js";

const FILTERS = [["", "Все"], ["working", "Работают"], ["attention", "Внимание"], ["paused", "Пауза"], ["no_phone", "Без телефона"]];
const view = {q: "", status: ""};

const EVENT = {claimed: "взято", committed: "разрешение", needs_attention: "нужно решение", confirmed: "подтверждено", cancelled: "отменено", retried: "повтор", missed: "пропущено", unknown: "неизвестно",
  created: "создано", edited: "изменено", replanned: "перепланировано", evidence: "снимок экрана", attention_cleared: "продолжено",
  resolved_cancel: "отменено человеком", resolved_not_published: "возвращено в очередь", resolved_published: "отмечено вышедшим",
  result_needs_attention: "ПК: нужно решение", result_sent: "ПК: отправлено", result_failed: "ПК: ошибка", result_done: "ПК: готово"};
export const eventLabel = (type) => EVENT[type] || String(type || "").replace(/_/g, " ");

export function railHtml(accounts, selectedId) {
  if (!accounts) return '<div class="wrail-h">Аккаунты</div><div class="wempty"><div class="spin"></div></div>';
  const q = view.q.trim().toLowerCase();
  const counts = Object.fromEntries(FILTERS.map(([k]) => [k, k ? accounts.filter((a) => a.status === k).length : accounts.length]));
  const list = accounts.filter((a) => (!view.status || a.status === view.status) && (!q || a.account_name.toLowerCase().includes(q) || (a.phone?.name || "").toLowerCase().includes(q)));
  const chips = FILTERS.map(([k, l]) => `<button class="wchip${view.status === k ? " on" : ""}" data-wrailf="${k}">${l}<b>${counts[k]}</b></button>`).join("");
  const rows = list.map((a) => `<button class="wacc${String(selectedId) === String(a.id) ? " on" : ""}" data-wacc="${a.id}" title="${escape(reasonText(a.status_reason) || (STATUS[a.status] || [""])[0])}">
      <div class="wacc-1">${dot(a.status)}<span class="wacc-n">@${escape(a.account_name)}</span><span class="wacc-p">${a.phone ? escape(a.phone.name) : "нет телефона"}</span></div>
      <div class="wacc-2">${a.last_action ? `${escape(eventLabel(a.last_action.type))} · ${ago(a.last_action.at)}` : "действий не было"}</div>
    </button>`).join("") || '<div class="wempty-t">Ничего не найдено</div>';
  return `<div class="wrail-h">Аккаунты <span>${accounts.length}</span></div>
    <input class="winput" type="search" placeholder="Ник или телефон" value="${escape(view.q)}" data-wrailq>
    <div class="wchips">${chips}</div>
    <div class="wrail-list">${rows}</div>`;
}

export function bindRail(root, {redraw, onOpen}) {
  const input = root.querySelector("[data-wrailq]");
  if (input) {
    let t = null;
    input.oninput = () => { clearTimeout(t); t = setTimeout(() => { view.q = input.value; redraw(); }, 150); };
  }
  root.querySelectorAll("[data-wrailf]").forEach((b) => { b.onclick = () => { view.status = b.dataset.wrailf; redraw(); }; });
  root.querySelectorAll("[data-wacc]").forEach((b) => { b.onclick = () => onOpen(Number(b.dataset.wacc)); });
}
