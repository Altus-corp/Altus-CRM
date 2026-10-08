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

  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?(CRM_PG_URL|CRM_OWNER_EMAIL|CRM_OWNER_PASSWORD)\s*=\s*(.*?)\s*$/);
    if (!match || !KEYS.has(match[1]) || process.env[match[1]] !== undefined) continue;
    let value = match[2];
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[match[1]] = value;
  }
}

module.exports = loadEnv;
