import type { AboutData, AppConfig, Product, Section, WhoAmI } from "./types";

/**
 * initData от Telegram для проверки прав админа на сервере.
 * Работает и в браузере (вне Telegram) — тогда просто пустая строка.
 */
function rawData(): string {
  const tg = (window as unknown as {
    Telegram?: { WebApp?: { initData?: string } };
  }).Telegram;
  try {
    return tg?.WebApp?.initData ?? "";
  } catch {
    return "";
  }
}

export function authHeaders(): Record<string, string> {
  const raw = rawData();
  return raw ? { "X-Telegram-Init-Data": raw } : {};
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { ...authHeaders(), ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { detail?: string };
      if (body?.detail) detail = body.detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}

// ---------- публичные ----------

export function getConfig(): Promise<AppConfig> {
  return request<AppConfig>("/api/config");
}

export function getProducts(): Promise<Product[]> {
  return request<Product[]>("/api/products").then(normalizeProducts);
}

/** Старые карточки без раздела считаем 3D-печатью. */
function normalizeProducts(list: Product[]): Product[] {
  for (const p of list) {
    p.section = (p.section ?? "print") as Section;
  }
  return list;
}

export function whoAmI(): Promise<WhoAmI> {
  return request<WhoAmI>("/api/whoami", { method: "POST" });
}

// ---------- админ ----------

const JSON_INIT = { "Content-Type": "application/json" };

export function createProduct(
  data: Omit<Product, "id" | "created_at" | "updated_at">,
): Promise<Product> {
  return request<Product>("/api/admin/products", {
    method: "POST",
    headers: JSON_INIT,
    body: JSON.stringify(data),
  });
}

export function updateProduct(
  id: number,
  data: Omit<Product, "id" | "created_at" | "updated_at">,
): Promise<Product> {
  return request<Product>(`/api/admin/products/${id}`, {
    method: "PUT",
    headers: JSON_INIT,
    body: JSON.stringify(data),
  });
}

export function deleteProduct(id: number): Promise<void> {
  return request<{ ok: true }>(`/api/admin/products/${id}`, {
    method: "DELETE",
  }).then(() => undefined);
}

/** Загружает медиа-файл, возвращает MediaItem (url вида /media/xxxx.jpg). */
export function uploadMedia(
  file: File,
): Promise<{ type: "photo" | "video"; url: string }> {
  const form = new FormData();
  form.append("file", file);
  return request<{ type: "photo" | "video"; url: string }>(
    "/api/admin/upload",
    { method: "POST", body: form },
  );
}

// ---------- О мне ----------

export function getAbout(): Promise<AboutData> {
  return request<AboutData>("/api/about").then(normalizeAbout);
}

function normalizeAbout(data: AboutData): AboutData {
  return {
    intro: typeof data.intro === "string" ? data.intro : "",
    works: Array.isArray(data.works) ? data.works : [],
  };
}

export function updateAbout(data: AboutData): Promise<AboutData> {
  return request<AboutData>("/api/admin/about", {
    method: "PUT",
    headers: JSON_INIT,
    body: JSON.stringify(data),
  });
}

// ---------- заказ ----------

const ORDER_EMOJI = ["🛍", "🔢", "💬"] as const;

export function buildOrderText(
  title: string,
  qty: number,
  comment: string,
): string {
  return [
    `${ORDER_EMOJI[0]} Заказ: ${title}`,
    `${ORDER_EMOJI[1]} Количество: ${qty}`,
    `${ORDER_EMOJI[2]} Комментарий: ${comment.trim() || "—"}`,
  ].join("\n");
}

export function orderLink(ownerUsername: string, orderText: string): string {
  return `https://t.me/${ownerUsername}?text=${encodeURIComponent(orderText)}`;
}
