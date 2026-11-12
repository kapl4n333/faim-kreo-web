// Плотная таблица: столбцы, сортировка по клику на заголовок, выбор строки.
// column: {key, label, width?, align?, value?(row) для сортировки, html(row)}
import {escape} from "../bridge.js";

const sorts = new Map();

export function table(id, columns, rows, {rowAttr = () => "", selected = null, empty = "Нет строк", sticky = false} = {}) {
  const sort = sorts.get(id);
  let list = rows;
  if (sort) {
    const col = columns.find((c) => c.key === sort.key);
    const value = col?.value || ((r) => r[sort.key]);
    list = [...rows].sort((a, b) => {
      const x = value(a), y = value(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "ru")) * sort.dir;
    });
  }
  const head = columns.map((c) => {
    const mark = sort?.key === c.key ? (sort.dir > 0 ? " ▲" : " ▼") : "";
    const sortable = c.sort === false ? "" : ` data-wsort="${id}:${c.key}"`;
    return `<th${c.width ? ` style="width:${c.width}"` : ""}${c.align ? ` class="a-${c.align}"` : ""}${sortable}>${c.raw ? c.label : escape(c.label)}${mark}</th>`;
  }).join("");
  const body = list.length
    ? list.map((r) => `<tr ${rowAttr(r)}${selected != null && selected(r) ? ' class="on"' : ""}>${columns.map((c) => `<td${c.align ? ` class="a-${c.align}"` : ""}>${c.html ? c.html(r) : escape(r[c.key] ?? "—")}</td>`).join("")}</tr>`).join("")
    : `<tr class="wt-empty"><td colspan="${columns.length}">${escape(empty)}</td></tr>`;
  return `<table class="wt${sticky ? " wt-sticky" : ""}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

/** Клик по заголовку меняет сортировку и вызывает redraw. */
export function bindSort(root, redraw) {
  root.querySelectorAll("[data-wsort]").forEach((th) => {
    th.onclick = () => {
      const [id, key] = th.dataset.wsort.split(":");
      const cur = sorts.get(id);
      if (!cur || cur.key !== key) sorts.set(id, {key, dir: 1});
      else if (cur.dir > 0) sorts.set(id, {key, dir: -1});
      else sorts.delete(id);
      redraw();
    };
  });
}

/** Строка поиска и фильтры над таблицей. Значения хранит раздел. */
export function toolbar({search = null, filters = [], actions = ""} = {}) {
  const s = search ? `<input class="winput" type="search" placeholder="${escape(search.placeholder || "Поиск")}" value="${escape(search.value || "")}" data-wsearch="${search.id}">` : "";
  const f = filters.map((x) => `<label class="wsel"><span>${escape(x.label)}</span><select data-wfilter="${x.id}">${x.options.map(([v, l]) => `<option value="${escape(v)}"${String(x.value ?? "") === String(v) ? " selected" : ""}>${escape(l)}</option>`).join("")}</select></label>`).join("");
  return `<div class="wtool">${s}${f}<div class="wtool-sp"></div>${actions}</div>`;
}

/** Поиск и фильтры: значения уходят в onChange(id, value). Поиск ждёт паузу в наборе. */
export function bindToolbar(root, onChange) {
  root.querySelectorAll("[data-wsearch]").forEach((input) => {
    let t = null;
    input.oninput = () => { clearTimeout(t); t = setTimeout(() => onChange(input.dataset.wsearch, input.value, input), 200); };
  });
  root.querySelectorAll("[data-wfilter]").forEach((sel) => { sel.onchange = () => onChange(sel.dataset.wfilter, sel.value, sel); });
}
