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
| **Бот** | `C:\AI\Bot\CreatorBot` (репо `github.com/kapl4n333/FaimGenBot`) | Python, aiogram v3, httpx, без БД | push в `main` → GitHub Actions → SSH-деплой на VPS + `systemctl restart creatorbot` |
| **Mini App (фронт)** | `C:\AI\Bot\faim-kreo-web` (репо `github.com/kapl4n333/faim-kreo-web`) — ЭТОТ репо | vanilla JS, один `index.html` | push в `main` → **GitHub Pages** (авто, ~1 мин) |
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

-- каталог (миграция 20260912225648_ftask_catalog, 2026-09-13):
--   source_paths jsonb, source_poster/source_clip text, source_state text
--     (null=не готовили | ready | none | too_big | failed), source_error, source_attempts, source_prepared_at
--     → исходник референса в Storage `sources/<id>/…` + превью `previews/<id>/src_*` (готовит БОТ, source_prep_loop)
--   deferred_at, deferred_by_tg_id                 -- «Отложить» (командное; НЕ archived_at — тот про файлы)
--   notes, notes_updated_at, notes_by_tg_id        -- короткие заметки к крео (last-write-wins)

niches(id, name, name_key = lower(btrim(name)) UNIQUE, created_by_tg_id, created_at, updated_at)
creo_niches(creo_id FK cascade, niche_id FK cascade, added_by_tg_id, added_at, PK(creo_id,niche_id))
  -- ниша удаляется → связи снимаются каскадом, крео остаются
  -- RPC set_creo_niches(p_creo_id, p_niche_ids[], p_by) — атомарная замена набора (только service_role)

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
`harden_rls_auto_enable` → `ftask_v2_roles_posted_delivery` → … → `track_links_schema` →
`20260912225648_ftask_catalog` (файл в `supabase/migrations/`, применять руками — CI для БД нет, см. `DEPLOY.md`).

**Трекер источников трафика («Кейтаро», миграция `track_links_schema`):**
```
track_accounts(id, owner_tg_id, platform[instagram|x|tiktok|threads|reddit],
  account_name, code UNIQUE (=имя invite-ссылки, ≤32), invite_link, link_error,
  pending_revoke bool, created_at)
track_joins(id, account_id FK→track_accounts cascade, tg_user_id, tg_username,
  joined_at, UNIQUE(account_id, tg_user_id))   -- 1 вступление на юзера на ссылку
```
Аккаунты создаёт аппа (`track_add`); invite-ссылки создаёт/отзывает **бот** (`track.py`,
`provision_loop`); вступления пишет **бот** (`chat_member` → `track_joins`). Edge только
читает (`track_data`) + управляет строками. Канал-приземления и топик отчёта — env бота
(`TRACK_CHANNEL_ID`/`TRACK_REPORT_THREAD`).

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

## 4. Фронт — Mini App (ЭТОТ репо) — «единый каталог» (2026-09-13)

Vanilla JS без сборки, но разнесён по файлам (классические скрипты, общие глобалы, порядок важен):
- `index.html` — оболочка: шапка, `#nav`, `#app`, `#detail` (карточка), `#scrim`/`#sheet` (лист загрузки).
  Все ресурсы с **`?v=YYYYMMDDx`** — бампать при КАЖДОЙ правке css/js (WebView кеширует).
- `css/app.css` — тема (gold-on-black, Space Grotesk) + вся раскладка.
- `js/core.js` — `S` (состояние), `PERSIST`/`loadPrefs`/`savePrefs`, `api()`, `boot`, поллинг
  (`poll`/`sigOf`), `refreshMedia` (E), `header()` (рельса + нав), `render()` (роутер).
- `js/catalog.js` — каталог (`catList`, `vCatalog`, `ccard`, `tileMedia`, клипы) + карточка
  (`openDetail`/`renderDetail`/`closeDetail`, `frames`), действия (`creoAction`, ниши, заметки).
