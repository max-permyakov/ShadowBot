// Integration test for functions/api on wrangler pages dev (http://127.0.0.1:8787).
// Mirrors deploy/cfpages-api-test (same set as the old FastAPI integration test).
const crypto = require("crypto");

const BASE = "http://127.0.0.1:8787";
const BOT_TOKEN = "123:TEST_TOKEN";
const ADMIN_ID = 1416853313;

function makeInitData(userId) {
  const user = { id: userId, first_name: "Test", username: "testadmin" };
  const params = new URLSearchParams();
  params.set("user", JSON.stringify(user));
  params.set("auth_date", String(Math.floor(Date.now() / 1000)));
  const pairs = [...params].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const dcs = pairs.map(([k, v]) => `${k}=${v}`).join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const hash = crypto.createHmac("sha256", secret).update(dcs).digest("hex");
  params.set("hash", hash);
  return params.toString();
}

const ADMIN_INIT = makeInitData(ADMIN_ID);
const ADMIN_H = { "X-Telegram-Init-Data": ADMIN_INIT };
const STRANGER_INIT = makeInitData(999000111);
const STRANGER_H = { "X-Telegram-Init-Data": STRANGER_INIT };

let failed = 0;
function check(name, cond, extra) {
  if (cond) console.log("PASS", name);
  else {
    failed++;
    console.error("FAIL", name, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : "");
  }
}

async function req(path, init = {}, headers = {}) {
  return fetch(BASE + path, { ...init, headers: { ...headers, ...(init.headers || {}) } });
}

(async () => {
  // конфиг
  let r = await req("/api/config");
  let c = await r.json();
  check("GET /api/config", r.status === 200 && c.owner_username === "Massimo_16" && c.admin_enabled === true, c);

  // каталог с демо-сидом
  r = await req("/api/products");
  let products = await r.json();
  check("GET /api/products seeds demo", r.status === 200 && Array.isArray(products) && products.length === 3, products);

  // карточка
  r = await req(`/api/products/${products[0].id}`);
  const card = await r.json();
  check("GET /api/products/:id", r.status === 200 && card.title === products[0].title, card);

  // whoami админ и посторонний
  r = await req("/api/whoami", { method: "POST" }, ADMIN_H);
  let w = await r.json();
  check("POST /api/whoami admin", r.status === 200 && w.is_admin === true, w);
  r = await req("/api/whoami", { method: "POST" }, STRANGER_H);
  w = await r.json();
  check("whoami stranger not admin", w.is_admin === false, w);
  r = await req("/api/whoami", { method: "POST" });
  w = await r.json();
  check("whoami anon", w.user_id === null && w.is_admin === false, w);

  // невалидная подпись админ-роута
  r = await req("/api/admin/products", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Telegram-Init-Data": ADMIN_INIT.slice(0, -4) + "dead" },
    body: JSON.stringify({ title: "X" }),
  });
  check("fake hash rejected 403", r.status === 403, await r.json());

  // посторонний не может создавать
  r = await req("/api/admin/products", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...STRANGER_H },
    body: JSON.stringify({ title: "X" }),
  });
  check("stranger create rejected 403", r.status === 403);

  // upload медиа (png 1x1)
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  const form = new FormData();
  form.append("file", new Blob([png], { type: "image/png" }), "photo.png");
  r = await req("/api/admin/upload", { method: "POST", body: form }, ADMIN_H);
  const up = await r.json();
  check("upload photo", r.status === 200 && up.type === "photo" && /^\/api\/media\/[a-f0-9]{16}\.png$/.test(up.url), up);

  // раздача медиа
  r = await req(up.url);
  check("GET media serve", r.status === 200 && r.headers.get("content-type") === "image/png");

  // create с медиа
  r = await req("/api/admin/products", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...ADMIN_H },
    body: JSON.stringify({ title: "Тест-товар", category: "Тест", price: "1 ₽", media: [{ type: "photo", url: up.url }] }),
  });
  const created = await r.json();
  check("admin create 201", r.status === 201 && created.id > 0 && created.media.length === 1, created);

  // валидация: длинный title
  r = await req("/api/admin/products", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...ADMIN_H },
    body: JSON.stringify({ title: "x".repeat(70) }),
  });
  check("too-long title 422", r.status === 422, await r.json());

  // чужой url в media
  r = await req("/api/admin/products", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...ADMIN_H },
    body: JSON.stringify({ title: "Ok", media: [{ type: "photo", url: "http://evil/x.png" }] }),
  });
  check("bad media url 422", r.status === 422, await r.json());

  // update
  r = await req(`/api/admin/products/${created.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...ADMIN_H },
    body: JSON.stringify({ title: "Тест-товар v2", price: "2 ₽" }),
  });
  const updated = await r.json();
  check("admin update", r.status === 200 && updated.title === "Тест-товар v2", updated);

  // delete
  r = await req(`/api/admin/products/${created.id}`, { method: "DELETE" }, ADMIN_H);
  let d = await r.json();
  check("admin delete", r.status === 200 && d.ok === true, d);

  r = await req(`/api/products/${created.id}`);
  check("deleted gone 404", r.status === 404);

  // SPA-статика
  r = await req("/");
  const html = await r.text();
  check("SPA index served", r.status === 200 && html.includes("<div"), { len: html.length });

  console.log(failed === 0 ? "\nALL TESTS PASSED" : `\n${failed} TEST(S) FAILED`);
  process.exit(failed ? 1 : 0);
})();
