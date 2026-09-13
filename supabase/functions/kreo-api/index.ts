// kreo-api — шлюз Telegram Mini App (FTask) к реестру + админка.
// Auth: Telegram initData (HMAC по BOT_TOKEN) → verify_jwt=false. Данные/Storage — service_role.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { statusTransition, mergePaths, normNicheName, normNicheIds, deferPatch, restorePatch,
  normNotes, deliverExtra, downloadTarget } from "./logic.js";

const BOT_TOKEN = (Deno.env.get("BOT_TOKEN") ?? "").trim();
const ADMIN_IDS = (Deno.env.get("KREO_ADMIN_IDS") ?? "517207658")
  .split(",").map((s) => s.trim()).filter(Boolean);
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "creos";
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const ROLES = ["admin", "creative", "uploader"];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-init-data, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

async function hmac(keyData: ArrayBuffer | Uint8Array, msg: string) {
  const bytes = Uint8Array.from(keyData instanceof Uint8Array ? keyData : new Uint8Array(keyData));
  const key = await crypto.subtle.importKey("raw", bytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
}
const toHex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function verifyInitData(initData: string): Promise<Record<string, string> | null> {
  if (!initData || !BOT_TOKEN) { console.log("kreo-verify", JSON.stringify({ reason: !initData ? "empty" : "no_token" })); return null; }
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const dcs = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join("\n");
  const secret = await hmac(new TextEncoder().encode("WebAppData"), BOT_TOKEN);
  const sig = toHex(await hmac(new Uint8Array(secret), dcs));
  if (sig !== hash) { console.log("kreo-verify", JSON.stringify({ reason: "mismatch" })); return null; }
  const authDate = Number(params.get("auth_date") ?? "0");
  if (authDate && Date.now() / 1000 - authDate > 86400) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of params.entries()) out[k] = v;
  return out;
}

type Member = { tg_id: number; username: string | null; name: string | null; role: string; roles: string[] };
const normRoles = (r: any): string[] => Array.isArray(r) ? r.filter((x) => ROLES.includes(x)) : [];
const normIds = (r: any): number[] => Array.isArray(r) ? [...new Set(r.map(Number).filter((n) => n))] : [];

async function ensureMember(u: any): Promise<Member | null> {
  const { data: existing } = await db.from("members").select("*").eq("tg_id", u.id).maybeSingle();
  const name = [u.first_name, u.last_name].filter(Boolean).join(" ") || null;
  if (existing) {
    const patch: any = { username: u.username ?? null, name };
    if (ADMIN_IDS.includes(String(u.id)) && !normRoles(existing.roles).includes("admin"))
      patch.roles = [...normRoles(existing.roles), "admin"];
    await db.from("members").update(patch).eq("tg_id", u.id);
    return { ...existing, ...patch, roles: normRoles(patch.roles ?? existing.roles) } as Member;
  }
  if (!ADMIN_IDS.includes(String(u.id))) return null;
  const roles = ["admin"];
  const { data } = await db.from("members")
    .insert({ tg_id: u.id, username: u.username ?? null, name, role: "admin", roles })
    .select("*").single();
  return { ...(data as any), roles: normRoles((data as any).roles) } as Member;
}

async function signPaths(paths: string[]) {
  const map: Record<string, string> = {};
  const uniq = [...new Set(paths.filter(Boolean))];
  if (!uniq.length) return map;
  const { data } = await db.storage.from(BUCKET).createSignedUrls(uniq, 3600);
  (data || []).forEach((x: any) => { if (x.signedUrl) map[x.path] = x.signedUrl; });
  return map;
}
async function withMedia(creos: any[]) {
  const all: string[] = [];
  for (const c of creos || []) {
    for (const p of (c.storage_paths || [])) all.push(p);
    for (const p of (c.result_paths || [])) all.push(p);
    for (const p of (c.source_paths || [])) all.push(p);   // исходник референса (готовит бот)
    if (c.preview_poster) all.push(c.preview_poster);   // Склад: постер для сетки истории
    if (c.preview_clip) all.push(c.preview_clip);       // Склад: hover-клип
    if (c.source_poster) all.push(c.source_poster);
    if (c.source_clip) all.push(c.source_clip);
  }
  if (!all.length) return creos;
  const map = await signPaths(all);
  // *_urls выровнены по индексу с *_paths: неподписанный слот = null (НЕ выкидываем), иначе
  // фронт спутает файлы при скачивании/просмотре альбома, где одна ссылка не подписалась.
  const aligned = (paths: any) => (Array.isArray(paths) ? paths : []).map((p: string) => map[p] || null);
  for (const c of creos) {
    c.media_urls = aligned(c.storage_paths);
    c.result_urls = aligned(c.result_paths);
    c.source_urls = aligned(c.source_paths);
    c.preview_url = c.preview_poster ? (map[c.preview_poster] || null) : null;
    c.clip_url = c.preview_clip ? (map[c.preview_clip] || null) : null;
    c.source_poster_url = c.source_poster ? (map[c.source_poster] || null) : null;
    c.source_clip_url = c.source_clip ? (map[c.source_clip] || null) : null;
  }
  return creos;
}

