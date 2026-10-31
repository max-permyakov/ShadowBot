# ShadowBot Shop 🛍🤖

Telegram Mini App — магазин изделий с 3D-принтера. Тёмный минималистичный дизайн,
крупные карточки, заказ в два тапа прямо в чат производителю.

**Стек:** React + Vite · UI-кит [`@telegram-apps/telegram-ui`](https://github.com/telegram-mini-apps-dev/TelegramUI)
· `@telegram-apps/sdk` · FastAPI + SQLite · aiogram 3.

## Возможности

| Кто | Что может |
|---|---|
| Покупатель | листает каталог, открывает карточку (фото/видео + полное описание + примерная цена), выбирает количество, пишет комментарий и жмёт **«🚀 Заказать»** → открывается чат с производителем с готовым сообщением: *название, количество, комментарий* |
| Администратор | по Telegram ID (список `ADMIN_IDS` в `.env`): создание карточки, редактирование, удаление, загрузка фото/видео (до 10 фото/видео на карточку) |

## Структура

```
.env                # секреты и настройки (см. .env.example)
requirements.txt    # python-зависимости (API + бот)
bot/main.py         # лёгкий бот: /start → открыть магазин, /id → узнать ID
server/             # FastAPI: CRUD товаров, загрузка медиа, проверка админа по initData
server/data/        # products.db + media/ (создаются автоматически)
miniapp/            # React mini app (TelegramUI)
deploy/             # systemd-юниты + инструкция деплоя на Ubuntu
```

## Быстрый старт (локально, Windows/Linux)

```bash
# 1. Python
python -m venv server/.venv
server/.venv/Scripts/pip install -r requirements.txt   # linux: server/.venv/bin/pip

# 2. .env — заполни BOT_TOKEN, OWNER_USERNAME, ADMIN_IDS
cp .env.example .env

# 3. Фронтенд
cd miniapp
npm install
npm run build          # мини-апп будет раздаваться сервером из miniapp/dist
# для разработки можно и так: npm run dev (vite на :5173, /api → :8000)

# 4. Сервер + бот (два терминала)
server/.venv/Scripts/python -m uvicorn server.main:app --port 8000
server/.venv/Scripts/python bot/main.py
```

Открой `http://127.0.0.1:8000` — тот же интерфейс, что и в Telegram (плюс кнопка
«назад» для браузера; админ-кнопки появятся только при входе из Telegram с ID из
`ADMIN_IDS`).

## Как стать админом

1. Открой бота → `/id` (или напиши `@userinfobot`).
2. Впиши ID в `.env`: `ADMIN_IDS=123456789`
3. Перезапусти API и открой мини-апп своим аккаунтом.

## Как это работает

- Проверка админ-прав: клиент шлёт заголовок `X-Telegram-Init-Data`; сервер
  проверяет подпись HMAC-SHA256 (`WebAppData` + `BOT_TOKEN`) и сверяет `user.id`
  со списком `ADMIN_IDS`. Подделать запрос не выйдет.
- Медиа хранятся в `server/data/media`, отдаются как `/media/<файл>`.
- Заказ формируется приложением: `https://t.me/<OWNER_USERNAME>?text=...`
- Сид-карточки создаются при первом запуске (отключается `SEED_DEMO=0`); их можно
  удалить как обычные товары.

Продакшн на домашнем Ubuntu-сервере — **[deploy/README.md](deploy/README.md)**
(systemd + Cloudflare Tunnel = бесплатный HTTPS-домен без белого IP).
