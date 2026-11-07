// Прокси: список, массовая вставка, правка, проверка с сервера или с ПК, привязки, автораспределение.
// Раздел только для админа; пароли сервер отдаёт только сюда. На телефоне прокси в этом этапе не применяется.
import {call, escape} from "../bridge.js";
import {badge} from "../ui/badge.js";
import {confirmDialog, dialog, dialogMessage, errorOf} from "../ui/dialog.js";
import {ago} from "../ui/format.js";
import {bindSort, bindToolbar, table, toolbar} from "../ui/table.js";

const view = {q: "", check: "", reveal: new Set(), picked: new Set()};
const CHECK = {ok: ["Работает", "ok"], failed: ["Не работает", "bad"], checking: ["Проверяется", "accent"]};
const checkBadge = (c) => { const [l, t] = CHECK[c.status] || ["Не проверен", "mute"]; return `<span class="wb wb-${t}" title="${escape([c.source === "worker" ? "с ПК" : c.source === "server" ? "с сервера" : "", c.error || "", c.at ? ago(c.at) : ""].filter(Boolean).join(" · "))}">${l}</span>`; };

function bulkDialog(ctx) {
  dialog({
    subtitle: "ПРОКСИ", title: "Массовая вставка", wide: true,
    body: `<div class="wform"><label class="wf"><span>Один прокси на строку: <span class="mono">socks5://логин:пароль@адрес:порт</span>, <span class="mono">адрес:порт:логин:пароль</span> или <span class="mono">адрес:порт</span></span><textarea rows="10" data-f="t" class="mono"></textarea></label>
      <div class="wf-2"><label class="wf"><span>Тип по умолчанию</span><select data-f="type"><option value="socks5">socks5</option><option value="http">http</option></select></label><label class="wf"><span>Страна (необязательно)</span><input data-f="c" maxlength="2" placeholder="PL"></label></div><div data-wres class="wres"></div></div>`,
    actions: [{id: "close", label: "Закрыть"}, {id: "go", label: "Добавить", primary: true}],
    onAction: async (id, box) => {
      if (id !== "go") return false;
      const f = (n) => box.querySelector(`[data-f="${n}"]`).value;
      try {
        const r = await call("proxy_add_bulk", {text: f("t"), type: f("type"), country: f("c").trim() || null});
        box.querySelector("[data-wres]").innerHTML = `<div>Добавлено: <b>${r.added}</b>. Пропущено: ${r.skipped.length}${r.skipped.length ? ` (${r.skipped.slice(0, 20).map((s) => `строка ${s.line}: ${({duplicate: "уже есть", bad_format: "не разобрана", bad_host: "адрес", bad_port: "порт"})[s.reason] || s.reason}`).join(", ")})` : ""}.</div>`;
        ctx.reload();
      } catch (e) { dialogMessage(box, errorOf(e)); }
      return false;
    },
  });
}

function editDialog(ctx, p) {
  dialog({
    subtitle: "ПРОКСИ", title: `${p.host}:${p.port}`,
    body: `<div class="wform"><div class="wf-2"><label class="wf"><span>Тип</span><select data-f="type"><option${p.type === "socks5" ? " selected" : ""}>socks5</option><option${p.type === "http" ? " selected" : ""}>http</option></select></label><label class="wf"><span>Статус</span><select data-f="status"><option value="active"${p.status === "active" ? " selected" : ""}>Включён</option><option value="disabled"${p.status === "disabled" ? " selected" : ""}>Выключен</option></select></label></div>
      <div class="wf-2"><label class="wf"><span>Адрес</span><input data-f="host" value="${escape(p.host)}"></label><label class="wf"><span>Порт</span><input type="number" data-f="port" value="${p.port}"></label></div>
      <div class="wf-2"><label class="wf"><span>Логин</span><input data-f="username" value="${escape(p.username || "")}"></label><label class="wf"><span>Новый пароль (пусто — не менять)</span><input data-f="password" autocomplete="off"></label></div>
      <div class="wf-2"><label class="wf"><span>Страна</span><input data-f="country" maxlength="2" value="${escape(p.country || "")}"></label><label class="wf"><span>Заметка</span><input data-f="note" value="${escape(p.note || "")}"></label></div></div>`,
    actions: [{id: "delete", label: "Удалить", danger: true}, {id: "close", label: "Закрыть"}, {id: "save", label: "Сохранить", primary: true}],
    onAction: async (id, box) => {
      try {
        if (id === "delete") {
          if (!(await confirmDialog("Удалить прокси?", `${p.host}:${p.port}. Привязки снимутся.`, {ok: "Удалить", danger: true}))) return false;
          await call("proxy_delete", {id: p.id});
          ctx.reload();
          return true;
        }
        if (id !== "save") return false;
        const f = (n) => box.querySelector(`[data-f="${n}"]`).value;
        await call("proxy_update", {id: p.id, type: f("type"), status: f("status"), host: f("host"), port: Number(f("port")), username: f("username") || null, ...(f("password") ? {password: f("password")} : {}), country: f("country").trim() || null, note: f("note") || null});
        ctx.reload();
        return true;
      } catch (e) { dialogMessage(box, errorOf(e)); return false; }
    },
  });
}

