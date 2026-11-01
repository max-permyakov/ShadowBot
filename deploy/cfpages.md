# Деплой мини-аппа в Cloudflare Pages (вариант A: is-a.dev + CF Pages)

> **Контекст:** домашний интернет не принимает входящие соединения (проверено
> с 6 внешних узлов), NS-делегирование is-a.dev для self-hosting недоступно,
> а CNAME на чужой Cloudflare-туннель с 2024 не работает. Поэтому мини-апп
> размещаем в облаке: **Cloudflare Pages** (статика + Functions) + **KV**
> (товары и медиа). Бот остаётся на домашнем сервере и по-прежнему ходит в
> Telegram через zapret.
>
> Бэкенд (`functions/api/[[route]].ts`) — полный порт FastAPI (`server/main.py`):
> те же роуты, лимиты и демо-каталог. Пройден интеграционный тест
> `node deploy/cfpages-api-test.js` (17/17) на `wrangler pages dev`.

## Архитектура

```
Телефон (Telegram Mini App) ──HTTPS──► Cloudflare Edge (валидный сертификат)
                                        │  статика: public/ (сборка miniapp/)
                                        │  Functions: functions/api/* (+ KV)
                                        ▼
                              KV namespace `MEDIA`
                          db:products (каталог JSON), media:<имя> (файлы)

Домашний сервер ──► shadowbot-bot (aiogram) ──► api.telegram.org (zapret)
                    кнопка «Открыть магазин» = https://<домен>/ (MINIAPP_URL в .env)
```

## Что уже сделано в репозитории

- `functions/api/[[route]].ts` — API на Workers (все роуты прежнего сервера)
- `wrangler.toml` — config-as-code Pages (vars OWNER_USERNAME/ADMIN_IDS)
- `public/.gitkeep` — папка сборки для Pages
- `.dev.vars.example` — шаблон локальных секретов для `wrangler pages dev`
- `deploy/cfpages-api-test.js` — интеграционный тест API (17 проверок)

## Локальная проверка (без аккаунта, уже проверено)

```bash
copy .dev.vars.example .dev.vars          # Windows; в .dev.vars впиши свой тестовый BOT_TOKEN
npm --prefix miniapp run build
Remove-Item public\* -Exclude .gitkeep -Force -Recurse -ErrorAction SilentlyContinue
Copy-Item miniapp\dist\* public\ -Recurse -Force
npx wrangler pages dev public --port 8787 --kv=MEDIA
# в другом окне:
node deploy\cfpages-api-test.js           # ждём ALL TESTS PASSED
```

## Деплой (нужен аккаунт Cloudflare и API-токен)

> Регистрация CF из РФ-сети может не открыться напрямую: воспользуйся
> SOCKS-прокси через домашний сервер (он обходит блок через zapret):
> `ssh -D 1080 max@192.168.0.153`, затем в браузере включи прокси
> SOCKS5 `127.0.0.1:1080` (extension типа FoxyProxy) — или зарегистрируйся с телефона через мобильный интернет.

1. **Аккаунт Cloudflare** (бесплатный).
2. **API-токен**: dash → My Profile → API Tokens → Create Token →
   шаблон «Edit Cloudflare Workers», добавив права:
   `Account:Pages:Edit`, `Account:Workers KV Storage:Edit`.
   Токен — только в переменную окружения, НЕ в репозиторий.
3. **Создать Pages-проект и KV** (один раз):

   ```powershell
   $env:CLOUDFLARE_API_TOKEN = "<token>"
   npx wrangler pages project create shadowbot-shop --production-branch master
   npx wrangler kv namespace create MEDIA
   # скопировать id из вывода в wrangler.toml → [[kv_namespaces]] → id = "..."
   ```

4. **Секрет бота** (для проверки initData админов):

   ```powershell
   npx wrangler pages secret put BOT_TOKEN --project-name shadowbot-shop
   # вставить реальный BOT_TOKEN из .env
   ```

5. **Сборка и деплой:**

   ```powershell
   npm --prefix miniapp run build
   Copy-Item miniapp\dist\* public\ -Recurse -Force
   npx wrangler pages deploy public --project-name shadowbot-shop --branch master --commit-dirty=true
   # → https://shadowbot-shop.pages.dev
   ```

6. **Проверка живую:** открыть `https://shadowbot-shop.pages.dev/` в браузере
   (вне Telegram) — каталог с тремя демо-карточками; открыть из Telegram
   (Mini App работает и без привязанного домена: можно временно поставить
   `https://shadowbot-shop.pages.dev` в `/setmenubutton` или через
   BotFather → Menu Button). Админ-CRUD появляется у ID из `ADMIN_IDS`.

## is-a.dev (красивый адрес, после того как Pages работает)

1. Форк https://github.com/is-a-dev/register → файл `domains/<имя>.json`:

   ```json
   {
     "owner": {
       "username": "max-permyakov"
     },
     "records": {
       "CNAME": "shadowbot-shop.pages.dev"
     },
     "proxied": true
   }
   ```

   Примечания is-a.dev: не создавай PR «через ИИ» (их правило — за это
   отклоняют), поддомен должен быть связан с разработкой. PR обычно
   мержат волонтёры (часы–дни).
2. После мержа: BotFather → `/setmenubutton` → URL
   `https://<имя>.is-a.dev` (или сразу настроить Pages custom domain
   через их GUI https://cf-pages.is-a.dev — API-способ, у is-a.dev домен
   в Public Suffix List и через дашборд не добавляется).
3. Вписать финальный URL в `.env` на сервере → `MINIAPP_URL=...` →
   `sudo systemctl restart shadowbot-bot`.

## Лимиты и отличия от FastAPI-версии

| Что | FastAPI (старый) | Pages Functions (новый) |
|---|---|---|
| Фото | ≤ 10 МБ | ≤ 10 МБ |
| Видео | ≤ 30 МБ | ≤ **24 МБ** (лимит значения KV — 25 МБ) |
| Лимиты запросов | нет | Writes: 1000/день, Reads: 100k/день (бесплатный тариф KV) — с огромным запасом для магазина |
| Хранение | SQLite на диске сервера | KV в облаке (реплики глобально) |
| Админ-проверка | X-Telegram-Init-Data + HMAC | то же самое через WebCrypto |

## Демо-каталог: сброс

`SEED_DEMO`-логика сохранена: если ключа `db:products` в KV нет — при
первом запросе каталога запишутся 3 демо-карточки. Полный сброс:
удалить ключ `db:products` в KV (dash → Workers & Pages → KV) — каталог
пересоздастся демо.

## Домашний сервер после переезда

API сервера (`shadowbot-api`) для мини-аппа больше не нужен — только бот.

```bash
sudo systemctl disable --now shadowbot-api
```

Файлы `server/` остаются в репозитории как эталон портированной логики.
