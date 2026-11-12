// Сессии Threads (лента и поиск): лайки, ответы и их тексты. Общая разметка для дашборда и карточки аккаунта.
// Раскрыта только последняя сессия; что человек раскрыл или свернул сам, помнится между перерисовками (по job_id).
import {escape} from "../bridge.js";
import {ago, num} from "./format.js";

const opened = new Map(); // job_id → true/false, выбор человека

export function threadsActivity(list, {withAccount = false} = {}) {
  if (!list?.length) return '<div class="wempty-t">Сессий Threads ещё не было</div>';
  return `<div class="wthr">${list.map((t, i) => {
    const open = opened.has(t.job_id) ? opened.get(t.job_id) : i === 0;
    const what = t.mode === "search" ? `поиск «${escape(t.query || "")}»` : "лента";
    return `<details class="wthr-s" data-wthr="${escape(t.job_id)}"${open ? " open" : ""}><summary>${withAccount ? `<b>@${escape(t.account_name)}</b> · ` : ""}${what} · <span class="wmute">${ago(t.at)}</span>
      <span class="wthr-n">♥ ${num(t.likes)} · ответов ${num(t.replies)}${t.replies_failed ? ` · <span class="wbad">не вышло ${num(t.replies_failed)}</span>` : ""} · постов ${num(t.posts_seen)}</span></summary>
      ${t.replied?.length ? t.replied.map((r) => `<div class="wthr-r"><div class="wmute">@${escape(r.author || "?")}: «${escape(r.post || "")}»</div><div>→ ${escape(r.text || "")}</div></div>`).join("") : '<div class="wmute">Ответов не было</div>'}</details>`;
  }).join("")}</div>`;
}

export function bindThreadsActivity(root) {
  root.querySelectorAll("[data-wthr]").forEach((d) => { d.addEventListener("toggle", () => opened.set(Number(d.dataset.wthr), d.open)); });
}
