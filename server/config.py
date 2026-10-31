"""Конфигурация сервера ShadowBot (читается из .env в корне проекта)."""
from __future__ import annotations

import os
from pathlib import Path

# Загружаем .env из корня репозитория, если есть python-dotenv
try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except ImportError:  # pragma: no cover
    pass

BASE_DIR = Path(__file__).resolve().parent.parent
# Каталоги данных создаются сразу — StaticFiles требует их при старте
DATA_DIR = Path(os.getenv("DATA_DIR", BASE_DIR / "server" / "data")).resolve()
MEDIA_DIR = DATA_DIR / "media"
MEDIA_DIR.mkdir(parents=True, exist_ok=True)
MEDIA_URL_PREFIX = "/media"

BOT_TOKEN = os.getenv("BOT_TOKEN", "").strip()
OWNER_USERNAME = os.getenv("OWNER_USERNAME", "").strip().lstrip("@")

def _parse_admin_ids(raw: str) -> frozenset[int]:
    ids = set()
    for chunk in raw.replace(";", ",").split(","):
        chunk = chunk.strip()
        if chunk.isdigit():
            ids.add(int(chunk))
    return frozenset(ids)

# Админы: ADMIN_IDS=123456789,987654321 в .env
ADMIN_IDS = _parse_admin_ids(os.getenv("ADMIN_IDS", ""))

# Лимиты загрузки медиа
MAX_PHOTO_BYTES = 10 * 1024 * 1024   # 10 МБ
MAX_VIDEO_BYTES = 30 * 1024 * 1024   # 30 МБ

PHOTO_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
VIDEO_EXTS = {".mp4", ".webm", ".mov", ".m4v", ".ogg"}

MINIAPP_URL = os.getenv("MINIAPP_URL", "").strip()

# Заполнять базу демо-карточками при самом первом запуске (можно отключить)
SEED_DEMO = os.getenv("SEED_DEMO", "1") not in {"0", "false", "no"}
