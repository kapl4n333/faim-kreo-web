# OX.md — журнал изменений агента

> Сюда пишу всё, что делаю по FTask, чтобы владелец видел ход работы.
> Формат: дата — что сделал — что дальше.

---

## 2026-08-21

### Диагностика: почему Supabase MCP не работает в Zed Agent Panel

**Симптом:**
- `list_projects` → `Unauthorized. Please provide a valid access token to the MCP server via the --access-token flag or SUPABASE_ACCESS_TOKEN.`
- `get_edge_function` → `JWT could not be decoded`
- повторные вызовы → `authorization channel closed`

**Причина:** Supabase MCP-сервер в этой сессии Zed запущен БЕЗ авторизации.
Supabase MCP требует либо:
1. **OAuth-логин** (hosted `https://mcp.supabase.com/mcp` — браузер откроется сам,
   если клиент поддерживает MCP OAuth flow), либо
2. **Personal Access Token (PAT)** из https://supabase.com/dashboard/account/tokens,
   переданный как заголовок `Authorization: Bearer <PAT>` или через env
   `SUPABASE_ACCESS_TOKEN` при запуске сервера.

Сейчас ни того, ни другого нет — поэтому все вызовы падают с 401.

**Как починить (вариант А — OAuth, рекомендую):**
1. В Zed: Command Palette → `agent: open settings` → вкладка **MCP Servers**
   (или Settings → AI → MCP Servers).
2. Если там уже есть `supabase` — удалить и добавить заново через **Add Server → Add Remote Server**.
3. URL: `https://mcp.supabase.com/mcp`
4. НЕ указывать `Authorization` header — тогда Zed сам предложит OAuth-логин
   (откроется браузер → логин в Supabase → выбрать организацию с проектом FTask).
