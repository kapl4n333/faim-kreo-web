// Чистая логика kreo-api без Deno/Supabase — импортируется index.ts и прогоняется тестами
// в браузере (tests/logic.html). Здесь НЕТ ввода-вывода: только решения по данным.
// Держать без TypeScript-синтаксиса: файл грузится и Deno, и обычным <script type=module>.

/** Один контракт назначения для ВСЕХ входов (claim_creo, set_creo_status, кнопки карточки).
 *  Возвращает {ok:true, patch, cond} — UPDATE с условием (атомарно), либо {ok:false, error}.
 *  cond: {status?, assignee_null?, assignee?} — что должно быть в строке в момент UPDATE.
 *  Админ чужое НЕ перехватывает через статус: для этого явный assign_creo. */
export function statusTransition({ cur, me, isAdmin, target, nowIso }) {
  if (!cur) return { ok: false, error: "not_found" };
  const mine = cur.assignee_tg_id != null && String(cur.assignee_tg_id) === String(me);
  const free = cur.assignee_tg_id == null;
  if (target === "in_progress") {
    if (mine) {
      if (cur.status === "in_progress") return { ok: true, noop: true };
      // своё «готово» вернуть в работу — можно (переделка), исполнитель тот же
      return { ok: true, patch: { status: "in_progress", done_at: null }, cond: { assignee: me } };
    }
    if (!free) return { ok: false, error: "already_claimed" };
    // самозахват только свободного: условие на assignee IS NULL делает захват атомарным
    return { ok: true, patch: { status: "in_progress", assignee_tg_id: me, claimed_at: nowIso, done_at: null },
             cond: { assignee_null: true } };
  }
  if (target === "queued") {
    if (!(mine || isAdmin || free)) return { ok: false, error: "forbidden" };
    if (cur.status === "queued" && free) return { ok: true, noop: true };
    return { ok: true, patch: { status: "queued", assignee_tg_id: null, claimed_at: null, done_at: null },
             cond: free ? {} : { assignee: cur.assignee_tg_id } };
  }
  if (target === "done") {
    if (!(mine || isAdmin)) return { ok: false, error: "forbidden" };
    if (cur.status === "done") return { ok: true, noop: true };
    return { ok: true, patch: { status: "done", done_at: nowIso }, cond: mine ? { assignee: me } : {} };
  }
  return { ok: false, error: "bad_status" };
}

/** Слияние путей результата: новые в конец, без дублей (CAS-обновление result_paths). */
export function mergePaths(oldPaths, newPaths) {
  const out = (Array.isArray(oldPaths) ? oldPaths : []).slice();
  for (const p of (Array.isArray(newPaths) ? newPaths : [])) if (p && !out.includes(p)) out.push(p);
  return out;
}

/** Имя ниши: обрезать, схлопнуть пробелы, ≤60. Пустое → null. Ключ сравнения — lower. */
export function normNicheName(raw) {
  const s = String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  return s ? s : null;
}
export const nicheKey = (name) => String(name ?? "").trim().toLowerCase();

/** Нормализация списка id ниш: числа, без дублей, ≤20. */
export function normNicheIds(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const x of arr) { const n = Number(x); if (Number.isFinite(n) && n > 0 && !out.includes(n)) out.push(n); }
  return out.slice(0, 20);
}

/** Отложение — командное, не трогает статус/исполнителя: вернуть можно ровно в то же место. */
export function deferPatch({ cur, me, nowIso }) {
  if (!cur) return { ok: false, error: "not_found" };
  if (cur.deferred_at) return { ok: true, noop: true };
  return { ok: true, patch: { deferred_at: nowIso, deferred_by_tg_id: me } };
}
export function restorePatch({ cur }) {
  if (!cur) return { ok: false, error: "not_found" };
  if (!cur.deferred_at) return { ok: true, noop: true };
  return { ok: true, patch: { deferred_at: null, deferred_by_tg_id: null } };
}

/** Заметки: ≤4000 символов, пустое → null. */
export function normNotes(raw) {
  const s = String(raw ?? "").replace(/\r\n/g, "\n").slice(0, 4000);
  return s.trim() ? s : null;
}

/** Скачивание файла крео на устройство (action sign_download). Узкий контракт: подписываем
 *  ТОЛЬКО путь из массива выбранного крео по разрешённому полю и индексу — никакого «подпиши
 *  произвольный path». Поля = те же, что отдаёт bootstrap (source/media/result → *_paths). */
export const DL_FIELDS = { source: "source_paths", media: "storage_paths", result: "result_paths" };
export function downloadTarget({ cur, field, index }) {
  if (!cur) return { ok: false, error: "not_found" };
  const col = Object.hasOwn(DL_FIELDS, field) ? DL_FIELDS[field] : null;
  if (!col) return { ok: false, error: "bad_field" };
  if (typeof index !== "number") return { ok: false, error: "no_file" };
  const i = index;
  const arr = Array.isArray(cur[col]) ? cur[col] : [];
  if (!Number.isInteger(i) || i < 0 || i >= arr.length || !arr[i] || typeof arr[i] !== "string") return { ok: false, error: "no_file" };
  return { ok: true, path: arr[i], name: downloadName({ id: cur.id, field, index: i, path: arr[i] }) };
}

/** Имя файла при сохранении: ftask-<id>-<src|res|med>-<n>[-<исходное имя>].<ext>.
 *  Только из ПУТИ в Storage (никаких query подписанных URL), ascii-safe, расширение из пути.
 *  Та же функция продублирована на фронте (js/download.js: dlName) — тест сверяет их. */
export function downloadName({ id, field, index, path }) {
  const base = String(path || "").split("?")[0].split("#")[0].split("/").pop() || "";
  const m = /\.([a-z0-9]{1,5})$/i.exec(base);
  const ext = m ? m[1].toLowerCase() : "bin";
  let stem = (m ? base.slice(0, -m[0].length) : base).replace(/^\d+_[a-z0-9]+_/, "");  // префикс sign_upload
  stem = stem.replace(/[^\w.\-]+/g, "_").replace(/^[._-]+|[._-]+$/g, "").slice(0, 40);
  if (/^\d*$/.test(stem)) stem = "";                                                  // sources/<id>/0.mp4 → без хвоста
  const tag = field === "source" ? "src" : field === "result" ? "res" : "med";
  return "ftask-" + Number(id) + "-" + tag + "-" + (Number(index) + 1) + (stem ? "-" + stem : "") + "." + ext;
}

/** Патч доставки: набор полей при загрузке результата (без result_paths — они через CAS). */
export function deliverExtra({ caption, nowIso }) {
  const extra = { status: "done", done_at: nowIso, delivered_at: nowIso, delivery_state: "pending" };
  if (caption != null) extra.result_caption = String(caption).slice(0, 1024);
  return extra;
}
