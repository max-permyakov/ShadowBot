#!/usr/bin/env bash
# Настройка Cloudflare WARP в режиме локального SOCKS5-прокси на Ubuntu.
# Туннелируется ТОЛЬКО трафик, отправленный через 127.0.0.1:40000 —
# VPN «на всю систему» не нужен.
#
# После установки пропиши в сайте проекта (.env):
#   PROXY_URL=socks5://127.0.0.1:40000
# и перезапусти бота:  sudo systemctl restart shadowbot-bot
set -euo pipefail

ARCH=$(dpkg --print-architecture)

echo "== 1. Добавляю репозиторий Cloudflare и ставлю warp-cli =="
curl -fsSL https://pkg.cloudflareclient.com/pubkey.gpg \
  | sudo gpg --yes --dearmor --output /usr/share/keyrings/cloudflare-warp-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/cloudflare-warp-archive-keyring.gpg] https://pkg.cloudflareclient.com/ $(lsb_release -cs) main" \
  | sudo tee /etc/apt/sources.list.d/cloudflare-client.list >/dev/null
sudo apt update && sudo apt install -y cloudflare-warp

echo "== 2. Регистрация (один раз) =="
warp-cli --accept-tos registration new || true

echo "== 3. Режим: локальный прокси на 127.0.0.1:40000 =="
warp-cli --accept-tos mode proxy
warp-cli --accept-tos proxy port 40000
warp-cli --accept-tos connect
sleep 4
warp-cli --accept-tos status

echo "== 4. Автозапуск =="
systemctl is-enabled warp-svc >/dev/null && echo "warp-svc уже в автозапуске" || sudo systemctl enable --now warp-svc

echo
echo "Готово. Проверка туннеля:"
echo "  curl -x socks5h://127.0.0.1:40000 https://api.telegram.org  (должно открыться)"
echo
echo "Затем в /opt/shadowbot/.env добавь:"
echo "  PROXY_URL=socks5://127.0.0.1:40000"
echo "и: sudo systemctl restart shadowbot-bot"
