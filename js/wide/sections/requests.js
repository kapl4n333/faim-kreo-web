// Запросы ИИ: какие фото и видео ИИ просит для аккаунтов Threads, по датам. Неделя или месяц, загрузка прямо в запрос.
import {call, escape, showToast} from "../bridge.js";
import {confirmDialog, errorOf} from "../ui/dialog.js";
import {empty} from "../ui/empty.js";
import {datesOf, dayTitle, periodOf, periodTitle, shiftPeriod, todayLocal} from "../ui/period.js";

const KIND = {photo: "📷 Фото", video: "🎬 Видео"};
const ACCEPT = {photo: "image/jpeg,image/png,image/webp", video: "video/mp4,video/quicktime"};
const ERR = {
  need_photo: "Нужно фото: jpg, png или webp.", need_video: "Нужно видео: mp4 или mov.", one_video: "В запрос — одно видео.",
  file_missing: "Файл не дошёл до сервера. Загрузи ещё раз.", already_used: "Этот запрос уже ушёл в пост.", bad_paths: "Не тот файл.",
};
const busy = {}; // id запроса -> текст прогресса

const opts = (ctx) => {
  const p = ctx.params || {};
  return {view: p.view === "month" ? "month" : "week", anchor: /^\d{4}-\d{2}-\d{2}$/.test(p.anchor || "") ? p.anchor : todayLocal(), account: p.account || "", need: p.need === true};
};

function stateBadge(r, today) {
  if (r.state === "used") return '<span class="wrq-st wrq-used">в посте</span>';
  if (r.state === "skipped") return '<span class="wrq-st wrq-skip">пропущен</span>';
  if (r.state === "uploaded") return '<span class="wrq-st wrq-ok">загружено</span>';
  return r.date < today ? '<span class="wrq-st wrq-late">просрочено</span>' : '<span class="wrq-st wrq-need">нужно</span>';
}

function files(r) {
  if (!r.files.length) return "";
  return `<div class="wrq-files">${r.files.map((f) => (r.kind === "video"
    ? `<video src="${escape(f.url)}" preload="metadata" muted playsinline controls></video>`
    : `<a href="${escape(f.url)}" target="_blank" rel="noopener"><img src="${escape(f.url)}" alt="" loading="lazy"></a>`)).join("")}</div>`;
}

function card(r, today, multi) {
  const progress = busy[r.id];
  const buttons = r.state === "used" ? "" : progress
    ? `<span class="wmute" data-wrqprog="${r.id}">${escape(progress)}</span>`
    : `${r.state === "skipped" ? "" : `<button class="wbtn wbtn-s${r.files.length ? "" : " wbtn-p"}" data-wrqup="${r.id}">${r.files.length ? "Заменить" : "Загрузить"}</button>`}
       ${r.files.length && r.state !== "skipped" ? `<button class="wbtn wbtn-s" data-wrqclear="${r.id}">Убрать файл</button>` : ""}
       ${r.state === "skipped" ? `<button class="wbtn wbtn-s" data-wrqreopen="${r.id}">Вернуть</button>` : `<button class="wbtn wbtn-s" data-wrqskip="${r.id}">Пропустить</button>`}
       <input type="file" hidden data-wrqfile="${r.id}" accept="${ACCEPT[r.kind]}"${r.kind === "photo" ? " multiple" : ""}>`;
  return `<div class="wrq-c wrq-${r.state}">
    <div class="wrq-top"><b>${KIND[r.kind] || escape(r.kind)}</b>${multi ? `<span class="wmute">@${escape(r.handle || "")}</span>` : ""}${r.rubric ? `<span class="wchip">${escape(r.rubric)}</span>` : ""}<span class="wtool-sp"></span>${stateBadge(r, today)}</div>
    <div class="wrq-brief">${escape(r.brief)}</div>
    ${files(r)}
    <div class="wrq-act">${buttons}</div>
  </div>`;
}

