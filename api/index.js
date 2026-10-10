import server from "../server/index.cjs";
import databaseModule from "../server/db.cjs";
import envModule from "../server/load-env.cjs";

const { route } = server;
const { openDb } = databaseModule;
const { databaseConnectionString, guardedDatabaseUrl } = envModule;

let dbPromise;

function database() {
  if (!dbPromise) {
    const checked = guardedDatabaseUrl(databaseConnectionString());
    if (!checked.ok) throw new Error(`Database configuration failed: ${checked.code}`);
    dbPromise = openDb(checked.value);
  }
  return dbPromise;
}

function restoreApiPath(req) {
  const url = new URL(req.url || "/api/index", "http://localhost");
  const path = url.searchParams.get("path");
  if (!path) return;
  url.searchParams.delete("path");
  req.url = `/api/${path}${url.search ? `?${url.searchParams.toString()}` : ""}`;
}

export default async function handler(req, res) {
  try {
    restoreApiPath(req);
    await route(req, res, await database());
  } catch (error) {
    console.error(`request failed method=${req.method} code=${error?.code || error?.name || "unknown"}`);
    if (!res.headersSent) res.writeHead(error?.status || 500, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    if (!res.writableEnded) res.end(JSON.stringify({ error: error?.status ? error.message : "Request failed." }));
  }
}
