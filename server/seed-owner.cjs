"use strict";

const crypto = require("crypto");
const { openDb } = require("./db.cjs");
const { assertSupabaseWriteAllowed, auditScriptRun } = require("./write-guard.cjs");

const MIN_PASSWORD_LENGTH = 8;

function ownerPassword() {
  const configured = process.env.CRM_OWNER_PASSWORD;
  if (configured !== undefined) {
    if (configured.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`CRM_OWNER_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    }
    return { value: configured, generated: false };
  }

  return {
    value: crypto.randomBytes(18).toString("base64url"),
    generated: true,
  };
}

async function main() {
  const url = process.env.CRM_PG_URL;
  if (!url) throw new Error("CRM_PG_URL is required.");
  assertSupabaseWriteAllowed(url, "seed-owner");

  const email = String(process.env.CRM_OWNER_EMAIL || "").trim().toLowerCase();
  if (!email) throw new Error("CRM_OWNER_EMAIL is required.");

  const role = String(process.env.CRM_OWNER_ROLE || "Owner").trim() || "Owner";
  const password = ownerPassword();
  const db = await openDb(url);

  try {
    await auditScriptRun(db, "seed-owner");
    const existing = await db.userByEmail(email);
    const owners = await db.query(
      "SELECT id FROM users WHERE role IN ('Owner', 'Super Admin') ORDER BY created_at ASC, id ASC"
    );
    const reusedOwner = !existing && owners.rows[0];
    const canonicalId = existing?.id || reusedOwner?.id || `owner-${crypto.randomBytes(8).toString("hex")}`;
    const name = String(process.env.CRM_OWNER_NAME || "Owner").trim() || "Owner";

    if (existing || reusedOwner) {
      await db.query(
        "UPDATE users SET name = $2, email = $3, role = $4, active = true, offboarded = false WHERE id = $1",
        [canonicalId, name, email, role]
      );
    } else {
      await db.query(
        "INSERT INTO users (id, name, email, role, active, offboarded) VALUES ($1, $2, $3, $4, true, false)",
        [canonicalId, name, email, role]
      );
    }

    await db.query("UPDATE users SET role = 'Admin' WHERE role = 'Owner' AND id <> $1", [canonicalId]);
    await db.setPassword(canonicalId, password.value);
    await db.query("DELETE FROM sessions WHERE user_id = $1", [canonicalId]);

    if (password.generated) {
      console.log(`Owner email: ${email}`);
      console.log(`Owner password: ${password.value}`);
    } else {
      console.log(`Owner updated: ${email}`);
    }
  } finally {
    await db.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Owner seed failed.");
    process.exitCode = 1;
  });
}
