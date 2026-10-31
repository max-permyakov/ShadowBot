"""ShadowBot Shop — лёгкий бот-дверь в мини-апп.

/start — приветствие + кнопка «Открыть магазин»
/id    — показывает твой Telegram ID (нужен.owner для списка ADMIN_IDS в .env)
"""
from __future__ import annotations

import asyncio
import logging
from pathlib import Path

from aiogram import Bot, Dispatcher, F
from aiogram.filters import CommandStart
from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
    WebAppInfo,
)

# .env лежит в корне репозитория
try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except ImportError:  # pragma: no cover
    pass

import os

BOT_TOKEN = os.getenv("BOT_TOKEN", "").strip()
MINIAPP_URL = os.getenv("MINIAPP_URL", "").strip()

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger("shadowbot-bot")


async def cmd_start(message: Message) -> None:
    kb_rows: list[list[InlineKeyboardButton]] = []
    if MINIAPP_URL:
        kb_rows.append(
            [
                InlineKeyboardButton(
                    text="🛍 Открыть магазин", web_app=WebAppInfo(url=MINIAPP_URL)
                )
            ]
        )
    kb = InlineKeyboardMarkup(inline_keyboard=kb_rows)
    webapp_line = (
        "\nНажми кнопку ниже и выбирай картинку — всё заказывается в пару тапов 🔥"
        if MINIAPP_URL
        else "\nСкоро тут появится кнопка магазина — попроси admin настроить MINIAPP_URL."
    )
    await message.answer(
        f"Привет, {message.from_user.first_name if message.from_user else 'друг'}! 👋\n"
        f"Я ShadowBot — помогаю заказать изделия с 3D-принтера."
        f"{webapp_line}",
        reply_markup=kb,
    )
    if message.from_user:
        log.info("start от %s (%s)", message.from_user.id, message.from_user.username)


async def cmd_id(message: Message) -> None:
    user = message.from_user
    uid = user.id if user else 0
    hint = (
        "✅ Ты уже есть в списке админов."
        if str(uid) in {i.strip() for i in os.getenv("ADMIN_IDS", "").split(",")}
        else "Чтобы стать админом: добавь этот ID в ADMIN_IDS в .env и перезапусти сервер."
    )
    await message.answer(f"🆔 Твой Telegram ID: <code>{uid}</code>\n{hint}")


async def on_button(message: Message) -> None:
    if message.text == "🆔 Мой ID":
        await cmd_id(message)


async def main() -> None:
    if not BOT_TOKEN:
        raise SystemExit("BOT_TOKEN не задан в .env")

    bot = Bot(token=BOT_TOKEN)
    dp = Dispatcher()
    dp.message.register(cmd_start, CommandStart())
    dp.message.register(cmd_id, F.text == "/id")
    dp.message.register(on_button, F.text == "🆔 Мой ID")

    log.info("Бот запущен 🚀")
    await bot.delete_webhook(drop_pending_updates=True)
    await dp.start_polling(bot, allowed_updates=["message"])


if __name__ == "__main__":
    asyncio.run(main())
