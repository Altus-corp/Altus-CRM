"use strict";

require("./load-env.cjs")();

const http = require("http");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const { openDb } = require("./db.cjs");
const S = require("./security.cjs");
const { requireCapability, canManageRole } = require("./permissions.cjs");
const { ADMIN_SCREENS, adminScreen } = require("./admin.cjs");
const { writeAudit } = require("./audit.cjs");
const A = require("./accounts.cjs");
const { QUICK_FILTER_FIELDS, QUICK_FILTER_OPERATORS, validateQuickFilter, buildQuickFilterWhere } = require("./quick-filters.cjs");
const { guardedDatabaseUrl, reportFailure, databaseConnectionString } = require("./load-env.cjs");
const { isSupabaseUrl } = require("./write-guard.cjs");
const Dropdowns = require("./dropdowns.cjs");
const LeadImport = require("./lead-import.cjs");
const { assignLeadRoundRobin, writeAssignmentHistory } = require("./lead-assignment.cjs");
const LEAD_STAGE_OPTIONS = require("../shared/lead-stages.json");
const LEAD_STAGES = new Set(LEAD_STAGE_OPTIONS.map(({ value }) => value));

const PORT = Number(process.env.CRM_PORT || 4321);
const HOST = process.env.CRM_HOST || "127.0.0.1";
const STATIC = path.resolve(process.env.CRM_STATIC || path.join(__dirname, "..", "dist"));
const PG_URL = databaseConnectionString();
const PROXY_CONFIG = { behindProxy: process.env.CRM_BEHIND_PROXY === "1", publicIsHttps: String(process.env.CRM_PUBLIC_URL || "").startsWith("https:"), trustedProxies: new Set(String(process.env.CRM_TRUSTED_PROXIES || "").split(",").map((v) => v.trim()).filter(Boolean)) };
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, must_change_password: Boolean(u.must_change_password) });
const LEAD_SORTS = {
  name: "name", stage: "stage", lead_status: "lead_status", permission: "permission",
  pso_date: "pso_date", next_follow_up_at: "next_follow_up_at", last_call_at: "last_call_at", updated_at: "updated_at",
};

const LEAD_VIEWS = Object.freeze({
  database: "l.stage = 'database'",
  new_leads: "l.stage = 'lead'",
  qualified: "l.stage = 'qualified'",
  references: "l.stage = 'reference'",
  permission_granted: "l.permission = 'Yes'",
  permission_pending: "l.stage IN ('database','lead','qualified','reference') AND l.permission IS DISTINCT FROM 'Yes'",
  calling_queue: "l.permission = 'Yes' AND l.stage IN ('assigned','calling')",
  daily_call_chart: "l.permission = 'Yes' AND l.stage IN ('assigned','calling')",
  registered: "l.stage = 'registered'",
  pre_pso: "l.stage IN ('registered','prepso') AND NOT (l.pso_date <= CURRENT_DATE AND COALESCE(l.custom_values->>'attendanceStatus','') = '')",
  during_pso: "l.stage IN ('registered','prepso') AND l.pso_date <= CURRENT_DATE AND COALESCE(l.custom_values->>'attendanceStatus','') = ''",
  attended: "l.stage = 'attended'",
  not_attended: "l.stage = 'notattended'",
  sale_registration: "l.stage = 'psreg'",
  pre_ps: "l.stage IN ('psreg','preps','billed') AND COALESCE(l.is_pre_ps_done,false) = false",
});

function integerParam(value, fallback, max) {
  const n = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : fallback;
}

function dateParam(value) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function invalidLeadsQuery(res) {
  return json(res, 400, { error: "Invalid leads query." });
}

function leadView(view) {
  return LEAD_VIEWS[view] || null;
}

const LEAD_COUNT_VIEWS = Object.freeze({ all: "TRUE", ...LEAD_VIEWS });
const LEAD_TYPES = Object.freeze({ DL: "P3", L: "P3", QDL: "P3", QL: "P2", R: "P1" });
const PRODUCT_FUNNELS = Object.freeze({ Keynote: "keynote" });
function leadTypeValue(value) { const type = String(value || "").trim().toUpperCase(); return Object.prototype.hasOwnProperty.call(LEAD_TYPES, type) ? type : null; }
function leadPriority(type) { return LEAD_TYPES[type]; }
function leadProductRows(leadId, products) { return products.map((product) => { const code = String(product?.product_code || product?.code || "").trim(); if (!code) throw Object.assign(new Error("Invalid product"), { status: 400 }); return { id: `lead-product-${crypto.randomUUID()}`, lead_id: leadId, product_code: code, stage: String(product.stage || "lead"), call_stage: String(product.call_stage || "lead"), funnel: PRODUCT_FUNNELS[code] || "standard" }; }); }

function quickFilterRow(row) {
  return { id: row.id, name: row.name, view: row.view_key || "", filters: row.filters || {}, conditions: row.conditions || [], join: row.join_operator || "AND", created_at: row.created_at, updated_at: row.updated_at };
}

async function quickFiltersList(res, db, actor) {
  const result = await db.query("SELECT id,name,view_key,filters,conditions,join_operator,created_at,updated_at FROM lead_quick_filters WHERE owner_user_id=$1 ORDER BY name ASC, id ASC", [actor.id]);
  return json(res, 200, { items: result.rows.map(quickFilterRow) });
}

async function quickFilterCreate(req, res, db, actor) {
  const body = await readJson(req); const checked = validateQuickFilter(body);
  if (checked.error) return json(res, 400, { error: checked.error });
  const value = checked.value; const id = `lead-quick-filter-${crypto.randomUUID()}`;
  try {
    const result = await db.query("INSERT INTO lead_quick_filters (id,owner_user_id,name,view_key,filters,conditions,join_operator) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7) RETURNING id,name,view_key,filters,conditions,join_operator,created_at,updated_at", [id, actor.id, value.name, value.view, JSON.stringify(value.filters), JSON.stringify(value.conditions), value.join]);
    return json(res, 201, { item: quickFilterRow(result.rows[0]) });
  } catch (error) { if (error?.code === "23505") return json(res, 409, { error: "A quick filter with that name already exists." }); throw error; }
}

async function quickFilterUpdate(req, res, db, actor, id) {
  const current = (await db.query("SELECT id,name,view_key,filters,conditions,join_operator FROM lead_quick_filters WHERE id=$1 AND owner_user_id=$2", [id, actor.id])).rows[0];
  if (!current) return json(res, 404, { error: "Quick filter not found." });
  const body = await readJson(req); const checked = validateQuickFilter({ ...quickFilterRow(current), ...body }, current);
  if (checked.error) return json(res, 400, { error: checked.error });
  const value = checked.value;
  try {
    const result = await db.query("UPDATE lead_quick_filters SET name=$3,view_key=$4,filters=$5::jsonb,conditions=$6::jsonb,join_operator=$7,updated_at=now() WHERE id=$1 AND owner_user_id=$2 RETURNING id,name,view_key,filters,conditions,join_operator,created_at,updated_at", [id, actor.id, value.name, value.view, JSON.stringify(value.filters), JSON.stringify(value.conditions), value.join]);
    return json(res, 200, { item: quickFilterRow(result.rows[0]) });
  } catch (error) { if (error?.code === "23505") return json(res, 409, { error: "A quick filter with that name already exists." }); throw error; }
}

async function quickFilterDelete(res, db, actor, id) {
  const result = await db.query("DELETE FROM lead_quick_filters WHERE id=$1 AND owner_user_id=$2 RETURNING id", [id, actor.id]);
  if (!result.rows[0]) return json(res, 404, { error: "Quick filter not found." });
  return json(res, 200, { id });
}

async function leadsCounts(res, db) {
  const expressions = Object.entries(LEAD_COUNT_VIEWS).map(([key, predicate]) => `COUNT(*) FILTER (WHERE ${predicate})::int AS "${key}"`);
  const result = await db.query(`SELECT ${expressions.join(", ")} FROM leads l`, []);
  const row = result.rows[0] || {};
  const counts = Object.fromEntries(Object.keys(LEAD_COUNT_VIEWS).map((key) => [key, Number.isFinite(Number(row[key])) ? Number(row[key]) : 0]));
  return json(res, 200, counts);
}

