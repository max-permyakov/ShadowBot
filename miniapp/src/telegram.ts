import {
  init,
  mountBackButton,
  showBackButton,
  hideBackButton,
  onBackButtonClick,
  offBackButtonClick,
  miniAppReady,
  setMiniAppHeaderColor,
  setMiniAppBackgroundColor,
  setMiniAppBottomBarColor,
  openTelegramLink as sdkOpenTelegramLink,
  hapticFeedbackImpactOccurred,
  hapticFeedbackSelectionChanged,
  hapticFeedbackNotificationOccurred,
} from "@telegram-apps/sdk";

/** Работаем ли внутри Telegram (а не в обычном браузере). */
export function inTelegram(): boolean {
  const tg = (window as unknown as {
    Telegram?: { WebApp?: { platform?: string } };
  }).Telegram;
  const platform = tg?.WebApp?.platform;
  return !!platform && platform !== "unknown";
}

/**
 * Принудительно задаём тёмную палитру: записываем --tg-theme-* прямо в
 * inline-стили :root, чтобы TGUI всегда был тёмным даже если клиент светлый.
 */
const DARK_TOKENS: Record<string, string> = {
  "bg-color": "#0b0d12",
  "text-color": "#f2f4f8",
  "hint-color": "#8b93a7",
  "link-color": "#8f7bff",
  "button-color": "#7c5cff",
  "button-text-color": "#ffffff",
  "secondary-bg-color": "#13161d",
  "header-bg-color": "#0b0d12",
  "accent-text-color": "#8f7bff",
  "section-bg-color": "#14171f",
  "section-header-bg-color": "#14171f",
  "section-header-text-color": "#8b93a7",
  "subtitle-text-color": "#aab1c2",
  "destructive-text-color": "#ff6b6b",
};

/** Токены, которые напрямую читает Telegram UI kit. */
const TGUI_TOKENS: Record<string, string> = {
  "bg_color": "#0b0d12",
  "text_color": "#f2f4f8",
  "hint_color": "#8b93a7",
  "link_color": "#8f7bff",
  "button_color": "#7c5cff",
  "button_text_color": "#ffffff",
  "secondary_bg_color": "#13161d",
  "tertiary_bg_color": "#171b26",
  "quartenary_bg_color": "#1a1e28",
  "header_bg_color": "#0b0d12",
  "accent_text_color": "#8f7bff",
  "section_bg_color": "#14171f",
  "section_header_bg_color": "#14171f",
  "section_header_text_color": "#8b93a7",
  "secondary_hint_color": "#7a8195",
  "subtitle_text_color": "#aab1c2",
  "destructive_text_color": "#ff6b6b",
  "card_bg_color": "#14171f",
};

export function forceDarkTheme(): void {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(DARK_TOKENS)) {
    root.style.setProperty(`--tg-theme-${key}`, value);
  }
  for (const [key, value] of Object.entries(TGUI_TOKENS)) {
    root.style.setProperty(`--tgui--${key}`, value);
  }
  root.style.colorScheme = "dark";
}

interface TgWebApp {
  ready?: () => void;
  expand?: () => void;
}
export function tgWebApp(): TgWebApp | null {
  return (
    (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram
      ?.WebApp ?? null
  );
}

function safe(fn: () => unknown): void {
  try {
    fn();
  } catch (err) {
    console.debug("[telegram]", err);
  }
}

/** Инициализация SDK + готовность мини-аппа. Безопасна вне Telegram. */
export function setupTelegram(): void {
  safe(() => init());
  forceDarkTheme();
  safe(() => mountBackButton());
  safe(() => setMiniAppHeaderColor("#0b0d12"));
  safe(() => setMiniAppBackgroundColor("#0b0d12"));
  safe(() => setMiniAppBottomBarColor("#0b0d12"));
  const app = tgWebApp();
  if (app) {
    safe(() => app.ready?.());
    safe(() => app.expand?.());
  }
  safe(() => void miniAppReady());
}

/* ---------- Кнопка «назад» ---------- */

let backHandler: (() => void) | null = null;

export function showBack(handler: () => void): void {
  safe(() => showBackButton());
  if (backHandler) {
    safe(() => offBackButtonClick(backHandler as () => void));
  }
  backHandler = handler;
  safe(() => onBackButtonClick(handler));
}

export function hideBack(): void {
  safe(() => hideBackButton());
  if (backHandler) {
    const handler = backHandler;
    backHandler = null;
    safe(() => offBackButtonClick(handler));
  }
}

/* ---------- Хаптика ---------- */

export function hapticSelect(): void {
  safe(() => void hapticFeedbackSelectionChanged());
}
export function hapticImpact(): void {
  safe(() => void hapticFeedbackImpactOccurred("light"));
}
export function hapticNotify(kind: "success" | "warning" | "error"): void {
  safe(() => void hapticFeedbackNotificationOccurred(kind));
}

/* ---------- Ссылки ---------- */

export function openTelegramLink(url: string): void {
  if (inTelegram()) {
    safe(() => void sdkOpenTelegramLink(url));
  } else {
    window.open(url, "_blank", "noopener");
  }
}

/** Внешние http(s)-сайты: через openLink внутри Telegram, иначе window.open. */
export function openExternalLink(url: string): void {
  if (inTelegram()) {
    const tg = (window as unknown as {
      Telegram?: { WebApp?: { openLink?: (u: string) => void } };
    }).Telegram;
    if (tg?.WebApp?.openLink) {
      safe(() => tg.WebApp!.openLink!(url));
      return;
    }
  }
  window.open(url, "_blank", "noopener");
}
