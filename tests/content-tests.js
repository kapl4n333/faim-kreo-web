// Пул, расписание и настройки на фикстурах. Правила проверяются на сервере, здесь только показ и ввод.
const $ = (s, root) => (root || document).querySelector(s);
const $$ = (s, root) => [...(root || document).querySelectorAll(s)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const accounts = [
  { id: 51, account_name: "nokk.ksi", has_phone: true, phone_id: 9, phone_name: "Pixel 6a", expected_handle: "nokk.ksi", min_gap_minutes: 30 },
  { id: 52, account_name: "_nokksi", has_phone: false, phone_id: null, phone_name: null, expected_handle: null, min_gap_minutes: null },
];
const registry = [
  { key: "caption_prompt", type: "text", default: "", scope: "both", group: "Подписи", label: "Промпт подписей", multiline: true, maxLen: 20000 },
  { key: "gap.any", type: "int", default: 30, scope: "both", group: "Промежутки", label: "Между публикациями", min: 0, max: 100 },
  { key: "rate.story", type: "rate", default: { min: 1, max: 2, period: "day" }, scope: "both", group: "Нормы", label: "Истории" },
  { key: "hours.reel", type: "hours", default: [{ from: "10:00", to: "22:00" }], scope: "both", group: "Часы публикации", label: "Reels" },
  { key: "story_link_frequency", type: "link_frequency", default: { mode: "percent", value: 30 }, scope: "both", group: "Ссылка", label: "Частота" },
  { key: "hashtags", type: "hashtags", default: { required: [], pool: [], max: 5 }, scope: "both", group: "Подписи", label: "Хештеги" },
  { key: "paused", type: "bool", default: false, scope: "both", group: "Аккаунт", label: "Пауза" },
  { key: "story_link_url", type: "url", default: null, scope: "account", group: "Ссылка", label: "Своя ссылка" },
  { key: "planner.batch_size", type: "int", default: 8, scope: "global", group: "Планировщик", label: "За запуск", min: 1, max: 50 },
  { key: "newly.added", type: "int", default: 3, scope: "both", group: "Новая группа", label: "Настройка из реестра", min: 0, max: 9 },
];
const row = (o) => ({ id: 1, item_id: 1, title: "Материал", content_type: "reel", account_id: 51, account_name: "nokk.ksi", phone: { id: 9, name: "Pixel 6a" }, state: "scheduled", job_id: 5, job_status: "queued", run_at: "2026-11-08T17:37:12.000Z", timezone: "Europe/Warsaw", local_time: "2026-11-08T18:37", caption: "<b>подпись</b>", story_link: null, wait_reason: null, wait_detail: null, blocking_settings: [], revision: 3, editable: true, time_manual: false, ...o });
const item = (o) => ({ id: 1, content_type: "reel", status: "active", title: "Первый", poster_url: null, media: [{ id: 11, position: 0, media_kind: "video", path: "1/a.mp4", url: "x" }], assignments: [], ...o });

export async function runContentTests(T, srv) {
  const calls = [];
  let handler = null;
  const world = { items: [item({}), item({ id: 2, title: "Карусель", content_type: "carousel", media: [{ id: 21, position: 0, media_kind: "photo", path: "1/a.jpg", url: "x" }, { id: 22, position: 1, media_kind: "photo", path: "1/b.jpg", url: "x" }] })], rows: [], overrides: { 51: {}, 52: {} }, global: {} };
  srv.contentHandler = async (action, p) => {
    calls.push([action, p]);
    if (handler) { const r = await handler(action, p); if (r !== undefined) return r; }
    if (action === "content_pool_list") return { items: JSON.parse(JSON.stringify(world.items)), accounts };
    if (action === "content_schedule_list") return { rows: JSON.parse(JSON.stringify(world.rows)), old_form: [], stock: [{ account_id: 51, account_name: "nokk.ksi", content_type: "reel", count: 0, days: 0, request_content: true }, { account_id: 51, account_name: "nokk.ksi", content_type: "story", count: 5, days: 5, request_content: false }], planner: { waiting: 1, offline: false, last_poll_at: new Date().toISOString(), last_run: { error_code: "limit", error_detail: null } } };
    if (action === "content_settings_get") return { registry, global: world.global, overrides: world.overrides, accounts, can_edit_global: true };
    return { ok: true, results: [], requested: 1, skipped: 2, added: 1, skipped_: 0, texts: [] };
  };
  const open = async (tab) => { S.tab = "auto"; S.autoTab = tab; S.auto = S.auto || { jobs: [], phones: [{ id: 9, name: "Pixel 6a", serial: "S" }], workers: [], accounts: [] }; S.cPool = null; S.cSched = null; S.cSet = null; S._cSig = ""; S.autoOpen = false; S.cSel = []; S.cScope = "global"; S.cSetSub = "settings"; document.getElementById("amodal")?.remove(); header(); render(); await sleep(40); };
  const last = (name) => calls.filter((c) => c[0] === name).at(-1);
  const clearAll = () => { calls.length = 0; handler = null; };

  await T("контент: вкладки на месте, очередь и телефоны работают как раньше", async () => {
    await open("queue");
    const tabs = $$("[data-autotab]").map((b) => b.textContent);
    return tabs.join() === "Очередь,Пул,Расписание,Настройки,ПК и телефоны" && !!$("#autonew") || tabs.join();
  });

  await T("пул: материалы показаны, текст экранируется, фильтр уходит на сервер", async () => {
    clearAll(); world.items[0].title = "<i>Первый</i>";
    await open("pool");
    const ok = $$(".citem").length === 2 && !$(".citem i") && $(".citem b").textContent.includes("<i>");
    $('[data-ctype="story"]').click(); await sleep(30);
    world.items[0].title = "Первый";
    return ok && last("content_pool_list")[1].content_type === "story" || "bad";
  });

  await T("пул: выбор материалов и назначение, аккаунт без телефона недоступен", async () => {
    clearAll(); await open("pool"); S.cType = ""; S.cPool = null; render(); await sleep(30);
    const box = $('[data-csel="1"]'); box.checked = true; box.dispatchEvent(new Event("change")); await sleep(5);
    $("#cassign").click();
    const noPhone = $('[data-gacc="52"]'), withPhone = $('[data-gacc="51"]');
    const shows = noPhone.disabled && noPhone.closest("label").textContent.includes("Нет телефона") && !withPhone.disabled;
    withPhone.checked = true; withPhone.dispatchEvent(new Event("change"));
    handler = async (a, p) => a === "content_assign" ? { results: [{ item_id: 1, account_id: 51, outcome: p.confirm_repeat_pairs.length ? "created" : "duplicate" }] } : undefined;
    $("#cggo").click(); await sleep(30);
    const asked = !!$("[data-gconf]");
    const first = last("content_assign")[1].confirm_repeat_pairs.length === 0;
    const conf = $("[data-gconf]"); conf.checked = true; $("#cggo").click(); await sleep(30);
    const second = last("content_assign")[1];
    return shows && asked && first && second.confirm_repeat_pairs[0].item_id === 1 && !S.autoOpen && (S.cSel || []).length === 0 || [shows, asked, first].join();
  });

  await T("пул: порядок файлов карусели меняется стрелками", async () => {
    clearAll(); await open("pool"); S.cType = ""; S.cPool = null; render(); await sleep(30);
    $('[data-cmove="2:1:-1"]').click(); await sleep(20);
    return JSON.stringify(last("content_item_update")[1].media_order) === "[22,21]" || "order";
  });

  await T("пул: материал с активным заданием удалить нельзя, причина понятна", async () => {
    clearAll(); window.confirm = () => true; await open("pool");
    handler = async (a) => { if (a === "content_item_delete") { const e = new Error("item_active"); throw e; } };
    $('[data-cdel="1"]').click(); await sleep(20);
    return [...document.querySelectorAll(".toast")].some((t) => t.textContent.includes("только архивировать")) || "toast";
  });

  await T("расписание: время в поясе аккаунта, история со ссылкой и предупреждением, причина и настройка", async () => {
    clearAll();
    world.rows = [
      row({ id: 1 }),
      row({ id: 2, content_type: "story", caption: null, state: "scenario_wait", job_id: null, job_status: null, story_link: { wanted: true, enabled: false, url: null, warning: "link_missing" } }),
      row({ id: 3, state: "pending_plan", job_id: null, job_status: null, run_at: null, caption: null, wait_reason: "caption_settings_missing", blocking_settings: ["caption_prompt"] }),
      row({ id: 4, editable: false, job_status: "claimed" }),
    ];
    await open("schedule"); await sleep(30);
    const cards = $$(".job");
    const time = cards[0].textContent.includes("18:37") && cards[0].textContent.includes("Europe/Warsaw");
    const story = cards[1].textContent.includes("Сценарий ещё не готов") && cards[1].textContent.includes("выйдет без неё");
    const wait = cards[2].textContent.includes("Не заполнен промпт") && !!cards[2].querySelector('[data-goset="caption_prompt"]');
    const view = !cards[3].querySelector("[data-cedit]") && cards[3].textContent.includes("только просмотр");
    const box = $$(".autobox");
    const stock = box.some((b) => b.textContent.includes("Нужен контент")) && box.some((b) => b.textContent.includes("на 5 дн."));
    const planner = box[0].textContent.includes("лимиты");
    return time && story && wait && view && stock && planner || [time, story, wait, view, stock, planner].join();
  });

  await T("расписание: ссылка на настройку открывает её", async () => {
    await open("schedule"); await sleep(30);
    $('[data-goset="caption_prompt"]').click(); await sleep(40);
    return S.autoTab === "settings" && !!$('[data-skey="caption_prompt"].flash') && !!$('[data-skey="caption_prompt"]').closest("details").open || "no";
  });

  await T("расписание: правка уходит на сервер с revision и местным временем", async () => {
    clearAll(); await open("schedule"); await sleep(30);
    $('[data-cedit="1"]').click();
    $("#cecap").value = "новая"; $("#cetime").value = "2026-11-08T19:41";
    $("#cesave").click(); await sleep(30);
    const p = last("content_schedule_update")[1];
    return p.caption === "новая" && p.run_at_local === "2026-11-08T19:41" && p.revision === 3 && !S.autoOpen || JSON.stringify(p);
  });

  await T("расписание: кнопка пересчёта вызывает сервер и показывает итог", async () => {
    clearAll(); window.confirm = () => true; await open("schedule"); await sleep(30);
    $("#creplan").click(); await sleep(30);
    return !!last("content_schedule_replan") && [...document.querySelectorAll(".toast")].some((t) => t.textContent.includes("не тронуто: 2")) || "no";
  });

  await T("настройки: поля строятся из реестра, новая запись сама появляется", async () => {
    clearAll(); await open("settings"); await sleep(30);
    const fresh = !!$('[data-skey="newly.added"]');
    const rate = $('[data-skey="rate.story"] [data-f="max"]').value === "2";
    const prompt = $('[data-skey="caption_prompt"] textarea').value === "";
    const onlyAccount = !$('[data-skey="story_link_url"]');
    return fresh && rate && prompt && onlyAccount || [fresh, rate, prompt, onlyAccount].join();
  });

  await T("настройки: значения сложных полей читаются и уходят как есть", async () => {
    clearAll(); await open("settings"); await sleep(30);
    const box = (k) => $(`[data-skey="${k}"]`);
    box("hours.reel").querySelector("input").value = "09:00-12:00, 23:00-01:00";
    box("hours.reel").querySelector("[data-ssave]").click(); await sleep(30);
    const hours = last("content_settings_set")[1];
    const a = JSON.stringify(hours.value) === '[{"from":"09:00","to":"12:00"},{"from":"23:00","to":"01:00"}]' && hours.scope === "global";
    box("rate.story").querySelector('[data-f="max"]').value = "4";
    box("rate.story").querySelector("[data-ssave]").click(); await sleep(30);
    const b = JSON.stringify(last("content_settings_set")[1].value) === '{"min":1,"max":4,"period":"day"}';
    box("hashtags").querySelector('[data-f="required"]').value = "#a, b";
    box("hashtags").querySelector("[data-ssave]").click(); await sleep(30);
    const c = JSON.stringify(last("content_settings_set")[1].value.required) === '["#a","b"]';
    box("caption_prompt").querySelector("textarea").value = "мой промпт";
    box("caption_prompt").querySelector("[data-ssave]").click(); await sleep(30);
    const d = last("content_settings_set")[1].value === "мой промпт";
    return a && b && c && d || [a, b, c, d].join();
  });

  await T("настройки: у аккаунта «Как в общих» и «Своё», глобальные только в общих", async () => {
    clearAll(); await open("settings"); await sleep(30);
    S.cScope = "51"; render(); await sleep(10);
    const box = $('[data-skey="gap.any"]');
    const inherited = box.querySelector("input").disabled && !box.querySelector("[data-ssave]") && box.querySelector("[data-sinherit]").classList.contains("on");
    const noGlobal = !$('[data-skey="planner.batch_size"]');
    const ownField = !!$('[data-skey="story_link_url"] [data-ssave]');
    box.querySelector("[data-sown]").click(); await sleep(30);
    const p = last("content_settings_set")[1];
    world.overrides[51] = { "gap.any": 45 };
    S.cSet = await api("content_settings_get"); render(); await sleep(10);
    const box2 = $('[data-skey="gap.any"]');
    const own = !box2.querySelector("input").disabled && box2.querySelector("input").value === "45";
    box2.querySelector("[data-sinherit]").click(); await sleep(30);
    const back = last("content_settings_set")[1].mode === "inherit";
    world.overrides[51] = {};
    return inherited && noGlobal && ownField && p.scope === 51 && own && back || [inherited, noGlobal, ownField, own, back].join();
  });

  await T("настройки: массовое изменение и привязка к телефону", async () => {
    clearAll(); await open("settings"); await sleep(30);
    $("#cbulk").click();
    const c = $('[data-bacc="51"]'); c.checked = true; c.dispatchEvent(new Event("change"));
    $("#cbkey").value = "gap.any"; $("#cbkey").dispatchEvent(new Event("change"));
    $("#cbval").value = "12"; $("#cbgo").click(); await sleep(30);
    const p = last("content_settings_bulk")[1];
    const a = p.account_ids.includes(51) && p.changes[0].key === "gap.any" && p.changes[0].value === 12;
    S.cBulk = null; S.cScope = "52"; S.auto.phones = [{ id: 9, name: "Pixel 6a", serial: "S" }]; render(); await sleep(10);
    const shown = $$(".autobox").some((b) => b.textContent.includes("Нет телефона"));
    return a && shown && !!$("#cbindphone") || [a, shown].join();
  });

  await T("тексты кнопок: массовая вставка и счётчик", async () => {
    clearAll(); await open("settings"); await sleep(30);
    handler = async (a, p) => { if (a === "content_button_texts_list") return { texts: [{ id: 3, text: "<b>Жми</b>", enabled: true, use_count: 7 }] }; if (a === "content_button_texts_add") return { added: 2, skipped: 1, p }; };
    $('[data-csub="texts"]').click(); await sleep(60);
    const shown = $$(".autorow").some((r) => r.textContent.includes("<b>Жми</b>") && r.textContent.includes("использован: 7"));
    $("#ctadd").value = "раз\nдва\nраз"; $("#ctgo").click(); await sleep(60);
    const sent = last("content_button_texts_add")[1];
    const tog = $('[data-ttog="3"]'); tog.checked = false; tog.dispatchEvent(new Event("change")); await sleep(20);
    const off = last("content_button_text_update")[1];
    S.cSetSub = "settings"; S.cTexts = null; handler = null;
    return shown && sent.text.includes("\n") && sent.account_id === null && off.enabled === false || [shown, sent.text].join();
  });

  await T("контент: на узком экране страницы не шире окна", async () => {
    S.cType = ""; const out = [];
    for (const tab of ["pool", "schedule", "settings"]) {
      await open(tab); await sleep(30);
      const main = $("#app");
      if (main.scrollWidth > main.clientWidth + 1) out.push(tab + ":" + main.scrollWidth + ">" + main.clientWidth);
    }
    S.tab = "cat"; header(); render();
    return !out.length || out.join();
  });
}
