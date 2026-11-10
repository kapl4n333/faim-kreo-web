import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

globalThis.esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"})[c]);
globalThis.document = {addEventListener() {}};
globalThis.cField = (rec, v, id) => `<input id="${id}" value="${globalThis.esc(JSON.stringify(v))}">`;
const {clusterValue, coverageText, healthHtml, inheritedValue, plural, rampInfo, rulesSummary} = await import("../js/wide/ui/clusters.js");
const {default: clusters, cardSummary} = await import("../js/wide/sections/clusters.js");
const {SECTIONS} = await import("../js/wide/registry.js");

test("правила кластера одной строкой", () => {
  assert.equal(rulesSummary({accounts: 12, reserve: 3, maxParallel: 3, repeatDays: 0}),
    "Каждый материал пойдёт на каждый из 12 аккаунтов в своём порядке; впрок 3 на аккаунт каждого типа; один материал одновременно ждут не больше 3 аккаунтов; повтор: нет.");
  assert.ok(rulesSummary({accounts: 21, reserve: 2, maxParallel: 1, repeatDays: 30}).includes("каждый из 21 аккаунта"));
  assert.ok(rulesSummary({accounts: 21, reserve: 2, maxParallel: 1, repeatDays: 30}).includes("не больше 1 аккаунта"));
  assert.ok(rulesSummary({accounts: 5, repeatDays: 30}).endsWith("повтор: через 30 дн. после полного прохода."));
  assert.ok(rulesSummary({accounts: 1}).startsWith("Каждый материал пойдёт на единственный аккаунт"));
  assert.ok(rulesSummary({accounts: 0}).startsWith("В кластере пока нет аккаунтов"));
  assert.ok(rulesSummary({accounts: 3, paused: true}).startsWith("Пауза: новое не раздаётся. "));
});

test("покрытие и склонения", () => {
  assert.equal(coverageText(3, 12), "опубликовано 3 из 12 аккаунтов");
  assert.equal(coverageText(0, 1), "опубликовано 0 из 1 аккаунта");
  assert.equal(coverageText(2, 11), "опубликовано 2 из 11 аккаунтов");
  assert.equal(coverageText(null, 0), "опубликовано 0 из 0 аккаунтов");
  const forms = ["аккаунт", "аккаунта", "аккаунтов"];
  assert.deepEqual([1, 2, 5, 11, 21, 104].map((n) => plural(n, forms)), ["аккаунт", "аккаунта", "аккаунтов", "аккаунтов", "аккаунт", "аккаунта"]);
});

test("значение кластера: своё, иначе общее, иначе по умолчанию", () => {
  const registry = [{key: "cluster.reserve_per_type", default: 3}, {key: "cluster.repeat_after_days", default: 0}];
  const global = {global: {"cluster.repeat_after_days": 14}, effective_global: {}};
  assert.equal(clusterValue("cluster.reserve_per_type", {values: {"cluster.reserve_per_type": 5}, registry, global}), 5);
  assert.equal(clusterValue("cluster.repeat_after_days", {values: {}, registry, global}), 14);
  assert.equal(clusterValue("cluster.reserve_per_type", {values: {}, registry, global: null}), 3);
  assert.equal(inheritedValue("cluster.repeat_after_days", {registry, global: {effective_global: {"cluster.repeat_after_days": 7}, global: {"cluster.repeat_after_days": 14}}}), 7);
});

test("разгон: день N из M и что сейчас идёт", () => {
  assert.equal(rampInfo(null), null);
  assert.deepEqual(rampInfo({ageDays: 0, warmupDays: 3, days: 7}), {day: 1, total: 10, text: "день 1 из 10", phase: "только прогрев, публикаций нет"});
  assert.equal(rampInfo({ageDays: 5, warmupDays: 3, days: 7}).phase, "норма публикаций растёт до полной");
});

test("проверка аккаунта: ✓, ✗ с причиной, — если не было", () => {
  assert.ok(healthHtml(null).includes("—"));
  assert.ok(healthHtml({ok: true, status: "done", at: new Date().toISOString()}).includes("✓ только что"));
  assert.ok(healthHtml({ok: false, status: "needs_attention", error_code: "handle_mismatch", at: new Date().toISOString()}).includes("✗ На телефоне открыт другой аккаунт"));
  assert.ok(healthHtml({ok: false, status: "missed", error_code: null, at: null}).includes("✗ Пропущено"));
});