- `js/download.js` — скачивание исходников/результатов на устройство; грузится после `catalog.js`,
  до `boot()`. Системный Save As с постоянным `id=ftask-downloads` (без сброса `startIn`),
  иначе Telegram `downloadFile` / браузер. Папку в fallback контролирует клиент, не FTask.
- `js/upload.js` — FAB + лист загрузки с чипами ниш (`S.upNiches`).
- `js/views.js` — Задачи, Кейтаро (вступления + мои аккаунты), Команда (люди + статистика), Админка (+ «Ниши»).
- `supabase/functions/kreo-api/logic.js` — чистая логика edge; фронт её НЕ грузит, но тесты — да.

Авторизация: `tg.initData` в заголовке `x-init-data`. `api()` бросает `Error(code)` с `e.data`
(ответ сервера, напр. актуальное `creo` при `already_claimed`). `window.__FTASK_DEMO__` — хук
ТОЛЬКО для `tests/` (локальные фикстуры вместо fetch; к серверу не обращается — это не обход авторизации).

**Навигация (5):** Каталог · Задачи · Кейтаро `[Вступления][Мои аккаунты]` · Команда `[Люди][Статистика]` · Админ
(`[Доступ][Заявки][Воркфлоу][Роли][Ниши]`). Старые «Креативы/Генерации/Мои/Склад» слиты в Каталог.

**Каталог** (`S.view`): **Свободные** (queued) / **В работе** (in_progress) / **Готовые** (done) /
**Отложенные** (`deferred_at`, из остальных видов исключены). Поиск `S.q` (подпись, result_caption,
ссылка, `#id`, автор, исполнитель, ниши, заметки), тумблер **Мои** (`isMine` — а в Готовых ещё и
«опубликовал я»), фильтр ниш (`S.niche`: id | `none`=«Без ниши»), автор, сортировка; в Готовых —
чипы публикации `S.pub`. Рельса в шапке = те же виды («Опубликовано» → Готовые + чип).
Плитка (`ccard`): медиа (`tileMedia` — у референса исходник `source_poster_url`/`source_urls`,
у готового последний результат; нет медиа → понятное состояние `srcState`: «> 20 МБ», «готовится…»,
«ссылка · видео в Telegram»), ниши, кто/когда, одно главное действие по состоянию (`primaryAct`:
Взять / 📤 Загрузить результат / ⬇ Скачать / ↩ Вернуть). **Клип-превью:** hover на ПК, ▶ на телефоне;
`ACTIVE_CLIP` — играет ровно один. Персист: `tab, view, mine, q, niche, author, sort, pub, open, tDraft` +
прокрутка на вид (`S._scroll[scrollKey()]`).

**Карточка** (`#detail`): телефон — слой поверх списка (`.detail.show`, `body.dopen`; список не
перерисовывается, прокрутка сохраняется); ПК ≥1024px ландшафт — `body.split`: панель справа
(`--detail-w`), список слева. Внутри: просмотрщик (`frames()`: исходник + результаты, новые первыми;
`<video controls>`/`<img>`, миниатюры), подпись/мета/ссылки в Telegram (исходник, Ready, внешняя),
действия по состоянию (та же матрица, что на сервере), переназначение админом, ниши (чипы +
«＋ Новая ниша» через `prompt`, ✎ переименовать), заметки (`textarea`, автосохранение 800 мс →
`set_notes`, статус «сохранено · кто · когда»; при перерисовке ввод не теряется), результаты
(список, новые первыми, ⬇ по подписанной ссылке), строка доставки, «☁ Я опубликовал», удаление.

**Медиа-refresh (E):** каждый `img/video` несёт `data-mref="cid|поле|индекс"`; `poll()` при
неизменной сигнатуре зовёт `refreshMedia()` — подставляет свежий signed URL только там, где он
сменился; играющее видео не трогает; `error` на медиа (протухшая ссылка) → один bootstrap + refresh.
`sigOf()` НЕ включает URL (иначе перерисовка каждые 10 с).

