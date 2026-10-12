"use strict";

const crypto = require("crypto");
const { writeAudit } = require("./audit.cjs");

const SOURCE_TYPES = new Set(["managed", "system_locked", "api_backed"]);
const ADMIN_ROLES = new Set(["Admin", "Owner"]);

function isDropdownAdmin(actor) { return ADMIN_ROLES.has(actor?.role); }
function json(res, status, body) { res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(body)); }
function error(res, status, message) { return json(res, status, { error: message }); }
function readJson(req, limit = 16384) { return new Promise((resolve, reject) => { let size = 0; const chunks = []; req.on("data", (chunk) => { size += chunk.length; if (size > limit) reject(Object.assign(new Error("Request too large."), { status: 413 })); else chunks.push(chunk); }); req.on("end", () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}); } catch { reject(Object.assign(new Error("Invalid JSON."), { status: 400 })); } }); req.on("error", reject); }); }
function publicOption(row) { return { id: row.id, dropdown_id: row.dropdown_id, label: row.label, value: row.value, semantic_key: row.semantic_key, sort_order: row.sort_order, is_active: Boolean(row.is_active), created_at: row.created_at, updated_at: row.updated_at }; }
function publicDefinition(row, options = []) { return { id: row.id, key: row.key, label: row.label, source_type: row.source_type, required: Boolean(row.required), default_value: row.default_value, is_visible: Boolean(row.is_visible), is_active: Boolean(row.is_active), sort_order: row.sort_order, created_at: row.created_at, updated_at: row.updated_at, options }; }
function definitionInput(body, current = {}) {
  const label = String(body.label ?? current.label ?? "").trim();
  const key = String(body.key ?? current.key ?? "").trim();
  const sourceType = String(body.source_type ?? current.source_type ?? "managed").trim();
  if (!label || !key || !SOURCE_TYPES.has(sourceType)) return { error: "Invalid dropdown definition." };
  return { value: { label, key, source_type: sourceType, required: body.required ?? current.required ?? false, default_value: body.default_value ?? current.default_value ?? null, is_visible: body.is_visible ?? current.is_visible ?? true, is_active: body.is_active ?? current.is_active ?? true, sort_order: Number.isInteger(body.sort_order) ? body.sort_order : Number(current.sort_order || 0) } };
}
function optionInput(body, current = {}) {
  const label = String(body.label ?? current.label ?? "").trim();
  const value = String(body.value ?? current.value ?? "").trim();
  if (!label || !value) return { error: "Option label and value are required." };
  return { value: { label, value, semantic_key: body.semantic_key ?? current.semantic_key ?? null, sort_order: Number.isInteger(body.sort_order) ? body.sort_order : Number(current.sort_order || 0), is_active: body.is_active ?? current.is_active ?? true } };
}
async function dropdownsList(req, res, db, actor) {
  const admin = isDropdownAdmin(actor);
  const definitions = await db.query(`SELECT id,key,label,source_type,required,default_value,is_visible,is_active,sort_order,created_at,updated_at FROM dropdown_definitions ${admin ? "" : "WHERE is_active=true AND is_visible=true"} ORDER BY sort_order,key`, []);
  const ids = definitions.rows.map((row) => row.id);
  const options = ids.length ? await db.query(`SELECT id,dropdown_id,label,value,semantic_key,sort_order,is_active,created_at,updated_at FROM dropdown_options WHERE dropdown_id = ANY($1::text[]) ${admin ? "" : "AND is_active=true"} ORDER BY dropdown_id,sort_order,id`, [ids]) : { rows: [] };
  const byDefinition = new Map(ids.map((id) => [id, []]));
  for (const row of options.rows) byDefinition.get(row.dropdown_id)?.push(publicOption(row));
  return json(res, 200, { dropdowns: definitions.rows.map((row) => publicDefinition(row, byDefinition.get(row.id) || [])) });
}
async function loadDefinition(db, id) { return (await db.query("SELECT id,key,label,source_type,required,default_value,is_visible,is_active,sort_order,created_at,updated_at FROM dropdown_definitions WHERE id=$1", [id])).rows[0] || null; }
async function loadOption(db, id) { return (await db.query("SELECT id,dropdown_id,label,value,semantic_key,sort_order,is_active,created_at,updated_at FROM dropdown_options WHERE id=$1", [id])).rows[0] || null; }
async function assertSelectableOption(db, key, value) {
  const row = (await db.query("SELECT o.id,o.value,o.label,o.semantic_key FROM dropdown_definitions d JOIN dropdown_options o ON o.dropdown_id=d.id WHERE d.key=$1 AND d.is_active=true AND o.value=$2 AND o.is_active=true", [key, value])).rows[0];
  if (!row) throw Object.assign(new Error("Selected dropdown option is inactive or unavailable."), { status: 400 });
  return row;
}
async function createDefinition(req, res, db, actor) {
  if (!isDropdownAdmin(actor)) return error(res, 403, "Only Admin or Owner may manage dropdowns.");
  const body = await readJson(req); const checked = definitionInput(body); if (checked.error) return error(res, 400, checked.error);
  const id = `dropdown-${crypto.randomUUID()}`; const v = checked.value;
  try { await db.query("INSERT INTO dropdown_definitions(id,key,label,source_type,required,default_value,is_visible,is_active,sort_order) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)", [id, v.key, v.label, v.source_type, Boolean(v.required), v.default_value, Boolean(v.is_visible), Boolean(v.is_active), v.sort_order]); await writeAudit(db, { actorUserId: actor.id, action: "dropdown.created", entityType: "dropdown_definition", entityId: id, newValue: v.key, ip: req.socket.remoteAddress }); return json(res, 201, { id }); } catch (e) { if (e.code === "23505") return error(res, 409, "A dropdown with that key already exists."); throw e; }
}
async function updateDefinition(req, res, db, actor, id) {
  if (!isDropdownAdmin(actor)) return error(res, 403, "Only Admin or Owner may manage dropdowns.");
  const current = await loadDefinition(db, id); if (!current) return error(res, 404, "Dropdown not found."); const body = await readJson(req); const checked = definitionInput(body, current); if (checked.error) return error(res, 400, checked.error); const v = checked.value;
  try { await db.query("UPDATE dropdown_definitions SET label=$2,required=$3,default_value=$4,is_visible=$5,is_active=$6,sort_order=$7,updated_at=now() WHERE id=$1", [id, v.label, Boolean(v.required), v.default_value, Boolean(v.is_visible), Boolean(v.is_active), v.sort_order]); await writeAudit(db, { actorUserId: actor.id, action: "dropdown.updated", entityType: "dropdown_definition", entityId: id, newValue: v.label, ip: req.socket.remoteAddress }); return json(res, 200, { id }); } catch (e) { if (e.code === "23505") return error(res, 409, "A dropdown with that key already exists."); throw e; }
}
async function deactivateDefinition(req, res, db, actor, id) {
  if (!isDropdownAdmin(actor)) return error(res, 403, "Only Admin or Owner may manage dropdowns.");
  const current = await loadDefinition(db, id); if (!current) return error(res, 404, "Dropdown not found.");
  await db.query("UPDATE dropdown_definitions SET is_active=false,updated_at=now() WHERE id=$1", [id]);
  await writeAudit(db, { actorUserId: actor.id, action: "dropdown.deactivated", entityType: "dropdown_definition", entityId: id, oldValue: current.key, newValue: "inactive", ip: req.socket.remoteAddress });
  return json(res, 200, { id, is_active: false });
}
async function createOption(req, res, db, actor, definitionId) {
  if (!isDropdownAdmin(actor)) return error(res, 403, "Only Admin or Owner may manage dropdowns."); const definition = await loadDefinition(db, definitionId); if (!definition) return error(res, 404, "Dropdown not found."); if (definition.source_type !== "managed") return error(res, 403, "This dropdown is system-managed and cannot be edited."); const body = await readJson(req); const checked = optionInput(body); if (checked.error) return error(res, 400, checked.error); const v = checked.value; const id = `dropdown-option-${crypto.randomUUID()}`;
  try { await db.query("INSERT INTO dropdown_options(id,dropdown_id,label,value,semantic_key,sort_order,is_active) VALUES($1,$2,$3,$4,$5,$6,$7)", [id, definitionId, v.label, v.value, v.semantic_key, v.sort_order, Boolean(v.is_active)]); await writeAudit(db, { actorUserId: actor.id, action: "dropdown.option_created", entityType: "dropdown_option", entityId: id, newValue: v.value, ip: req.socket.remoteAddress }); return json(res, 201, { id }); } catch (e) { if (e.code === "23505") return error(res, 409, "An option with that value already exists."); throw e; }
}
async function updateOption(req, res, db, actor, definitionId, optionId) {
  if (!isDropdownAdmin(actor)) return error(res, 403, "Only Admin or Owner may manage dropdowns."); const definition = await loadDefinition(db, definitionId); const current = await loadOption(db, optionId); if (!definition || !current || current.dropdown_id !== definitionId) return error(res, 404, "Option not found."); if (definition.source_type !== "managed") return error(res, 403, "This dropdown is system-managed and cannot be edited."); const body = await readJson(req); if (body.value !== undefined && String(body.value).trim() !== current.value) return error(res, 400, "Option value is immutable."); if (body.semantic_key !== undefined && body.semantic_key !== current.semantic_key) return error(res, 400, "Option semantic key is immutable."); const checked = optionInput(body, current); if (checked.error) return error(res, 400, checked.error); const v = checked.value; await db.query("UPDATE dropdown_options SET label=$3,semantic_key=$4,sort_order=$5,is_active=$6,updated_at=now() WHERE id=$1 AND dropdown_id=$2", [optionId, definitionId, v.label, v.semantic_key, v.sort_order, Boolean(v.is_active)]); await writeAudit(db, { actorUserId: actor.id, action: "dropdown.option_updated", entityType: "dropdown_option", entityId: optionId, newValue: v.label, ip: req.socket.remoteAddress }); return json(res, 200, { id: optionId });
}
async function deactivateOption(req, res, db, actor, definitionId, optionId) {
  if (!isDropdownAdmin(actor)) return error(res, 403, "Only Admin or Owner may manage dropdowns."); const definition = await loadDefinition(db, definitionId); const current = await loadOption(db, optionId); if (!definition || !current || current.dropdown_id !== definitionId) return error(res, 404, "Option not found."); if (definition.source_type !== "managed") return error(res, 403, "This dropdown is system-managed and cannot be edited."); await db.query("UPDATE dropdown_options SET is_active=false,updated_at=now() WHERE id=$1", [optionId]); await writeAudit(db, { actorUserId: actor.id, action: "dropdown.option_deactivated", entityType: "dropdown_option", entityId: optionId, oldValue: current.value, newValue: "inactive", ip: req.socket.remoteAddress }); return json(res, 200, { id: optionId, is_active: false });
}
async function reorderOptions(req, res, db, actor, definitionId) {
  if (!isDropdownAdmin(actor)) return error(res, 403, "Only Admin or Owner may manage dropdowns."); const definition = await loadDefinition(db, definitionId); if (!definition) return error(res, 404, "Dropdown not found."); if (definition.source_type !== "managed") return error(res, 403, "This dropdown is system-managed and cannot be edited."); const body = await readJson(req); if (!Array.isArray(body.option_ids) || body.option_ids.length === 0 || body.option_ids.some((id) => typeof id !== "string")) return error(res, 400, "A complete option order is required.");
  const runTransaction = typeof db.transaction === "function" ? db.transaction.bind(db) : async (work) => { await db.query("BEGIN"); try { const result = await work(db); await db.query("COMMIT"); return result; } catch (e) { await db.query("ROLLBACK").catch(() => {}); throw e; } };
  try {
    await runTransaction(async (tx) => { const current = await tx.query("SELECT id FROM dropdown_options WHERE dropdown_id=$1 ORDER BY sort_order,id", [definitionId]); const currentIds = new Set(current.rows.map((row) => row.id)); const uniqueIds = new Set(body.option_ids); if (currentIds.size !== uniqueIds.size || currentIds.size !== body.option_ids.length || body.option_ids.some((id) => !currentIds.has(id))) throw Object.assign(new Error("Invalid option order."), { status: 400 }); for (let i = 0; i < body.option_ids.length; i += 1) await tx.query("UPDATE dropdown_options SET sort_order=$3,updated_at=now() WHERE id=$1 AND dropdown_id=$2", [body.option_ids[i], definitionId, i]); await writeAudit(tx, { actorUserId: actor.id, action: "dropdown.options_reordered", entityType: "dropdown_definition", entityId: definitionId, newValue: "ordered", ip: req.socket.remoteAddress }); });
  } catch (e) { if (e.status === 400) return error(res, 400, e.message); throw e; }
  return json(res, 200, { id: definitionId, option_ids: body.option_ids });
}
module.exports = { isDropdownAdmin, assertSelectableOption, dropdownsList, createDefinition, updateDefinition, deactivateDefinition, createOption, updateOption, deactivateOption, reorderOptions };
