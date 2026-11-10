// Поля настроек по записям реестра: одна раскладка для «Общих настроек» и настроек кластера.
// Поле строит legacy.field (cField из content.js); caption_prompt — большое поле.
import {escape, legacy} from "../bridge.js";

export const isBig = (r) => r.key === "caption_prompt";

/** Одна строка: подпись, поле, кнопки. tag — что стоит после названия, actions — кнопки справа. */
export function settingRow(r, {value, can, state = null, tag = "", actions = ""}) {
  const big = isBig(r);
  return `<div class="wset${big ? " wset-big" : ""}" data-wkey="${escape(r.key)}">
        <div class="wset-l"><b>${escape(r.label)}</b>${tag}${r.hint ? `<div class="wmute">${escape(r.hint)}</div>` : ""}<div class="wmute mono wset-k">${escape(r.key)}</div></div>
        <div class="wset-f">${big ? `<textarea id="ws-${escape(r.key)}" rows="14"${can ? "" : " disabled"}>${escape(value ?? "")}</textarea>` : legacy.field(r, value, `ws-${r.key}`, !can)}</div>
        <div class="wset-a">${actions}${state ? `<div class="${state === "ok" ? "wok" : "wbad"}">${escape(state === "ok" ? "Сохранено" : state)}</div>` : ""}</div>
      </div>`;
}

/** Карточки по группам реестра в порядке появления. */
export function settingsGrid(list, row) {
  const groups = [...new Set(list.map((r) => r.group))];
  return `<div class="wsetgrid">${groups.map((g) => `<section class="wcard wcard-free"><h2>${escape(g)}</h2>${list.filter((r) => r.group === g).map(row).join("")}</section>`).join("")}</div>`;
}

/** Значение из поля строки настройки. */
export function readSetting(root, rec) {
  const box = root.querySelector(`[data-wkey="${CSS.escape(rec.key)}"] .wset-f`);
  return isBig(rec) ? box.querySelector("textarea").value : legacy.readField(rec, box);
}

/** Короткий показ значения настройки (таблицы, «как в общих: …»). */
export function settingValue(v) {
  if (v == null || v === "") return '<span class="wmute">пусто</span>';
  if (typeof v === "boolean") return v ? "да" : "нет";
  if (Array.isArray(v) && v.every((x) => x && x.from)) return v.map((x) => `${x.from}–${x.to}`).join(", ");
  if (typeof v === "object" && "min" in v && "max" in v) return `${v.min}–${v.max}${v.period ? ` в ${v.period === "week" ? "неделю" : "день"}` : ""}`;
  if (typeof v === "object" && "mode" in v) return v.mode === "percent" ? `${v.value}% историй` : `каждая ${v.value}-я`;
  if (typeof v === "object") return `<span class="mono">${escape(JSON.stringify(v))}</span>`;
  const s = String(v);
  return s.length > 160 ? `${escape(s.slice(0, 160))}…` : escape(s);
}
