"use strict";

const { guardedDatabaseUrl, reportFailure, databaseTarget } = require("../server/load-env.cjs");
require("../server/load-env.cjs")();

const crypto = require("crypto");
const { Client } = require("pg");
const { assertSupabaseWriteAllowed, auditScriptRun } = require("../server/write-guard.cjs");

function mode() {
  const args = new Set(process.argv.slice(2));
  if (args.has("--dry-run") && args.has("--apply")) throw new Error("Choose one backfill mode.");
  if ([...args].some((arg) => !["--dry-run", "--apply"].includes(arg))) throw new Error("Unknown backfill mode.");
  return args.has("--apply") ? "apply" : "dry-run";
}

function accountId(normalizedName) {
  return `account-import-${crypto.createHash("sha256").update(normalizedName).digest("hex").slice(0, 24)}`;
}

function normalizedName(value) {
  return String(value || "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

async function counts(client) {
  const queries = {
    candidate_accounts: "SELECT count(DISTINCT lower(regexp_replace(trim(company), '\\s+', ' ', 'g')))::int AS count FROM leads WHERE NULLIF(trim(company), '') IS NOT NULL",
    candidate_contacts: "SELECT count(*)::int AS count FROM leads WHERE NULLIF(trim(company), '') IS NOT NULL",
    leads_no_company: "SELECT count(*)::int AS count FROM leads WHERE NULLIF(trim(company), '') IS NULL",
    duplicate_company_candidates: "SELECT count(*)::int AS count FROM (SELECT lower(regexp_replace(trim(company), '\\s+', ' ', 'g')) FROM leads WHERE NULLIF(trim(company), '') IS NOT NULL GROUP BY 1 HAVING count(*) > 1) candidates",
    duplicate_email_candidates: "SELECT count(*)::int AS count FROM (SELECT lower(trim(email)) FROM leads WHERE NULLIF(trim(email), '') IS NOT NULL GROUP BY 1 HAVING count(*) > 1) candidates",
    duplicate_phone_candidates: "SELECT count(*)::int AS count FROM (SELECT trim(phone) FROM leads WHERE NULLIF(trim(phone), '') IS NOT NULL GROUP BY 1 HAVING count(*) > 1) candidates",
  };
  const result = {};
  for (const [key, sql] of Object.entries(queries)) result[key] = Number((await client.query(sql)).rows[0].count);
  return result;
}

async function apply(client) {
  const rows = (await client.query("SELECT id,source_id,name,first_name,last_name,email,phone,alternate_phone,company,designation,owner_user_id FROM leads WHERE NULLIF(trim(company), '') IS NOT NULL ORDER BY id ASC")).rows;
  const accounts = new Map();
  for (const lead of rows) {
    const normalized = normalizedName(lead.company);
    const id = accountId(normalized);
    if (!accounts.has(normalized)) {
      accounts.set(normalized, id);
      await client.query("INSERT INTO accounts (id,source_id,name,normalized_name,owner_user_id) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (source_id) DO UPDATE SET name=EXCLUDED.name,normalized_name=EXCLUDED.normalized_name,owner_user_id=EXCLUDED.owner_user_id,updated_at=now()", [id, `company-${normalized}`, lead.company.trim(), normalized, lead.owner_user_id || null]);
    }
    const contactId = `contact-import-${lead.source_id || lead.id}`;
    await client.query("INSERT INTO contacts (id,source_id,account_id,name,first_name,last_name,email,phone,alternate_phone,designation) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (source_id) DO UPDATE SET account_id=EXCLUDED.account_id,name=EXCLUDED.name,first_name=EXCLUDED.first_name,last_name=EXCLUDED.last_name,email=EXCLUDED.email,phone=EXCLUDED.phone,alternate_phone=EXCLUDED.alternate_phone,designation=EXCLUDED.designation,updated_at=now()", [contactId, `lead-${lead.source_id || lead.id}`, accounts.get(normalized), lead.name, lead.first_name || null, lead.last_name || null, lead.email || null, lead.phone || null, lead.alternate_phone || null, lead.designation || null]);
    await client.query("INSERT INTO contact_leads (contact_id,lead_id,relationship,source_id) VALUES ($1,$2,'backfill',$3) ON CONFLICT (contact_id,lead_id) DO NOTHING", [contactId, lead.id, `lead-link-${lead.source_id || lead.id}`]);
  }
  return { accounts: accounts.size, contacts: rows.length, linked_leads: rows.length };
}

async function main() {
  const guarded = guardedDatabaseUrl();
  if (!guarded.ok) { reportFailure("backfill", { code: guarded.code }, guarded.reason, guarded.target); process.exitCode = 3; return; }
  try { assertSupabaseWriteAllowed(guarded.value, "backfill-accounts"); } catch (error) { reportFailure("backfill", { code: "SUPABASE_WRITE_BLOCKED" }, error.message, guarded.target); process.exitCode = 3; return; }
  const selectedMode = mode();
  const client = new Client({ connectionString: guarded.value });
  try {
    await client.connect();
    if (selectedMode === "dry-run") {
      console.log(JSON.stringify({ mode: selectedMode, ...(await counts(client)) }));
      return;
    }
    if (process.env.CRM_ACCOUNTS_BACKUP_CONFIRMED !== "1") { console.log("backup confirmation required"); process.exitCode = 4; return; }
    await client.query("BEGIN");
    try { await auditScriptRun(client, "backfill-accounts"); console.log(JSON.stringify({ mode: selectedMode, ...(await apply(client)) })); await client.query("COMMIT"); }
    catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
  } catch (error) { reportFailure("backfill", error, "Check PostgreSQL availability and credentials.", guarded.target); process.exitCode = 1; }
  finally { await client.end().catch(() => {}); }
}

main().catch((error) => { reportFailure("backfill", error, "Check the backfill arguments and PostgreSQL permissions.", databaseTarget()); process.exitCode = 1; });
