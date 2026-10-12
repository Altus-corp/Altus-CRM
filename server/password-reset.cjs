"use strict";

const crypto = require("crypto");
const { passwordHash, sha } = require("./security.cjs");

const GENERIC_MESSAGE = "If an account exists for that email, we sent password reset instructions.";
const INVALID_MESSAGE = "This password reset link is invalid, expired, or already used.";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESET_WINDOW_MS = 15 * 60 * 1000;
const REQUEST_LIMITS = { ip: 8, account: 4 };
const COMPLETE_LIMITS = { ip: 12, token: 8 };

function normalizeEmail(value) { return String(value || "").trim().toLowerCase(); }
function validEmail(value) { return EMAIL_RE.test(normalizeEmail(value)); }
function validPassword(value) { return typeof value === "string" && value.length >= 12; }
function tokenHash(token) { return crypto.createHash("sha256").update(token).digest("hex"); }
function tokenId() { return `password-reset-${crypto.randomUUID()}`; }
function ttlMinutes() {
  const value = Number.parseInt(String(process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES || "30"), 10);
  return Number.isFinite(value) && value >= 5 && value <= 120 ? value : 30;
}
function config() {
  const base = String(process.env.APP_BASE_URL || process.env.CRM_PUBLIC_URL || "").trim().replace(/\/+$/, "");
  const from = String(process.env.RESEND_FROM_EMAIL || "").trim();
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  let parsed;
  try { parsed = new URL(base); } catch { parsed = null; }
  const fromMatch = from.match(/^(?:.*<)?\s*([^<>\s]+@[^<>\s]+)\s*>?$/);
  const sender = fromMatch?.[1]?.toLowerCase() || "";
  if (!apiKey || !parsed || !["https:", "http:"].includes(parsed.protocol) || !sender.endsWith("@crm.altuscorp.in")) return null;
  if (parsed.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(parsed.hostname)) return null;
  if (!["crm.altuscorp.in", "localhost", "127.0.0.1"].includes(parsed.hostname)) return null;
  return { base, from, apiKey, ttl: ttlMinutes() };
}

