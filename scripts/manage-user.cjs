"use strict";

require("../server/load-env.cjs")();

const crypto = require("crypto");
const readline = require("readline");
const { openDb } = require("../server/db.cjs");
const { passwordHash } = require("../server/security.cjs");

const ALLOWED_ROLES = new Set(["Sales", "Viewer", "Admin"]);
let finished = false;

function finish(message, code) {
  if (finished) return;
  finished = true;
  console.log(message);
  process.exitCode = code;
}

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
      for (const char of String(chunk)) {
        if (char === "\u0003") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener("data", onData);
          resolve(null);
          return;
        }
        if (char === "\r" || char === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdout.write("\n");
          stdin.removeListener("data", onData);
          resolve(value);
          return;
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

function connectionString() {
  const value = process.env.CRM_PG_URL;
  if (!value) return null;
  let url;
  try { url = new URL(value); } catch { return null; }
  if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== "5435" || url.pathname.replace(/^\//, "") !== "crm_dev") return null;
  return value;
}

async function createUser(db) {
  const name = await readLine("Full name: ");
  const email = (await readLine("Email: ")).toLowerCase();
  const roleInput = await readLine("Role [Sales]: ");
  const role = roleInput || "Sales";
  if (!ALLOWED_ROLES.has(role)) { finish("role not allowed", 7); return; }
  const password = await readHidden("Password: ");
  const confirmation = await readHidden("Repeat password: ");
  if (password !== null && password.length < 12) { finish("password too short", 2); return; }
  if (password === null || password !== confirmation) { finish("passwords do not match", 2); return; }
  if (!name || !email) { finish("unexpected error", 1); return; }

  if (await db.userByEmail(email)) { finish("user exists", 6); return; }
  const userId = `user-${crypto.randomUUID()}`;
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = passwordHash(password, salt).toString("hex");
  await db.query("BEGIN");
  try {
    await db.query("INSERT INTO users (id, name, email, role, active, offboarded) VALUES ($1, $2, $3, $4, true, false)", [userId, name, email, role]);
    await db.query("INSERT INTO credentials (user_id, hash, salt) VALUES ($1, $2, $3)", [userId, hash, salt]);
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    throw error;
  }
  finish("created", 0);
}

async function deleteUser(db) {
  const email = (await readLine("Email: ")).toLowerCase();
  const confirmation = (await readLine("Type email again to confirm: ")).toLowerCase();
  if (!email || email !== confirmation) { finish("unexpected error", 1); return; }
  const user = await db.userByEmail(email);
  if (!user) { finish("no such user", 5); return; }
  if (user.role === "Owner") { finish("unexpected error", 1); return; }
  await db.query("BEGIN");
  try {
    await db.query("DELETE FROM credentials WHERE user_id = $1", [user.id]);
    await db.query("DELETE FROM sessions WHERE user_id = $1", [user.id]);
    await db.query("UPDATE users SET active = false, offboarded = true WHERE id = $1", [user.id]);
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    throw error;
  }
  finish("deleted", 0);
}

async function main() {
  const command = process.argv[2];
  if (command !== "create" && command !== "delete") { finish("unexpected error", 1); return; }
  const url = connectionString();
  if (!url) { finish("guard failed", 3); return; }
  let db;
  try {
    db = await openDb(url);
  } catch {
    finish("connection failed", 4);
    return;
  }
  try {
    if (command === "create") await createUser(db);
    else await deleteUser(db);
  } catch {
    finish("unexpected error", 1);
  } finally {
    await db.close().catch(() => {});
  }
}

main().catch(() => finish("unexpected error", 1));
