import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {setupText, phoneSetupHtml, shareApprovalHtml, screenSetsHtml} from "../js/wide/ui/screen-setup.js";

globalThis.esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
globalThis.document = {addEventListener() {}};
const devices = (await import("../js/wide/sections/devices.js")).default;
const {rowsOf} = await import("../js/wide/sections/queue.js");
const phone = {id:1, serial:"POCO", model:"POCOPHONE F1", android_version:"10", instagram_version_name:"other.1", instagram_version_code:"998",
  system_lang:"ru", setup_status:"human", setup_reason:"Не удалось выучить галерею", mode:"ATTENTION", mode_reason:"На телефоне стоит PIN", online:true,
  accounts:[], paused:false};
const approval = {set_id:2,phone_id:1,serial:"POCO",version_code:"998",lang:"ru",bounds:[100,200,300,80],image_size:[1080,2400],image_url:"https://signed.invalid/screen.png"};
test("телефон: версия, настройка и причина Нужен человек видны текстом; экранирование", () => {
  const html=phoneSetupHtml(phone);
  for(const text of ["POCOPHONE F1","Android 10","Instagram other.1","Нужен человек","Не удалось выучить галерею","На телефоне стоит PIN"]) assert.ok(html.includes(text));
  assert.equal(setupText({...phone,setup_status:"learning"}),"Изучаю Instagram other.1…");
  assert.ok(!phoneSetupHtml({...phone,setup_reason:'<script>alert("x")</script>'}).includes("<script>"));
});
test("подтверждение: рамка в координатах PNG масштабируется с изображением; без снимка нет кнопок допуска", () => {
  const html=shareApprovalHtml(approval);
  assert.ok(html.includes('viewBox="0 0 1080 2400"'));
  assert.ok(html.includes('x="100" y="200" width="300" height="80"'));
  assert.ok(html.includes('data-wscreen-decision="approved"'));
  assert.ok(html.includes('data-wscreen-decision="rejected"'));
  assert.ok(!html.includes(" disabled"));
  assert.ok(shareApprovalHtml({...approval,image_url:null}).includes(" disabled"));
  assert.ok(shareApprovalHtml({...approval,bounds:[0,0,3000,80]}).includes(" disabled"));
});
test("страница устройств: настройки, действие и список наборов; очередь показывает блокирующую причину", () => {
  const d={workers:[],unbound_phones:[phone],unbound_accounts:[],screen_sets:[{version_code:"998",lang:"ru",status:"active",confirmations:3}],share_approvals:[approval]};
  const html=devices.render(d,{});
  assert.ok(html.includes('data-wsetup="1"'));
  assert.ok(html.includes("Проверить и настроить"));
  assert.ok(html.includes("Наборы правил Instagram"));
  assert.ok(html.includes("active: 1"));
  const rows=rowsOf({rows:[],old_form:[{job_id:3,job_status:"queued",kind:"publish_reel",wait_reason:"phone_setup_required",wait_detail:"Изучаю Instagram other.1…"}]});
  assert.equal(rows[0].wait_reason,"phone_setup_required");
  assert.equal(rows[0].wait_detail,"Изучаю Instagram other.1…");
});
test("кеш модулей: main и изменённые import map версии подняты", () => {
  const html=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
  // Exact numbers change with every release: check that these modules carry a dated cache version at all.
  for (const path of ["js/wide/main.js", "ui/screen-setup.js", "ui/badge.js"]) assert.ok(new RegExp(`${path}[?]v=2026[0-9]{4}[a-z]`).test(html), path);
});
