// Реестр разделов широкой раскладки. Меню, маршруты и права строятся только отсюда.
// Новый раздел: файл sections/<id>.js с export default {load, render, bind?} и одна запись ниже.
// Права здесь только прячут раздел, решает всегда сервер.
export const SECTIONS = [
  {id: "dashboard", group: "Обзор", title: "Дашборд", icon: "grid", roles: ["admin", "uploader"], poll: 15000},
  {id: "devices", group: "Работа", title: "Устройства", icon: "devices", roles: ["admin", "uploader"], poll: 10000},
  {id: "content", group: "Работа", title: "Контент", icon: "film", roles: ["admin", "uploader"], poll: 15000},
  {id: "accounts", group: "Работа", title: "Аккаунты", icon: "user", roles: ["admin", "uploader"], poll: 15000},
  {id: "proxies", group: "Сеть", title: "Прокси", icon: "shield", roles: ["admin"], poll: 0, stub: true},
  {id: "settings", group: "Настройки", title: "Общие настройки", icon: "sliders", roles: ["admin", "uploader"], poll: 0, stub: true},
  {id: "brains", group: "Настройки", title: "Мозги", icon: "chip", roles: ["admin"], poll: 0, stub: true},
  {id: "misc", group: "Настройки", title: "Прочие настройки", icon: "dots", roles: ["admin"], poll: 0, stub: true},
];

export const visibleSections = (roles) => SECTIONS.filter((s) => s.roles.some((r) => roles.includes(r)));
export const sectionById = (id) => SECTIONS.find((s) => s.id === id);