**Задачи:** черновик `S.tDraft{title,due,prio,asg}` пишется на каждый ввод и персистится (D) —
переживает вкладки, поллинг и закрытие; «✕ Отменить и очистить» — единственный путь его потерять.

**Загрузка** (`openSheet`/`renderSheet`/`doUpload`): нижний лист; `S.deliverTo` = id крео
(`deliver_creo`) или `null` (FAB «+» → `create_upload_creo`). Чипы ниш с множественным выбором,
существующие ниши крео подставлены, «＋ Новая ниша». Файл → `sign_upload` → PUT → пути + `niche_ids` в edge.

**Тесты (без node):** `tests/run.html` — 58 проверок logic.js + сценариев фронта на фикстурах
(`tests/demo-data.js`, «сервер» на той же `logic.js`). Запуск:
`msedge --headless=new --allow-file-access-from-files --window-size=390,844 --virtual-time-budget=30000 --dump-dom tests/run.html`
(и `?split=1` при 1440×900) → `<title>RESULT: N passed, M failed`. `tests/demo.html` — визуальная
демо-страница (`?tab=&view=&open=&me=`), `tests/phone.html` — то же в iframe 390px (headless Edge не
даёт окно уже ~492px). Скриншоты — `tests/shots/` (gitignore).

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

**Actions** (edge **v14** — локально готов, 2026-09-13; на проде пока v13):
| action | кто | что делает |
|---|---|---|
| `bootstrap` | член | вернуть `me,isAdmin,creos(+media_urls/result_urls/source_urls/source_poster_url/source_clip_url/niche_ids),tasks,members,niches,stats` |
| `list_creos` | член | только крео |
| `set_creo_status` / `claim_creo` | член | **один контракт** (`logic.statusTransition`, ревью B): `in_progress` = самозахват только свободного (UPDATE с условием `assignee IS NULL`), повтор своим — идемпотентно, чужое — 409 `already_claimed` (+`creo`); `queued` — исполнитель/админ; `done` — исполнитель/админ. `claim` в теле игнорируется. Чужого не перехватывает даже админ — для этого `assign_creo` |
| `toggle_posted` | член | флаг «я опубликовал» в `posters[]` (CAS) |
| `assign_creo` | admin | явное переназначение/вернуть в очередь — единственный путь сменить чужого исполнителя |
| `deliver_creo` | член | result_paths += files (CAS, `mergePaths` без дублей), status=done, delivery_state=pending, `niche_ids` → RPC `set_creo_niches`; 409 `conflict` после 4 гонок |
| `create_niche` / `rename_niche` | член | ниша; дубль по `lower(trim)` → `create` возвращает существующую (`existed:true`), `rename` → 409 `niche_exists`; пустое → 400 `no_name` |
| `delete_niche` | admin | удалить нишу (крео остаются, связи каскадом) |
| `set_creo_niches` | член | полная замена набора ниш крео (RPC, атомарно) |
| `set_notes` | член | заметки (≤4000, last-write-wins, `notes_by_tg_id`/`notes_updated_at`) |
| `defer_creo` / `restore_creo` | член | отложить/вернуть: только `deferred_at`/`deferred_by_tg_id`, статус и исполнитель не трогаются (`logic.deferPatch`) |
| `delete_creo` | admin/автор | удалить |
| `sign_upload` | член | signed upload URL в bucket `creos` |
| `create_upload_creo` | член | отдельное готовое → done + delivery_state=pending |
| `stats` | член | пересчитать статистику |
| `create_task`/`update_task`/`delete_task` | член (delete: admin/автор) | задачи; update поддерживает status/pinned/position |
| `set_member_roles` | admin | заменить roles[] участника |
| `add_member`/`remove_member` | admin | добавить/убрать участника |
| `track_data` | член | аккаунты трекера (только `archived_at is null`) + счётчики вступлений (`joins`, `joins_24h`) |
| `track_add` | член | создать соц-аккаунт (platform+account_name); генерит `code`, `invite_link=null` (ссылку создаст бот) |
| `track_delete` | владелец строки/admin | **soft-delete** (13.09.2026): ссылка есть → `pending_revoke=true` (бот отзовёт + поставит `archived_at`); ссылки нет → сразу `archived_at`. Физически НЕ удаляем — CASCADE снёс бы `track_joins`/атрибуцию воронки |
| `funnel_data` | член | воронка v2 (13.09.2026): `funnel_source_v2` (источник→привёл/купили/конв/⭐/$) + `funnel_report(funnel,from,to)` за `days` (деф. 30). Агрегаты, без персональных id покупателей. UI: «Трекер → Воронка» |