async function leadsList(req, res, db, url) {
  const params = [];
  const where = [];
  const bind = (value) => { params.push(value); return `$${params.length}`; };
  const q = String(url.searchParams.get("search") || url.searchParams.get("q") || "").trim();
  if (q) { const p = bind(`%${q}%`); where.push(`(l.name ILIKE ${p} OR l.email ILIKE ${p} OR l.company ILIKE ${p} OR l.phone ILIKE ${p} OR l.lead_no ILIKE ${p} OR l.external_id ILIKE ${p})`); }
  for (const [query, column] of [["stage", "l.stage"], ["permission", "l.permission"], ["owner", "l.owner_user_id"], ["lead_status", "l.lead_status"]]) {
    const value = String(url.searchParams.get(query) || "").trim(); if (value) where.push(`${column} = ${bind(value)}`);
  }
  const psoFrom = dateParam(url.searchParams.get("pso_date_from")); const psoTo = dateParam(url.searchParams.get("pso_date_to"));
  const nextFrom = dateParam(url.searchParams.get("next_follow_up_from")); const nextTo = dateParam(url.searchParams.get("next_follow_up_to"));
  for (const key of ["pso_date_from", "pso_date_to", "next_follow_up_from", "next_follow_up_to"]) {
    const value = url.searchParams.get(key);
    if (value && !dateParam(value)) return invalidLeadsQuery(res);
  }
  if (psoFrom) where.push(`l.pso_date >= ${bind(psoFrom)}`); if (psoTo) where.push(`l.pso_date <= ${bind(psoTo)}`);
  if (nextFrom) where.push(`l.next_follow_up_at >= ${bind(nextFrom)}`); if (nextTo) where.push(`l.next_follow_up_at < (${bind(nextTo)}::date + INTERVAL '1 day')`);
  const next = url.searchParams.get("next_follow_up");
  if (next && !["overdue", "today", "upcoming"].includes(next)) return invalidLeadsQuery(res);
  if (next === "overdue") where.push("l.next_follow_up_at < CURRENT_DATE");
  if (next === "today") where.push("l.next_follow_up_at >= CURRENT_DATE AND l.next_follow_up_at < CURRENT_DATE + INTERVAL '1 day'");
  if (next === "upcoming") where.push("l.next_follow_up_at >= CURRENT_DATE");
  const view = String(url.searchParams.get("view") || "");
  if (view === "key_note") return json(res, 400, { error: "Key Note is unavailable until a product master exists." });
  if (view && !Object.prototype.hasOwnProperty.call(LEAD_VIEWS, view)) return invalidLeadsQuery(res);
  const viewSql = leadView(view); if (viewSql) where.push(viewSql);
  const advancedRaw = url.searchParams.get("advanced");
  if (advancedRaw) {
    let advanced;
    try { advanced = JSON.parse(advancedRaw); } catch { return invalidLeadsQuery(res); }
    const advancedWhere = buildQuickFilterWhere(advanced, bind);
    if (advancedWhere.error) return invalidLeadsQuery(res);
    where.push(advancedWhere.sql);
  }
  const sortParam = url.searchParams.get("sort");
  if (sortParam && !Object.prototype.hasOwnProperty.call(LEAD_SORTS, sortParam)) return invalidLeadsQuery(res);
  const sort = sortParam || "updated_at";
  const directionParam = String(url.searchParams.get("direction") || "desc").toLowerCase();
  if (![
    "asc", "desc",
  ].includes(directionParam)) return invalidLeadsQuery(res);
  const direction = directionParam === "asc" ? "ASC" : "DESC";
  const isAll = url.searchParams.get("page_size") === "all";
  const filterSql = where.length ? "WHERE " + where.join(" AND ") : "";
  const count = await db.query(`SELECT count(*)::int AS total FROM leads l ${filterSql}`, params);
  const total = count.rows[0]?.total || 0;
  const pageSize = isAll ? Math.max(1, total) : integerParam(url.searchParams.get("page_size"), 50, 100);
  const page = isAll ? 1 : integerParam(url.searchParams.get("page"), 1, 1000000);
  const offset = isAll ? 0 : (page - 1) * pageSize;
  const listParams = params.slice(); listParams.push(pageSize, offset);
  const rows = await db.query(`SELECT l.id,l.source_id,l.name,l.email,l.company,l.phone,l.stage,l.permission,l.lead_status,l.owner_user_id,l.pso_date,l.next_follow_up_at,l.last_call_at,l.updated_at,l.is_pre_ps_done,l.lead_no,l.lead_type,l.lead_source,l.source_system,l.designation,l.city,l.custom_values,l.legacy_finance FROM leads l ${filterSql} ORDER BY l.${sort} ${direction} NULLS LAST, l.id ASC LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`, listParams);
  return json(res, 200, { items: rows.rows, page, page_size: pageSize, total, sort, direction: direction.toLowerCase(), view: view || null });
}

async function leadDetail(req, res, db, id) {
  const lead = (await db.query("SELECT * FROM leads WHERE id = $1", [id])).rows[0];
  if (!lead) return json(res, 404, { error: "Lead not found." });
  const [calls, followups, history, messages, products] = await Promise.all([
    db.query("SELECT * FROM lead_calls WHERE lead_id = $1 ORDER BY happened_at DESC NULLS LAST, id DESC", [id]),
    db.query("SELECT * FROM lead_followups WHERE lead_id = $1 ORDER BY due_at ASC NULLS LAST, id ASC", [id]),
    db.query("SELECT * FROM lead_history WHERE lead_id = $1 ORDER BY occurred_at DESC NULLS LAST, id DESC", [id]),
    db.query("SELECT * FROM lead_messages WHERE lead_id = $1 ORDER BY sent_at DESC NULLS LAST, id DESC", [id]),
    db.query("SELECT * FROM lead_products WHERE lead_id = $1 ORDER BY product_code ASC, id ASC", [id]),
  ]);
  return json(res, 200, { lead, calls: calls.rows, followups: followups.rows, history: history.rows, messages: messages.rows, products: products.rows });
}