const card = {
  card: {cluster: {id: 1, name: "<Фитнес>", platform: "instagram", niche_ids: [], paused: false},
    accounts: [{account_id: 1, account_name: "a<b", has_phone: true, open: 2, published: 4, ramp: {ageDays: 1, warmupDays: 3, days: 7}}, {account_id: 2, account_name: "c", has_phone: false, open: 0, published: 0, ramp: null}],
    items: [{id: 10, content_type: "reel", title: "Ролик", source: "manual", assigned: 2, published: 1}, {id: 11, content_type: "story", title: "Из ниши", source: "niche", assigned: 1, published: 0}]},
  cs: {registry: [{key: "cluster.reserve_per_type", type: "int", default: 3, scope: "both", group: "Кластер", label: "Запас"}, {key: "cluster.max_parallel_per_item", type: "int", default: 3, scope: "both", group: "Кластер", label: "Параллельно"}, {key: "cluster.repeat_after_days", type: "int", default: 0, scope: "both", group: "Кластер", label: "Повтор"}],
    values: {"cluster.reserve_per_type": 2}},
  global: {global: {}, effective_global: {"cluster.max_parallel_per_item": 4}},
  posters: {},
};
const ctx = (params) => ({params, data: null});

test("карточка: правила, разгон, источник и экранирование", () => {
  assert.equal(cardSummary(card), "Каждый материал пойдёт на каждый из 2 аккаунтов в своём порядке; впрок 2 на аккаунт каждого типа; один материал одновременно ждут не больше 4 аккаунтов; повтор: нет.");
  const html = clusters.render(card, ctx({id: 1}));
  assert.ok(html.includes("&lt;Фитнес&gt;") && !html.includes("<Фитнес>"));
  assert.ok(html.includes("@a&lt;b") && html.includes("день 2 из 10"));
  assert.ok(html.includes('data-wcrmacc="1"') && html.includes('data-wcaddacc'));
});

test("пул: вручную можно убрать, из ниши — только сменой ниш; настройки показывают своё и «Как в общих»", async () => {
  const mod = clusters;
  // Вкладку переключаем так же, как кнопка вкладки.
  const press = (tab) => { const b = {dataset: {wctab: tab}}; mod.bind({querySelectorAll: (s) => (s === "[data-wctab]" ? [b] : []), querySelector: () => null}, {params: {id: 1}, data: card, redraw() {}}); b.onclick(); };
  press("pool");
  const pool = mod.render(card, ctx({id: 1}));
  assert.ok(pool.includes('data-wcrmitem="10"') && !pool.includes('data-wcrmitem="11"'));
  assert.ok(pool.includes("чтобы убрать — смени ниши"));
  assert.ok(pool.includes("опубликовано 1 из 2 аккаунтов") && pool.includes(">вручную<") && pool.includes(">ниша<"));
  press("settings");
  const set = mod.render(card, ctx({id: 1}));
  assert.ok(set.includes('data-wcinherit="cluster.reserve_per_type"'));
  assert.ok(!set.includes('data-wcinherit="cluster.repeat_after_days"'));
  assert.ok(set.includes("Своё у кластера") && set.includes("в общих: 3"));
});

test("список кластеров: счётчики и пауза", () => {
  const html = clusters.render({list: {clusters: [{id: 1, name: "A", platform: "instagram", niche_ids: [], paused: true, accounts: 12, items: 40, open: 9, published: 120}]}}, ctx({}));
  assert.ok(html.includes("Пауза") && html.includes('data-wcopen="1"') && html.includes("<b>120</b>"));
  assert.ok(html.includes("data-wcnew") && html.includes("data-wcdist"));
});

test("раздел «Кластеры» стоит сразу после «Аккаунтов», версии модулей подняты", () => {
  const i = SECTIONS.findIndex((s) => s.id === "accounts");
  assert.equal(SECTIONS[i + 1].id, "clusters");
  const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  for (const f of ["js/wide/main.js", "js/wide/bridge.js", "js/wide/registry.js", "js/wide/ui/dialog.js", "js/wide/ui/icons.js", "js/wide/ui/clusters.js", "js/wide/ui/settings-form.js", "js/core.js", "js/autopost.js"]) assert.ok(index.includes(`${f}?v=20261110c1`), f);
});
