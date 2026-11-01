# Runbook: обход блокировки Telegram для бота на Ubuntu-сервере

> **Назначение:** инструкция для ИИ-агента, который с нуля повторяет успешный
> кейс из практики. Условия кейса:
>
> - сервер с Telegram-ботом, работающим через long polling (`api.telegram.org`);
> - провайдер блокирует Telegram по DPI (проверка ClientHello/SNI в TCP/443);
> - исходящий UDP/53 к внешним DNS заблокирован, системный DNS частично
>   подменён (отдаёт «мёртвый» IP);
> - Cloudflare WARP не подходит: заблокирована даже процедура регистрации
>   (`warp-cli registration new` → «Failed to communicate with the WARP API»,
>   `curl https://api.cloudflareclient.com` рвётся TLS-ошибкой 35);
> - решение, которое сработало: **zapret (nfqws) с хостлистом Telegram +
>   закрепление живых IP в `/etc/hosts`**.
>
> Целевая среда: Ubuntu 24.04+ (кейс проверен на 26.04), systemd, nftables.

---

## Шаг 0. Диагностика (обязательна до любых настроек)

Определяем, какие виды блокировки присутствуют. От этого зависит вся стратегия.

```bash
# A) Что отдаёт системный DNS?
getent hosts api.telegram.org        # должен быть валидный IP Telegram
getent ahosts api.telegram.org | head -6   # ВСЕ адреса: IPv4 и IPv6

# B) Где умирает соединение?
curl -vsS -m 10 https://api.telegram.org/ 2>&1 | grep -E 'Trying|Connected|SSL|HTTP'

# C) Доступны ли внешние DNS (UDP/53 наружу)?
dig +short api.telegram.org @8.8.8.8

# D) Жив ли TCP до конкретных IP Telegram (можешь взять оба списка)?
timeout 5 bash -c '< /dev/tcp/149.154.167.220/443' && echo TCP_OK || echo TCP_FAIL
```

### Интерпретация результатов

| Наблюдение | Диагноз | Действие |
|---|---|---|
| DNS валидный, `curl` виснет на Trying/ClientHello | DPI по SNI | zapret (§3–§5) |
| DNS отдаёт «мёртвый» IP: TCP до него не открывается | DNS-подмена/кэш | закрепить живые IP в `/etc/hosts` (§4.3) |
| `dig @8.8.8.8` — timeouts | UDP/53 наружу заблокирован | упор на `/etc/hosts`; внешние DNS не спасают |
| GitHub/apt работают, Telegram нет | блок точечный | подтверждает хостлист-подход |

Реальные показания из кейса: `getent` дал валидный IPv6, `dig @8.8.8.8` —
timeout, TLS к `api.telegram.org` висел 20+ секунд, а `curl https://github.com/`
отвечал за 1.2 с; `/dev/tcp` на IP из DNS не открывался, на
`149.154.167.220:443` открывался. Итог: лечим и DPI, и DNS.

---

## Шаг 1. Установка zapret из исходников

```bash
sudo apt update
sudo apt install -y git curl build-essential zlib1g-dev libcap-dev \
                    libnetfilter-queue-dev libmnl-dev libsystemd-dev
sudo git clone --depth 1 https://github.com/bol-van/zapret /opt/zapret
sudo chown -R "$(whoami):" /opt/zapret
cd /opt/zapret
make -j4
ls nfq/nfqws tpws/tpws mdig/mdig   # все три файла должны появиться
```

Замечания:
- `./install_bin.sh` иногда падает, потому что prebuilt догрузить с GitHub
  не выходит. Сборка через `make` решает.
- `blockcheck.sh` без собранных бинарей уходит в «press enter to continue»
  и молчит — это сигнал «сначала make», а не «стратегий нет».

---

## Шаг 2. Подбор стратегии: blockcheck

Длительность — 5–15 минут. Запускается строго под root и отсоединённо:

```bash
sudo bash -c 'setsid nohup bash /opt/zapret/blockcheck.sh > /tmp/blockcheck.log 2>&1 < /dev/null &'
```

Контроль прогресса:

```bash
tail -f /tmp/blockcheck.log
pgrep -f "bash /opt/zapret/blockcheck"
```

Грабли, проверенные на практике:
- Интерактивный запуск напечатает «press enter to continue» и зависнет
  в ожидании ввода. Запуск через `nohup` + `< /dev/null` это обходит.
- Не пиши `pkill -f blockcheck` в скрипте, путь которого сам содержит
  слово `blockcheck` — pkill найдёт команду самого скрипта и убьёт его.
  Правильный приём: два файла. Внешний `/tmp/start.sh` (под твоим юзером)
  вызывает `echo <sudo-пароль> | sudo -S bash /tmp/inner.sh`;
  внутренний `/tmp/inner.sh` уже под root делает `pkill -f "bash /opt/zapret/blockcheck"`,
  `pkill -x nfqws` и стартует blockcheck через `setsid nohup`.
