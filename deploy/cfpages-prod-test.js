// Live test of the deployed Pages site (https://shadowbot-shop.pages.dev).
// BOT_TOKEN и ADMIN_IDS читаются с сервера через sshx (в печать не идут).
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const sshx = "C:\\Users\\maksi\\AppData\\Local\\Temp\\sshx\\sshx.js";
const sshPass = process.env.SSH_PASS || "";
if (!sshPass) { console.error("set SSH_PASS env"); process.exit(1); }
const out = execFileSync("node", [sshx, `echo ${sshPass} | sudo -S -p '' grep -E '^(BOT_TOKEN|ADMIN_IDS)=' /home/max/ShadowBot/.env`], { encoding: "utf8", timeout: 60000 });

let BOT_TOKEN = "", ADMIN_ID = null;
for (const l of out.split("\n")) {
  const m = l.match(/^(BOT_TOKEN|ADMIN_IDS)=(.*)$/);
  if (!m) continue;
  if (m[1] === "BOT_TOKEN") BOT_TOKEN = m[2].trim();
  else ADMIN_ID = Number(m[2].split(",")[0].trim());
}
if (BOT_TOKEN.length < 30 || !ADMIN_ID) { console.error("FAILED_READ_ENV"); process.exit(1); }

const BASE = "https://shadowbot-shop.pages.dev";

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

let failed = 0;
const check = (n, c, e) => (c ? console.log("PASS", n) : (failed++, console.error("FAIL", n, typeof e === "string" ? e.slice(0, 200) : JSON.stringify(e).slice(0, 200))));

(async () => {
  let r = await fetch(BASE + "/api/config");
  let cfg = await r.json();
  check("prod /api/config", r.status === 200 && cfg.owner_username?.length > 0, cfg);

  r = await fetch(BASE + "/api/products");
  const products = await r.json();
  check("prod /api/products", r.status === 200 && Array.isArray(products) && products.length >= 1, products);

  r = await fetch(BASE + "/api/whoami", {
    method: "POST",
    headers: { "X-Telegram-Init-Data": makeInitData(ADMIN_ID) },
  });
  const w = await r.json();
  check("prod whoami admin (real BOT_TOKEN)", r.status === 200 && w.is_admin === true, w);

  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  const form = new FormData();
  form.append("file", new Blob([png], { type: "image/png" }), "photo.png");
  r = await fetch(BASE + "/api/admin/upload", {
    method: "POST",
    headers: { "X-Telegram-Init-Data": makeInitData(ADMIN_ID) },
    body: form,
  });
  const up = await r.json();
  check("prod upload", r.status === 200 && up.type === "photo", up);

  if (up.url) {
    r = await fetch(BASE + up.url);
    check("prod media serve", r.status === 200 && r.headers.get("content-type") === "image/png");
  }

  r = await fetch(BASE + "/");
  const html = await r.text();
  check("prod SPA served", r.status === 200 && html.includes("<div"), { blob: false, len: html.length });

  console.log(failed === 0 ? "\nALL PROD TESTS PASSED" : `${failed} FAILED`);
  process.exit(failed ? 1 : 0);
})();
