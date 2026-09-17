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

/* ============================ Публикации (учёт по аккаунтам) ============================ */
// Три НЕЗАВИСИМЫХ статуса (не смешивать): обработка prepared_state, доставка delivery_state,
// публикация publish_state. Наступление времени и отправка файла НЕ означают публикацию.

export const UNIQ_LEVELS = ["none", "weak", "medium", "strong"];
export const DELIVERY_MODES = ["on_ready", "before_time", "morning"];

/** Приоритет настроек обработки: конкретная публикация > пресет аккаунта > 'none'.
 *  Пачка применяется В ЗНАЧЕНИЕ публикации при сохранении, поэтому отдельно тут её нет. */
export function resolveUniqLevel(pub, account) {
  const p = pub && pub.uniq_level;
  if (UNIQ_LEVELS.includes(p)) return p;
  const a = account && account.default_uniq_level;
  if (UNIQ_LEVELS.includes(a)) return a;
  return "none";
}

/** Какой файл отдаём в доставку: финальный (после Edits) приоритетнее подготовленного.
 *  Финал НЕ прогоняется повторно через уникализацию. */
export function deliveryFile(pub) {
  if (!pub) return null;
  if (pub.final_path) return { path: pub.final_path, kind: "final" };
  if (pub.prepared_path) return { path: pub.prepared_path, kind: "prepared" };
  return null;
}

/** Готова ли публикация к доставке (есть актуальный файл). */
export function isDeliverable(pub) {
  const f = deliveryFile(pub);
  if (!f) return false;
  return f.kind === "final" ? true : pub.prepared_state === "ready";
}

/** Выбор исходного ассета крео по (kind,index): source→source_paths, result→result_paths. */
export function pickAsset({ creo, kind, index }) {
  if (!creo) return { ok: false, error: "not_found" };
  const col = kind === "source" ? "source_paths" : kind === "result" ? "result_paths" : null;
  if (!col) return { ok: false, error: "bad_kind" };
  const arr = Array.isArray(creo[col]) ? creo[col] : [];
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= arr.length || !arr[i] || typeof arr[i] !== "string")
    return { ok: false, error: "no_asset" };
  return { ok: true, path: arr[i] };
}

/** Нормализация ссылки на Reel: пусто→null, только http(s), ≤500. */
export function normReelUrl(raw) {
  const s = String(raw ?? "").trim().slice(0, 500);
  return s && /^https?:\/\//i.test(s) ? s : null;
}

/** Переход статуса ПУБЛИКАЦИИ (ручной). Доступ: создатель записи или админ.
 *  target: planned | awaiting_confirm | published | cancelled. */
export function publishTransition({ cur, me, isAdmin, target, nowIso, reelUrl }) {
  if (!cur) return { ok: false, error: "not_found" };
  const owner = String(cur.created_by_tg_id) === String(me);
  if (!(owner || isAdmin)) return { ok: false, error: "forbidden" };
  if (!["planned", "awaiting_confirm", "published", "cancelled"].includes(target))
    return { ok: false, error: "bad_state" };
  if (cur.publish_state === target && target !== "published") return { ok: true, noop: true };
  const patch = { publish_state: target };
  if (target === "published") {
    patch.published_at = cur.published_at || nowIso;   // повторное подтверждение дату не сдвигает
    patch.confirmed_by_tg_id = me;
    if (reelUrl != null) patch.reel_url = normReelUrl(reelUrl);
  } else if (cur.publish_state === "published") {       // снятие отметки/отмена — чистим факт
    patch.published_at = null; patch.confirmed_by_tg_id = null;
  }
  return { ok: true, patch };
}

/** Предупреждение о повторном планировании того же исходника на тот же аккаунт. */
export function replanWarning({ account_id, existing }) {
  const act = (existing || []).filter(p =>
    String(p.account_id) === String(account_id) && p.publish_state !== "cancelled");
  return { warn: act.length > 0, existing: act };
}

/** Конфликты слотов: один аккаунт + один календарный день (в пачке и с существующими).
 *  Не блокирует — показывает для предпросмотра, чтобы не сдвигать чужие планы молча. */
export function slotConflicts({ drafts, existing }) {
  const day = (iso) => String(iso || "").slice(0, 10);
  const seen = {};
  for (const p of (existing || [])) {
    if (p.publish_state === "cancelled" || !p.planned_at || p.account_id == null) continue;
    (seen[p.account_id + "|" + day(p.planned_at)] ??= []).push({ from: "existing", id: p.id });
  }
  const conflicts = [];
  for (const d of (drafts || [])) {
    if (!d.planned_at || d.account_id == null) continue;
    const key = d.account_id + "|" + day(d.planned_at);
    if (seen[key] && seen[key].length)
      conflicts.push({ account_id: d.account_id, day: day(d.planned_at), with: seen[key].slice() });
    (seen[key] ??= []).push({ from: "draft", creo_id: d.creo_id });
  }
  return conflicts;
}

/** Разворот пакетного плана в черновики публикаций (по одному на крео×аккаунт×дата).
 *  spec: { creoIds[], accountIds[], level, flip, tz, mode, dates[], deliveryMode }
 *  mode: 'manual_dates' (dates[ci] на i-й ролик) | 'one_per_day' (по ролику в день от dates[0]).
 *  Индивидуальные правки строк применяются ПОСЛЕ (в UI/edge), до сохранения. */
export function expandBatch(spec, creoResolver) {
  const out = [];
  const creoIds = spec.creoIds || [], accountIds = spec.accountIds || [];
  const level = UNIQ_LEVELS.includes(spec.level) ? spec.level : null;
  const tz = spec.tz || null;
  const mode = spec.mode === "one_per_day" ? "one_per_day" : "manual_dates";
  const dates = spec.dates || [];
  for (let ci = 0; ci < creoIds.length; ci++) {
    const creo_id = creoIds[ci];
    let planned_at = null;
    if (mode === "manual_dates") planned_at = dates[ci] || dates[0] || null;
    else if (dates[0]) { const b = new Date(dates[0]); b.setDate(b.getDate() + ci); planned_at = b.toISOString(); }
    for (const account_id of accountIds) {
      const draft = {
        creo_id, account_id, source_kind: "result", source_index: 0,
        planned_at, tz, uniq_level: level, process_flip: !!spec.flip,
        delivery_mode: DELIVERY_MODES.includes(spec.deliveryMode) ? spec.deliveryMode : "on_ready",
      };
      if (creoResolver) {
        const a = pickAsset({ creo: creoResolver(creo_id), kind: draft.source_kind, index: draft.source_index });
        if (a.ok) draft.source_path = a.path;
      }
      out.push(draft);
    }
  }
  return { drafts: out };
}