function genericResponse(res) {
  return json(res, 200, { message: GENERIC_MESSAGE });
}
function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}
function escapeHtml(value) {
  return String(value).replace(/[&<>\"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[character]));
}
function resetEmail({ recipient, resetUrl, ttl }) {
  const safeUrl = escapeHtml(resetUrl);
  const safeTtl = escapeHtml(`${ttl} minutes`);
  return {
    subject: "Reset your Altus CRM password",
    html: `<!doctype html><html><body style="margin:0;background:#f4f6f8;font-family:Arial,sans-serif;color:#152238"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" style="max-width:560px;background:#fff;border:1px solid #dfe5ec;border-radius:12px" cellpadding="0" cellspacing="0"><tr><td style="padding:28px"><p style="margin:0 0 22px;color:#e90035;font-size:12px;font-weight:700;letter-spacing:2px">ALTUS CRM</p><h1 style="margin:0 0 12px;font-size:24px">Reset your password</h1><p style="margin:0 0 24px;line-height:1.6">We received a request to reset the password for ${escapeHtml(recipient)}.</p><p style="margin:0 0 28px"><a href="${safeUrl}" style="display:inline-block;padding:13px 20px;border-radius:8px;background:#ed0038;color:#fff;text-decoration:none;font-weight:700">Reset password</a></p><p style="margin:0 0 12px;color:#58677a;font-size:13px;line-height:1.6">This link expires in ${safeTtl} and can be used only once.</p><p style="margin:0;color:#58677a;font-size:13px;line-height:1.6">If you did not request a password reset, you can safely ignore this email.</p></td></tr></table></td></tr></table></body></html>`,
    text: `Altus CRM password reset\n\nReset your password using this link:\n${resetUrl}\n\nThis link expires in ${ttl} minutes and can be used only once.\nIf you did not request a password reset, you can safely ignore this email.`,
  };
}

async function sendResendEmail({ apiKey, from, to, subject, html, text, fetchImpl = globalThis.fetch }) {
  if (typeof fetchImpl !== "function") throw Object.assign(new Error("Email transport unavailable."), { code: "EMAIL_TRANSPORT" });
  const response = await fetchImpl("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, to: [to], subject, html, text }), signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw Object.assign(new Error("Email provider rejected the request."), { code: `RESEND_${response.status}` });
  return response.json().catch(() => ({}));
}

async function transaction(db, work) { return typeof db.transaction === "function" ? db.transaction(work) : work(db); }
async function rateLimited(db, buckets, limits) {
  const keys = buckets.map((bucket) => `password-reset:${bucket.kind}:${bucket.key}`);
  const result = await db.query("SELECT bucket,n,expires_at FROM password_reset_attempts WHERE bucket=ANY($1)", [keys]);
  const found = new Map(result.rows.map((row) => [row.bucket, row]));
  const now = Date.now();
  return buckets.some((bucket, index) => { const row = found.get(keys[index]); return row && Number(row.n) >= limits[bucket.kind] && new Date(row.expires_at).getTime() > now; });
}
async function recordAttempts(db, buckets) {
  const now = Date.now();
  for (const bucket of buckets) {
    const key = `password-reset:${bucket.kind}:${bucket.key}`;
    await db.query("INSERT INTO password_reset_attempts(bucket,n,expires_at) VALUES($1,1,to_timestamp($2 / 1000.0)) ON CONFLICT(bucket) DO UPDATE SET n=CASE WHEN password_reset_attempts.expires_at < now() THEN 1 ELSE password_reset_attempts.n + 1 END,expires_at=to_timestamp($2 / 1000.0)", [key, now + RESET_WINDOW_MS]);
  }
}

async function requestPasswordReset({ body, req, res, db, fetchImpl = globalThis.fetch }) {
  const email = normalizeEmail(body?.email);
  const ip = String(req.socket?.remoteAddress || "unknown");
  if (!validEmail(email)) return genericResponse(res);
  const buckets = [{ kind: "ip", key: ip }, { kind: "account", key: sha(email) }];
  if (await rateLimited(db, buckets, REQUEST_LIMITS)) return genericResponse(res);
  await recordAttempts(db, buckets);
  const user = await db.userByEmail(email);
  if (!user || !user.active || user.offboarded) return genericResponse(res);
  const settings = config();
  if (!settings) {
    console.error("password reset email configuration unavailable");
    return genericResponse(res);
  }
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const id = tokenId();
  const hash = tokenHash(rawToken);
  await transaction(db, async (tx) => {
    await tx.query("UPDATE password_reset_tokens SET used_at=COALESCE(used_at,now()) WHERE user_id=$1 AND used_at IS NULL", [user.id]);
    await tx.query("INSERT INTO password_reset_tokens(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,now()+($4 * interval '1 minute'))", [id, user.id, hash, settings.ttl]);
  });
  const resetUrl = `${settings.base}/reset-password?token=${encodeURIComponent(rawToken)}`;
  const emailContent = resetEmail({ recipient: email, resetUrl, ttl: settings.ttl });
  try {
    await sendResendEmail({ apiKey: settings.apiKey, from: settings.from, to: email, ...emailContent, fetchImpl });
  } catch (error) {
    await db.query("DELETE FROM password_reset_tokens WHERE id=$1 AND used_at IS NULL", [id]).catch(() => {});
    console.error(`password reset email failed code=${error?.code || "unknown"}`);
  }
  return genericResponse(res);
}

async function completePasswordReset({ body, req, res, db }) {
  const token = String(body?.token || "");
  const password = body?.new_password;
  const confirmation = body?.confirm_password;
  if (token.length < 32 || token.length > 128 || !validPassword(password) || password !== confirmation) return json(res, 400, { error: "Enter a valid token and matching password of at least 12 characters." });
  const hash = tokenHash(token);
  const ip = String(req.socket?.remoteAddress || "unknown");
  const buckets = [{ kind: "ip", key: ip }, { kind: "token", key: hash }];
  if (await rateLimited(db, buckets, COMPLETE_LIMITS)) return json(res, 429, { error: INVALID_MESSAGE });
  await recordAttempts(db, buckets);
  try {
    await transaction(db, async (tx) => {
      const row = (await tx.query("SELECT id,user_id,token_hash,expires_at,used_at FROM password_reset_tokens WHERE token_hash=$1 FOR UPDATE", [hash])).rows[0];
      if (!row || row.used_at || new Date(row.expires_at).getTime() <= Date.now()) throw Object.assign(new Error("invalid token"), { code: "INVALID_RESET_TOKEN" });
      const salt = crypto.randomBytes(16).toString("hex");
      const passwordHashValue = passwordHash(password, salt).toString("hex");
      await tx.query("UPDATE credentials SET hash=$2,salt=$3,updated_at=now() WHERE user_id=$1", [row.user_id, passwordHashValue, salt]);
      await tx.query("UPDATE users SET must_change_password=false WHERE id=$1", [row.user_id]);
      await tx.query("DELETE FROM sessions WHERE user_id=$1", [row.user_id]);
      await tx.query("UPDATE password_reset_tokens SET used_at=now() WHERE id=$1 AND used_at IS NULL", [row.id]);
      await tx.query("UPDATE password_reset_tokens SET used_at=COALESCE(used_at,now()) WHERE user_id=$1 AND id<>$2 AND used_at IS NULL", [row.user_id, row.id]);
    });
    return json(res, 200, { message: "Your password has been reset. You can now sign in." });
  } catch (error) {
    if (error?.code === "INVALID_RESET_TOKEN") return json(res, 400, { error: INVALID_MESSAGE });
    return json(res, 500, { error: "Unable to reset the password right now." });
  }
}

module.exports = { GENERIC_MESSAGE, INVALID_MESSAGE, config, resetEmail, sendResendEmail, requestPasswordReset, completePasswordReset, tokenHash, validEmail, validPassword };
