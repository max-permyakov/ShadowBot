# Runbook: бесплатный Telegram Mini App с нуля (React + Cloudflare Pages + is-a.dev)

> **Назначение:** пошаговая инструкция для ИИ-агента, полностью повторяющая
> реальный успешный кейс: за один день с нуля собран и выведен в прод
> мини-апп-магазин с карточками товаров, медиа, админ-CRUD и заказами,
> бесплатно, в условиях российской сети.
>
> Условия кейса (проверь у себя — от них зависит половина решений):
> - домашний Ubuntu-сервер 24/7 за провайдером с DPI-блокировками
>   (см. `agent-tg-bypass.md` — там zapret);
> - публичный IPv4 фактически отсутствует (входящие снаружи не проходят);
> - Cloudflare-домены SNI-блокируются провайдером (лечится zapret);
> - WARP не регистрируется и не нужен.

---

## Шаг 0. Разведка: можно ли хостить проще, чем в облаке

Прежде чем идти в Cloudflare, отсеки два тупиковых пути — они выглядят
заманчиво и заведомо проваливаются.

### 0.1. Раздача прямо с домашнего сервера — НЕ работает

Проверка входящих извне (слушатель должен быть запущен ДО теста!):

```bash
# на сервере: временный слушатель
nohup python3 -m http.server 8080 >/tmp/httptest.log 2>&1 &
ss -tlnp | grep 8080            # убедись, что слушает 0.0.0.0
```

Затем внешний чекер (сам сайт чекера может быть недоступен — API работает):

```js
// fetch (node или любой внешний хост):
await fetch("https://check-host.net/check-tcp?host=<IP>:8080&max_nodes=4",
  { headers: { Accept: "application/json" } });
// → { request_id } → через 5–10 секунд:
await fetch("https://check-host.net/check-result/<request_id>",
  { headers: { Accept: "application/json" } });
```

В кейсе 6 узлов (RU/EU/UA/MD/SI/UK) вернули `Connection timed out` —
CGNAT и/или фильтрация входящих. Хостинг дома невозможен, что бы ни
обещали руководства про port-forward.

### 0.2. CNAME на чужой Cloudflare-туннель — НЕ работает

С 2024 Cloudflare проксирует `*.cfargotunnel.com` только для DNS-записей
доменов **в том же аккаунте**. Схема «домен на любом DNS + CNAME на туннель»
больше не жива (свежие сообщения на community.cloudflare.com и pluggie.io).
Не трать время на обход.

### 0.3. NS-делегирование is-a.dev — почти всегда отказ

is-a.dev поддерживает NS-записи, но: «не для self-hosting сайтов, которые
можно бесплатно разместить на платформе», «индивидуальный разбор», «новым
пользователям отказ до 30 дней». Не строй на этом план A.

### 0.4. Доступность Cloudflare с сервера — ключевая проверка

```bash
curl -sS -m 10 -o /dev/null -w '%{http_code} %{time_total}s\n' https://www.cloudflare.com/
```

В кейсе: `000 timeout` → добавить в zapret-хостлист
(`/opt/zapret/ipset/zapret-hosts-user.txt`) домены:

```
cloudflare.com
*.cloudflare.com
cloudflareclient.com
*.cloudflareclient.com
argotunnel.com
*.argotunnel.com
pages.dev
*.pages.dev        # если планируешь Cloudflare Pages
```

и `systemctl restart zapret` → тот же URL стал `200 OK за 0.55 s`.
Блокировка была чисто DPI — та же техника, что и у Telegram.

Эти записи не ломают прочий трафик (`MODE_FILTER=hostlist`).

---

## Шаг 1. Выбор архитектуры (почему именно это)

Требования: карточки товаров с фото/видео, раскрытие с описанием и ценой,
заказ в чат производителя, админ-CRUD из самого мини-аппа, тёмная тема,
аудитория 7–15 лет.

