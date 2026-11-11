// Диалог поверх раскладки: форма, подтверждение. Пока он открыт, опрос экран не перерисовывает.
import {escape} from "../bridge.js";

let open = null;
export const dialogOpen = () => !!open;

/**
 * dialog({title, body, actions:[{id,label,primary,danger}], onAction(id, root) → true чтобы закрыть}) → root.
 * Закрывается крестиком, Esc и кнопкой с id "close".
 */
export function dialog({title, subtitle = "", body, actions = [{id: "close", label: "Закрыть"}], onAction, wide = false}) {
  closeDialog();
  const root = document.createElement("div");
  root.className = "wdlg-scrim";
  root.innerHTML = `<div class="wdlg${wide ? " wdlg-wide" : ""}" role="dialog" aria-modal="true">
    <div class="wdh"><div><div class="wdh-s">${escape(subtitle)}</div><div class="wdh-t">${escape(title)}</div></div><button class="wx" data-wdx aria-label="Закрыть">✕</button></div>
    <div class="wdlg-b">${body}</div>
    <div class="wdlg-f"><div class="wdlg-msg" data-wmsg></div>${actions.map((a) => `<button class="wbtn${a.primary ? " wbtn-p" : ""}${a.danger ? " wbtn-d" : ""}" data-wact="${a.id}">${escape(a.label)}</button>`).join("")}</div>
  </div>`;
  document.body.appendChild(root);
  open = root;
  root.querySelector("[data-wdx]").onclick = closeDialog;
  root.addEventListener("mousedown", (e) => { if (e.target === root) closeDialog(); });
  root.querySelectorAll("[data-wact]").forEach((b) => {
    b.onclick = async () => {
      if (b.dataset.wact === "close") return closeDialog();
      const buttons = root.querySelectorAll("[data-wact]");
      buttons.forEach((x) => { x.disabled = true; });
      try {
        if (await onAction?.(b.dataset.wact, root)) closeDialog();
      } finally {
        buttons.forEach((x) => { x.disabled = false; });
      }
    };
  });
  root.querySelector("input,textarea,select")?.focus();
  return root;
}

export function dialogMessage(root, text, tone = "bad") {
  const m = root?.querySelector("[data-wmsg]");
  if (m) { m.textContent = text || ""; m.className = `wdlg-msg wb-${tone}`; }
}

export function closeDialog() { open?.remove(); open = null; }

/** Простое подтверждение. Возвращает Promise<boolean>. */
export function confirmDialog(title, text, {ok = "Да", danger = false} = {}) {
  return new Promise((resolve) => {
    let done = false;
    const root = dialog({title, body: `<p class="wdlg-p">${escape(text)}</p>`, actions: [{id: "close", label: "Нет"}, {id: "ok", label: ok, primary: !danger, danger}],
      onAction: (id) => { if (id === "ok") { done = true; resolve(true); return true; } return false; }});
    const observer = new MutationObserver(() => { if (!root.isConnected) { observer.disconnect(); if (!done) resolve(false); } });
    observer.observe(document.body, {childList: true});
  });
}

document.addEventListener("keydown", (e) => { if (e.key === "Escape" && open) closeDialog(); });

/** Текст ошибки сервера для человека. */
const ERRORS = {
  threads_clone_missing: "На этом телефоне нет клона Threads с тем же номером, что у клона Instagram. Сделайте клон Threads в клонере и подождите минуту, пока PostBot его увидит.",
  no_threads_pair: "Для этого приложения Instagram нет пары Threads.",
  app_account_conflict: "Это приложение Threads на телефоне уже привязано к другому нику.",
  account_bound_elsewhere: "Этот Threads-аккаунт уже привязан к другому телефону или приложению.",
  ambiguous_account: "Найдено несколько аккаунтов с этим ником. Уберите лишний в архив.",
  clone_limit_reached: "На телефоне уже 10 разрешённых клонов этой платформы. Отключите лишний клон.",
  worker_update_required: "Для определения клонов обновите PostBot на подключённом ПК.",
  clone_feature_disabled: "Интеграция клонов ещё не включена на сервере.",
  main_app_forbidden: "Основной Instagram запрещён на этом телефоне. Выберите и определите клон.",
  use_app_observation_confirmation: "Привязка клона создаётся после автоматического определения ника.",
  route_country_required: "Укажите две буквы страны прокси, например UA.",
  app_account_conflict: "В клоне другой аккаунт. Проверьте ник и явно подтвердите перепривязку.",
  observation_changed: "Результат определения изменился. Обновите список.",
  account_bound_elsewhere: "Этот аккаунт уже привязан к другому клону или телефону.",
  account_has_jobs: "Сначала завершите или отмените задания прежней привязки.",
  app_not_allowed: "Клон не разрешён или не найден на телефоне.",
  phone_cleanup_required: "Остановка клона и выход на главный экран ещё не подтверждены.",
  has_history: "У этого ПК есть история заданий: удалить нельзя, он останется в «Отозванных ПК».",
  revoke_first: "Сначала отзови ПК, потом удаляй.",
  bad_status: "Телефон уже взял задание: менять и отменять нельзя.",
  phone_busy: "Телефон занят заданием. Заверши его перед настройкой.",
  screen_version_mismatch: "Версия Instagram изменилась. Обнови список и проверь новый снимок.",
  screen_evidence_missing: "Снимок с рамкой ещё не получен с ПК.",
  conflict: "Кто-то уже изменил эту запись. Данные обновлены, проверь и повтори.",
  planning: "Планировщик сейчас выбирает время. Подожди минуту.",
  in_past: "Это время уже прошло.",
  bad_time: "Такого времени нет: переход часов или неверная дата.",
  caption_missing: "Нужна подпись.",
  caption_too_long: "Подпись длиннее предела из настроек.",
  caption_forbidden: "У истории подписи нет.",
  nothing_to_change: "Ничего не изменилось.",
  bad_url: "Ссылка должна начинаться с https://.",
  forbidden: "Недостаточно прав.", admin_only: "Только для админа.",
  bad_setting: "Неверное значение настройки.", duplicate: "Такой прокси уже есть.", plan_changed: "План распределения изменился. Посмотри заново.",
  bad_country: "Страна — две латинские буквы, например PL.", bad_host: "Неверный адрес.", bad_port: "Порт от 1 до 65535.",
  item_active: "У материала есть активные задания: можно только в архив.", no_handle: "Нет ника для проверки на телефоне.",
  bad_name: "Нужно название.", bad_platform: "Кластеры пока только для Instagram: аккаунт другой платформы не подходит.",
  bad_account: "Аккаунт недоступен: удалён или в архиве.", bad_item: "Материал не активен или не для Instagram.",
};
export const errorOf = (e) => ERRORS[e?.message] || ERRORS[e?.data?.error] || (e?.message ? `Не вышло: ${e.message}` : "Не вышло.");
