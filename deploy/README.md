# Деплой ShadowBot Shop на домашний Ubuntu-сервер

Мини-апп и API живут **в одном процессе** на порту `8000`:

```
GitHub push (main) ──► SSH-деплой ──► systemd-сервисы ──► Cloudflare Tunnel ──► Telegram
```

- `shadowbot-api` — FastAPI: REST API + раздача собранного мини-аппа (`miniapp/dist`) и медиа.
- `shadowbot-bot` — Telegram-бот с кнопкой «Открыть магазин».
- **Cloudflare Tunnel** — бесплатный HTTPS-домен без белого IP и проброса портов.

---

## 1. one-time установка на сервере

```bash
sudo mkdir -p /opt/shadowbot && sudo chown $USER /opt/shadowbot
# клонируй репозиторий:
git clone <repo-url> /opt/shadowbot && cd /opt/shadowbot

# python-окружение
python3 -m venv server/.venv
server/.venv/bin/pip install -r requirements.txt

# конфиг
cp .env.example .env
nano .env    # BOT_TOKEN, OWNER_USERNAME, ADMIN_IDS, MINIAPP_URL

# фронтенд (нужен Node 20+; поставь через nvm или apt)
cd miniapp && npm ci && npm run build && cd ..

# systemd
sudo cp deploy/shadowbot-api.service deploy/shadowbot-bot.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now shadowbot-api shadowbot-bot
systemctl status shadowbot-api --no-pager
```

Проверка: `curl http://127.0.0.1:8000/api/config` → `{"owner_username":"...","admin_enabled":true}`

## 2. Cloudflare Tunnel (бесплатный HTTPS)

1. Заведи домен в Cloudflare (или возьми дешёвый домен и перенеси NS).
2. Установи туннель:

```bash
wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -O cloudflared
sudo mv cloudflared /usr/local/bin/cloudflared && sudo chmod +x /usr/local/bin/cloudflared
cloudflared tunnel login                          # браузер-линк
cloudflared tunnel create shadowbot
cloudflared tunnel route dns shadowbot shop.example.com
sudo nano ~/.cloudflared/config.yml
```

`~/.cloudflared/config.yml`:

```yaml
tunnel: shadowbot
credentials-file: /home/<user>/.cloudflared/<TUNNEL-ID>.json
ingress:
  - hostname: shop.example.com
    service: http://localhost:8000
  - service: http_status:404
```

```bash
sudo cloudflared service install        # автозапуск как сервис
```

3. Пропиши в `.env`: `MINIAPP_URL=https://shop.example.com`, перезапусти бота.

## 3. BotFather

- `/setmenubutton` → выбери бота → URL: `https://shop.example.com` → название «Магазин».
- (опционально) `/setdescription`, `/setuserpic`.

Теперь у бота в чатах есть синяя кнопка-меню, открывающая магазин.

## 4. Админка

- `/id` в боте → скопируй ID.
- Впиши в `.env`: `ADMIN_IDS=123456789` и `sudo systemctl restart shadowbot-api shadowbot-bot`.
- Открой магазин с этого аккаунта: появятся кнопки «＋», «Редактировать», «Удалить».

## 5. Обновления (CI/CD)

`.github/workflows/deploy.yml` деплоит на push в `main` (см. secrets `SSH_HOST`, `SSH_USER`, `SSH_KEY`).

Ручной вариант:

```bash
cd /opt/shadowbot && git pull
cd miniapp && npm ci && npm run build && cd ..
sudo systemctl restart shadowbot-api shadowbot-bot
```

## 6. Альтернатива: Caddy + домен

Если домен уже вне Cloudflare и есть белый IP:

```bash
sudo apt install caddy
# /etc/caddy/Caddyfile
shop.example.com {
    reverse_proxy 127.0.0.1:8000
}
sudo systemctl reload caddy
```

HTTPS-сертификаты Caddy получит сам.

## 7. Обход блокировки Telegram провайдером

Часто на серверах в РФ `api.telegram.org` недоступен напрямую. Решение — Cloudflare
WARP в режиме **локального SOCKS5-прокси**: туннелируется только трафик, который
явно отправлен через него (бот), вся система и туннель для мини-аппа работают
как раньше.

```bash
bash deploy/setup-warp-proxy.sh   # ставит warp-cli, включает режим proxy
```

Затем в `.env` на сервере:

```
PROXY_URL=socks5://127.0.0.1:40000
```

и `sudo systemctl restart shadowbot-bot`. Проверка:

```bash
curl -x socks5h://127.0.0.1:40000 https://api.telegram.org/ -I
```

Альтернатива без WARP — [zapret](https://github.com/bol-van/zapret) (DPI-bypass,
демон с хостлистом `telegram.org`; прозрачно для системы, но настройки
чувствительнее к конкретному провайдеру).

> Локальная разработка на Windows — вариант под капотом
> [Cloudflare WARP](https://one.one.one.one/) (VPN на всю систему, Telegram
> Desktop сразу заработает) или [zapret-win-bundle](https://github.com/bol-van/zapret-win-bundle)
> с хостлистом на telegram.org. `PROXY_URL` тогда не нужен.

## Бэкап данных магазина

```bash
cp server/data/products.db ~/backups/products-$(date +%F).db
cp -r server/data/media ~/backups/media-$(date +%F)/
```
