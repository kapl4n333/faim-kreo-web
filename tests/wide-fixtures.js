// Вымышленные ответы desk-action для tests/wide.html. К настоящему API не обращается.
const now = Date.now();
const at = (min) => new Date(now + min * 60000).toISOString();
const loc = (min) => { const d = new Date(now + min * 60000 + 3600000); return d.toISOString().slice(0, 16); };
const names = ["nokk.ksi", "noksi.daily", "noksi.reels", "ava.leaks", "ava.mood", "mia.night", "lena.vibes", "kate.story", "sofi.cam", "nina.flow"];
const statuses = ["working", "working", "attention", "working", "paused", "working", "no_phone", "working", "working", "attention"];
const reasons = {attention: "job_needs_decision", paused: "account_paused", no_phone: "no_binding"};
const phones = [{id: 1, name: "Pixel 6a", serial: "28041JEGR04588"}, {id: 2, name: "Pixel 7", serial: "33091FDH2001AB"}, {id: 3, name: "Galaxy A54", serial: "R58W31ABCDE"}];

export const accounts = names.map((n, i) => ({
  id: i + 1, account_name: n, platform: "instagram", status: statuses[i], status_reason: reasons[statuses[i]] || null, timezone: "Europe/Warsaw",
  phone: statuses[i] === "no_phone" ? null : {...phones[i % 3], online: i % 5 !== 4, paused: statuses[i] === "paused", last_seen_at: at(-1 - i)},
  proxy: i % 3 === 0 ? {id: i, type: "socks5", host: `185.10.20.${30 + i}`, port: 1080, country: "PL", check_status: "ok"} : null,
  next_run_at: statuses[i] === "working" ? at(40 + i * 37) : null, next_local: statuses[i] === "working" ? loc(40 + i * 37) : null,
  last_action: i === 6 ? null : {type: ["claimed", "confirmed", "needs_attention", "committed", "cancelled"][i % 5], at: at(-7 - i * 23), job_id: 100 + i},
  joins: {d1: (i * 7) % 11, d7: (i * 13) % 40 + 3, total: (i * 97) % 600 + 40},
}));

const tree = {
  workers: [
    {id: 1, name: "POWER-ACER", status: "online", last_seen_at: at(-0.3), app_version: "0.4.2", paired: true, capabilities: [], last_planner_run: at(-11),
      phones: [1, 2].map((pid) => ({...phones[pid - 1], online: true, mode: pid === 1 ? "RUNNING" : "TAKEOVER", paused: false, last_seen_at: at(-0.5), proxy: pid === 1 ? accounts[0].proxy : null,
        accounts: accounts.filter((a) => a.phone?.id === pid), add: {kind: "account", apply: "device_binding_set", candidates: [{account_id: 7, account_name: "lena.vibes"}]}})),
      add: {kind: "phone", apply: "device_phone_set_worker", candidates: [{phone_id: 9, serial: "HT7A31A00123", online: true}]}},
    {id: 2, name: "OFFICE-NUC", status: "offline", last_seen_at: at(-190), app_version: "0.4.1", paired: true, capabilities: [], last_planner_run: null,
      phones: [{...phones[2], online: false, mode: "PAUSED", paused: true, last_seen_at: at(-190), proxy: null, accounts: accounts.filter((a) => a.phone?.id === 3), add: {kind: "account", candidates: []}}],
      add: {kind: "phone", candidates: []}},
  ],
  unbound_phones: [], unbound_accounts: accounts.filter((a) => !a.phone), add: {kind: "pair", candidates: []}, server_now: at(0),
};

const items = Array.from({length: 18}, (_, i) => ({id: 240 - i, content_type: i % 6 === 5 ? "story" : i % 7 === 3 ? "carousel" : "reel", status: "active", title: ["Утро у окна", "Кофе и дождь", "Зал, спина", "Прогулка", "Вечерний свет", "Кухня", "Студия", "Пляж"][i % 8] + ` ${i + 1}`, created_at: at(-i * 300), poster_url: null, media_count: i % 7 === 3 ? 4 : 1,
  cells: Object.fromEntries(accounts.map((a, j) => {
    if (!a.phone) return [a.id, {state: "blocked", reason: "no_binding"}];
    const k = (i * 3 + j * 5) % 11;
    const state = ["empty", "empty", "scheduled", "published", "waiting", "empty", "taken", "published", "failed", "scheduled", "empty"][k];
    return [a.id, {state, run_at: state === "scheduled" || state === "published" ? at((k - 4) * 180) : null, wait_reason: state === "waiting" ? "caption_settings_missing" : null}];
  }))}));

let eventId = 500;
const events = () => Array.from({length: 14}, (_, i) => ({id: ++eventId, job_id: 118, source: i % 4 === 0 ? "server" : "app", type: ["claimed", "step", "step", "screen", "tap_intent", "tap_done", "heartbeat"][i % 7], at: at(-14 + i), detail: {step: ["open_app", "pick_media", "caption", "share"][i % 4], ms: 400 + i * 37}}));

