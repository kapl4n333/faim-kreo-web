// Папка историй: фото, из которых сервер сам ставит истории на аккаунты, случайно и без повторов подряд.
import {call, escape, legacy, state} from "../bridge.js";
import {confirmDialog, errorOf} from "../ui/dialog.js";
import {noData} from "../ui/empty.js";
import {ago} from "../ui/format.js";

let auto = false;

export default {
  load: async () => {
    const [pool, settings] = await Promise.all([
      call("content_pool_list", {status: "active", content_type: "story", pool: true}),
      call("content_settings_get", {}),
    ]);
    return {pool, settings};
  },
  render(d) {
    const items = d.pool.items || [];
    const g = d.settings.global || d.settings.values || {};
    auto = (g.story_pool ?? (d.settings.registry || []).find((r) => r.key === "story_pool")?.default) === true;
    const cards = items.map((i) => {
      const m = i.media[0];
      const img = i.poster_url || (m && m.media_kind === "photo" ? m.url : null);
      const used = i.assignments.length;
      return `<div class="wsf-i">${img ? `<img src="${escape(img)}" alt="" loading="lazy">` : '<span class="wm-noimg"></span>'}
        <div class="wmute">#${i.id} · ${ago(i.created_at)} · ${used ? `ставилось ${used}` : "ещё не ставилось"}</div>
        <button class="wbtn wbtn-s" data-wsfarch="${i.id}">Убрать</button></div>`;
    }).join("");
    return `<div class="whead"><h1>Папка историй</h1><div class="whead-s">Загружай сюда фото. Сервер сам ставит истории на каждый аккаунт до дневной нормы, выбирая случайное фото, и сам решает, в какой будет ссылка (по умолчанию одна в день).</div></div>
      <div class="wtool"><button class="wbtn wbtn-p" data-wsfadd>+ Загрузить фото</button>
        <button class="wbtn${auto ? " wbtn-p" : ""}" data-wsfauto>${auto ? "Автоподбор включён — выключить" : "Автоподбор выключен — включить"}</button>
        <div class="wtool-sp"></div><span class="wmute">Фото в папке: ${items.length}</span></div>
      ${items.length ? `<section class="wcard wcard-free"><div class="wsf">${cards}</div></section>` : noData("Папка пуста. Нажми «Загрузить фото», можно сразу много.")}`;
  },
  bind(root, ctx) {
    root.querySelector("[data-wsfadd]").onclick = () => { state().cType = "story_pool"; legacy.openAddItem(() => ctx.reload()); };
    root.querySelector("[data-wsfauto]").onclick = async () => {
      try { await call("content_settings_set", {scope: "global", key: "story_pool", mode: "set", value: !auto}); } catch (e) { await confirmDialog("Не сохранено", errorOf(e), {ok: "Понятно"}); }
      ctx.reload();
    };
    root.querySelectorAll("[data-wsfarch]").forEach((b) => {
      b.onclick = async () => {
        try { await call("content_item_archive", {id: Number(b.dataset.wsfarch)}); } catch (e) { await confirmDialog("Не убрано", errorOf(e), {ok: "Понятно"}); }
        ctx.reload();
      };
    });
  },
};
