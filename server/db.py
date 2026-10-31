"""SQLite-хранилище товаров ShadowBot Shop."""
from __future__ import annotations

import json
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Iterator

from . import config

_SCHEMA = """
CREATE TABLE IF NOT EXISTS products (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    title        TEXT NOT NULL,
    category     TEXT NOT NULL DEFAULT "Другое",
    short_desc   TEXT NOT NULL DEFAULT "",
    description  TEXT NOT NULL DEFAULT "",
    price        TEXT NOT NULL DEFAULT "",
    media        TEXT NOT NULL DEFAULT "[]",
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
);
"""

_conn: sqlite3.Connection | None = None
_lock = threading.Lock()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def init() -> None:
    global _conn
    config.DATA_DIR.mkdir(parents=True, exist_ok=True)
    config.MEDIA_DIR.mkdir(parents=True, exist_ok=True)
    _conn = sqlite3.connect(
        config.DATA_DIR / "products.db", check_same_thread=False
    )
    _conn.row_factory = sqlite3.Row
    with _conn:
        _conn.executescript(_SCHEMA)


def close() -> None:
    global _conn
    if _conn is not None:
        _conn.close()
        _conn = None


@contextmanager
def _cursor() -> Iterator[sqlite3.Cursor]:
    assert _conn is not None, "db.init() не вызван"
    with _lock:
        cur = _conn.cursor()
        try:
            yield cur
            _conn.commit()
        except Exception:
            _conn.rollback()
            raise
        finally:
            cur.close()


def _row_to_product(row: sqlite3.Row) -> dict[str, Any]:
    product = dict(row)
    product["media"] = json.loads(product.get("media") or "[]")
    return product


def list_products() -> list[dict[str, Any]]:
    with _cursor() as cur:
        rows = cur.execute(
            "SELECT * FROM products ORDER BY id DESC"
        ).fetchall()
    return [_row_to_product(r) for r in rows]


def get_product(product_id: int) -> dict[str, Any] | None:
    with _cursor() as cur:
        row = cur.execute(
            "SELECT * FROM products WHERE id = ?", (product_id,)
        ).fetchone()
    return _row_to_product(row) if row else None


def create_product(data: dict[str, Any]) -> dict[str, Any]:
    ts = _now()
    with _cursor() as cur:
        cur.execute(
            """INSERT INTO products
                 (title, category, short_desc, description, price, media,
                  created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                data["title"],
                data.get("category") or "Другое",
                data.get("short_desc") or "",
                data.get("description") or "",
                data.get("price") or "",
                json.dumps(data.get("media") or [], ensure_ascii=False),
                ts,
                ts,
            ),
        )
        pid = cur.lastrowid
    return get_product(pid)  # type: ignore[return-value]


def update_product(product_id: int, data: dict[str, Any]) -> dict[str, Any] | None:
    if get_product(product_id) is None:
        return None
    with _cursor() as cur:
        cur.execute(
            """UPDATE products SET
                 title = ?, category = ?, short_desc = ?, description = ?,
                 price = ?, media = ?, updated_at = ?
               WHERE id = ?""",
            (
                data["title"],
                data.get("category") or "Другое",
                data.get("short_desc") or "",
                data.get("description") or "",
                data.get("price") or "",
                json.dumps(data.get("media") or [], ensure_ascii=False),
                _now(),
                product_id,
            ),
        )
    return get_product(product_id)


def delete_product(product_id: int) -> bool:
    with _cursor() as cur:
        cur.execute("DELETE FROM products WHERE id = ?", (product_id,))
        deleted = cur.rowcount > 0
    return deleted


def count_products() -> int:
    with _cursor() as cur:
        return int(cur.execute("SELECT COUNT(*) FROM products").fetchone()[0])
