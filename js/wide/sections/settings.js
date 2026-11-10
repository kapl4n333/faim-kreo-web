// Общие настройки: все общие ключи content_settings, сгруппированные реестром. Поля строит реестр:
// новая запись в settings-registry.mjs сама даёт поле здесь. Раскладка полей общая с кластером: ui/settings-form.js.
import {call, escape} from "../bridge.js";
import {errorOf} from "../ui/dialog.js";
import {readSetting, settingRow, settingsGrid} from "../ui/settings-form.js";

const saved = new Map(); // key → "ok" | текст ошибки

export default {
  load: () => call("content_settings_get"),
  render(d) {
    const list = d.registry.filter((r) => r.scope !== "account");
    const can = d.can_edit_global;
    const row = (r) => settingRow(r, {
      value: d.effective_global?.[r.key] ?? (r.key in d.global ? d.global[r.key] : r.default),
      can, state: saved.get(r.key),
      tag: r.key in d.global ? "" : ' <span class="wmute">по умолчанию</span>',
      actions: can ? `<button class="wbtn wbtn-s" data-wsave="${escape(r.key)}">Сохранить</button>` : "",
    });
    return `<div class="whead"><h1>Общие настройки</h1><div class="whead-s">Действуют на все аккаунты с «Как в общих». Свои значения аккаунта — в его карточке, кластера — в «Кластерах».${can ? "" : " Менять может только админ."}</div></div>
      ${settingsGrid(list, row)}`;
  },
  bind(root, ctx) {
    const d = ctx.data;
    root.querySelectorAll("[data-wsave]").forEach((b) => {
      b.onclick = async () => {
        const key = b.dataset.wsave;
        const rec = d.registry.find((r) => r.key === key);
        b.disabled = true;
        try {
          await call("content_settings_set", {scope: 0, key, mode: "set", value: readSetting(root, rec)});
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
