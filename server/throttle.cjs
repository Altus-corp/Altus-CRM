"use strict";

/* Ported from old Altus throttling rules. Counts are database-backed so a
   restart does not hand an attacker a fresh allowance. */
const WINDOW_MS = 15 * 60000;
const LIMITS = { account: 8, tenant: 150, ip: 100, global: 2000 };
const keyOf = (b) => b.kind + ":" + b.key;

async function blocked(q, table, buckets) {
  if (!buckets.length) return null;
  const keys = buckets.map(keyOf);
  const rows = (await q(`SELECT bucket, n, expires_at FROM ${table} WHERE bucket = ANY($1)`, [keys])).rows;
  const found = new Map(rows.map((row) => [row.bucket, row]));
  const now = Date.now();
  for (const bucket of buckets) {
    const row = found.get(keyOf(bucket));
    if (row && Number(row.n) >= LIMITS[bucket.kind] && now < Number(row.expires_at)) return { kind: bucket.kind, until: Number(row.expires_at) };
  }
  return null;
}

async function fail(q, table, buckets) {
  const now = Date.now();
  for (const bucket of buckets) await q(`INSERT INTO ${table} (bucket, n, expires_at) VALUES ($1, 1, $2) ON CONFLICT (bucket) DO UPDATE SET n = CASE WHEN ${table}.expires_at < $3 THEN 1 ELSE ${table}.n + 1 END, expires_at = $2`, [keyOf(bucket), now + WINDOW_MS, now]);
}

async function clear(q, table, buckets) { if (buckets.length) await q(`DELETE FROM ${table} WHERE bucket = ANY($1)`, [buckets.map(keyOf)]); }
async function prune(q, table) { await q(`DELETE FROM ${table} WHERE expires_at < $1`, [Date.now()]); }

module.exports = { WINDOW_MS, LIMITS, blocked, fail, clear, prune };
