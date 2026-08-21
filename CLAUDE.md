# FTask — Mini App + бот: хендофф-документ

> Самодостаточная справка по проекту **FTask** (реестр креативов внутри Telegram-бота
> @faimGenBot) для FAIM. Отдай этот файл любому агенту — он сможет продолжить работу,
> имея доступ к двум локальным репо (пути ниже). Секреты в файле НЕ хранятся — только
> где они лежат. Дата актуальности: 2026-08-21.

---

## 0. Что это и зачем

FAIM — агентство AI-инфлюенсеров (флагман — персонаж **Ava Carter / avacarter**).
Креативы («крео» — ссылка/текст/фото/видео/альбом с идеей/референсом) кидают в один
телеграм-топик, а готовое отдают в другой. Раньше это была лента-каша. **FTask** —
Mini App (веб-приложение внутри Telegram) поверх бота: превращает поток в рабочий
**реестр** со статусами, ролями, claim-бордом («кто взял крео»), задачами и статистикой.
Постинг в соцсети — НЕ в зоне проекта; FTask доводит крео до «залито» и всё.

---

## 1. Топология (где что лежит)

| Компонент | Где | Стек | Деплой |
|---|---|---|---|
| **Бот** | `E:\AI\CreatorBot` (репо `github.com/kapl4n333/FaimGenBot`) | Python, aiogram v3, httpx, без БД | push в `main` → GitHub Actions → SSH-деплой на VPS + `systemctl restart creatorbot` |
| **Mini App (фронт)** | `E:\AI\faim-kreo-web` (репо `github.com/kapl4n333/faim-kreo-web`) — ЭТОТ репо | vanilla JS, один `index.html` | push в `main` → **GitHub Pages** (авто, ~1 мин) |
| **Бэкенд** | **Supabase** проект `xgkyuxjvwwstsuhtwhpv` | Postgres + Edge Function (Deno/TS) + Storage | миграции + `deploy_edge_function` (через Supabase MCP или CLI) |

Ключевые адреса/ID (НЕ секретны):
- Mini App URL: `https://kapl4n333.github.io/faim-kreo-web/`
- Supabase URL: `https://xgkyuxjvwwstsuhtwhpv.supabase.co`
- Edge-функция: `https://xgkyuxjvwwstsuhtwhpv.supabase.co/functions/v1/kreo-api`
- Supabase publishable key (для фронта, публичный): `sb_publishable_Nav1CzNwNC7rhV4i9tn93A_bP0ZoD42`
- Telegram-группа (супергруппа с топиками), `KREO_CHAT_ID = -1003863967700`
  - топик **AvaKreo Links** (входящие крео): `thread_id = 3209`
  - топик **AvaCarter Ready** (готовое): `thread_id = 3`
  - internal chat id для deep-link `t.me/c/<id>/...`: `3863967700`
- Bootstrap-админ (Каплан): tg_id `517207658` (env `KREO_ADMIN_IDS`)

Секреты (НИКОГДА не в код/доки):
- `BOT_TOKEN` — токен бота. Живёт: в `.env` бота на VPS И как **secret Edge-функции** Supabase
  (edge проверяет им подпись initData). GitHub secret для деплоя бота.
- `SUPABASE_SERVICE_KEY` (service_role) — у бота в `.env` (GitHub secret) и внутри edge
  (Supabase подставляет как `SUPABASE_SERVICE_ROLE_KEY` сам). Полный обход RLS.

---

## 2. Модель данных (Supabase Postgres)

RLS **включён** на всех таблицах, но БЕЗ force — весь доступ идёт через **service_role**
(бот напрямую по REST; фронт — только через edge-функцию). Прямого доступа фронта к
PostgREST НЕТ, поэтому RLS-политики фактически не в горячем пути (второй слой).