| Решение | Что выбрали | Почему |
|---|---|---|
| Фронтенд | React + Vite + `@telegram-apps/telegram-ui` + `@telegram-apps/sdk` | готовый UI-кит Telegram, тёмная тема в одну строку |
| Бэкенд-хостинг | **Cloudflare Pages Functions** | бесплатный тариф, HTTPS-сертификат автоматом, Functions = Workers |
| База | **Cloudflare KV** | магазин небольшой (< 1000 товаров), квоты с огромным запасом |
| Авторизация | проверка `X-Telegram-Init-Data` (HMAC-SHA256) | официальный способ; `BOT_TOKEN` живёт как Pages-секрет |
| Заказы | кнопка → `t.me/<owner>?text=<заготовка>` | не требует сервера вообще; заказ падает в чат владельцу |
| Бот | aiogram 3 дома на сервере | кнопка меню через `setChatMenuButton` API |
| Домен | `*.pages.dev` сразу; позже `is-a.dev` | is-a.dev — бесплатный поддомен через PR на GitHub |

**Изученный урок:** фронтенд и API обязаны жить на одном домене
(иначе mixed content: мини-апп открывается по HTTPS, а HTTP-запросы
браузер блокирует). Pages даёт это из коробки: статика + API на одном домене.

---

## Шаг 2. Скелет фронтенда (miniapp/)

Структура репозитория (важно для шагов 4–5):

```
miniapp/                    # React-приложение (vite build → dist/)
functions/api/[[route]].ts  # бэкенд: один catch-all на все /api/*
public/                     # папка деплоя Pages (сборка miniapp)
wrangler.toml               # config-as-code Pages: vars + KV binding
.dev.vars.example           # шаблон локальных секретов для wrangler pages dev
deploy/
```

Минимальные команды создания (если начинаешь с нуля, а не по кейсу):

```bash
npm create vite@latest miniapp -- --template react-ts
npm --prefix miniapp i @telegram-apps/telegram-ui @telegram-apps/sdk
```

Ключевые элементы кейса:

1. **Тёмная тема форсится**: `foundation.forceDarkTheme()` из SDK +
   inline CSS-переменные (`--tg-theme-*`, `--tgui--*`) на `:root` —
   иначе UI-кит берёт светлую тему, если Telegram её не объявил.
2. **initData → вход** (src/api.ts): `Telegram.WebApp.initData`
   целиком уходит в заголовок `X-Telegram-Init-Data`; бэк его проверяет.
3. **Заказ** (src/api.ts):
   `https://t.me/${owner}?text=${encodeURIComponent(orderText)}` —
   открывается чат производителя с готовым текстом заказа.
4. **Вне Telegram всё тоже работает** (dev в браузере): пустой initData →
   GET-запросы отвечают, админ-роуты дают 403 — это покрыто тестами.

Сборка артефакта:

```bash
npm --prefix miniapp run build     # dist/ для Pages
```

---

## Шаг 3. Бэкенд: Pages Functions (functions/api/[[route]].ts)

Один файл — один catch-all. KV-пространство одно (binding = `MEDIA`):

- `db:products` — JSON `{ next_id, items[] }` (аналог SQLite-таблицы;
  если ключа нет — сидирует 3 демо-карточки, аналог `SEED_DEMO`);
- `media:<hex>.<ext>` — файлы целиком (value = ArrayBuffer, metadata = `{ct}`).

Роуты — полный совместимый набор:

```
GET    /api/config                 # { owner_username, admin_enabled }
GET    /api/products               # каталог (сортировка id DESC)
GET    /api/products/<id>
POST   /api/whoami                 # { user_id, is_admin }
POST   /api/admin/products         # 201
PUT    /api/admin/products/<id>
DELETE /api/admin/products/<id>
POST   /api/admin/upload           # multipart/form-data, поле file
GET    /api/media/<имя>            # Content-Type из metadata/ext
```

### 3.1. Проверка initData через WebCrypto (без библиотек)

Официальный алгоритм Telegram, но на Workers доступен только WebCrypto:

```
secret_key = HMAC_SHA256(key="WebAppData", msg=BOT_TOKEN)
hash       = HMAC_SHA256(key=secret_key, msg=data_check_string)
```

- `data_check_string` = все пары `k=v` из initData, **декодированные**,
  отсортированные по ключу, соединённые `\n`;
- пара `hash` исключается; сравнение подписи — constant-time.

Грабли, проверенные на практике:

- `[...new URLSearchParams(raw)]` возвращает **декодированные** значения —
  это совпадает с Python-`parse_qsl` из официальной документации Telegram.
