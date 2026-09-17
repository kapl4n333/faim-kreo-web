/* FTask — Публикации: учёт по аккаунтам, недельный план, «Сегодня», пакетное планирование.
   Три независимых статуса публикации: обработка (prepared_state) / доставка (delivery_state) /
   публикация (publish_state). Реестр аккаунтов — track_accounts (S.track). */

const UNIQ_LABELS = { none: "без обработки", weak: "слабая", medium: "средняя", strong: "сильная" };
const DMODE_LABELS = { on_ready: "как готово", before_time: "перед временем", morning: "утром" };

async function loadPubs(force) {
  if (S._pubLoading) return;
  if (S.pubs !== null && !force) return;
  S._pubLoading = true;
  try { const d = await api("pub_list"); S.pubs = d.publications || []; }
  catch (e) { if (S.pubs === null) S.pubs = []; toast(errMsg(e), "err"); }
  finally { S._pubLoading = false; render(); }
}
const pubAccounts = () => (S.track || []).filter(a => !a.archived_at);
const creoById = id => (S.creos || []).find(c => String(c.id) === String(id));
const acctById = id => (S.track || []).find(a => String(a.id) === String(id));
const pubsOf = (creoId, accId) => (S.pubs || []).filter(p =>
  String(p.creo_id) === String(creoId) && (accId == null || String(p.account_id) === String(accId))
  && p.publish_state !== "cancelled");
// «Ролики-кандидаты»: у которых есть готовый результат (их публикуют)
const pubCandidates = () => (S.creos || []).filter(c => Array.isArray(c.result_paths) && c.result_paths.length);

