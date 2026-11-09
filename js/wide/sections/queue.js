// Очередь: всё, что запланировано, из любого источника, по времени. Здесь же отмена.
import {call, escape} from "../bridge.js";
import {STATUS, TYPE, reasonAction, reasonText} from "../ui/badge.js";
import {confirmDialog, errorOf} from "../ui/dialog.js";
import {noData} from "../ui/empty.js";
import {whenIso} from "../ui/format.js";

const LIVE = ["queued", "claimed", "committed", "sent", "needs_attention", "unknown"];
const WAIT = ["pending_plan", "planning", "scenario_wait", "scenario_expired"];

export function rowsOf(d) {
  const a = (d.rows || []).filter((r) => (r.job_status ? LIVE.includes(r.job_status) : WAIT.includes(r.state)))
    .map((r) => ({key: `a${r.id}`, kind: "assignment", id: r.id, revision: r.revision, editable: r.editable && r.job_status !== "sent", type: r.content_type, account: r.account_name, title: r.title || r.caption || "", run_at: r.run_at, status: r.job_status || r.state, link: r.story_link, wait_reason: r.wait_reason, wait_detail: r.wait_detail, blocking_settings: r.blocking_settings}));
  const o = (d.old_form || []).filter((j) => LIVE.includes(j.job_status))
    .map((j) => ({key: `j${j.job_id}`, kind: "job", id: j.job_id, revision: j.job_revision, editable: j.job_status === "queued", type: j.kind === "warmup_reels" ? "warmup" : j.content_type, account: j.account_name, title: j.caption || "", run_at: j.run_at, status: j.job_status, wait_reason: j.wait_reason, wait_detail: j.wait_detail}));
  return [...a, ...o].sort((x, y) => (x.run_at ? Date.parse(x.run_at) : Infinity) - (y.run_at ? Date.parse(y.run_at) : Infinity));
}

function counts(list) {
  const today = new Date().toDateString();
  const n = {reel: 0, story: 0, carousel: 0};
  for (const r of list) if (r.run_at && new Date(r.run_at).toDateString() === today && r.type in n) n[r.type]++;
  return n;
}

let shown = [];
let kindFilter = "all";
export const filterRows = (list, filter) => list.filter((r) => filter === "all" || (filter === "warmup" ? r.type === "warmup" : ["reel", "story", "carousel"].includes(r.type)));

export default {
  load: () => call("content_schedule_list", {}),
  render(d) {
    const list = filterRows(rowsOf(d), kindFilter);
    shown = list;
    const n = counts(list);
    const tile = (label, v) => `<div class="wkpi wb-mute"><div class="wkpi-v">${v}</div><div class="wkpi-l">${label}</div></div>`;
    const rows = list.map((r) => `<tr>
        <td>${r.run_at ? escape(whenIso(r.run_at)) : '<span class="wmute">время выбирается</span>'}</td>
        <td>${escape(TYPE[r.type] || r.type || "")}</td>
        <td>@${escape(String(r.account || "").replace(/^@/, ""))}</td>
        <td class="wq-t">${escape(r.title)}${r.type === "story" && r.link ? `<div class="wmute">ссылка: ${r.link.enabled ? escape(r.link.text || r.link.url || "") : "нет"}</div>` : ""}${r.wait_reason ? `<div class="wwarn">${escape(reasonText(r.wait_reason))}${r.wait_detail ? `: ${escape(r.wait_detail)}` : ""}</div><div class="wmute">${escape(reasonAction(r.wait_reason, r.blocking_settings))}</div>` : ""}</td>
        <td>${escape((STATUS[r.status] || [r.status])[0])}</td>
        <td>${r.editable ? `<button class="wbtn wbtn-s" data-wqcancel="${r.key}">Отменить</button>` : `<span class="wmute">${r.status === "sent" ? "Отправлено, не подтверждено" : "телефон уже взял"}</span>`}</td>
      </tr>`).join("");
    return `<div class="whead"><h1>Очередь</h1><div class="whead-s">Всё запланированное по времени: из Пула, из папки историй и из старой формы. Отмена здесь.</div></div>
      <div class="wtool"><label>Тип <select data-wqfilter><option value="all"${kindFilter === "all" ? " selected" : ""}>Всё</option><option value="publish"${kindFilter === "publish" ? " selected" : ""}>Заливы</option><option value="warmup"${kindFilter === "warmup" ? " selected" : ""}>Прогрев</option></select></label></div>
      <div class="wkpis">${tile("Reels сегодня", n.reel)}${tile("Истории сегодня", n.story)}${tile("Карусели сегодня", n.carousel)}${tile("Всего в очереди", list.length)}</div>
      ${list.length ? `<section class="wcard wcard-free"><table class="wt"><thead><tr><th>Когда</th><th>Тип</th><th>Аккаунт</th><th>Что</th><th>Статус</th><th></th></tr></thead><tbody>${rows}</tbody></table></section>` : noData("Очередь пуста. Назначь материал в «Материалах» или загрузи фото в «Папку историй».")}`;
  },
  bind(el, ctx) {
    el.querySelector("[data-wqfilter]")?.addEventListener("change", (e) => { kindFilter = e.target.value; ctx.redraw(); });
    const list = shown;
    el.querySelectorAll("[data-wqcancel]").forEach((b) => {
      b.onclick = async () => {
        const r = list.find((x) => x.key === b.dataset.wqcancel);
        if (!r || !r.editable || !(await confirmDialog("Отменить?", `${TYPE[r.type] || ""} на @${r.account}${r.run_at ? `, ${whenIso(r.run_at)}` : ""}.`, {ok: "Отменить", danger: true}))) return;
        try {
          if (r.kind === "assignment") await call("content_assignment_cancel", {id: r.id, revision: r.revision});
          else await call("device_job_cancel", {id: r.id, revision: r.revision});
        } catch (e) { await confirmDialog("Не отменено", errorOf(e), {ok: "Понятно"}); }
        ctx.reload();
      };
    });
  },
};