export default {
  load(ctx) {
    const o = opts(ctx), {from, to} = periodOf(o.view, o.anchor);
    return call("content_requests_list", {from, to, ...(o.account ? {account_id: Number(o.account)} : {})});
  },
  render(d, ctx) {
    const o = opts(ctx), range = periodOf(o.view, o.anchor), today = todayLocal();
    const all = d.requests || [];
    const shown = o.need ? all.filter((r) => r.state === "open") : all;
    const count = (s) => all.filter((r) => r.state === s).length;
    const multi = !o.account && (d.accounts || []).length > 1;
    const byDate = new Map();
    for (const r of shown) { if (!byDate.has(r.date)) byDate.set(r.date, []); byDate.get(r.date).push(r); }
    const days = datesOf(range).filter((day) => byDate.has(day)).map((day) => {
      const list = byDate.get(day), open = list.filter((r) => r.state === "open").length;
      return `<section class="wrq-day${day === today ? " wrq-today" : ""}${day < today ? " wrq-past" : ""}">
        <h2>${escape(dayTitle(day))}${day === today ? " · сегодня" : ""}<span class="wmute">${open ? `нужно ${open}` : "всё есть"}</span></h2>
        <div class="wrq-grid">${list.map((r) => card(r, today, multi)).join("")}</div></section>`;
    }).join("");
    const waiting = (d.waiting || []).reduce((n, w) => n + Number(w.count || 0), 0);
    const accountOpts = `<option value="">Все аккаунты</option>${(d.accounts || []).map((a) => `<option value="${a.id}"${String(a.id) === o.account ? " selected" : ""}>@${escape(a.handle)}</option>`).join("")}`;
    const nothing = !(d.accounts || []).length
      ? empty("Аккаунтов Threads нет", "Запросы появляются у аккаунтов Threads.")
      : empty(o.need && all.length ? "Всё загружено" : "Запросов на эти дни нет", "ИИ пишет запросы с завтрашнего дня вперёд, когда у аккаунта включено «ИИ ведёт Threads» и ПК с мозгом на связи. Сколько фото и видео в неделю и на сколько дней вперёд — в настройках Threads.");
    return `<div class="whead"><h1>Запросы ИИ</h1><div class="whead-s">Что ИИ просит снять для Threads и к какой дате. Загружай фото или видео прямо в запрос.</div></div>
      <div class="wtool">
        <div class="wrq-seg"><button class="wbtn${o.view === "week" ? " wbtn-p" : ""}" data-wrqview="week">Неделя</button><button class="wbtn${o.view === "month" ? " wbtn-p" : ""}" data-wrqview="month">Месяц</button></div>
        <button class="wbtn" data-wrqstep="-1" aria-label="Назад">‹</button><b class="wrq-period">${escape(periodTitle(o.view, range))}</b><button class="wbtn" data-wrqstep="1" aria-label="Вперёд">›</button>
        <button class="wbtn" data-wrqtoday>Сегодня</button>
        <label class="wsel"><select data-wrqacc>${accountOpts}</select></label>
        <button class="wbtn${o.need ? " wbtn-p" : ""}" data-wrqneed>Только нужное</button>
        <div class="wtool-sp"></div>
        <span class="wmute">нужно <b>${count("open")}</b> · загружено <b>${count("uploaded")}</b>${count("used") ? ` · в постах <b>${count("used")}</b>` : ""}${count("skipped") ? ` · пропущено <b>${count("skipped")}</b>` : ""}${waiting ? ` · ИИ ещё допишет ${waiting}` : ""}</span>
      </div>
      ${days || nothing}`;
  },
  bind(root, ctx) {
    const go = (patch) => { ctx.setParams(patch); ctx.reload(); };
    const o = opts(ctx);
    root.querySelectorAll("[data-wrqview]").forEach((b) => { b.onclick = () => go({view: b.dataset.wrqview, anchor: o.anchor}); });
    root.querySelectorAll("[data-wrqstep]").forEach((b) => { b.onclick = () => go({anchor: shiftPeriod(o.view, o.anchor, Number(b.dataset.wrqstep))}); });
    root.querySelector("[data-wrqtoday]").onclick = () => go({anchor: todayLocal()});
    root.querySelector("[data-wrqacc]").onchange = (e) => go({account: e.target.value});
    root.querySelector("[data-wrqneed]").onclick = () => go({need: !o.need});

    const act = async (name, id, title) => {
      try { await call(name, {id}); } catch (e) { await confirmDialog(title, ERR[e?.message] || ERR[e?.data?.error] || errorOf(e), {ok: "Понятно"}); }
      ctx.reload();
    };
    root.querySelectorAll("[data-wrqskip]").forEach((b) => { b.onclick = () => act("content_request_skip", Number(b.dataset.wrqskip), "Не пропущено"); });
    root.querySelectorAll("[data-wrqreopen]").forEach((b) => { b.onclick = () => act("content_request_reopen", Number(b.dataset.wrqreopen), "Не вернулось"); });
    root.querySelectorAll("[data-wrqclear]").forEach((b) => { b.onclick = () => act("content_request_clear", Number(b.dataset.wrqclear), "Не убрано"); });
    root.querySelectorAll("[data-wrqup]").forEach((b) => {
      b.onclick = () => root.querySelector(`[data-wrqfile="${b.dataset.wrqup}"]`).click();
    });
    root.querySelectorAll("[data-wrqfile]").forEach((input) => {
      input.onchange = () => upload(Number(input.dataset.wrqfile), [...input.files], ctx);
    });
  },
};

function putFile(url, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(xhr.status === 413 ? "файл больше лимита сервера" : `upload ${xhr.status}`)));
    xhr.onerror = () => reject(new Error("network"));
    xhr.send(file);
  });
}

async function upload(id, list, ctx) {
  if (!list.length || busy[id]) return;
  const say = (text) => { busy[id] = text; const el = document.querySelector(`[data-wrqprog="${id}"]`); if (el) el.textContent = text; else ctx.redraw(); };
  try {
    const paths = [];
    for (let i = 0; i < list.length; i++) {
      const f = list[i], head = list.length > 1 ? `${i + 1}/${list.length} · ` : "";
      say(`${head}0%`);
      const signed = await call("sign_upload", {name: f.name});
      await putFile(signed.signedUrl, f, (part) => say(`${head}${Math.round(part * 100)}%`));
      paths.push(signed.path);
    }
    say("сохраняю…");
    await call("content_request_upload", {id, paths});
    showToast("Загружено", "ok");
  } catch (e) {
    await confirmDialog("Не загрузилось", ERR[e?.message] || ERR[e?.data?.error] || errorOf(e), {ok: "Понятно"});
  } finally {
    delete busy[id];
    ctx.reload();
  }
}
