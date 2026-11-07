// Правка запланированной публикации: дата и время в поясе аккаунта, подпись, ссылка истории, отмена.
// Всё через content_schedule_update (с revision) и content_assignment_cancel: проверки на сервере.
import {call, escape} from "../bridge.js";
import {confirmDialog, dialog, dialogMessage, errorOf} from "./dialog.js";
import {TYPE} from "./badge.js";

export const LOCKED = {
  taken: "Телефон уже взял задание — менять нельзя.",
  planning: "Планировщик сейчас выбирает время — подожди минуту.",
  cancelled: "Публикация отменена.",
  locked: "Менять нельзя.",
};

/** Кнопки под строкой расписания. Если нельзя — причина рядом. */
export function rowActions(r) {
  if (!r.editable) return `<span class="wlock">🔒 ${escape(LOCKED[r.locked_reason] || LOCKED.locked)}</span>`;
  return `<button class="wbtn wbtn-s" data-wedit="${r.id}">Изменить</button><button class="wbtn wbtn-s wbtn-d" data-wcancel="${r.id}">Отменить</button>`;
}

export function openEditor(r, onDone) {
  const story = r.content_type === "story";
  const link = r.story_link || {};
  const body = `<div class="wform">
    <label class="wf"><span>Дата и время · ${escape(r.edit_timezone || r.timezone || "")}</span><input type="datetime-local" data-f="when" value="${escape(r.edit_local || "")}" step="60"></label>
    ${story ? `
      <label class="wf wf-row"><input type="checkbox" data-f="link_on"${link.wanted ?? link.enabled ? " checked" : ""}><span>Ссылка в истории</span></label>
      <label class="wf"><span>Адрес ссылки (пусто — приглашение аккаунта)</span><input data-f="link_url" value="${escape(link.url_source === "manual" ? link.url || "" : "")}" placeholder="https://"></label>
      <label class="wf"><span>Текст кнопки (пусто — из пула)</span><input data-f="link_text" maxlength="80" value="${escape(link.text || "")}"></label>`
    : `<label class="wf"><span>Подпись</span><textarea data-f="caption" rows="6">${escape(r.caption || "")}</textarea></label>`}
    <p class="wmute">Ручная правка закрепляет значение: «Пересчитать расписание» его не тронет. Нормы и промежутки сервер проверяет только на формат и будущее время.</p>
  </div>`;
  const root = dialog({
    subtitle: `${TYPE[r.content_type] || r.content_type} · @${r.account_name}`.toUpperCase(), title: r.title || `Материал #${r.item_id}`, body,
    actions: [{id: "close", label: "Закрыть"}, {id: "save", label: "Сохранить", primary: true}],
    onAction: async (id, box) => {
      if (id !== "save") return false;
      const f = (n) => box.querySelector(`[data-f="${n}"]`);
      const params = {id: r.id, revision: r.revision};
      const when = f("when").value;
      if (when && when !== (r.edit_local || "")) params.run_at_local = when.slice(0, 16);
      if (!story && f("caption").value !== (r.caption || "")) params.caption = f("caption").value;
      if (story) {
        const on = f("link_on").checked, url = f("link_url").value.trim(), text = f("link_text").value.trim();
        if (on !== !!(link.wanted ?? link.enabled) || url !== (link.url_source === "manual" ? link.url || "" : "") || text !== (link.text || "")) {
          params.story_link = {enabled: on, ...(url ? {url} : {}), ...(text !== (link.text || "") ? {text: text || null} : {})};
        }
      }
      try {
        await call("content_schedule_update", params);
        onDone?.();
        return true;
      } catch (e) {
        dialogMessage(box, errorOf(e));
        if (e.message === "conflict" || e.message === "bad_status") onDone?.();
        return false;
      }
    },
  });
  return root;
}

export async function cancelRow(r, onDone) {
  if (!(await confirmDialog("Отменить публикацию?", `@${r.account_name}: ${r.title || `материал #${r.item_id}`}. Задание уйдёт из очереди.`, {ok: "Отменить публикацию", danger: true}))) return;
  try {
    await call("content_assignment_cancel", {id: r.id, revision: r.revision});
  } catch (e) {
    await confirmDialog("Не отменено", errorOf(e), {ok: "Понятно"});
  }
  onDone?.();
}

/** Подключает кнопки «Изменить» и «Отменить» внутри root к строкам rows. */
export function bindRowActions(root, rows, onDone) {
  root.querySelectorAll("[data-wedit]").forEach((b) => { b.onclick = (e) => { e.stopPropagation(); const r = rows.find((x) => String(x.id) === b.dataset.wedit); if (r) openEditor(r, onDone); }; });
  root.querySelectorAll("[data-wcancel]").forEach((b) => { b.onclick = (e) => { e.stopPropagation(); const r = rows.find((x) => String(x.id) === b.dataset.wcancel); if (r) cancelRow(r, onDone); }; });
}
