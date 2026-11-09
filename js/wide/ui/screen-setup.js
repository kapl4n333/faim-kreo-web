// Автонастройка: подписи статусов и масштабируемая рамка на исходном снимке.
import {escape} from "../bridge.js";

export const SETUP = {pending: "Ждёт настройки", learning: "Настройка", ready: "Готов", awaiting_share: "Ждёт подтверждения «Поделиться»", human: "Нужен человек"};
const BRAIN_ERROR = {not_subscription: "Claude: нужен вход по подписке", not_logged_in: "Claude: нет входа", api_key_in_env: "Claude: в окружении ключ API",
  claude_unavailable: "Claude недоступен", brain_unavailable: "Мозг недоступен", gemini_unavailable: "Gemini недоступен", limit: "Лимит вызовов", timeout: "Нет ответа вовремя"};
export function setupText(p) {
  if (p.setup_status === "learning") return "Изучаю Instagram " + (p.instagram_version_name || p.instagram_version_code || "") + "…";
  return SETUP[p.setup_status] || "Настройка не проверена";
}
export function phoneSetupHtml(p) {
  const meta = [p.model, p.android_version ? "Android " + p.android_version : "", p.instagram_version_name ? "Instagram " + p.instagram_version_name : "",
    p.instagram_version_code ? "код " + p.instagram_version_code : "", p.system_lang].filter(Boolean).join(" · ");
  return '<div class="wmute">' + escape(meta) + '</div><div>' + escape(setupText(p)) + '</div>'
    + (p.setup_reason ? '<div class="wwarn">' + escape(p.setup_reason) + '</div>' : "")
    + (p.mode_reason && p.mode_reason !== p.setup_reason ? '<div class="wwarn">' + escape(p.mode_reason) + '</div>' : "")
    + (p.brain_provider ? '<div class="wmute">Мозг: ' + escape(p.brain_provider) + (p.brain_error ? " · " + escape(BRAIN_ERROR[p.brain_error] || p.brain_error) : "") + '</div>' : "");
}
export function shareApprovalHtml(a) {
  const b = a.bounds, size = a.image_size;
  const valid = Array.isArray(b) && b.length === 4 && b.every(Number.isFinite) && Array.isArray(size) && size.length === 2
    && size.every((n) => Number.isFinite(n) && n > 0) && b[0] >= 0 && b[1] >= 0 && b[2] > 0 && b[3] > 0 && b[0]+b[2] <= size[0] && b[1]+b[3] <= size[1];
  const image = valid && a.image_url ? '<div style="position:relative;max-width:340px"><img alt="Выбранная кнопка Поделиться" src="' + escape(a.image_url)
    + '" style="display:block;width:100%;height:auto"><svg aria-label="Рамка выбранного элемента" viewBox="0 0 ' + size.join(" ")
    + '" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none"><rect x="' + b[0] + '" y="' + b[1] + '" width="' + b[2] + '" height="' + b[3]
    + '" fill="none" stroke="#ff3030" stroke-width="6"/></svg></div>' : '<div class="wwarn">Ждём снимок с телефона</div>';
  return '<article class="wcard"><h3>Проверь кнопку «Поделиться»</h3><div>' + escape(a.serial) + " · Instagram "
    + escape(a.instagram_version_name || a.version_code) + " · " + escape(a.lang) + '</div>' + image
    + '<p>Рамка выделяет кнопку публикации. Это верный элемент?</p>'
    + ["approved", "rejected"].map((decision) => '<button class="wbtn" data-wscreen-decision="' + decision + '" data-wscreen-set="' + Number(a.set_id) + '" data-wscreen-phone="' + Number(a.phone_id) + '"' + (!valid || !a.image_url ? " disabled" : "") + '>' + (decision === "approved" ? "Верно" : "Неверно") + '</button>').join(" ") + '</article>';
}
export function screenSetsHtml(d) {
  const approvals = (d.share_approvals || []).map(shareApprovalHtml).join("");
  const list = d.screen_sets || [];
  const versions = new Map();
  for (const s of list) {
    const key = String(s.version_code) + " · " + s.lang;
    const v = versions.get(key) || {active: 0, candidate: 0, rejected: 0, confirmations: 0};
    if (s.status in v) v[s.status]++;
    v.confirmations += Number(s.confirmations) || 0;
    versions.set(key, v);
  }
  const rows = [...versions].map(([v,n]) => '<tr><td>' + escape(v) + '</td><td>active: ' + n.active + ' · candidate: ' + n.candidate + ' · отклонено: ' + n.rejected + '</td><td>' + n.confirmations + '</td></tr>').join("");
  return approvals + (rows ? '<section class="wcard"><h3>Наборы правил Instagram</h3><table class="wt"><thead><tr><th>Версия / язык</th><th>Статус правил</th><th>Подтверждения переходов</th></tr></thead><tbody>' + rows + '</tbody></table></section>' : "");
}
