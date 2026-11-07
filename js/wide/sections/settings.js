// Общие настройки: все общие ключи content_settings, сгруппированные реестром. Поля строит реестр:
// новая запись в settings-registry.mjs сама даёт поле здесь. caption_prompt — большое поле.
import {call, escape, legacy} from "../bridge.js";
import {errorOf} from "../ui/dialog.js";

const saved = new Map(); // key → "ok" | текст ошибки

export default {
  load: () => call("content_settings_get"),
  render(d) {
    const list = d.registry.filter((r) => r.scope !== "account");
    const groups = [...new Set(list.map((r) => r.group))];
    const can = d.can_edit_global;
    const field = (r) => {
      const value = r.key in d.global ? d.global[r.key] : r.default;
      const big = r.key === "caption_prompt";
      const state = saved.get(r.key);
      return `<div class="wset${big ? " wset-big" : ""}" data-wkey="${escape(r.key)}">
        <div class="wset-l"><b>${escape(r.label)}</b>${r.key in d.global ? "" : ' <span class="wmute">по умолчанию</span>'}${r.hint ? `<div class="wmute">${escape(r.hint)}</div>` : ""}<div class="wmute mono wset-k">${escape(r.key)}</div></div>
        <div class="wset-f">${big ? `<textarea id="ws-${escape(r.key)}" rows="14"${can ? "" : " disabled"}>${escape(value ?? "")}</textarea>` : legacy.field(r, value, `ws-${r.key}`, !can)}</div>
        <div class="wset-a">${can ? `<button class="wbtn wbtn-s" data-wsave="${escape(r.key)}">Сохранить</button>` : ""}${state ? `<div class="${state === "ok" ? "wok" : "wbad"}">${escape(state === "ok" ? "Сохранено" : state)}</div>` : ""}</div>
      </div>`;
    };
    return `<div class="whead"><h1>Общие настройки</h1><div class="whead-s">Действуют на все аккаунты с «Как в общих». Свои значения аккаунта — в его карточке.${can ? "" : " Менять может только админ."}</div></div>
      <div class="wsetgrid">${groups.map((g) => `<section class="wcard wcard-free"><h2>${escape(g)}</h2>${list.filter((r) => r.group === g).map(field).join("")}</section>`).join("")}</div>`;
  },
  bind(root, ctx) {
    const d = ctx.data;
    root.querySelectorAll("[data-wsave]").forEach((b) => {
      b.onclick = async () => {
        const key = b.dataset.wsave;
        const rec = d.registry.find((r) => r.key === key);
        const box = root.querySelector(`[data-wkey="${CSS.escape(key)}"] .wset-f`);
        b.disabled = true;
        try {
          const value = key === "caption_prompt" ? box.querySelector("textarea").value : legacy.readField(rec, box);
          await call("content_settings_set", {scope: 0, key, mode: "set", value});
          saved.set(key, "ok");
          ctx.reload();
        } catch (e) {
          saved.set(key, errorOf(e) + (e.data?.why ? ` (${e.data.why})` : ""));
          ctx.redraw();
        } finally { b.disabled = false; }
      };
    });
  },
};