// niche_ids на каждое крео из join-таблицы (один запрос на bootstrap)
// Терпимо к порядку выкладки: если миграция ftask_catalog ещё не применена (таблиц нет),
// bootstrap не падает — ниши просто пустые. После миграции всё появляется без редеплоя.
async function attachNiches(creos: any[]) {
  for (const c of creos) c.niche_ids = [];
  if (!creos.length) return;
  try {
    const links = await fetchAll((a, b) => db.from("creo_niches").select("creo_id, niche_id").order("creo_id").range(a, b));
    const by: Record<string, number[]> = {};
    for (const l of links) (by[l.creo_id] ??= []).push(l.niche_id);
    for (const c of creos) c.niche_ids = by[c.id] ?? [];
  } catch (e) { console.log("kreo-api niches", JSON.stringify({ reason: String((e as any)?.message ?? e).slice(0, 120) })); }
}
async function listNiches() {
  try {
    return await fetchAll((a, b) => db.from("niches").select("id, name, created_by_tg_id, created_at, updated_at").order("name").range(a, b));
  } catch { return []; }
}

// Единый контракт смены статуса/исполнителя (logic.statusTransition) + атомарный UPDATE
// с условием на текущего исполнителя. Пустой результат = кто-то успел раньше → перечитать.
async function applyTransition(id: any, me: number, isAdmin: boolean, target: string, nowIso: string) {
  for (let i = 0; i < 3; i++) {
    const { data: cur } = await db.from("creos").select("*").eq("id", id).maybeSingle();
    const tr = statusTransition({ cur, me, isAdmin, target, nowIso });
    if (!tr.ok) return { error: tr.error, creo: cur };
    if (tr.noop) return { creo: cur };
    if (!tr.patch || !tr.cond) return { error: "conflict", creo: cur };
    let q = db.from("creos").update(tr.patch).eq("id", id);
    if (tr.cond.assignee_null) q = q.is("assignee_tg_id", null);
    if (tr.cond.assignee != null) q = q.eq("assignee_tg_id", tr.cond.assignee);
    const { data } = await q.select("*");
    if (data && data.length) return { creo: data[0] };
  }
  return { error: "conflict" };
}

// Полная выборка постранично: PostgREST режет ответ лимитом проекта (обычно 1000 строк) —
// без этого поиск/статистика в аппе видели бы только первую страницу (ревью R10).
async function fetchAll(build: (from: number, to: number) => any, page = 1000) {
  const out: any[] = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await build(from, from + page - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < page) break;
  }
  return out;
}

// CAS-обновление jsonb-поля: PATCH проходит только если поле не изменилось с момента чтения
// (тот же приём, что promote_posted в боте). Две одновременные отметки/загрузки не затирают
// друг друга (ревью R5). Возвращает обновлённую строку или null после `tries` конфликтов.
async function casUpdate(id: any, field: string, compute: (cur: any) => any, extra: (cur: any) => any = () => ({}), tries = 4)
  : Promise<{ error?: string; row?: any }> {
  for (let i = 0; i < tries; i++) {
    const { data: row } = await db.from("creos").select("*").eq("id", id).maybeSingle();
    if (!row) return { error: "not_found" };
    const old = row[field];
    const patch = { [field]: compute(old), ...extra(row) };
    let q = db.from("creos").update(patch).eq("id", id);
    q = old == null ? q.is(field, null) : q.filter(field, "eq", JSON.stringify(old));
    const { data } = await q.select("*");
    if (data && data.length) return { row: data[0] };
  }
  return { error: "conflict" };
}