Правки edge: `index.ts` + `logic.js` (чистые функции контракта, тестируются в `tests/run.html`);
деплой обоих файлов одним `deploy_edge_function` (затирает набор файлов). После DDL — `get_advisors(security)`.
`attachNiches`/`listNiches` терпят отсутствие таблиц (миграция ещё не применена) — bootstrap не падает.

**v13 (2026-09-12, повторное ревью R5/R9/R10):**
- `casUpdate(id, field, compute, extra)` — CAS для jsonb-полей `creos`: читаем строку,
  считаем новое значение, `UPDATE … WHERE id AND field = <старый json>` (`.filter(field,"eq",
  JSON.stringify(old))`, `is null` для null), пусто → перечитать, ≤4 попыток → `conflict` (409).
  Используют `toggle_posted` (posters) и `deliver_creo` (result_paths). Тот же приём, что
  `promote_posted` в боте — 👍 в боте и клик в аппе больше не затирают друг друга.
- `fetchAll(build)` — Range-пагинация по 1000 для `creos`/`tasks` в `bootstrap`, `stats`,
  `track_accounts`/`track_joins` в `track_data`. Без неё поиск в Складе видел только первую
  страницу, а цифры Кейтаро расходились с отчётом бота.
- `admin_cmd set_admin` — только bootstrap-админ (`KREO_ADMIN_IDS` = владелец бота), иначе 403
  `owner_only`. Бот (`admin_sync._apply`) проверяет `requested_by` ∈ `OWNER_IDS` ещё раз →
  `result=owner_only`. Матрица прав совпадает с Telegram: админ ≠ владелец.
- Фронт: `ERR.already_claimed/conflict/owner_only`; на `already_claimed` — `poll()`.

---

## 6. Бот — интеграция (`C:\AI\Bot\CreatorBot`)

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
- `poll_deliveries` → берёт creos `delivery_state=pending` (limit 10, заблокированные исключены) →
  `_deliver_one`: качает недоставленный остаток `result_paths` (`_storage_get`), шлёт в топик Ready
  (фото документами, видео превью+документ; прогресс по файлу в `kreo_delivery.json`), финал —
  **условный** PATCH `delivery_state=eq.pending&result_paths=eq.<json>` → `sent` только если пакет
  не изменился (ревью A). 3 неудачи подряд → пауза час + DM владельцам. Детали — `CreatorBot/CLAUDE.md`.
- `source_prep_loop(bot)` — фон (каждые 30с, по 3 крео): для creos с `source_state IS NULL`
  тянет `file_ids` через Bot API `getFile` (≤20 МБ, иначе `too_big`), кладёт в Storage
  `sources/<id>/<n>.<ext>`, делает `previews/<id>/src_poster.jpg` + `src_clip.mp4`, пишет
  `source_paths/source_state`. Ссылки: `attach_download(..., file_id)` дописывает file_id
  скачанного ботом видео в `file_ids` — оно и есть исходник. Bot-token во фронт не утекает:
  фронт видит только signed URL Storage.
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

- **Фронт:** правь `js/*.js` / `css/app.css`, бампни `?v=` в `index.html`, прогони `tests/run.html`
  в headless Edge (см. §4), `git commit && git push origin main`. Pages пересоберётся ~1 мин. Юзеру: перезайти в /app.
