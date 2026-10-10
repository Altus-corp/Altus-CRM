"use strict";

function isSupabaseUrl(value) {
  try { const host = new URL(value).hostname; return host.endsWith(".supabase.co") || host.endsWith(".pooler.supabase.com"); } catch { return false; }
}

function assertSupabaseWriteAllowed(value, label) {
  if (isSupabaseUrl(value) && process.env.ALLOW_SUPABASE_WRITE !== "1") throw new Error(`SUPABASE_WRITE_BLOCKED:${label}`);
}

async function auditScriptRun(db, script) {
  await db.query("INSERT INTO audit_log(id,occurred_at,action,entity_type,entity_id,new_value) VALUES($1,now(),'script.write_run','script',$2,$3)", [`audit-script-${Date.now()}-${Math.random().toString(36).slice(2)}`, script, process.env.CRM_OPERATOR || "unspecified"]);
}

module.exports = { isSupabaseUrl, assertSupabaseWriteAllowed, auditScriptRun };
