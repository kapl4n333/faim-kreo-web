// Пустые состояния: нет данных, нет прав, ошибка, будет позже.
import {escape} from "../bridge.js";

export const empty = (title, text = "") => `<div class="wempty"><div class="wempty-h">${escape(title)}</div>${text ? `<div class="wempty-t">${escape(text)}</div>` : ""}</div>`;
export const noData = (text = "") => empty("Нет данных", text);
export const loading = () => `<div class="wempty"><div class="spin"></div></div>`;
export const failed = (text) => `<div class="wempty"><div class="wempty-h">Не загрузилось</div><div class="wempty-t">${escape(text)}</div><button class="wbtn" data-wretry>Повторить</button></div>`;
export const later = (what) => empty(what, "Будет на шаге 3.");
