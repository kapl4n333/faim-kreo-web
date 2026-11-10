// Бейджи статусов: один словарь подписей и цветов на всю раскладку.
import {contentReasonText, escape} from "../bridge.js";

// tone: ok, warn, bad, info, mute, accent
export const STATUS = {
  // аккаунты
  working: ["Работает", "ok"], paused: ["Пауза", "warn"], attention: ["Внимание", "bad"], no_phone: ["Без телефона", "mute"],
  // устройства
  online: ["На связи", "ok"], offline: ["Не на связи", "bad"], revoked: ["Отозван", "mute"],
  // задания
  queued: ["В очереди", "info"], claimed: ["Выполняется", "accent"], committed: ["Публикуется", "accent"], sent: ["Проверяется", "info"],
  confirmed: ["Подтверждено", "ok"], done: ["Готово", "ok"], unknown: ["Неизвестно", "bad"], needs_attention: ["Нужно решение", "bad"],
  failed: ["Ошибка", "bad"], missed: ["Пропущено", "bad"], cancelled: ["Отменено", "mute"],
  // назначения
  pending_plan: ["Ждёт плана", "warn"], planning: ["Планируется", "accent"], scheduled: ["Запланировано", "info"],
  scenario_wait: ["Сценарий не готов", "mute"], scenario_expired: ["Срок прошёл", "mute"], duplicate_conflict: ["Дубль", "bad"],
  // клетки матрицы
  empty: ["—", "mute"], waiting: ["Ждёт плана", "warn"], taken: ["Взято", "accent"], published: ["Вышло", "ok"], blocked: ["Нельзя", "mute"],
};

export const REASON = {
  account_hold: "Аккаунт ждёт решения, телефон свободен", phone_fault: "Телефон не готов (экран блокировки, adb или VPN), ждём", confirm_timeout: "Отправлено, но не подтверждено в профиле", post_moved: "Публикация сдвинулась, прогрев отменён", app_platform_mismatch: "Клон другой платформы", main_app_forbidden: "Основной Instagram запрещён на этом телефоне", app_not_allowed: "Клон не разрешён или не найден", app_proxy_missing: "Нет настроенного SOCKS5 для клона", app_account_conflict: "В клоне другой аккаунт", worker_clone_unsupported: "Нужно обновить PostBot", route_mismatch: "Маршрут прокси не совпал", proxy_not_ready: "Прокси телефона недоступен",
  phone_setup_required: "Телефон настраивается", screen_approval_required: "Ждёт подтверждения кнопки «Поделиться»",
  no_binding: "Нет телефона", type_disabled: "Тип выключен", job_needs_decision: "Задание ждёт решения", phone_offline: "Телефон не на связи",
  account_paused: "Пауза аккаунта", phone_paused: "Пауза телефона", caption_settings_missing: "Нет промпта подписей",
  duplicate_conflict: "Дубль, нужно решение", not_logged_in: "Claude: нет входа", not_subscription: "Claude: не подписка",
  api_key_in_env: "Ключ API в окружении", limit: "Лимит исчерпан", no_free_slot: "Нет свободного места",
  needs_attention: "Телефон остановился, нужен человек", tap_uncertain: "Неясно, было ли нажатие «Поделиться»", finished_without_tap: "Сценарий закончился без публикации",
  operator_stop: "Остановлено вручную", scenario_error: "Сбой сценария", app_restarted: "PostBot перезапускался", tap_window_expired: "Не успели нажать в отведённое время",
  handle_mismatch: "На телефоне открыт другой аккаунт", asset_missing: "Файла нет на сервере", download_failed: "Видео не скачалось на ПК", lease_lost: "ПК потерял задание",
  gemini_key_missing: "Gemini: нет ключа в .env", gemini_key_invalid: "Gemini: ключ не принят", gemini_unavailable: "Gemini недоступен", claude_unavailable: "Claude недоступен", bad_output: "Ответ не прошёл схему", timeout: "Нет ответа вовремя",
};

export const TYPE = {reel: "Reels", carousel: "Карусель", story: "История", warmup: "Прогрев", warmup_reels: "Прогрев", publish_text: "Пост Threads", engage: "Лента Threads"};

export function badge(status, {label, title} = {}) {
  const [text, tone] = STATUS[status] || [status || "—", "mute"];
  return `<span class="wb wb-${tone}"${title ? ` title="${escape(title)}"` : ""}>${escape(label ?? text)}</span>`;
}

export const dot = (status) => `<i class="wdot wb-${(STATUS[status] || [0, "mute"])[1]}"></i>`;
export const reasonText = (code) => (code ? REASON[code] || contentReasonText(code) : "");

export function reasonAction(code, settings) {
  settings = Array.isArray(settings) ? settings : [];
  const actions = {
    no_binding: "Привяжи аккаунт к телефону в «Аккаунтах».", account_archived: "Верни аккаунт из архива.",
    account_paused: "Сними паузу в настройках аккаунта.", type_disabled: "Включи этот тип публикаций в настройках аккаунта.",
    caption_settings_missing: "Заполни промпт подписей в настройках аккаунта.", no_free_slot: "Проверь норму, часы публикаций и горизонт планирования.",
    not_logged_in: "Войди в Claude по подписке на ПК.", not_subscription: "Подключи вход Claude по подписке на ПК.",
    api_key_in_env: "Убери ключ API из окружения планировщика на ПК.", limit: "Дождись снятия лимита планировщика.",
    duplicate_conflict: "Проверь дубль в «Контенте» и прими решение.",
  };
  return actions[code] || (settings.length ? `Проверь настройки аккаунта и общие правила (${settings.join(", ")}).` : "Проверь подробности в «Контенте» и состояние планировщика в «Мозгах».");
}