```
members(
  id bigint PK, tg_id bigint UNIQUE, username text, name text,
  role text default 'user' check(admin|user),      -- ЛЕГАСИ, не использовать
  roles text[] default '{}',                        -- РАБОЧЕЕ: admin|creative|uploader (мульти)
  created_at timestamptz)

creos(
  id bigint PK,
  author_tg_id bigint, author_username text,        -- кто кинул крео
  kind text check(link|text|photo|video|album),
  source_chat_id bigint, source_msg_id bigint,      -- исходное сообщение в Links
  downloaded_msg_id bigint,                          -- сообщение бота со скачанным видео (deep-link)
  source_url text, file_ids jsonb default '[]',      -- file_id телеграма (исходник)
  caption text,
  status text default 'queued' check(queued|in_progress|done|posted),
  assignee_tg_id bigint, claimed_at timestamptz,     -- кто взял в работу (claim)
  storage_paths jsonb default '[]',                  -- пути исходных загрузок в Storage
  result_paths jsonb default '[]',                   -- пути ГОТОВЫХ файлов (кнопка «+»)
  delivered_at timestamptz,
  delivery_state text check(null|pending|sent),      -- pending → бот доставит в Ready → sent
  ready_msg_id bigint,                               -- id сообщения в топике Ready (для 👍→posted)
  poster_tg_id bigint, poster_username text, posted_at timestamptz,  -- кто «залил»
  created_at timestamptz, done_at timestamptz,
  UNIQUE(source_chat_id, source_msg_id))             -- идемпотентный upsert при 👍

results(id, creo_id FK→creos cascade, file_id, file_type, uploaded_by_tg_id, uploaded_at)
  -- зарезервировано, пока не используется активно

tasks(
  id bigint PK, title text, assignee_tg_id bigint, created_by_tg_id bigint,
  due_date date, priority text check(low|med|high),
  status text default 'queued' check(queued|in_progress|done),
  pinned boolean default false, position int default 0, done_at timestamptz,
  created_at timestamptz)
```

Storage: приватный bucket **`creos`**. Готовые файлы фронт заливает туда (signed upload
URL), бот скачивает их service_role-ключом и шлёт в Ready. Free-план: ~1 ГБ, лимит файла
по умолчанию ~50 МБ (крупное видео — узкое место, см. TODO).

Приватная схема-хелперы `private.current_tg_id()/is_member()/is_admin()` (SECURITY DEFINER)
— для RLS-политик; в текущем потоке (всё через service_role) не критичны.

Гоча: в проекте есть ЧУЖОЙ event-триггер `public.rls_auto_enable()` (авто-RLS на новые
public-таблицы) — полезный, оставлен, но у него забран EXECUTE из REST (миграция
`harden_rls_auto_enable`). Не удалять.

Миграции (по порядку): `kreo_initial_schema` → `kreo_uploads_storage` →
`harden_rls_auto_enable` → `ftask_v2_roles_posted_delivery`.

---

## 3. Жизненный цикл крео и роли

**Роли** (в `members.roles[]`, мульти): `admin` (полный доступ + управление людьми),
`creative` (генератор — берёт крео и делает), `uploader` (залив — постит готовое).
Один человек может держать несколько ролей. Роли раздаёт админ во вкладке «Админка».

**Статусы:** `queued` (в очереди) → `in_progress` (в работе, кто-то взял) →
`done` (готово, файлы доставлены в Ready) → `posted` (залито в соцсети).

**Два реакшн-хука на 👍 (симметрично):**
1. Админ ставит 👍 на **исходное** сообщение в топике **Links** → крео создаётся (`queued`).
2. Любой из команды ставит 👍 на **готовом** сообщении в топике **Ready** → крео `posted`
   с ником постившего. Матчится по `ready_msg_id`.

**Поток целиком:**
```
крео кидают в Links → бот индексирует (kreo_index.json)
   → админ 👍 → creos.status=queued (под именем автора)
      → на доске «Генерации» генератор жмёт «Взять» (claim) → in_progress, assignee=он
         → он жмёт «＋ Залить готовое» у крео, кидает файлы
            → файлы в Storage, edge: status=done, delivery_state=pending
               → бот (delivery_loop, каждые 15с) качает файлы, шлёт в Ready,
                  пишет ready_msg_id, delivery_state=sent
                  → кто запостил в соцсети ставит 👍 в Ready → status=posted (+ник)
```

