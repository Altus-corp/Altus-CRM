"use strict";

const crypto = require("crypto");
const throttle = require("./throttle.cjs");

const SESSION_SECONDS = 30 * 86400;
const COOKIE = "crm_session";
const BUCKET_WORDS = { account: "This account", tenant: "Sign-in at this company", ip: "Sign-in from this address", global: "Sign-in on this server" };

function securityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
}

function cookies(req) {
  return Object.fromEntries(String(req.headers.cookie || "").split(/;\s*/).filter(Boolean).map((pair) => { const i = pair.indexOf("="); return [pair.slice(0, i), decodeURIComponent(pair.slice(i + 1))]; }));
}

function clientIp(req, config = {}) {
  const peer = req.socket.remoteAddress || "";
  if (!config.behindProxy || !config.trustedProxies?.has(peer)) return peer;
  const chain = String(req.headers["x-forwarded-for"] || "").split(",").map((s) => s.trim()).filter(Boolean);
  return chain.length ? chain[chain.length - 1] : "";
}

function forwardedAddressMissing(req, config = {}) {
  return !!config.behindProxy && config.trustedProxies?.has(req.socket.remoteAddress || "") && !clientIp(req, config);
}

function clientIsSecure(req, config = {}) { return config.behindProxy ? !!config.publicIsHttps : !!req.socket.encrypted; }
function sessionCookie(req, token, maxAge, config = {}) {
  const secure = clientIsSecure(req, config) ? "; Secure" : "";
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function sessionToken(req) { return cookies(req)[COOKIE] || ""; }
function sha(value) { return crypto.createHash("sha256").update(String(value)).digest("hex"); }
function safeEqual(a, b) { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); }
function passwordHash(password, salt) { return crypto.scryptSync(String(password).normalize("NFKC"), salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }); }

function accountBuckets(email) { return [{ kind: "account", key: email }, { kind: "tenant", key: "single" }]; }
function networkBuckets(req, config) { return [{ kind: "ip", key: clientIp(req, config) || "?" }, { kind: "global", key: "" }]; }

async function isThrottled(db, req, email, config) {
  return (await db.throttleBlocked(accountBuckets(email))) || (await db.throttleBlocked(networkBuckets(req, config)));
}

async function recordFailure(db, req, email, config) {
  await db.throttleFail(accountBuckets(email));
  await db.throttleFail(networkBuckets(req, config));
}

function csrfValid(req) { return req.headers["x-altus"] === "1"; }

module.exports = { COOKIE, SESSION_SECONDS, BUCKET_WORDS, securityHeaders, cookies, clientIp, forwardedAddressMissing, clientIsSecure, sessionCookie, sessionToken, sha, safeEqual, passwordHash, throttle, accountBuckets, networkBuckets, isThrottled, recordFailure, csrfValid };