- Мини-апп шлёт пользователя упакованным: `user={"id":...}` (JSON-строка
  внутри initData). Тестовый скрипт в кейсе сначала слал поля пользователя
  «плашмя» — и валидация честно отбивала их как битую подпись, а тест
  падал «админ не админ». Диагноз был в тесте, не в бэкенде. Если
  сталкиваешься с этим — сначала сравни формат initData с настоящим,
  потом паникуй.

### 3.2. Валидации как в FastAPI-версии (перенеси все лимиты)

`title ≤ 64`, `category ≤ 32` (дефолт «Другое»), `short_desc ≤ 140`,
`description ≤ 4000`, `price ≤ 32`, `media ≤ 10` с регуляркой
`^/api/media/[A-Za-z0-9._-]+$`, фото ≤ 10 МБ.

Правило, проверенное на кейсе: имена
файлов генерирует сервер
(`crypto.getRandomValues(new Uint8Array(8))` → hex + расширение) —
никогда не доверяй `file.name` клиентского файла (только расширение).

### 3.3. Лимит видео: 24 МБ вместо 30

KV хранит value ≤ 25 МБ. В FastAPI было 30 — пришлось урезать до 24
(`MAX_VIDEO_BYTES`). Альтернатива — R2, но он требует привязки платёжной
карты; для карт РФ это тупик. Ограничение видно пользователю прямо в
UI-подсказке («Сожми, пожалуйста») — текст ошибки перенесён из FastAPI-версии.

### 3.4. Админ и обычный пользователь

Вся авторизация: заголовок → HMAC → `user.id` ∈ `ADMIN_IDS`
(env Pages, разделитель — запятая). `whoami` возвращает `user_id` и
`is_admin` — фронт по нему включает админ-кнопки.

---

## Шаг 4. Локальная проверка ВСЕГО (аккаунт ещё не нужен)

`wrangler pages dev` эмулирует Workers + KV локально, офлайн:

```bash
# корень репозитория
copy .dev.vars.example .dev.vars        # впиши BOT_TOKEN=123:TEST_TOKEN (фейковый)
npm install                              # подтянет wrangler (devDependency)
npx wrangler pages dev public --port 8787 --kv=MEDIA
```

Грабли №1: `wrangler pages dev` **не принимает `--config`** («Pages does
not support custom paths») — `wrangler.toml` должен лежать в корне проекта
и подхватывается автоматически. Секреты и переменные локального окружения
читаются из `.dev.vars` (в gitignore!): `BOT_TOKEN`, `OWNER_USERNAME`,
`ADMIN_IDS`.

Интеграционный тест (`deploy/cfpages-api-test.js`, 17 проверок):

```bash
node deploy\cfpages-api-test.js    # Windows; node 22: fetch и FormData нативно
```

Проверяет: конфиг, сид каталога, карточку, whoami (админ/посторонний/анон),
фальшивую подпись → 403, upload PNG → раздача → create → валидации 422
(длинный title, чужой URL в media) → update → delete → 404 → SPA-фронт.

**Ожидаемый результат: `ALL TESTS PASSED`.** Дальше — уже прод.

---

## Шаг 5. Деплой в Cloudflare (аккаунт и токен)

### 5.1. Аккаунт, если ты в РФ-сети

- Самый безболезненный путь: регистрация с **телефона через мобильный
  интернет** (CF-домены на мобильных сетях обычно доступны).
- Альтернатива: SOCKS через свой сервер (он уже обходит CF через zapret):
  `ssh -D 1080 user@сервер` + в браузере прокси SOCKS5 `127.0.0.1:1080`
  (расширение типа FoxyProxy).
- Дальше dash → бесплатный тариф, подтверждение email.

### 5.2. API-токен

dash → My Profile → API Tokens → Create Token → шаблон
**Edit Cloudflare Workers** + права `Account:Pages:Edit`,
`Account:Workers KV Storage:Edit`.

> Совет: не бери токен с коротким сроком в манифесте и фиксируй дату
> expiry (в кейсе токен был на неделю и истекал 8 ноября — перевыпускать
> заранее).

Работа с токеном:

```powershell
$env:CLOUDFLARE_API_TOKEN = "<token>"
```

Правила секретности: токен не кладём в репозиторий и не печатаем в логи.
В кейсе токен засветился в чате — если такое случится, перевыпусти и
отбрось старый.

