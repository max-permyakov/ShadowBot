export type MediaKind = "photo" | "video";

export interface MediaItem {
  type: MediaKind;
  url: string;
}

export interface Product {
  id: number;
  title: string;
  category: string;
  short_desc: string;
  description: string;
  price: string;
  media: MediaItem[];
  created_at?: string;
  updated_at?: string;
}

export interface AppConfig {
  owner_username: string;
}

export interface WhoAmI {
  is_admin: boolean;
  user_id?: number;
}

export const CATEGORIES = [
  "Фигурки",
  "Игрушки",
  "Полезное",
  "Подставки",
  "Подарки",
  "Другое",
] as const;

export const EMPTY_MEDIA_PLACEHOLDER = "🖨️";
