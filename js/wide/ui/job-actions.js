// Решения по заданию прямо в строке: «Вернуть в очередь», «Отменить», «Опубликовано», «Повторить».
// Те же действия, что в боте и старом виде; сервер проверяет права и ревизию.
import {call, escape} from "../bridge.js";
import {confirmDialog, errorOf} from "./dialog.js";

const ATTENTION = ["needs_attention", "unknown"];
const RETRY = ["failed", "missed"];

/** Кнопки для задания в его статусе. Пусто, если решать нечего или нет ревизии. */
export function jobButtons(j) {
  if (!j || j.revision == null) return "";
  const b = (act, label, cls = "") => `<button class="wbtn wbtn-s${cls}" data-wjob="${act}" data-id="${escape(j.id)}" data-rev="${escape(j.revision)}">${label}</button>`;
  if (j.kind === "warmup_reels" && ATTENTION.includes(j.status)) return `<span class="wjobacts">${b("cancel", "Отменить", " wbtn-d")}</span>`;
  if (j.kind === "warmup_reels" && RETRY.includes(j.status)) return "";
  if (ATTENTION.includes(j.status)) return `<span class="wjobacts">${b("not_published", "↻ В очередь")}${b("cancel", "Отменить", " wbtn-d")}${b("published", "Вышло")}</span>`;
  if (j.status === "queued") return `<span class="wjobacts">${b("cancel_job", "Отменить", " wbtn-d")}</span>`;
  if (RETRY.includes(j.status)) return `<span class="wjobacts">${b("retry", "Повторить")}</span>`;
  return "";
}

const ASK = {
  not_published: ["Вернуть в очередь?", "Пост не вышел: задание выполнится заново сразу, как телефон свободен. Проверь профиль, чтобы не было дубля.", "Вернуть"],
  cancel: ["Отменить задание?", "Задание и его назначение в пуле будут отменены. Материал можно назначить заново.", "Отменить"],
  cancel_job: ["Отменить задание?", "Оно не выполнится. Назначение в пуле тоже снимется.", "Отменить"],
  published: ["Отметить как вышедшее?", "Используй, если пост на самом деле опубликован.", "Вышло"],
  retry: ["Повторить задание?", "Задание встанет в очередь заново.", "Повторить"],
};

async function act(name, id, revision) {
  if (name === "cancel_job") return call("device_job_cancel", {id, revision});
  if (name === "retry") return call("device_job_retry", {id, revision});
  return call("device_job_resolve", {id, revision, decision: name});
}

/** Вешает обработчики на кнопки из jobButtons внутри root. После успеха вызывает done(). */
export function bindJobButtons(root, done) {
  root.querySelectorAll("[data-wjob]").forEach((btn) => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const name = btn.dataset.wjob;
      const [title, text, ok] = ASK[name] || ["Точно?", "", "Да"];
      if (!(await confirmDialog(title, text, {ok, danger: name.startsWith("cancel")}))) return;
      btn.disabled = true;
      try {
        await act(name, Number(btn.dataset.id), Number(btn.dataset.rev));
        await done?.();
      } catch (err) {
        btn.disabled = false;
        await confirmDialog("Не вышло", errorOf(err), {ok: "Понятно"});
      }
    };
  });
}

/** Режим телефона словами, а не STOPPED/RUNNING. */
export const MODE = {
  RUNNING: ["Работает", "ok"], RESYNC: ["Читает экран", "accent"], PAUSED: ["Пауза", "warn"], STOPPED: ["Остановлен", "bad"],
  ATTENTION: ["Нужен человек", "bad"], TAKEOVER: ["Ручное управление", "warn"],
};

export function modeBadge(mode, reason) {
  const [text, tone] = MODE[mode] || [mode || "—", "mute"];
  return `<span class="wb wb-${tone}"${reason ? ` title="${escape(reason)}"` : ""}>${escape(text)}</span>`;
}

/** Кнопки Старт / Стоп у телефона (только админ). Старт читает экран заново, как кнопка в PostBot. */
export function phoneButtons(p) {
  if (!p || !p.online) return "";
  const b = (act, label, cls = "") => `<button class="wbtn wbtn-s${cls}" data-wphone="${act}" data-id="${escape(p.id)}">${label}</button>`;
  if (p.mode === "RUNNING" || p.mode === "RESYNC") return b("stop", "■ Стоп", " wbtn-d");
  return b("start", "▶ Старт", " wbtn-p");
}

export function bindPhoneButtons(root, done) {
  root.querySelectorAll("[data-wphone]").forEach((btn) => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const start = btn.dataset.wphone === "start";
      if (!start && !(await confirmDialog("Остановить телефон?", "Текущее задание остановится до нажатия «Поделиться»; очередь сохранится.", {ok: "Стоп", danger: true}))) return;
      btn.disabled = true;
      try {
        await call(start ? "device_phone_resume" : "device_phone_stop", {id: Number(btn.dataset.id)});
        await done?.();
      } catch (err) {
        btn.disabled = false;
        await confirmDialog("Не вышло", errorOf(err), {ok: "Понятно"});
      }
    };
  });
}
