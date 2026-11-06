// Страница «Автозалив» на фикстурах. Правила статусов проверяются на сервере, здесь только интерфейс.
const $ = (s, root) => (root || document).querySelector(s);
const $$ = (s, root) => [...(root || document).querySelectorAll(s)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const job = (o) => ({ id: 1, platform: "instagram", kind: "publish_reel", account_id: 51, account_name: "nokk.ksi", creo_id: null, asset_path: "a.mp4", caption: "", status: "queued", attention_stage: null,
  run_at: "2026-11-06T10:00:00.000Z", timezone: "UTC", revision: 4, tapped: null, tapped_label: null, error_code: null, error_message: null, actor: null, post_url: null, ...o });

const world = () => ({
  jobs: [
    job({ id: 1, status: "unknown", tapped: null, tapped_label: "Нажатие могло быть", error_code: "lease_lost_after_commit" }),
    job({ id: 2, status: "needs_attention", tapped: false, tapped_label: "Нажатия не было", error_code: "tap_window_expired" }),
    job({ id: 3, status: "sent", caption: "<b>жирно</b>" }),
    job({ id: 4, status: "missed" }),
    job({ id: 5, status: "confirmed", post_url: "https://example.test/r" }),
  ],
  events: [],
  accounts: [
    { id: 51, platform: "instagram", account_name: "nokk.ksi", phone_id: 9, expected_handle: "nokk.ksi", min_gap_minutes: 30 },
    { id: 52, platform: "instagram", account_name: "без телефона", phone_id: null, expected_handle: null, min_gap_minutes: null },
    { id: 53, platform: "x", account_name: "другая соцсеть", phone_id: 9, expected_handle: null, min_gap_minutes: null },
  ],
  phones: [{ id: 9, serial: "SER1", name: "Pixel 6a", worker_id: 7, online: true, mode: "RUNNING", mode_reason: null, paused: false, last_seen_at: new Date().toISOString() }],
  workers: [{ id: 7, name: "PC-1", app_version: "0.2.0", capabilities: [], last_seen_at: new Date().toISOString(), revoked: false, paired: true }],
});

const video = (id, paths) => ({ id, status: "done", kind: "video", caption: "Видео " + id, result_caption: null, result_paths: paths, result_urls: paths.map(() => null), source_paths: [], source_urls: [], storage_paths: [], media_urls: [], posters: [], niche_ids: [], deferred_at: null });

export async function runDeviceTests(T, srv) {
  const calls = [];
  let handler = null;
  srv.deviceHandler = async (action, p) => {
    calls.push([action, p]);
    if (handler) { const r = await handler(action, p); if (r !== undefined) return r; }
    if (action === "device_list") return JSON.parse(JSON.stringify(state));
    return { ok: true };
  };
  let state = world();
  const open = async () => { S.tab = "auto"; S.autoTab = "queue"; S.auto = null; S._autoSig = ""; header(); render(); await sleep(30); };
  const lastCall = (name) => calls.filter((c) => c[0] === name).at(-1);
  const baseCreos = S.creos;

  await T("Автозалив: вкладка есть у админа и залива, нет у остальных", () => {
    const has = () => { header(); return !!$('#nav [data-t="auto"]'); };
    const me = S.me; const rolesWas = me.roles;
    const results = [has()];
    me.roles = ["uploader"]; results.push(has());
    me.roles = ["creative"]; results.push(has());
    me.roles = rolesWas; header();
    return JSON.stringify(results) === "[true,true,false]" || JSON.stringify(results);
  });

  await T("Автозалив: решения показаны первыми, с текстом о нажатии и тремя кнопками", async () => {
    await open();
    const first = $(".job.unknown");
    const labels = $$("[data-jact]", first).map((b) => b.textContent);
    return first.textContent.includes("Нажатие могло быть") && first.textContent.includes("Результат неизвестен") &&
      labels.join("|") === "Опубликовано|Не опубликовано, вернуть в очередь|Отменить" && $(".job.needs_attention").textContent.includes("Нажатия не было") || labels.join("|");
  });

  await T("Автозалив: подпись экранируется", () => $(".job.sent .jcap b") === null && $(".job.sent .jcap").textContent === "<b>жирно</b>");

  await T("Автозалив: sent и confirmed показаны как разные статусы", () => $(".job.sent .ast").textContent === "Отправлено" && $(".job.confirmed .ast").textContent === "Опубликовано подтверждено");

  await T("Автозалив: кнопка решения передаёт revision", async () => {
    window.confirm = () => true;
    $('.job.unknown [data-jact="not_published"]').click();
    await sleep(20);
    const c = lastCall("device_job_resolve");
    return c[1].id === 1 && c[1].revision === 4 && c[1].decision === "not_published";
  });

  await T("Автозалив: отказ по устаревшей версии показывает понятный текст и обновляет список", async () => {
    await open();
    handler = (a) => { if (a === "device_job_resolve") { const e = new Error("conflict"); throw e; } };
    const before = document.querySelectorAll(".toast").length, lists = calls.filter((c) => c[0] === "device_list").length;
    $('.job.unknown [data-jact="published"]').click();
    await sleep(20);
    handler = null;
    return document.querySelectorAll(".toast").length > before && calls.filter((c) => c[0] === "device_list").length > lists;
  });

  await T("Автозалив: «Повторить» у пропущенного задания", async () => {
    await open();
    $('.job.missed [data-jact="retry"]').click();
    await sleep(20);
    return lastCall("device_job_retry")[1].id === 4;
  });

  S.creos = [...baseCreos, video(901, ["r/one.mp4"]), video(902, ["r/two.mov"]), video(903, ["r/three.MP4"]), video(904, ["r/old.mp4", "r/new.mov"])];
  S.creos.forEach((c) => { if (c.id > 900) c.result_urls = c.result_paths.map(() => null); });

  await T("Мастер: формат не .mp4 нельзя выбрать, причина видна", async () => {
    await open();
    await openAutoWizard();
    const bad = $('[data-apick="902"]');
    return bad.disabled && bad.textContent.includes(".mov") && bad.textContent.includes(".mp4") || bad.outerHTML;
  });

  await T("Мастер: .MP4 в верхнем регистре можно выбрать", () => !$('[data-apick="903"]').disabled);

  await T("Мастер: аккаунт без телефона недоступен, чужая соцсеть скрыта", () => {
    const options = $$("#awacc option");
    const unbound = options.find((o) => o.value === "52");
    return unbound.disabled && unbound.textContent.includes("нет привязки") && !options.some((o) => o.value === "53");
  });

  await T("Мастер: версия не .mp4 недоступна, по умолчанию берётся подходящая", () => {
    $('[data-apick="904"]').click();
    const options = $$('[data-aver="0"] option');
    const chosen = S.autoDraft.items[0].path;
    $('[data-apick="904"]').click();
    return chosen === "r/old.mp4" && options.find((o) => o.value === "r/new.mov").disabled;
  });

  await T("Мастер: создание отправляет ключ, подпись и пояс, без метки ИИ", async () => {
    $('[data-apick="901"]').click();
    $('[data-acap="0"]').value = "12345";
    $('[data-acap="0"]').dispatchEvent(new Event("input"));
    S.autoDraft.account_id = "51";
    await saveAutoWizard();
    await sleep(10);
    const p = lastCall("device_job_create")[1];
    return p.account_id === 51 && p.creo_id === 901 && p.source_path === "r/one.mp4" && p.caption === "12345" && p.idempotency_key && p.run_at === null && p.timezone && !("ai_label" in p) && !document.getElementById("amodal");
  });

  await T("Мастер: метки ИИ нет в форме", async () => {
    await openAutoWizard();
    const has = /метк|ai_label|ИИ/i.test($("#amodal").textContent);
    closeAutoWizard();
    return !has;
  });

  await T("Мастер: повторное нажатие после обрыва идёт с тем же ключом", async () => {
    await openAutoWizard();
    $('[data-apick="901"]').click();
    S.autoDraft.account_id = "51";
    handler = (a) => { if (a === "device_job_create") throw new Error("Failed to fetch"); };
    await saveAutoWizard();
    const key = lastCall("device_job_create")[1].idempotency_key;
    handler = null;
    await saveAutoWizard();
    await sleep(10);
    return lastCall("device_job_create")[1].idempotency_key === key;
  });

  await T("Мастер: файл уже есть на аккаунте, предлагается «Повторить» или «Новый залив»", async () => {
    await openAutoWizard();
    $('[data-apick="901"]').click();
    S.autoDraft.account_id = "51";
    handler = (a) => { if (a === "device_job_create") { const e = new Error("duplicate_asset"); e.data = { error: "duplicate_asset", job: job({ id: 77, status: "confirmed" }), can_retry: false, can_repost: true }; throw e; } };
    await saveAutoWizard();
    await sleep(10);
    handler = null;
    const offered = !!$("[data-arepost]") && !$("[data-aretry]") && $("#amodal").textContent.includes("уже есть на аккаунте");
    window.confirm = () => true;
    $("[data-arepost]").click();
    await sleep(20);
    const p = lastCall("device_job_repost")[1];
    closeAutoWizard();
    return offered && p.id === 77;
  });

  await T("Мастер: несуществующее время отклоняется до отправки", async () => {
    await openAutoWizard();
    $('[data-apick="901"]').click();
    S.autoDraft.account_id = "51";
    S.autoDraft.mode = "at"; S.autoDraft.local = ""; S.autoDraft.timezone = "UTC";
    const n = calls.filter((c) => c[0] === "device_job_create").length;
    await saveAutoWizard();
    const same = calls.filter((c) => c[0] === "device_job_create").length === n;
    closeAutoWizard();
    return same;
  });

  await T("ПК и телефоны: доступность, код подключения у админа", async () => {
    await open();
    S.autoTab = "devices"; render();
    const text = $("#app").textContent;
    const seen = text.includes("PC-1") && text.includes("на связи") && text.includes("Pixel 6a") && !!$(".dot.on");
    handler = (a) => { if (a === "device_pair_code") return { worker_id: 8, code: "ABCD-EFGH", expires_in_sec: 900 }; };
    $("#pairname").value = "PC-2";
    $("#pairgo").click();
    await sleep(30);
    handler = null;
    return seen && $(".paircode").textContent === "ABCD-EFGH" && lastCall("device_pair_code")[1].name === "PC-2";
  });

  await T("Привязка: сохраняет телефон, ник и интервал", async () => {
    $('[data-bhandle="51"]').value = "@nokk.ksi";
    $('[data-bgap="51"]').value = "45";
    $('[data-bsave="51"]').click();
    await sleep(20);
    const p = lastCall("device_binding_set")[1];
    return p.account_id === 51 && p.phone_id === 9 && p.expected_handle === "@nokk.ksi" && p.min_gap_minutes === 45;
  });

  await T("ПК и телефоны: у залива нет кода подключения и настроек", async () => {
    const was = S.me.roles;
    S.me.roles = ["uploader"];
    render();
    const none = !$("#pairgo") && !$("[data-bsave]") && !$("[data-wrevoke]") && !$("[data-pworker]");
    S.me.roles = was;
    S.autoPair = null;
    return none;
  });

  S.creos = baseCreos;
  S.tab = "cat"; S.auto = null; header(); render();
}
