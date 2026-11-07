// Панель деталей справа поверх колонки аккаунтов. Закрывается крестиком и Esc.
import {escape} from "../bridge.js";

let current = null; // {key, onClose}

export const detailsKey = () => current?.key ?? null;

export function openDetails(key, {title, subtitle = "", body, onClose} = {}) {
  const root = document.getElementById("wdetails");
  if (!root) return null;
  if (current && current.key !== key) current.onClose?.();
  current = {key, onClose};
  root.innerHTML = `<div class="wdh"><div><div class="wdh-s">${escape(subtitle)}</div><div class="wdh-t">${escape(title)}</div></div><button class="wx" data-wclose aria-label="Закрыть">✕</button></div><div class="wdb" id="wdbody">${body}</div>`;
  root.classList.add("show");
  root.querySelector("[data-wclose]").onclick = closeDetails;
  return root.querySelector("#wdbody");
}

export function setDetailsBody(html) {
  const b = document.getElementById("wdbody");
  if (b) b.innerHTML = html;
  return b;
}

export function closeDetails() {
  const root = document.getElementById("wdetails");
  current?.onClose?.();
  current = null;
  if (root) { root.classList.remove("show"); root.innerHTML = ""; }
}

document.addEventListener("keydown", (e) => { if (e.key === "Escape" && current) closeDetails(); });
