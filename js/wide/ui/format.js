// Время и мелкие форматы. Время сервера всегда UTC, показ в поясе аккаунта или пользователя.
import {escape} from "../bridge.js";

export function ago(iso) {
  if (!iso) return "—";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "только что";
  if (s < 3600) return Math.floor(s / 60) + " мин назад";
  if (s < 86400) return Math.floor(s / 3600) + " ч назад";
  return Math.floor(s / 86400) + " дн назад";
}

// "2026-11-08T14:06" → "8 нояб., 14:06"
const MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "нояб", "дек"];
export function localText(local) {
  if (!local) return "—";
  const m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d:\d\d)/.exec(local);
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}, ${m[4]}` : escape(local);
}
export const timeOnly = (local) => (local ? String(local).slice(11, 16) : "—");

export function whenIso(iso, tz) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("ru-RU", {timeZone: tz || undefined, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"}).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString("ru-RU");
  }
}

export const num = (n) => (n == null ? "—" : Number(n).toLocaleString("ru-RU"));

const SLOW = [[0, "Выключен — публикует сразу по времени"], [30, "Включён: 30 мин между публикациями"], [60, "Включён: 60 мин между публикациями"], [120, "Включён: 2 ч между публикациями"]];
/** Медленный режим: минимум между любыми публикациями аккаунта. 0 — выключен. */
export const slowSelect = (name, value) => `<select data-f="${name}">${SLOW.map(([v, l]) => `<option value="${v}"${Number(value ?? 0) === v ? " selected" : ""}>${l}</option>`).join("")}${SLOW.some(([v]) => v === Number(value ?? 0)) ? "" : `<option value="${Number(value)}" selected>Включён: ${Number(value)} мин</option>`}</select>`;
export const slowText = (value) => (Number(value ?? 0) > 0 ? `включён, ${Number(value)} мин` : "выключен");
