// Дерево со столбцами: раскрытие групп, статус, «+» на уровне, меню «⋮».
// node: {key, cells: [html...], children?: [node], add?: {label, disabled, title}, menu?: [{label, act, disabled}], attr?}
import {escape} from "../bridge.js";

// Отозванные ПК по умолчанию свёрнуты: это архив, а не рабочие устройства.
const open = new Map([["revoked-workers", false]]);
export const isOpen = (key, byDefault = true) => (open.has(key) ? open.get(key) : byDefault);

export function tree(columns, nodes, {selected = null} = {}) {
  const out = [];
  const walk = (node, depth) => {
    const kids = node.children || [];
    const has = kids.length > 0 || !!node.add;
    const expanded = has && isOpen(node.key);
    const toggle = has ? `<button class="wtg" data-wtoggle="${escape(node.key)}" aria-label="${expanded ? "Свернуть" : "Раскрыть"}">${expanded ? "▾" : "▸"}</button>` : '<span class="wtg-sp"></span>';
    const menu = node.menu?.length ? `<button class="wkebab" data-wmenu="${escape(node.key)}" aria-label="Меню">⋮</button>` : "";
    const cells = node.cells.map((c, i) => (i === 0 ? `<td><div class="wtn" style="padding-left:${depth * 20}px">${toggle}${c}</div></td>` : `<td>${c}</td>`)).join("");
    out.push(`<tr class="wtr d${depth}${selected === node.key ? " on" : ""}" data-wnode="${escape(node.key)}" ${node.attr || ""}>${cells}<td class="a-right">${menu}</td></tr>`);
    if (!expanded) return;
    for (const kid of kids) walk(kid, depth + 1);
    if (node.add) {
      const dis = node.add.disabled ? " disabled" : "";
      out.push(`<tr class="wtr wadd d${depth + 1}"><td colspan="${columns.length + 1}"><div class="wtn" style="padding-left:${(depth + 1) * 20}px"><span class="wtg-sp"></span><button class="wlink" data-wadd="${escape(node.key)}"${dis}${node.add.title ? ` title="${escape(node.add.title)}"` : ""}>+ ${escape(node.add.label)}</button></div></td></tr>`);
    }
  };
  for (const n of nodes) walk(n, 0);
  const head = columns.map((c) => `<th${c.width ? ` style="width:${c.width}"` : ""}>${escape(c.label)}</th>`).join("") + '<th style="width:36px"></th>';
  return `<table class="wt wtree"><thead><tr>${head}</tr></thead><tbody>${out.join("")}</tbody></table>`;
}

export function bindTree(root, {redraw, onSelect, menus}) {
  root.querySelectorAll("[data-wtoggle]").forEach((b) => {
    b.onclick = (e) => { e.stopPropagation(); const k = b.dataset.wtoggle; open.set(k, !isOpen(k)); redraw(); };
  });
  root.querySelectorAll("tr[data-wnode]").forEach((tr) => { tr.onclick = () => onSelect?.(tr.dataset.wnode); });
  root.querySelectorAll("[data-wmenu]").forEach((b) => {
    b.onclick = (e) => { e.stopPropagation(); openMenu(b, menus?.(b.dataset.wmenu) || []); };
  });
}

let menuEl = null;
export const menuOpen = () => !!menuEl;
export function closeMenu() { menuEl?.remove(); menuEl = null; }

/** Меню «⋮»: items [{label, onClick, disabled, title}]. Пока меню открыто, опрос не перерисовывает экран. */
export function openMenu(anchor, items) {
  closeMenu();
  if (!items.length) return;
  menuEl = document.createElement("div");
  menuEl.className = "wmenu";
  menuEl.innerHTML = items.map((it, i) => `<button data-i="${i}"${it.disabled ? " disabled" : ""}${it.title ? ` title="${escape(it.title)}"` : ""}>${escape(it.label)}</button>`).join("");
  document.body.appendChild(menuEl);
  const r = anchor.getBoundingClientRect();
  menuEl.style.top = `${Math.min(window.innerHeight - menuEl.offsetHeight - 8, r.bottom + 4)}px`;
  menuEl.style.left = `${Math.max(8, r.right - menuEl.offsetWidth)}px`;
  menuEl.querySelectorAll("button").forEach((b) => { b.onclick = (e) => { e.stopPropagation(); const it = items[+b.dataset.i]; closeMenu(); it.onClick?.(); }; });
  setTimeout(() => document.addEventListener("click", closeMenu, {once: true}), 0);
}