function computeStats(creos: any[]) {
  const byStatus: Record<string, number> = { queued: 0, in_progress: 0, done: 0 };
  const byAuthor: Record<string, { submitted: number; done: number; posted: number }> = {};
  const byPoster: Record<string, number> = {};
  let tS = 0, tN = 0, pS = 0, pN = 0, postedTotal = 0, deferred = 0;
  for (const c of creos) {
    if (c.deferred_at) { deferred++; continue; }   // отложенное — не в активном конвейере
    if (byStatus[c.status] != null) byStatus[c.status]++;
    const a = c.author_username || "—";
    byAuthor[a] ??= { submitted: 0, done: 0, posted: 0 };
    byAuthor[a].submitted++;
    if (c.status === "done") {
      byAuthor[a].done++;
      if (c.created_at && c.done_at) { tS += new Date(c.done_at).getTime() - new Date(c.created_at).getTime(); tN++; }
    }
    const posters = Array.isArray(c.posters) ? c.posters : [];
    if (posters.length) {
      postedTotal++;
      byAuthor[a].posted++;
      let earliest = Infinity;
      for (const p of posters) {
        const who = p.username || ("id" + p.tg_id);
        byPoster[who] = (byPoster[who] ?? 0) + 1;
        if (p.at) earliest = Math.min(earliest, new Date(p.at).getTime());
      }
      if (c.done_at && earliest < Infinity) { pS += earliest - new Date(c.done_at).getTime(); pN++; }
    }
  }
  return {
    total: creos.length, byStatus, posted: postedTotal, deferred,
    byAuthor: Object.entries(byAuthor).map(([author, v]) => ({ author, ...v })).sort((a, b) => b.submitted - a.submitted),
    byPoster: Object.entries(byPoster).map(([poster, posted]) => ({ poster, posted })).sort((a, b) => b.posted - a.posted),
    avgTurnaroundHours: tN ? +(tS / tN / 3600000).toFixed(1) : null,
    avgPostLagHours: pN ? +(pS / pN / 3600000).toFixed(1) : null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  let body: any = {};
  try { body = await req.json(); } catch { /* */ }
  const verified = await verifyInitData(req.headers.get("x-init-data") ?? body.initData ?? "");
  if (!verified) return json({ error: "unauthorized" }, 401);
  let tgUser: any; try { tgUser = JSON.parse(verified.user ?? "{}"); } catch { tgUser = {}; }
  if (!tgUser.id) return json({ error: "no_user" }, 401);
  const me = await ensureMember(tgUser);
  if (!me) return json({ error: "not_member" }, 403);
  const isAdmin = me.roles.includes("admin");
  const action = body.action ?? "bootstrap";
  const nowIso = () => new Date().toISOString();

  try {
    switch (action) {
      case "bootstrap":
      case "list_creos": {
        const creos = await fetchAll((a, b) => db.from("creos").select("*").order("created_at", { ascending: false }).range(a, b));
        await withMedia(creos ?? []);
        await attachNiches(creos ?? []);
        if (action === "list_creos") return json({ creos });
        const tasks = await fetchAll((a, b) => db.from("tasks").select("*")
          .order("pinned", { ascending: false }).order("position", { ascending: true }).order("created_at", { ascending: false }).range(a, b));
        const { data: members } = await db.from("members").select("tg_id, username, name, role, roles");
        (members ?? []).forEach((m: any) => m.roles = normRoles(m.roles));
        const niches = await listNiches();
        return json({ me, isAdmin, creos, tasks, members, niches, stats: computeStats(creos ?? []) });
      }

      case "set_creo_status":
      case "claim_creo": {
        // Один серверный контракт для всех кнопок (ревью B): самозахват только свободного,
        // повтор своим — идемпотентен, чужое — 409 already_claimed; админ переназначает
        // ТОЛЬКО явным assign_creo. claim=true больше ничего не значит.
        const target = action === "claim_creo" ? "in_progress" : body.status;
        const r = await applyTransition(body.id, me.tg_id, isAdmin, target, nowIso());
        if (r.error) {
          const code = r.error === "not_found" ? 404 : r.error === "bad_status" ? 400
            : r.error === "forbidden" ? 403 : 409;
          if (r.creo) await withMedia([r.creo]);
          return json({ error: r.error, creo: r.creo ?? undefined }, code);
        }
        await withMedia([r.creo]); await attachNiches([r.creo]);
        return json({ creo: r.creo });
      }

      case "toggle_posted": {
        const r = await casUpdate(body.id, "posters", (old) => {
          const posters = Array.isArray(old) ? old : [];
          const has = posters.some((p: any) => String(p.tg_id) === String(me.tg_id));
          return has
            ? posters.filter((p: any) => String(p.tg_id) !== String(me.tg_id))
            : [...posters, { tg_id: me.tg_id, username: me.username, at: nowIso() }];
        });
        if (r.error) return json({ error: r.error }, r.error === "not_found" ? 404 : 409);
        await withMedia([r.row]); await attachNiches([r.row]);
        return json({ creo: r.row });
      }

      case "assign_creo": {
        // Явное админское переназначение — единственный путь сменить ЧУЖОГО исполнителя.
        if (!isAdmin) return json({ error: "admin_only" }, 403);
        const to = body.assignee_tg_id ? Number(body.assignee_tg_id) : null;
        const patch: any = { assignee_tg_id: to, claimed_at: to ? nowIso() : null };
        if (to && (body.setInProgress ?? true)) { patch.status = "in_progress"; patch.done_at = null; }
        if (!to) { patch.status = "queued"; patch.done_at = null; }
        const { data } = await db.from("creos").update(patch).eq("id", body.id).select("*").single();
        await withMedia([data]); await attachNiches([data]);
        return json({ creo: data });
      }

      case "deliver_creo": {
        const paths = Array.isArray(body.paths) ? body.paths.filter(Boolean) : [];
        if (!paths.length) return json({ error: "no_files" }, 400);
        // CAS по result_paths: две одновременные загрузки к одному крео не теряют файлы (R5)
        const r = await casUpdate(body.id, "result_paths",
          (old) => mergePaths(old, paths),
          () => deliverExtra({ caption: body.caption, nowIso: nowIso() }));
        if (r.error) return json({ error: r.error }, r.error === "not_found" ? 404 : 409);
        if (Array.isArray(body.niche_ids))   // ниши из формы загрузки (полная замена набора)
          await db.rpc("set_creo_niches", { p_creo_id: body.id, p_niche_ids: normNicheIds(body.niche_ids), p_by: me.tg_id });
        await withMedia([r.row]); await attachNiches([r.row]);
        return json({ creo: r.row });
      }

      // -------------------------------------------------- каталог: ниши / отложение / заметки
      case "list_niches": return json({ niches: await listNiches() });
      case "create_niche": {
        const name = normNicheName(body.name);
        if (!name) return json({ error: "no_name" }, 400);
        const { data, error } = await db.from("niches").insert({ name, created_by_tg_id: me.tg_id }).select("*").single();
        if (error) {
          if (String(error.code) === "23505") {   // уже есть с таким же именем (без регистра) — отдаём её
            const { data: ex } = await db.from("niches").select("*").eq("name_key", name.toLowerCase()).maybeSingle();
            return json({ niche: ex, existed: true });
          }
          return json({ error: "server", detail: error.message }, 500);
        }
        return json({ niche: data });
      }
      case "rename_niche": {
        const name = normNicheName(body.name);
        if (!name) return json({ error: "no_name" }, 400);
        const { data, error } = await db.from("niches").update({ name }).eq("id", body.id).select("*").maybeSingle();
        if (error) return json({ error: String(error.code) === "23505" ? "niche_exists" : "server", detail: error.message },
                               String(error.code) === "23505" ? 409 : 500);
        if (!data) return json({ error: "not_found" }, 404);
        return json({ niche: data });
      }
      case "delete_niche": {
        // Ниша исчезает, крео остаются (связи снимет FK cascade). Только админ.
        if (!isAdmin) return json({ error: "admin_only" }, 403);
        await db.from("niches").delete().eq("id", body.id);
        return json({ ok: true, id: body.id });
      }
      case "set_creo_niches": {
        const ids = normNicheIds(body.niche_ids);
        const { data, error } = await db.rpc("set_creo_niches", { p_creo_id: body.id, p_niche_ids: ids, p_by: me.tg_id });
        if (error) return json({ error: "server", detail: error.message }, 500);
        return json({ id: body.id, niche_ids: data ?? ids });
      }
      case "set_notes": {
        const notes = normNotes(body.notes);
        const { data } = await db.from("creos").update({ notes, notes_updated_at: nowIso(), notes_by_tg_id: me.tg_id })
          .eq("id", body.id).select("id, notes, notes_updated_at, notes_by_tg_id").maybeSingle();
        if (!data) return json({ error: "not_found" }, 404);
        return json({ creo: data });
      }
      case "defer_creo":
      case "restore_creo": {
        const { data: cur } = await db.from("creos").select("*").eq("id", body.id).maybeSingle();
        const r = action === "defer_creo" ? deferPatch({ cur, me: me.tg_id, nowIso: nowIso() }) : restorePatch({ cur });
        if (!r.ok) return json({ error: r.error }, r.error === "not_found" ? 404 : 400);
        let row = cur;
        if (!r.noop) {
          const { data } = await db.from("creos").update(r.patch).eq("id", body.id).select("*").maybeSingle();
          row = data ?? cur;
        }
        await withMedia([row]); await attachNiches([row]);
        return json({ creo: row });
      }

      case "delete_creo": {
        const { data: c } = await db.from("creos").select("author_tg_id").eq("id", body.id).maybeSingle();
        if (!c) return json({ error: "not_found" }, 404);
        if (!isAdmin && c.author_tg_id !== me.tg_id) return json({ error: "forbidden" }, 403);
        await db.from("creos").delete().eq("id", body.id);
        return json({ ok: true, id: body.id });
      }

      case "sign_upload": {
        const safe = String(body.name ?? "file").replace(/[^\w.\-]+/g, "_").slice(-60) || "file";
        const path = me.tg_id + "/" + Date.now() + "_" + Math.random().toString(36).slice(2, 8) + "_" + safe;
        const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path);
        if (error) return json({ error: "sign_failed", detail: error.message }, 500);
        return json({ path, signedUrl: data.signedUrl, token: data.token });
      }

      case "sign_download": {
        // Свежая короткая подписанная ссылка на ОДИН файл крео для скачивания на устройство.
        // Путь берётся только из массива самого крео (logic.downloadTarget) — это не оракул
        // «подпиши что угодно». `download=<имя>` → Storage отдаёт Content-Disposition: attachment
        // (нужно fallback-режимам без File System Access). Статус/исполнитель не важны:
        // исходник качает любой член команды, не забирая крео в работу.
        const { data: cur, error: lookupError } = await db.from("creos")
          .select("id, source_paths, storage_paths, result_paths").eq("id", body.id).maybeSingle();
        if (lookupError) return json({ error: "lookup_failed" }, 500);
        if (!cur) return json({ error: "not_found" }, 404);
        const t = downloadTarget({ cur, field: body.field, index: body.index });
        if (!t.ok || !t.path) return json({ error: t.error }, t.error === "bad_field" ? 400 : 404);
        const { data, error } = await db.storage.from(BUCKET).createSignedUrl(t.path, 600, { download: t.name });
        if (error || !data?.signedUrl) return json({ error: "sign_failed", detail: error?.message }, 500);
        return json({ id: cur.id, field: body.field, index: Number(body.index), path: t.path, name: t.name,
          url: data.signedUrl, expires_in: 600 });
      }

      case "create_upload_creo": {
        const paths = Array.isArray(body.paths) ? body.paths.filter(Boolean) : [];
        if (!paths.length) return json({ error: "no_files" }, 400);
        const kind = body.kind || (paths.length > 1 ? "album" : "photo");
        const cap = body.caption || null;
        const { data } = await db.from("creos").insert({
          author_tg_id: me.tg_id, author_username: me.username, kind,
          result_paths: paths, storage_paths: paths, caption: cap, result_caption: cap,
          status: "done", done_at: nowIso(), delivered_at: nowIso(), delivery_state: "pending",
          assignee_tg_id: me.tg_id, claimed_at: nowIso(), source_state: "none",
        }).select("*").single();
        if (data && Array.isArray(body.niche_ids) && body.niche_ids.length)
          await db.rpc("set_creo_niches", { p_creo_id: data.id, p_niche_ids: normNicheIds(body.niche_ids), p_by: me.tg_id });
        await withMedia([data]); await attachNiches([data]);
        return json({ creo: data });
      }

      case "stats": {
        const creos = await fetchAll((a, b) => db.from("creos")
          .select("status, author_username, posters, created_at, done_at, deferred_at").order("id", { ascending: true }).range(a, b));
        return json({ stats: computeStats(creos ?? []) });
      }

      case "create_task": {
        const ids = normIds(body.assignee_tg_ids).length ? normIds(body.assignee_tg_ids)
          : (body.assignee_tg_id ? [Number(body.assignee_tg_id)] : []);
        const { data } = await db.from("tasks").insert({
          title: String(body.title ?? "").slice(0, 500) || "—",
          assignee_tg_id: ids[0] ?? null, assignee_tg_ids: ids,
          due_date: body.due_date ?? null, priority: body.priority ?? null, created_by_tg_id: me.tg_id,
        }).select("*").single();
        return json({ task: data });
      }
      case "update_task": {
        const patch: any = {};
        for (const k of ["title", "assignee_tg_id", "assignee_tg_ids", "due_date", "priority", "status", "pinned", "position"]) if (k in body) patch[k] = body[k];
        if ("assignee_tg_ids" in patch) {
          const ids = normIds(patch.assignee_tg_ids);
          patch.assignee_tg_ids = ids; patch.assignee_tg_id = ids[0] ?? null;
        }
        if ("status" in patch) patch.done_at = patch.status === "done" ? nowIso() : null;
        const { data } = await db.from("tasks").update(patch).eq("id", body.id).select("*").single();
        return json({ task: data });
      }
      case "delete_task": {
        const { data: t } = await db.from("tasks").select("created_by_tg_id").eq("id", body.id).maybeSingle();
        if (t && !isAdmin && t.created_by_tg_id !== me.tg_id) return json({ error: "forbidden" }, 403);
        await db.from("tasks").delete().eq("id", body.id);
        return json({ ok: true, id: body.id });
      }

      case "set_member_roles": {
        if (!isAdmin) return json({ error: "admin_only" }, 403);
        const roles = normRoles(body.roles);
        const { data } = await db.from("members")
          .update({ roles, role: roles.includes("admin") ? "admin" : "user" })
          .eq("tg_id", body.tg_id).select("*").single();
        if (data) (data as any).roles = normRoles((data as any).roles);
        return json({ member: data });
      }
      case "add_member": {
        if (!isAdmin) return json({ error: "admin_only" }, 403);
        const roles = normRoles(body.roles);
        const { data } = await db.from("members").upsert({
          tg_id: body.tg_id, username: body.username ?? null, name: body.name ?? null,
          role: roles.includes("admin") ? "admin" : "user", roles,
        }, { onConflict: "tg_id" }).select("*").single();
        if (data) (data as any).roles = normRoles((data as any).roles);
        return json({ member: data });
      }
      case "remove_member": {
        if (!isAdmin) return json({ error: "admin_only" }, 403);
        if (String(body.tg_id) === String(me.tg_id)) return json({ error: "cant_remove_self" }, 400);
        await db.from("members").delete().eq("tg_id", body.tg_id);
        return json({ ok: true, tg_id: body.tg_id });
      }

      // -------------------------------------------------- АДМИНКА (бот-доступ + ВФ)
      case "admin_data": {
        if (!isAdmin) return json({ error: "admin_only" }, 403);
        const { data: users } = await db.from("bot_users").select("*")
          .order("approved", { ascending: false }).order("tg_id");
        const { data: requests } = await db.from("access_requests").select("*")
          .eq("status", "pending").order("created_at", { ascending: true });
        const { data: wfs } = await db.from("workflows_config").select("*").order("key");
        return json({ users: users ?? [], requests: requests ?? [], workflows: wfs ?? [] });
      }
      case "admin_cmd": {
        if (!isAdmin) return json({ error: "admin_only" }, 403);
        const ALLOWED = ["approve", "deny", "add_user", "remove_user", "set_admin", "set_gen", "set_uniq", "set_agent"];
        if (!ALLOWED.includes(body.cmd)) return json({ error: "bad_cmd" }, 400);
        // Повышать/понижать админов бота может только bootstrap-админ (KREO_ADMIN_IDS = владелец
        // бота) — та же матрица, что в Telegram; бот проверяет requested_by ещё раз (ревью R9)
        if (body.cmd === "set_admin" && !ADMIN_IDS.includes(String(me.tg_id))) return json({ error: "owner_only" }, 403);
        const payload = (body.payload && typeof body.payload === "object") ? body.payload : {};
        const { data } = await db.from("admin_queue")
          .insert({ action: body.cmd, payload, requested_by: me.tg_id }).select("id").single();
        return json({ ok: true, id: data?.id });
      }
      case "set_workflow": {
        if (!isAdmin) return json({ error: "admin_only" }, 403);
        if (!body.key) return json({ error: "no_key" }, 400);
        const patch: any = { key: body.key, updated_at: nowIso() };
        for (const k of ["enabled", "title", "instance_type", "defaults"]) if (k in body) patch[k] = body[k];
        const { data } = await db.from("workflows_config").upsert(patch, { onConflict: "key" }).select("*").single();
        return json({ workflow: data });
      }

      // -------------------------------------------------- ТРЕКЕР ИСТОЧНИКОВ (Кейтаро)
      // Аккаунты соцсетей → именованные invite-ссылки канала (создаёт БОТ), вступления
      // по ним пишет БОТ (chat_member) в track_joins. Edge только читает + управляет строками.
      case "track_data": {
        const accounts = await fetchAll((a, b) => db.from("track_accounts").select("*")
          .order("created_at", { ascending: false }).range(a, b));
        const ids = (accounts ?? []).map((a: any) => a.id);
        let joins: any[] = [];
        if (ids.length) {   // все вступления, не первая тысяча — иначе цифры расходятся с отчётом бота (R10)
          joins = await fetchAll((a, b) => db.from("track_joins").select("account_id, joined_at")
            .in("account_id", ids).order("id", { ascending: true }).range(a, b));
        }
        const since = Date.now() - 24 * 3600 * 1000;
        const per: Record<number, { total: number; d1: number }> = {};
        for (const a of accounts ?? []) per[a.id] = { total: 0, d1: 0 };
        for (const jn of joins) {
          const p = per[jn.account_id]; if (!p) continue;
          p.total++; if (new Date(jn.joined_at).getTime() >= since) p.d1++;
        }
        for (const a of accounts ?? []) { a.joins = per[a.id].total; a.joins_24h = per[a.id].d1; }
        return json({ accounts: accounts ?? [] });
      }
      case "track_add": {
        const PLATFORMS = ["instagram", "x", "tiktok", "threads", "reddit"];
        const platform = String(body.platform ?? "");
        if (!PLATFORMS.includes(platform)) return json({ error: "bad_platform" }, 400);
        const name = String(body.account_name ?? "").trim().slice(0, 80);
        if (!name) return json({ error: "no_name" }, 400);
        // code = имя invite-ссылки (<=32, ascii-safe) + рандом для уникальности
        const base = platform.slice(0, 3) + "_" + name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 16);
        let code = "";
        for (let i = 0; i < 6; i++) {
          const cand = (base + "_" + Math.random().toString(36).slice(2, 7)).slice(0, 32);
          const { data: ex } = await db.from("track_accounts").select("id").eq("code", cand).maybeSingle();
          if (!ex) { code = cand; break; }
        }
        if (!code) return json({ error: "code_gen" }, 500);
        const { data, error } = await db.from("track_accounts")
          .insert({ owner_tg_id: me.tg_id, platform, account_name: name, code })
          .select("*").single();
        if (error) return json({ error: "insert_failed", detail: error.message }, 500);
        (data as any).joins = 0; (data as any).joins_24h = 0;
        return json({ account: data });
      }
      case "track_delete": {
        const { data: a } = await db.from("track_accounts")
          .select("owner_tg_id, invite_link").eq("id", body.id).maybeSingle();
        if (!a) return json({ error: "not_found" }, 404);
        if (!isAdmin && a.owner_tg_id !== me.tg_id) return json({ error: "forbidden" }, 403);
        if (a.invite_link) {   // ссылка уже создана → бот отзовёт её в канале, потом снесёт строку
          await db.from("track_accounts").update({ pending_revoke: true }).eq("id", body.id);
          return json({ ok: true, id: body.id, pending: true });
        }
        await db.from("track_accounts").delete().eq("id", body.id);
        return json({ ok: true, id: body.id });
      }

      default: return json({ error: "unknown_action" }, 400);
    }
  } catch (e) { return json({ error: "server", detail: String(e) }, 500); }
});
