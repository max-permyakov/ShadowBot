export type MediaKind = "photo" | "video";

export interface MediaItem {
  type: MediaKind;
  url: string;
}

export type Section = "print" | "soft";

export interface Product {
  id: number;
  title: string;
  category: string;
  short_desc: string;
  description: string;
  price: string;
  media: MediaItem[];
  section: Section;
  created_at?: string;
  updated_at?: string;
}

/** Разделы каталога: 3D-печать и разработка ПО. */
export const SECTIONS: Array<{
  id: Section;
  label: string;
  short: string;
  emoji: string;
  categories: string[];
}> = [
  {
    id: "print",
    label: "3D-печать",
    short: "Печать",
    emoji: "🖨",
    categories: ["Фигурки", "Игрушки", "Полезное", "Подставки", "Подарки", "Другое"],
  },
  {
    id: "soft",
    label: "Разработка ПО",
    short: "Код",
    emoji: "💻",
    categories: ["Боты", "Сайты", "Мини-аппы", "Приложения", "Другое"],
  },
];

export const sectionOf = (s: Section) => SECTIONS.find((x) => x.id === s)!;

/* ---------- О мне ---------- */

export interface AboutWork {
  emoji: string;
  title: string;
  description: string;
  url: string;
}

export interface AboutData {
  intro: string;
  works: AboutWork[];
}

/** Fallback, пока /api/about недоступен. */
export const DEFAULT_ABOUT: AboutData = {
  intro:
    "Привет! Я Массимо 👋 Backend-разработчик и 3D-печатник из Краснодара. Пишу на C#, Python и JavaScript: боты, сайты, мини-аппы. А ещё люблю печатать на 3D-принтере — от фигурок до полезных вещей. Здесь можно заказать и то, и другое.",
  works: [
    {
      emoji: "🖨",
      title: "ShadowStore",
      description: "Этот магазин: Telegram-бот + мини-апп на React и Cloudflare Pages.",
      url: "https://github.com/max-permyakov/ShadowBot",
    },
    {
      emoji: "🎓",
      title: "Collegium",
      description: "Платформа для студентов колледжа: расписание, оценки, кружки.",
      url: "https://github.com/max-permyakov/Collegium",
    },
    {
      emoji: "🛒",
      title: "XenonStore",
      description: "Реалистичное e-commerce приложение с корзиной и заказами.",
      url: "https://github.com/max-permyakov/XenonStore",
    },
    {
      emoji: "💬",
      title: "MessengerWithAi",
      description: "Мессенджер с AI-ассистентом на базе Ollama. React + SignalR.",
      url: "https://github.com/max-permyakov/MessengerWithAi",
    },
    {
      emoji: "🤖",
      title: "TgBot-ollama-v2",
      description: "Telegram-бот с локальным LLM. Приватность-first, на aiogram.",
      url: "https://github.com/max-permyakov/TgBot-ollama-v2",
    },
    {
      emoji: "🐍",
      title: "Snake in Console",
      description: "Классическая змейка прямо в консоли C#. Экскурс в ретро.",
      url: "https://github.com/max-permyakov/Snake-in-Console-CS",
    },
    {
      emoji: "🌐",
      title: "Портфолио",
      description: "Личный сайт: кто я и что умею.",
      url: "https://max-permyakov.github.io/portfolio/",
    },
  ],
};

export interface AppConfig {
  owner_username: string;
}

export interface WhoAmI {
  is_admin: boolean;
  user_id?: number;
}

export const EMPTY_MEDIA_PLACEHOLDER = "🖨️";