function checkDialog(ctx, d, ids) {
  dialog({
    subtitle: "ПРОВЕРКА", title: `Проверить: ${ids.length}`,
    body: `<div class="wform"><label class="wf"><span>Откуда проверять</span><select data-f="src"><option value="server">С сервера</option>${d.workers.map((w) => `<option value="${w.id}">С ПК ${escape(w.name)}${w.online ? "" : " (не на связи — проверит, когда выйдет)"}</option>`).join("")}</select></label>
      <p class="wmute">Открывается https://api.ipify.org через прокси, до 10 секунд. С ПК данные прокси уходят только по каналу этого ПК и не сохраняются на диск.</p><div data-wres class="wres"></div></div>`,
    actions: [{id: "close", label: "Закрыть"}, {id: "go", label: "Проверить", primary: true}],
    onAction: async (id, box) => {
      if (id !== "go") return false;
      const src = box.querySelector('[data-f="src"]').value;
      try {
        if (src === "server") {
          const {results} = await call("proxy_check", {ids});
          box.querySelector("[data-wres]").innerHTML = results.map((r) => `<div>#${r.id}: ${r.ok ? `<b class="wok">работает</b>, ${r.latency_ms} мс, IP ${escape(r.exit_ip)}` : `<b class="wbad">не работает</b> (${escape(r.error)})`}</div>`).join("");
        } else {
          const r = await call("proxy_check", {ids, source: "worker", worker_id: Number(src)});
          box.querySelector("[data-wres]").innerHTML = `<div>Отправлено на ПК: ${r.queued}. Результат появится в списке после следующей связи ПК.</div>`;
        }
        ctx.reload();
      } catch (e) { dialogMessage(box, errorOf(e)); }
      return false;
    },
  });
}

async function distribute(ctx) {
  let plan;
  try { plan = await call("proxy_autodistribute", {dry_run: true}); } catch (e) { return confirmDialog("Не вышло", errorOf(e), {ok: "Понятно"}); }
  const rules = plan.rules;
  dialog({
    subtitle: "АВТОРАСПРЕДЕЛЕНИЕ", title: `Привязать: ${plan.plan.length}`, wide: true,
    body: `<p class="wmute">Правила (меняются в «Общих настройках» → Прокси): по ${rules.target === "phone" ? "телефонам" : "аккаунтам"}, не больше ${rules.accounts_per_proxy} на прокси${rules.match_country ? ", страна совпадает" : ""}${rules.only_checked ? ", только проверенные" : ""}. Ручные привязки не трогаются. Это только запись в базе: на телефоне прокси пока не применяется.</p>
      ${table("proxy-plan", [{key: "name", label: rules.target === "phone" ? "Телефон" : "Аккаунт"}, {key: "proxy", label: "Прокси"}], plan.plan, {empty: "Распределять нечего"})}
      ${plan.missing.length ? `<p class="wwarn">Не хватило прокси: ${plan.missing.map((m) => escape(m.name)).join(", ")}</p>` : ""}`,
    actions: [{id: "close", label: "Закрыть"}, ...(plan.plan.length ? [{id: "go", label: "Применить", primary: true}] : [])],
    onAction: async (id, box) => {
      if (id !== "go") return false;
      try { await call("proxy_autodistribute", {dry_run: false, plan_sig: plan.plan_sig}); ctx.reload(); return true; } catch (e) { dialogMessage(box, errorOf(e)); return false; }
    },
  });
  return undefined;
}