- Редирект вывода `> /tmp/blockcheck.log` должен оказаться ВНУТРИ
  sudo-команды. Если он снаружи, файл откроется от имени твоего
  пользователя, а владелец файла окажется root — получишь
  «Permission denied» и пустой лог.

---

## Шаг 3. Извлечение рабочих стратегий

```bash
awk '/curl_test_https_tls12/{cmd=$0} /AVAILABLE/{print cmd}' /tmp/blockcheck.log | sort -u
```

Правила чтения:
- рабочая стратегия — это команда из строки **непосредственно перед**
  `!!!!! AVAILABLE !!!!!`;
- главное — тесты `curl_test_https_tls12 ... nfqws ...`: бот ходит по TCP/443;
- тесты QUIC/UDP игнорируй (Telegram Bot API по TCP);
- TLS1.3-тестов может не быть, но TLS1.2-стратегии (разбиение/фальшь
  ClientHello) применимы и к TLS1.3;
- предпочитай `badseq / badsum / ts / md5sig / datanoack` и варианты
  `multisplit / multidisorder / fakeddisorder / fake`. Стратегии с TTL-фальшивкой
  (`--dpi-desync-ttl=N`) зависят от числа хопов и умирают чаще.

Стратегии, реально сработавшие в кейсе (все были AVAILABLE):

```text
tcp/443: nfqws --dpi-desync=fakeddisorder --dpi-desync-fooling=badseq --dpi-desync-split-pos=1
tcp/80:  nfqws --dpi-desync=multisplit --dpi-desync-split-pos=method+2
запас:   nfqws --dpi-desync=multidisorder --dpi-desync-split-pos=midsld
         nfqws --dpi-desync=fake --dpi-desync-fooling=badseq,md5sig
```

---

## Шаг 4. Настройка zapret

> Порядок: сперва DNS (§4.3), потом конфиг (§4.1–§4.2), потом сервис (§5).
> Если DNS отдаёт «мёртвый» IP, соединение не установится, даже если
> стратегия DPI идеальная — zapret в этом случае не поможет.

### 4.1. Включаем nfqws и стратегию в `/opt/zapret/config`

```bash
cd /opt/zapret
sed -i 's/^NFQWS_ENABLE=0$/NFQWS_ENABLE=1/' config
sed -i 's/^MODE_FILTER=none$/MODE_FILTER=hostlist/' config
python3 - <<'PYEOF'
import re
p = "/opt/zapret/config"
s = open(p).read()
new_opt = '''NFQWS_OPT="
--filter-tcp=80 --dpi-desync=multisplit --dpi-desync-split-pos=method+2 <HOSTLIST> --new
--filter-tcp=443 --dpi-desync=fakeddisorder --dpi-desync-fooling=badseq --dpi-desync-split-pos=1 <HOSTLIST> --new
"
'''
s = re.sub(r'NFQWS_OPT="\n(.|\n)*?"\n', new_opt, s, count=1)
open(p, "w").write(s)
PYEOF
grep -A3 '^NFQWS_OPT=' config    # убедись глазами, что блок заменился
```

`<HOSTLIST>` — плейсхолдер: агент подставит пути к хостлисту, если
`MODE_FILTER=hostlist`. Дефолтную строку `--filter-udp=443 ...` (QUIC)
можно удалить: боту она не нужна и добавляет шум.

### 4.2. Хостлист: Telegram и только он

```bash
cat > /opt/zapret/ipset/zapret-hosts-user.txt <<'EOF'
telegram.org
api.telegram.org
t.me
cdn.telesco.pe
*.telegram.org
EOF
```

Так apt, GitHub и остальная сеть идут мимо nfqws — минимальный риск
сломать обычный трафик.

### 4.3. Закрепляем живые IP в `/etc/hosts`

Реальный показ DNS в кейсе: провайдерский резолвер отдавал для
`api.telegram.org` единственный IP `149.154.166.110`, TCP к которому закрыт,
а здоровые `149.154.167.220`, `149.154.167.197`, `149.154.167.198` DNS
вообще не показывал.

```bash
sudo cp /etc/hosts /etc/hosts.bak
sudo sh -c 'grep -v "api.telegram.org" /etc/hosts.bak > /etc/hosts'
sudo tee -a /etc/hosts >/dev/null <<'EOF'
# Telegram Bot API
149.154.167.220 api.telegram.org
149.154.167.197 api.telegram.org
149.154.167.198 api.telegram.org
EOF
getent ahosts api.telegram.org   # теперь должно выдать все три
```

Если однажды Telegram сменит адресацию:

```bash
curl -s "https://cloudflare-dns.com/dns-query?name=api.telegram.org&type=A" \
     -H "accept: application/dns-json" | grep -Eo '\d+\.\d+\.\d+\.\d+' | sort -u
```