5. После логина индикатор рядом с сервером должен стать зелёным («Server is active").

**Как починить (вариант Б — PAT, если OAuth не срабатывает):**
1. Взять токен: https://supabase.com/dashboard/account/tokens → Generate new token.
2. В Zed settings (`zed: open settings file`) добавить:

```json
{
  "context_servers": {
    "supabase": {
      "url": "https://mcp.supabase.com/mcp",
      "headers": {
        "Authorization": "Bearer <СЮДА_PAT>"
      }
    }
  }
}
```

3. Перезапустить Zed (или рестартнуть сервер в MCP Servers UI).
4. Проверка: попросить агента `list_projects` — должен вернуть список проектов.

**Опционально (сужение прав, рекомендую для прода):** добавить query-параметры к URL:
- `?project_ref=xgkyuxjvwwstsuhtwhpv` — доступ только к проекту FTask;
- `&read_only=true` — только чтение (для этой задачи НЕ нужно, надо писать).

### Задача: кнопка «Залито» как отдельный элемент с синхронизацией через Supabase

**Что хочет владелец (дословно):**
- Кнопка «Залито» остаётся на карточке крео, но отдельная (не в сегменте статусов).
- Может быть и «Готово», и «Залито» одновременно (независимые флаги).
- В «Залито» отображается, кто уже залил крео.
- Подсвечивается/«горит» только у того юзера, который сам залил (по tg_id).
- Если я не нажимал «Залито», но кто-то другой залил — я всё равно вижу, кто залил.
- Нужен коннектор MCP Supabase для работы с БД.

**Статус:** в работе. Блокер: Supabase MCP в Zed не авторизован (см. выше).
Как только владелец подключит OAuth или PAT — продолжаю реализацию.

**План реализации (после подключения MCP):**
1. Проверить edge-функцию `kreo-api` (v6): action `mark_posted` уже существует,
   ставит `status=posted`, `poster_tg_id=me`, `poster_username`. Возможно,
   потребуется доработка: сделать `posted` независимым флагом от `done`
   (сейчас `posted` — это статус, который перезаписывает `done`).
2. Фронт (`index.html`):
   - Убрать «Залито» из сегмент-контрола статусов (оставить 3: Очередь/Работа/Готово).
   - Добавить отдельную кнопку «Залито» рядом с «＋ Залить готовое»:
     - если `c.status === "posted"` и `c.poster_tg_id !== S.me.tg_id` → кнопка
       задизейблена, показывает «залил: @username»;
     - если `c.status === "posted"` и `c.poster_tg_id === S.me.tg_id` → кнопка
       подсвечена (акцент), показывает «ты залил»;
     - если не posted → активная кнопка «Залито» → вызывает `mark_posted`.
3. Обновить CLAUDE.md (правило проекта).

---

## Как подключить Supabase MCP в Zed Agent Panel (шпаргалка)

**Способ 1 — через UI (проще всего):**
1. Command Palette (`Ctrl+Shift+P`) → `agent: open settings`.
2. Слева выбрать **MCP Servers** (или Settings → AI → MCP Servers).
3. **Add Server → Add Remote Server**.
4. Name: `supabase`, URL: `https://mcp.supabase.com/mcp`.
5. Сохранить. Zed предложит OAuth-логин → откроется браузер → логин в Supabase →
   выбрать организацию с проектом FTask → разрешить доступ.
6. Индикатор рядом с сервером должен стать зелёным («Server is active»).

**Способ 2 — через settings.json (если OAuth не срабатывает):**
`zed: open settings file` → добавить блок `context_servers` (см. выше вариант Б с PAT).

**Проверка после подключения:** попросить агента: «покажи список проектов через
Supabase MCP» — должен вернуть `xgkyuxjvwwstsuhtwhpv` (FTask).

---

## Примечание про текущую сессию

Supabase-тулы (`list_projects`, `get_edge_function`, `execute_sql` и т.д.) в ЭТОЙ
сессии агента уже смонтированы, но без токена — поэтому 401. После того как владелец
добавит авторизацию (OAuth или PAT) в настройках Zed, нужно **начать новый тред**
в Agent Panel — тогда тулы подхватят токен.

Важно: фронт (`index.html`) от MCP НЕ зависит — там всё ходит через edge-функцию
`kreo-api` с публичным publishable key. Так что кнопку «Залито» можно делать уже сейчас,
без Supabase MCP. MCP нужен только для правки edge/БД (если `mark_posted` придётся
дорабатывать).

## Итог по задаче «Залито» (план работ, готов к исполнению)

1. **Edge `kreo-api`** (нужен MCP): проверить/доработать `mark_posted` —
   сейчас он ставит `status=posted` (перезаписывает done). Для «и Готово, и Залито»
   логичнее: оставить `status=done`, а факт залива хранить в `poster_tg_id/
   poster_username/posted_at`. Тогда сегмент-контрол показывает 3 статуса,
   а «Залито» — отдельный флаг. НО: бот (`promote_posted`) и статистика завязаны
   на `status=posted` — менять надо аккуратно, синхронно с ботом.
2. **Фронт**: убрать «Залито» из сегмента, добавить отдельную кнопку с
   отображением постера и подсветкой только у самого постившего.
3. **Бот** (`E:\AI\CreatorBot\kreo.py`): если меняем семантику статуса —
   поправить `promote_posted` и `poll_deliveries`.
4. Обновить оба CLAUDE.md + этот OX.md.

**Решение по архитектуре (предварительное, подтвердить с владельцем):**
Вариант «минимальных правок»: НЕ трогать семантику `status=posted` (её ждут бот и
статистика), а на фронте просто убрать кнопку «Залито» из сегмента и сделать её
отдельной. Сегмент тогда показывает 4 статуса как раньше, но клик по «Залито»
в сегменте убираем — залив только через отдельную кнопку `mark_posted`.
Это даёт всё, что просил владелец, без миграций БД и без правок бота.

**Статус: жду подтверждения архитектуры и подключения MCP — дальше делаю фронт.**

---

## 2026-08-25

### Трекер источников трафика («Кейтаро») — новая фича FTask

**Задача владельца:** воронка соц → TG-канал («I will make you leak», платный контент) →
ЛС. Нужно знать, с какого соц-аккаунта какого человека сколько людей пришло. Метод
(согласован): **нативные вступления Telegram** (именованные invite-ссылки канала + апдейт
`chat_member`), без редиректа/сырых кликов. Отчёт — 11:00 Europe/Warsaw в топик супергруппы.

**Сделано (все слои):**
- **Supabase:** миграция `track_links_schema` — `track_accounts` (аккаунт→своя ссылка,
  `code` UNIQUE = имя invite-ссылки, `invite_link`/`link_error`/`pending_revoke`) +
  `track_joins` (вступления, UNIQUE(account_id,tg_user_id)). RLS on (авто-триггер), доступ
  через service_role/edge — как у прочих таблиц.
- **Edge `kreo-api` v12:** actions `track_data` (аккаунты + `joins`/`joins_24h`), `track_add`
  (валидация платформы, генерация `code`, insert), `track_delete` (soft `pending_revoke`
  если ссылка есть, иначе delete).
- **Бот (`E:\AI\Bot\CreatorBot`):** новый модуль `track.py` — `provision_loop` (создаёт/
  отзывает invite-ссылки), `record_join` (учёт вступлений), `daily_report_loop`+`build_report`
  (11:00 отчёт). Хуки в `bot.py`: `@router.chat_member()`, `@router.my_chat_member()` (лог
  chat_id), команда `/trackreport` (owner). Env в `config.py` + `deploy.yml`
  (`TRACK_CHANNEL_ID`/`TRACK_REPORT_THREAD`/`TRACK_TZ`). Graceful degrade как у Kreo.
- **Фронт (`index.html`):** «Мои» → под-тоггл [Генерации][Аккаунты] (`vMineTab`/`vAccounts`);
  «Стата» → [Кейтаро][Работа] (`vStatsTab`/`vKeitaro`, группировка по людям/аккаунтам/
  соцсетям). Ссылка-чип «клик=копировать», удаление строки. `loadTrack()`/`S.track`.
- Доки: оба `CLAUDE.md` (бот + этот) и `FaimGenBot.md` обновлены.

**Проверки:** `apply_migration` OK, RLS on; edge задеплоена (v12); `py_compile` бота OK;
`node --check` фронта OK.

**Осталось (настройка владельца, НЕ код):** задать `TRACK_CHANNEL_ID` (id канала — бот
логирует его в `my_chat_member`/`chat_member`) и `TRACK_REPORT_THREAD` (топик «Основной»)
как GitHub Secrets + локальный `.env`; бот — админ канала с правом «Пригласительные ссылки».
Затем push обоих репо (фронт → Pages, бот → GH Actions).

---
