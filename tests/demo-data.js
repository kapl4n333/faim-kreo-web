// Фикстуры + локальный «сервер» для tests/demo.html и tests/run.html.
// Использует ТУ ЖЕ логику, что Edge (logic.js), чтобы фронт проверялся против настоящего контракта.
// К настоящему API не обращается. Не подключать в production.
import { statusTransition, mergePaths, normNicheName, nicheKey, normNicheIds, deferPatch, restorePatch, normNotes, deliverExtra, downloadTarget }
  from "../supabase/functions/kreo-api/logic.js";

const svg = (bg, txt) => "data:image/svg+xml;utf8," + encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='480' height='480'><rect width='100%' height='100%' fill='${bg}'/>` +
  `<text x='50%' y='52%' font-family='sans-serif' font-size='44' fill='#fff' text-anchor='middle' opacity='.85'>${txt}</text></svg>`);
const now = Date.now(), ago = (h) => new Date(now - h * 3600e3).toISOString();

export function makeFixtures(meId = 1) {
  const members = [
    { tg_id: 1, username: "kaplan", name: "Каплан", roles: ["admin", "creative"] },
    { tg_id: 2, username: "olga", name: "Оля", roles: ["creative"] },
    { tg_id: 3, username: "max", name: "Макс", roles: ["uploader"] },
  ];
  const niches = [
    { id: 1, name: "Косплей", created_by_tg_id: 1 }, { id: 2, name: "Фитнес", created_by_tg_id: 2 },
    { id: 3, name: "Пляж", created_by_tg_id: 1 },
  ];
  const base = (id, o) => Object.assign({ id, author_tg_id: 2, author_username: "olga", kind: "link", source_chat_id: -100, source_msg_id: 1000 + id,
    downloaded_msg_id: 2000 + id, source_url: "https://www.tiktok.com/@x/video/" + (7000000 + id), file_ids: ["f" + id], caption: null,
    status: "queued", assignee_tg_id: null, claimed_at: null, storage_paths: [], result_paths: [], delivered_at: null, delivery_state: null,
    ready_msg_id: null, ready_msg_ids: [], posters: [], created_at: ago(id * 5), done_at: null, result_caption: null,
    preview_poster: null, preview_clip: null, source_paths: ["sources/" + id + "/0.mp4"], source_poster: "previews/" + id + "/src_poster.jpg",
    source_clip: null, source_state: "ready", deferred_at: null, deferred_by_tg_id: null, notes: null, notes_updated_at: null, notes_by_tg_id: null,
    niche_ids: [] }, o);
  const creos = [
    base(1, { caption: "Референс: девушка в кафе, переход через стакан ☕", niche_ids: [3] }),
    base(2, { kind: "video", source_url: null, downloaded_msg_id: null, source_state: "too_big", source_paths: [], source_poster: null, caption: "Танец у зеркала (тяжёлое видео)" }),
    base(3, { kind: "photo", source_url: null, downloaded_msg_id: null, status: "in_progress", assignee_tg_id: meId, claimed_at: ago(3), niche_ids: [1], caption: "Косплей: Ада Вонг, ночной город", notes: "Свет холоднее, костюм как на 2-м фото", notes_updated_at: ago(1), notes_by_tg_id: meId }),
    base(4, { kind: "album", source_url: null, downloaded_msg_id: null, status: "in_progress", assignee_tg_id: 2, claimed_at: ago(10), niche_ids: [2], caption: "Фитнес-сет: 3 фото, зал", source_paths: ["sources/4/0.jpg", "sources/4/1.jpg", "sources/4/2.jpg"] }),
    base(5, { status: "done", assignee_tg_id: 2, claimed_at: ago(30), done_at: ago(20), delivered_at: ago(20), delivery_state: "sent", ready_msg_id: 555, ready_msg_ids: [555, 556],
      result_paths: ["2/1_a1_final_v1.jpg", "2/2_b2_final_v2.mp4"], result_caption: "Готово — версия с новым светом", posters: [{ tg_id: 3, username: "max", at: ago(2) }], niche_ids: [1, 3], preview_poster: "previews/5/poster.jpg", preview_clip: "previews/5/clip.mp4", duration_sec: 14 }),
    base(6, { deferred_at: ago(4), deferred_by_tg_id: 1, caption: "Отложено: идея с дождём — ждём осень" }),
    base(7, { kind: "text", source_url: null, downloaded_msg_id: null, file_ids: [], source_paths: [], source_poster: null, source_state: "none", caption: "Идея: 'день из жизни' с закадровым голосом, 3 локации" }),
    base(8, { status: "done", assignee_tg_id: meId, claimed_at: ago(50), done_at: ago(40), delivered_at: ago(40), delivery_state: "pending", result_paths: ["1/3_c3_out.jpg"], result_caption: "Пробный рендер" }),
    base(9, { kind: "link", source_state: null, source_paths: [], source_poster: null, caption: "Только что кинули — исходник ещё готовится" }),
    base(10, { kind: "link", source_state: "none", source_paths: [], source_poster: null, downloaded_msg_id: null, caption: "Старая ссылка без скачанного видео" }),
  ];
  for (let i = 11; i <= 26; i++) creos.push(base(i, { caption: ["Уличная съёмка", "Спортзал утро", "Кафе, дождь", "Бассейн", "Ночной неон"][i % 5] + " #" + i,
    status: i % 3 === 0 ? "done" : i % 3 === 1 ? "queued" : "in_progress", assignee_tg_id: i % 3 === 0 ? 2 : i % 3 === 2 ? (i % 2 ? meId : 3) : null,
    done_at: i % 3 === 0 ? ago(i) : null, delivered_at: i % 3 === 0 ? ago(i) : null, delivery_state: i % 3 === 0 ? "sent" : null, ready_msg_id: i % 3 === 0 ? 600 + i : null,
    result_paths: i % 3 === 0 ? ["2/" + i + "_x_res.jpg"] : [], niche_ids: i % 4 === 0 ? [2] : i % 4 === 1 ? [1] : [] }));
  const tasks = [
    { id: 1, title: "Собрать 5 референсов для пляжной серии", assignee_tg_id: 2, assignee_tg_ids: [2], due_date: "2026-09-20", priority: "high", status: "queued", pinned: true, position: 0, created_by_tg_id: 1, created_at: ago(30) },
    { id: 2, title: "Проверить звук у крео #5", assignee_tg_ids: [meId], due_date: null, priority: "med", status: "queued", pinned: false, position: 1, created_by_tg_id: 2, created_at: ago(10) },
    { id: 3, title: "Обновить куки Instagram", assignee_tg_ids: [], priority: "low", status: "done", done_at: ago(5), pinned: false, position: 2, created_by_tg_id: 1, created_at: ago(60) },
  ];
  const accounts = [
    { id: 1, owner_tg_id: meId, platform: "instagram", account_name: "@ava.daily", code: "ins_avadaily_a1b2c", invite_link: "https://t.me/+AbCdEf123", joins: 42, joins_24h: 3, created_at: ago(200) },
    { id: 2, owner_tg_id: 2, platform: "tiktok", account_name: "@ava.tt", code: "tik_avatt_x9y8z", invite_link: "https://t.me/+ZyXwV987", joins: 17, joins_24h: 0, created_at: ago(150) },
  ];
  const batches = [
    {id:301,created_by_tg_id:meId,account_id:1,account_label:"instagram:ava.daily",mode:"scheduled",deliver_at:new Date(now+18*3600e3).toISOString(),timezone:"Europe/Warsaw",default_level:"medium",status:"preparing",revision:1,created_at:ago(1),updated_at:ago(.2),items:[
      {id:1,batch_id:301,creo_id:5,position:0,source_path:"2/2_b2_final_v2.mp4",source_name:"Новый свет",uniq_level:"medium",prep_state:"ready",poster_url:svg("#8A6135","01")},
      {id:2,batch_id:301,creo_id:15,position:1,source_path:"2/15.mp4",source_name:"Кафе",uniq_level:"strong",prep_state:"processing",poster_url:svg("#5B8C7E","02")},
      {id:3,batch_id:301,creo_id:18,position:2,source_path:"2/18.mp4",source_name:"Неон",uniq_level:"medium",prep_state:"queued",poster_url:svg("#9A6B96","03")}]},
    {id:298,created_by_tg_id:meId,account_id:null,account_label:null,mode:"immediate",deliver_at:null,timezone:"Europe/Warsaw",default_level:"weak",status:"sent",revision:1,created_at:ago(30),updated_at:ago(28),sent_at:ago(28),items:[
      {id:4,batch_id:298,creo_id:5,position:0,source_path:"2/2_b2_final_v2.mp4",prepared_path:"deliveries/298/4/v1.mp4",source_name:"Новый свет",uniq_level:"weak",prep_state:"ready",poster_url:svg("#3f5f8a","01")}]}];
  return { members, niches, creos, tasks, accounts, batches };
}

/** Подписанные URL «сервера»: меняются с каждым bootstrap (как настоящие signed URL).
 *  db.unsigned — Set путей, которые «не подписались» → слот null (выравнивание по индексу, как в edge). */
function sign(db, c) {
  const t = db.urlGen;
  const u = (p, i) => (db.unsigned && db.unsigned.has(p)) ? null
    : svg(["#8A6135", "#5B8C7E", "#9A6B96", "#B05C5C", "#3f5f8a"][(p.length + i) % 5], p.split("/").pop().slice(0, 14)) + "#s=" + t;
  c.source_urls = (c.source_paths || []).map((p, i) => u(p, i));
  c.result_urls = (c.result_paths || []).map((p, i) => u(p, i));
  c.media_urls = (c.storage_paths || []).map((p, i) => u(p, i));
  c.source_poster_url = c.source_poster ? u(c.source_poster, 7) : null;
  c.source_clip_url = c.source_clip ? u(c.source_clip, 8) : null;
  c.preview_url = c.preview_poster ? u(c.preview_poster, 9) : null;
  c.clip_url = c.preview_clip ? u(c.preview_clip, 10) : null;
  return c;
}
const clone = (x) => JSON.parse(JSON.stringify(x));

/** Локальный сервер. opts.fail = {action: Error|true} — имитация сети/ошибки. */
export function makeServer(meId = 1, fx) {
  const db = Object.assign({ urlGen: 1, nextId: 100, nextNiche: 10, nextTask: 10, log: [] }, fx || makeFixtures(meId));
  const me = () => db.members.find((m) => m.tg_id === meId);
  const isAdmin = () => me().roles.includes("admin");
  const nowIso = () => new Date().toISOString();
  const find = (id) => db.creos.find((c) => c.id === +id);
  const out = (c) => sign(db, clone(c));
  const stats = () => ({ total: db.creos.length, byStatus: { queued: db.creos.filter((c) => !c.deferred_at && c.status === "queued").length,
    in_progress: db.creos.filter((c) => !c.deferred_at && c.status === "in_progress").length, done: db.creos.filter((c) => !c.deferred_at && c.status === "done").length },
    posted: db.creos.filter((c) => c.posters.length).length, deferred: db.creos.filter((c) => c.deferred_at).length,
    byAuthor: [{ author: "olga", submitted: 20, done: 6, posted: 2 }], byPoster: [{ poster: "max", posted: 2 }], avgTurnaroundHours: 9.5, avgPostLagHours: 3.1 });
  const fail = (e, code) => { const err = new Error(e); err.code = code; throw err; };
  const server = {
    db,
    async handle(action, p) {
      p = p || {}; db.log.push([action, clone(p)]);
      if (server.fail && server.fail[action]) { const f = server.fail[action]; if (f === true) throw new Error("Failed to fetch"); throw f; }
      switch (action) {
        case "bootstrap": db.urlGen++; return { me: clone(me()), isAdmin: isAdmin(), creos: db.creos.map(out), tasks: clone(db.tasks), members: clone(db.members), niches: clone(db.niches), stats: stats() };
        case "delivery_list": return {batches:clone(db.batches||[]),accounts:clone(db.accounts.filter(a=>isAdmin()||a.owner_tg_id===meId))};
        case "claim_creo": case "set_creo_status": {
          const cur = find(p.id); const target = action === "claim_creo" ? "in_progress" : p.status;
          const tr = statusTransition({ cur, me: meId, isAdmin: isAdmin(), target, nowIso: nowIso() });
          if (!tr.ok) { const err = new Error(tr.error); err.data = { error: tr.error, creo: cur ? out(cur) : undefined }; throw err; }
          if (!tr.noop) Object.assign(cur, tr.patch);
          return { creo: out(cur) };
        }
        case "assign_creo": { if (!isAdmin()) fail("admin_only"); const c = find(p.id); const to = p.assignee_tg_id ? +p.assignee_tg_id : null;
          Object.assign(c, { assignee_tg_id: to, claimed_at: to ? nowIso() : null, status: to ? "in_progress" : "queued", done_at: null }); return { creo: out(c) }; }
        case "toggle_posted": { const c = find(p.id); const has = c.posters.some((x) => x.tg_id === meId);
          c.posters = has ? c.posters.filter((x) => x.tg_id !== meId) : c.posters.concat([{ tg_id: meId, username: me().username, at: nowIso() }]); return { creo: out(c) }; }
        case "sign_upload": return { path: meId + "/" + Date.now() + "_" + Math.random().toString(36).slice(2, 6) + "_" + p.name, signedUrl: null, token: null };
        case "sign_download": {   // тот же узкий контракт, что edge: путь только из массива крео
          const t = downloadTarget({ cur: find(p.id), field: p.field, index: p.index }); if (!t.ok) fail(t.error);
          db.dlGen = (db.dlGen || 0) + 1;
          const url = server.dlUrl ? server.dlUrl(t) : svg("#2f4f4f", "dl " + t.name.slice(0, 12)) + "#dl=" + db.dlGen + "&download=" + encodeURIComponent(t.name);
          return { id: +p.id, field: p.field, index: +p.index, path: t.path, name: t.name, url, expires_in: 600 };
        }
        case "deliver_creo": { const c = find(p.id); if (!c) fail("not_found"); c.result_paths = mergePaths(c.result_paths, p.paths);
          Object.assign(c, deliverExtra({ caption: p.caption, nowIso: nowIso() }));
          if (Array.isArray(p.niche_ids)) c.niche_ids = normNicheIds(p.niche_ids).filter((id) => db.niches.some((n) => n.id === id)); return { creo: out(c) }; }
        case "create_upload_creo": { const c = Object.assign(makeFixtures(meId).creos[6], { id: db.nextId++, kind: p.kind, author_tg_id: meId, author_username: me().username, caption: p.caption, result_caption: p.caption,
          result_paths: p.paths, storage_paths: p.paths, status: "done", done_at: nowIso(), delivered_at: nowIso(), delivery_state: "pending", assignee_tg_id: meId, source_state: "none", created_at: nowIso(),
          niche_ids: normNicheIds(p.niche_ids || []), source_msg_id: null, downloaded_msg_id: null, source_url: null, file_ids: [] }); db.creos.unshift(c); return { creo: out(c) }; }
        case "delete_creo": db.creos = db.creos.filter((c) => c.id !== +p.id); return { ok: true };
        case "list_niches": return { niches: clone(db.niches) };
        case "create_niche": { const name = normNicheName(p.name); if (!name) fail("no_name");
          const ex = db.niches.find((n) => nicheKey(n.name) === nicheKey(name)); if (ex) return { niche: clone(ex), existed: true };
          const n = { id: db.nextNiche++, name, created_by_tg_id: meId }; db.niches.push(n); return { niche: clone(n) }; }
        case "rename_niche": { const name = normNicheName(p.name); if (!name) fail("no_name");
          if (db.niches.some((n) => n.id !== +p.id && nicheKey(n.name) === nicheKey(name))) fail("niche_exists");
          const n = db.niches.find((x) => x.id === +p.id); if (!n) fail("not_found"); n.name = name; return { niche: clone(n) }; }
        case "delete_niche": if (!isAdmin()) fail("admin_only"); db.niches = db.niches.filter((n) => n.id !== +p.id); db.creos.forEach((c) => c.niche_ids = c.niche_ids.filter((x) => x !== +p.id)); return { ok: true };
        case "set_creo_niches": { const c = find(p.id); c.niche_ids = normNicheIds(p.niche_ids).filter((id) => db.niches.some((n) => n.id === id)); return { id: c.id, niche_ids: c.niche_ids.slice() }; }
        case "set_notes": { const c = find(p.id); if (!c) fail("not_found"); Object.assign(c, { notes: normNotes(p.notes), notes_updated_at: nowIso(), notes_by_tg_id: meId });
          return { creo: { id: c.id, notes: c.notes, notes_updated_at: c.notes_updated_at, notes_by_tg_id: meId } }; }
        case "defer_creo": case "restore_creo": { const c = find(p.id); const r = action === "defer_creo" ? deferPatch({ cur: c, me: meId, nowIso: nowIso() }) : restorePatch({ cur: c });
          if (!r.ok) fail(r.error); if (!r.noop) Object.assign(c, r.patch); return { creo: out(c) }; }
        case "create_task": { const t = { id: db.nextTask++, title: p.title, assignee_tg_ids: p.assignee_tg_ids || [], assignee_tg_id: (p.assignee_tg_ids || [])[0] || null, due_date: p.due_date, priority: p.priority, status: "queued", pinned: false, position: 0, created_by_tg_id: meId, created_at: nowIso() }; db.tasks.unshift(t); return { task: clone(t) }; }
        case "update_task": { const t = db.tasks.find((x) => x.id === +p.id); Object.assign(t, p); if ("status" in p) t.done_at = p.status === "done" ? nowIso() : null; return { task: clone(t) }; }
        case "delete_task": db.tasks = db.tasks.filter((t) => t.id !== +p.id); return { ok: true };
        case "add_member": { const m = { tg_id: +p.tg_id, username: p.username || null, name: p.name || null, roles: [] }; db.members.push(m); return { member: clone(m) }; }
        case "set_member_roles": { const m = db.members.find((x) => x.tg_id === +p.tg_id); m.roles = p.roles; return { member: clone(m) }; }
        case "remove_member": db.members = db.members.filter((m) => m.tg_id !== +p.tg_id); return { ok: true };
        case "track_data": return { accounts: clone(db.accounts) };
        case "track_add": { const a = { id: 50 + db.accounts.length, owner_tg_id: meId, platform: p.platform, account_name: p.account_name, invite_link: null, joins: 0, joins_24h: 0 }; db.accounts.unshift(a); return { account: clone(a) }; }
        case "track_delete": db.accounts = db.accounts.filter((a) => a.id !== +p.id); return { ok: true };
        case "funnel_data": return { days: p.days || 30, funnels: [{ id: 1, name: "Ava Carter",
          report: { acquisition_unique_users: 59, buyers: 4, gross_stars: 1500, usd_estimate: 19.5,
            net_observed_movement: 5, churn_count: 2, last_successful_pull_at: nowIso(), geo_rows: { GB: 1, US: 1 } },
          sources: (db.accounts || []).map((a, i) => ({ funnel_id: 1, source_account_id: a.id,
            source_account: a.account_name, source_platform: a.platform, acquired: a.joins || 0,
            buyers: i === 0 ? 1 : 0, conv_pct: i === 0 ? 2.1 : 0, stars_total: i === 0 ? 200 : 0,
            usd_estimate_total: i === 0 ? 2.6 : 0 })) }] };
        case "admin_data": return { users: [{ tg_id: 1, name: "Каплан", username: "kaplan", approved: true, is_admin: true, is_owner: true, agent_ok: true }, { tg_id: 2, name: "Оля", approved: true, is_admin: false, no_gen: false, no_uniq: true }], requests: [{ tg_id: 9, name: "Новичок" }], workflows: [{ key: "krea2_face_swap", title: "🎭 Krea2 Face Swap", enabled: true, instance_type: null }] };
        case "admin_cmd": return { ok: true, id: 1 };
        case "set_workflow": return { workflow: Object.assign({ key: p.key, title: "🎭 Krea2 Face Swap" }, p) };
        default: fail("unknown_action");
      }
    },
  };
  return server;
}
