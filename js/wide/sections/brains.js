// Мозги: какой движок планирует на каждом ПК и что ПК сообщил о движках.
// Ключи сюда не приходят: только «вход выполнен», «ключ задан», лимит и код последней ошибки.
import {call, escape} from "../bridge.js";
import {badge, reasonText} from "../ui/badge.js";
import {confirmDialog, errorOf} from "../ui/dialog.js";
import {ago, whenIso} from "../ui/format.js";

const NAME = {claude: "Claude по подписке", gemini: "Gemini API"};
const yes = (v, ok, bad) => (v === true ? `<span class="wok">${ok}</span>` : v === false ? `<span class="wbad">${bad}</span>` : '<span class="wmute">неизвестно</span>');

function engineCard(name, s) {
  if (!s) return `<div class="weng"><b>${NAME[name]}</b><div class="wmute">ПК ещё не сообщал о движке</div></div>`;
  const lines = name === "claude"
    ? [`Программа: ${yes(s.available, "найдена", "не найдена")}`, `Вход: ${yes(s.logged_in, "выполнен", "не выполнен")}`, `По подписке: ${yes(s.subscription, "да", "нет")}`]
    : [`Ключ: ${yes(s.key_set, "задан", "не задан")}`, `Модель: <span class="mono">${escape(s.model || "—")}</span>`];
  if (s.limit_until) lines.push(`<span class="wwarn">Лимит до ${whenIso(s.limit_until)}</span>`);
  lines.push(`Последняя ошибка: ${s.error ? `<span class="wbad">${escape(reasonText(s.error) || s.error)}</span>` : "нет"}`);
  return `<div class="weng"><b>${NAME[name]}</b>${lines.map((l) => `<div>${l}</div>`).join("")}<div class="wmute">сообщено ${ago(s.reported_at)}</div></div>`;
}

export default {
  load: () => call("planner_engines_get"),
  render(d) {
    const opt = (v, cur) => `<option value="${v}"${v === cur ? " selected" : ""}>${NAME[v]}</option>`;
    const workers = d.workers.map((w) => `<section class="wcard wcard-free">
      <h2>${escape(w.name)} ${w.online ? badge("online") : badge("offline")}</h2>
      <div class="wtool"><label class="wsel"><span>Движок этого ПК</span><select data-wengine="${w.id}"><option value="inherit"${w.engine_source === "shared" ? " selected" : ""}>Как в общих (${NAME[d.shared]})</option>${w.engine_source === "own" ? opt("claude", w.engine) + opt("gemini", w.engine) : opt("claude", "") + opt("gemini", "")}</select></label>
        <span class="wmute">Сейчас планирует: <b>${NAME[w.engine]}</b>${w.last_run ? ` · последний запуск ${ago(w.last_run.at)}${w.last_run.engine ? ` (${escape(w.last_run.engine)})` : ""}` : ""}</span></div>
      <div class="wengs">${engineCard("claude", w.engines.claude)}${engineCard("gemini", w.engines.gemini)}</div>
      ${w.last_error ? `<p class="wmute">Последняя ошибка планировщика: <span class="wbad">${escape(reasonText(w.last_error.code) || w.last_error.code)}</span> · ${ago(w.last_error.at)}${w.last_error.detail ? ` · ${escape(w.last_error.detail)}` : ""}</p>` : ""}
    </section>`).join("") || '<div class="wempty"><div class="wempty-h">ПК нет</div></div>';
    return `<div class="whead"><h1>Мозги</h1><div class="whead-s">Кто выбирает время и пишет подписи. Если выбранный движок недоступен, на другой не переключаемся: назначения ждут с причиной.</div></div>
      <div class="wtool"><label class="wsel"><span>Общий движок</span><select data-wshared>${opt("claude", d.shared)}${opt("gemini", d.shared)}</select></label>
        <span class="wmute">Ключ Gemini задаётся только в <span class="mono">.env</span> PostBot на ПК строкой <span class="mono">GEMINI_API_KEY=…</span>. Здесь его не ввести и не увидеть.</span></div>
      <div class="wsetgrid">${workers}</div>`;
  },
  bind(root, ctx) {
    const save = async (params) => {
      try { await call("planner_engine_set", params); } catch (e) { await confirmDialog("Не сохранено", errorOf(e), {ok: "Понятно"}); }
      ctx.reload();
    };
    root.querySelector("[data-wshared]").onchange = (e) => save({scope: "global", value: e.target.value});
    root.querySelectorAll("[data-wengine]").forEach((s) => { s.onchange = () => save(s.value === "inherit" ? {scope: Number(s.dataset.wengine), mode: "inherit"} : {scope: Number(s.dataset.wengine), value: s.value}); });
  },
};
