const test = require("node:test");
const assert = require("node:assert/strict");
const { requestPasswordReset, completePasswordReset, resetEmail, config, tokenHash, GENERIC_MESSAGE, INVALID_MESSAGE } = require("../server/password-reset.cjs");

function response() { return { status: 0, headers: {}, body: "", writeHead(status, headers) { this.status = status; this.headers = headers; }, end(body) { this.body = String(body || ""); } }; }
function req(ip = "127.0.0.1") { return { socket: { remoteAddress: ip } }; }
function baseDb(user = null) {
  const db = { sql: [], userByEmail: async () => user, query: async (text, params = []) => { db.sql.push({ text, params }); if (text.startsWith("SELECT bucket")) return { rows: [] }; return { rows: [] }; } };
  db.transaction = async (work) => work({ query: async (text, params = []) => { db.sql.push({ text, params, transaction: true }); return { rows: [] }; } });
  return db;
}

const account = { id: "user-1", email: "member@example.test", active: true, offboarded: false };

test("forgot password gives the same generic response for known and unknown emails", async () => {
  const previous = { key: process.env.RESEND_API_KEY, from: process.env.RESEND_FROM_EMAIL, base: process.env.APP_BASE_URL };
  Object.assign(process.env, { RESEND_API_KEY: "re_test", RESEND_FROM_EMAIL: "Altus CRM <noreply@crm.altuscorp.in>", APP_BASE_URL: "https://crm.altuscorp.in" });
  try {
    const sent = [];
    const known = response();
    await requestPasswordReset({ body: { email: account.email }, req: req(), res: known, db: baseDb(account), fetchImpl: async (url, options) => { sent.push({ url, options, body: JSON.parse(options.body) }); return { ok: true, json: async () => ({ id: "email-1" }) }; } });
    const unknown = response();
    await requestPasswordReset({ body: { email: "unknown@example.test" }, req: req("127.0.0.2"), res: unknown, db: baseDb(null), fetchImpl: async () => { throw new Error("must not send"); } });
    assert.equal(JSON.parse(known.body).message, GENERIC_MESSAGE);
    assert.equal(JSON.parse(unknown.body).message, GENERIC_MESSAGE);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].url, "https://api.resend.com/emails");
    assert.equal(sent[0].body.from, "Altus CRM <noreply@crm.altuscorp.in>");
    assert.match(sent[0].body.html, /https:\/\/crm\.altuscorp\.in\/reset-password\?token=/);
    assert.match(sent[0].body.text, /expires in 30 minutes/);
  } finally {
    for (const [name, value] of [["RESEND_API_KEY", previous.key], ["RESEND_FROM_EMAIL", previous.from], ["APP_BASE_URL", previous.base]]) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  }
});

test("reset email configuration rejects an untrusted sender domain", () => {
  const previous = { key: process.env.RESEND_API_KEY, from: process.env.RESEND_FROM_EMAIL, base: process.env.APP_BASE_URL };
  Object.assign(process.env, { RESEND_API_KEY: "re_test", RESEND_FROM_EMAIL: "Altus CRM <noreply@example.test>", APP_BASE_URL: "https://crm.altuscorp.in" });
  assert.equal(config(), null);
  for (const [name, value] of [["RESEND_API_KEY", previous.key], ["RESEND_FROM_EMAIL", previous.from], ["APP_BASE_URL", previous.base]]) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  const email = resetEmail({ recipient: "member@example.test", resetUrl: "https://crm.altuscorp.in/reset-password?token=fixture", ttl: 30 });
  assert.match(email.html, /member@example.test/);
  assert.match(email.text, /fixture/);
});

test("invalid password input is rejected before token use", async () => {
  const db = baseDb(account); const res = response();
  await completePasswordReset({ body: { token: "short", new_password: "short", confirm_password: "different" }, req: req(), res, db });
  assert.equal(res.status, 400);
  assert.equal(db.sql.length, 0);
});

