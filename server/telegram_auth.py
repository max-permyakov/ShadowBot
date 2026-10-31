"""Проверка подписи initData из Telegram Mini App (HMAC-SHA256).

Схема из официальной документации Telegram:
  secret_key = HMAC_SHA256("WebAppData", BOT_TOKEN)
  hash       = HMAC_SHA256(secret_key, data_check_string)
"""
from __future__ import annotations

import hashlib
import hmac
import json
from urllib.parse import parse_qsl

from . import config


def validate_init_data(raw_init_data: str) -> dict | None:
    """Возвращает {"user": {...}, ...} для валидного initData, иначе None."""
    if not raw_init_data or not config.BOT_TOKEN:
        return None

    try:
        pairs = [
            (k, v)
            for k, v in parse_qsl(raw_init_data, keep_blank_values=True)
            if k != "hash"
        ]
        pairs.sort()
        data_check_string = "\n".join(f"{k}={v}" for k, v in pairs)
        provided_hash = dict(parse_qsl(raw_init_data)).get("hash", "")

        secret_key = hmac.new(
            b"WebAppData", config.BOT_TOKEN.encode(), hashlib.sha256
        ).digest()
        calculated = hmac.new(
            secret_key, data_check_string.encode(), hashlib.sha256
        ).hexdigest()

        if not hmac.compare_digest(calculated, provided_hash):
            return None
    except Exception:
        return None

    try:
        data = dict(parse_qsl(raw_init_data, keep_blank_values=True))
        for key in ("user", "receiver", "chat"):
            if key in data:
                data[key] = json.loads(data[key])
        return data
    except Exception:
        return None


def user_id_from(headers) -> int | None:
    """Достаёт user.id из заголовка X-Telegram-Init-Data."""
    raw = headers.get("X-Telegram-Init-Data", "").strip()
    data = validate_init_data(raw)
    if not data:
        return None
    user = data.get("user") or {}
    uid = user.get("id")
    return int(uid) if uid is not None else None