export function deskReply(action, p) {
  if (action === "account_list") return {accounts, server_now: at(0)};
  if (action === "device_tree") return tree;
  if (action === "desk_overview") return {
    timezone: "Europe/Warsaw", today: loc(0).slice(0, 10), tomorrow: loc(1440).slice(0, 10), account_count: accounts.length,
    accounts: {working: 6, paused: 1, attention: 2, no_phone: 1}, devices: {workers: {online: 1, offline: 1}, phones: {online: 2, offline: 1}},
    schedule: {today: accounts.slice(0, 6).map((a, i) => ({source: "assignment", id: i, content_type: i % 3 ? "reel" : "story", account_name: a.account_name, title: items[i].title, local: loc(30 + i * 70), state: "scheduled", job_status: i === 0 ? "claimed" : "queued"})),
      tomorrow: accounts.slice(2, 9).map((a, i) => ({source: "assignment", id: i, content_type: "reel", account_name: a.account_name, title: items[i + 4].title, local: loc(1440 + i * 90), state: i === 3 ? "scenario_wait" : "scheduled", job_status: i === 3 ? null : "queued"}))},
    decisions: [{kind: "job", id: 118, status: "needs_attention", stage: "after_commit", error_code: "tap_uncertain", account_name: "noksi.reels", at: at(-25)}, {kind: "assignment", id: 77, status: "duplicate_conflict", account_name: "nina.flow", at: at(-80)}],
    planner: {last_run: {started_at: at(-11), outcome: "ok", item_count: 6, accepted_count: 5, rejected_count: 1, error_code: null, next_try_at: null}, last_poll_at: at(-3), waiting: 4, offline: false},
    joins: accounts.map((a) => ({account_id: a.id, account_name: a.account_name, ...a.joins})).sort((x, y) => y.total - x.total), metrics: null,
  };
  if (action === "device_console") return {jobs: [{id: 118, content_type: "reel", kind: "publish_reel", status: "claimed", local: loc(-2), account_name: "nokk.ksi"}, {id: 112, content_type: "reel", kind: "publish_reel", status: "confirmed", local: loc(-600), account_name: "nokk.ksi"}], events: p.after_id ? events().slice(0, 1) : events(), last_id: eventId};
  if (action === "content_matrix") return {items, accounts: accounts.map((a) => ({id: a.id, account_name: a.account_name, status: a.status, phone: a.phone && {id: a.phone.id, name: a.phone.name}})), next_before_id: null};
  if (action === "content_item_detail") return {item: {id: p.id, title: "Утро у окна", content_type: "reel", created_at: at(-300), note: "лёгкий, без хештегов про зал", media: []}, per_account: accounts.slice(0, 3).map((a, i) => ({account_id: a.id, account_name: a.account_name, state: "scheduled", job_status: "queued", local_time: loc(100 + i * 60), timezone: "Europe/Warsaw", caption: "Утро начинается с тишины", wait_reason: null}))};
  if (action === "account_card") {
    const a = accounts.find((x) => x.id === Number(p.id)) || accounts[0];
    return {account: a, link: {invite_link: "https://t.me/+AbCdEf123", code: "ins_nokk_ksi", link_error: null}, binding: a.phone ? {phone_id: a.phone.id, expected_handle: a.account_name, min_gap_minutes: 30} : null,
      schedule: items.slice(0, 7).map((it, i) => ({id: i, item_id: it.id, title: it.title, content_type: it.content_type, state: i < 2 ? "pending_plan" : "scheduled", job_status: i < 2 ? null : "queued", local_time: i < 2 ? null : loc(200 + i * 300), wait_reason: i < 2 ? "caption_settings_missing" : null, caption: i < 2 ? null : "Тихое утро и кофе"})),
      jobs: Array.from({length: 9}, (_, i) => ({id: 118 - i, kind: "publish_reel", content_type: "reel", status: ["claimed", "confirmed", "confirmed", "missed", "confirmed", "done", "cancelled", "confirmed", "confirmed"][i], local: loc(-i * 1440), error_code: i === 3 ? "missed" : null, post_url: i === 1 ? "https://instagram.com/p/x" : null})),
      events: events(), settings: {registry: [{key: "paused", group: "Аккаунт", label: "Пауза", scope: "both", default: false}, {key: "timezone", group: "Аккаунт", label: "Часовой пояс", scope: "both", default: "Europe/Warsaw"}, {key: "rate.reel", group: "Нормы", label: "Reels", scope: "both", default: {min: 1, max: 1, period: "day"}}, {key: "hours.reel", group: "Часы публикации", label: "Reels", scope: "both", default: [{from: "10:00", to: "22:00"}]}, {key: "caption_prompt", group: "Подписи", label: "Промпт подписей", scope: "both", default: ""}],
        global: {timezone: "Europe/Warsaw"}, own: {"rate.reel": {min: 1, max: 2, period: "day"}}},
      button_texts: [{id: 1, text: "Заходи", enabled: true, use_count: 12}, {id: 2, text: "Смотри тут", enabled: false, use_count: 3}], global_button_texts: {count: 8, enabled: 6}};
  }
  return null;
}