---

## 4. Фронт — Mini App (`index.html`, ЭТОТ репо)

Один файл, vanilla JS, без сборки. Тема берётся из Telegram (`--tg-theme-*`), акцент —
розово-коралловый градиент, шрифт Space Grotesk. Авторизация: шлёт `tg.initData` в
заголовке `x-init-data` каждому запросу к edge-функции; та проверяет HMAC.

**Ключевые константы (вверху `<script>`):** `API` (edge URL), `CHAT_INTERNAL="3863967700"`,
`LINKS_THREAD=3209`. Состояние — объект `S`. Все запросы — `api(action, params)`.

**7 вкладок** (навигация в `header()`, роутинг в `render()`):
1. **Креативы** (`vCreos`) — весь реестр, фильтры (автор/статус), у каждого крео:
   сегмент-контрол статуса (4), «＋ Залить готовое» (`openSheet(id)`→`deliver_creo`),
   «Перейти к видео/исходнику» (deep-link), удаление 🗑 с `confirm()` (админ/автор).
2. **Генерации** (`vGen`) — claim-борд «Uber»: «Свободные» (queued, кнопка «Взять»=`claim_creo`,
   видна `creative`/`admin`) + колонки «в работе» по владельцам; админ переназначает (`assign_creo`).
3. **Мои** (`vMine`) — две секции: «Взял в работу» (assignee=я) + «Залил» (poster=я).
4. **Статистика** (`vStats`) — плитки по статусам, «кто сколько сделал» (byAuthor),
   «кто сколько залил» (byPoster), ср. время до готово / до залива.
5. **Задачи** (`vTasks`) — создать (assignee, дедлайн, приоритет), 📌 закреп (админ),
   ▲ поднять, ✓ Готово → в «Историю», удалить.
6. **Люди** (`vMembers`) — команда с чипами ролей; админ добавляет по tg_id.
7. **Админка** (`vAdmin`, только admin) — выдача ролей тапом по чипу (`set_member_roles`),
   удаление участника; заглушка «Реестр ВФ RunningHub» (TODO).

**Загрузка** (`openSheet`/`renderSheet`/`doUpload`): нижний лист. `S.deliverTo` = id крео
(режим доставки к существующему, `deliver_creo`) или `null` (FAB «+» = отдельное готовое,
`create_upload_creo`). Файл → `sign_upload` → PUT в signed URL → отдаём пути в edge.

**Гоча initData:** reply-кнопки web_app на части клиентов НЕ передают подписанный
`initData` (приходит пустой). Поэтому основной вход — команда **`/app`** в боте, которая
шлёт **INLINE** web_app-кнопку (она подпись передаёт надёжно). Не переводить на reply-кнопку.

---

## 5. Бэкенд — Edge-функция `kreo-api` (Supabase, Deno/TS)

`verify_jwt=false` (своя авторизация по initData). Проверяет HMAC:
`secret = HMAC_SHA256("WebAppData", BOT_TOKEN)`, затем `hash = HMAC_SHA256(secret, data_check_string)`.
Один POST-эндпоинт, роутинг по `body.action`. Данные/Storage — через service_role.

**Гейт доступа (ВАЖНО, три разных списка — не путать):**
- (1) `access.json` бота — кто вообще может пользоваться ботом.
- (2) Supabase `members` — кто в команде FTask. **Доступ к приложению = членство здесь.**
- (3) `members.roles[]` — что человек может внутри.
`ensureMember(u)`: если он уже в `members` или это bootstrap-админ (`KREO_ADMIN_IDS`) —
пускает; иначе возвращает `null` → **403 `not_member`** (авто-добавление чужих убрано).
Итог: админ добавляет по Telegram ID во вкладке «Люди» → человек заходит.

