declare module "*.css";

interface Window {
  Telegram?: TelegramWebApp;
}

interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
}

interface TelegramWebApp {
  initData: string;
  platform: string;
  ready: () => void;
  expand: () => void;
}