function activityPage(url) {
  const page = integerParam(url.searchParams.get("page"), 1, 1000000);
  const pageSize = integerParam(url.searchParams.get("page_size"), 50, 50);
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function activityText(value, max = 4000) {
  const text = typeof value === "string" ? value.trim() : "";
  return text && text.length <= max ? text : null;
}

function activityDate(value) {
  if (value == null || value === "") return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function activityList(res, db, id, kind, url) {
  const { page, pageSize, offset } = activityPage(url);
  const definitions = {
    history: {
      count: "SELECT count(*)::int AS total FROM lead_history WHERE lead_id=$1",
      rows: "SELECT h.id,h.occurred_at,h.action,h.entity,h.field,h.from_value,h.to_value,h.note,h.actor_id,u.name AS actor_name FROM lead_history h LEFT JOIN users u ON u.id=h.actor_id WHERE h.lead_id=$1 ORDER BY h.occurred_at DESC NULLS LAST,h.id DESC LIMIT $2 OFFSET $3",
    },
    calls: {
      count: "SELECT count(*)::int AS total FROM lead_calls WHERE lead_id=$1",
      rows: "SELECT c.id,c.happened_at,c.duration_seconds,c.note,c.resolution,c.user_id,u.name AS caller_name FROM lead_calls c LEFT JOIN users u ON u.id=c.user_id WHERE c.lead_id=$1 ORDER BY c.happened_at DESC NULLS LAST,c.id DESC LIMIT $2 OFFSET $3",
    },
    followups: {
      count: "SELECT count(*)::int AS total FROM lead_followups WHERE lead_id=$1",
      rows: "SELECT f.id,f.created_at,f.created_by,creator.name AS creator_name,f.due_at,f.status,f.note,f.completed_at,COALESCE(json_agg(json_build_object('id',e.id,'old_due_at',e.old_due_at,'new_due_at',e.new_due_at,'changed_at',e.changed_at,'changed_by',e.changed_by,'changed_by_name',changer.name) ORDER BY e.changed_at DESC) FILTER (WHERE e.id IS NOT NULL),'[]') AS reschedules FROM lead_followups f LEFT JOIN users creator ON creator.id=f.created_by LEFT JOIN lead_followup_events e ON e.followup_id=f.id LEFT JOIN users changer ON changer.id=e.changed_by WHERE f.lead_id=$1 GROUP BY f.id,creator.name ORDER BY f.created_at DESC NULLS LAST,f.id DESC LIMIT $2 OFFSET $3",
    },
    messages: {
      count: "SELECT count(*)::int AS total FROM lead_messages WHERE lead_id=$1",
      rows: "SELECT m.id,m.sent_at,m.channel,m.status,m.sender,m.body FROM lead_messages m WHERE m.lead_id=$1 ORDER BY m.sent_at DESC NULLS LAST,m.id DESC LIMIT $2 OFFSET $3",
    },
    notes: {
      count: "SELECT (SELECT count(*) FROM lead_notes WHERE lead_id=$1)+(SELECT count(*) FROM lead_calls WHERE lead_id=$1 AND note IS NOT NULL AND btrim(note)<>'') AS total",
      rows: "SELECT * FROM (SELECT n.id,n.body,n.note_type,n.call_id,n.created_by,n.created_at,u.name AS author_name FROM lead_notes n LEFT JOIN users u ON u.id=n.created_by WHERE n.lead_id=$1 UNION ALL SELECT c.id,c.note AS body,'call' AS note_type,c.id AS call_id,c.user_id AS created_by,COALESCE(c.happened_at,c.created_at) AS created_at,u.name AS author_name FROM lead_calls c LEFT JOIN users u ON u.id=c.user_id WHERE c.lead_id=$1 AND c.note IS NOT NULL AND btrim(c.note)<>'') notes ORDER BY created_at DESC NULLS LAST,id DESC LIMIT $2 OFFSET $3",
    },
  };
  const definition = definitions[kind];
  if (!definition) return json(res, 404, { error: "Activity section not found." });
  const [count, rows] = await Promise.all([db.query(definition.count, [id]), db.query(definition.rows, [id, pageSize, offset])]);
  return json(res, 200, { items: rows.rows, page, page_size: pageSize, total: count.rows[0]?.total || 0 });
}

async function activityLeadExists(db, id) { return Boolean(await db.one?.("SELECT id FROM leads WHERE id=$1", [id]) || (await db.query("SELECT id FROM leads WHERE id=$1", [id])).rows[0]); }

async function addLeadNote(req, res, db, actor, id) {
  const body = await readJson(req); const note = activityText(body.body);
  if (!note) return json(res, 400, { error: "Note body is required." });
  if (!(await activityLeadExists(db, id))) return json(res, 404, { error: "Lead not found." });
  const noteId = `lead-note-${crypto.randomUUID()}`;
  await db.query("INSERT INTO lead_notes(id,lead_id,body,note_type,created_by) VALUES($1,$2,$3,'manual',$4)", [noteId, id, note, actor.id]);
  await writeAudit(db, { actorUserId: actor.id, action: "lead.note_created", entityType: "lead", entityId: id, newValue: "manual_note", ip: req.socket.remoteAddress });
  return json(res, 201, { id: noteId });
}

async function addLeadCall(req, res, db, actor, id) {
  const lead = (await db.query("SELECT id,permission FROM leads WHERE id=$1", [id])).rows[0];
  if (!lead) return json(res, 404, { error: "Lead not found." });
  if (lead.permission !== "Yes") return json(res, 403, { error: "Permission to Call is required before logging a call." });
  const body = await readJson(req); const happenedAt = activityDate(body.happened_at || body.happenedAt) || new Date().toISOString();
  const duration = body.duration_seconds == null || body.duration_seconds === "" ? null : Number(body.duration_seconds);
  const note = body.note == null ? null : activityText(body.note);
  const resolution = body.resolution == null ? null : activityText(body.resolution, 200);
  if (!happenedAt || (duration != null && (!Number.isInteger(duration) || duration < 0 || duration > 86400)) || (body.note != null && note == null) || (body.resolution != null && resolution == null)) return json(res, 400, { error: "Invalid call data." });
  const callId = `lead-call-${crypto.randomUUID()}`;
  await db.query("INSERT INTO lead_calls(id,lead_id,user_id,happened_at,note,resolution,duration_seconds,created_at,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,now(),$3)", [callId, id, actor.id, happenedAt, note, resolution, duration]);
  await writeAudit(db, { actorUserId: actor.id, action: "lead.call_created", entityType: "lead", entityId: id, newValue: "call", ip: req.socket.remoteAddress });
  return json(res, 201, { id: callId });
}

async function addLeadFollowup(req, res, db, actor, id) {
  const body = await readJson(req); const dueAt = activityDate(body.due_at || body.dueAt); const note = body.note == null ? null : activityText(body.note);
  if (!dueAt || (body.note != null && note == null)) return json(res, 400, { error: "Invalid follow-up data." });
  if (!(await activityLeadExists(db, id))) return json(res, 404, { error: "Lead not found." });
  const followupId = `lead-followup-${crypto.randomUUID()}`;
  await db.query("INSERT INTO lead_followups(id,lead_id,assigned_to,due_at,status,note,created_at,created_by) VALUES($1,$2,$3,$4,'open',$5,now(),$3)", [followupId, id, actor.id, dueAt, note]);
  await writeAudit(db, { actorUserId: actor.id, action: "lead.followup_created", entityType: "lead", entityId: id, newValue: "followup", ip: req.socket.remoteAddress });
  return json(res, 201, { id: followupId });
}

async function rescheduleLeadFollowup(req, res, db, actor, id, followupId) {
  const body = await readJson(req); const dueAt = activityDate(body.due_at || body.dueAt);
  if (!dueAt) return json(res, 400, { error: "A valid due date is required." });
  const current = (await db.query("SELECT id,due_at FROM lead_followups WHERE id=$1 AND lead_id=$2", [followupId, id])).rows[0];
  if (!current) return json(res, 404, { error: "Follow-up not found." });
  await transaction(db, async (tx) => { await tx.query("UPDATE lead_followups SET due_at=$1,status='rescheduled' WHERE id=$2", [dueAt, followupId]); await tx.query("INSERT INTO lead_followup_events(id,followup_id,old_due_at,new_due_at,changed_by) VALUES($1,$2,$3,$4,$5)", [`followup-event-${crypto.randomUUID()}`, followupId, current.due_at, dueAt, actor.id]); await writeAudit(tx, { actorUserId: actor.id, action: "lead.followup_rescheduled", entityType: "lead", entityId: id, newValue: "followup_rescheduled", ip: req.socket.remoteAddress }); });
  return json(res, 200, { id: followupId });
}

async function completeLeadFollowup(req, res, db, actor, id, followupId) {
  const result = await db.query("UPDATE lead_followups SET status='done',completed_at=now() WHERE id=$1 AND lead_id=$2 RETURNING id", [followupId, id]);
  if (!result.rows[0]) return json(res, 404, { error: "Follow-up not found." });
  await writeAudit(db, { actorUserId: actor.id, action: "lead.followup_completed", entityType: "lead", entityId: id, newValue: "followup_completed", ip: req.socket.remoteAddress });
  return json(res, 200, { id: followupId });
}

async function transaction(db, work) {
  if (typeof db.transaction === "function") return db.transaction(work);
  await db.query("BEGIN");
  try { const result = await work(db); await db.query("COMMIT"); return result; } catch (error) { await db.query("ROLLBACK").catch(() => {}); throw error; }
}

function invalidLead(res) { return json(res, 400, { error: "Invalid lead data." }); }
function duplicateLeadError(res) { return json(res, 409, { error: "Possible duplicate lead." }); }
async function findLeadDuplicates(db, phone, email, excludeId = null) {
  const rows = await db.query("SELECT id FROM leads WHERE (($1::text IS NOT NULL AND phone = $1::text) OR ($2::text IS NOT NULL AND lower(email) = lower($2::text))) AND ($3::text IS NULL OR id <> $3::text) ORDER BY id ASC", [phone || null, email || null, excludeId]);
  return rows.rows;
}
function leadFields(body) {
  const type = leadTypeValue(body.lead_type); if (!type) return null;
  const name = String(body.name || "").trim(); if (!name) return null;
  const permission = String(body.permission || "Pending"); if (!["Yes", "No", "Pending"].includes(permission)) return null;
  const stage = String(body.stage || "lead"); if (!LEAD_STAGES.has(stage)) return null;
  return { name, email: String(body.email || "").trim() || null, phone: String(body.phone || "").trim() || null, company: String(body.company || "").trim() || null, team: String(body.team || "").trim() || null, lead_type: type, priority: leadPriority(type), stage, permission, lead_status: String(body.lead_status || "").trim() || null, owner_user_id: body.owner_user_id ? String(body.owner_user_id) : null, pso_date: body.pso_date || null, custom_values: body.custom_values && typeof body.custom_values === "object" ? body.custom_values : {}, legacy_finance: body.legacy_finance && typeof body.legacy_finance === "object" ? body.legacy_finance : {} };
}
async function createLead(req, res, db, actor) {
  let body;
  try { body = await readJson(req); } catch { return invalidLead(res); }
  if (body.permission && body.permission !== "Pending" && !requireCapability("leads.permission", actor)) return json(res, 403, { error: "You do not have permission to change permission." });
  const fields = leadFields(body); if (!fields) return invalidLead(res);
  const duplicates = await findLeadDuplicates(db, fields.phone, fields.email);
  if (duplicates.length && body.duplicate_action !== "merge") return duplicateLeadError(res);
  let products;
  try { products = leadProductRows("pending", Array.isArray(body.products) ? body.products : []); } catch (error) { return error?.status === 400 ? invalidLead(res) : json(res, 500, { error: "Unable to save lead." }); }
  const targetId = duplicates[0]?.id || `lead-${crypto.randomUUID()}`;
  try {
    await transaction(db, async (tx) => {
      if (duplicates.length) {
        await tx.query("UPDATE leads SET name=$2,email=$3,phone=$4,company=$5,team=$6,lead_type=$7,priority=$8,stage=$9,permission=$10,lead_status=$11,owner_user_id=$12,pso_date=$13,custom_values=$14,legacy_finance=$15,updated_at=now() WHERE id=$1", [targetId, fields.name, fields.email, fields.phone, fields.company, fields.team, fields.lead_type, fields.priority, fields.stage, fields.permission, fields.lead_status, fields.owner_user_id, fields.pso_date, fields.custom_values, fields.legacy_finance]);
        await writeAudit(tx, { actorUserId: actor.id, action: "lead.merged", entityType: "lead", entityId: targetId, newValue: "duplicate_merge", ip: req.socket.remoteAddress });
      } else {
        await tx.query("INSERT INTO leads (id,name,email,phone,company,team,lead_type,priority,stage,permission,lead_status,owner_user_id,pso_date,custom_values,legacy_finance,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,now())", [targetId, fields.name, fields.email, fields.phone, fields.company, fields.team, fields.lead_type, fields.priority, fields.stage, fields.permission, fields.lead_status, fields.owner_user_id, fields.pso_date, fields.custom_values, fields.legacy_finance]);
        await writeAudit(tx, { actorUserId: actor.id, action: "lead.created", entityType: "lead", entityId: targetId, newValue: fields.lead_type, ip: req.socket.remoteAddress });
        if (!duplicates.length && !fields.owner_user_id) await assignLeadRoundRobin(tx, { leadId: targetId, lead: { ...fields, id: targetId }, actorId: actor.id });
      }
      for (const product of products) await tx.query("INSERT INTO lead_products (id,lead_id,product_code,stage,call_stage,funnel) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (lead_id,product_code) DO UPDATE SET stage=EXCLUDED.stage,call_stage=EXCLUDED.call_stage,funnel=EXCLUDED.funnel,updated_at=now()", [product.id, targetId, product.product_code, product.stage, product.call_stage, product.funnel]);
    });
    return json(res, duplicates.length ? 200 : 201, { id: targetId, merged: Boolean(duplicates.length) });
  } catch (error) {
    console.error(`lead create failed code=${error?.code || "unknown"} constraint=${error?.constraint || "none"}`);
    return json(res, 500, { error: "Unable to save lead." });
  }
}
async function updateLead(req, res, db, actor, id) {
  const body = await readJson(req); const current = (await db.query("SELECT * FROM leads WHERE id=$1", [id])).rows[0]; if (!current) return json(res, 404, { error: "Lead not found." }); if (body.permission !== undefined && body.permission !== current.permission && !requireCapability("leads.permission", actor)) return json(res, 403, { error: "You do not have permission to change permission." }); const fields = leadFields({ ...current, ...body }); if (!fields) return invalidLead(res); const duplicates = await findLeadDuplicates(db, fields.phone, fields.email, id); if (duplicates.length) return duplicateLeadError(res); try { await transaction(db, async (tx) => { await tx.query("UPDATE leads SET name=$2,email=$3,phone=$4,company=$5,team=$6,lead_type=$7,priority=$8,stage=$9,permission=$10,lead_status=$11,owner_user_id=$12,pso_date=$13,custom_values=$14,legacy_finance=$15,updated_at=now() WHERE id=$1", [id, fields.name, fields.email, fields.phone, fields.company, fields.team, fields.lead_type, fields.priority, fields.stage, fields.permission, fields.lead_status, fields.owner_user_id, fields.pso_date, fields.custom_values, fields.legacy_finance]); if (body.owner_user_id !== undefined && String(body.owner_user_id || "") !== String(current.owner_user_id || "")) await writeAssignmentHistory(tx, { leadId: id, actorId: actor.id, action: "lead.owner_changed", previousOwner: current.owner_user_id, ownerId: fields.owner_user_id, reason: "manual", note: "Lead owner changed manually." }); await writeAudit(tx, { actorUserId: actor.id, action: "lead.updated", entityType: "lead", entityId: id, ip: req.socket.remoteAddress }); }); return json(res, 200, { id }); } catch { return json(res, 500, { error: "Unable to save lead." }); }
}
async function reassignLeadRoundRobin(req, res, db, actor, id) {
  const current = (await db.query("SELECT * FROM leads WHERE id=$1", [id])).rows[0];
  if (!current) return json(res, 404, { error: "Lead not found." });
  try {
    let result;
    await transaction(db, async (tx) => { result = await assignLeadRoundRobin(tx, { leadId: id, lead: current, actorId: actor.id, force: true }); });
    return json(res, 200, { id, ...result });
  } catch { return json(res, 500, { error: "Unable to reassign lead by round-robin." }); }
}
async function changeLeadStage(req, res, db, actor, id) { const body = await readJson(req); const stage = String(body.stage || ""); if (!LEAD_STAGES.has(stage)) return invalidLead(res); try { await transaction(db, async (tx) => { const current = (await tx.query("SELECT stage FROM leads WHERE id=$1", [id])).rows[0]; if (!current) throw Object.assign(new Error("missing"), { status: 404 }); await tx.query("UPDATE leads SET stage=$2,updated_at=now() WHERE id=$1", [id, stage]); await writeAudit(tx, { actorUserId: actor.id, action: "lead.stage_changed", entityType: "lead", entityId: id, field: "stage", oldValue: current.stage, newValue: stage, ip: req.socket.remoteAddress }); }); return json(res, 200, { id, stage }); } catch (error) { return json(res, error.status === 404 ? 404 : 500, { error: error.status === 404 ? "Lead not found." : "Unable to change lead stage." }); } }
async function changeLeadPermission(req, res, db, actor, id) { const body = await readJson(req); const permission = String(body.permission || ""); if (!["Yes", "No", "Pending"].includes(permission)) return invalidLead(res); try { await transaction(db, async (tx) => { const current = (await tx.query("SELECT permission FROM leads WHERE id=$1", [id])).rows[0]; if (!current) throw Object.assign(new Error("missing"), { status: 404 }); await tx.query("UPDATE leads SET permission=$2,updated_at=now() WHERE id=$1", [id, permission]); await writeAudit(tx, { actorUserId: actor.id, action: "lead.permission_changed", entityType: "lead", entityId: id, field: "permission", oldValue: current.permission, newValue: permission, ip: req.socket.remoteAddress }); }); return json(res, 200, { id, permission }); } catch (error) { return json(res, error.status === 404 ? 404 : 500, { error: error.status === 404 ? "Lead not found." : "Unable to change permission." }); } }
async function updateLeadProducts(req, res, db, actor, id) { const body = await readJson(req); if (!Array.isArray(body.products)) return invalidLead(res); const products = leadProductRows(id, body.products); try { await transaction(db, async (tx) => { for (const product of products) await tx.query("INSERT INTO lead_products (id,lead_id,product_code,stage,call_stage,funnel) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (lead_id,product_code) DO UPDATE SET stage=EXCLUDED.stage,call_stage=EXCLUDED.call_stage,funnel=EXCLUDED.funnel,updated_at=now()", [product.id, id, product.product_code, product.stage, product.call_stage, product.funnel]); await writeAudit(tx, { actorUserId: actor.id, action: "lead.products_updated", entityType: "lead", entityId: id, newValue: "products", ip: req.socket.remoteAddress }); }); return json(res, 200, { id, product_count: products.length }); } catch { return json(res, 500, { error: "Unable to save lead products." }); }
}

function json(res, status, body, headers = {}) { res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers }); res.end(JSON.stringify(body)); }
function readJson(req, limit = 16384) { return new Promise((resolve, reject) => { let size = 0; const chunks = []; req.on("data", (chunk) => { size += chunk.length; if (size > limit) reject(Object.assign(new Error("Request too large."), { status: 413 })); else chunks.push(chunk); }); req.on("end", () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}); } catch { reject(Object.assign(new Error("Invalid JSON."), { status: 400 })); } }); req.on("error", reject); }); }
const USER_ROLES = ["Sales", "Viewer", "Admin", "Owner"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const publicMember = (user) => ({ id: user.id, name: user.name, email: user.email, role: user.role, active: user.active });
function userWriteError(res, status, error) { return json(res, status, { error }); }
async function safeUserOperation(res, operation) { try { return await operation(); } catch { return userWriteError(res, 500, "Unable to manage users."); } }
async function userWriteAllowed(db, req, user) {
  const hit = await S.isThrottled(db, req, user.email, PROXY_CONFIG);
  if (hit) return false;
  return true;
}
async function clearUserWriteThrottle(db, user) { await db.throttleClear(S.accountBuckets(user.email)); }
async function usersList(res, db) {
  try { const rows = await db.query("SELECT id, name, email, role, active FROM users ORDER BY name ASC, id ASC"); return json(res, 200, { users: rows.rows.map(publicMember) }); } catch { return userWriteError(res, 500, "Unable to manage users."); }
}
async function usersCreate(req, res, db, actor) {
  let body;
  try { body = await readJson(req); } catch { return userWriteError(res, 400, "Invalid user data."); }
  const name = String(body.name || "").trim(); const email = String(body.email || "").trim().toLowerCase(); const role = String(body.role || "").trim(); const password = String(body.temporary_password || "");
  if (!name || !EMAIL_RE.test(email) || !USER_ROLES.includes(role) || password.length < 12) return userWriteError(res, 400, "Invalid user data.");
  if (!canManageRole(actor.role, role)) return userWriteError(res, 403, "You do not have permission to manage this role.");
  if (!await userWriteAllowed(db, req, actor)) return userWriteError(res, 429, "Too many requests.");
  if (await db.userByEmail(email)) return userWriteError(res, 409, "User already exists.");
  const id = `user-${crypto.randomUUID()}`; const salt = crypto.randomBytes(16).toString("hex"); const hash = S.passwordHash(password, salt).toString("hex");
  try {
    await transaction(db, async (tx) => {
      await tx.query("INSERT INTO users (id, name, email, role, active, offboarded, must_change_password) VALUES ($1, $2, $3, $4, true, false, true)", [id, name, email, role]);
      await tx.query("INSERT INTO credentials (user_id, hash, salt) VALUES ($1, $2, $3)", [id, hash, salt]);
      await writeAudit(tx, { actorUserId: actor.id, action: "member.created", entityType: "user", entityId: id, newValue: role, ip: req.socket.remoteAddress });
    });
    await clearUserWriteThrottle(db, actor);
    return json(res, 201, { user: publicMember({ id, name, email, role, active: true }) });
  } catch (error) {
    if (error && error.code === "23505") return userWriteError(res, 409, "User already exists.");
    return userWriteError(res, 500, "Unable to manage users.");
  }
}
async function usersDeactivate(req, res, db, actor, id, offboard = false) {
  if (!await userWriteAllowed(db, req, actor)) return userWriteError(res, 429, "Too many requests.");
  const target = await db.userById(id);
  if (!target) return userWriteError(res, 404, "User not found.");
  if (target.id === actor.id || target.role === "Owner" || target.role === "Super Admin") return userWriteError(res, 403, "This user cannot be deactivated.");
  try {
    await transaction(db, async (tx) => { await tx.query("DELETE FROM credentials WHERE user_id = $1", [id]); await tx.query("DELETE FROM sessions WHERE user_id = $1", [id]); await tx.query("UPDATE users SET active = false, offboarded = $2 WHERE id = $1", [id, offboard]); await writeAudit(tx, { actorUserId: actor.id, action: offboard ? "member.offboarded" : "member.deactivated", entityType: "user", entityId: id, oldValue: "active", newValue: offboard ? "offboarded" : "inactive", ip: req.socket.remoteAddress }); }); await clearUserWriteThrottle(db, actor); return json(res, 200, { user: publicMember({ ...target, active: false, offboarded: offboard }) });
  } catch { return userWriteError(res, 500, "Unable to manage users."); }
}
async function usersResetPassword(req, res, db, actor, id) {
  let body;
  try { body = await readJson(req); } catch { return userWriteError(res, 400, "Invalid user data."); }
  const password = String(body.temporary_password || ""); if (password.length < 12) return userWriteError(res, 400, "Invalid user data.");
  if (!await userWriteAllowed(db, req, actor)) return userWriteError(res, 429, "Too many requests.");
  const target = await db.userById(id); if (!target) return userWriteError(res, 404, "User not found.");
  if (target.role === "Owner" || target.role === "Super Admin") return userWriteError(res, 403, "This user cannot be edited.");
  const salt = crypto.randomBytes(16).toString("hex"); const hash = S.passwordHash(password, salt).toString("hex");
  try { await transaction(db, async (tx) => { await tx.query("INSERT INTO credentials (user_id, hash, salt) VALUES ($1, $2, $3) ON CONFLICT (user_id) DO UPDATE SET hash = EXCLUDED.hash, salt = EXCLUDED.salt, updated_at = now()", [id, hash, salt]); await tx.query("UPDATE users SET must_change_password = true WHERE id = $1", [id]); await tx.query("DELETE FROM sessions WHERE user_id = $1", [id]); await writeAudit(tx, { actorUserId: actor.id, action: "member.password_reset", entityType: "user", entityId: id, field: "password", newValue: "reset", ip: req.socket.remoteAddress }); }); await clearUserWriteThrottle(db, actor); return json(res, 200, { user: publicMember(target) }); } catch { return userWriteError(res, 500, "Unable to manage users."); }
}

async function changePassword(req, res, db, user) {
  let body;
  try { body = await readJson(req); } catch { return userWriteError(res, 400, "Invalid password data."); }
  const password = String(body.new_password || "");
  if (password.length < 12 || password !== String(body.confirm_password || "")) return userWriteError(res, 400, "Invalid password data.");
  const salt = crypto.randomBytes(16).toString("hex"); const hash = S.passwordHash(password, salt).toString("hex");
  try { await transaction(db, async (tx) => { await tx.query("INSERT INTO credentials (user_id, hash, salt) VALUES ($1, $2, $3) ON CONFLICT (user_id) DO UPDATE SET hash = EXCLUDED.hash, salt = EXCLUDED.salt, updated_at = now()", [user.id, hash, salt]); await tx.query("UPDATE users SET must_change_password = false WHERE id = $1", [user.id]); await writeAudit(tx, { actorUserId: user.id, action: "password.changed", entityType: "user", entityId: user.id, field: "password", newValue: "changed", ip: req.socket.remoteAddress }); }); return json(res, 200, { user: publicUser({ ...user, must_change_password: false }) }); } catch { return userWriteError(res, 500, "Unable to change password."); }
}

const MASTER_FLAG_FIELDS = ["is_connected", "is_no_answer", "is_ringing", "is_dnd", "is_follow_up", "is_final"];
function masterPublic(row) { return { id: row.id, source_id: row.source_id, master_type: row.master_type, code: row.code, label: row.label, colour: row.colour, sort_order: row.sort_order, active: row.active, value: row.value, ...Object.fromEntries(MASTER_FLAG_FIELDS.map((field) => [field, Boolean(row[field])])) }; }
async function mastersList(req, res, db) {
  const type = new URL(req.url || "/", "http://localhost").searchParams.get("type");
  const params = type ? [type] : [];
  const rows = await db.query(`SELECT id,source_id,master_type,code,label,colour,sort_order,active,value,${MASTER_FLAG_FIELDS.join(",")} FROM master_values ${type ? "WHERE master_type = $1" : ""} ORDER BY master_type,sort_order,label`, params);
  return json(res, 200, { values: rows.rows.map(masterPublic) });
}
async function masterWrite(req, res, db, actor, id = null) {
  const body = await readJson(req); const masterType = String(body.master_type || "").trim(); const label = String(body.label || "").trim();
  if (!masterType || !label) return userWriteError(res, 400, "Invalid master value.");
  if (masterType === "resolution" && !["Admin", "Owner"].includes(actor.role)) return userWriteError(res, 403, "Only Admin or Owner may add resolutions.");
  const values = [String(body.source_id || id || `master-${crypto.randomUUID()}`), masterType, String(body.code || "").trim() || null, label, String(body.colour || "").trim() || null, Number.isInteger(body.sort_order) ? body.sort_order : 0, body.active !== false, body.value && typeof body.value === "object" ? body.value : {}, ...MASTER_FLAG_FIELDS.map((field) => body[field] === true)];
  const targetId = id || `master-${crypto.randomUUID()}`;
  await transaction(db, async (tx) => { await tx.query(`INSERT INTO master_values (id,source_id,master_type,code,label,colour,sort_order,active,value,${MASTER_FLAG_FIELDS.join(",")},updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,${MASTER_FLAG_FIELDS.map((_, i) => `$${10 + i}`).join(",")},now()) ON CONFLICT (id) DO UPDATE SET master_type=EXCLUDED.master_type,code=EXCLUDED.code,label=EXCLUDED.label,colour=EXCLUDED.colour,sort_order=EXCLUDED.sort_order,active=EXCLUDED.active,value=EXCLUDED.value,${MASTER_FLAG_FIELDS.map((field) => `${field}=EXCLUDED.${field}`).join(",")},updated_at=now()`, [targetId, ...values]); await writeAudit(tx, { actorUserId: actor.id, action: id ? "master.updated" : "master.created", entityType: "master_value", entityId: targetId, newValue: masterType, ip: req.socket.remoteAddress }); });
  return json(res, id ? 200 : 201, { id: targetId });
}
async function targetsList(res, db) { const rows = await db.query("SELECT id,source_id,user_id,target_date,weekday,week_start,quarter_start,non_keynote_target,keynote_target,total_target,day_override,week_override,quarter_override,absent FROM user_targets ORDER BY target_date NULLS LAST,user_id", []); return json(res, 200, { targets: rows.rows }); }
async function targetWrite(req, res, db, actor, id = null) { const body = await readJson(req); const userId = String(body.user_id || "").trim(); if (!userId) return userWriteError(res, 400, "Invalid target."); const targetId = id || `target-${crypto.randomUUID()}`; const values = [targetId, String(body.source_id || targetId), userId, body.target_date || null, body.weekday ?? null, body.week_start || null, body.quarter_start || null, Number(body.non_keynote_target || 0), Number(body.keynote_target || 0), Number(body.total_target || 0), body.day_override ?? null, body.week_override ?? null, body.quarter_override ?? null, body.absent === true]; await transaction(db, async (tx) => { await tx.query("INSERT INTO user_targets (id,source_id,user_id,target_date,weekday,week_start,quarter_start,non_keynote_target,keynote_target,total_target,day_override,week_override,quarter_override,absent,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,now()) ON CONFLICT (id) DO UPDATE SET user_id=EXCLUDED.user_id,target_date=EXCLUDED.target_date,weekday=EXCLUDED.weekday,week_start=EXCLUDED.week_start,quarter_start=EXCLUDED.quarter_start,non_keynote_target=EXCLUDED.non_keynote_target,keynote_target=EXCLUDED.keynote_target,total_target=EXCLUDED.total_target,day_override=EXCLUDED.day_override,week_override=EXCLUDED.week_override,quarter_override=EXCLUDED.quarter_override,absent=EXCLUDED.absent,updated_at=now()", values); await writeAudit(tx, { actorUserId: actor.id, action: id ? "target.updated" : "target.created", entityType: "user_target", entityId: targetId, ip: req.socket.remoteAddress }); }); return json(res, id ? 200 : 201, { id: targetId }); }
async function settingsList(res, db) { const rows = await db.query("SELECT setting_key,value,active,updated_at FROM workspace_settings ORDER BY setting_key", []); return json(res, 200, { settings: rows.rows }); }
async function settingWrite(req, res, db, actor) { const body = await readJson(req); const key = String(body.setting_key || "").trim(); if (!key || body.value === undefined) return userWriteError(res, 400, "Invalid workspace setting."); await transaction(db, async (tx) => { const previous = (await tx.query("SELECT value FROM workspace_settings WHERE setting_key = $1", [key])).rows[0]?.value ?? null; await tx.query("INSERT INTO workspace_settings(setting_key,value,active,updated_by,updated_at) VALUES ($1,$2,true,$3,now()) ON CONFLICT (setting_key) DO UPDATE SET value=EXCLUDED.value,updated_by=EXCLUDED.updated_by,updated_at=now()", [key, body.value, actor.id]); await writeAudit(tx, { actorUserId: actor.id, action: "workspace_setting.updated", entityType: "workspace_setting", entityId: key, oldValue: JSON.stringify(previous), newValue: JSON.stringify(body.value), ip: req.socket.remoteAddress }); }); return json(res, 200, { setting_key: key }); }
async function employeesList(res, db) { const rows = await db.query("SELECT u.id,u.name,u.email,u.role,u.active,u.offboarded,e.serial,e.cell,e.products,e.backup_user_id,e.lead_transfer_allowed,e.colour,e.team FROM users u LEFT JOIN employee_profiles e ON e.user_id=u.id ORDER BY u.name,u.id", []); return json(res, 200, { employees: rows.rows }); }
async function userOptionsList(res, db) { const rows = await db.query("SELECT id,name FROM users WHERE active=true AND offboarded=false ORDER BY name,id", []); return json(res, 200, { options: rows.rows.map((row) => ({ id: row.id, dropdown_id: "api-users", label: row.name, value: row.id, semantic_key: null, sort_order: 0, is_active: true })) }); }
async function employeeWrite(req, res, db, actor, id = null) { const body = await readJson(req); const userId = String(body.user_id || id || "").trim(); const role = body.role ? String(body.role) : null; if (!userId || (role && !USER_ROLES.includes(role))) return userWriteError(res, 400, "Invalid employee."); const target = await db.userById(userId); if (!target) return userWriteError(res, 404, "User not found."); if ((target.role === "Owner" || role === "Owner") && actor.role !== "Owner") return userWriteError(res, 403, "Owner accounts cannot be edited."); await transaction(db, async (tx) => { await tx.query("INSERT INTO employee_profiles(user_id,serial,cell,products,backup_user_id,lead_transfer_allowed,colour,team,active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(user_id) DO UPDATE SET serial=EXCLUDED.serial,cell=EXCLUDED.cell,products=EXCLUDED.products,backup_user_id=EXCLUDED.backup_user_id,lead_transfer_allowed=EXCLUDED.lead_transfer_allowed,colour=EXCLUDED.colour,team=EXCLUDED.team,active=EXCLUDED.active", [userId, body.serial || null, body.cell || null, body.products || [], body.backup_user_id || null, body.lead_transfer_allowed === true, body.colour || null, body.team || null, body.active !== false]); await tx.query("UPDATE users SET role=COALESCE($2,role),active=$3 WHERE id=$1", [userId, role, body.active !== false]); await writeAudit(tx, { actorUserId: actor.id, action: "employee.updated", entityType: "user", entityId: userId, oldValue: target.role, newValue: role || target.role, ip: req.socket.remoteAddress }); }); return json(res, 200, { user_id: userId }); }
async function employeeOffboard(req, res, db, actor, id) { const body = await readJson(req); const replacement = body.replacement_user_id ? String(body.replacement_user_id) : null; const target = await db.userById(id); if (!target) return userWriteError(res, 404, "User not found."); if (target.id === actor.id || target.role === "Owner" || target.role === "Super Admin") return userWriteError(res, 403, "This user cannot be offboarded."); await transaction(db, async (tx) => { await tx.query("UPDATE leads SET owner_user_id = $2 WHERE owner_user_id = $1", [id, replacement]); await tx.query("DELETE FROM credentials WHERE user_id=$1", [id]); await tx.query("DELETE FROM sessions WHERE user_id=$1", [id]); await tx.query("UPDATE users SET active=false,offboarded=true WHERE id=$1", [id]); await tx.query("UPDATE employee_profiles SET active=false,offboarded_at=now() WHERE user_id=$1", [id]); await writeAudit(tx, { actorUserId: actor.id, action: "employee.offboarded", entityType: "user", entityId: id, oldValue: id, newValue: replacement || "unassigned", ip: req.socket.remoteAddress }); }); return json(res, 200, { user: publicMember({ ...target, active: false }) }); }
function staticFile(req, res) {
  const requested = decodeURIComponent(new URL(req.url || "/", "http://localhost").pathname);
  const relative = requested === "/" ? "/index.html" : requested;
  const candidate = path.resolve(STATIC, "." + relative);
  const fallback = path.join(STATIC, "index.html");
  const file = candidate.startsWith(STATIC + path.sep) && fs.existsSync(candidate) && fs.statSync(candidate).isFile() ? candidate : fallback;
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return false;
  const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml" };
  res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" }); res.end(fs.readFileSync(file)); return true;
}

async function login(req, res, db) {
  const body = await readJson(req); const email = String(body.email || "").trim().toLowerCase();
  if (S.forwardedAddressMissing(req, PROXY_CONFIG)) return json(res, 500, { error: "This server is behind a proxy that is not forwarding the client address, so sign-in is refused until it does." });
  const hit = await S.isThrottled(db, req, email, PROXY_CONFIG); if (hit) { const mins = Math.max(1, Math.ceil((hit.until - Date.now()) / 60000)); return json(res, 429, { error: `${S.BUCKET_WORDS[hit.kind]} is locked for ${mins} more minute${mins === 1 ? "" : "s"} after too many wrong passwords.` }); }
  const user = await db.userByEmail(email); const ok = await db.checkPassword(user?.id, String(body.password || ""));
  if (!ok) { try { await S.recordFailure(db, req, email, PROXY_CONFIG); } catch {} try { await writeAudit(db, { action: "auth.login_failed", entityType: "auth", entityId: email, newValue: "rejected", ip: req.socket.remoteAddress }); } catch {} return json(res, 401, { error: "That email and password do not match." }); }
  if (!user.active || user.offboarded) return json(res, 403, { error: "This account is switched off." });
  await db.throttleClear(S.accountBuckets(email));
  const token = await db.createSession(user.id, req.socket.remoteAddress || "");
  try { await writeAudit(db, { actorUserId: user.id, action: "auth.login_succeeded", entityType: "auth", entityId: user.id, newValue: "session_created", ip: req.socket.remoteAddress }); } catch {}
  return json(res, 200, { ok: true, user: publicUser(user) }, { "Set-Cookie": S.sessionCookie(req, token, S.SESSION_SECONDS, PROXY_CONFIG) });
}

async function route(req, res, db) {
  S.securityHeaders(res);
  const url = new URL(req.url || "/", "http://localhost");
  if (req.method === "POST" && !S.csrfValid(req)) return json(res, 403, { error: "Missing request header." });
  if (url.pathname === "/api/health" && req.method === "GET") return json(res, 200, { ok: true, app: "altus-crm", singleTenant: true });
  if (url.pathname === "/api/login" && req.method === "POST") return login(req, res, db);
  if (!url.pathname.startsWith("/api/") && req.method === "GET" && staticFile(req, res)) return;
  const token = S.sessionToken(req); const id = await db.sessionUser(token); const user = id ? await db.userById(id) : null;
  if (url.pathname === "/api/me" && req.method === "GET") return user ? json(res, 200, { user: publicUser(user) }) : json(res, 401, { error: "Please sign in." });
  if (!user) return json(res, 401, { error: "Please sign in." });
  if (url.pathname === "/api/change-password" && req.method === "POST") return changePassword(req, res, db, user);
  if (url.pathname === "/api/dropdowns" && req.method === "GET") return safeUserOperation(res, () => Dropdowns.dropdownsList(req, res, db, user));
  if (url.pathname === "/api/dropdowns" && req.method === "POST") return safeUserOperation(res, () => Dropdowns.createDefinition(req, res, db, user));
  const dropdownOptionReorderMatch = url.pathname.match(/^\/api\/dropdowns\/([^/]+)\/options\/reorder$/);
  if (dropdownOptionReorderMatch && req.method === "POST") return safeUserOperation(res, () => Dropdowns.reorderOptions(req, res, db, user, decodeURIComponent(dropdownOptionReorderMatch[1])));
  const dropdownOptionActionMatch = url.pathname.match(/^\/api\/dropdowns\/([^/]+)\/options\/([^/]+)\/(deactivate)$/);
  if (dropdownOptionActionMatch && req.method === "POST") return safeUserOperation(res, () => Dropdowns.deactivateOption(req, res, db, user, decodeURIComponent(dropdownOptionActionMatch[1]), decodeURIComponent(dropdownOptionActionMatch[2])));
  const dropdownOptionMatch = url.pathname.match(/^\/api\/dropdowns\/([^/]+)\/options\/([^/]+)$/);
  if (dropdownOptionMatch && req.method === "POST") return safeUserOperation(res, () => Dropdowns.updateOption(req, res, db, user, decodeURIComponent(dropdownOptionMatch[1]), decodeURIComponent(dropdownOptionMatch[2])));
  const dropdownOptionsMatch = url.pathname.match(/^\/api\/dropdowns\/([^/]+)\/options$/);
  if (dropdownOptionsMatch && req.method === "POST") return safeUserOperation(res, () => Dropdowns.createOption(req, res, db, user, decodeURIComponent(dropdownOptionsMatch[1])));
  const dropdownDeactivateMatch = url.pathname.match(/^\/api\/dropdowns\/([^/]+)\/deactivate$/);
  if (dropdownDeactivateMatch && req.method === "POST") return safeUserOperation(res, () => Dropdowns.deactivateDefinition(req, res, db, user, decodeURIComponent(dropdownDeactivateMatch[1])));
  const dropdownMatch = url.pathname.match(/^\/api\/dropdowns\/([^/]+)$/);
  if (dropdownMatch && req.method === "POST") return safeUserOperation(res, () => Dropdowns.updateDefinition(req, res, db, user, decodeURIComponent(dropdownMatch[1])));
  if (url.pathname === "/api/user-options" && req.method === "GET") return safeUserOperation(res, () => userOptionsList(res, db));
  const adminMatch = url.pathname.match(/^\/api\/admin\/([^/]+)$/);
  if (adminMatch && req.method === "GET") {
    if (!requireCapability("nav.admin", user)) return json(res, 403, { error: "You do not have permission to access this resource." });
    if (!ADMIN_SCREENS.has(adminMatch[1])) return json(res, 404, { error: "Not found." });
    return adminScreen(res, db, adminMatch[1]);
  }
  if (url.pathname === "/api/users" && req.method === "GET") {
    if (!requireCapability("users.manage", user)) return userWriteError(res, 403, "You do not have permission to manage users.");
    return safeUserOperation(res, () => usersList(res, db));
  }
  if (url.pathname === "/api/users" && req.method === "POST") {
    if (!requireCapability("users.manage", user)) return userWriteError(res, 403, "You do not have permission to manage users.");
    return safeUserOperation(res, () => usersCreate(req, res, db, user));
  }
  const userMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/(deactivate|offboard|reset-password)$/);
  if (userMatch && req.method === "POST") {
    if (!requireCapability("users.manage", user)) return userWriteError(res, 403, "You do not have permission to manage users.");
    if (userMatch[2] === "reset-password" && !requireCapability("users.reset_password", user)) return userWriteError(res, 403, "You do not have permission to reset passwords.");
    const targetId = decodeURIComponent(userMatch[1]);
    return safeUserOperation(res, () => userMatch[2] === "reset-password" ? usersResetPassword(req, res, db, user, targetId) : usersDeactivate(req, res, db, user, targetId, userMatch[2] === "offboard"));
  }
  if (url.pathname === "/api/masters" && req.method === "GET") { if (!requireCapability("masters.view", user)) return userWriteError(res, 403, "You do not have permission to view masters."); return safeUserOperation(res, () => mastersList(req, res, db)); }
  if (url.pathname === "/api/masters" && req.method === "POST") { if (!requireCapability("masters.edit", user)) return userWriteError(res, 403, "You do not have permission to edit masters."); return safeUserOperation(res, () => masterWrite(req, res, db, user)); }
  const masterMatch = url.pathname.match(/^\/api\/masters\/([^/]+)$/); if (masterMatch && req.method === "POST") { if (!requireCapability("masters.edit", user)) return userWriteError(res, 403, "You do not have permission to edit masters."); return safeUserOperation(res, () => masterWrite(req, res, db, user, decodeURIComponent(masterMatch[1]))); }
  if (url.pathname === "/api/targets" && req.method === "GET") { if (!requireCapability("targets.manage", user)) return userWriteError(res, 403, "You do not have permission to view targets."); return safeUserOperation(res, () => targetsList(res, db)); }
  if (url.pathname === "/api/targets" && req.method === "POST") { if (!requireCapability("targets.manage", user)) return userWriteError(res, 403, "You do not have permission to edit targets."); return safeUserOperation(res, () => targetWrite(req, res, db, user)); }
  const targetMatch = url.pathname.match(/^\/api\/targets\/([^/]+)$/); if (targetMatch && req.method === "POST") { if (!requireCapability("targets.manage", user)) return userWriteError(res, 403, "You do not have permission to edit targets."); return safeUserOperation(res, () => targetWrite(req, res, db, user, decodeURIComponent(targetMatch[1]))); }
  if (url.pathname === "/api/workspace-settings" && req.method === "GET") { if (!requireCapability("workspace.manage", user)) return userWriteError(res, 403, "You do not have permission to view workspace settings."); return safeUserOperation(res, () => settingsList(res, db)); }
  if (url.pathname === "/api/workspace-settings" && req.method === "POST") { if (!requireCapability("workspace.manage", user)) return userWriteError(res, 403, "You do not have permission to edit workspace settings."); return safeUserOperation(res, () => settingWrite(req, res, db, user)); }
  if (url.pathname === "/api/employees" && req.method === "GET") { if (!requireCapability("employees.manage", user)) return userWriteError(res, 403, "You do not have permission to view employees."); return safeUserOperation(res, () => employeesList(res, db)); }
  if (url.pathname === "/api/employees" && req.method === "POST") { if (!requireCapability("employees.manage", user)) return userWriteError(res, 403, "You do not have permission to edit employees."); return safeUserOperation(res, () => employeeWrite(req, res, db, user)); }
  const employeeOffboardMatch = url.pathname.match(/^\/api\/employees\/([^/]+)\/offboard$/); if (employeeOffboardMatch && req.method === "POST") { if (!requireCapability("employees.manage", user)) return userWriteError(res, 403, "You do not have permission to offboard employees."); return safeUserOperation(res, () => employeeOffboard(req, res, db, user, decodeURIComponent(employeeOffboardMatch[1]))); }
  if (url.pathname === "/api/accounts/export.csv" && req.method === "GET") { if (!requireCapability("accounts.export", user)) return userWriteError(res, 403, "You do not have permission to export accounts."); return safeUserOperation(res, () => A.accountsExport(res, db, url)); }
  if (url.pathname === "/api/accounts" && req.method === "GET") { if (!requireCapability("accounts.view", user)) return userWriteError(res, 403, "You do not have permission to view accounts."); return safeUserOperation(res, () => A.accountsList(req, res, db, url)); }
  if (url.pathname === "/api/accounts" && req.method === "POST") { if (!requireCapability("accounts.create", user)) return userWriteError(res, 403, "You do not have permission to create accounts."); return safeUserOperation(res, () => A.createAccount(req, res, db, user)); }
  const accountContactsMatch = url.pathname.match(/^\/api\/accounts\/([^/]+)\/contacts$/); if (accountContactsMatch && req.method === "GET") { if (!requireCapability("contacts.view", user)) return userWriteError(res, 403, "You do not have permission to view contacts."); return safeUserOperation(res, () => A.contactsList(res, db, new URL(`http://localhost/api/contacts?account_id=${encodeURIComponent(decodeURIComponent(accountContactsMatch[1]))}`))); }
  const accountMatch = url.pathname.match(/^\/api\/accounts\/([^/]+)$/); if (accountMatch && req.method === "GET") { if (!requireCapability("accounts.view", user)) return userWriteError(res, 403, "You do not have permission to view accounts."); return safeUserOperation(res, () => A.accountDetail(res, db, decodeURIComponent(accountMatch[1]))); }
  if (accountMatch && ["PATCH", "PUT"].includes(req.method)) { if (!requireCapability("accounts.edit", user)) return userWriteError(res, 403, "You do not have permission to edit accounts."); return safeUserOperation(res, () => A.updateAccount(req, res, db, user, decodeURIComponent(accountMatch[1]))); }
  if (accountMatch && req.method === "DELETE") { if (!requireCapability("accounts.delete", user)) return userWriteError(res, 403, "You do not have permission to archive accounts."); return safeUserOperation(res, () => A.archiveAccount(req, res, db, user, decodeURIComponent(accountMatch[1]))); }
  if (url.pathname === "/api/contacts/export.csv" && req.method === "GET") { if (!requireCapability("contacts.export", user)) return userWriteError(res, 403, "You do not have permission to export contacts."); return safeUserOperation(res, () => A.contactsExport(res, db, url)); }
  if (url.pathname === "/api/contacts" && req.method === "GET") { if (!requireCapability("contacts.view", user)) return userWriteError(res, 403, "You do not have permission to view contacts."); return safeUserOperation(res, () => A.contactsList(res, db, url)); }
  if (url.pathname === "/api/contacts" && req.method === "POST") { if (!requireCapability("contacts.create", user)) return userWriteError(res, 403, "You do not have permission to create contacts."); return safeUserOperation(res, () => A.createContact(req, res, db, user)); }
  const contactMatch = url.pathname.match(/^\/api\/contacts\/([^/]+)$/); if (contactMatch && req.method === "GET") { if (!requireCapability("contacts.view", user)) return userWriteError(res, 403, "You do not have permission to view contacts."); return safeUserOperation(res, () => A.contactDetail(res, db, decodeURIComponent(contactMatch[1]))); }
  if (contactMatch && ["PATCH", "PUT"].includes(req.method)) { if (!requireCapability("contacts.edit", user)) return userWriteError(res, 403, "You do not have permission to edit contacts."); return safeUserOperation(res, () => A.updateContact(req, res, db, user, decodeURIComponent(contactMatch[1]))); }
  if (contactMatch && req.method === "DELETE") { if (!requireCapability("contacts.delete", user)) return userWriteError(res, 403, "You do not have permission to archive contacts."); return safeUserOperation(res, () => A.archiveContact(req, res, db, user, decodeURIComponent(contactMatch[1]))); }
  const convertAccountMatch = url.pathname.match(/^\/api\/leads\/([^/]+)\/convert-account$/); if (convertAccountMatch && req.method === "POST") { if (!requireCapability("accounts.create", user) || !requireCapability("contacts.create", user)) return userWriteError(res, 403, "You do not have permission to convert leads."); return safeUserOperation(res, () => A.convertLead(req, res, db, user, decodeURIComponent(convertAccountMatch[1]))); }
  if (url.pathname === "/api/lead-quick-filters" && req.method === "GET") { if (!requireCapability("leads.view", user)) return json(res, 403, { error: "You do not have permission to access this resource." }); return quickFiltersList(res, db, user); }
  if (url.pathname === "/api/lead-quick-filters" && req.method === "POST") { if (!requireCapability("leads.edit", user)) return json(res, 403, { error: "You do not have permission to edit leads." }); return quickFilterCreate(req, res, db, user); }
  const quickFilterMatch = url.pathname.match(/^\/api\/lead-quick-filters\/([^/]+)$/);
  if (quickFilterMatch && ["PATCH", "PUT"].includes(req.method)) { if (!requireCapability("leads.edit", user)) return json(res, 403, { error: "You do not have permission to edit leads." }); return quickFilterUpdate(req, res, db, user, decodeURIComponent(quickFilterMatch[1])); }
  if (quickFilterMatch && req.method === "DELETE") { if (!requireCapability("leads.edit", user)) return json(res, 403, { error: "You do not have permission to edit leads." }); return quickFilterDelete(res, db, user, decodeURIComponent(quickFilterMatch[1])); }
  const activityMatch = url.pathname.match(/^\/api\/leads\/([^/]+)\/activity\/(history|calls|followups|messages|notes)$/);
  if (activityMatch && req.method === "GET") { if (!requireCapability("leads.view", user)) return json(res, 403, { error: "You do not have permission to access this resource." }); return activityList(res, db, decodeURIComponent(activityMatch[1]), activityMatch[2], url); }
  const noteMatch = url.pathname.match(/^\/api\/leads\/([^/]+)\/notes$/);
  if (noteMatch && req.method === "POST") { if (!requireCapability("leads.edit", user)) return json(res, 403, { error: "You do not have permission to edit leads." }); return addLeadNote(req, res, db, user, decodeURIComponent(noteMatch[1])); }
  const callMatch = url.pathname.match(/^\/api\/leads\/([^/]+)\/calls$/);
  if (callMatch && req.method === "POST") { if (!requireCapability("leads.call", user)) return json(res, 403, { error: "You do not have permission to log calls." }); return addLeadCall(req, res, db, user, decodeURIComponent(callMatch[1])); }
  const followupCreateMatch = url.pathname.match(/^\/api\/leads\/([^/]+)\/followups$/);
  if (followupCreateMatch && req.method === "POST") { if (!requireCapability("leads.edit", user)) return json(res, 403, { error: "You do not have permission to edit leads." }); return addLeadFollowup(req, res, db, user, decodeURIComponent(followupCreateMatch[1])); }
  const followupActionMatch = url.pathname.match(/^\/api\/leads\/([^/]+)\/followups\/([^/]+)\/(reschedule|complete)$/);
  if (followupActionMatch && req.method === "POST") { if (!requireCapability("leads.edit", user)) return json(res, 403, { error: "You do not have permission to edit leads." }); const leadId = decodeURIComponent(followupActionMatch[1]); const followupId = decodeURIComponent(followupActionMatch[2]); return followupActionMatch[3] === "reschedule" ? rescheduleLeadFollowup(req, res, db, user, leadId, followupId) : completeLeadFollowup(req, res, db, user, leadId, followupId); }
  if (url.pathname === "/api/leads" && req.method === "GET") {
    if (!requireCapability("leads.view", user)) return json(res, 403, { error: "You do not have permission to access this resource." });
    return leadsList(req, res, db, url);
  }
  if (url.pathname === "/api/leads/counts" && req.method === "GET") {
    if (!requireCapability("leads.view", user)) return json(res, 403, { error: "You do not have permission to access this resource." });
    try { return await leadsCounts(res, db); } catch { return json(res, 500, { error: "Unable to load lead counts." }); }
  }
  if (url.pathname === "/api/leads/import/preview" && req.method === "POST") {
    if (!requireCapability("leads.import", user)) return json(res, 403, { error: "You do not have permission to import leads." });
    try { return json(res, 200, await LeadImport.preview(req, db)); } catch (error) { return json(res, error.status || 500, error.analysis ? { error: error.message, ...error.analysis } : { error: error.status ? error.message : "Unable to preview the lead file." }); }
  }
  if (url.pathname === "/api/leads/import/template" && req.method === "GET") {
    if (!requireCapability("leads.import", user)) return json(res, 403, { error: "You do not have permission to import leads." });
    try { const format = url.searchParams.get("format") || "xlsx"; const file = await LeadImport.template(format); res.writeHead(200, { "Content-Type": file.contentType, "Content-Disposition": `attachment; filename="${file.filename}"`, "Cache-Control": "no-store" }); return res.end(file.body); }
    catch (error) { return json(res, error.status || 500, { error: error.status ? error.message : "Unable to create the lead template." }); }
  }
  if (url.pathname === "/api/leads/import/apply" && req.method === "POST") {
    if (!requireCapability("leads.import", user)) return json(res, 403, { error: "You do not have permission to import leads." });
    if (isSupabaseUrl(databaseConnectionString()) && process.env.ALLOW_SUPABASE_WRITE !== "1") return json(res, 403, { code: "SUPABASE_WRITE_BLOCKED", error: "Imports are blocked on this database. Start the server with ALLOW_SUPABASE_WRITE=1 for this process." });
    try { return json(res, 200, await LeadImport.apply(req, db, user)); } catch (error) { return json(res, error.status || 500, error.analysis ? { error: error.message, ...error.analysis } : { error: error.status ? error.message : "Unable to apply the lead import." }); }
  }
  if (url.pathname === "/api/leads" && req.method === "POST") { if (!requireCapability("leads.edit", user)) return json(res, 403, { error: "You do not have permission to edit leads." }); return createLead(req, res, db, user); }
  const roundRobinMatch = url.pathname.match(/^\/api\/leads\/([^/]+)\/round-robin$/);
  if (roundRobinMatch && req.method === "POST") { if (!requireCapability("leads.assign", user)) return json(res, 403, { error: "You do not have permission to assign leads." }); return reassignLeadRoundRobin(req, res, db, user, decodeURIComponent(roundRobinMatch[1])); }
  const leadWriteMatch = url.pathname.match(/^\/api\/leads\/([^/]+)\/(stage|permission|products)$/);
  if (leadWriteMatch && req.method === "POST") { const id = decodeURIComponent(leadWriteMatch[1]); if (leadWriteMatch[2] === "permission") { if (!requireCapability("leads.permission", user)) return json(res, 403, { error: "You do not have permission to change permission." }); return changeLeadPermission(req, res, db, user, id); } if (!requireCapability("leads.edit", user)) return json(res, 403, { error: "You do not have permission to edit leads." }); return leadWriteMatch[2] === "stage" ? changeLeadStage(req, res, db, user, id) : updateLeadProducts(req, res, db, user, id); }
  const leadUpdateMatch = url.pathname.match(/^\/api\/leads\/([^/]+)$/);
  if (leadUpdateMatch && ["PATCH", "PUT"].includes(req.method)) { if (!requireCapability("leads.edit", user)) return json(res, 403, { error: "You do not have permission to edit leads." }); return updateLead(req, res, db, user, decodeURIComponent(leadUpdateMatch[1])); }
  const leadMatch = url.pathname.match(/^\/api\/leads\/([^/]+)$/);
  if (leadMatch && req.method === "GET") {
    if (!requireCapability("leads.view", user)) return json(res, 403, { error: "You do not have permission to access this resource." });
    return leadDetail(req, res, db, decodeURIComponent(leadMatch[1]));
  }
  if (url.pathname === "/api/logout" && req.method === "POST") { await db.dropSession(token); try { await writeAudit(db, { actorUserId: user.id, action: "auth.logout", entityType: "auth", entityId: user.id, newValue: "session_deleted", ip: req.socket.remoteAddress }); } catch {} return json(res, 200, { ok: true }, { "Set-Cookie": S.sessionCookie(req, "", 0, PROXY_CONFIG) }); }
  return json(res, 404, { error: "Not found." });
}