**Actions** (текущая версия edge — **v6**):
| action | кто | что делает |
|---|---|---|
| `bootstrap` | член | вернуть `me,isAdmin,creos(+media_urls/result_urls),tasks,members,stats` |
| `list_creos` | член | только крео |
| `set_creo_status` | член | сменить статус; `in_progress`+`claim`→assignee=me; `posted`→poster=me |
| `mark_posted` | член | пометить `posted` (кнопка «Залито» для всех) |
| `claim_creo` | член | самозахват → in_progress, assignee=me |
| `assign_creo` | admin | переназначить/вернуть в очередь |
| `deliver_creo` | член | «+»: result_paths += files, status=done, delivery_state=pending |
| `delete_creo` | admin/автор | удалить |
| `sign_upload` | член | signed upload URL в bucket `creos` |
| `create_upload_creo` | член | отдельное готовое → done + delivery_state=pending |
| `stats` | член | пересчитать статистику |
| `create_task`/`update_task`/`delete_task` | член (delete: admin/автор) | задачи; update поддерживает status/pinned/position |
| `set_member_roles` | admin | заменить roles[] участника |
| `add_member`/`remove_member` | admin | добавить/убрать участника |

Правки edge: редактируй как единый `index.ts` и деплой целиком (`deploy_edge_function`
затирает файлы). После DDL — `get_advisors(security)`.

---

## 6. Бот — интеграция (`E:\AI\CreatorBot`)

Файлы: **`kreo.py`** (весь модуль FTask), точки в **`bot.py`**, конфиг в **`config.py`**.
`kreo.enabled()` = `KREO_CHAT_ID && SUPABASE_URL && SUPABASE_SERVICE_KEY`; пусто → no-op
(бот работает как раньше). Пишет в Supabase по REST через service_role.

**Приём (`kreo.py`):**
- `KreoIndexMiddleware` (outer, ДО AccessMiddleware, `bot.py`) — индексирует КАЖДОЕ
  сообщение топика Links в `kreo_index.json` (gitignore + rsync-exclude, prune 21 день),
  т.к. Bot API не отдаёт старое сообщение по id, а 👍 приносит только `message_id`.
- `index_message`, `attach_download` (связка ссылка↔скачанное видео), `promote_to_creo`
  (👍 в Links → upsert creos), `has_thumbsup`.

**Доставка готового (`kreo.py`):**
- `delivery_loop(bot)` — фон, старт в `main()`, каждые 15с зовёт `poll_deliveries`.
- `poll_deliveries` → берёт creos `delivery_state=pending` (limit 5) → `_deliver_one`:
  качает `result_paths` из Storage (`_storage_get`), шлёт в топик Ready
  (`send_photo/video` или `send_media_group`), пишет `ready_msg_id` + `delivery_state=sent`.
  3 неудачи подряд → снимает с очереди (лог), чтобы не крутить вечно.
- `promote_posted(ready_msg_id, user)` — 👍 в Ready → `posted` по ready_msg_id.
- REST-хелперы: `_sb_insert_creo`, `_sb_patch_creo`, `_sb_patch_where`, `_sb_patch_creo_id`,
  `list_recent`.

**Обработчики (`bot.py`):**
- `on_kreo_reaction` (`@router.message_reaction`) — реакции идут МИМО AccessMiddleware.
  Порядок: сначала `promote_posted` (Ready→posted, любой), если не совпало по ready_msg_id —
  то `promote_to_creo` (Links→queued, только админ). **Гоча:** апдейт реакции НЕ несёт
  `message_thread_id`, поэтому топик Ready опознаётся по `ready_msg_id`, а не по треду.
- `on_kreo_app` (`/app`) — шлёт inline web_app-кнопку. Доступ НЕ режется (гейт — edge).
- `on_kreo` (`/kreo`) — админ, в личке: последние крео (проверка ингеста).
- `main()` — `start_polling(bot, allowed_updates=dp.resolve_used_update_types())` — иначе
  Telegram не шлёт `message_reaction`. Там же старт `delivery_loop`.
- Кнопка «🗂 FTask» в `kb_main` — видна `access.is_allowed` (approved).
- `AccessMiddleware` пускает `/app` для не-approved (как `/start`), чтобы добавленный в
  «Люди» человек зашёл без отдельного одобрения бота.

