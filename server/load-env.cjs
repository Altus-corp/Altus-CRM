"use strict";

const fs = require("fs");
const path = require("path");

const KEYS = new Set(["CRM_PG_URL", "CRM_OWNER_EMAIL", "CRM_OWNER_PASSWORD", "CRM_PORT", "CRM_HOST", "CRM_STATIC", "CRM_BEHIND_PROXY", "CRM_PUBLIC_URL", "CRM_TRUSTED_PROXIES"]);

function loadEnv() {
  const file = path.resolve(__dirname, "..", ".env");
  let source;
  try {
    source = fs.readFileSync(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }

  source = source.replace(/^\uFEFF/, "");
  for (const rawLine of source.split(/\n/)) {
    const line = rawLine.replace(/\r$/, "").trim();
    const match = line.match(/^(?:export\s+)?(CRM_PG_URL|CRM_OWNER_EMAIL|CRM_OWNER_PASSWORD|CRM_PORT|CRM_HOST|CRM_STATIC|CRM_BEHIND_PROXY|CRM_PUBLIC_URL|CRM_TRUSTED_PROXIES)\s*=\s*(.*?)\s*$/);
    if (!match || !KEYS.has(match[1]) || process.env[match[1]] !== undefined) continue;
    let value = match[2];
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[match[1]] = value;
  }
}

function databaseConnectionString() {
  return process.env.CRM_PG_URL || "";
}

function databaseTarget(value = databaseConnectionString()) {
  try {
    const url = new URL(value);
    return { host: url.hostname, port: url.port || "5432", database: url.pathname.replace(/^\//, ""), label: `${url.hostname}:${url.port || "5432"}/${url.pathname.replace(/^\//, "") || "postgres"}`, value };
  } catch {
    return { host: "unset", port: "", database: "", label: "unset", value };
  }
}

function guardedDatabaseUrl(value = databaseConnectionString()) {
  const target = databaseTarget(value);
  if (!value) return { ok: false, code: "ENV_MISSING", reason: "missing CRM_PG_URL", target };
  let url;
  try { url = new URL(value); } catch { return { ok: false, code: "ENV_URL", reason: "PostgreSQL connection URL is not valid", target }; }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) return { ok: false, code: "ENV_PROTOCOL", reason: "Database URL must use postgres or postgresql", target };
  const local = url.hostname === "127.0.0.1" && url.port === "5435" && url.pathname.replace(/^\//, "") === "crm_dev";
  const supabase = url.hostname.endsWith(".supabase.co") || url.hostname.endsWith(".pooler.supabase.com");
  if (!local && !supabase) return { ok: false, code: "ENV_HOST", reason: "Database host must be local crm_dev or an approved Supabase host", target };
  if (supabase && !["5432", "6543"].includes(url.port || "5432")) return { ok: false, code: "ENV_PORT", reason: "Supabase PostgreSQL port must be 5432 or 6543", target };
  return { ok: true, value, url, target };
}

function safeErrorCode(error) { return String(error?.code || error?.name || "UNKNOWN").replace(/[^A-Za-z0-9_.-]/g, "_"); }
function reportFailure(label, error, hint, target = databaseTarget()) {
  console.error(`${label} failed code=${safeErrorCode(error)} hint=${hint} target=${target.label}`);
}

module.exports = loadEnv;
module.exports.loadEnv = loadEnv;
module.exports.databaseTarget = databaseTarget;
module.exports.databaseConnectionString = databaseConnectionString;
module.exports.guardedDatabaseUrl = guardedDatabaseUrl;
module.exports.safeErrorCode = safeErrorCode;
module.exports.reportFailure = reportFailure;
