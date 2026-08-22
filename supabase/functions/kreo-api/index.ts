// kreo-api — шлюз Telegram Mini App (FTask) к реестру + админка.
// Auth: Telegram initData (HMAC по BOT_TOKEN) → verify_jwt=false. Данные/Storage — service_role.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

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
  const key = await crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
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
    if (c.preview_poster) all.push(c.preview_poster);   // Склад: постер для сетки истории
    if (c.preview_clip) all.push(c.preview_clip);       // Склад: hover-клип
  }
  if (!all.length) return creos;
  const map = await signPaths(all);
  for (const c of creos) {
    c.media_urls = (c.storage_paths || []).map((p: string) => map[p]).filter(Boolean);
    c.result_urls = (c.result_paths || []).map((p: string) => map[p]).filter(Boolean);
    c.preview_url = c.preview_poster ? (map[c.preview_poster] || null) : null;
    c.clip_url = c.preview_clip ? (map[c.preview_clip] || null) : null;
  }
  return creos;
}

function computeStats(creos: any[]) {
  const byStatus: Record<string, number> = { queued: 0, in_progress: 0, done: 0 };
  const byAuthor: Record<string, { submitted: number; done: number; posted: number }> = {};
  const byPoster: Record<string, number> = {};
  let tS = 0, tN = 0, pS = 0, pN = 0, postedTotal = 0;
  for (const c of creos) {
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
    total: creos.length, byStatus, posted: postedTotal,
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
        const { data: creos } = await db.from("creos").select("*").order("created_at", { ascending: false });
        await withMedia(creos ?? []);
        if (action === "list_creos") return json({ creos });
        const { data: tasks } = await db.from("tasks").select("*")
          .order("pinned", { ascending: false }).order("position", { ascending: true }).order("created_at", { ascending: false });
        const { data: members } = await db.from("members").select("tg_id, username, name, role, roles");
        (members ?? []).forEach((m: any) => m.roles = normRoles(m.roles));
        return json({ me, isAdmin, creos, tasks, members, stats: computeStats(creos ?? []) });
      }

      case "set_creo_status": {
        const status = body.status;
        if (!["queued", "in_progress", "done"].includes(status)) return json({ error: "bad_status" }, 400);
        const patch: any = { status, done_at: status === "done" ? nowIso() : null };
        if (status === "in_progress") { if (body.claim) patch.assignee_tg_id = me.tg_id; patch.claimed_at = nowIso(); }
        if (status === "queued") { patch.assignee_tg_id = null; patch.claimed_at = null; }
        const { data } = await db.from("creos").update(patch).eq("id", body.id).select("*").single();
        await withMedia([data]);
        return json({ creo: data });
      }

      case "toggle_posted": {
        const { data: cur } = await db.from("creos").select("posters").eq("id", body.id).single();
        let posters = Array.isArray(cur?.posters) ? cur.posters : [];
        const has = posters.some((p: any) => String(p.tg_id) === String(me.tg_id));
        posters = has
          ? posters.filter((p: any) => String(p.tg_id) !== String(me.tg_id))
          : [...posters, { tg_id: me.tg_id, username: me.username, at: nowIso() }];
        const { data } = await db.from("creos").update({ posters }).eq("id", body.id).select("*").single();
        await withMedia([data]);
        return json({ creo: data });
      }

      case "claim_creo": {
        const patch: any = { status: "in_progress", assignee_tg_id: me.tg_id, claimed_at: nowIso() };
        const { data } = await db.from("creos").update(patch).eq("id", body.id).select("*").single();
        await withMedia([data]);
        return json({ creo: data });
      }

      case "assign_creo": {
        if (!isAdmin) return json({ error: "admin_only" }, 403);
        const to = body.assignee_tg_id ? Number(body.assignee_tg_id) : null;
        const patch: any = { assignee_tg_id: to, claimed_at: to ? nowIso() : null };
        if (to && (body.setInProgress ?? true)) patch.status = "in_progress";
        if (!to) patch.status = "queued";
        const { data } = await db.from("creos").update(patch).eq("id", body.id).select("*").single();
        await withMedia([data]);
        return json({ creo: data });
      }

      case "deliver_creo": {
        const paths = Array.isArray(body.paths) ? body.paths.filter(Boolean) : [];
        if (!paths.length) return json({ error: "no_files" }, 400);
        const { data: cur } = await db.from("creos").select("result_paths").eq("id", body.id).single();
        const merged = [...((cur?.result_paths as string[]) || []), ...paths];
        const patch: any = {
          result_paths: merged, status: "done", done_at: nowIso(),
          delivered_at: nowIso(), delivery_state: "pending",
        };
        if (body.caption != null) patch.result_caption = String(body.caption).slice(0, 1024);
        const { data } = await db.from("creos").update(patch).eq("id", body.id).select("*").single();
        await withMedia([data]);
        return json({ creo: data });
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

      case "create_upload_creo": {
        const paths = Array.isArray(body.paths) ? body.paths.filter(Boolean) : [];
        if (!paths.length) return json({ error: "no_files" }, 400);
        const kind = body.kind || (paths.length > 1 ? "album" : "photo");
        const cap = body.caption || null;
        const { data } = await db.from("creos").insert({
          author_tg_id: me.tg_id, author_username: me.username, kind,
          result_paths: paths, storage_paths: paths, caption: cap, result_caption: cap,
          status: "done", done_at: nowIso(), delivered_at: nowIso(), delivery_state: "pending",
        }).select("*").single();
        await withMedia([data]);
        return json({ creo: data });
      }

      case "stats": {
        const { data: creos } = await db.from("creos")
          .select("status, author_username, posters, created_at, done_at");
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

      default: return json({ error: "unknown_action" }, 400);
    }
  } catch (e) { return json({ error: "server", detail: String(e) }, 500); }
});
