require("../server/load-env.cjs")();

const test = require("node:test");
const assert = require("node:assert/strict");
const { openDb } = require("../server/db.cjs");
const { login, route } = require("../server/index.cjs");

function request(body, headers = { "x-altus": "1" }) {
  const { Readable } = require("stream");
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  req.headers = headers; req.method = "POST"; req.url = "/api/login"; req.socket = { remoteAddress: "127.0.0.1", encrypted: false };
  return req;
}
function response() { return { status: 0, headers: {}, body: "", setHeader() {}, writeHead(status, headers) { this.status = status; this.headers = headers; }, end(body) { this.body = String(body || ""); } }; }

test("database login integration suite", async (t) => {
  if (!process.env.CRM_PG_URL) return t.skip("CRM_PG_URL not set in environment or .env.");
  if (/\.supabase\.co$|\.pooler\.supabase\.com$/.test(new URL(process.env.CRM_PG_URL).hostname)) throw new Error("Tests refuse Supabase targets.");
  const db = await openDb(process.env.CRM_PG_URL);
  if (!process.env.CRM_OWNER_EMAIL || !process.env.CRM_OWNER_PASSWORD) { await db.close(); return t.skip("CRM_OWNER_EMAIL and CRM_OWNER_PASSWORD are required in environment or .env."); }
  const email = String(process.env.CRM_OWNER_EMAIL).toLowerCase();
  const password = process.env.CRM_OWNER_PASSWORD;
  if (!password) { await db.close(); return t.skip("Set CRM_OWNER_PASSWORD only for the integration test process."); }
  const S = require("../server/security.cjs");
  await db.throttleClear(S.accountBuckets(email));
  await db.throttleClear(S.networkBuckets(request({ email, password })));
  await db.throttleClear(S.accountBuckets("throttle-test@example.invalid"));
  await db.throttleClear(S.networkBuckets(request({ email: "throttle-test@example.invalid", password: "wrong" })));
  const ok = response(); await login(request({ email, password }), ok, db);
  assert.equal(ok.status, 200); assert.match(ok.headers["Set-Cookie"], /HttpOnly/);
  const bad = response(); await login(request({ email, password: password + "-wrong" }), bad, db);
  assert.equal(bad.status, 401);
  for (let i = 0; i < 8; i++) { const attempt = response(); await login(request({ email: "throttle-test@example.invalid", password: "wrong" }), attempt, db); }
  const locked = response(); await login(request({ email: "throttle-test@example.invalid", password: "wrong" }), locked, db);
  assert.equal(locked.status, 429);
  const csrf = response(); await route(request({ email, password }, {}), csrf, db);
  assert.equal(csrf.status, 403);
  await db.close();
});