- **Edge:** `index.ts` + `logic.js`, деплой через Supabase MCP `deploy_edge_function`
  (name=`kreo-api`, verify_jwt=false, оба файла). DDL — файл в `supabase/migrations/` + применить
  руками (`apply_migration`/SQL editor) + `get_advisors`. Порядок выкладки — `DEPLOY.md`.
- **Бот:** правь `kreo.py`/`bot.py`, проверь `py_compile` (питон:
  `C:\AI\Apps\ComfyUI_windows_portable\python_embeded\python.exe`), `git commit && git push`.
  Деплой — GitHub Actions по push (ждёт завершения активных генераций, потом рестарт).
- **Дисциплина доков (правило проекта):** после каждого фикса/фичи бота обнови
  `C:\AI\Bot\CreatorBot\CLAUDE.md` + `C:\AI\Bot\CreatorBot\FaimGenBot.md` тем же коммитом.
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

**Готово (2026-08-22, edge v9):** схема+RLS; ингест (👍→крео); фронт 7 вкладок;
мульти-роли; claim-борд; доставка «＋»→Ready + 👍→залито; **редизайн** (токены/тени,
сигнатура — рельса-конвейер, mono-числа); **realtime** (мягкий поллинг 10с, visibility-
aware, не сбивает скролл/ввод); **честный async** (строка доставки pending/sent +
прогресс-бары загрузки XHR); **тосты** вместо alert; **«Залито» как флаг** posters[]
(не статус, горит только у себя); **формат Ready** (фото документами группой, видео
превью+документ, подпись `result_caption`); `ready_msg_ids[]` (👍 на любом сообщении);
**мульти-исполнители задач** (`assignee_tg_ids[]`). Оба репо запушены, edge задеплоена.

**UX-набор по ревью (2026-09-12, только фронт, без edge):**
- **Тексты:** «＋ Залить готовое» → **«📤 Загрузить результат»** (файлы в систему), «☁ Отметить
  «Залито»» → **«☁ Я опубликовал»**, список постивших → **«✓ Опубликовали: …»**, RAIL «Залито» →
  **«Опубликовано»**. Две разные операции больше не называются одним словом. Edge-action и
  колонки не переименовывались (`mark_posted`, `posters[]`).
- **Склад:** ключ «Свежие/старые» = `delivered_at || done_at || created_at` (раньше первым шёл
  `posted_at` — отметка публикации поднимала старое над вчерашним, а на карточке была другая
  дата). Поле **поиска** `#hQ` (подпись/ссылка/id/кто делал, debounce 180мс, перерисовка с
  возвратом фокуса) и **чипы** `S.hPub`: Все / Я не публиковал / Никто не публиковал /
  Опубликованные.
- **Персист** `S.tab/fAuthor/fStatus/hSort/hAuthor/hQ/hPub/mineTab/statsTab` в
  `localStorage["ftask.prefs"]` (`loadPrefs()` в `boot`, `savePrefs()` на каждое изменение;
  вкладка `admin` у не-админа сбрасывается).
- **«Мои»:** «В работе у меня» = `assignee==me && status!=="done"` (готовое больше не висит
  вечно); «Я опубликовал» — без дублей с первой секцией.
- **Счётчики рельсы кликабельны** (`#pipe .st[data-rail]`): статус → вкладка Крео с фильтром,
  «Опубликовано» → Склад с чипом «Опубликованные».
- **Задачи:** форма создания за кнопкой «＋ Новая задача» (`S.tForm`), список первым;
  «История (N) ▸» свёрнута (`S.tDone`). `bindTasks` терпит отсутствие `#tGo`.
- **Заставка** `faim.mp4` — один раз за сессию (`sessionStorage.splashSeen`); повторное
  открытие сразу показывает контент. Навигация 9.5px → **11px**.
- Перестройка IA (слияние Крео/Генер/Мои, карточка крео с просмотром, split-view) —
  **отложена на React-фазу** осознанно: на ванили это двойная работа.
