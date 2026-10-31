"""ShadowBot Shop API — FastAPI сервер: CRUD товаров + приём медиа + статика мини-аппа."""
from __future__ import annotations

import re
import secrets
from contextlib import asynccontextmanager
from pathlib import Path

# Позволяет запускать и напрямую (python server/main.py), и через uvicorn
if __package__ in (None, ""):
    import sys

    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    __package__ = "server"

from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator

from . import config, db
from .telegram_auth import user_id_from

MEDIA_URL_RE = re.compile(r"^/media/[A-Za-z0-9._-]+$")

MAX_TITLE = 64
MAX_PRICE = 32
MAX_SHORT = 140
MAX_DESCRIPTION = 4000
MAX_MEDIA_ITEMS = 10


class MediaItemIn(BaseModel):
    type: str = Field(pattern="^(photo|video)$")
    url: str

    @field_validator("url")
    @classmethod
    def url_local(cls, v: str) -> str:
        if not MEDIA_URL_RE.match(v):
            raise ValueError("Ссылка на медиа должна быть вида /media/<файл>")
        return v


class ProductIn(BaseModel):
    title: str = Field(min_length=1, max_length=MAX_TITLE)
    category: str = Field(default="Другое", max_length=32)
    short_desc: str = Field(default="", max_length=MAX_SHORT)
    description: str = Field(default="", max_length=MAX_DESCRIPTION)
    price: str = Field(default="", max_length=MAX_PRICE)
    media: list[MediaItemIn] = Field(default_factory=list, max_length=MAX_MEDIA_ITEMS)


@asynccontextmanager
async def lifespan(_: FastAPI):
    db.init()
    if config.SEED_DEMO and db.count_products() == 0:
        for demo in DEMO_PRODUCTS:
            db.create_product(demo)
    yield
    db.close()


app = FastAPI(title="ShadowBot Shop API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


DEMO_PRODUCTS = [
    {
        "title": "Дракончик-ночник 🐉",
        "category": "Фигурки",
        "short_desc": "Светящийся дракончик для полки. Меняет цвет подсветки.",
        "description": (
            "Милая фигурка дракончика с LED-подсветкой внутри. "
            "Печатается из PLA 12 часов, высота примерно 18 см. "
            "Можно выбрать цвет: зелёный, красный или фиолетовый. "
            "Работает от USB или батарейки."
        ),
        "price": "от 400 ₽",
        "media": [],
    },
    {
        "title": "Подставка для телефона",
        "category": "Подставки",
        "short_desc": "Крепкая подставка с местом для зарядки и карандашей.",
        "description": (
            "Универсальная подставка под телефон или планшет. "
            "Есть отсек для кабеля и боксы для ручек. "
            "Размер 14×9 см, не скользит по столу. "
            "Цвет на выбор: чёрный, белый, оранжевый."
        ),
        "price": "от 150 ₽",
        "media": [],
    },
    {
        "title": "Мини-брелок с твоим именем",
        "category": "Подарки",
        "short_desc": "Любое имя и цвет, доставка на следующий день.",
        "description": (
            "Брелок для рюкзака или ключей с твоим именем. "
            "Печать 40 минут, поэтому делаем за один день. "
            "До 12 символов, варианты шрифта покажем в чате. "
            "Идеально как подарок другу."
        ),
        "price": "от 100 ₽",
        "media": [],
    },
]


def require_admin(request: Request) -> int:
    """Зависимость: только Telegram-пользователи из списка ADMIN_IDS."""
    user_id = user_id_from(request.headers)
    if user_id is None or user_id not in config.ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Только для администраторов")
    return user_id


# ---------- публичные эндпоинты ----------


@app.get("/api/config")
def api_config() -> JSONResponse:
    return JSONResponse(
        {
            "owner_username": config.OWNER_USERNAME,
            "admin_enabled": bool(config.ADMIN_IDS),
        }
    )


@app.get("/api/products")
def api_products() -> list[dict]:
    return db.list_products()


@app.get("/api/products/{product_id}")
def api_product(product_id: int) -> dict:
    product = db.get_product(product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="Товар не найден")
    return product


@app.post("/api/whoami")
def api_whoami(request: Request) -> dict:
    user_id = user_id_from(request.headers)
    return {
        "user_id": user_id,
        "is_admin": user_id is not None and user_id in config.ADMIN_IDS,
    }


# ---------- админ ----------


@app.post("/api/admin/products", status_code=201)
def api_create(product: ProductIn, _: int = Depends(require_admin)) -> dict:
    return db.create_product(product.model_dump())


@app.put("/api/admin/products/{product_id}")
def api_update(
    product_id: int, product: ProductIn, _: int = Depends(require_admin)
) -> dict:
    updated = db.update_product(product_id, product.model_dump())
    if updated is None:
        raise HTTPException(status_code=404, detail="Товар не найден")
    return updated


@app.delete("/api/admin/products/{product_id}")
def api_delete(product_id: int, _: int = Depends(require_admin)) -> dict:
    if not db.delete_product(product_id):
        raise HTTPException(status_code=404, detail="Товар не найден")
    return {"ok": True}


@app.post("/api/admin/upload")
async def api_upload(
    file: UploadFile = File(...), _: int = Depends(require_admin)
) -> dict:
    ext = Path(file.filename or "").suffix.lower()
    if ext in config.PHOTO_EXTS:
        kind, max_size = "photo", config.MAX_PHOTO_BYTES
    elif ext in config.VIDEO_EXTS:
        kind, max_size = "video", config.MAX_VIDEO_BYTES
    else:
        raise HTTPException(
            status_code=400,
            detail="Разрешены: jpg, png, webp, gif, mp4, webm, mov, m4v",
        )

    blob = await file.read()
    if len(blob) > max_size:
        raise HTTPException(
            status_code=413,
            detail=(
                f"Файл больше лимита {max_size // (1024 * 1024)} МБ. "
                "Сжми его, пожалуйста 🙏"
            ),
        )

    name = f"{secrets.token_hex(8)}{ext}"
    (config.MEDIA_DIR / name).write_bytes(blob)
    return {"type": kind, "url": f"{config.MEDIA_URL_PREFIX}/{name}"}


# ---------- статика: медиа и собранный мини-апп ----------

app.mount(
    config.MEDIA_URL_PREFIX,
    StaticFiles(directory=str(config.MEDIA_DIR), check_dir=True),
    name="media",
)

DIST_DIR = config.BASE_DIR / "miniapp" / "dist"


@app.get("/")
def api_index() -> FileResponse:
    index = DIST_DIR / "index.html"
    if not index.exists():
        return JSONResponse(
            {"detail": "Мини-апп не собран: выполни npm run build в miniapp/"},
            status_code=503,
        )
    return FileResponse(index)


# Доп. ассеты собранного фронтенда
if (DIST_DIR / "assets").exists():
    app.mount("/assets", StaticFiles(directory=str(DIST_DIR / "assets")), name="assets")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("server.main:app", host="127.0.0.1", port=int(__import__("os").getenv("PORT", "8000")))
