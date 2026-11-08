// Единственное место, где модули широкой раскладки берут общие переменные старого кода (core.js, content.js).
// Старые скрипты объявляют их через const/function на верхнем уровне: модулю они видны по имени.
/* global S, api, tg, esc, toast, errMsg, header, render, savePrefs, openAddItem, cField, cFieldRead */

export const state = () => S;
export const call = (action, params) => api(action, params);
export const telegram = () => (typeof tg === "undefined" ? null : tg);
export const escape = (s) => esc(s);
export const showToast = (msg, type) => toast(msg, type);
export const errorText = (e) => errMsg(e);
export const leaveTo = (tab) => { S.tab = tab; savePrefs(); header(); render(); };
// Автозалив пока без ролей: всем видны и доступны все кнопки (08.11.2026). Сервер решает так же (AUTOPOST_ALL).
export const isAdmin = () => true;
export const myRoles = () => [...new Set([...((S.me && S.me.roles) || []), "admin", "uploader"])];
export const redrawAll = () => render();
/** Старое окно (#amodal) открыто: опрос широкой раскладки ждёт. */
export const legacyModalOpen = () => !!document.getElementById("amodal");

/** Готовые формы старого «Автозалива»: загрузка материала и поля настроек из реестра. */
export const legacy = {
  /** Старая форма «Добавить материал». onClose — когда окно закрыто (сохранено или нет). */
  openAddItem(onClose) {
    openAddItem();
    const watch = new MutationObserver(() => { if (!document.getElementById("amodal")) { watch.disconnect(); onClose?.(); } });
    watch.observe(document.body, {childList: true, subtree: false});
  },
  /** Старая форма «Новая задача»: одно видео сразу на аккаунт, без пула и планировщика. */
  openJobWizard(onClose) {
    openAutoWizard();
    const watch = new MutationObserver(() => { if (!document.getElementById("amodal")) { watch.disconnect(); onClose?.(); } });
    watch.observe(document.body, {childList: true, subtree: false});
  },
  field: (rec, value, id, disabled) => cField(rec, value, id, disabled),
  readField: (rec, box) => cFieldRead(rec, box),
};