test("valid reset updates credentials, revokes sessions, and consumes the token", async () => {
  const db = baseDb(account); const raw = "a".repeat(43); let used = false;
  db.transaction = async (work) => work({ query: async (text, params = []) => {
    db.sql.push({ text, params, transaction: true });
    if (text.startsWith("SELECT id,user_id")) return { rows: used ? [] : [{ id: "reset-1", user_id: account.id, token_hash: tokenHash(raw), expires_at: new Date(Date.now() + 60000), used_at: null }] };
    if (text.startsWith("UPDATE password_reset_tokens SET used_at=now() WHERE id")) { used = true; return { rows: [] }; }
    return { rows: [] };
  }});
  const first = response();
  await completePasswordReset({ body: { token: raw, new_password: "a-secure-password", confirm_password: "a-secure-password" }, req: req(), res: first, db });
  assert.equal(first.status, 200);
  assert.match(first.body, /password has been reset/);
  assert.ok(db.sql.some(({ text }) => text.includes("UPDATE credentials")));
  assert.ok(db.sql.some(({ text }) => text.includes("DELETE FROM sessions")));
  assert.ok(db.sql.some(({ text }) => text.includes("UPDATE password_reset_tokens SET used_at=now()")));
  const second = response();
  await completePasswordReset({ body: { token: raw, new_password: "a-secure-password", confirm_password: "a-secure-password" }, req: req(), res: second, db });
  assert.equal(second.status, 400);
  assert.equal(JSON.parse(second.body).error, INVALID_MESSAGE);
});

test("expired token is rejected and excessive requests are throttled", async () => {
  const expired = "b".repeat(43); const db = baseDb(account);
  db.transaction = async (work) => work({ query: async (text, params = []) => { db.sql.push({ text, params, transaction: true }); return text.startsWith("SELECT id,user_id") ? { rows: [{ id: "reset-2", user_id: account.id, token_hash: tokenHash(expired), expires_at: new Date(Date.now() - 60000), used_at: null }] } : { rows: [] }; }});
  const invalid = response(); await completePasswordReset({ body: { token: expired, new_password: "a-secure-password", confirm_password: "a-secure-password" }, req: req(), res: invalid, db });
  assert.equal(invalid.status, 400);
  const limitedDb = baseDb(null); limitedDb.query = async (text) => text.startsWith("SELECT bucket") ? { rows: [{ bucket: "password-reset:ip:127.0.0.1", n: 99, expires_at: new Date(Date.now() + 60000) }] } : { rows: [] };
  const limited = response(); await requestPasswordReset({ body: { email: account.email }, req: req(), res: limited, db: limitedDb, fetchImpl: async () => { throw new Error("must not send"); } });
  assert.equal(limited.status, 200);
  assert.equal(JSON.parse(limited.body).message, GENERIC_MESSAGE);
});

test("email delivery failure does not expose provider details or leave a live token", async () => {
  const previous = { key: process.env.RESEND_API_KEY, from: process.env.RESEND_FROM_EMAIL, base: process.env.APP_BASE_URL };
  Object.assign(process.env, { RESEND_API_KEY: "re_test", RESEND_FROM_EMAIL: "Altus CRM <noreply@crm.altuscorp.in>", APP_BASE_URL: "https://crm.altuscorp.in" });
  try {
    const db = baseDb(account); const res = response();
    await requestPasswordReset({ body: { email: account.email }, req: req(), res, db, fetchImpl: async () => { throw Object.assign(new Error("secret provider detail"), { code: "RESEND_500" }); } });
    assert.equal(res.status, 200);
    assert.doesNotMatch(res.body, /secret provider|RESEND_500|token=/);
    assert.ok(db.sql.some(({ text }) => text.startsWith("DELETE FROM password_reset_tokens")));
  } finally {
    for (const [name, value] of [["RESEND_API_KEY", previous.key], ["RESEND_FROM_EMAIL", previous.from], ["APP_BASE_URL", previous.base]]) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  }
});
