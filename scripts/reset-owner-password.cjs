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

async function main() {
  const connectionString = guardedUrl();
  if (!connectionString) { process.exitCode = 1; return; }
  const email = (await readLine("Owner email: ")).toLowerCase();
  const password = await readHidden("New password: ");
  const confirmation = await readHidden("Repeat password: ");
  if (!email || password === null || password !== confirmation || password.length < 20) { process.exitCode = 1; return; }

  const db = await openDb(connectionString);
  try {
    const user = await db.userByEmail(email);
    if (!user) { console.log("no such user"); return; }
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = passwordHash(password, salt).toString("hex");
    await db.query("INSERT INTO credentials (user_id, hash, salt) VALUES ($1, $2, $3) ON CONFLICT (user_id) DO UPDATE SET hash = EXCLUDED.hash, salt = EXCLUDED.salt, updated_at = now()", [user.id, hash, salt]);
    await db.query("DELETE FROM sessions WHERE user_id = $1", [user.id]);
    console.log("updated");
  } finally {
    await db.close();
  }
}

main().catch(() => { process.exitCode = 1; });
