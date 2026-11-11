import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {datesOf, dayTitle, periodOf, periodTitle, shiftPeriod, todayLocal} from "../js/wide/ui/period.js";

test("неделя — с понедельника по воскресенье, месяц — календарный", () => {
  assert.deepEqual(periodOf("week", "2026-11-11"), {from: "2026-11-09", to: "2026-11-15"});
  assert.deepEqual(periodOf("week", "2026-11-15"), {from: "2026-11-09", to: "2026-11-15"});
  assert.deepEqual(periodOf("month", "2026-11-11"), {from: "2026-11-01", to: "2026-11-30"});
  assert.deepEqual(periodOf("month", "2026-12-31"), {from: "2026-12-01", to: "2026-12-31"});
  assert.deepEqual(periodOf("month", "2028-02-10"), {from: "2028-02-01", to: "2028-02-29"});
  assert.equal(datesOf(periodOf("week", "2026-11-11")).length, 7);
});

test("листание периодов и подписи", () => {
  assert.equal(shiftPeriod("week", "2026-11-11", 1), "2026-11-16");
  assert.equal(shiftPeriod("week", "2026-11-11", -1), "2026-11-02");
  assert.equal(shiftPeriod("month", "2026-12-15", 1), "2027-01-01");
  assert.equal(shiftPeriod("month", "2026-01-15", -1), "2025-12-01");
  assert.equal(periodTitle("week", periodOf("week", "2026-11-11")), "9–15 ноября");
  assert.equal(periodTitle("week", periodOf("week", "2026-12-01")), "30 ноября – 6 декабря");
  assert.equal(periodTitle("month", periodOf("month", "2026-11-11")), "Ноябрь 2026");
  assert.equal(dayTitle("2026-11-12"), "Чт, 12 ноября");
  assert.equal(todayLocal(new Date(2026, 10, 5, 23, 30)), "2026-11-05");
});

test("раздел «Запросы ИИ» в меню и в карте версий", () => {
  const reg = readFileSync(new URL("../js/wide/registry.js", import.meta.url), "utf8");
  assert.match(reg, /id: "requests"/);
  assert.match(reg, /requests: "/);
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /"\.\/js\/wide\/ui\/period\.js":"\.\/js\/wide\/ui\/period\.js\?v=/);
});
