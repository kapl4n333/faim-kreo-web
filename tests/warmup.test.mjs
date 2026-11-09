import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

globalThis.esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"})[c]);
globalThis.document = {addEventListener() {}};
const {default: queue, rowsOf, filterRows} = await import("../js/wide/sections/queue.js");
const {warmupView} = await import("../js/wide/sections/accounts.js");
const {jobButtons} = await import("../js/wide/ui/job-actions.js");

test("очередь: Всё по умолчанию, Прогрев отдельно, фильтр не меняет публикации", () => {
  const data = {rows: [{id: 1, content_type: "reel", state: "pending_plan", title: "ролик"}], old_form: [{job_id: 2, job_revision: 4, kind: "warmup_reels", job_status: "queued", caption: "7 мин", account_name: "<account>"}]};
  const html = queue.render(data);
  assert.ok(html.includes('value="all" selected'));
  assert.ok(html.includes('>Заливы<') && html.includes('>Прогрев<'));
  assert.ok(html.includes('data-wqcancel="j2"'));
  assert.ok(html.includes('&lt;account&gt;'));
  assert.equal(filterRows(rowsOf(data), "warmup").length, 1);
  assert.equal(filterRows(rowsOf(data), "publish").length, 1);
  assert.equal(filterRows(rowsOf(data), "all").length, 2);
  data.old_form[0].job_status = "claimed";
  assert.ok(!queue.render(data).includes('data-wqcancel="j2"'));
});
test("карточка прогрева: сегодня/7 дней, ближайшие, кнопка и настройки при выключенном авто", () => {
  const html = warmupView({account: {phone: {id: 1}}, warmup: {enabled: false, today: {sessions: 1, reels: 20, likes: 2, minutes: 7.5}, d7: {sessions: 3, reels: 80, likes: 9, minutes: 25}, upcoming: [{id: 2, revision: 1, local: "2026-11-08T18:00", minutes: 8, status: "queued"}]}});
  for (const text of ["Сегодня", "За 7 дней", "Ближайшие сессии", "Прогреть сейчас", "Настройки", "выключен"]) assert.ok(html.includes(text), text);
  assert.ok(!html.includes('data-wwarmup disabled'));
  assert.ok(html.includes('data-wjob="cancel_job"'));
  assert.ok(warmupView({account: {phone: null}}).includes('data-wwarmup disabled'));
});
test("прогрев у человека не предлагает кнопку Вышло", () => {
  const html = jobButtons({id: 1, revision: 1, kind: "warmup_reels", status: "needs_attention"});
  assert.ok(html.includes('data-wjob="cancel"')); assert.ok(!html.includes('data-wjob="published"'));
});
test("поля реестра: диапазон, дробный множитель и список слов читаются типизированно", () => {
  const source = readFileSync(new URL('../js/content.js', import.meta.url), 'utf8');
  const functions = source.slice(source.indexOf('function cField('), source.indexOf('const cEffective='));
  const context = vm.createContext({esc: globalThis.esc, dEscapeAttr: globalThis.esc});
  vm.runInContext(functions, context);
  const field = context.cField({type: 'range', min: 0, max: 60}, {min: 2, max: 8}, 'v', false);
  assert.ok(field.includes('data-f="min"') && field.includes('data-f="max"'));
  assert.ok(context.cField({type: 'number', min: 0, max: 5}, 1.3, 'v', false).includes('step="0.1"'));
  const box = (main, values = {}) => ({querySelector(selector) { const m = /data-f="([^"]+)"/.exec(selector); return m ? {value: values[m[1]]} : {value: main}; }});
  assert.equal(context.cFieldRead({type: 'number'}, box('1.3')), 1.3);
  assert.equal(JSON.stringify(context.cFieldRead({type: 'range'}, box('', {min: '2', max: '8'}))), '{"min":2,"max":8}');
  assert.equal(JSON.stringify(context.cFieldRead({type: 'strings'}, box(' cats\n\nспорт '))), '["cats","спорт"]');
});
test("версии ресурсов прогрева подняты", () => {
  const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const versions = {'js/wide/main.js':'20261109a1', 'js/wide/ui/badge.js':'20261109a1', 'js/wide/ui/job-actions.js':'20261108w1', 'js/content.js':'20261108w1'};
  for (const [path,version] of Object.entries(versions)) assert.ok(index.includes(path + '?v=' + version), path);
});
