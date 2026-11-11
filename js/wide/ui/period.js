// Неделя (пн–вс) или календарный месяц вокруг даты: для страницы «Запросы ИИ». Только строки YYYY-MM-DD, без часовых поясов.
const DAY = 86400000;
export const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const dow = (date) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7; // 0 = пн

/** Сегодня в часовом поясе браузера. */
export const todayLocal = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

/** {from, to} периода view ("week" | "month"), в котором лежит anchor. */
export function periodOf(view, anchor) {
  if (view === "month") {
    const from = `${anchor.slice(0, 7)}-01`;
    const next = new Date(Date.UTC(Number(anchor.slice(0, 4)), Number(anchor.slice(5, 7)), 1)).toISOString().slice(0, 10);
    return {from, to: addDays(next, -1)};
  }
  const from = addDays(anchor, -dow(anchor));
  return {from, to: addDays(from, 6)};
}

/** Якорь соседнего периода: step = -1 или +1. */
export function shiftPeriod(view, anchor, step) {
  if (view === "month") {
    const d = new Date(Date.UTC(Number(anchor.slice(0, 4)), Number(anchor.slice(5, 7)) - 1 + step, 1));
    return d.toISOString().slice(0, 10);
  }
  return addDays(periodOf("week", anchor).from, 7 * step);
}

const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const MONTHS_1 = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

/** «Чт, 12 ноября». */
export const dayTitle = (date) => `${DAYS[dow(date)]}, ${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]}`;

/** Подпись периода: «9–15 ноября» или «Ноябрь 2026». */
export function periodTitle(view, {from, to}) {
  if (view === "month") return `${MONTHS_1[Number(from.slice(5, 7)) - 1]} ${from.slice(0, 4)}`;
  const a = Number(from.slice(8, 10)), b = Number(to.slice(8, 10));
  return from.slice(5, 7) === to.slice(5, 7) ? `${a}–${b} ${MONTHS[Number(to.slice(5, 7)) - 1]}` : `${a} ${MONTHS[Number(from.slice(5, 7)) - 1]} – ${b} ${MONTHS[Number(to.slice(5, 7)) - 1]}`;
}

/** Все даты периода по порядку. */
export function datesOf({from, to}) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
