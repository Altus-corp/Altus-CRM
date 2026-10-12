"use strict";

const crypto = require("crypto");
const { assignLeadRoundRobin } = require("./lead-assignment.cjs");
const { writeAudit } = require("./audit.cjs");

const DEFAULT_MAPPING = Object.freeze({
  name: "name", email: "email", phone: "phone", company: "company", team: "team",
  lead_type: "lead_type", lead_source: "lead_source", source_ref: "source_ref",
});

function json(res, status, body) { res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(body)); }
function hash(value) { return crypto.createHash("sha256").update(String(value)).digest("hex"); }
function secret() { return crypto.randomBytes(32).toString("base64url"); }
function text(value, fallback = "") { return String(value ?? fallback).trim(); }
function nested(payload, path) { return String(path || "").split(".").reduce((value, key) => value && typeof value === "object" ? value[key] : undefined, payload); }
function readJson(req, limit = 16384) { return new Promise((resolve, reject) => { let size = 0; const chunks = []; req.on("data", (chunk) => { size += chunk.length; if (size > limit) reject(Object.assign(new Error("Request too large."), { status: 413 })); else chunks.push(chunk); }); req.on("end", () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}); } catch { reject(Object.assign(new Error("Invalid JSON."), { status: 400 })); } }); req.on("error", reject); }); }
function publicConnection(row, req) {
  const base = String(process.env.APP_BASE_URL || process.env.CRM_PUBLIC_URL || `${req.headers["x-forwarded-proto"] || "http"}://${req.headers.host || "localhost"}`).replace(/\/+$/, "");
  return { id: row.id, name: row.name, provider: row.provider, kind: row.kind, enabled: row.enabled, last_received_at: row.last_received_at, webhook_url: `${base}/api/integrations/${encodeURIComponent(row.id)}/leads` };
}
async function listConnections(res, db, req) {
  const rows = (await db.query("SELECT id,name,provider,kind,enabled,last_received_at FROM integration_connections ORDER BY name ASC,id ASC")).rows;
  return json(res, 200, { integrations: rows.map((row) => publicConnection(row, req)) });
}
async function createConnection(req, res, db, actor) {
  let body; try { body = await readJson(req); } catch { return json(res, 400, { error: "Invalid integration data." }); }
  const name = text(body.name); const provider = text(body.provider || "Website form");
  if (!name || name.length > 80 || !provider || provider.length > 80) return json(res, 400, { error: "Enter an integration name and provider." });
  const id = `integration-${crypto.randomUUID()}`; const rawSecret = secret();
  const mapping = body.field_mapping && typeof body.field_mapping === "object" ? body.field_mapping : DEFAULT_MAPPING;
  try {
    await db.query("INSERT INTO integration_connections(id,name,provider,kind,secret_hash,field_mapping,created_by) VALUES($1,$2,$3,'webhook',$4,$5::jsonb,$6)", [id, name, provider, hash(rawSecret), JSON.stringify(mapping), actor.id]);
    await writeAudit(db, { actorUserId: actor.id, action: "integration.created", entityType: "integration", entityId: id, newValue: provider, ip: req.socket.remoteAddress });
    const row = { id, name, provider, kind: "webhook", enabled: true, last_received_at: null };
    return json(res, 201, { integration: publicConnection(row, req), secret: rawSecret });
  } catch { return json(res, 500, { error: "Unable to create integration." }); }
}
async function toggleConnection(req, res, db, actor, id) {
  let body; try { body = await readJson(req); } catch { return json(res, 400, { error: "Invalid integration data." }); }
  const enabled = Boolean(body.enabled); const result = await db.query("UPDATE integration_connections SET enabled=$2,updated_at=now() WHERE id=$1 RETURNING id,name,provider,kind,enabled,last_received_at", [id, enabled]);
  if (!result.rows[0]) return json(res, 404, { error: "Integration not found." });
  await writeAudit(db, { actorUserId: actor.id, action: enabled ? "integration.enabled" : "integration.disabled", entityType: "integration", entityId: id, newValue: String(enabled), ip: req.socket.remoteAddress });
  return json(res, 200, { integration: publicConnection(result.rows[0], req) });
}
function integrationSecret(req) { const auth = text(req.headers["x-integration-secret"] || ""); return auth || text(String(req.headers.authorization || "").replace(/^Bearer\s+/i, "")); }
async function receiveLead(req, res, db, id) {
  const integration = (await db.query("SELECT id,name,provider,enabled,secret_hash,field_mapping FROM integration_connections WHERE id=$1", [id])).rows[0];
  if (!integration || !integration.enabled || !crypto.timingSafeEqual(Buffer.from(hash(integrationSecret(req))), Buffer.from(integration.secret_hash))) return json(res, 401, { error: "Invalid integration credentials." });
  let payload; try { payload = await readJson(req); } catch { return json(res, 400, { error: "Invalid lead data." }); }
  const mapping = { ...DEFAULT_MAPPING, ...(integration.field_mapping || {}) };
  const value = (field, fallback = "") => text(nested(payload, mapping[field]), fallback);
  const name = value("name"); if (!name) return json(res, 400, { error: "Lead name is required." });
  const email = value("email") || null; const phone = value("phone") || null; const sourceRef = value("source_ref") || null;
  try {
    const existing = (await db.query("SELECT id FROM leads WHERE ($1::text IS NOT NULL AND lower(email)=lower($1::text)) OR ($2::text IS NOT NULL AND phone=$2::text) OR ($3::text IS NOT NULL AND source_id=$3::text) ORDER BY id ASC LIMIT 1", [email, phone, sourceRef ? `${id}:${sourceRef}` : null])).rows[0];
    if (existing) return json(res, 200, { id: existing.id, duplicate: true });
    const leadId = `lead-${crypto.randomUUID()}`; const lead = { id: leadId, name, email, phone, company: value("company") || null, team: value("team") || null, lead_type: (value("lead_type", "DL") || "DL").toUpperCase(), lead_source: value("lead_source", integration.name) || integration.name, source_system: integration.provider, owner_user_id: null };
    await (typeof db.transaction === "function" ? db.transaction(async (tx) => {
      await tx.query("INSERT INTO leads(id,source_id,name,email,phone,company,team,lead_type,lead_source,source_system,priority,stage,permission,owner_user_id,custom_values,legacy_finance,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'lead','Pending',NULL,$12::jsonb,$13::jsonb,now())", [leadId, sourceRef ? `${id}:${sourceRef}` : `integration:${id}:${leadId}`, name, email, phone, lead.company, lead.team, lead.lead_type, lead.lead_source, lead.source_system, lead.lead_type === "QL" ? "P2" : lead.lead_type === "R" ? "P1" : "P3", JSON.stringify(payload), JSON.stringify({})]);
      await assignLeadRoundRobin(tx, { leadId, lead, actorId: null });
    }) : Promise.resolve());
    await db.query("UPDATE integration_connections SET last_received_at=now(),updated_at=now() WHERE id=$1", [id]);
    return json(res, 201, { id: leadId, duplicate: false, source: lead.lead_source });
  } catch (error) { console.error(`integration lead failed code=${error?.code || "unknown"}`); return json(res, 500, { error: "Unable to receive lead." }); }
}

module.exports = { listConnections, createConnection, toggleConnection, receiveLead };
