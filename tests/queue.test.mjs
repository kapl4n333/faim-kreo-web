import test from "node:test";
import assert from "node:assert/strict";
import {reasonText} from "../js/wide/ui/badge.js";
import {deskReply} from "./wide-fixtures.js";

globalThis.esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"})[c]);
globalThis.document = {addEventListener() {}};
const {default: queue} = await import("../js/wide/sections/queue.js");

test("account hold stays visible and says the phone is free",()=>{
  const html=queue.render({old_form:[{job_id:7,content_type:"reel",account_name:"held",caption:"Held job",job_status:"unknown",wait_reason:"account_hold"}]});
  assert(html.includes("Held job"));assert(html.includes("Аккаунт ждёт решения, телефон свободен"));assert(!html.includes('data-wqcancel'));
});

test("sent from assignments and the old form stays visible, counts today and cannot be cancelled", () => {
  const run_at = new Date().toISOString();
  const data = {rows: [{id: 1, editable: true, content_type: "reel", title: "Материал", state: "scheduled", job_status: "sent", run_at}], old_form: [{job_id: 2, content_type: "story", caption: "Старая форма", job_status: "sent", run_at}]};
  const html = queue.render(data);
  assert.ok(html.includes("Материал") && html.includes("Старая форма"));
  assert.equal((html.match(/Проверяется/g) || []).length, 2);
  assert.equal((html.match(/Отправлено, не подтверждено/g) || []).length, 2);
  assert.ok(!html.includes("data-wqcancel"));
  for (const label of ["Reels сегодня", "Истории сегодня"]) assert.ok(html.includes(`<div class="wkpi-v">1</div><div class="wkpi-l">${label}</div>`));
  data.rows[0].job_status = "confirmed";
  const confirmed = queue.render(data);
  assert.ok(!confirmed.includes("Материал"));
  assert.ok(confirmed.includes("Старая форма"));
});

test("queue reuses the wait reason dictionary and escapes detail and setting keys", () => {
  const row = {id: 1, content_type: "carousel", state: "pending_plan", wait_reason: "no_binding", wait_detail: "<подробности>", blocking_settings: []};
  const html = queue.render({rows: [row]});
  assert.ok(html.includes("Нет телефона"));
  assert.ok(html.includes("Привяжи аккаунт к телефону"));
  assert.ok(html.includes("&lt;подробности&gt;") && !html.includes("<подробности>"));
  row.wait_reason = "validation:future_code";
  row.blocking_settings = ["<setting>"];
  const unknown = queue.render({rows: [row]});
  assert.equal(reasonText(row.wait_reason), row.wait_reason);
  assert.ok(unknown.includes("validation:future_code"));
  assert.ok(unknown.includes("&lt;setting&gt;") && !unknown.includes("<setting>"));
});

test("the queue fixture includes a sent row with the wait reason and action", () => {
  const html = queue.render(deskReply("content_schedule_list", {}));
  assert.ok(html.includes("Ждёт подтверждения"));
  assert.ok(html.includes("Пауза аккаунта"));
  assert.ok(html.includes("Новые публикации приостановлены"));
  assert.ok(html.includes("Сними паузу"));
  assert.ok(!html.includes('data-wqcancel="a33"'));
});

test("planner reasons and validation labels reuse the dictionaries from content.js", () => {
  globalThis.CA_WAIT = {planner_timeout: "Запуск планировщика не завершился"};
  globalThis.CA_REJECT = {bad_time: "такого времени нет"};
  try {
    assert.equal(reasonText("planner_timeout"), CA_WAIT.planner_timeout);
    assert.equal(reasonText("validation:bad_time"), `Отказ проверки: ${CA_REJECT.bad_time}`);
    assert.equal(reasonText("validation:future_code"), "validation:future_code");
    assert.equal(reasonText("future_code"), "future_code");
  } finally {
    delete globalThis.CA_WAIT;
    delete globalThis.CA_REJECT;
  }
});
