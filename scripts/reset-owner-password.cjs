"use strict";

require("../server/load-env.cjs")();

const crypto = require("crypto");
const readline = require("readline");
const { openDb } = require("../server/db.cjs");
const { passwordHash } = require("../server/security.cjs");

function readLine(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, (answer) => { rl.close(); resolve(answer.trim()); });
  });
}

function readHidden(prompt) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    stdout.write(prompt);
    let value = "";
    const onData = (chunk) => {
      const text = String(chunk);
      for (const char of text) {
        if (char === "\u0003") { stdin.setRawMode(false); stdin.pause(); resolve(null); return; }
        if (char === "\r" || char === "\n") {
          stdin.setRawMode(false); stdin.pause(); stdout.write("\n"); stdin.removeListener("data", onData); resolve(value); return;
        }
        if (char === "\b" || char === "\u007f") value = value.slice(0, -1);
        else value += char;
      }
    };
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

function guardedUrl() {
  const value = process.env.CRM_PG_URL;
  if (!value) return null;
  let url;
  try { url = new URL(value); } catch { return null; }
  if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== "5435" || url.pathname.replace(/^\//, "") !== "crm_dev") return null;
  return value;
}

let finished = false;
function finish(message, code) {
  if (finished) return;
  finished = true;
  console.log(message);
  process.exitCode = code;
}

async function main() {
  const connectionString = guardedUrl();
  if (!connectionString) { finish("guard failed", 3); return; }
  const email = (await readLine("Owner email: ")).toLowerCase();
  const password = await readHidden("New password: ");
  const confirmation = await readHidden("Repeat password: ");
  if (password !== null && password.length < 20) { finish("password too short (minimum 20)", 2); return; }
  if (password === null || password !== confirmation) { finish("passwords do not match", 2); return; }

  let db;
  try {
    db = await openDb(connectionString);
  } catch {
    finish("connection failed", 4);
    return;
  }
  try {
    const user = await db.userByEmail(email);
    if (!user) { finish("no such user", 5); return; }
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = passwordHash(password, salt).toString("hex");
    await db.query("INSERT INTO credentials (user_id, hash, salt) VALUES ($1, $2, $3) ON CONFLICT (user_id) DO UPDATE SET hash = EXCLUDED.hash, salt = EXCLUDED.salt, updated_at = now()", [user.id, hash, salt]);
    await db.query("UPDATE users SET must_change_password = true WHERE id = $1", [user.id]);
    await db.query("DELETE FROM sessions WHERE user_id = $1", [user.id]);
    finish("updated", 0);
  } catch {
    finish("unexpected error", 1);
  } finally {
    await db.close().catch(() => {});
  }
}

main().catch(() => finish("unexpected error", 1));
