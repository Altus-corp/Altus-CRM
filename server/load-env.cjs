"use strict";

const fs = require("fs");
const path = require("path");

const KEYS = new Set(["CRM_PG_URL", "CRM_OWNER_EMAIL", "CRM_OWNER_PASSWORD"]);

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
    const match = line.match(/^(?:export\s+)?(CRM_PG_URL|CRM_OWNER_EMAIL|CRM_OWNER_PASSWORD)\s*=\s*(.*?)\s*$/);
    if (!match || !KEYS.has(match[1]) || process.env[match[1]] !== undefined) continue;
    let value = match[2];
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[match[1]] = value;
  }
}

function databaseTarget(value = process.env.CRM_PG_URL) {
  return { host: "127.0.0.1", port: "5435", database: "crm_dev", label: "127.0.0.1:5435/crm_dev", value };
}

function guardedDatabaseUrl(value = process.env.CRM_PG_URL) {
  const target = databaseTarget(value);
  if (!value) return { ok: false, code: "ENV_MISSING", reason: "missing CRM_PG_URL", target };
  let url;
  try { url = new URL(value); } catch { return { ok: false, code: "ENV_URL", reason: "CRM_PG_URL is not a valid URL", target }; }
  if (url.hostname !== target.host) return { ok: false, code: "ENV_HOST", reason: "CRM_PG_URL host must be 127.0.0.1", target };
  if (url.port !== target.port) return { ok: false, code: "ENV_PORT", reason: "CRM_PG_URL port must be 5435", target };
  if (url.pathname.replace(/^\//, "") !== target.database) return { ok: false, code: "ENV_DATABASE", reason: "CRM_PG_URL database must be crm_dev", target };
  return { ok: true, value, url, target };
}

function safeErrorCode(error) { return String(error?.code || error?.name || "UNKNOWN").replace(/[^A-Za-z0-9_.-]/g, "_"); }
function reportFailure(label, error, hint, target = databaseTarget()) {
  console.error(`${label} failed code=${safeErrorCode(error)} hint=${hint} target=${target.label}`);
}

module.exports = loadEnv;
module.exports.loadEnv = loadEnv;
module.exports.databaseTarget = databaseTarget;
module.exports.guardedDatabaseUrl = guardedDatabaseUrl;
module.exports.safeErrorCode = safeErrorCode;
module.exports.reportFailure = reportFailure;
