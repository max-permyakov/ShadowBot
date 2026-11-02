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
  /** Полное описание для страницы проекта. */
  details?: string;
  /** Картинки: /api/media/<имя>. */
  media?: string[];
  /** Эмодзи-пасхалка, спрятанная на странице проекта (например 🐧). */
  egg?: string;
  /** Своё сообщение пасхалки (показывается при поимке вместо словаря). */
  eggText?: string;
}

/** Карточка модели с Printables (динамическая, в БД не хранится). */
export interface PwCard {
  id: string;
  name: string;
  summary: string;
  author: string;
  likes: number;
  downloads: number;
  cover: string;
  images: string[];
  url: string;
}

/** Страница витрины Printables. */
export interface PwPage {
  items: PwCard[];
  nextOffset: number;
}

export interface AboutData {
  intro: string;
  works: AboutWork[];
}

/** Сообщения пасхалок — эмодзи задаётся админом, текст живёт здесь. */
export const EGG_MS: Record<string, string> = {
  "🐧": "Tux одобряет — Linux внутри 🐧",
  "🐍": "Змейка живёт в консоли… питон её приютил 🐍",
  "☕": "Кофе сварен: +100 к компиляции ☕",
  "🔒": "VPN шепчет: DPI снова плачет 🔒",
  "👾": "Space Invaders в шкафу — digitize! 👾",
  "🎮": "Учебный режим: +50 XP 🎮",
  "🌙": "Ночной деплой — легенда MidnightCM 🌙",
};

/** Пасхалки собираются между страницами проектов. */
export const EGGS_KEY = "shadowstore_eggs";

export function eggsFound(): string[] {
  try {
    const raw = localStorage.getItem(EGGS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

/** Добавляет пасхалку в коллекцию и возвращает обновлённый список. */
export function addFoundEgg(egg: string): string[] {
  const eggs = eggsFound();
  if (!eggs.includes(egg)) eggs.push(egg);
  try {
    localStorage.setItem(EGGS_KEY, JSON.stringify(eggs));
  } catch {
    /* ignore */
  }
  return eggs;
}

/** Fallback, пока /api/about недоступен. */
export const DEFAULT_ABOUT: AboutData = {
  intro:
    "Привет! Я Макс 👋 Backend-разработчик и 3D-печатник из Краснодара. Пишу на C#, Python и JavaScript: боты, сайты, мини-аппы. А ещё люблю печатать на 3D-принтере — от фигурок до полезных вещей. Здесь можно заказать и то, и другое.",
  works: [
    {
      emoji: "🖨",
      title: "ShadowStore",
      description: "Этот магазин: Telegram-бот + мини-апп на React и Cloudflare Pages.",
      url: "https://github.com/max-permyakov/ShadowBot",
      details:
        "Магазин прямо в Telegram: карточки товаров с фото и видео, разделы каталога, заказы в чат владельцу и админ-CRUD прямо из приложения.\n\nСтек: React + Vite + telegram-ui на фронте, Cloudflare Pages Functions + KV на бэкенде, aiogram 3 для бота. Хостинг полностью бесплатный.",
      media: [],
      egg: "🔒",
    },
    {
      emoji: "🎓",
      title: "Collegium",
      description: "Платформа для студентов колледжа: расписание, оценки, кружки.",
      url: "https://github.com/max-permyakov/Collegium",
      details:
        "Всё в одном месте: расписание пар, успеваемость, кружки и объявления. Студенты заходят с телефона и видят только то, что нужно.\n\nСтек: ASP.NET Core (C#), Entity Framework, PostgreSQL, server-side рендеринг + Bootstrap.",
      media: [],
    },
    {
      emoji: "🛒",
      title: "XenonStore",
      description: "Реалистичное e-commerce приложение с корзиной и заказами.",
      url: "https://github.com/max-permyakov/XenonStore",
      details:
        "Магазин как настоящий: каталог, фильтры, корзина, оформление заказа, история. Тёмная тема и плавная анимация.\n\nСтек: frontend React + SCSS, бэкенд на ASP.NET Core. Реалистичный ценообраз и обработка изображений.",
      media: [],
      egg: "👾",
    },
    {
      emoji: "💬",
      title: "MessengerWithAi",
      description: "Мессенджер с AI-ассистентом на базе Ollama. React + SignalR.",
      url: "https://github.com/max-permyakov/MessengerWithAi",
      details:
        "Общение в реальном времени на SignalR: чаты, статусы доставки, тёмная тема. Внутри живёт AI-ассистент на локальной LLM через Ollama — не просто чат-бот, а полноценный собеседник со своей памятью.\n\nСтек: React (TypeScript), ASP.NET Core + SignalR, Ollama.",
      media: [],
    },
    {
      emoji: "🤖",
      title: "TgBot-ollama-v2",
      description: "Telegram-бот с локальным LLM. Приватность-first, на aiogram.",
      url: "https://github.com/max-permyakov/TgBot-ollama-v2",
      details:
        "Telegram-бот, который общается через локальную LLM (Ollama): ничего не уходит наружу, всё крутится на собственном сервере. Кастомные личности, память диалога, тонкая настройка характера персонажей.\n\nСтек: Python, aiogram 3, SQLite,",
      media: [],
      egg: "🐧",
    },
    {
      emoji: "🐍",
      title: "Snake in Console",
      description: "Классическая змейка прямо в консоли C#. Экскурс в ретро.",
      url: "https://github.com/max-permyakov/Snake-in-Console-CS",
      details:
        "Ретро-змейка без движков и unity — чистый C# и консольный рендеринг. Скроллинг, генерация еды, паузы, растущая сложность.\n\nХорошая стартовая точка для консольных приложений на .NET.",
      media: [],
      egg: "🐍",
    },
    {
      emoji: "🌐",
      title: "Портфолио",
      description: "Личный сайт: кто я и что умею.",
      url: "https://max-permyakov.github.io/portfolio/",
      details:
        "Одностраничный личный сайт: портфолио, контакты, тёмная тема. Развёрнут на GitHub Pages.\n\nАдаптивная вёрстка и аккуратные анимации.",
      media: [],
      egg: "☕",
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
