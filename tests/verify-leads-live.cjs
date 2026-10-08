"use strict";

require("../server/load-env.cjs")();

const crypto = require("crypto");
const http = require("http");
const net = require("net");
const { spawn } = require("child_process");
const { openDb } = require("../server/db.cjs");
const { passwordHash } = require("../server/security.cjs");
const { LEAD_VIEWS } = require("../server/index.cjs");

const urlText = process.env.CRM_PG_URL;
if (!urlText) {
  console.error("CRM_PG_URL not set");
  process.exit(1);
}

let pgUrl;
try {
  pgUrl = new URL(urlText);
} catch {
  console.error("guard failed");
  process.exit(1);
}

const hostOk = pgUrl.hostname === "127.0.0.1" || pgUrl.hostname === "localhost";
const portOk = pgUrl.port === "5435";
const database = pgUrl.pathname.replace(/^\//, "");
if (!hostOk || !portOk || database !== "crm_dev") {
  console.error("guard failed");
  process.exit(1);
}
console.log("guard ok");

const root = new URL("http://127.0.0.1");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function pass(name, ok, details = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${details ? ` ${details}` : ""}`);
  return ok;
}

function request(method, port, pathname, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: root.hostname, port, path: pathname, method, headers }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    if (body !== undefined) req.write(JSON.stringify(body));
    req.end();
  });
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const port = probe.address().port;
      probe.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForHealth(port, child) {
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error("server exited before health check");
    try {
      const response = await request("GET", port, "/api/health");
      if (response.status === 200) return response;
    } catch {}
    await sleep(100);
  }
  throw new Error("health check timed out");
}

function stop(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null) return resolve();
    const timer = setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 3000);
    child.once("exit", () => { clearTimeout(timer); resolve(); });
    child.kill("SIGTERM");
  });
}

async function main() {
  const db = await openDb(urlText);
  const userId = `live-verify-${crypto.randomUUID()}`;
  const email = `${userId}@example.invalid`;
  const password = crypto.randomBytes(32).toString("base64url");
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = passwordHash(password, salt).toString("hex");
  let child;
  let cleanupOk = false;

  try {
    const counts = new Map();
    const all = await db.query("SELECT count(*)::int AS count FROM leads");
    counts.set("all", all.rows[0].count);
    console.log(`All Leads ${all.rows[0].count}`);
    for (const [name, predicate] of Object.entries(LEAD_VIEWS)) {
      const result = await db.query(`SELECT count(*)::int AS count FROM leads l WHERE ${predicate}`);
      const count = result.rows[0].count;
      counts.set(name, count);
      console.log(`${name} ${count}`);
    }

    const total = counts.get("all");
    const granted = counts.get("permission_granted");
    const pending = counts.get("permission_pending");
    const prePs = counts.get("pre_ps");
    const prePso = counts.get("pre_pso");
    const duringPso = counts.get("during_pso");
    pass("Pre PS count > 0", prePs > 0, `count=${prePs}`);
    pass("Permission granted + pending = 817", granted + pending === 817, `granted=${granted} pending=${pending} total=${total}`);
    pass("Pre PSO + During PSO", prePso + duringPso > 0, `pre_pso=${prePso} during_pso=${duringPso} combined=${prePso + duringPso}`);
    pass("No view count is negative or null", [...counts.values()].every((count) => Number.isInteger(count) && count >= 0));

    await db.query("INSERT INTO users (id, name, email, role) VALUES ($1, $2, $3, $4)", [userId, "Live verification user", email, "Viewer"]);
    await db.query("INSERT INTO credentials (user_id, hash, salt) VALUES ($1, $2, $3)", [userId, hash, salt]);

    const port = await freePort();
    const childEnv = { ...process.env, CRM_PORT: String(port), CRM_HOST: "127.0.0.1" };
    child = spawn(process.execPath, ["server/index.cjs"], { cwd: process.cwd(), env: childEnv, stdio: "ignore" });
    const health = await waitForHealth(port, child);
    pass("GET /api/health", health.status === 200, `status=${health.status}`);

    const noSession = await request("GET", port, "/api/leads");
    pass("GET /api/leads without session", noSession.status === 401, `status=${noSession.status}`);

    const login = await request("POST", port, "/api/login", { email, password }, { "Content-Type": "application/json", "x-altus": "1" });
    pass("POST /api/login", login.status === 200, `status=${login.status}`);
    if (login.status !== 200) throw new Error("throwaway login failed");
    const cookie = String(login.headers["set-cookie"]?.[0] || "").split(";")[0];
    const auth = { Cookie: cookie };

    const list = await request("GET", port, "/api/leads", undefined, auth);
    let listBody = {};
    try { listBody = JSON.parse(list.body); } catch {}
    pass("GET /api/leads with session", list.status === 200, `status=${list.status} rows=${Array.isArray(listBody.items) ? listBody.items.length : 0} total=${Number.isInteger(listBody.total) ? listBody.total : "invalid"}`);

    const capped = await request("GET", port, "/api/leads?page_size=101", undefined, auth);
    let cappedBody = {};
    try { cappedBody = JSON.parse(capped.body); } catch {}
    pass("pageSize/limit above 100 capped to 100", capped.status === 200 && cappedBody.page_size === 100, `status=${capped.status} rows=${Array.isArray(cappedBody.items) ? cappedBody.items.length : 0}`);

    const invalidSort = await request("GET", port, "/api/leads?sort=not_a_real_field", undefined, auth);
    pass("invalid sort rejected", invalidSort.status >= 400 && invalidSort.status < 500, `status=${invalidSort.status}`);

    const firstId = Array.isArray(listBody.items) && listBody.items[0] ? listBody.items[0].id : null;
    if (!firstId) throw new Error("lead list returned no id");
    const detail = await request("GET", port, `/api/leads/${encodeURIComponent(firstId)}`, undefined, auth);
    let detailBody = {};
    try { detailBody = JSON.parse(detail.body); } catch {}
    pass("GET /api/leads/:id", detail.status === 200, `status=${detail.status} keys=${Object.keys(detailBody).sort().join(",")}`);

    const missing = await request("GET", port, "/api/leads/__live_verify_missing__", undefined, auth);
    pass("GET /api/leads/<nonexistent id>", missing.status === 404, `status=${missing.status}`);
  } finally {
    if (child) await stop(child);
    try {
      await db.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
      await db.query("DELETE FROM users WHERE id = $1", [userId]);
      cleanupOk = true;
    } catch {}
    await db.close();
    console.log(cleanupOk ? "cleanup ok" : "cleanup failed");
  }
}

main().catch((error) => {
  console.error(`verification failed: ${error.message}`);
  process.exitCode = 1;
});