обнови `/etc/hosts` и перезапусти бота.

---

## Шаг 5. systemd-сервис zapret

```bash
sudo cp /opt/zapret/init.d/systemd/zapret.service /etc/systemd/system/zapret.service
sudo systemctl daemon-reload
sudo systemctl enable --now zapret
systemctl status zapret --no-pager | head -8      # active (running)
sudo ps aux | grep nfqws | grep -v grep           # процесс с твоей стратегией
```

Сетевая проверка (рабочая после всего, что выше):

```bash
curl -sS -m 15 -o /dev/null -w '%{http_code}\n' -I https://api.telegram.org/
```

Ожидание: код != `000`. `302/403/404` — TLS доставлен, всё в порядке.

---

## Шаг 6. Бот как systemd-сервис

```ini
# /etc/systemd/system/shadowbot-bot.service
[Unit]
Description=Shop Telegram Bot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/home/<user>/ShadowBot
ExecStart=/home/<user>/ShadowBot/server/.venv/bin/python bot/main.py
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now shadowbot-bot
journalctl -u shadowbot-bot -n 5 -f
```

Ожидание в журнале: `Бот запущен 🚀`, `Start polling`,
`Run polling for bot @<name>` и никакой повторяемой
`TelegramNetworkError` / `recv failure`.

---

## Шаг 7. Проверка устойчивости

Дай боту поработать несколько минут без вмешательства и проверь:

```bash
sleep 120
journalctl -u shadowbot-bot --no-pager -n 20
systemctl is-active zapret shadowbot-bot
```

Ожидание: оба сервиса active, поллинг чистый за 2 минуты без сетевых ошибок.

---

## Частые поломки и лечение

| Симптом | Причина и лечение |
|---|---|
| `203/EXEC` у бота-юнита | неверные пути в `ExecStart` / `WorkingDirectory` (частая ошибка — скопировать путь `/opt/shadowbot` из шаблона в `deploy/` вместо реального каталога репозитория). Исправь, `daemon-reload`, рестарт |
| «press enter to continue» blockcheck | не собраны `nfq/nfqws` и т. д. → `make` в `/opt/zapret` (§1) |
| пустой `/tmp/blockcheck.log` и «Permission denied» | редирект должен быть внутри sudo-команды или файл создать заранее от того, кто запускает (§2) |
| ваш запуск blockcheck умер после отключения SSH | положи скрипт `setsid` + `nohup` и управляй (§2), а не берись за `script -qc` |
| `nfqws` «Permission denied» при make | `sudo chown -R $(whoami): /opt/zapret` (§1) |
| curl к Telegram timeout, но github ок | или не запущен zapret (`systemctl status`), или DNS вернул «мёртвый» IP → `/etc/hosts` (§4.3) |
| TCP-тест к IP Telegram FAIL у всех трёх | Telegram сменил блок → возьми новейшие IP через DoH (§4.3) |
| Ubuntu недавно было в блоке `sudo` | любое «нет пароля» у `sudo` проверяется `echo <пароль> | sudo -S -p "" <команда>` |

---

## Что НЕ делать (провально, проверено)

1. **Не пытаться решить через WARP**: в РФ-сетях блокируется даже регистрация
   клиента, тратить время не стоит. Если туннель всё же нужен, поднимайте
   его на другом хосте вне блокированной сети; для бота на этом сервере
   задачу решает zapret.
2. **Не ставить bypass на весь трафик без хостлиста**: сломается apt,
   GitHub, CDN и веб-интерфейсы сервера. `MODE_FILTER=hostlist` обязателен.
3. **Не править nftables руками**: zapret строит свою таблицу `inet zapret`
   при старте и пересоздаёт её при рестарте; ручные правила вступают
   в конфликт.
4. **Не лечить только одну из двух ветвей**: бот сломан и из-за DPI, и из-за
   DNS. Решение должно закрывать обе.

---

## TL;DR (10 шагов)

1. `getent ahosts api.telegram.org` — какой IP отдаёт DNS?
2. `timeout 5 bash -c '< /dev/tcp/<IP>/443'` — TCP жив?
3. `curl -v` к `api.telegram.org` — где рвётся?
4. `apt install` deps + `git clone` zapret + `make` (§1)
5. `blockcheck.sh` под root, отсоединённо (nohup/setsid), дождаться финала (§2)
6. Из AVAILABLE забираешь TCP/443-стратегию → в `/opt/zapret/config`
   (`NFQWS_ENABLE=1`, `MODE_FILTER=hostlist`, `NFQWS_OPT`)
7. Хостлист `api.telegram.org` в `/opt/zapret/ipset/zapret-hosts-user.txt`
8. `/etc/hosts`: три живых IP (§4.3)
9. `systemctl enable --now zapret` → `curl -I https://api.telegram.org/` ≠ 000
10. systemd-бот с реальными путями → `journalctl` — «Run polling» без ошибок 2 минуты+
