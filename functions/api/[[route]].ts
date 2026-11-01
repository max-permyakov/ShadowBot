/**
 * ShadowBot Shop API на Cloudflare Pages Functions.
 *
 * Полный порт FastAPI-сервера (server/main.py) на Workers:
 *  - хранилище товаров: KV `MEDIA` (ключ db:products);
 *  - медиа: KV `MEDIA` (ключи media:<имя>), раздача через /api/media/<имя>;
 *  - админ-авторизация: проверка initData от Telegram (HMAC-SHA256, WebCrypto)
 *    + сравнение user.id со списком ADMIN_IDS (env-переменная Pages).
 *
 * Роуты (полностью совместимы с прежним API и мини-аппом):
 *   GET    /api/config                — публичные настройки
 *   GET    /api/products              — каталог
 *   GET    /api/products/<id>         — карточка
 *   POST   /api/whoami                — кто я (для админ-режима UI)
 *   POST   /api/admin/products        — создать (201)
 *   PUT    /api/admin/products/<id>   — обновить
 *   DELETE /api/admin/products/<id>   — удалить
 *   POST   /api/admin/upload          — загрузить медиа (multipart/form-data)
 *   GET    /api/media/<имя>           — раздача медиа
 */

interface MediaItem {
  type: "photo" | "video";
  url: string;
}

interface Product {
  id: number;
  title: string;
  category: string;
  short_desc: string;
  description: string;
  price: string;
  media: MediaItem[];
  created_at: string;
  updated_at: string;
}

interface Store {
  next_id: number;
  items: Product[];
}

interface Env {
  /** KV: товары (db:products) + медиа (media:<имя>). */
  MEDIA: KVNamespace;
  /** Секрет Pages: токен бота от @BotFather. */
  BOT_TOKEN: string;
  /** Var Pages: юзернейм получателя заказов (без @). */
  OWNER_USERNAME: string;
  /**Var Pages: Telegram ID администраторов через запятую. */
  ADMIN_IDS: string;
}

interface FnCtx {
  request: Request;
  env: Env;
  params: { route?: string | string[] };
}

// ---------- лимиты (как в server/config.py; единый потолок KV-значения 25 МБ) ----------
const MAX_TITLE = 64;
const MAX_CATEGORY = 32;
const MAX_SHORT = 140;
const MAX_DESCRIPTION = 4000;
const MAX_PRICE = 32;
const MAX_MEDIA_ITEMS = 10;
const MAX_PHOTO_BYTES = 24 * 1024 * 1024; // 24 МБ (KV value ≤ 25 МБ)
const MAX_VIDEO_BYTES = 24 * 1024 * 1024; // 24 МБ (в FastAPI было 30, KV вмещает ≤ 25)
const PHOTO_EXTS = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
const VIDEO_EXTS = [".mp4", ".webm", ".mov", ".m4v"];
const MEDIA_URL_RE = /^\/api\/media\/[A-Za-z0-9._-]+$/;
const DEFAULT_CATEGORY = "Другое";

// ---------- демо-каталог (как в server/main.py) ----------
const DEMO_PRODUCTS = [
  {
    title: "Дракончик-ночник 🐉",
    category: "Фигурки",
    short_desc: "Светящийся дракончик для полки. Меняет цвет подсветки.",
    description:
      "Милая фигурка дракончика с LED-подсветкой внутри. " +
      "Печатается из PLA 12 часов, высота примерно 18 см. " +
      "Можно выбрать цвет: зелёный, красный или фиолетовый. " +
      "Работает от USB или батарейки.",
    price: "от 400 ₽",
    media: [] as MediaItem[],
  },
  {
    title: "Подставка для телефона",
    category: "Подставки",
    short_desc: "Крепкая подставка с местом для зарядки и карандашей.",
    description:
      "Универсальная подставка под телефон или планшет. " +
      "Есть отсек для кабеля и боксы для ручек. " +
      "Размер 14×9 см, не скользит по столу. " +
      "Цвет на выбор: чёрный, белый, оранжевый.",
    price: "от 150 ₽",
    media: [] as MediaItem[],
  },
  {
    title: "Мини-брелок с твоим именем",
    category: "Подарки",
    short_desc: "Любое имя и цвет, доставка на следующий день.",
    description:
      "Брелок для рюкзака или ключей с твоим именем. " +
      "Печать 40 минут, поэтому делаем за один день. " +
      "До 12 символов, варианты шрифта покажем в чате. " +
      "Идеально как подарок другу.",
    price: "от 100 ₽",
    media: [] as MediaItem[],
  },
];

