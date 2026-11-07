// Выбор прокси для аккаунта или телефона. Общий для «Устройств» и карточки аккаунта.
import {call, escape} from "../bridge.js";
import {dialog, dialogMessage, errorOf} from "./dialog.js";

export async function chooseProxy(ctx, kind, targetId, title, currentId) {
  const {proxies} = await call("proxy_list");
  const active = proxies.filter((p) => p.status === "active");
  dialog({
    subtitle: kind === "account" ? "ПРОКСИ АККАУНТА" : "ПРОКСИ ТЕЛЕФОНА", title,
    body: `<label class="wf"><span>Прокси</span><select data-f="p"><option value="">Без прокси</option>${active.map((p) => `<option value="${p.id}"${p.id === currentId ? " selected" : ""}>${escape(p.host)}:${p.port}${p.country ? ` · ${escape(p.country)}` : ""} · ${escape(p.check.status === "ok" ? "работает" : p.check.status === "failed" ? "не работает" : "не проверен")} · привязок ${p.bound.length}</option>`).join("")}</select></label>`,
    actions: [{id: "close", label: "Закрыть"}, {id: "save", label: "Сохранить", primary: true}],
    onAction: async (id, box) => {
      if (id !== "save") return false;
      const v = box.querySelector('[data-f="p"]').value;
      try {
        if (v) await call("proxy_bind", {target_kind: kind, target_id: targetId, proxy_id: Number(v)});
        else await call("proxy_unbind", {target_kind: kind, target_id: targetId});
        ctx.reload();
        return true;
      } catch (e) { dialogMessage(box, errorOf(e)); return false; }
    },
  });
}
