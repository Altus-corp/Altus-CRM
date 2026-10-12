const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../server/security.cjs");
const { login } = require("../server/index.cjs");
const { Readable } = require("stream");

function request(body, headers = { "x-altus": "1" }) {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  req.headers = headers;
  req.socket = { remoteAddress: "127.0.0.1", encrypted: false };
  return req;
}

function response() {
  return { status: 0, headers: {}, body: "", writeHead(status, headers) { this.status = status; this.headers = headers; }, end(value) { this.body = String(value || ""); } };
}

test("login success creates a session cookie", async () => {
  const db = {
    throttleBlocked: async () => null,
    userByEmail: async () => ({ id: "u1", name: "Owner", email: "owner@example.invalid", role: "Owner", active: true, offboarded: false }),
    checkPassword: async () => true,
    throttleClear: async () => {},
    createSession: async () => "session-token",
  };
  const res = response();
  await login(request({ email: "owner@example.invalid", password: "correct" }), res, db);
  assert.equal(res.status, 200);
  assert.match(res.headers["Set-Cookie"], /crm_session=session-token/);
});

test("login failure returns one generic refusal", async () => {
  const db = { throttleBlocked: async () => null, userByEmail: async () => null, checkPassword: async () => false, throttleFail: async () => {} };
  const res = response();
  await login(request({ email: "unknown@example.invalid", password: "wrong" }), res, db);
  assert.equal(res.status, 401);
  assert.equal(JSON.parse(res.body).error, "That email and password do not match.");
});

test("cookie flags are HttpOnly and SameSite=Lax", () => {
  const cookie = S.sessionCookie({ socket: { encrypted: false } }, "token", 100);
  assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Lax/); assert.match(cookie, /Path=\//); assert.doesNotMatch(cookie, /Secure/);
});

test("CSRF rejection requires the Altus request header", () => {
  assert.equal(S.csrfValid({ headers: {} }), false);
  assert.equal(S.csrfValid({ headers: { "x-altus": "1" } }), true);
});

test("throttle limits preserve the four original buckets", () => {
  assert.deepEqual(S.throttle.LIMITS, { account: 8, tenant: 150, ip: 100, global: 2000 });
});