// ---------- мелкие утилиты ----------
function nowIso(): string {
  return new Date().toISOString().replace(/\.\d+Z$/, "Z");
}

function json(
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

const notFound = (detail = "Not Found") => json({ detail }, 404);
const forbidden = () => json({ detail: "Только для администраторов" }, 403);

function randomId8(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------- парсинг query string (аналог urllib.parse.parse_qsl) ----------
function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function parsePairs(raw: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const part of raw.split("&")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    const k = eq === -1 ? part : part.slice(0, eq);
    const v = eq === -1 ? "" : part.slice(eq + 1);
    out.push([
      decodeURIComponentSafe(k.replace(/\+/g, " ")),
      decodeURIComponentSafe(v.replace(/\+/g, " ")),
    ]);
  }
  return out;
}

// ---------- initData: HMAC-SHA256 через WebCrypto ----------
function bufToHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Возвращает объект initData или null, если подпись неверна. */
async function validateInitData(
  raw: string,
  botToken: string,
): Promise<Record<string, unknown> | null> {
  if (!raw || !botToken) return null;
  try {
    const all = parsePairs(raw);
    const pairs = all
      .filter(([k]) => k !== "hash")
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const dataCheckString = pairs.map(([k, v]) => `${k}=${v}`).join("\n");
    const providedHash = all.find(([k]) => k === "hash")?.[1] ?? "";

    const enc = new TextEncoder();
    const subtle = crypto.subtle;
    // secret_key = HMAC_SHA256("WebAppData", BOT_TOKEN)
    const rootKey = await subtle.importKey(
      "raw",
      enc.encode("WebAppData"),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const secret = await subtle.sign("HMAC", rootKey, enc.encode(botToken));
    const key = await subtle.importKey(
      "raw",
      secret,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const calculated = bufToHex(
      await subtle.sign("HMAC", key, enc.encode(dataCheckString)),
    );
    if (!timingSafeEqualHex(calculated, providedHash)) return null;

    const data: Record<string, unknown> = {};
    for (const [k, v] of all) data[k] = v;
    for (const key of ["user", "receiver", "chat"]) {
      const v = data[key];
      if (typeof v === "string") {
        try {
          data[key] = JSON.parse(v);
        } catch {
          return null;
        }
      }
    }
    return data;
  } catch {
    return null;
  }
}

function adminIds(env: Env): Set<number> {
  const ids = new Set<number>();
  for (const chunk of (env.ADMIN_IDS ?? "").replace(/;/g, ",").split(",")) {
    const v = chunk.trim();
    if (/^\d+$/.test(v)) ids.add(Number(v));
  }
  return ids;
}

/** user.id из заголовка X-Telegram-Init-Data (или null). */
async function userIdFrom(
  request: Request,
  env: Env,
): Promise<number | null> {
  const raw = request.headers.get("X-Telegram-Init-Data") ?? "";
  if (!raw.trim()) return null;
  const data = await validateInitData(raw, env.BOT_TOKEN);
  if (!data) return null;
  const user = data.user as { id?: unknown } | undefined;
  const uid = Number(user?.id);
  return Number.isFinite(uid) ? uid : null;
}

async function requireAdmin(
  request: Request,
  env: Env,
): Promise<number | null> {
  const uid = await userIdFrom(request, env);
  if (uid === null || !adminIds(env).has(uid)) return null;
  return uid;
}

// ---------- «база данных» на KV ----------
function demoStore(): Store {
  const ts = nowIso();
  return {
    next_id: DEMO_PRODUCTS.length + 1,
    items: DEMO_PRODUCTS.map((demo, i) => ({
      id: i + 1,
      title: demo.title,
      category: demo.category || DEFAULT_CATEGORY,
      short_desc: demo.short_desc || "",
      description: demo.description || "",
      price: demo.price || "",
      media: demo.media,
      created_at: ts,
      updated_at: ts,
    })),
  };
}

async function loadStore(env: Env): Promise<Store> {
  const raw = await env.MEDIA.get<Store>("db:products", "json");
  return raw ?? demoStore();
}

async function saveStore(env: Env, store: Store): Promise<void> {
  await env.MEDIA.put("db:products", JSON.stringify(store));
}

/**
 * Загружает store; если ключа в KV ещё нет — сидирует демо-каталог
 * (аналог SEED_DEMO в FastAPI-версии).
 */
async function ensureStore(env: Env): Promise<Store> {
  const existing = await env.MEDIA.get<Store>("db:products", "json");
  if (existing) return existing;
  const seeded = demoStore();
  await saveStore(env, seeded);
  return seeded;
}

function validateProduct(
  data: Record<string, unknown>,
  errors: string[],
): Omit<Product, "id" | "created_at" | "updated_at"> | null {
  const title = data.title;
  if (typeof title !== "string" || title.trim().length === 0 || title.length > MAX_TITLE) {
    errors.push(`title: обязательное поле, не длиннее ${MAX_TITLE} символов`);
    return null;
  }

  const rawMedia = data.media ?? [];
  if (!Array.isArray(rawMedia)) {
    errors.push("media: должен быть массивом");
    return null;
  }
  if (rawMedia.length > MAX_MEDIA_ITEMS) {
    errors.push(`media: не более ${MAX_MEDIA_ITEMS} элементов`);
    return null;
  }
  const media: MediaItem[] = [];
  for (const item of rawMedia) {
    const m = item as Record<string, unknown>;
    if (!m || typeof m.type !== "string" || !["photo", "video"].includes(m.type)) {
      errors.push("media: type должен быть photo или video");
      return null;
    }
    if (typeof m.url !== "string" || !MEDIA_URL_RE.test(m.url)) {
      errors.push("media: url должен быть вида /api/media/<файл>");
      return null;
    }
    media.push({ type: m.type as "photo" | "video", url: m.url });
  }

  const checkStr = (key: string, value: unknown, max: number) => {
    if (value === undefined || value === null) return "";
    if (typeof value !== "string") {
      errors.push(`${key}: должен быть строкой`);
      return null;
    }
    if (value.length > max) {
      errors.push(`${key}: не длиннее ${max} символов`);
      return null;
    }
    return value;
  };

  const short_desc = checkStr("short_desc", data.short_desc, MAX_SHORT);
  if (short_desc === null) return null;
  const description = checkStr("description", data.description, MAX_DESCRIPTION);
  if (description === null) return null;
  const price = checkStr("price", data.price, MAX_PRICE);
  if (price === null) return null;

  let category = DEFAULT_CATEGORY;
  if (data.category !== undefined && data.category !== "" && data.category !== null) {
    const c = checkStr("category", data.category, MAX_CATEGORY);
    if (c === null) return null;
    if (c !== "") category = c;
  }

  return { title, category, short_desc, description, price, media };
}

// ---------- раздача медиа ----------
function contentTypeFor(name: string): string {
  const ext = name.slice(name.lastIndexOf(".")); // имена генерируются самим сервером
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".mp4":
      return "video/mp4";
    case ".webm":
      return "video/webm";
    case ".mov":
      return "video/quicktime";
    case ".m4v":
      return "video/x-m4v";
    default:
      return "application/octet-stream";
  }
}

// ---------- обработчик ----------
export const onRequest = async (ctx: FnCtx): Promise<Response> => {
  const { request, env, params } = ctx;
  const raw = params.route;
  const segs = (raw === undefined ? [] : Array.isArray(raw) ? raw : [raw]).map(s => decodeURIComponentSafe(s));
  const method = request.method.toUpperCase();

  try {
    // ---------- публичные ----------
    if (segs[0] === "config" && segs.length === 1 && method === "GET") {
      return json({
        owner_username: (env.OWNER_USERNAME ?? "").replace(/^@/, ""),
        admin_enabled: Boolean((env.ADMIN_IDS ?? "").trim()),
      });
    }

    if (segs[0] === "products" && method === "GET") {
      const store = await ensureStore(env);
      if (segs.length === 1) {
        return json([...store.items].sort((a, b) => b.id - a.id));
      }
      const id = Number(segs[1]);
      const product = store.items.find((p) => p.id === id);
      return product ? json(product) : notFound("Товар не найден");
    }

    if (segs[0] === "whoami" && segs.length === 1 && method === "POST") {
      const uid = await userIdFrom(request, env);
      return json({
        user_id: uid,
        is_admin: uid !== null && adminIds(env).has(uid),
      });
    }

    // ---------- медиа ----------
    if (segs[0] === "media" && method === "GET" && segs.length === 2) {
      const name = segs[1];
      if (!/^[A-Za-z0-9._-]+$/.test(name)) return notFound();
      const obj = await env.MEDIA.getWithMetadata<{ ct?: string }>(
        `media:${name}`,
        { type: "arrayBuffer" }, // binary! по умолчанию text — испортит бинарник (ef bf bd…)
      );
      if (!obj || obj.value === null) return notFound("Медиа не найдено");
      return new Response(obj.value, {
        headers: { "Content-Type": obj.metadata?.ct ?? contentTypeFor(name) },
      });
    }

    // ---------- админ ----------
    if (segs[0] === "admin") {
      const uid = await requireAdmin(request, env);
      if (uid === null) return forbidden();

      // POST /api/admin/products
      if (segs[1] === "products" && segs.length === 2 && method === "POST") {
        const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
        if (!body) return json({ detail: "Некорректный JSON" }, 400);
        const errors: string[] = [];
        const patch = validateProduct(body, errors);
        if (!patch) return json({ detail: errors.join("; ") }, 422);

        const store = await loadStore(env);
        const ts = nowIso();
        const product: Product = {
          id: store.next_id++,
          ...patch,
          created_at: ts,
          updated_at: ts,
        };
        store.items.push(product);
        await saveStore(env, store);
        return json(product, 201);
      }

      // PUT|DELETE /api/admin/products/<id>
      if (segs[1] === "products" && segs.length === 3 && (method === "PUT" || method === "DELETE")) {
        const id = Number(segs[2]);
        const store = await loadStore(env);
        const idx = store.items.findIndex((p) => p.id === id);
        if (idx === -1) return notFound("Товар не найден");

        if (method === "DELETE") {
          store.items.splice(idx, 1);
          await saveStore(env, store);
          return json({ ok: true });
        }

        const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
        if (!body) return json({ detail: "Некорректный JSON" }, 400);
        const errors: string[] = [];
        const patch = validateProduct(body, errors);
        if (!patch) return json({ detail: errors.join("; ") }, 422);
        const updated: Product = {
          ...store.items[idx],
          ...patch,
          updated_at: nowIso(),
        };
        store.items[idx] = updated;
        await saveStore(env, store);
        return json(updated);
      }

      // POST /api/admin/upload
      if (segs[1] === "upload" && segs.length === 2 && method === "POST") {
        const form = await request.formData().catch(() => null);
        if (!form) return json({ detail: "Ожидается multipart/form-data" }, 400);
        const file = form.get("file");
        if (!(file instanceof File)) return json({ detail: "Поле file обязательно" }, 400);

        const name = file.name ?? "";
        const dot = name.lastIndexOf(".");
        const ext = dot === -1 ? "" : name.slice(dot).toLowerCase();
        const isPhoto = PHOTO_EXTS.includes(ext);
        const isVideo = VIDEO_EXTS.includes(ext);
        if (!isPhoto && !isVideo) {
          return json(
            { detail: "Разрешены: jpg, png, webp, gif, mp4, webm, mov, m4v" },
            400,
          );
        }
        const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_PHOTO_BYTES;
        const blob = await file.arrayBuffer();
        if (blob.byteLength > maxBytes) {
          return json(
            {
              detail: `Файл больше лимита ${Math.floor(maxBytes / (1024 * 1024))} МБ. Сжми его, пожалуйста 🙏`,
            },
            413,
          );
        }
        const mediaName = `${randomId8()}${ext}`;
        await env.MEDIA.put(`media:${mediaName}`, blob, {
          metadata: { ct: contentTypeFor(mediaName) },
        });
        return json({ type: isVideo ? "video" : "photo", url: `/api/media/${mediaName}` });
      }
    }

    return notFound();
  } catch (e) {
    console.error(e);
    return json({ detail: "Внутренняя ошибка сервера" }, 500);
  }
};