export default {
  load: () => call("proxy_list"),
  render(d) {
    const q = view.q.trim().toLowerCase();
    const list = d.proxies.filter((p) => (!view.check || (p.check.status || "none") === view.check) && (!q || `${p.host}:${p.port} ${p.username || ""} ${p.country || ""} ${p.note || ""} ${p.bound.map((b) => b.name).join(" ")}`.toLowerCase().includes(q)));
    for (const id of [...view.picked]) if (!d.proxies.some((p) => p.id === id)) view.picked.delete(id);
    const tool = toolbar({
      search: {id: "q", placeholder: "Адрес, логин, страна, привязка", value: view.q},
      filters: [{id: "check", label: "Проверка", value: view.check, options: [["", "Любая"], ["ok", "Работает"], ["failed", "Не работает"], ["checking", "Проверяется"], ["none", "Не проверен"]]}],
      actions: `<button class="wbtn" data-wcheck${view.picked.size ? "" : " disabled"}>Проверить выбранные${view.picked.size ? ` (${view.picked.size})` : ""}</button><button class="wbtn" data-wdist>Распределить автоматически</button><button class="wbtn wbtn-p" data-wbulk>+ Вставить списком</button>`,
    });
    const t = table("proxies", [
      {key: "pick", label: "", width: "34px", sort: false, html: (p) => `<input type="checkbox" data-wpick="${p.id}"${view.picked.has(p.id) ? " checked" : ""}>`},
      {key: "type", label: "Тип", width: "70px"},
      {key: "host", label: "Адрес", html: (p) => `<span class="mono">${escape(p.host)}</span>`},
      {key: "port", label: "Порт", width: "70px", align: "right"},
      {key: "username", label: "Логин", width: "130px", html: (p) => escape(p.username || "—")},
      {key: "password", label: "Пароль", width: "150px", sort: false, html: (p) => (p.has_password ? `<span class="mono">${view.reveal.has(p.id) ? escape(p.password) : "••••••"}</span> <button class="wlink" data-wreveal="${p.id}">${view.reveal.has(p.id) ? "скрыть" : "показать"}</button>` : '<span class="wmute">нет</span>')},
      {key: "country", label: "Страна", width: "70px", html: (p) => escape(p.country || "—")},
      {key: "check", label: "Проверка", width: "200px", value: (p) => p.check.status, html: (p) => `${checkBadge(p.check)}${p.check.latency_ms ? ` <span class="wmute">${p.check.latency_ms} мс</span>` : ""}${p.check.exit_ip ? ` <span class="wmute mono">${escape(p.check.exit_ip)}</span>` : ""}`},
      {key: "bound", label: "Привязан", value: (p) => p.bound.length, html: (p) => (p.bound.length ? p.bound.map((b) => `${b.kind === "account" ? "@" : "📱 "}${escape(b.name || b.id)}${b.source === "auto" ? ' <span class="wmute">авто</span>' : ""}`).join(", ") : '<span class="wmute">—</span>')},
      {key: "status", label: "", width: "90px", html: (p) => (p.status === "disabled" ? badge("paused", {label: "Выключен"}) : "")},
      {key: "edit", label: "", width: "90px", sort: false, html: (p) => `<button class="wbtn wbtn-s" data-wedit="${p.id}">Изменить</button>`},
    ], list, {empty: "Прокси нет. Вставь списком или внеси через SQL (пример в контракте, раздел 15.8)."});
    return `<div class="whead"><h1>Прокси</h1><div class="whead-s">${d.proxies.length} всего · на телефоне в этом этапе не применяются</div></div>${tool}<div class="wpanel">${t}</div>`;
  },
  bind(root, ctx) {
    const d = ctx.data;
    bindToolbar(root, (id, value) => { view[id] = value; ctx.redraw(); });
    bindSort(root, ctx.redraw);
    root.querySelector("[data-wbulk]").onclick = () => bulkDialog(ctx);
    root.querySelector("[data-wdist]").onclick = () => distribute(ctx);
    root.querySelector("[data-wcheck]").onclick = () => checkDialog(ctx, d, [...view.picked]);
    root.querySelectorAll("[data-wpick]").forEach((cb) => { cb.onchange = () => { const id = Number(cb.dataset.wpick); cb.checked ? view.picked.add(id) : view.picked.delete(id); ctx.redraw(); }; });
    root.querySelectorAll("[data-wreveal]").forEach((b) => { b.onclick = () => { const id = Number(b.dataset.wreveal); view.reveal.has(id) ? view.reveal.delete(id) : view.reveal.add(id); ctx.redraw(); }; });
    root.querySelectorAll("[data-wedit]").forEach((b) => { b.onclick = () => editDialog(ctx, d.proxies.find((p) => p.id === Number(b.dataset.wedit))); });
  },
};
