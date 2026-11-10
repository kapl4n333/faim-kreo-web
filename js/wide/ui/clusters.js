// Кластеры: короткие тексты для экранов (правила, покрытие, разгон, проверка). Чистые функции, есть тесты.
import {escape} from "../bridge.js";
import {STATUS, reasonText} from "./badge.js";
import {ago, whenIso} from "./format.js";

/** «аккаунт / аккаунта / аккаунтов» по числу. */
export function plural(n, [one, few, many]) {
  const a = Math.abs(Number(n)) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
}
/** После «из»: «из 1 аккаунта», «из 5 аккаунтов». */
const ofAccounts = (n) => (Math.abs(Number(n)) % 10 === 1 && Math.abs(Number(n)) % 100 !== 11 ? "аккаунта" : "аккаунтов");

/** Значение настройки для кластера: своё у кластера, иначе общее, иначе по умолчанию. */
export function clusterValue(key, {values = {}, registry = [], global = null} = {}) {
  if (Object.prototype.hasOwnProperty.call(values, key)) return values[key];
  return inheritedValue(key, {registry, global});
}
/** Что кластер получит при «Как в общих». */
export function inheritedValue(key, {registry = [], global = null} = {}) {
  if (global?.effective_global && key in global.effective_global) return global.effective_global[key];
  if (global?.global && key in global.global) return global.global[key];
  const rec = registry.find((r) => r.key === key) || global?.registry?.find((r) => r.key === key);
  return rec ? rec.default : null;
}

/** Одна строка правил кластера простыми словами. */
export function rulesSummary({accounts = 0, reserve = 3, maxParallel = 3, repeatDays = 0, paused = false} = {}) {
  const parts = [];
  if (!accounts) parts.push("В кластере пока нет аккаунтов: раздавать некому");
  else if (accounts === 1) parts.push("Каждый материал пойдёт на единственный аккаунт кластера");
  else parts.push(`Каждый материал пойдёт на каждый из ${accounts} ${ofAccounts(accounts)} в своём порядке`);
  parts.push(`впрок ${reserve} на аккаунт каждого типа`);
  parts.push(`один материал одновременно ждут не больше ${maxParallel} ${ofAccounts(maxParallel)}`);
  parts.push(`повтор: ${Number(repeatDays) > 0 ? `через ${repeatDays} дн. после полного прохода` : "нет"}`);
  return (paused ? "Пауза: новое не раздаётся. " : "") + parts.join("; ") + ".";
}

/** Покрытие материала: «опубликовано X из N аккаунтов». */
export const coverageText = (published, total) => `опубликовано ${Number(published) || 0} из ${Number(total) || 0} ${ofAccounts(Number(total) || 0)}`;

/** Разгон нового аккаунта: «день N из M» и что сейчас идёт. null — разгона нет. */
export function rampInfo(ramp) {
  if (!ramp || ramp.ageDays == null) return null;
  const total = Number(ramp.warmupDays || 0) + Number(ramp.days || 0);
  const day = Math.min(total, Number(ramp.ageDays) + 1);
  const warm = Number(ramp.ageDays) < Number(ramp.warmupDays || 0);
  return {day, total, text: `день ${day} из ${total}`, phase: warm ? "только прогрев, публикаций нет" : "норма публикаций растёт до полной"};
}
export function rampBadge(ramp) {
  const r = rampInfo(ramp);
  return r ? `<span class="wb wb-info" title="${escape(r.phase)}">Разгон: ${escape(r.text)}</span>` : "";
}

/** Последняя проверка аккаунта: ✓ когда / ✗ причина / «—» если не было. */
export function healthHtml(h) {
  if (!h) return '<span class="wmute" title="Проверки ещё не было">—</span>';
  const when = h.at ? whenIso(h.at) : "";
  if (h.ok) return `<span class="wok" title="${escape(`Ник совпал · ${when}`)}">✓ ${escape(ago(h.at))}</span>`;
  const why = reasonText(h.error_code) || (STATUS[h.status] || [h.status || "ошибка"])[0];
  return `<span class="wbad" title="${escape([why, when].filter(Boolean).join(" · "))}">✗ ${escape(why)}</span>`;
}
