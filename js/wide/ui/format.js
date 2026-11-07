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
