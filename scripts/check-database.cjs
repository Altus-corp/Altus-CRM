"use strict";

require("../server/load-env.cjs")();
const { Client } = require("pg");

function targetFrom(value) {
  try {
    const url = new URL(value);
    return {
      host: url.hostname,
      port: url.port || "5432",
      database: url.pathname.replace(/^\//, "") || "postgres",
      ssl: url.hostname.endsWith(".supabase.co") || url.hostname.endsWith(".pooler.supabase.com"),
    };
  } catch {
    return null;
  }
}

async function check(name, value) {
  if (!value) {
    console.log(`${name}: missing`);
    return false;
  }

  const target = targetFrom(value);
  if (!target) {
    console.log(`${name}: invalid URL`);
    return false;
  }

  const client = new Client({
    connectionString: value,
    ...(target.ssl ? { ssl: { rejectUnauthorized: false } } : {}),
    connectionTimeoutMillis: 10000,
  });

  try {
    await client.connect();
    await client.query("SELECT 1");
    console.log(`${name}: connected (${target.host}:${target.port}/${target.database})`);
    return true;
  } catch (error) {
    console.log(`${name}: failed (${error.code || error.name || "unknown error"})`);
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}

(async () => {
  console.log("Altus CRM database connectivity check");
  const results = await Promise.all([check("CRM_PG_URL", process.env.CRM_PG_URL)]);
  if (!results.some(Boolean)) process.exitCode = 1;
})().catch((error) => {
  console.log(`check failed (${error.code || error.name || "unknown error"})`);
  process.exitCode = 1;
});