### 5.3. Проект + KV + секрет + деплой

```powershell
$env:CLOUDFLARE_API_TOKEN = "<token>"

npx wrangler pages project create shadowbot-shop --production-branch master
npx wrangler kv namespace create MEDIA
# → получишь id; впиши его в wrangler.toml → [[kv_namespaces]] id = "..."

npx wrangler pages secret put BOT_TOKEN --project-name shadowbot-shop
# (ввод из stdin: реальный BOT_TOKEN бота из .env; НЕ в wrangler.toml!)

npm --prefix miniapp run build
Copy-Item miniapp\dist\* public\ -Recurse -Force
npx wrangler pages deploy public --project-name shadowbot-shop --branch master --commit-dirty=true
# → https://shadowbot-shop.pages.dev (конкретный URL деплоя — в выводе)
```

Грабли №2: после смены/добавления секрета сделай заново деплой, чтобы
новая версия воркера подхватила bindings. Затем прод-тест
(`deploy/cfpages-prod-test.js`):

- `/api/config` → 200;
- `/api/products` → тройка демо-карточек;
- `/api/whoami` со свежесгенерированным валидным initData (в тесте он
  создаётся на node `crypto` с **реальным** BOT_TOKEN — это же
  WebCrypto-алгоритм из §3.1) → `is_admin: true`;
- upload → KV, раздача медиа → прямой GET 200;
- SPA-индекс отдаётся 200.

Ожидаемо: **`ALL PROD TESTS PASSED`.** В кейсе прод-тест прошёл прямо
из РФ-сети — итоговый URL не был SNI-заблокирован у провайдера
(проверь открытие с телефона: там другой путь, чем с сервера).

### 5.4. Пересборка / выкатка изменений

```powershell
npm --prefix miniapp run build
Copy-Item miniapp\dist\* public\ -Recurse -Force
npx wrangler pages deploy public --project-name shadowbot-shop --branch master --commit-dirty=true
```

Functions обновляются тем же деплоем (каталог `functions/` уже учитывается).

---

## Шаг 6. Прикрутка бота (может обойтись БЕЗ BotFather)

На сервере (`.env` в корне репо):

```bash
sed -i 's#^MINIAPP_URL=.*#MINIAPP_URL=https://shadowbot-shop.pages.dev#' .env
sudo systemctl restart shadowbot-bot
journalctl -u shadowbot-bot -n 4      # Run polling for bot @... без ошибок
```

### 6.1. Кнопка меню через API (проверено — работает!)

BotFather для меню-кнопки не обязателен:

```bash
BOT_TOKEN=$(grep '^BOT_TOKEN=' .env | cut -d= -f2)
curl -sS -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setChatMenuButton" \
  -H 'Content-Type: application/json' \
  -d '{"menu_button":{"type":"web_app","text":"Открыть магазин","web_app":{"url":"https://shadowbot-shop.pages.dev"}}}'
# → {"ok":true}
curl -sS "https://api.telegram.org/bot${BOT_TOKEN}/getChatMenuButton"
# → {"ok":true,"result":{"type":"web_app","text":"...","web_app":{"url":"..."}}}
```

Пользователь видит кнопку «Открыть магазин» слева от поля ввода в чате
с ботом. `/setmenubutton` в BotFather — ручной эквивалент.

> Грабля №3: inline-кнопки `web_app` в клавиатурах так просто не работают —
> их домен должен быть «зарегистрирован» через BotFather (`/newapp` или
> `/setmenubutton`). Меню-кнопка через API это ограничение обошла.

### 6.2. Проверка живьём

1. Чат с ботом на телефоне → слева снизу кнопка меню «Открыть магазин».
2. Каталог, раскрытие карточки, форма заказа.
3. «Заказать» → открывает чат владельца с готовым текстом заказа.
4. С ID из `ADMIN_IDS` — кнопки редактирования работают.

---

## Шаг 7. Красивый адрес: is-a.dev (бесплатный поддомен)

is-a.dev — комьюнити-домен: делаешь PR на GitHub, волонтёры мержат.

1. Форк https://github.com/is-a-dev/register
2. Файл `domains/<имя>.json` (вложенные поддомены = точки в имени файла):

   ```json
   {
     "owner": { "username": "<твой-github-username>" },
     "records": {
       "CNAME": "shadowbot-shop.pages.dev"
     },
     "proxied": true
   }
   ```

