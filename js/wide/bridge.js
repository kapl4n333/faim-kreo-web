// Единственное место, где модули широкой раскладки берут общие переменные старого кода (core.js).
// Старые скрипты объявляют их через const/function на верхнем уровне: модулю они видны по имени.
/* global S, api, tg, esc, toast, errMsg, header, render, savePrefs */

export const state = () => S;
export const call = (action, params) => api(action, params);
export const telegram = () => (typeof tg === "undefined" ? null : tg);
export const escape = (s) => esc(s);
export const showToast = (msg, type) => toast(msg, type);
export const errorText = (e) => errMsg(e);
export const leaveTo = (tab) => { S.tab = tab; savePrefs(); header(); render(); };
export const isAdmin = () => !!(S.me && (S.me.roles || []).includes("admin"));
export const myRoles = () => (S.me && S.me.roles) || [];
export const redrawAll = () => render();