async function start() {
  const guarded = guardedDatabaseUrl(PG_URL);
  if (!guarded.ok) { reportFailure("server", { code: guarded.code }, guarded.reason, guarded.target); process.exitCode = 3; return; }
  if (HOST !== "127.0.0.1") console.warn("Altus CRM server is listening beyond the local machine; allow only the app port through the firewall.");
  const db = await openDb(guarded.value);
  await db.pruneSessions();
  await db.throttlePrune();
  setInterval(() => { db.pruneSessions().catch(() => {}); db.throttlePrune().catch(() => {}); }, 5 * 60000).unref();
  const server = http.createServer((req, res) => route(req, res, db).catch((error) => { console.error(`request failed method=${req.method} path=${new URL(req.url || "/", "http://localhost").pathname} code=${error?.code || error?.name || "unknown"}`); return json(res, 500, { error: "Request failed." }); }));
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(PORT, HOST, () => { console.log(`Altus CRM server listening on http://${HOST}:${PORT}`); resolve(); }); });
}

if (require.main === module) start().catch((error) => { reportFailure("server", error, error?.code === "EADDRINUSE" ? "Stop the process already using the API port." : "Check PostgreSQL availability and credentials."); process.exitCode = 1; });
module.exports = { login, route, publicUser, leadsList, leadsCounts, leadDetail, activityList, addLeadNote, addLeadCall, addLeadFollowup, rescheduleLeadFollowup, completeLeadFollowup, leadView, LEAD_SORTS, LEAD_VIEWS, quickFiltersList, quickFilterCreate, quickFilterUpdate, quickFilterDelete, QUICK_FILTER_FIELDS, QUICK_FILTER_OPERATORS, reassignLeadRoundRobin };