3. PR → review (часы–дни, волонтёры).

Правила is-a.dev (взяты прямо из их FAQ):

- поддерживаются A/AAAA/CNAME/MX/TXT/URL/SRV/CAA/DS/TLSA; **NS — только
  по индивидуальному разбору, для self-hosting обычно отказ**;
- **не генерируй PR с помощью ИИ** — прямое правило проекта («Do not use
  AI to generate your request», за это отклоняют). Возьми шаблон выше
  и заполни руками;
- поддомен должен быть связан с разработкой/софтом (их ToS).

После мержа:

- обнови `MINIAPP_URL` на `https://<имя>.is-a.dev` и повтори
  `setChatMenuButton`;
- если нужен custom domain на самом Pages-проекте — обычный дашборд не
  принимает домены из Public Suffix List, у комьюнити есть для этого
  API-обёртка: https://cf-pages.is-a.dev.

> Грабля №4: `proxied: true` критичен — TLS-сертификат для
> `*.is-a.dev` на edge у них wildcard и обслужит твой поддомен.

---

## Шаг 8. Публичный мини-апп: где заканчиваются лимиты

Квоты бесплатного CF-тарифа (Pages + KV):

| Ресурс | Лимит | Комментарий |
|---|---|---|
| Запросы | Pages: без жёсткого лимита | бесплатный тариф |
| KV writes | 1000/день | одно админ-действие ≈ 1 write; запас огромен |
| KV reads | 100k/день | открытие магазина клиентом ≈ 2 read |
| KV value | 25 МБ | поэтому видео ≤ 24 МБ |
| Workers CPU | 10 ms/запрос | твой API сильно ниже |

Если магазин вырастет за эти цифры — переезд на D1 (SQL) или R2 (файлы);
тоже есть free tier, но там привязка платёжной карты, а это отдельные
сложности с картами РФ.

---

## Шаг 9. Чек-лист спасения (если что-то не так)

| Симптом | Причина и действие |
|---|---|
| `whoami` даёт `is_admin: false` у валидного админа | `user.id` не попал в `ADMIN_IDS` (env Pages); после правки wrangler.toml — РЕДЕПЛОЙ |
| `/api/admin/*` 403 при верном хеше | BOT_TOKEN в секрете Pages ≠ BOT_TOKEN бота. Проверь: `npx wrangler pages secret list` |
| Локально всё зелёное, прод не тот | открываешь `*.pages.dev` ДО первого деплоя — там заглушка; смотри конкретный deploy-URL в выводе wrangler |
| upload 413 на «маленьком» файле | расширение попало не в тот список (photo/video); ext из `file.name`, kind определяется им же — проверь имя |
| у части операторов `*.pages.dev` не открывается | RF-провайдеры выборочно SNI-блокируют CF; выход — is-a.dev адрес (§7) вместо `*.pages.dev` |
| токен CF умер в середине деплоя | expiry у токенов обычное дело; перевыпусти (§5.2), задай `$env:CLOUDFLARE_API_TOKEN` снова |
| `pages deploy` ругается `KV namespace not found` | id в wrangler.toml не совпадает с созданным; `npx wrangler kv namespace list` |

---

## TL;DR для агента (10 шагов)

1. Проверка окружения: внешний тест входящих на «домашний хостинг» →
   CGNAT => хостимся в облаке (§0.1).
2. Серверу zapret-хостлист: cloudflare.com, pages.dev и родственные (§0.4).
3. Статика: React+Vite+telegram-ui, тёмная тема, заказ через t.me (§2).
4. API: `functions/api/[[route]].ts` — KV-каталог + медиа + HMAC initData (§3).
5. `wrangler pages dev` + интеграционный тест 17/17 (§4).
6. CF аккаунт (телефон или SOCKS) + API-токен + проект + KV + секрет (§5).
7. Деплой `public/` → `https://<проект>.pages.dev` + прод-тест (§5.3).
8. Бот: `MINIAPP_URL` + рестарт + `setChatMenuButton` через API (§6).
9. is-a.dev PR по шаблону (руками, не ИИ) → смена адреса (§7).
10. Мониторинг лимитов по таблице (§8); при росте — D1/R2 (§8).
