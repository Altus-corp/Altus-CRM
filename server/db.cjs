"use strict";

let Pool;
try { ({ Pool } = require("pg")); } catch { Pool = null; }
const crypto = require("crypto");
const fs = require("fs");
const { passwordHash, sha, SESSION_SECONDS, throttle } = require("./security.cjs");

let supabaseSslWarningShown = false;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, role TEXT NOT NULL, active BOOLEAN NOT NULL DEFAULT true, offboarded BOOLEAN NOT NULL DEFAULT false, must_change_password BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS credentials (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, hash TEXT NOT NULL, salt TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at BIGINT NOT NULL, expires_at BIGINT NOT NULL, last_seen BIGINT NOT NULL, ip TEXT);
CREATE TABLE IF NOT EXISTS login_attempts (bucket TEXT PRIMARY KEY, n INTEGER NOT NULL, expires_at BIGINT NOT NULL);
CREATE INDEX IF NOT EXISTS login_attempts_expires ON login_attempts (expires_at);
`;

async function openDb(connectionString) {
  if (!Pool) throw new Error("The PostgreSQL driver is not installed. Review and approve: npm install pg");
  let ssl;
  let host;
  try {
    host = new URL(connectionString).hostname;
  } catch {
    // guardedDatabaseUrl validates application startup URLs before openDb is called.
  }
  const isSupabase = Boolean(host && (host.endsWith(".supabase.co") || host.endsWith(".pooler.supabase.com")));
  if (isSupabase) {
    const caPath = String(process.env.CRM_PG_CA_CERT || "").trim();
    if (caPath) {
      let ca;
      try { ca = fs.readFileSync(caPath); } catch { throw new Error("CRM_PG_CA_CERT could not be read."); }
      ssl = { ca, rejectUnauthorized: true };
    } else {
      ssl = { rejectUnauthorized: false };
      if (!supabaseSslWarningShown) {
        console.warn("Supabase PostgreSQL SSL certificate verification is not configured; set CRM_PG_CA_CERT to the downloaded project root CA certificate.");
        supabaseSslWarningShown = true;
      }
    }
  }
  const pool = new Pool({ connectionString, max: 10, ...(ssl ? { ssl } : {}) });
  await pool.query("SELECT 1");
  await pool.query(SCHEMA);
  const q = (text, params) => pool.query(text, params);
  const one = async (text, params) => (await q(text, params)).rows[0] || null;
  return {
    query: q,
    async userByEmail(email) { return one("SELECT id, name, email, role, active, offboarded, must_change_password FROM users WHERE lower(email) = $1", [email]); },
    async userById(id) { return one("SELECT id, name, email, role, active, offboarded, must_change_password FROM users WHERE id = $1", [id]); },
    async setPassword(id, password) { const salt = crypto.randomBytes(16).toString("hex"); await q("INSERT INTO credentials (user_id, hash, salt) VALUES ($1, $2, $3) ON CONFLICT (user_id) DO UPDATE SET hash = EXCLUDED.hash, salt = EXCLUDED.salt, updated_at = now()", [id, passwordHash(password, salt).toString("hex"), salt]); await q("UPDATE users SET must_change_password = false WHERE id = $1", [id]); },
    async checkPassword(id, password) { const row = id ? await one("SELECT hash, salt FROM credentials WHERE user_id = $1", [id]) : null; const got = passwordHash(password, row ? row.salt : "00000000000000000000000000000000"); if (!row) return false; const want = Buffer.from(row.hash, "hex"); return want.length === got.length && crypto.timingSafeEqual(want, got); },
    async createSession(id, ip) { const token = crypto.randomBytes(32).toString("base64url"); const now = Date.now(); await q("INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen, ip) VALUES ($1, $2, $3, $4, $5, $6)", [sha(token), id, now, now + SESSION_SECONDS * 1000, now, ip || null]); return token; },
    async sessionUser(token) { if (!token || token.length > 200) return null; const row = await one("SELECT s.user_id, s.expires_at, s.last_seen, u.active, u.offboarded FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1", [sha(token)]); if (!row) return null; const now = Date.now(); if (!row.active || row.offboarded || Number(row.expires_at) < now || now - Number(row.last_seen) > SESSION_SECONDS * 1000) { await q("DELETE FROM sessions WHERE token_hash = $1", [sha(token)]); return null; } if (now - Number(row.last_seen) > 60000) await q("UPDATE sessions SET last_seen = $1, expires_at = $2 WHERE token_hash = $3", [now, now + SESSION_SECONDS * 1000, sha(token)]); return row.user_id; },
    async dropSession(token) { await q("DELETE FROM sessions WHERE token_hash = $1", [sha(token)]); },
    async pruneSessions() { await q("DELETE FROM sessions WHERE expires_at < $1", [Date.now()]); },
    async throttleBlocked(buckets) { return throttle.blocked(q, "login_attempts", buckets); },
    async throttleFail(buckets) { return throttle.fail(q, "login_attempts", buckets); },
    async throttleClear(buckets) { return throttle.clear(q, "login_attempts", buckets); },
    async throttlePrune() { return throttle.prune(q, "login_attempts"); },
    async transaction(work) { const client = await pool.connect(); try { await client.query("BEGIN"); const result = await work(client); await client.query("COMMIT"); return result; } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; } finally { client.release(); } },
    async close() { await pool.end(); },
  };
}

module.exports = { openDb, SCHEMA };