function pubCreoTitle(c) {
  const t = (c.result_caption || c.caption || "").replace(/\s+/g, " ").trim();
  return "#" + c.id + (t ? " · " + esc(t.slice(0, 40)) : "");
}
// Состояние крео на аккаунте: {label,cls,pub}
function acctState(creoId, accId) {
  const ps = pubsOf(creoId, accId);
  if (!ps.length) return { label: "не использован", cls: "st-none" };
  const pub = ps.find(p => p.publish_state === "published")
    || ps.find(p => p.publish_state === "awaiting_confirm") || ps[0];
  if (pub.publish_state === "published")
    return { label: "опубл. " + fmtDay(pub.published_at), cls: "st-pub", pub };
  if (pub.publish_state === "awaiting_confirm")
    return { label: "подтвердить", cls: "st-confirm", pub };
  return { label: pub.planned_at ? "план " + fmtDay(pub.planned_at) : "запланирован", cls: "st-plan", pub };
}
const fmtDay = iso => { if (!iso) return ""; const d = new Date(iso); return isNaN(d) ? "" : (d.getDate() + "." + (d.getMonth() + 1)); };
const fmtDT = iso => { if (!iso) return ""; const d = new Date(iso); return isNaN(d) ? "" : (d.getDate() + "." + (d.getMonth() + 1) + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0")); };

/* ---------- Роутер ---------- */
function vPublish() {
  const accs = pubAccounts();
  let h = '<div class="subnav">' +
    [["lib", "Библиотека"], ["week", "План"], ["today", "Сегодня"]].map(([k, l]) =>
      '<button class="' + (S.pubTab === k ? "on" : "") + '" data-sub="pubTab" data-v="' + k + '">' + l + '</button>').join("") +
    '<button class="miniref" id="pRef" title="Обновить">↻</button></div>';
  if (!accs.length) {
    return h + '<div class="empty"><div class="e-ic">📇</div><div class="e-h">Нет аккаунтов</div>' +
      'Заведи соц-аккаунты в «Трекер → Мои аккаунты» — публикации ведутся по ним.</div>';
  }
  if (S.pubs === null) return h + '<div class="empty" style="padding:34px"><div class="spin"></div></div>';
  if (S.pubTab === "week") return h + vPubWeek(accs);
  if (S.pubTab === "today") return h + vPubToday(accs);
  return h + vPubLibrary(accs);
}
function bindPublish(el) {
  bindSub(el);
  const r = el.querySelector("#pRef"); if (r) r.onclick = () => { haptic(); loadPubs(true); loadTrack(true); };
  if (S.track === null) loadTrack();
  if (S.pubs === null) loadPubs();
  if (S.pubTab === "lib") bindPubLibrary(el);
  else if (S.pubTab === "week") bindPubWeek(el);
  else if (S.pubTab === "today") bindPubToday(el);
}

/* ---------- Библиотека ---------- */
const PUB_FILTERS = [
  ["", "Все"], ["unpub_sel", "Не опубл. на аккаунте"], ["split", "На первом, не на втором"],
  ["nowhere", "Нигде не опубл."], ["planned", "Запланировано"], ["confirm", "Подтвердить"],
];
function libRows(accs) {
  let rows = pubCandidates();
  const sel = S.pubAcc;
  const f = S.pubFilter;
  const a0 = accs[0] && accs[0].id, a1 = accs[1] && accs[1].id;
  rows = rows.filter(c => {
    if (f === "unpub_sel" && sel) return !pubsOf(c.id, sel).some(p => p.publish_state === "published");
    if (f === "split") return a0 && a1 && pubsOf(c.id, a0).some(p => p.publish_state === "published")
      && !pubsOf(c.id, a1).some(p => p.publish_state === "published");
    if (f === "nowhere") return !pubsOf(c.id).some(p => p.publish_state === "published");
    if (f === "planned") return pubsOf(c.id, sel || null).some(p => ["planned", "awaiting_confirm"].includes(p.publish_state));
    if (f === "confirm") return pubsOf(c.id, sel || null).some(p => p.publish_state === "awaiting_confirm");
    return true;
  });
  return rows;
}
function vPubLibrary(accs) {
  let h = '<div class="pubbar"><select id="pAcc"><option value="">Все аккаунты</option>' +
    accs.map(a => '<option value="' + a.id + '"' + (String(S.pubAcc) === String(a.id) ? " selected" : "") + '>' +
      platIcon(a.platform) + " " + esc(a.account_name) + '</option>').join("") + '</select></div>';
  h += '<div class="subnav sub2">' + PUB_FILTERS.map(([k, l]) =>
    '<button class="' + (S.pubFilter === k ? "on" : "") + '" data-pf="' + k + '">' + l + '</button>').join("") + '</div>';
  const rows = libRows(accs);
  const selN = (S.batchSel || []).length;
  if (selN) h += '<div class="batchbar">Выбрано <b>' + selN + '</b> <button class="act plus" id="pBatch">Запланировать</button>' +
    '<button class="miniref" id="pBatchClr">✕</button></div>';
  if (!rows.length) return h + '<div class="empty"><div class="e-ic">🎬</div><div class="e-h">Нет роликов</div>Готовые ролики из «Каталог → Готовые» появятся здесь.</div>';
  h += '<div class="libtbl">';
  for (const c of rows) {
    const on = (S.batchSel || []).map(String).includes(String(c.id));
    h += '<div class="librow">' +
      '<label class="libpick"><input type="checkbox" data-bsel="' + c.id + '"' + (on ? " checked" : "") + '></label>' +
      '<div class="libmain" data-plan="' + c.id + '"><div class="libnm">' + pubCreoTitle(c) + '</div>' +
      '<div class="libacc">' + accs.map(a => {
        const st = acctState(c.id, a.id);
        return '<span class="pchip ' + st.cls + '" data-pcell="' + c.id + ':' + a.id + '">' +
          platIcon(a.platform) + " " + esc(a.account_name.slice(0, 12)) + " · " + st.label + '</span>';
      }).join("") + '</div></div></div>';
  }
  return h + '</div>';
}
function bindPubLibrary(el) {
  const acc = el.querySelector("#pAcc"); if (acc) acc.onchange = () => { S.pubAcc = acc.value; savePrefs(); render(); };
  el.querySelectorAll("[data-pf]").forEach(b => b.onclick = () => { haptic(); S.pubFilter = b.dataset.pf; savePrefs(); render(); });
  el.querySelectorAll("[data-bsel]").forEach(cb => cb.onchange = () => {
    const id = cb.dataset.bsel; const s = new Set((S.batchSel || []).map(String));
    cb.checked ? s.add(id) : s.delete(id); S.batchSel = [...s]; render();
  });
  const clr = el.querySelector("#pBatchClr"); if (clr) clr.onclick = () => { S.batchSel = []; render(); };
  const bt = el.querySelector("#pBatch"); if (bt) bt.onclick = () => openBatch();
  el.querySelectorAll("[data-pcell]").forEach(ch => ch.onclick = (e) => {
    e.stopPropagation(); const [cid, aid] = ch.dataset.pcell.split(":"); openPubCell(cid, aid);
  });
  el.querySelectorAll("[data-plan]").forEach(m => m.onclick = () => { S.batchSel = [m.dataset.plan]; openBatch(); });
}

/* ---------- Ячейка крео×аккаунт: история/действия ---------- */
function openPubCell(creoId, accId) {
  const ps = pubsOf(creoId, accId);
  const a = acctById(accId), c = creoById(creoId);
  let h = '<div class="sheet-h">' + platIcon(a.platform) + " " + esc(a.account_name) + " · " + pubCreoTitle(c) + '</div>';
  if (!ps.length) { h += '<div class="note">Ещё не планировался на этот аккаунт.</div>'; }
  for (const p of ps) h += pubCard(p);
  // старые отметки «я опубликовал» (creos.posters[]) — можно привязать к этому аккаунту (ТЗ §7)
  const posters = (c && c.posters) || [];
  const hasPub = ps.some(p => p.publish_state === "published");
  if (posters.length && !hasPub) {
    const who = posters.map(x => x.username ? "@" + x.username : ("id" + x.tg_id)).join(", ");
    h += '<div class="note">Старая отметка «опубликовано» (' + esc(who) + ', аккаунт не был указан).</div>' +
      '<button class="mini" id="pcLegacy">🔗 Привязать старую отметку к ' + esc(a.account_name) + '</button>';
  }
  h += '<button class="act plus" id="pcPlan">Запланировать сюда</button>';
  openSheetHtml(h, (sh) => {
    sh.querySelector("#pcPlan").onclick = () => { closeSheet(); S.batchSel = [creoId]; openBatch(accId); };
    const lg = sh.querySelector("#pcLegacy");
    if (lg) lg.onclick = async () => {
      haptic();
      try { await api("pub_attach_legacy", { creo_id: +creoId, account_id: +accId }); toast("Привязано", "ok"); closeSheet(); await loadPubs(true); }
      catch (e) { toast(errMsg(e), "err"); }
    };
    bindPubCard(sh);
  });
}
function pubCard(p) {
  const prep = { queue: "в очереди", processing: "обработка…", ready: "готов", failed: "ошибка: " + esc(p.prepared_error || ""), skip: "—" }[p.prepared_state] || p.prepared_state;
  const dlv = { pending: "ожидается", sent: "отправлен " + fmtDT(p.delivered_at), failed: "ошибка", unknown: "результат неизвестен" }[p.delivery_state] || p.delivery_state;
  const pub = { planned: "запланирован " + fmtDT(p.planned_at), awaiting_confirm: "нужно подтвердить", published: "опубликован " + fmtDT(p.published_at), cancelled: "отменён" }[p.publish_state] || p.publish_state;
  let h = '<div class="pcard" data-pid="' + p.id + '">' +
    '<div class="pcrow"><b>Публикация</b> ' + pub + (p.reel_url ? ' · <a href="#" data-reel="' + esc(p.reel_url) + '">reel</a>' : "") + '</div>' +
    '<div class="pcrow small">обработка: ' + prep + (p.uniq_level ? " (" + UNIQ_LABELS[p.uniq_level] + ")" : "") + ' · доставка: ' + dlv + '</div>';
  if (p.needs_edits) h += '<div class="pcrow warn">✎ нужна доработка в Edits' + (p.edits_note ? ": " + esc(p.edits_note) : "") + '</div>';
  h += '<div class="pcacts">';
  if (p.publish_state !== "published") h += '<button class="mini" data-pact="published:' + p.id + '">✅ Опубликовал</button>';
  else h += '<button class="mini" data-pact="planned:' + p.id + '">↩ снять отметку</button>';
  h += '<button class="mini" data-pact="reschedule:' + p.id + '">📅 Перенести</button>' +
    '<button class="mini" data-pact="getfile:' + p.id + '">📥 Получить файл</button>' +
    '<button class="mini" data-pact="regen:' + p.id + '">♻ Новая версия</button>' +
    '<button class="mini" data-pact="final:' + p.id + '">🎬 Финал из Edits</button>' +
    '<button class="mini danger" data-pact="cancel:' + p.id + '">✕ Отменить</button>';
  return h + '</div></div>';
}
function bindPubCard(sh) {
  sh.querySelectorAll("[data-reel]").forEach(a => a.onclick = (e) => { e.preventDefault(); openExt(a.dataset.reel); });
  sh.querySelectorAll("[data-pact]").forEach(b => b.onclick = () => {
    const [act, id] = b.dataset.pact.split(":"); pubAct(act, +id);
  });
}
async function pubAct(act, id) {
  haptic();
  try {
    if (act === "published") {
      const url = prompt("Ссылка на Reel (не обязательно):", "") || null;
      await api("pub_set_state", { id, target: "published", reel_url: url });
      toast("Отмечено опубликованным", "ok");
    } else if (act === "planned") { await api("pub_set_state", { id, target: "planned" }); toast("Отметка снята", "ok"); }
    else if (act === "cancel") { if (!confirm("Отменить публикацию?")) return; await api("pub_set_state", { id, target: "cancelled" }); toast("Отменено", "ok"); }
    else if (act === "reschedule") {
      const v = prompt("Новая дата/время (ГГГГ-ММ-ДД ЧЧ:ММ):", ""); if (!v) return;
      const iso = localToIso(v); if (!iso) { toast("Не разобрал дату", "err"); return; }
      await api("pub_reschedule", { id, planned_at: iso, tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
      toast("Перенесено", "ok");
    } else if (act === "regen") { await api("pub_regenerate", { id }); toast("Готовим новую версию", "ok"); }
    else if (act === "getfile") { await api("pub_regenerate", { id }); toast("Файл придёт в бота, когда будет готов", "ok"); }
    else if (act === "final") { await pubAttachFinal(id); return; }
    closeSheet(); await loadPubs(true);
  } catch (e) { toast(errMsg(e), "err"); }
}
function localToIso(v) {
  const m = String(v).trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]); return isNaN(d) ? null : d.toISOString();
}

/* ---------- Финал из Edits (upload + attach) ---------- */
async function pubAttachFinal(id) {
  const inp = document.createElement("input"); inp.type = "file"; inp.accept = "video/*,image/*";
  inp.onchange = async () => {
    const f = inp.files && inp.files[0]; if (!f) return;
    try {
      toast("Загружаю финал…", "ok");
      const s = await api("sign_upload", { name: f.name });
      const r = await fetch(s.signedUrl, { method: "PUT", headers: { "content-type": f.type || "application/octet-stream", "x-upsert": "true" }, body: f });
      if (!r.ok) throw new Error("upload " + r.status);
      await api("pub_attach_final", { id, path: s.path });
      toast("Финал прикреплён", "ok"); closeSheet(); await loadPubs(true);
    } catch (e) { toast(errMsg(e), "err"); }
  };
  inp.click();
}

/* ---------- Недельный план ---------- */
function weekStart(off) { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + off * 7); return d; }
function vPubWeek(accs) {
  const ws = weekStart(S.pubWeek || 0);
  const days = [...Array(7)].map((_, i) => { const d = new Date(ws); d.setDate(d.getDate() + i); return d; });
  const acc = S.pubAcc ? accs.filter(a => String(a.id) === String(S.pubAcc)) : accs;
  let h = '<div class="pubbar"><button class="mini" id="pwPrev">‹</button>' +
    '<span class="pwlbl">' + fmtDay(days[0]) + " – " + fmtDay(days[6]) + '</span>' +
    '<button class="mini" id="pwNext">›</button>' +
    '<select id="pAcc"><option value="">Все аккаунты</option>' +
    accs.map(a => '<option value="' + a.id + '"' + (String(S.pubAcc) === String(a.id) ? " selected" : "") + '>' + esc(a.account_name) + '</option>').join("") + '</select></div>';
  h += '<div class="weekgrid">';
  for (const d of days) {
    const dayIso = d.toISOString().slice(0, 10);
    h += '<div class="wday"><div class="wdh">' + ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"][(d.getDay() + 6) % 7] + " " + fmtDay(d) + '</div>';
    for (const a of acc) {
      const items = (S.pubs || []).filter(p => p.publish_state !== "cancelled" && String(p.account_id) === String(a.id)
        && p.planned_at && p.planned_at.slice(0, 10) === dayIso);
      for (const p of items) {
        const st = p.publish_state === "published" ? "st-pub" : p.publish_state === "awaiting_confirm" ? "st-confirm" : "st-plan";
        h += '<div class="wcell pchip ' + st + '" data-pid="' + p.id + '">' + platIcon(a.platform) + " " + pubCreoTitle(creoById(p.creo_id) || { id: p.creo_id }) + '</div>';
      }
    }
    h += '</div>';
  }
  return h + '</div>';
}
function bindPubWeek(el) {
  const acc = el.querySelector("#pAcc"); if (acc) acc.onchange = () => { S.pubAcc = acc.value; savePrefs(); render(); };
  const pv = el.querySelector("#pwPrev"), nx = el.querySelector("#pwNext");
  if (pv) pv.onclick = () => { S.pubWeek = (S.pubWeek || 0) - 1; render(); };
  if (nx) nx.onclick = () => { S.pubWeek = (S.pubWeek || 0) + 1; render(); };
  el.querySelectorAll("[data-pid]").forEach(c => c.onclick = () => openPubById(+c.dataset.pid));
}
function openPubById(id) {
  const p = (S.pubs || []).find(x => x.id === id); if (!p) return;
  openSheetHtml('<div class="sheet-h">' + pubCreoTitle(creoById(p.creo_id) || { id: p.creo_id }) + '</div>' + pubCard(p), bindPubCard);
}

/* ---------- Сегодня ---------- */
function vPubToday(accs) {
  const today = new Date().toISOString().slice(0, 10);
  const all = (S.pubs || []).filter(p => p.publish_state !== "cancelled");
  const plan = all.filter(p => p.planned_at && p.planned_at.slice(0, 10) === today);
  const ready = all.filter(p => (p.prepared_state === "ready" || p.final_path) && p.publish_state !== "published");
  const errs = all.filter(p => p.prepared_state === "failed" || p.delivery_state === "failed" || p.delivery_state === "unknown");
  const confirm = all.filter(p => p.publish_state === "awaiting_confirm");
  const sec = (title, list) => list.length ? ('<div class="hh">' + title + ' <span class="c">' + list.length + '</span></div>' +
    list.map(p => '<div class="lead pchip ' + (p.publish_state === "published" ? "st-pub" : "st-plan") + '" data-pid="' + p.id + '">' +
      '<div class="nm">' + (acctById(p.account_id) ? platIcon(acctById(p.account_id).platform) + " " + esc(acctById(p.account_id).account_name) : "аккаунт ?") +
      ' · ' + pubCreoTitle(creoById(p.creo_id) || { id: p.creo_id }) + '<span class="ls">' + fmtDT(p.planned_at) + '</span></div></div>').join("")) : "";
  let h = sec("На сегодня", plan) + sec("Нужно подтвердить", confirm) + sec("Файлы готовы", ready) + sec("Ошибки", errs);
  if (!h) h = '<div class="empty"><div class="e-ic">☀️</div><div class="e-h">На сегодня чисто</div>Ничего не запланировано и без ошибок.</div>';
  return h;
}
function bindPubToday(el) { el.querySelectorAll("[data-pid]").forEach(c => c.onclick = () => openPubById(+c.dataset.pid)); }

/* ---------- Пакетное планирование ---------- */
function openBatch(forceAcc) {
  const accs = pubAccounts();
  const sel = (S.batchSel || []).map(id => creoById(id)).filter(Boolean);
  if (!sel.length) { toast("Не выбрано ни одного ролика", "err"); return; }
  const d = S.batchDraft = {
    accountIds: forceAcc ? [String(forceAcc)] : [], level: "none", flip: false,
    mode: "one_per_day", date0: "", time: "10:00", deliveryMode: "on_ready",
    rows: sel.map(c => ({ creo_id: c.id, source_index: 0, date: "" })),
  };
  renderBatch();
}
function renderBatch() {
  const d = S.batchDraft, accs = pubAccounts();
  let h = '<div class="sheet-h">Планирование · ' + d.rows.length + ' роликов</div>';
  h += '<div class="bfield"><label>Аккаунты</label><div class="chips">' + accs.map(a =>
    '<button class="chip ' + (d.accountIds.includes(String(a.id)) ? "on" : "") + '" data-bacc="' + a.id + '">' + platIcon(a.platform) + " " + esc(a.account_name) + '</button>').join("") + '</div></div>';
  h += '<div class="bfield"><label>Обработка</label><select id="bLevel">' +
    Object.entries(UNIQ_LABELS).map(([k, l]) => '<option value="' + k + '"' + (d.level === k ? " selected" : "") + '>' + l + '</option>').join("") +
    '</select> <label class="inl"><input type="checkbox" id="bFlip"' + (d.flip ? " checked" : "") + '> зеркало</label></div>';
  h += '<div class="bfield"><label>Даты</label><select id="bMode">' +
    '<option value="one_per_day"' + (d.mode === "one_per_day" ? " selected" : "") + '>по ролику в день с</option>' +
    '<option value="manual"' + (d.mode === "manual" ? " selected" : "") + '>ручные даты</option></select>' +
    '<input type="date" id="bDate0" value="' + (d.date0 || "") + '"> <input type="time" id="bTime" value="' + (d.time || "10:00") + '"></div>';
  h += '<div class="bfield"><label>Доставка файла</label><select id="bDeliv">' +
    Object.entries(DMODE_LABELS).map(([k, l]) => '<option value="' + k + '"' + (d.deliveryMode === k ? " selected" : "") + '>' + l + '</option>').join("") + '</select></div>';
  // строки роликов: выбор готового видео + (в ручном режиме) дата
  h += '<div class="brows">' + d.rows.map((r, i) => {
    const c = creoById(r.creo_id); const n = (c && c.result_paths || []).length;
    let row = '<div class="brow"><span class="bnm">' + pubCreoTitle(c || { id: r.creo_id }) + '</span>';
    if (n > 1) row += '<select data-bidx="' + i + '">' + [...Array(n)].map((_, k) => '<option value="' + k + '"' + (r.source_index === k ? " selected" : "") + '>видео ' + (k + 1) + '</option>').join("") + '</select>';
    if (d.mode === "manual") row += '<input type="date" data-bdate="' + i + '" value="' + (r.date || "") + '">';
    return row + '</div>';
  }).join("") + '</div>';
  h += '<div id="bPreview" class="note"></div>';
  h += '<button class="act plus" id="bSave">Показать план и сохранить</button>';
  openSheetHtml(h, bindBatch);
}
function bindBatch(sh) {
  const d = S.batchDraft;
  sh.querySelectorAll("[data-bacc]").forEach(b => b.onclick = () => {
    const id = b.dataset.bacc; const s = new Set(d.accountIds);
    s.has(id) ? s.delete(id) : s.add(id); d.accountIds = [...s]; renderBatch();
  });
  const g = (id) => sh.querySelector(id);
  if (g("#bLevel")) g("#bLevel").onchange = e => d.level = e.target.value;
  if (g("#bFlip")) g("#bFlip").onchange = e => d.flip = e.target.checked;
  if (g("#bMode")) g("#bMode").onchange = e => { d.mode = e.target.value; renderBatch(); };
  if (g("#bDate0")) g("#bDate0").onchange = e => d.date0 = e.target.value;
  if (g("#bTime")) g("#bTime").onchange = e => d.time = e.target.value;
  if (g("#bDeliv")) g("#bDeliv").onchange = e => d.deliveryMode = e.target.value;
  sh.querySelectorAll("[data-bidx]").forEach(s => s.onchange = () => d.rows[+s.dataset.bidx].source_index = +s.value);
  sh.querySelectorAll("[data-bdate]").forEach(s => s.onchange = () => d.rows[+s.dataset.bdate].date = s.value);
  g("#bSave").onclick = () => saveBatch(sh);
}
function buildDrafts() {
  const d = S.batchDraft, tz = Intl.DateTimeFormat().resolvedOptions().timeZone, out = [];
  const time = d.time || "10:00";
  d.rows.forEach((r, i) => {
    let planned = null;
    if (d.mode === "manual") planned = r.date ? new Date(r.date + "T" + time).toISOString() : null;
    else if (d.date0) { const b = new Date(d.date0 + "T" + time); b.setDate(b.getDate() + i); planned = b.toISOString(); }
    for (const aid of d.accountIds) {
      const c = creoById(r.creo_id);
      const asset = c && (c.result_paths || [])[r.source_index];
      out.push({
        creo_id: r.creo_id, account_id: +aid, source_kind: "result", source_index: r.source_index,
        source_path: asset || null, planned_at: planned, tz, uniq_level: d.level,
        process_flip: d.flip, delivery_mode: d.deliveryMode,
      });
    }
  });
  return out;
}
async function saveBatch(sh) {
  const d = S.batchDraft;
  if (!d.accountIds.length) { toast("Выбери хотя бы один аккаунт", "err"); return; }
  const drafts = buildDrafts();
  const prev = sh.querySelector("#bPreview");
  try {
    const chk = await api("pub_preview", { drafts });
    const warns = (chk.warns || []).filter(w => w.warn);
    let msg = "К созданию: " + drafts.length + " публикаций.";
    if (chk.conflicts && chk.conflicts.length) msg += " ⚠ Конфликтов слотов (аккаунт+день): " + chk.conflicts.length + ".";
    if (warns.length) msg += " ⚠ Повторно на аккаунт: " + warns.length + " (уже были).";
    if (prev) prev.innerHTML = esc(msg) + '<br>' + drafts.map(x => "• " + pubCreoTitle(creoById(x.creo_id) || { id: x.creo_id }) + " → " +
      (acctById(x.account_id) ? esc(acctById(x.account_id).account_name) : x.account_id) + " · " + (x.planned_at ? fmtDT(x.planned_at) : "без даты")).join("<br>");
    if (!prev._confirm) { prev._confirm = true; sh.querySelector("#bSave").textContent = "Подтвердить и создать"; return; }
    await api("pub_plan", { drafts });
    toast("Запланировано: " + drafts.length, "ok");
    S.batchSel = []; S.batchDraft = null; closeSheet(); await loadPubs(true);
  } catch (e) { toast(errMsg(e), "err"); }
}

/* ---------- вспом.: универсальный лист (переиспользует #scrim/#sheet и closeSheet из upload.js) ---------- */
function openSheetHtml(html, bind) {
  const sc = document.getElementById("scrim"), sh = document.getElementById("sheet");
  if (!sh) return;
  sh.innerHTML = '<div class="grip"></div>' + html +
    '<button class="primary ghost" id="shX" style="margin-top:12px">Закрыть</button>';
  sc.classList.add("show"); requestAnimationFrame(() => sh.classList.add("show"));
  sc.onclick = closeSheet;
  const x = sh.querySelector("#shX"); if (x) x.onclick = closeSheet;
  if (bind) bind(sh);
}