**Требование:** бот = **АДМИН** телеграм-группы (чтение сообщений + апдейты реакций +
право постить в Ready).

**Config env (`config.py`, пишутся в `.env` из `deploy.yml`):**
`KREO_CHAT_ID=-1003863967700`, `KREO_LINKS_THREAD=3209`, `KREO_READY_THREAD=3`,
`KREO_WEBAPP_URL=https://kapl4n333.github.io/faim-kreo-web/`, `SUPABASE_URL`,
`SUPABASE_SERVICE_KEY` (секрет), `KREO_ADMIN_IDS` (дефолт 517207658).

---

## 7. Как вносить изменения (для агента)

- **Фронт:** правь `index.html`, проверь синтаксис (извлечь `<script>` → `node --check`),
  `git commit && git push origin main`. Pages пересоберётся ~1 мин. Юзеру: перезайти в /app.
- **Edge:** правь как единый TS, деплой через Supabase MCP `deploy_edge_function`
  (name=`kreo-api`, verify_jwt=false). После DDL — миграция через `apply_migration` +
  `get_advisors`. Версия сейчас v6.
- **Бот:** правь `kreo.py`/`bot.py`, проверь `py_compile` (питон:
  `E:\AI\Apps\ComfyUI_windows_portable\python_embeded\python.exe`), `git commit && git push`.
  Деплой — GitHub Actions по push (ждёт завершения активных генераций, потом рестарт).
- **Дисциплина доков (правило проекта):** после каждого фикса/фичи бота обнови
  `E:\AI\CreatorBot\CLAUDE.md` + `E:\AI\CreatorBot\FaimGenBot.md` тем же коммитом.
  Про FTask держи актуальным И этот файл.
- Не коммитить/пушить без явной просьбы владельца (общее правило).
- Пути моделей ComfyUI и секреты — не трогать; секреты только через env.

---

## 8. Онбординг участника (для владельца)

1. Человек открывает @faimGenBot → команда **`/app`** → увидит экран «тебя нет в команде»
   со **своим Telegram ID**.
2. Владелец в FTask → **Люди → Добавить участника** → вставляет этот ID.
3. (опц.) **Админка** → выдать роль `креатив`/`залив`.
4. Человек снова жмёт **`/app`** → заходит.

---

## 9. Статус и что дальше

**Готово (2026-08-21, v2):** схема+RLS; ингест (👍→крео); edge v6; фронт 7 вкладок
(Pages); мульти-роли; claim-борд; доставка «＋»→Ready + 👍→залито (delivery_loop);
задачи/люди/админка; гейт доступа = членство. Оба репо запушены, edge задеплоена.

**TODO / бэклог:**
- **Редизайн** (владелец: «дизайн говнище»). Сначала была систематизация — она сделана,
  дизайн НЕ трогали намеренно. База для редизайна: `E:\AI\smm-hub\DESIGN.md` (готовая
  дизайн-система: Outfit + Geist Mono, один акцент, нейтралка chroma-0, ambient-тени,
  честный async, `STATUS_META`, attention-панель). Адаптировать под Telegram-тему +
  розовый акцент.
- Realtime-обновления фронта (сейчас — на перезаход; можно Supabase Realtime).
- Реестр ВФ RunningHub в Админке (данные из конфига бота: workflow_id, ноды входов и т.д.).
- Автоаналитика постинга (охваты, интервалы, лучшее время).
- Крупное видео: лимит Storage ~50 МБ — обдумать (чанки/внешнее хранилище/через бота).

**Открытые гочи-напоминалки:** initData только через inline-кнопку `/app`; реакция без
`thread_id` (Ready опознаём по `ready_msg_id`); бот обязан быть админом группы;
`delivery_state=pending` без файлов/при 3 фейлах снимается в `sent` (лог).

**Стиль общения владельца:** русский/английский, технические термины ок, объяснять
по-человечески; изредка ценит вердикт «в стиле Альтрона» на суммарайзах (не в каждом
сообщении, не в ущерб ясности). Не предлагать работу над постингом соцсетей — не его зона.