- Проверка без node: `msedge --headless=new --dump-dom file:///…/index.html` → в DOM должен
  быть `class="gate"` (значит скрипт распарсился и `boot()` дошёл до конца).

**Добивка по повторному ревью (2026-09-12, вечер):**
- **`sigOf()`** сравнивает ВСЕ отображаемые изменяемые поля (posters по tg_id, caption/result_caption,
  result_paths, превью, delivered/done_at, ready/downloaded_msg_id; у задач title/due/priority/
  assignees; у людей name/username) — раньше только счётчики, и poll проглатывал смену постившего
  или правку подписи без перерисовки (R11). Новое поле в карточке → добавить в `sigOf`.
- Тап по счётчику «Опубликовано» сбрасывает `hQ`/`hAuthor` (иначе «12» открывало пустой список
  из-за старого поиска). Клики под-вкладок (`data-sub`) зовут `savePrefs()`.
- **Прокрутка на вкладку:** `S._scroll[tab]` — переход в другую вкладку и обратно возвращает
  место; счётчики рельсы по-прежнему скроллят наверх (это «новый список»).
- **Черновик задачи:** «Скрыть» сохраняет `S.tDraft` (title/due/prio) и `TASK_ASG`, кнопка
  «＋ Новая задача» показывает бейдж «черновик»; «✕ Отменить и очистить» — единственный путь
  потерять введённое. После успешного создания черновик чистится.
- Карточка Склада без исполнителя пишет «автор идеи: @…», а не «сделал» (автор референса ≠
  исполнитель). Поля «кто загрузил результат» в схеме нет — это бэклог React-фазы.

**Единый каталог (2026-09-13, локально, НЕ задеплоено — см. `DEPLOY.md`):** описание в §2/§4/§5.
Кратко, что изменилось относительно «UX-набора» выше: вкладки Крео/Генер/Мои/Склад → один Каталог с
видами; карточка с просмотром медиа внутри аппы (телефон — слой, ПК — панель справа); исходники
референсов в Storage (готовит бот); ниши; отложение; заметки; несколько загрузок к одному крео;
рельса ведёт в виды каталога; черновик задачи по вводу; медиа-refresh без перерисовки. Старые имена
состояния (`fAuthor/fStatus/hSort/hAuthor/hQ/hPub/mineTab/statsTab`) больше не существуют — при
первом входе `loadPrefs` их игнорирует. React не потребовался: объём лёг в 4 js-файла + css.
Решения по спорным местам: «Отложить» не трогает статус/исполнителя (вернуть = ровно туда же);
«Готово» вручную (без файлов) оставлено как второстепенное действие исполнителя/админа;
`set_creo_status(in_progress)` больше не умеет «перехватывать» — только `assign_creo` у админа.
НЕ сделано осознанно (вне объёма): запуск генераций из FTask, версии генераций, аналитика публикаций.

**TODO / бэклог (полный, по приоритету владельца):**
- **[NEXT, владелец «вначале»] Админка-самообслуживание** — чтобы владелец сам добавлял/
  убирал без кода: **реестр ВФ RunningHub → Supabase** (таблица `workflows` + CRUD в edge +
  UI во вкладке Админка + **бот читает список оттуда**, а не из конфига); тумблеры доступа/
  инструментов на юзера; заявки на доступ. Делать «хорошо» → нужен полный лимит сессии.
- **[NEXT] Агент: авто-разбор ошибок админу** — падение генерации/джобы → Grok разбирает
  traceback простым языком → ЛС владельцу (OWNER_IDS). Небольшой хук в обработку ошибок бота.
- **[из бота в аппу]** запуск генераций с пресетами (аппа триггерит — бот исполняет),
  пресеты/реестр ВФ; в будущем — больше бот-функций в миниапп.
- **[инфра, блокер] Local Bot API server** — снять лимиты Telegram **20 МБ** (скачивание) /
  **50 МБ** (отправка). Пока не поднят — крупное видео в доставку Ready НЕ уходит. + «машина
  получше».
- ~~**Cache-busting webapp URL**~~ ✅ СДЕЛАНО (25.08): `bot._webapp_url()` добавляет
  `?v=<метка старта бота>` к `KREO_WEBAPP_URL` (меню-кнопка + inline). Каждый рестарт/деплой
  меняет URL → Telegram подхватывает свежую версию. Групповой direct-link не бустится
  (открывать из лички); юзеру всегда помогает очистка кэша Telegram / переоткрытие аппы.
- **Уведомления в ЛС** — назначили крео (claim/assign) или задачу → бот пингует исполнителя.
- **Задачи:** перетаскивание/стрелка вниз (сейчас только ▲ вверх), напоминания по дедлайну.
- **Deep-link из крео → агент-чат** с контекстом крео (идея из разбора Грока).
- **Автоаналитика постинга** (охваты, интервалы, лучшее время) + графики в Статистике.
- **Крупные результаты:** Storage free 1 ГБ, файл ~50 МБ — обдумать (внешнее хранилище/чанки).
- **Помельче:** гранулярные права (кто удаляет/кто claim) — низкий приоритет для команды
  друзей; skeleton-загрузка; возможно Supabase Realtime вместо поллинга.

Дизайн-база (если снова редизайн): `C:\AI\smm-hub\DESIGN.md`.

**Открытые гочи-напоминалки:** initData только через inline-кнопку `/app`; реакция без
`thread_id` (Ready опознаём по `ready_msg_id`); бот обязан быть админом группы;
`delivery_state=pending` без файлов/при 3 фейлах снимается в `sent` (лог).

**Стиль общения владельца:** русский/английский, технические термины ок, объяснять
по-человечески; изредка ценит вердикт «в стиле Альтрона» на суммарайзах (не в каждом
сообщении, не в ущерб ясности). Не предлагать работу над постингом соцсетей — не его зона.

## Пачки видео / «Планирование» (2026-09-17; в проде с 18.09.2026)

- В «Готовых» `js/delivery.js` добавляет мультивыбор до 10 крео с видео и мастер немедленной
  или отложенной доставки. **(18.09.2026)** режима «Выбрать видео» больше нет: кружок-галочка
  (`.pickcheck`) висит на КАЖДОЙ плитке с видео всегда; панель `#pickbar` («Запланировать» /
  «Уникализировать» + лента миниатюр выбранного, тап по миниатюре = убрать) рендерится всегда и
  закреплена `position:sticky; top:var(--hdr-h)` — высоту шапки пишет `syncHdrH()` при каждом
  `bindDeliveryCatalog` и на resize. Панель лежит ПОСЛЕ `.ctools`, прямым ребёнком `main`, иначе
  sticky отваливается, как только `.ctools` уезжает вверх. `S.deliveryPickMode` удалён. Сохраняется точный `result_paths` snapshot; новые версии не подменяют
  его молча. Пользователь может явно обновить все снимки до последних версий.
- Страница `plan` показывает активные пачки первой группой и компактную историю. Можно менять
  порядок, версию, общий/индивидуальный уровень, необязательный аккаунт, дату и IANA timezone,
  отменять, запускать сейчас, повторять только неудачную подготовку и повторно получать готовое.
- Edge actions находятся в `supabase/functions/kreo-api/index.ts`; нормализация и video-path
  helpers — в `logic.js`. Редактирование и reorder проходят одним CAS-вызовом
  `update_delivery_batch`, чтобы браузер не оставил частично обновлённую пачку.
- Схема/очередь: `supabase/migrations/20260917195825_delivery_batches.sql`. Клиентских grants и
  RLS policies нет намеренно: браузер работает только через проверенный Telegram initData в Edge,
  а таблицы доступны `service_role`. Worker живёт в CreatorBot `batch_delivery.py`.
- Локальные browser-тесты находятся в `tests/run.html`; визуальные сценарии — `tests/demo.html`
  (`?pick=1`, `?wizard=1`, страница plan). Точный порядок выкладки и post-deploy checks — `DEPLOY.md`.
