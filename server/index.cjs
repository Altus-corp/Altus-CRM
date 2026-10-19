"use strict";

require("./load-env.cjs")();

const http = require("http");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const { openDb } = require("./db.cjs");
const S = require("./security.cjs");
const { CAPABILITIES, requireCapability, canManageRole } = require("./permissions.cjs");
const { ADMIN_SCREENS, adminScreen } = require("./admin.cjs");
const { writeAudit } = require("./audit.cjs");
const { editable: INLINE_EDITABLE_FIELDS, byKey: INLINE_COLUMNS } = require("./lead-inline-fields.cjs");
const A = require("./accounts.cjs");
const { QUICK_FILTER_FIELDS, QUICK_FILTER_OPERATORS, validateQuickFilter, buildQuickFilterWhere } = require("./quick-filters.cjs");
const { guardedDatabaseUrl, reportFailure, databaseConnectionString } = require("./load-env.cjs");
const { isSupabaseUrl } = require("./write-guard.cjs");
const { resolveLeadValue, sqlExpression } = require("../shared/lead-field-resolver.cjs");
const Dropdowns = require("./dropdowns.cjs");
const LeadImport = require("./lead-import.cjs");
const { assignLeadRoundRobin, writeAssignmentHistory } = require("./lead-assignment.cjs");
const PasswordReset = require("./password-reset.cjs");
const Integrations = require("./integrations.cjs");
const LeadFields = require("./lead-fields.cjs");
const LEAD_TABLE_COLUMN_KEYS = new Set([...require("../shared/lead-inline-columns.json").map((column) => column.key), "lead_status"]);
const CORE_INLINE_EDITABLE_FIELDS = new Map([...INLINE_EDITABLE_FIELDS].filter(([, field]) => field.storage.kind === "column"));
CORE_INLINE_EDITABLE_FIELDS.set("calling_resolution", INLINE_COLUMNS.get("calling_resolution"));
const DEFAULT_MANAGED_LEAD_FIELD_KEYS = new Set(LeadFields.DEFAULT_FIELDS.map((field) => field.key));

const PORT = Number(process.env.CRM_PORT || 4321);
const HOST = process.env.CRM_HOST || "127.0.0.1";
const STATIC = path.resolve(process.env.CRM_STATIC || path.join(__dirname, "..", "dist"));
const PG_URL = databaseConnectionString();
const PROXY_CONFIG = { behindProxy: process.env.CRM_BEHIND_PROXY === "1", publicIsHttps: String(process.env.CRM_PUBLIC_URL || "").startsWith("https:"), trustedProxies: new Set(String(process.env.CRM_TRUSTED_PROXIES || "").split(",").map((v) => v.trim()).filter(Boolean)) };
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, role_label: u.role_label || u.role, capability_overrides: Array.isArray(u.capability_overrides) ? u.capability_overrides : [], must_change_password: Boolean(u.must_change_password) });
async function publicCurrentUser(db, user) {
  if (!db || typeof db.query !== "function") return publicUser(user);
  let profile;
  try { profile = (await db.query("SELECT COALESCE(mr.name,ep.role_label) AS role_label FROM employee_profiles ep LEFT JOIN member_roles mr ON mr.id=ep.member_role_id WHERE ep.user_id=$1", [user.id])).rows[0]; }
  catch { profile = (await db.query("SELECT role_label FROM employee_profiles WHERE user_id=$1", [user.id])).rows[0]; }
  return publicUser({ ...user, role_label: profile?.role_label || user.role });
}
function sortText(expression) { return `LOWER(NULLIF(BTRIM(${expression}), ''))`; }
function sortNumber(expression) { return `CASE WHEN ${expression} ~ '^[+-]?(?:[0-9]+(?:\\.[0-9]*)?|\\.[0-9]+)$' THEN (${expression})::numeric ELSE NULL END`; }
function sortBoolean(expression) { return `CASE LOWER(BTRIM(COALESCE(${expression}, ''))) WHEN 'false' THEN 0 WHEN 'no' THEN 0 WHEN '0' THEN 0 WHEN 'true' THEN 1 WHEN 'yes' THEN 1 WHEN '1' THEN 1 ELSE NULL END`; }
function sortDate(expression) { return `CASE WHEN ${expression} ~ '^(?:(?:[0-9]{2}(?:0[48]|[2468][048]|[13579][26])|(?:[02468][048]00|[13579][26]00))-02-29|[0-9]{4}-(?:(?:01|03|05|07|08|10|12)-(?:0[1-9]|[12][0-9]|3[01])|(?:04|06|09|11)-(?:0[1-9]|[12][0-9]|30)|02-(?:0[1-9]|1[0-9]|2[0-8])))$' THEN ${expression} ELSE NULL END`; }
function sortTimestamp(expression) { return `CASE WHEN ${expression} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ](?:[01][0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9](?:\\.[0-9]{1,6})?)?Z?$' AND (${sortDate(`substring(${expression} from 1 for 10)`)} IS NOT NULL) THEN ${expression} ELSE NULL END`; }
function jsonValue(key) { const escaped = String(key).replace(/'/g, "''"); return `NULLIF(NULLIF(COALESCE(l.custom_values->'lead_fields'->>'${escaped}', l.custom_values->>'${escaped}', l.legacy_finance->>'${escaped}'), ''), 'Not provided')`; }
const LEAD_SORTS = {
  lead_no: sortText(sqlExpression("leadNo")), lead_type: sortText(sqlExpression("leadTypeCode")), name: sortText(sqlExpression("name")), first_name: sortText(sqlExpression("first_name")), last_name: sortText(sqlExpression("last_name")), cell_no: sortText(sqlExpression("cellNo")), email: sortText(sqlExpression("email")), company: sortText(sqlExpression("company")), designation: sortText(sqlExpression("designation")), city: sortText(sqlExpression("city")), source_system: sortText(sqlExpression("sourceSystem")), lead_source: sortText(sqlExpression("leadSource")), permission: sortText(sqlExpression("permission")), stage: sortText(sqlExpression("stage")), lead_status: sortText(sqlExpression("lead_status")), priority: sortText("l.priority"), owner: sortText("sort_owner.name"),
  pso_date: "l.pso_date", next_follow_up_at: "l.next_follow_up_at", last_call_at: sortTimestamp(`COALESCE(to_char(l.last_call_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS'), ${jsonValue("last_called_on")})`), created_at: "l.created_at", updated_at: "l.updated_at",
  lead_acquisition_date: sortDate(sqlExpression("lead_acquisition_date")), business_category: sortText(sqlExpression("business_category")), rating: sortText(sqlExpression("rating")), nature_of_business: sortText(sqlExpression("nature_of_business")), proposed_solution: sortText(sqlExpression("proposed_solution")), invite_sent_by_introducer: sortBoolean(sqlExpression("invite_sent_by_introducer")), invite_date_sent: sortDate(sqlExpression("invite_date_sent")), introducer_call_done: sortBoolean(sqlExpression("introducer_call_done")), introducer_call_date: sortDate(sqlExpression("introducer_call_date")), introducer_feedback: sortText(sqlExpression("introducer_feedback")), introducer_name: sortText(sqlExpression("introducer_name")), employee_name: sortText(sqlExpression("employee_name")), association_network_name: sortText(sqlExpression("association_network_name")), chapter_name: sortText(sqlExpression("chapter_name")), calling_resolution: sortText(sqlExpression("calling_resolution")), next_call_on: sortTimestamp(sqlExpression("next_call_on")), calling_remarks: sortText(sqlExpression("calling_remarks")), intro_video_sent: sortBoolean(sqlExpression("intro_video_sent")), email_sent: sortBoolean(sqlExpression("email_sent")), whatsapp_message_sent: sortBoolean(sqlExpression("whatsapp_message_sent")), extra_notes: sortText(sqlExpression("extra_notes")),
  service: sortText(jsonValue("service")), registration_time: sortTimestamp(jsonValue("registrationTime")), approval_status: sortText(jsonValue("approvalStatus")), zoom_or_physical: sortText(jsonValue("zoomOrPhysical")), confirmation_call_status: sortText(jsonValue("confirmationCallStatus")), zoom_link_sent: sortBoolean(jsonValue("zoomLinkSent")), attendance_status: sortText(jsonValue("attendanceStatus")), sales_follow_up_by: sortText(jsonValue("salesFollowUpBy")), sales_resolution: sortText(jsonValue("salesResolution")), camera_on: sortBoolean(jsonValue("cameraOn")), photo_taken: sortBoolean(jsonValue("photoTaken")), sales_notes: sortText(jsonValue("salesNotes")), left_halfway: sortBoolean(jsonValue("leftHalfway")), total_payable: sortNumber(jsonValue("totalPayable")), amount_paid: sortNumber(jsonValue("amountPaid")), balance_receivable: sortNumber(jsonValue("balanceReceivable")), target_date: sortDate(jsonValue("targetDate")),
};
function configuredLeadSortExpression(type, placeholder) {
  const value = `NULLIF(BTRIM(l.custom_values->'lead_fields'->>${placeholder}), '')`;
  if (type === "number") return sortNumber(value);
  if (type === "date") return sortDate(value);
  if (type === "boolean") return sortBoolean(value);
  return sortText(value);
}
const CANONICAL_LEAD_FIELDS = Object.freeze([
  "name", "first_name", "last_name", "leadNo", "leadTypeCode", "company", "cellNo", "phone", "email", "designation", "businessCategory", "business_category", "leadSource", "rating", "permission", "lastCalledOn", "last_called_on", "lead_acquisition_date", "nature_of_business", "proposed_solution", "invite_sent_by_introducer", "invite_date_sent", "introducer_call_done", "introducer_call_date", "introducer_feedback", "introducer_name", "employee_name", "association_network_name", "chapter_name", "calling_resolution", "next_call_on", "calling_remarks", "intro_video_sent", "email_sent", "whatsapp_message_sent", "extra_notes", "created_at", "updated_at", "last_opened_at",
]);
function materializeLead(lead) {
  const result = { ...lead };
  for (const key of CANONICAL_LEAD_FIELDS) {
    const value = resolveLeadValue(result, key);
    if (value !== null && value !== undefined && (result[key] === null || result[key] === undefined || result[key] === "")) result[key] = value;
  }
  return result;
}
const LEAD_STAGE_SEMANTIC = "(SELECT o.semantic_key FROM dropdown_options o JOIN dropdown_definitions d ON d.id=o.dropdown_id WHERE d.key='lead_stage' AND o.value=l.stage AND o.is_active=true LIMIT 1)";

const LEAD_VIEWS = Object.freeze({
  database: `${LEAD_STAGE_SEMANTIC} = 'database'`,
  new_leads: `${LEAD_STAGE_SEMANTIC} = 'lead'`,
  qualified: `${LEAD_STAGE_SEMANTIC} = 'qualified'`,
  references: `${LEAD_STAGE_SEMANTIC} = 'reference'`,
  permission_granted: "l.permission = 'Yes'",
  permission_pending: `${LEAD_STAGE_SEMANTIC} IN ('database','lead','qualified','reference') AND l.permission IS DISTINCT FROM 'Yes'`,
  calling_queue: `l.permission = 'Yes' AND ${LEAD_STAGE_SEMANTIC} IN ('assigned','calling')`,
  daily_call_chart: `l.permission = 'Yes' AND ${LEAD_STAGE_SEMANTIC} IN ('assigned','calling')`,
  registered: `${LEAD_STAGE_SEMANTIC} = 'registered'`,
  pre_pso: `${LEAD_STAGE_SEMANTIC} IN ('registered','prepso') AND NOT (l.pso_date <= CURRENT_DATE AND COALESCE(l.custom_values->>'attendanceStatus','') = '')`,
  during_pso: `${LEAD_STAGE_SEMANTIC} IN ('registered','prepso') AND l.pso_date <= CURRENT_DATE AND COALESCE(l.custom_values->>'attendanceStatus','') = ''`,
  attended: `${LEAD_STAGE_SEMANTIC} = 'attended'`,
  not_attended: `${LEAD_STAGE_SEMANTIC} = 'notattended'`,
  sale_registration: `${LEAD_STAGE_SEMANTIC} = 'psreg'`,
  pre_ps: `${LEAD_STAGE_SEMANTIC} IN ('psreg','preps','billed') AND COALESCE(l.is_pre_ps_done,false) = false`,
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

// Lead ownership is enforced on the server.  Hiding rows in the browser is not
// sufficient because a user could otherwise request another lead directly.
function canAccessAllLeads(actor) {
  return ["owner", "admin", "super admin", "viewer"].includes(String(actor?.role || "").trim().toLowerCase());
}
function leadAccessPredicate(actor, bind, column = "l.owner_user_id") {
  if (!actor || canAccessAllLeads(actor)) return null;
  return `${column} = ${bind(actor.id)}`;
}
async function canAccessLead(db, actor, id) {
  if (canAccessAllLeads(actor)) return Boolean((await db.query("SELECT id FROM leads WHERE id=$1 AND COALESCE(custom_values->>'archived','false') <> 'true'", [id])).rows[0]);
  return Boolean((await db.query("SELECT id FROM leads WHERE id=$1 AND owner_user_id=$2 AND COALESCE(custom_values->>'archived','false') <> 'true'", [id, actor.id])).rows[0]);
}

function leadView(view) {
  return LEAD_VIEWS[view] || null;
}

const LEAD_COUNT_VIEWS = Object.freeze({ all: "TRUE", ...LEAD_VIEWS });
const LEAD_TYPES = Object.freeze({ DL: "P3", L: "P3", QDL: "P3", QL: "P2", R: "P1" });
const PRODUCT_FUNNELS = Object.freeze({ Keynote: "keynote" });
function leadTypeValue(value) { const type = String(value || "").trim().toUpperCase(); return type || null; }
function leadPriority(type) { return LEAD_TYPES[type] || "P3"; }
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

const USER_PREFERENCE_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,120}$/;
const MAX_USER_PREFERENCE_KEYS = 100;
function validateUserPreferenceValue(value) {
  if (!Array.isArray(value) || value.length > MAX_USER_PREFERENCE_KEYS) return { error: "Preference value must be an ordered array of at most 100 keys." };
  const keys = value.map((key) => typeof key === "string" ? key.trim() : key);
  if (keys.some((key) => typeof key !== "string" || !key || !USER_PREFERENCE_KEY_RE.test(key))) return { error: "Preference value must contain non-empty string keys only." };
  if (new Set(keys).size !== keys.length) return { error: "Preference value must not contain duplicate keys." };
  return { value: keys };
}
async function userPreferenceGet(res, db, actor, key) {
  let result;
  try { result = await db.query("SELECT value FROM user_preferences WHERE user_id=$1 AND preference_key=$2", [actor.id, key]); }
  catch (error) { if (error?.code === "42P01") return json(res, 200, { value: null }); throw error; }
  const row = result.rows[0];
  return json(res, 200, { value: row?.value ?? null });
}
async function userPreferenceWrite(req, res, db, actor, key) {
  let body; try { body = await readJson(req); } catch { return json(res, 400, { error: "Invalid preference value." }); }
  const checked = validateUserPreferenceValue(body?.value);
  if (checked.error) return json(res, 400, { error: checked.error });
  try { await db.query("INSERT INTO user_preferences(user_id,preference_key,value,updated_at) VALUES($1,$2,$3::jsonb,now()) ON CONFLICT(user_id,preference_key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()", [actor.id, key, JSON.stringify(checked.value)]); }
  catch (error) { if (error?.code !== "42P01") throw error; }
  return json(res, 200, { value: checked.value });
}
async function userPreferenceDelete(res, db, actor, key) {
  try { await db.query("DELETE FROM user_preferences WHERE user_id=$1 AND preference_key=$2", [actor.id, key]); }
  catch (error) { if (error?.code !== "42P01") throw error; }
  return json(res, 200, { value: null });
}

const TABLE_PREFERENCES = {
  lead_master: { preferenceKey: "table_widths:lead_master", allowedColumns: LEAD_TABLE_COLUMN_KEYS, allowConfiguredFields: true },
};
const MIN_TABLE_COLUMN_WIDTH = 80;
const MAX_TABLE_COLUMN_WIDTH = 600;
const MAX_TABLE_COLUMN_WIDTHS = 30;
function tablePreferenceFor(tableKey) { return TABLE_PREFERENCES[tableKey] || null; }
function validateTableColumnWidths(value, preference) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { error: "Column widths must be an object." };
  const entries = Object.entries(value);
  if (entries.length > MAX_TABLE_COLUMN_WIDTHS) return { error: `Column widths may contain at most ${MAX_TABLE_COLUMN_WIDTHS} columns.` };
  for (const [key, width] of entries) {
    if (!preference.allowedColumns.has(key)) return { error: `Unknown table column: ${key}.` };
    if (!Number.isInteger(width) || width < MIN_TABLE_COLUMN_WIDTH || width > MAX_TABLE_COLUMN_WIDTH) return { error: `Column widths must be whole numbers between ${MIN_TABLE_COLUMN_WIDTH} and ${MAX_TABLE_COLUMN_WIDTH}.` };
  }
  return { value: Object.fromEntries(entries) };
}
async function tablePreferenceGet(res, db, actor, preference) {
  let result;
  try { result = await db.query("SELECT value FROM user_preferences WHERE user_id=$1 AND preference_key=$2", [actor.id, preference.preferenceKey]); }
  catch (error) { if (error?.code === "42P01") return json(res, 200, { widths: null }); throw error; }
  return json(res, 200, { widths: result.rows[0]?.value ?? null });
}
async function tablePreferenceWrite(req, res, db, actor, preference) {
  let body; try { body = await readJson(req); } catch { return json(res, 400, { error: "Invalid column widths." }); }
  let allowedColumns = preference.allowedColumns;
  if (preference.allowConfiguredFields) {
    try { allowedColumns = new Set([...allowedColumns, ...(await LeadFields.getDefinitions(db)).map((field) => field.key)]); } catch { /* the static Lead Master columns remain valid if field settings are unavailable */ }
  }
  const checked = validateTableColumnWidths(body?.widths, { ...preference, allowedColumns });
  if (checked.error) return json(res, 400, { error: checked.error });
  try { await db.query("INSERT INTO user_preferences(user_id,preference_key,value,updated_at) VALUES($1,$2,$3::jsonb,now()) ON CONFLICT(user_id,preference_key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()", [actor.id, preference.preferenceKey, JSON.stringify(checked.value)]); }
  catch (error) { if (error?.code !== "42P01") throw error; }
  return json(res, 200, { widths: checked.value });
}
async function tablePreferenceDelete(res, db, actor, preference) {
  try { await db.query("DELETE FROM user_preferences WHERE user_id=$1 AND preference_key=$2", [actor.id, preference.preferenceKey]); }
  catch (error) { if (error?.code !== "42P01") throw error; }
  return json(res, 200, { widths: null });
}

async function leadsCounts(res, db, actor) {
  const expressions = Object.entries(LEAD_COUNT_VIEWS).map(([key, predicate]) => `COUNT(*) FILTER (WHERE COALESCE(l.custom_values->>'archived','false') <> 'true' AND ${predicate})::int AS "${key}"`);
  const params = [];
  const bind = (value) => { params.push(value); return `$${params.length}`; };
  const ownership = leadAccessPredicate(actor, bind);
  const result = await db.query(`SELECT ${expressions.join(", ")} FROM leads l${ownership ? ` WHERE ${ownership}` : ""}`, params);
  const row = result.rows[0] || {};
  const counts = Object.fromEntries(Object.keys(LEAD_COUNT_VIEWS).map((key) => [key, Number.isFinite(Number(row[key])) ? Number(row[key]) : 0]));
  return json(res, 200, counts);
}

async function leadsList(req, res, db, url, actor) {
  const params = [];
  const where = ["COALESCE(l.custom_values->>'archived','false') <> 'true'"];
  let callingResolutionFilterSql = "";
  const bind = (value) => { params.push(value); return `$${params.length}`; };
  const ownership = leadAccessPredicate(actor, bind);
  if (ownership) where.push(ownership);
  const q = String(url.searchParams.get("search") || url.searchParams.get("q") || "").trim();
  if (q) { const p = bind(`%${q}%`); where.push(`(l.name ILIKE ${p} OR l.email ILIKE ${p} OR l.company ILIKE ${p} OR l.phone ILIKE ${p} OR l.lead_no ILIKE ${p} OR l.external_id ILIKE ${p})`); }
  for (const [query, column] of [["stage", "l.stage"], ["permission", "l.permission"], ["owner", "l.owner_user_id"], ["lead_status", "l.lead_status"]]) {
    const value = String(url.searchParams.get(query) || "").trim(); if (value) where.push(`${column} = ${bind(value)}`);
  }
  const assignmentStatus = String(url.searchParams.get("assignment_status") || "").trim();
  if (assignmentStatus === "assigned") where.push("l.owner_user_id IS NOT NULL");
  else if (assignmentStatus === "unassigned") where.push("l.owner_user_id IS NULL");
  else if (assignmentStatus) return invalidLeadsQuery(res);
  const workQueue = String(url.searchParams.get("work_queue") || "");
  if (!["", "lead_master", "focused_calling"].includes(workQueue)) return invalidLeadsQuery(res);
  if (workQueue) where.push(`l.owner_user_id = ${bind(actor.id)}`);
  // Focussed Calling contains today's assigned work. A lead may have been
  // imported earlier and assigned today, so check assignment history as well
  // as leads created today.
  if (workQueue === "focused_calling") {
    const focusedOwner = bind(actor.id);
    where.push(`(l.created_at >= CURRENT_DATE AND l.created_at < CURRENT_DATE + INTERVAL '1 day' OR EXISTS (SELECT 1 FROM lead_history lh WHERE lh.lead_id=l.id AND lh.field='owner_user_id' AND lh.to_value=${focusedOwner} AND lh.occurred_at >= CURRENT_DATE AND lh.occurred_at < CURRENT_DATE + INTERVAL '1 day'))`);
  }
  const managedFilterFields = { lead_type: sqlExpression("leadTypeCode"), lead_stage: sqlExpression("stage"), permission: sqlExpression("permission"), business_category: sqlExpression("business_category"), calling_resolution: sqlExpression("calling_resolution"), rating: sqlExpression("rating"), lead_source: sqlExpression("leadSource"), products: null, product_stage: null };
  const managedRaw = url.searchParams.get("managed_filters");
  if (managedRaw) {
    let managedFilters;
    try { managedFilters = JSON.parse(managedRaw); } catch { return invalidLeadsQuery(res); }
    if (!managedFilters || typeof managedFilters !== "object" || Array.isArray(managedFilters) || Object.keys(managedFilters).length > 12) return invalidLeadsQuery(res);
    const selectedProducts = Array.isArray(managedFilters.products) ? managedFilters.products.map((value) => String(value || "").trim()).filter(Boolean) : [];
    for (const [key, rawValues] of Object.entries(managedFilters)) {
      const values = Array.isArray(rawValues) ? rawValues.map((value) => String(value || "").trim()).filter(Boolean) : [];
      if (!Object.prototype.hasOwnProperty.call(managedFilterFields, key) || !values.length || values.length > 50 || new Set(values).size !== values.length) return invalidLeadsQuery(res);
      if (key === "products") {
        const available = await db.query("SELECT code,label FROM master_values WHERE master_type='product' AND active=true AND (code = ANY($1::text[]) OR label = ANY($1::text[]))", [values]);
        if (available.rows.length !== values.length) return invalidLeadsQuery(res);
        const productCodes = available.rows.map((row) => String(row.code || row.label));
        // In a user's Lead Master / Focussed Calling queue, product selection is a
        // context selector: it loads that product's stage and call-resolution options.
        // Only those detailed choices should narrow the assigned-leads queue.
        if (!workQueue) where.push(`EXISTS (SELECT 1 FROM lead_products lp WHERE lp.lead_id=l.id AND lp.product_code IN (${productCodes.map((value) => bind(value)).join(", ")}))`);
      } else if (key === "product_stage") {
        if (!selectedProducts.length) return invalidLeadsQuery(res);
        const available = await db.query("SELECT code,label FROM master_values WHERE master_type='product' AND active=true AND (code = ANY($1::text[]) OR label = ANY($1::text[]))", [selectedProducts]);
        if (available.rows.length !== selectedProducts.length) return invalidLeadsQuery(res);
        const productCodes = available.rows.map((row) => String(row.code || row.label));
        where.push(`EXISTS (SELECT 1 FROM lead_products lp WHERE lp.lead_id=l.id AND lp.product_code IN (${productCodes.map((value) => bind(value)).join(", ")}) AND lp.stage IN (${values.map((value) => bind(value)).join(", ")}))`);
      } else {
        // Calling resolution is an Admin Lead Field. Its options can be changed at any time,
        // so filter its stored values directly instead of rejecting a newly configured option.
        const validValues = key === "calling_resolution" || (await Promise.all(values.map((value) => validDropdownValue(db, key, value)))).every(Boolean);
        if (!validValues) return invalidLeadsQuery(res);
        const managedClause = `${managedFilterFields[key]} IN (${values.map((value) => bind(value)).join(", ")})`;
        where.push(managedClause);
        if (key === "calling_resolution") callingResolutionFilterSql = managedClause;
        if (key === "calling_resolution" && selectedProducts.length) {
          const available = await db.query("SELECT code,label FROM master_values WHERE master_type='product' AND active=true AND (code = ANY($1::text[]) OR label = ANY($1::text[]))", [selectedProducts]);
          if (available.rows.length !== selectedProducts.length) return invalidLeadsQuery(res);
          const productCodes = available.rows.map((row) => String(row.code || row.label));
          // Product-specific calling resolutions are stored against the lead's
          // Proposed Solution. Do not rely on lead_products here: that record
          // is created when the user later selects a stage.
          where.push(`${jsonValue("proposed_solution")} IN (${productCodes.map((value) => bind(value)).join(", ")})`);
        }
      }
    }
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
  if (next && !(await validDropdownValue(db, "follow_up_filter", next))) return invalidLeadsQuery(res);
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
  let configuredSort = null;
  if (sortParam && !Object.prototype.hasOwnProperty.call(LEAD_SORTS, sortParam)) {
    const key = String(sortParam).startsWith("configured:") ? String(sortParam).slice("configured:".length) : "";
    if (!/^[a-z][a-z0-9_]{1,63}$/.test(key)) return invalidLeadsQuery(res);
    const definitions = await LeadFields.getDefinitions(db);
    configuredSort = definitions.find((field) => field.active && field.key === key) || null;
    if (!configuredSort) return invalidLeadsQuery(res);
  }
  const sort = sortParam || "updated_at";
  const directionParam = String(url.searchParams.get("direction") || "desc").toLowerCase();
  if (![
    "asc", "desc",
  ].includes(directionParam)) return invalidLeadsQuery(res);
  const direction = directionParam === "asc" ? "ASC" : "DESC";
  const isAll = url.searchParams.get("page_size") === "all";
  const filterSql = where.length ? "WHERE " + where.join(" AND ") : "";
  // Resolution chips should retain their counts after one chip is selected.
  // Keep every other active filter, but intentionally exclude this one chip's
  // calling-resolution condition for the chip aggregate.
  const resolutionCountWhere = callingResolutionFilterSql
    ? where.map((clause) => clause === callingResolutionFilterSql ? `(${[...new Set(callingResolutionFilterSql.match(/\$\d+/g) || [])].map((placeholder) => `${placeholder} IS NOT NULL`).join(" AND ")})` : clause)
    : where;
  const resolutionCountSql = resolutionCountWhere.length ? "WHERE " + resolutionCountWhere.join(" AND ") : "";
  const [count, resolutionCountRows] = await Promise.all([
    db.query(`SELECT count(*)::int AS total FROM leads l ${filterSql}`, params),
    db.query(`SELECT ${jsonValue("calling_resolution")} AS resolution,count(*)::int AS total FROM leads l ${resolutionCountSql} AND ${jsonValue("calling_resolution")} IS NOT NULL GROUP BY ${jsonValue("calling_resolution")}`, params),
  ]);
  const total = count.rows[0]?.total || 0;
  const pageSize = isAll ? Math.max(1, total) : integerParam(url.searchParams.get("page_size"), 50, 100);
  const page = isAll ? 1 : integerParam(url.searchParams.get("page"), 1, 1000000);
  const offset = isAll ? 0 : (page - 1) * pageSize;
  const listParams = params.slice();
  const sortExpression = configuredSort ? configuredLeadSortExpression(configuredSort.type, `$${listParams.length + 1}`) : LEAD_SORTS[sort];
  if (configuredSort) listParams.push(configuredSort.key);
  listParams.push(pageSize, offset);
  // Keep the list endpoint usable while an older preview database is waiting for
  // migration 018. The field is optional in the client until that migration runs.
  const rows = await db.query(`SELECT l.id,l.source_id,l.name,l.first_name,l.last_name,l.email,l.company,l.phone,l.stage,l.permission,l.lead_status,l.owner_user_id,l.pso_date,l.next_follow_up_at,l.last_call_at,l.updated_at,l.created_at,NULL::timestamptz AS last_opened_at,l.is_pre_ps_done,l.lead_no,l.lead_type,l.lead_source,l.source_system,l.designation,l.city,l.custom_values,l.legacy_finance,COALESCE((SELECT array_agg(DISTINCT lp.product_code) FROM lead_products lp WHERE lp.lead_id=l.id),ARRAY[]::text[]) AS product_codes FROM leads l LEFT JOIN users sort_owner ON sort_owner.id=l.owner_user_id ${filterSql} ORDER BY ${sortExpression} ${direction} NULLS LAST, l.id ASC LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`, listParams);
  const items = rows.rows.map((row) => materializeLead(row));
  const call_resolution_counts = Object.fromEntries(resolutionCountRows.rows.map((row) => [String(row.resolution), Number(row.total) || 0]));
  return json(res, 200, { items, page, page_size: pageSize, total, sort, direction: direction.toLowerCase(), view: view || null, call_resolution_counts });
}

async function productMasterList(res, db, url, actor) {
  const product = String(url.searchParams.get("product") || "").trim();
  const stage = String(url.searchParams.get("stage") || "").trim();
  const resolution = String(url.searchParams.get("resolution") || "").trim();
  const params = [actor.id]; const where = ["l.owner_user_id=$1", "COALESCE(l.custom_values->>'archived','false') <> 'true'"];
  if (product) { params.push(product); where.push(`${jsonValue("proposed_solution")}=$${params.length}`); }
  if (stage) { params.push(stage); where.push(`COALESCE(l.stage,'')=$${params.length}`); }
  if (resolution) { params.push(resolution); where.push(`${jsonValue("calling_resolution")}=$${params.length}`); }
  const filterSql = `WHERE ${where.join(" AND ")}`;
  const [summary, rows] = await Promise.all([
    db.query(`SELECT COALESCE(${jsonValue("proposed_solution")},'Unassigned') AS product,COALESCE(l.stage,'No stage') AS stage,COALESCE(${jsonValue("calling_resolution")},'No resolution') AS resolution,count(*)::int AS total FROM leads l WHERE l.owner_user_id=$1 AND COALESCE(l.custom_values->>'archived','false') <> 'true' GROUP BY 1,2,3 ORDER BY 1,2,3`, [actor.id]),
    product ? db.query(`SELECT l.id,l.name,l.lead_no,l.company,l.phone,l.stage,${jsonValue("calling_resolution")} AS calling_resolution,${jsonValue("proposed_solution")} AS proposed_solution,l.updated_at FROM leads l ${filterSql} ORDER BY l.updated_at DESC NULLS LAST LIMIT 100`, params) : Promise.resolve({ rows: [] }),
  ]);
  return json(res, 200, { summary: summary.rows, leads: rows.rows });
}

async function addLeadActivityDisplayNames(db, lead, collections) {
  const ids = new Set([lead?.owner_user_id]);
  for (const item of collections.history || []) { ids.add(item.actor_id); ids.add(item.to_value); }
  for (const item of collections.calls || []) { ids.add(item.user_id); ids.add(item.created_by); }
  for (const item of collections.followups || []) { ids.add(item.assigned_to); ids.add(item.created_by); }
  for (const item of collections.notes || []) ids.add(item.created_by);
  const userIds = [...ids].filter((value) => typeof value === "string" && value.trim());
  const result = userIds.length ? await db.query("SELECT id,name FROM users WHERE id=ANY($1::text[])", [userIds]) : { rows: [] };
  const names = new Map(result.rows.map((row) => [String(row.id), String(row.name || "").trim()]).filter(([, name]) => name));
  const nameFor = (value) => value == null || value === "" ? null : names.get(String(value)) || String(value);
  return {
    lead: { ...lead, owner_name: nameFor(lead?.owner_user_id) },
    history: (collections.history || []).map((item) => ({ ...item, actor_name: nameFor(item.actor_id), to_name: nameFor(item.to_value) })),
    calls: (collections.calls || []).map((item) => ({ ...item, caller_name: nameFor(item.user_id || item.created_by) })),
    followups: (collections.followups || []).map((item) => ({ ...item, assigned_to_name: nameFor(item.assigned_to), creator_name: nameFor(item.created_by) })),
    messages: collections.messages || [],
    notes: (collections.notes || []).map((item) => ({ ...item, author_name: nameFor(item.created_by) })),
  };
}

async function leadDetailNotes(db, id) {
  return db.query("SELECT n.id,n.lead_id,n.body,n.note_type,n.call_id,n.created_by,n.created_at FROM lead_notes n WHERE n.lead_id = $1 ORDER BY n.created_at DESC NULLS LAST, n.id DESC", [id]);
}

async function leadDetail(req, res, db, id, actor = null) {
  if (actor?.id) {
    try {
      await db.query("UPDATE leads SET last_opened_at=now(),last_opened_by=$2 WHERE id=$1 AND (last_opened_at IS NULL OR last_opened_at < now() - interval '5 minutes')", [id, actor.id]);
    } catch (error) {
      // Preview can briefly run against the pre-018 schema. Do not make read-only
      // lead details unavailable while the optional last-opened columns are absent.
      if (error?.code !== "42703") throw error;
    }
  }
  const lead = (await db.query("SELECT * FROM leads WHERE id = $1 AND COALESCE(custom_values->>'archived','false') <> 'true'", [id])).rows[0];
  if (!lead || (actor && !canAccessAllLeads(actor) && lead.owner_user_id !== actor.id)) return json(res, 404, { error: "Lead not found." });
  const [calls, followups, history, messages, notes, products] = await Promise.all([
    db.query("SELECT * FROM lead_calls WHERE lead_id = $1 ORDER BY happened_at DESC NULLS LAST, id DESC", [id]),
    db.query("SELECT * FROM lead_followups WHERE lead_id = $1 ORDER BY due_at ASC NULLS LAST, id ASC", [id]),
    db.query("SELECT * FROM lead_history WHERE lead_id = $1 ORDER BY occurred_at DESC NULLS LAST, id DESC", [id]),
    db.query("SELECT * FROM lead_messages WHERE lead_id = $1 ORDER BY sent_at DESC NULLS LAST, id DESC", [id]),
    leadDetailNotes(db, id),
    db.query("SELECT * FROM lead_products WHERE lead_id = $1 ORDER BY product_code ASC, id ASC", [id]),
  ]);
  const named = await addLeadActivityDisplayNames(db, lead, { calls: calls.rows, followups: followups.rows, history: history.rows, messages: messages.rows, notes: notes.rows });
  return json(res, 200, { lead: materializeLead(named.lead), calls: named.calls, followups: named.followups, history: named.history, messages: named.messages, notes: named.notes, products: products.rows });
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

async function activityList(res, db, actorOrId, idOrKind, kindOrUrl, maybeUrl) {
  const [actor, id, kind, url] = maybeUrl ? [actorOrId, idOrKind, kindOrUrl, maybeUrl] : [null, actorOrId, idOrKind, kindOrUrl];
  if (actor && !(await canAccessLead(db, actor, id))) return json(res, 404, { error: "Lead not found." });
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

async function activityLeadExists(db, actor, id) { return canAccessLead(db, actor, id); }

async function addLeadNote(req, res, db, actor, id) {
  const body = await readJson(req); const note = activityText(body.body);
  if (!note) return json(res, 400, { error: "Note body is required." });
  if (!(await activityLeadExists(db, actor, id))) return json(res, 404, { error: "Lead not found." });
  if (Object.prototype.hasOwnProperty.call(body, "activity_type_option_id")) return json(res, 400, { error: "This request format is no longer supported. Reload the page." });
  if (body.activity !== undefined) {
    const definitions = await LeadFields.getDefinitions(db);
    const activityField = definitions.find((field) => field.key === "activity");
    if (!activityField) return json(res, 400, { error: "Activity options aren't set up. Ask an administrator to add an Activity dropdown in Lead fields." });
    if (!activityField.active) return json(res, 400, { error: "The Activity lead field is inactive." });
    if (activityField.type !== "dropdown") return json(res, 400, { error: "The Activity lead field must be a dropdown." });
    if (!(activityField.options || []).length) return json(res, 400, { error: "The Activity lead field has no options." });
    let activity;
    try { activity = LeadFields.validateActiveValues({ activity: body.activity }, definitions).activity; }
    catch (error) { return json(res, error.status || 400, { error: error.message || "Invalid Activity option." }); }
    const noteId = `lead-note-${crypto.randomUUID()}`;
    try {
      await transaction(db, async (tx) => {
        const current = (await tx.query("SELECT custom_values FROM leads WHERE id=$1 FOR UPDATE", [id])).rows[0];
        if (!current) throw Object.assign(new Error("Lead not found."), { status: 404 });
        await tx.query("INSERT INTO lead_notes(id,lead_id,body,note_type,created_by) VALUES($1,$2,$3,'manual',$4)", [noteId, id, note, actor.id]);
        await tx.query("UPDATE leads SET custom_values=jsonb_set(COALESCE(custom_values,'{}'::jsonb), ARRAY['lead_fields','activity'], $1::jsonb, true), updated_at=now() WHERE id=$2", [JSON.stringify(activity), id]);
        await writeAudit(tx, { actorUserId: actor.id, action: "lead.note_created", entityType: "lead", entityId: id, newValue: "manual_note", ip: req.socket.remoteAddress });
        await writeAudit(tx, { actorUserId: actor.id, action: "lead.updated", entityType: "lead", entityId: id, field: "activity", oldValue: JSON.stringify(current.custom_values?.lead_fields?.activity ?? null), newValue: JSON.stringify(activity), ip: req.socket.remoteAddress });
      });
    } catch (error) { return json(res, error.status || 500, { error: error.status ? error.message : "Unable to save activity." }); }
    return json(res, 201, { id: noteId });
  }
  const noteId = `lead-note-${crypto.randomUUID()}`;
  await db.query("INSERT INTO lead_notes(id,lead_id,body,note_type,created_by) VALUES($1,$2,$3,'manual',$4)", [noteId, id, note, actor.id]);
  await writeAudit(db, { actorUserId: actor.id, action: "lead.note_created", entityType: "lead", entityId: id, newValue: "manual_note", ip: req.socket.remoteAddress });
  return json(res, 201, { id: noteId });
}

async function addLeadCall(req, res, db, actor, id) {
  const lead = canAccessAllLeads(actor)
    ? (await db.query("SELECT id,permission FROM leads WHERE id=$1 AND COALESCE(custom_values->>'archived','false') <> 'true'", [id])).rows[0]
    : (await db.query("SELECT id,permission FROM leads WHERE id=$1 AND owner_user_id=$2 AND COALESCE(custom_values->>'archived','false') <> 'true'", [id, actor.id])).rows[0];
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
  if (!(await activityLeadExists(db, actor, id))) return json(res, 404, { error: "Lead not found." });
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

function invalidLead(res, message = "Invalid lead data.") { return json(res, 400, { error: message }); }
function duplicateLeadError(res) { return json(res, 409, { error: "Possible duplicate lead." }); }
async function validDropdownValue(db, key, value) {
  if (!value) return false;
  try { await Dropdowns.assertSelectableOption(db, key, value); return true; } catch { return false; }
}
async function findLeadDuplicates(db, phone, email, excludeId = null) {
  const rows = await db.query("SELECT id FROM leads WHERE (($1::text IS NOT NULL AND phone = $1::text) OR ($2::text IS NOT NULL AND lower(email) = lower($2::text))) AND ($3::text IS NULL OR id <> $3::text) ORDER BY id ASC", [phone || null, email || null, excludeId]);
  return rows.rows;
}
async function leadFieldsList(res, db) { return json(res, 200, { fields: await LeadFields.getDefinitions(db) }); }
async function leadFieldsWrite(req, res, db, actor) {
  let body; try { body = await readJson(req); } catch { return userWriteError(res, 400, "Invalid lead field settings."); }
  try { return json(res, 200, { fields: await LeadFields.saveDefinitions(db, actor, body.fields, req.socket.remoteAddress) }); }
  catch (error) { return userWriteError(res, error.status || 500, error.status ? error.message : "Unable to save lead fields."); }
}
async function leadFieldsDelete(res, db, actor, key, ip) {
  try { return json(res, 200, { fields: await LeadFields.deleteDefinition(db, actor, key, ip) }); }
  catch (error) { return userWriteError(res, error.status || 500, error.status ? error.message : "Unable to delete lead field."); }
}
function leadFields(body) {
  const type = leadTypeValue(body.lead_type); if (!type) return null;
  const first_name = String(body.first_name || "").trim() || null;
  const last_name = String(body.last_name || "").trim() || null;
  const name = String(body.name || `${first_name || ""} ${last_name || ""}`).trim(); if (!name) return null;
  const permission = String(body.permission || "Pending"); if (!permission) return null;
  const stage = String(body.stage || "lead"); if (!stage) return null;
  return { name, first_name, last_name, email: String(body.email || "").trim() || null, phone: String(body.phone || "").trim() || null, company: String(body.company || "").trim() || null, designation: String(body.designation || "").trim() || null, team: String(body.team || "").trim() || null, lead_type: type, priority: leadPriority(type), stage, permission, lead_status: String(body.lead_status || "").trim() || null, owner_user_id: body.owner_user_id ? String(body.owner_user_id) : null, pso_date: body.pso_date || null, custom_values: body.custom_values && typeof body.custom_values === "object" ? body.custom_values : {}, legacy_finance: body.legacy_finance && typeof body.legacy_finance === "object" ? body.legacy_finance : {} };
}
async function createLead(req, res, db, actor) {
  let body;
  try { body = await readJson(req); } catch { return invalidLead(res); }
  if (body.permission && body.permission !== "Pending" && !requireCapability("leads.permission", actor)) return json(res, 403, { error: "You do not have permission to change permission." });
  const fields = leadFields(body); if (!fields || !(await validDropdownValue(db, "lead_type", fields.lead_type)) || !(await validDropdownValue(db, "lead_stage", fields.stage)) || !(await validDropdownValue(db, "permission", fields.permission))) return invalidLead(res);
  try { fields.custom_values = LeadFields.mergeActiveLeadValues(fields.custom_values, body.lead_fields, await LeadFields.getDefinitions(db)); }
  catch (error) { return json(res, error.status || 400, { error: error.message || "Invalid lead field." }); }
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
function inlineText(value, max = 2000) { if (value == null) return null; const text = String(value).trim(); return text ? text.slice(0, max) : null; }
function inlineDate(value, dateTime = false) { if (value == null || value === "") return null; const text = String(value); const pattern = dateTime ? /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/ : /^\d{4}-\d{2}-\d{2}$/; if (!pattern.test(text) || Number.isNaN(new Date(text).getTime())) throw Object.assign(new Error("Invalid date value."), { status: 400 }); return text; }
function resolutionAllowedForProducts(value, productCodes, activeResolutionsByProduct) { return value != null && value !== "" && productCodes.some((code) => (activeResolutionsByProduct[code] || []).some((label) => label === String(value))); }
async function updateInlineLeadField(req, res, db, actor, id, body) {
  const requested = String(body.field || "");
  const definitions = await LeadFields.getDefinitions(db);
  const configuredField = definitions.find((field) => field.key === requested && field.active);
  const isManagedField = requested !== "calling_resolution" && (DEFAULT_MANAGED_LEAD_FIELD_KEYS.has(requested) || definitions.some((field) => field.key === requested));
  if (isManagedField && !configuredField) return json(res, 400, { error: `Lead field "${requested}" is inactive or no longer exists.` });
  const definition = configuredField ? { ...configuredField, input: configuredField.type === "boolean" ? "boolean" : configuredField.type === "date" ? "date" : configuredField.type === "dropdown" ? "dropdown" : "text", editable: true, storage: { kind: "custom", key: configuredField.key } } : CORE_INLINE_EDITABLE_FIELDS.get(requested);
  if (!definition) return json(res, 400, { error: "This lead field is not editable." });
  const canonical = definition.aliasOf ? INLINE_COLUMNS.get(definition.aliasOf) || definition : definition;
  const current = canAccessAllLeads(actor)
    ? (await db.query("SELECT * FROM leads WHERE id=$1 AND COALESCE(custom_values->>'archived','false') <> 'true'", [id])).rows[0]
    : (await db.query("SELECT * FROM leads WHERE id=$1 AND owner_user_id=$2 AND COALESCE(custom_values->>'archived','false') <> 'true'", [id, actor.id])).rows[0];
  if (!current) return json(res, 404, { error: "Lead not found." });
  if (canonical.storage.kind === "column" && canonical.storage.key === "permission" && body.value !== current.permission && !requireCapability("leads.permission", actor)) return json(res, 403, { error: "You do not have permission to change permission." });
  let value = body.value;
  try {
    if (requested === "calling_resolution") {
      value = inlineText(value, 200);
    } else if (configuredField) {
      const normalized = LeadFields.normalizeValues({ [requested]: value }, [configuredField], { allowEmpty: true });
      if (!Object.prototype.hasOwnProperty.call(normalized, requested)) throw Object.assign(new Error(`Invalid value for ${configuredField.label}.`), { status: 400 });
      value = normalized[requested];
    } else if (canonical.input === "boolean") { if (value === "true" || value === "Yes") value = true; else if (value === "false" || value === "No" || value == null || value === "") value = value == null || value === "" ? null : false; else throw Object.assign(new Error("Value must be Yes or No."), { status: 400 }); }
    else if (canonical.input === "date") value = inlineDate(value);
    else if (canonical.input === "datetime") value = inlineDate(value, true);
    else if (canonical.input === "email") { value = inlineText(value); if (value && !/^\S+@\S+\.\S+$/.test(value)) throw Object.assign(new Error("Enter a valid email address."), { status: 400 }); }
    else if (canonical.input === "phone") { value = inlineText(value, 80); if (!value || !/^[+\d][\d\s().-]{6,}$/.test(value)) throw Object.assign(new Error("Enter a valid phone number."), { status: 400 }); }
    else if (canonical.input === "dropdown") { value = inlineText(value, 200); if (value != null) await Dropdowns.assertSelectableOption(db, canonical.dropdown, value); }
    else value = inlineText(value);
    if (requested === "calling_resolution" && value != null) {
      const proposed = String(current.custom_values?.lead_fields?.proposed_solution ?? current.custom_values?.proposed_solution ?? "");
      const proposedProducts = proposed.split(/[,;|]/).map((item) => item.trim().toLowerCase()).filter(Boolean);
      if (!proposedProducts.length) throw Object.assign(new Error("Select the lead's Proposed Solution product before choosing a call resolution."), { status: 400 });
      const available = await db.query("SELECT code,label FROM master_values WHERE master_type='product' AND active=true AND (lower(btrim(code)) = ANY($1::text[]) OR lower(btrim(label)) = ANY($1::text[]))", [proposedProducts]);
      if (!available.rows.length) throw Object.assign(new Error("The Proposed Solution product is no longer active."), { status: 400 });
      const productCodes = available.rows.map((row) => String(row.code || row.label));
      const allowed = await db.query("SELECT m.code,r.label FROM product_call_resolutions r JOIN master_values m ON m.id=r.product_id WHERE r.active=true AND r.label=$1 AND m.code = ANY($2::text[])", [value, productCodes]);
      const active = Object.fromEntries(productCodes.map((code) => [code, allowed.rows.filter((row) => String(row.code) === code).map((row) => String(row.label))]));
      if (!resolutionAllowedForProducts(value, productCodes, active)) throw Object.assign(new Error("This call resolution is not active for the lead's Proposed Solution product."), { status: 400 });
    }
    if (canonical.required && !value) throw Object.assign(new Error(`${canonical.label} is required.`), { status: 400 });
    if (canonical.storage.key === "rating" && value != null && !["1", "2", "3", "4", "5"].includes(String(value))) throw Object.assign(new Error("Rating must be between 1 and 5."), { status: 400 });
  } catch (error) { return json(res, error.status || 400, { error: error.message || "Invalid lead value." }); }
  const duplicatePhone = canonical.storage.key === "phone" ? await findLeadDuplicates(db, value, current.email, id) : [];
  if (duplicatePhone.length) return json(res, 409, { error: "Duplicate phone number: another lead already uses this phone number." });
  try {
    const updated = await transaction(db, async (tx) => {
      let result;
      if (canonical.storage.kind === "custom") {
        result = await tx.query("UPDATE leads SET custom_values=jsonb_set(COALESCE(custom_values,'{}'::jsonb), ARRAY['lead_fields',$1::text], COALESCE($2::jsonb,'null'::jsonb), true), updated_at=now() WHERE id=$3 RETURNING *", [canonical.storage.key, JSON.stringify(value), id]);
      } else if (canonical.storage.key === "name" || canonical.storage.key === "first_name" || canonical.storage.key === "last_name") {
        const oldFirst = String(current.first_name || "").trim(); const oldLast = String(current.last_name || "").trim(); let name = String(current.name || "").trim(); let first = oldFirst; let last = oldLast;
        if (canonical.storage.key === "name") { name = value || ""; const parts = name.split(/\s+/).filter(Boolean); first = parts[0] || ""; last = parts.slice(1).join(" "); }
        if (canonical.storage.key === "first_name") { first = value || ""; name = `${first} ${last}`.trim(); }
        if (canonical.storage.key === "last_name") { last = value || ""; name = `${first} ${last}`.trim(); }
        if (!name) throw Object.assign(new Error("Name is required."), { status: 400 });
        result = await tx.query("UPDATE leads SET name=$1,first_name=$2,last_name=$3,updated_at=now() WHERE id=$4 RETURNING *", [name, first || null, last || null, id]);
      } else {
        const allowed = new Set(["lead_type","company","phone","email","designation","lead_source","permission","last_call_at"]);
        if (!allowed.has(canonical.storage.key)) throw Object.assign(new Error("This lead field is not editable."), { status: 400 });
        result = await tx.query(`UPDATE leads SET ${canonical.storage.key}=$1,updated_at=now() WHERE id=$2 RETURNING *`, [value, id]);
      }
      const updatedLead = result.rows[0];
      await writeAudit(tx, { actorUserId: actor.id, action: "lead.updated", entityType: "lead", entityId: id, field: requested, oldValue: JSON.stringify(current[canonical.storage.key] ?? current.custom_values?.lead_fields?.[canonical.storage.key] ?? null), newValue: JSON.stringify(value), ip: req.socket.remoteAddress });
      return updatedLead;
    });
    // Match the Leads list representation. The client merges this response
    // into an existing row, so returning materialized values prevents an old
    // top-level display field from overwriting the just-saved custom value.
    return json(res, 200, { id, lead: materializeLead(updated) });
  } catch (error) { if (error.status) return json(res, error.status, { error: error.message }); return json(res, 500, { error: "Unable to save lead field." }); }
}

function leadAuditChanges(current, fields, body) {
  const changes = [];
  const tracked = ["name", "first_name", "last_name", "email", "phone", "company", "designation", "team", "lead_type", "priority", "stage", "permission", "lead_status", "owner_user_id", "pso_date", "legacy_finance"];
  for (const field of tracked) {
    if (body[field] === undefined) continue;
    const oldValue = current[field] ?? null;
    const newValue = fields[field] ?? null;
    if (String(oldValue ?? "") !== String(newValue ?? "")) changes.push({ field, oldValue, newValue });
  }
  if (body.lead_fields && typeof body.lead_fields === "object") {
    const oldValues = current.custom_values?.lead_fields || {};
    const newValues = fields.custom_values?.lead_fields || {};
    for (const field of Object.keys(body.lead_fields)) {
      const oldValue = oldValues[field] ?? null;
      const newValue = newValues[field] ?? null;
      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) changes.push({ field, oldValue, newValue });
    }
  }
  return changes;
}

async function updateLead(req, res, db, actor, id, parsedBody = null) {
  const body = parsedBody || await readJson(req); const current = canAccessAllLeads(actor) ? (await db.query("SELECT * FROM leads WHERE id=$1 AND COALESCE(custom_values->>'archived','false') <> 'true'", [id])).rows[0] : (await db.query("SELECT * FROM leads WHERE id=$1 AND owner_user_id=$2 AND COALESCE(custom_values->>'archived','false') <> 'true'", [id, actor.id])).rows[0]; if (!current) return json(res, 404, { error: "Lead not found." }); const explicitPermission = String(body.permission ?? "").trim(); const nextPermission = explicitPermission || String(current.permission || "Pending"); if (explicitPermission && nextPermission !== current.permission && !requireCapability("leads.permission", actor)) return json(res, 403, { error: "You do not have permission to change permission." }); const merged = { ...current, ...body, lead_type: body.lead_type || current.lead_type || "DL", stage: body.stage || current.stage || "lead", permission: nextPermission, custom_values: body.custom_values ?? current.custom_values }; if (body.first_name !== undefined || body.last_name !== undefined) merged.name = `${String(body.first_name ?? current.first_name ?? "").trim()} ${String(body.last_name ?? current.last_name ?? "").trim()}`.trim(); const fields = leadFields(merged); if (!fields) return invalidLead(res, "Lead name and lead type are required."); const currentType = leadTypeValue(current.lead_type); const explicitType = String(body.lead_type ?? "").trim(); const explicitStage = String(body.stage ?? "").trim(); const typeChanged = Boolean(explicitType) && fields.lead_type !== currentType; const stageChanged = Boolean(explicitStage) && fields.stage !== String(current.stage || ""); const permissionChanged = Boolean(explicitPermission) && fields.permission !== String(current.permission || ""); if (typeChanged && !(await validDropdownValue(db, "lead_type", fields.lead_type))) return invalidLead(res, "The selected lead type is no longer available."); if (stageChanged && !(await validDropdownValue(db, "lead_stage", fields.stage))) return invalidLead(res, "The selected lead stage is no longer available."); if (permissionChanged && !(await validDropdownValue(db, "permission", fields.permission))) return invalidLead(res, "The selected permission value is no longer available."); fields.custom_values = LeadFields.mergeLeadValues(current.custom_values, body.lead_fields, await LeadFields.getDefinitions(db)); const auditChanges = leadAuditChanges(current, fields, body); const duplicates = await findLeadDuplicates(db, fields.phone, fields.email, id); if (duplicates.length) return duplicateLeadError(res); try { await transaction(db, async (tx) => { await tx.query("UPDATE leads SET name=$2,first_name=$3,last_name=$4,email=$5,phone=$6,company=$7,designation=$8,team=$9,lead_type=$10,priority=$11,stage=$12,permission=$13,lead_status=$14,owner_user_id=$15,pso_date=$16,custom_values=$17,legacy_finance=$18,updated_at=now() WHERE id=$1", [id, fields.name, fields.first_name, fields.last_name, fields.email, fields.phone, fields.company, fields.designation, fields.team, fields.lead_type, fields.priority, fields.stage, fields.permission, fields.lead_status, fields.owner_user_id, fields.pso_date, fields.custom_values, fields.legacy_finance]); if (body.owner_user_id !== undefined && String(body.owner_user_id || "") !== String(current.owner_user_id || "")) await writeAssignmentHistory(tx, { leadId: id, actorId: actor.id, action: "lead.owner_changed", previousOwner: current.owner_user_id, ownerId: fields.owner_user_id, reason: "manual", note: "Lead owner changed manually." }); if (auditChanges.length) for (const change of auditChanges) await writeAudit(tx, { actorUserId: actor.id, action: "lead.field_updated", entityType: "lead", entityId: id, field: change.field, oldValue: JSON.stringify(change.oldValue), newValue: JSON.stringify(change.newValue), ip: req.socket.remoteAddress }); else await writeAudit(tx, { actorUserId: actor.id, action: "lead.updated", entityType: "lead", entityId: id, ip: req.socket.remoteAddress }); }); return json(res, 200, { id }); } catch (error) { console.error(`lead update failed code=${error?.code || "unknown"} status=${error?.status || "none"} constraint=${error?.constraint || "none"}`); return json(res, 500, { error: "Unable to save lead." }); }
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
async function changeLeadStage(req, res, db, actor, id) { const body = await readJson(req); const stage = String(body.stage || ""); if (!(await validDropdownValue(db, "lead_stage", stage))) return invalidLead(res); try { await transaction(db, async (tx) => { const current = (await tx.query("SELECT stage FROM leads WHERE id=$1", [id])).rows[0]; if (!current) throw Object.assign(new Error("missing"), { status: 404 }); await tx.query("UPDATE leads SET stage=$2,updated_at=now() WHERE id=$1", [id, stage]); await writeAudit(tx, { actorUserId: actor.id, action: "lead.stage_changed", entityType: "lead", entityId: id, field: "stage", oldValue: current.stage, newValue: stage, ip: req.socket.remoteAddress }); }); return json(res, 200, { id, stage }); } catch (error) { return json(res, error.status === 404 ? 404 : 500, { error: error.status === 404 ? "Lead not found." : "Unable to change lead stage." }); } }
async function changeLeadProductStage(req, res, db, actor, id) {
  const body = await readJson(req); const stage = String(body.stage || "").trim();
  if (!stage) return invalidLead(res, "Choose a product stage.");
  const current = canAccessAllLeads(actor) ? (await db.query("SELECT * FROM leads WHERE id=$1 AND COALESCE(custom_values->>'archived','false') <> 'true'", [id])).rows[0] : (await db.query("SELECT * FROM leads WHERE id=$1 AND owner_user_id=$2 AND COALESCE(custom_values->>'archived','false') <> 'true'", [id, actor.id])).rows[0];
  if (!current) return json(res, 404, { error: "Lead not found." });
  const proposed = String(current.custom_values?.lead_fields?.proposed_solution ?? current.custom_values?.proposed_solution ?? "");
  const requestedProducts = proposed.split(/[,;|]/).map((item) => item.trim().toLowerCase()).filter(Boolean);
  if (!requestedProducts.length) return invalidLead(res, "Select the lead's Proposed Solution product before choosing a stage.");
  const products = (await db.query("SELECT id,code,label FROM master_values WHERE master_type='product' AND active=true AND (lower(btrim(code)) = ANY($1::text[]) OR lower(btrim(label)) = ANY($1::text[]))", [requestedProducts])).rows;
  const activeStages = products.length ? (await db.query("SELECT product_id FROM product_stages WHERE product_id=ANY($1::text[]) AND active=true AND label=$2", [products.map((product) => product.id), stage])).rows : [];
  const activeProductIds = new Set(activeStages.map((row) => row.product_id)); const matchingProducts = products.filter((product) => activeProductIds.has(product.id));
  if (!matchingProducts.length) return invalidLead(res, "This stage is not active for the lead's Proposed Solution product.");
  try { const lead = await transaction(db, async (tx) => { for (const product of matchingProducts) { const code = String(product.code || product.label); await tx.query("INSERT INTO lead_products(id,lead_id,product_code,stage,call_stage,funnel) VALUES($1,$2,$3,$4,'lead',$5) ON CONFLICT(lead_id,product_code) DO UPDATE SET stage=EXCLUDED.stage,updated_at=now()", [`lead-product-${crypto.randomUUID()}`, id, code, stage, PRODUCT_FUNNELS[code] || "standard"]); } const result = await tx.query("UPDATE leads SET stage=$2,updated_at=now() WHERE id=$1 RETURNING *", [id, stage]); await writeAudit(tx, { actorUserId: actor.id, action: "lead.product_stage_changed", entityType: "lead", entityId: id, field: "stage", oldValue: current.stage, newValue: stage, ip: req.socket.remoteAddress }); return result.rows[0]; }); return json(res, 200, { id, lead }); } catch { return json(res, 500, { error: "Unable to change product stage." }); }
}
async function changeLeadPermission(req, res, db, actor, id) { const body = await readJson(req); const permission = String(body.permission || ""); if (!(await validDropdownValue(db, "permission", permission))) return invalidLead(res); try { await transaction(db, async (tx) => { const current = (await tx.query("SELECT permission FROM leads WHERE id=$1", [id])).rows[0]; if (!current) throw Object.assign(new Error("missing"), { status: 404 }); await tx.query("UPDATE leads SET permission=$2,updated_at=now() WHERE id=$1", [id, permission]); await writeAudit(tx, { actorUserId: actor.id, action: "lead.permission_changed", entityType: "lead", entityId: id, field: "permission", oldValue: current.permission, newValue: permission, ip: req.socket.remoteAddress }); }); return json(res, 200, { id, permission }); } catch (error) { return json(res, error.status === 404 ? 404 : 500, { error: error.status === 404 ? "Lead not found." : "Unable to change lead permission." }); } }
async function updateLeadProducts(req, res, db, actor, id) { const body = await readJson(req); if (!Array.isArray(body.products)) return invalidLead(res); const products = leadProductRows(id, body.products); try { await transaction(db, async (tx) => { for (const product of products) await tx.query("INSERT INTO lead_products (id,lead_id,product_code,stage,call_stage,funnel) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (lead_id,product_code) DO UPDATE SET stage=EXCLUDED.stage,call_stage=EXCLUDED.call_stage,funnel=EXCLUDED.funnel,updated_at=now()", [product.id, id, product.product_code, product.stage, product.call_stage, product.funnel]); await writeAudit(tx, { actorUserId: actor.id, action: "lead.products_updated", entityType: "lead", entityId: id, newValue: "products", ip: req.socket.remoteAddress }); }); return json(res, 200, { id, product_count: products.length }); } catch { return json(res, 500, { error: "Unable to save lead products." }); }
}
function leadIds(value) { return [...new Set((Array.isArray(value) ? value : []).map((id) => String(id || "").trim()).filter(Boolean))].slice(0, 500); }
async function moveLeadsToProductResolution(req, res, db, actor) {
  const body = await readJson(req); const ids = leadIds(body.ids).slice(0, 50);
  const productCode = String(body.product_code || "").trim(); const resolution = String(body.resolution || "").trim();
  if (!ids.length || !productCode || !resolution) return json(res, 400, { error: "Choose leads, a product, and a calling resolution." });
  const product = (await db.query("SELECT id,code FROM master_values WHERE master_type='product' AND active=true AND lower(btrim(code))=lower(btrim($1))", [productCode])).rows[0];
  if (!product) return json(res, 400, { error: "The selected product is no longer active." });
  const allowed = (await db.query("SELECT id FROM product_call_resolutions WHERE product_id=$1 AND active=true AND label=$2", [product.id, resolution])).rows[0];
  if (!allowed) return json(res, 400, { error: "That calling resolution is not active for the selected product." });
  const accessible = canAccessAllLeads(actor)
    ? (await db.query("SELECT id FROM leads WHERE id=ANY($1::text[]) AND COALESCE(custom_values->>'archived','false') <> 'true'", [ids])).rows.map((row) => row.id)
    : (await db.query("SELECT id FROM leads WHERE id=ANY($1::text[]) AND owner_user_id=$2 AND COALESCE(custom_values->>'archived','false') <> 'true'", [ids, actor.id])).rows.map((row) => row.id);
  if (!accessible.length) return json(res, 404, { error: "No selected leads are available." });
  await transaction(db, async (tx) => {
    await tx.query("UPDATE leads SET custom_values=jsonb_set(jsonb_set(COALESCE(custom_values,'{}'::jsonb), ARRAY['lead_fields','proposed_solution'], $1::jsonb, true), ARRAY['lead_fields','calling_resolution'], $2::jsonb, true),updated_at=now() WHERE id=ANY($3::text[])", [JSON.stringify(product.code), JSON.stringify(resolution), accessible]);
    for (const id of accessible) await writeAudit(tx, { actorUserId: actor.id, action: "lead.product_resolution_changed", entityType: "lead", entityId: id, field: "calling_resolution", newValue: JSON.stringify({ product: product.code, resolution }), ip: req.socket.remoteAddress });
  });
  return json(res, 200, { updated: accessible.length, ids: accessible });
}
async function archiveLeads(req, res, db, actor) {
  const body = await readJson(req); const ids = leadIds(body.ids);
  if (!ids.length) return json(res, 400, { error: "Select at least one lead." });
  const result = await transaction(db, async (tx) => {
    const updated = await tx.query("UPDATE leads SET custom_values=COALESCE(custom_values,'{}'::jsonb) || jsonb_build_object('archived',true,'archived_at',now()::text,'archived_by',$2::text),updated_at=now() WHERE id=ANY($1::text[]) AND COALESCE(custom_values->>'archived','false') <> 'true' RETURNING id", [ids, actor.id]);
    for (const row of updated.rows) await writeAudit(tx, { actorUserId: actor.id, action: "lead.archived", entityType: "lead", entityId: row.id, ip: req.socket.remoteAddress });
    return updated.rows.map((row) => row.id);
  });
  return json(res, 200, { archived: result.length, ids: result });
}
async function permanentlyDeleteLeads(req, res, db, actor) {
  const body = await readJson(req); const ids = leadIds(body.ids);
  if (body.confirmation !== "DELETE") return json(res, 400, { error: "Type DELETE to permanently remove leads." });
  if (!ids.length) return json(res, 400, { error: "Select at least one lead." });
  const removed = await transaction(db, async (tx) => {
    const existing = (await tx.query("SELECT id FROM leads WHERE id=ANY($1::text[]) FOR UPDATE", [ids])).rows.map((row) => row.id);
    if (!existing.length) return [];
    for (const table of ["lead_notes", "lead_product_events", "lead_products", "registration_records", "registrations", "payments"]) await tx.query(`DELETE FROM ${table} WHERE lead_id=ANY($1::text[])`, [existing]);
    await tx.query("DELETE FROM leads WHERE id=ANY($1::text[])", [existing]);
    for (const id of existing) await writeAudit(tx, { actorUserId: actor.id, action: "lead.permanently_deleted", entityType: "lead", entityId: id, ip: req.socket.remoteAddress });
    return existing;
  });
  return json(res, 200, { deleted: removed.length, ids: removed });
}

function json(res, status, body, headers = {}) { res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers }); res.end(JSON.stringify(body)); }
function readJson(req, limit = 16384) { return new Promise((resolve, reject) => { let size = 0; const chunks = []; req.on("data", (chunk) => { size += chunk.length; if (size > limit) reject(Object.assign(new Error("Request too large."), { status: 413 })); else chunks.push(chunk); }); req.on("end", () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}); } catch { reject(Object.assign(new Error("Invalid JSON."), { status: 400 })); } }); req.on("error", reject); }); }
const USER_ROLES = ["Sales", "Viewer", "Admin", "Owner"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USER_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const publicMember = (user) => ({ id: user.id, name: user.name, email: user.email, role: user.role, active: user.active });
function userWriteError(res, status, error) { return json(res, status, { error }); }
async function safeUserOperation(res, operation) { try { return await operation(); } catch { return userWriteError(res, 500, "Unable to manage users."); } }
async function safeDropdownOperation(res, operation) { try { return await operation(); } catch { return json(res, 500, { error: "Unable to load dropdowns." }); } }
async function userWriteAllowed(db, req, user) {
  const hit = await S.isThrottled(db, req, user.email, PROXY_CONFIG);
  if (hit) return false;
  return true;
}
async function clearUserWriteThrottle(db, user) { await db.throttleClear(S.accountBuckets(user.email)); }
async function usersList(res, db) {
  try { const rows = await db.query("SELECT u.id, u.name, u.email, COALESCE(ep.role_label, u.role) AS role, u.active FROM users u LEFT JOIN employee_profiles ep ON ep.user_id=u.id ORDER BY u.name ASC, u.id ASC"); return json(res, 200, { users: rows.rows.map(publicMember) }); } catch { return userWriteError(res, 500, "Unable to manage users."); }
}
async function usersCreate(req, res, db, actor) {
  let body;
  try { body = await readJson(req); } catch { return userWriteError(res, 400, "Invalid user data."); }
  const name = String(body.name || "").trim(); const email = String(body.email || "").trim().toLowerCase(); const requestedRole = String(body.role || "").trim(); const password = String(body.temporary_password || ""); const department = String(body.department || body.team || "").trim() || null; const requestedId = String(body.user_id || "").trim();
  if (!name || !EMAIL_RE.test(email) || !requestedRole || password.length < 12 || (requestedId && !USER_ID_RE.test(requestedId))) return userWriteError(res, 400, "Invalid user data.");
  const savedRole = (await db.query("SELECT id,name,access_role FROM member_roles WHERE name=$1 AND active=true", [requestedRole])).rows[0] || null;
  let role = requestedRole;
  if (!USER_ROLES.includes(requestedRole)) {
    if (!savedRole) return userWriteError(res, 400, "Invalid role.");
    role = savedRole.access_role;
  } else if (savedRole) role = savedRole.access_role;
  if (!canManageRole(actor.role, role)) return userWriteError(res, 403, "You do not have permission to manage this role.");
  if (!await userWriteAllowed(db, req, actor)) return userWriteError(res, 429, "Too many requests.");
  if (await db.userByEmail(email)) return userWriteError(res, 409, "User already exists.");
  const id = requestedId || `user-${crypto.randomUUID()}`; const salt = crypto.randomBytes(16).toString("hex"); const hash = S.passwordHash(password, salt).toString("hex");
  try {
    await transaction(db, async (tx) => {
      await tx.query("INSERT INTO users (id, name, email, role, member_role_id, active, offboarded, must_change_password) VALUES ($1, $2, $3, $4, $5, true, false, true)", [id, name, email, role, savedRole?.id || null]);
      await tx.query("INSERT INTO credentials (user_id, hash, salt) VALUES ($1, $2, $3)", [id, hash, salt]);
      await tx.query("INSERT INTO employee_profiles (user_id, team, role_label, member_role_id, active) VALUES ($1, $2, $3, $4, true) ON CONFLICT (user_id) DO UPDATE SET team = EXCLUDED.team, role_label = EXCLUDED.role_label, member_role_id = EXCLUDED.member_role_id, active = true", [id, department, requestedRole, savedRole?.id || null]);
      await writeAudit(tx, { actorUserId: actor.id, action: "member.created", entityType: "user", entityId: id, newValue: requestedRole, ip: req.socket.remoteAddress });
    });
    await clearUserWriteThrottle(db, actor);
    return json(res, 201, { user: publicMember({ id, name, email, role, active: true }) });
  } catch (error) {
    if (error && error.code === "23505") return userWriteError(res, 409, "User already exists.");
    return userWriteError(res, 500, "Unable to manage users.");
  }
}
async function memberRolesList(res, db) { const rows = await db.query("SELECT id,name,access_role,hierarchy_parent_id,hierarchy_rank FROM member_roles WHERE active=true ORDER BY hierarchy_rank DESC,name,id"); return json(res, 200, { roles: rows.rows }); }
async function userRoleUpdate(req, res, db, actor, id) {
  const target = await db.userById(id); if (!target) return userWriteError(res, 404, "User not found.");
  if (target.role === "Owner" || target.role === "Super Admin") return userWriteError(res, 403, "This user's role cannot be edited.");
  let body; try { body = await readJson(req); } catch { return userWriteError(res, 400, "Invalid role data."); }
  const roleId = String(body.member_role_id || "").trim();
  const assignedRole = (await db.query("SELECT id,name,access_role FROM member_roles WHERE id=$1 AND active=true", [roleId])).rows[0];
  if (!assignedRole || !canManageRole(actor.role, assignedRole.access_role)) return userWriteError(res, 403, "You do not have permission to assign this role.");
  try {
    await transaction(db, async (tx) => {
      await tx.query("UPDATE users SET role=$2,member_role_id=$3 WHERE id=$1", [id, assignedRole.access_role, assignedRole.id]);
      await tx.query("INSERT INTO employee_profiles(user_id,role_label,member_role_id,active) VALUES($1,$2,$3,true) ON CONFLICT(user_id) DO UPDATE SET role_label=EXCLUDED.role_label,member_role_id=EXCLUDED.member_role_id", [id, assignedRole.name, assignedRole.id]);
      await writeAudit(tx, { actorUserId: actor.id, action: "member.role_updated", entityType: "user", entityId: id, field: "member_role_id", oldValue: target.role, newValue: assignedRole.name, ip: req.socket.remoteAddress });
    });
    return json(res, 200, { user_id: id, member_role_id: assignedRole.id, role: assignedRole.name, access_role: assignedRole.access_role });
  } catch { return userWriteError(res, 500, "Unable to update member role."); }
}
async function memberRoleCreate(req, res, db, actor) { let body; try { body = await readJson(req); } catch { return userWriteError(res, 400, "Invalid role data."); } const name = String(body.name || "").trim(); const accessRole = String(body.access_role || "").trim(); if (!name || name.length > 80 || !/^[\p{L}][\p{L}0-9 _-]*$/u.test(name) || !["Sales", "Viewer", "Admin"].includes(accessRole)) return userWriteError(res, 400, "Invalid role data."); if (actor.role !== "Owner" && accessRole === "Admin") return userWriteError(res, 403, "Only Owner may create Admin-level roles."); const id = `member-role-${crypto.randomUUID()}`; try { await db.query("INSERT INTO member_roles(id,name,access_role) VALUES($1,$2,$3)", [id, name, accessRole]); await writeAudit(db, { actorUserId: actor.id, action: "member_role.created", entityType: "member_role", entityId: id, newValue: name, ip: req.socket.remoteAddress }); return json(res, 201, { id, name, access_role: accessRole }); } catch (error) { if (error.code === "23505") return userWriteError(res, 409, "That role already exists."); throw error; } }
async function memberRoleDelete(res, db, actor, id, ip) {
  const role = (await db.query("SELECT id,name,access_role FROM member_roles WHERE id=$1 AND active=true", [id])).rows[0];
  if (!role) return userWriteError(res, 404, "Role not found.");
  if (role.name === "Admin") return userWriteError(res, 400, "The Admin role cannot be deleted.");
  if (!canManageRole(actor.role, role.access_role)) return userWriteError(res, 403, "You do not have permission to delete this role.");
  try {
    await db.query("UPDATE member_roles SET active=false WHERE id=$1", [id]);
    await writeAudit(db, { actorUserId: actor.id, action: "member_role.deleted", entityType: "member_role", entityId: id, oldValue: role.name, newValue: "inactive", ip });
    return json(res, 200, { id, deleted: true });
  } catch { return userWriteError(res, 500, "Unable to delete role."); }
}
async function memberRoleHierarchyList(res, db) {
  const rows = await db.query(`SELECT r.id,r.name,r.access_role,r.hierarchy_parent_id,r.hierarchy_rank,
    parent.name AS hierarchy_parent_name, count(u.id)::int AS member_count
    FROM member_roles r
    LEFT JOIN member_roles parent ON parent.id=r.hierarchy_parent_id
    LEFT JOIN users u ON u.member_role_id=r.id AND u.active=true AND u.offboarded=false
    WHERE r.active=true
    GROUP BY r.id,parent.name
    ORDER BY r.hierarchy_rank DESC,r.name,r.id`);
  return json(res, 200, { roles: rows.rows });
}
async function memberRoleHierarchyUpdate(req, res, db, actor, id) {
  let body; try { body = await readJson(req); } catch { return userWriteError(res, 400, "Invalid hierarchy data."); }
  const parentId = String(body.hierarchy_parent_id || "").trim() || null;
  const rank = Math.max(0, Math.min(100, Number.parseInt(String(body.hierarchy_rank ?? "0"), 10) || 0));
  const role = (await db.query("SELECT id,name,access_role,hierarchy_parent_id,hierarchy_rank FROM member_roles WHERE id=$1 AND active=true", [id])).rows[0];
  if (!role) return userWriteError(res, 404, "Role not found.");
  if (parentId === id) return userWriteError(res, 400, "A role cannot report to itself.");
  let parent = null;
  if (parentId) {
    parent = (await db.query("SELECT id,name,hierarchy_parent_id FROM member_roles WHERE id=$1 AND active=true", [parentId])).rows[0];
    if (!parent) return userWriteError(res, 400, "Choose an active parent role.");
    let cursor = parent;
    const visited = new Set([id]);
    while (cursor) {
      if (visited.has(cursor.id)) return userWriteError(res, 400, "That parent role would create a circular hierarchy.");
      visited.add(cursor.id);
      cursor = cursor.hierarchy_parent_id ? (await db.query("SELECT id,hierarchy_parent_id FROM member_roles WHERE id=$1", [cursor.hierarchy_parent_id])).rows[0] : null;
    }
  }
  if (role.access_role === "Admin" && parentId) return userWriteError(res, 400, "An Admin-level role must remain at the top of the hierarchy.");
  try {
    await db.query("UPDATE member_roles SET hierarchy_parent_id=$2,hierarchy_rank=$3 WHERE id=$1", [id, parentId, rank]);
    await writeAudit(db, { actorUserId: actor.id, action: "member_role.hierarchy_updated", entityType: "member_role", entityId: id, field: "hierarchy_parent_id", oldValue: role.hierarchy_parent_id || "Top level", newValue: parent?.name || "Top level", ip: req.socket.remoteAddress });
    return json(res, 200, { id, hierarchy_parent_id: parentId, hierarchy_rank: rank });
  } catch { return userWriteError(res, 500, "Unable to save role hierarchy."); }
}
async function departmentsList(res, db) { const rows = await db.query("SELECT id,name FROM departments WHERE active=true UNION SELECT 'department-team-' || md5(btrim(team)), btrim(team) FROM employee_profiles WHERE team IS NOT NULL AND btrim(team) <> '' ORDER BY name,id"); return json(res, 200, { departments: rows.rows }); }
async function departmentCreate(req, res, db, actor) { let body; try { body = await readJson(req); } catch { return userWriteError(res, 400, "Invalid department data."); } const name = String(body.name || "").trim(); if (!name || name.length > 80 || !/^[\p{L}][\p{L}0-9 _-]*$/u.test(name)) return userWriteError(res, 400, "Invalid department data."); const id = `department-${crypto.randomUUID()}`; try { await db.query("INSERT INTO departments(id,name) VALUES($1,$2)", [id, name]); await writeAudit(db, { actorUserId: actor.id, action: "department.created", entityType: "department", entityId: id, newValue: name, ip: req.socket.remoteAddress }); return json(res, 201, { id, name }); } catch (error) { if (error.code === "23505") return userWriteError(res, 409, "That department already exists."); throw error; } }
async function usersDeactivate(req, res, db, actor, id, offboard = false) {
  if (!await userWriteAllowed(db, req, actor)) return userWriteError(res, 429, "Too many requests.");
  const target = await db.userById(id);
  if (!target) return userWriteError(res, 404, "User not found.");
  if (target.id === actor.id || target.role === "Owner" || target.role === "Super Admin") return userWriteError(res, 403, "This user cannot be deactivated.");
  try {
    await transaction(db, async (tx) => { await tx.query("DELETE FROM credentials WHERE user_id = $1", [id]); await tx.query("DELETE FROM sessions WHERE user_id = $1", [id]); await tx.query("UPDATE users SET active = false, offboarded = $2 WHERE id = $1", [id, offboard]); await writeAudit(tx, { actorUserId: actor.id, action: offboard ? "member.offboarded" : "member.deactivated", entityType: "user", entityId: id, oldValue: "active", newValue: offboard ? "offboarded" : "inactive", ip: req.socket.remoteAddress }); }); await clearUserWriteThrottle(db, actor); return json(res, 200, { user: publicMember({ ...target, active: false, offboarded: offboard }) });
  } catch { return userWriteError(res, 500, "Unable to manage users."); }
}
async function userSuspend(req, res, db, actor, id) {
  let body;
  try { body = await readJson(req); } catch { return userWriteError(res, 400, "Invalid account status."); }
  if (typeof body.active !== "boolean") return userWriteError(res, 400, "Invalid account status.");
  const active = body.active;
  if (!await userWriteAllowed(db, req, actor)) return userWriteError(res, 429, "Too many requests.");
  const target = await db.userById(id);
  if (!target) return userWriteError(res, 404, "User not found.");
  if (target.id === actor.id || target.role === "Owner" || target.role === "Super Admin") return userWriteError(res, 403, "This user's sign-in cannot be changed.");
  try {
    await transaction(db, async (tx) => {
      await tx.query("UPDATE users SET active=$2,offboarded=false WHERE id=$1", [id, active]);
      if (!active) await tx.query("DELETE FROM sessions WHERE user_id=$1", [id]);
      await tx.query("UPDATE employee_profiles SET active=$2 WHERE user_id=$1", [id, active]);
      await writeAudit(tx, { actorUserId: actor.id, action: active ? "member.reactivated" : "member.suspended", entityType: "user", entityId: id, oldValue: target.active ? "active" : "suspended", newValue: active ? "active" : "suspended", ip: req.socket.remoteAddress });
    });
    await clearUserWriteThrottle(db, actor);
    return json(res, 200, { user: publicMember({ ...target, active, offboarded: false }) });
  } catch { return userWriteError(res, 500, "Unable to update account status."); }
}
async function userDelete(req, res, db, actor, id) {
  if (!await userWriteAllowed(db, req, actor)) return userWriteError(res, 429, "Too many requests.");
  const target = await db.userById(id);
  if (!target) return userWriteError(res, 404, "User not found.");
  if (target.id === actor.id || target.role === "Owner" || target.role === "Super Admin") return userWriteError(res, 403, "This user cannot be deleted.");
  try {
    await transaction(db, async (tx) => {
      await tx.query("DELETE FROM employee_profiles WHERE user_id=$1", [id]);
      // Keep CRM history intact while removing this person's references. The
      // database catalogue gives us every nullable foreign key to users, so
      // this remains correct as further CRM modules add user references.
      const references = await tx.query(`SELECT ns.nspname AS schema_name, cls.relname AS table_name, att.attname AS column_name
        FROM pg_constraint con
        JOIN pg_class cls ON cls.oid=con.conrelid
        JOIN pg_namespace ns ON ns.oid=cls.relnamespace
        JOIN unnest(con.conkey) AS key(attnum) ON true
        JOIN pg_attribute att ON att.attrelid=con.conrelid AND att.attnum=key.attnum
        WHERE con.contype='f' AND con.confrelid='public.users'::regclass
          AND con.confdeltype NOT IN ('c','n') AND NOT att.attnotnull
          AND NOT (ns.nspname='public' AND cls.relname='employee_profiles' AND att.attname='user_id')`, []);
      for (const reference of references.rows) {
        const quote = (value) => `"${String(value).replace(/"/g, '""')}"`;
        await tx.query(`UPDATE ${quote(reference.schema_name)}.${quote(reference.table_name)} SET ${quote(reference.column_name)}=NULL WHERE ${quote(reference.column_name)}=$1`, [id]);
      }
      await tx.query("DELETE FROM users WHERE id=$1", [id]);
      await writeAudit(tx, { actorUserId: actor.id, action: "member.deleted", entityType: "user", entityId: id, oldValue: target.email, newValue: "deleted", ip: req.socket.remoteAddress });
    });
    await clearUserWriteThrottle(db, actor);
    return json(res, 200, { id, deleted: true });
  } catch (error) {
    if (error?.code === "23503") return userWriteError(res, 409, "This user still has a protected linked record and cannot be deleted.");
    return userWriteError(res, 500, "Unable to delete user.");
  }
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
async function userAccessList(res, db, actor, id) {
  const target = await db.userById(id); if (!target) return userWriteError(res, 404, "User not found.");
  if (target.role === "Owner" || target.role === "Super Admin") return userWriteError(res, 403, "This user's access cannot be edited.");
  const rows = await db.query("SELECT capability FROM user_capability_overrides WHERE user_id=$1 ORDER BY capability", [id]);
  return json(res, 200, { capabilities: Object.keys(CAPABILITIES), overrides: rows.rows.map((row) => row.capability) });
}
async function userAccessWrite(req, res, db, actor, id) {
  const target = await db.userById(id); if (!target) return userWriteError(res, 404, "User not found.");
  if (target.role === "Owner" || target.role === "Super Admin") return userWriteError(res, 403, "This user's access cannot be edited.");
  let body; try { body = await readJson(req); } catch { return userWriteError(res, 400, "Invalid access data."); }
  if (!Array.isArray(body.capabilities) || body.capabilities.some((capability) => typeof capability !== "string" || !Object.prototype.hasOwnProperty.call(CAPABILITIES, capability))) return userWriteError(res, 400, "Invalid access data.");
  const capabilities = [...new Set(body.capabilities)];
  if (actor.role !== "Owner" && capabilities.some((capability) => !requireCapability(capability, actor))) return userWriteError(res, 403, "You cannot grant an access level you do not have.");
  try { await transaction(db, async (tx) => { await tx.query("DELETE FROM user_capability_overrides WHERE user_id=$1", [id]); for (const capability of capabilities) await tx.query("INSERT INTO user_capability_overrides(user_id,capability) VALUES($1,$2)", [id, capability]); await writeAudit(tx, { actorUserId: actor.id, action: "member.access_updated", entityType: "user", entityId: id, newValue: capabilities.join(",") || "none", ip: req.socket.remoteAddress }); }); return json(res, 200, { user_id: id, overrides: capabilities }); } catch { return userWriteError(res, 500, "Unable to update access levels."); }
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
async function productCatalogList(res, db) {
  const rows = await db.query("SELECT id,code,label FROM master_values WHERE master_type='product' AND active=true ORDER BY sort_order,label", []);
  return json(res, 200, { products: rows.rows.map((row) => ({ id: row.id, code: String(row.code || row.label), label: row.label })) });
}
async function productDropdownDefinitionSave(req, res, db, actor) {
  const body = await readJson(req); const label = String(body.label || "Products").trim();
  if (!label || label.length > 120) return userWriteError(res, 400, "Invalid product dropdown label.");
  await db.query("INSERT INTO dropdown_definitions(id,key,label,source_type,required,default_value,is_visible,is_active,sort_order) VALUES('dropdown-products-catalog','products',$1,'api_backed',false,NULL,$2,$3,145) ON CONFLICT(key) DO UPDATE SET label=EXCLUDED.label,is_visible=EXCLUDED.is_visible,is_active=EXCLUDED.is_active,updated_at=now()", [label, body.is_visible !== false, body.is_active !== false]);
  await writeAudit(db, { actorUserId: actor.id, action: "product.dropdown_updated", entityType: "dropdown_definition", entityId: "dropdown-products-catalog", newValue: label, ip: req.socket.remoteAddress });
  return json(res, 200, { id: "dropdown-products-catalog" });
}
async function productCatalogReorder(req, res, db, actor) { const body = await readJson(req); if (!Array.isArray(body.product_ids) || !body.product_ids.length) return userWriteError(res, 400, "A complete product order is required."); const current = await db.query("SELECT id FROM master_values WHERE master_type='product'", []); const ids = current.rows.map((row) => row.id); if (ids.length !== body.product_ids.length || new Set(body.product_ids).size !== ids.length || body.product_ids.some((id) => !ids.includes(id))) return userWriteError(res, 400, "Invalid product order."); await transaction(db, async (tx) => { for (let index = 0; index < body.product_ids.length; index += 1) await tx.query("UPDATE master_values SET sort_order=$2,updated_at=now() WHERE id=$1", [body.product_ids[index], index]); await writeAudit(tx, { actorUserId: actor.id, action: "product.reordered", entityType: "product_catalog", entityId: "products", newValue: "ordered", ip: req.socket.remoteAddress }); }); return json(res, 200, { product_ids: body.product_ids }); }
async function productStagesList(res, db, productId) {
  const product = (await db.query("SELECT id FROM master_values WHERE id=$1 AND master_type='product'", [productId])).rows[0];
  if (!product) return json(res, 404, { error: "Product not found." });
  const rows = await db.query("SELECT id,product_id,label,sort_order,active FROM product_stages WHERE product_id=$1 ORDER BY sort_order,label", [productId]);
  return json(res, 200, { stages: rows.rows });
}
async function productStageWrite(req, res, db, actor, productId, stageId = null) {
  const body = await readJson(req); const label = String(body.label || "").trim();
  if (!label || label.length > 120) return userWriteError(res, 400, "Invalid product stage.");
  const product = (await db.query("SELECT id FROM master_values WHERE id=$1 AND master_type='product'", [productId])).rows[0];
  if (!product) return userWriteError(res, 404, "Product not found.");
  const id = stageId || `product-stage-${crypto.randomUUID()}`;
  try { await transaction(db, async (tx) => {
    await tx.query("INSERT INTO product_stages(id,product_id,label,sort_order,active) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET label=EXCLUDED.label,sort_order=EXCLUDED.sort_order,active=EXCLUDED.active,updated_at=now()", [id, productId, label, Number.isInteger(body.sort_order) ? body.sort_order : 0, body.active !== false]);
    await writeAudit(tx, { actorUserId: actor.id, action: stageId ? "product_stage.updated" : "product_stage.created", entityType: "product_stage", entityId: id, newValue: label, ip: req.socket.remoteAddress });
  }); return json(res, stageId ? 200 : 201, { id }); } catch (error) { return json(res, error?.code === "23505" ? 409 : 500, { error: error?.code === "23505" ? "That stage already exists for this product." : "Unable to save product stage." }); }
}
async function productCallResolutionsList(res, db, productId) {
  const product = (await db.query("SELECT id FROM master_values WHERE id=$1 AND master_type='product'", [productId])).rows[0];
  if (!product) return json(res, 404, { error: "Product not found." });
  const rows = await db.query("SELECT id,product_id,label,sort_order,active FROM product_call_resolutions WHERE product_id=$1 ORDER BY sort_order,label", [productId]);
  return json(res, 200, { resolutions: rows.rows });
}
async function productCallResolutionWrite(req, res, db, actor, productId, resolutionId = null) {
  const body = await readJson(req); const label = String(body.label || "").trim();
  if (!label || label.length > 120) return userWriteError(res, 400, "Invalid product call resolution.");
  const product = (await db.query("SELECT id FROM master_values WHERE id=$1 AND master_type='product'", [productId])).rows[0];
  if (!product) return userWriteError(res, 404, "Product not found.");
  const id = resolutionId || `product-call-resolution-${crypto.randomUUID()}`;
  try { await transaction(db, async (tx) => {
    await tx.query("INSERT INTO product_call_resolutions(id,product_id,label,sort_order,active) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET label=EXCLUDED.label,sort_order=EXCLUDED.sort_order,active=EXCLUDED.active,updated_at=now()", [id, productId, label, Number.isInteger(body.sort_order) ? body.sort_order : 0, body.active !== false]);
    await writeAudit(tx, { actorUserId: actor.id, action: resolutionId ? "product_call_resolution.updated" : "product_call_resolution.created", entityType: "product_call_resolution", entityId: id, newValue: label, ip: req.socket.remoteAddress });
  }); return json(res, resolutionId ? 200 : 201, { id }); } catch (error) { return json(res, error?.code === "23505" ? 409 : 500, { error: error?.code === "23505" ? "That call resolution already exists for this product." : "Unable to save product call resolution." }); }
}
async function productOptionDelete(res, db, actor, productId, optionId, kind, ip) {
  const table = kind === "stage" ? "product_stages" : "product_call_resolutions";
  const entityType = kind === "stage" ? "product_stage" : "product_call_resolution";
  const existing = (await db.query(`SELECT id,label FROM ${table} WHERE id=$1 AND product_id=$2`, [optionId, productId])).rows[0];
  if (!existing) return userWriteError(res, 404, "Product option not found.");
  await transaction(db, async (tx) => {
    await tx.query(`DELETE FROM ${table} WHERE id=$1 AND product_id=$2`, [optionId, productId]);
    await writeAudit(tx, { actorUserId: actor.id, action: `${entityType}.deleted`, entityType, entityId: optionId, oldValue: existing.label, ip });
  });
  return json(res, 200, { id: optionId, deleted: true });
}
const ASSIGNMENT_CONDITION_FIELDS = new Set(["team", "lead_type", "stage", "lead_status", "source_system", "lead_source"]);
function assignmentRulePayload(body) {
  const name = String(body.name || "").trim(); const priority = Number(body.priority);
  if (!name || name.length > 120 || !Number.isInteger(priority) || priority < 0 || priority > 100000) return null;
  const conditions = body.conditions && typeof body.conditions === "object" && !Array.isArray(body.conditions) ? body.conditions : {};
  const actions = body.actions && typeof body.actions === "object" && !Array.isArray(body.actions) ? body.actions : {};
  const cleanConditions = {};
  for (const [key, value] of Object.entries(conditions)) { const text = String(value || "").trim(); if (text && ASSIGNMENT_CONDITION_FIELDS.has(key) && text.length <= 120) cleanConditions[key] = text; }
  const userIds = Array.isArray(actions.user_ids) ? [...new Set(actions.user_ids.map((value) => String(value || "").trim()).filter((value) => /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value)))].slice(0, 100) : [];
  if (!userIds.length) return null;
  return { name, priority, enabled: body.enabled !== false, conditions: cleanConditions, actions: { user_ids: userIds } };
}
async function assignmentRulesList(res, db) {
  const rows = await db.query("SELECT id,name,priority,enabled,conditions,actions,last_assigned_user_id,rotation_updated_at FROM assignment_rules ORDER BY priority,name,id");
  return json(res, 200, { rules: rows.rows });
}
async function assignmentRuleWrite(req, res, db, actor, id = null) {
  let body; try { body = await readJson(req); } catch { return userWriteError(res, 400, "Invalid assignment rule."); }
  const rule = assignmentRulePayload(body); if (!rule) return userWriteError(res, 400, "Provide a name, priority, and at least one eligible team member.");
  const members = await db.query("SELECT id FROM users WHERE id = ANY($1::text[]) AND active=true AND offboarded=false", [rule.actions.user_ids]);
  if (members.rows.length !== rule.actions.user_ids.length) return userWriteError(res, 400, "One or more selected team members are inactive or unavailable.");
  const ruleId = id || `assignment-rule-${crypto.randomUUID()}`;
  if (id && !(await db.query("SELECT id FROM assignment_rules WHERE id=$1", [id])).rows[0]) return userWriteError(res, 404, "Assignment rule not found.");
  await transaction(db, async (tx) => {
    await tx.query("INSERT INTO assignment_rules(id,source_id,name,priority,enabled,conditions,actions,rule,updated_at) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,'{}'::jsonb,now()) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,priority=EXCLUDED.priority,enabled=EXCLUDED.enabled,conditions=EXCLUDED.conditions,actions=EXCLUDED.actions,updated_at=now()", [ruleId, ruleId, rule.name, rule.priority, rule.enabled, JSON.stringify(rule.conditions), JSON.stringify(rule.actions)]);
    await writeAudit(tx, { actorUserId: actor.id, action: id ? "assignment_rule.updated" : "assignment_rule.created", entityType: "assignment_rule", entityId: ruleId, newValue: rule.name, ip: req.socket.remoteAddress });
  });
  return json(res, id ? 200 : 201, { id: ruleId });
}
async function assignmentRuleDelete(res, db, actor, id, ip) {
  const existing = (await db.query("SELECT name FROM assignment_rules WHERE id=$1", [id])).rows[0]; if (!existing) return userWriteError(res, 404, "Assignment rule not found.");
  await transaction(db, async (tx) => { await tx.query("DELETE FROM assignment_rules WHERE id=$1", [id]); await writeAudit(tx, { actorUserId: actor.id, action: "assignment_rule.deleted", entityType: "assignment_rule", entityId: id, oldValue: existing.name, ip }); });
  return json(res, 200, { id, deleted: true });
}
async function assignmentManualWrite(req, res, db, actor) {
  let body; try { body = await readJson(req); } catch { return userWriteError(res, 400, "Invalid manual assignment."); }
  const ownerIds = [...new Set((Array.isArray(body.owner_user_ids) ? body.owner_user_ids : [body.owner_user_id]).map((value) => String(value || "").trim()).filter((value) => /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value)))].slice(0, 50);
  const leadIds = Array.isArray(body.lead_ids) ? [...new Set(body.lead_ids.map((value) => String(value || "").trim()).filter((value) => /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value)))].slice(0, 100) : [];
  if (!ownerIds.length || !leadIds.length) return userWriteError(res, 400, "Choose at least one lead and one active user.");
  const ownerRows = (await db.query("SELECT id,name FROM users WHERE id = ANY($1::text[]) AND active=true AND offboarded=false", [ownerIds])).rows;
  if (ownerRows.length !== ownerIds.length) return userWriteError(res, 400, "One or more selected users are inactive or unavailable.");
  const ownerById = new Map(ownerRows.map((owner) => [owner.id, owner]));
  const owners = ownerIds.map((id) => ownerById.get(id));
  await transaction(db, async (tx) => {
    const selected = (await tx.query("SELECT id,owner_user_id FROM leads WHERE id = ANY($1::text[]) FOR UPDATE", [leadIds])).rows;
    if (selected.length !== leadIds.length) throw Object.assign(new Error("One or more leads were not found."), { status: 404 });
    const leadById = new Map(selected.map((lead) => [lead.id, lead]));
    for (const [index, leadId] of leadIds.entries()) {
      const lead = leadById.get(leadId); const owner = owners[index % owners.length];
      await tx.query("UPDATE leads SET owner_user_id=$2,updated_at=now() WHERE id=$1", [lead.id, owner.id]);
      await writeAssignmentHistory(tx, { leadId: lead.id, actorId: actor.id, action: "lead.owner_changed", previousOwner: lead.owner_user_id, ownerId: owner.id, reason: owners.length > 1 ? "manual_round_robin" : "manual", note: `${owners.length > 1 ? "Round-robin assigned" : "Manually assigned"} to ${owner.name || owner.id}.` });
      await writeAudit(tx, { actorUserId: actor.id, action: "lead.manually_assigned", entityType: "lead", entityId: lead.id, oldValue: lead.owner_user_id || null, newValue: owner.id, ip: req.socket.remoteAddress });
    }
  });
  const distribution = Object.fromEntries(owners.map((owner) => [owner.id, leadIds.filter((_, index) => owners[index % owners.length].id === owner.id).length]));
  return json(res, 200, { assigned: leadIds.length, owners: owners.map((owner) => ({ id: owner.id, name: owner.name })), distribution });
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
async function userOptionsList(res, db) { const rows = await db.query("SELECT id,name FROM users WHERE active=true AND offboarded=false ORDER BY name,id", []); return json(res, 200, { options: rows.rows.map(({ id, name }) => ({ id, name })) }); }
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
  return json(res, 200, { ok: true, user: await publicCurrentUser(db, user) }, { "Set-Cookie": S.sessionCookie(req, token, S.SESSION_SECONDS, PROXY_CONFIG) });
}

async function route(req, res, db) {
  S.securityHeaders(res);
  const url = new URL(req.url || "/", "http://localhost");
  const publicIntegrationLeadMatch = url.pathname.match(/^\/api\/integrations\/([^/]+)\/leads$/);
  if (publicIntegrationLeadMatch && req.method === "POST") return Integrations.receiveLead(req, res, db, decodeURIComponent(publicIntegrationLeadMatch[1]));
  if (req.method === "POST" && !S.csrfValid(req)) return json(res, 403, { error: "Missing request header." });
  if (url.pathname === "/api/health" && req.method === "GET") return json(res, 200, { ok: true, app: "altus-crm", singleTenant: true });
  if (url.pathname === "/api/login" && req.method === "POST") return login(req, res, db);
  if (url.pathname === "/api/password-reset/request" && req.method === "POST") {
    let body; try { body = await readJson(req); } catch { return json(res, 200, { message: PasswordReset.GENERIC_MESSAGE }); }
    return PasswordReset.requestPasswordReset({ body, req, res, db });
  }
  if (url.pathname === "/api/password-reset/complete" && req.method === "POST") {
    let body; try { body = await readJson(req); } catch { return json(res, 400, { error: "Enter a valid token and matching password of at least 12 characters." }); }
    return PasswordReset.completePasswordReset({ body, req, res, db });
  }
  if (!url.pathname.startsWith("/api/") && req.method === "GET" && staticFile(req, res)) return;
  const token = S.sessionToken(req); const id = await db.sessionUser(token); const user = id ? await db.userById(id) : null;
  if (user && typeof db.query === "function") { try { user.capability_overrides = (await db.query("SELECT capability FROM user_capability_overrides WHERE user_id=$1", [user.id])).rows.map((row) => row.capability); } catch { user.capability_overrides = []; } }
  if (url.pathname === "/api/me" && req.method === "GET") return user ? json(res, 200, { user: await publicCurrentUser(db, user) }) : json(res, 401, { error: "Please sign in." });
  if (!user) return json(res, 401, { error: "Please sign in." });
  const tablePreferenceMatch = url.pathname.match(/^\/api\/user-preferences\/table\/([^/]+)$/);
  if (tablePreferenceMatch && ["GET", "PUT", "DELETE"].includes(req.method)) {
    if (["PUT", "DELETE"].includes(req.method) && !S.csrfValid(req)) return json(res, 403, { error: "Missing request header." });
    const preference = tablePreferenceFor(decodeURIComponent(tablePreferenceMatch[1]));
    if (!preference) return json(res, 404, { error: "Unknown table preference." });
    if (req.method === "GET") return tablePreferenceGet(res, db, user, preference);
    if (req.method === "DELETE") return tablePreferenceDelete(res, db, user, preference);
    return tablePreferenceWrite(req, res, db, user, preference);
  }
  const userPreferenceMatch = url.pathname.match(/^\/api\/user-preferences\/([^/]+)$/);
  if (userPreferenceMatch && ["GET", "POST", "DELETE"].includes(req.method)) {
    const key = decodeURIComponent(userPreferenceMatch[1]);
    if (!USER_PREFERENCE_KEY_RE.test(key)) return json(res, 400, { error: "Invalid preference key." });
    if (req.method === "GET") return userPreferenceGet(res, db, user, key);
    if (req.method === "DELETE") return userPreferenceDelete(res, db, user, key);
    return userPreferenceWrite(req, res, db, user, key);
  }
  if (url.pathname === "/api/change-password" && req.method === "POST") return changePassword(req, res, db, user);
  if (url.pathname === "/api/dropdowns" && req.method === "GET") return safeDropdownOperation(res, () => Dropdowns.dropdownsList(req, res, db, user));
  if (url.pathname === "/api/dropdowns" && req.method === "POST") return safeDropdownOperation(res, () => Dropdowns.createDefinition(req, res, db, user));
  const dropdownOptionReorderMatch = url.pathname.match(/^\/api\/dropdowns\/([^/]+)\/options\/reorder$/);
  if (dropdownOptionReorderMatch && req.method === "POST") return safeDropdownOperation(res, () => Dropdowns.reorderOptions(req, res, db, user, decodeURIComponent(dropdownOptionReorderMatch[1])));
  const dropdownOptionActionMatch = url.pathname.match(/^\/api\/dropdowns\/([^/]+)\/options\/([^/]+)\/(deactivate)$/);
  if (dropdownOptionActionMatch && req.method === "POST") return safeDropdownOperation(res, () => Dropdowns.deactivateOption(req, res, db, user, decodeURIComponent(dropdownOptionActionMatch[1]), decodeURIComponent(dropdownOptionActionMatch[2])));
  const dropdownOptionMatch = url.pathname.match(/^\/api\/dropdowns\/([^/]+)\/options\/([^/]+)$/);
  if (dropdownOptionMatch && req.method === "POST") return safeDropdownOperation(res, () => Dropdowns.updateOption(req, res, db, user, decodeURIComponent(dropdownOptionMatch[1]), decodeURIComponent(dropdownOptionMatch[2])));
  const dropdownOptionsMatch = url.pathname.match(/^\/api\/dropdowns\/([^/]+)\/options$/);
  if (dropdownOptionsMatch && req.method === "POST") return safeDropdownOperation(res, () => Dropdowns.createOption(req, res, db, user, decodeURIComponent(dropdownOptionsMatch[1])));
  const dropdownDeactivateMatch = url.pathname.match(/^\/api\/dropdowns\/([^/]+)\/deactivate$/);
  if (dropdownDeactivateMatch && req.method === "POST") return safeDropdownOperation(res, () => Dropdowns.deactivateDefinition(req, res, db, user, decodeURIComponent(dropdownDeactivateMatch[1])));
  const dropdownMatch = url.pathname.match(/^\/api\/dropdowns\/([^/]+)$/);
  if (dropdownMatch && req.method === "POST") return safeDropdownOperation(res, () => Dropdowns.updateDefinition(req, res, db, user, decodeURIComponent(dropdownMatch[1])));
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
  const userDeleteMatch = url.pathname.match(/^\/api\/users\/([^/]+)$/);
  if (userDeleteMatch && req.method === "DELETE") { if (!requireCapability("users.manage", user)) return userWriteError(res, 403, "You do not have permission to manage users."); return safeUserOperation(res, () => userDelete(req, res, db, user, decodeURIComponent(userDeleteMatch[1]))); }
  if (url.pathname === "/api/member-roles" && req.method === "GET") { if (!requireCapability("users.manage", user)) return userWriteError(res, 403, "You do not have permission to manage roles."); return safeUserOperation(res, () => memberRolesList(res, db)); }
  if (url.pathname === "/api/member-roles" && req.method === "POST") { if (!requireCapability("users.manage", user)) return userWriteError(res, 403, "You do not have permission to manage roles."); return safeUserOperation(res, () => memberRoleCreate(req, res, db, user)); }
  if (url.pathname === "/api/member-roles/hierarchy" && req.method === "GET") { if (!requireCapability("users.manage", user)) return userWriteError(res, 403, "You do not have permission to manage role hierarchy."); return safeUserOperation(res, () => memberRoleHierarchyList(res, db)); }
  const memberRoleHierarchyMatch = url.pathname.match(/^\/api\/member-roles\/([^/]+)\/hierarchy$/);
  if (memberRoleHierarchyMatch && req.method === "POST") { if (!requireCapability("users.manage", user)) return userWriteError(res, 403, "You do not have permission to manage role hierarchy."); return safeUserOperation(res, () => memberRoleHierarchyUpdate(req, res, db, user, decodeURIComponent(memberRoleHierarchyMatch[1]))); }
  const memberRoleMatch = url.pathname.match(/^\/api\/member-roles\/([^/]+)$/);
  if (memberRoleMatch && req.method === "DELETE") { if (!requireCapability("users.manage", user)) return userWriteError(res, 403, "You do not have permission to manage roles."); return safeUserOperation(res, () => memberRoleDelete(res, db, user, decodeURIComponent(memberRoleMatch[1]), req.socket.remoteAddress)); }
  if (url.pathname === "/api/departments" && req.method === "GET") { if (!requireCapability("users.manage", user)) return userWriteError(res, 403, "You do not have permission to manage departments."); return safeUserOperation(res, () => departmentsList(res, db)); }
  if (url.pathname === "/api/departments" && req.method === "POST") { if (!requireCapability("users.manage", user)) return userWriteError(res, 403, "You do not have permission to manage departments."); return safeUserOperation(res, () => departmentCreate(req, res, db, user)); }
  if (url.pathname === "/api/integrations" && req.method === "GET") { if (!requireCapability("workspace.manage", user)) return userWriteError(res, 403, "You do not have permission to manage integrations."); return safeUserOperation(res, () => Integrations.listConnections(res, db, req)); }
  if (url.pathname === "/api/integrations" && req.method === "POST") { if (!requireCapability("workspace.manage", user)) return userWriteError(res, 403, "You do not have permission to manage integrations."); return safeUserOperation(res, () => Integrations.createConnection(req, res, db, user)); }
  const integrationToggleMatch = url.pathname.match(/^\/api\/integrations\/([^/]+)$/);
  if (integrationToggleMatch && req.method === "POST") { if (!requireCapability("workspace.manage", user)) return userWriteError(res, 403, "You do not have permission to manage integrations."); return safeUserOperation(res, () => Integrations.toggleConnection(req, res, db, user, decodeURIComponent(integrationToggleMatch[1]))); }
  const accessMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/access$/);
  if (accessMatch && ["GET", "POST"].includes(req.method)) { if (!requireCapability("users.manage", user)) return userWriteError(res, 403, "You do not have permission to manage user access."); const targetId = decodeURIComponent(accessMatch[1]); return safeUserOperation(res, () => req.method === "GET" ? userAccessList(res, db, user, targetId) : userAccessWrite(req, res, db, user, targetId)); }
  const userRoleMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/role$/);
  if (userRoleMatch && req.method === "POST") { if (!requireCapability("users.manage", user)) return userWriteError(res, 403, "You do not have permission to manage user roles."); return userRoleUpdate(req, res, db, user, decodeURIComponent(userRoleMatch[1])); }
  const userStatusMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/status$/);
  if (userStatusMatch && req.method === "POST") { if (!requireCapability("users.manage", user)) return userWriteError(res, 403, "You do not have permission to manage users."); return safeUserOperation(res, () => userSuspend(req, res, db, user, decodeURIComponent(userStatusMatch[1]))); }
  const userMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/(deactivate|offboard|reset-password)$/);
  if (userMatch && req.method === "POST") {
    if (!requireCapability("users.manage", user)) return userWriteError(res, 403, "You do not have permission to manage users.");
    if (userMatch[2] === "reset-password" && !requireCapability("users.manage", user)) return userWriteError(res, 403, "You do not have permission to reset passwords.");
    const targetId = decodeURIComponent(userMatch[1]);
    return safeUserOperation(res, () => userMatch[2] === "reset-password" ? usersResetPassword(req, res, db, user, targetId) : usersDeactivate(req, res, db, user, targetId, userMatch[2] === "offboard"));
  }
  if (url.pathname === "/api/masters" && req.method === "GET") { if (!requireCapability("masters.view", user)) return userWriteError(res, 403, "You do not have permission to view masters."); return safeUserOperation(res, () => mastersList(req, res, db)); }
  if (url.pathname === "/api/masters" && req.method === "POST") { if (!requireCapability("masters.edit", user)) return userWriteError(res, 403, "You do not have permission to edit masters."); return safeUserOperation(res, () => masterWrite(req, res, db, user)); }
  const masterMatch = url.pathname.match(/^\/api\/masters\/([^/]+)$/); if (masterMatch && req.method === "POST") { if (!requireCapability("masters.edit", user)) return userWriteError(res, 403, "You do not have permission to edit masters."); return safeUserOperation(res, () => masterWrite(req, res, db, user, decodeURIComponent(masterMatch[1]))); }
  if (url.pathname === "/api/products" && req.method === "GET") { if (!requireCapability("leads.view", user)) return json(res, 403, { error: "You do not have permission to view products." }); return safeUserOperation(res, () => productCatalogList(res, db)); }
  if (url.pathname === "/api/products/dropdown-definition" && req.method === "POST") { if (!requireCapability("masters.edit", user)) return userWriteError(res, 403, "You do not have permission to manage products."); return safeUserOperation(res, () => productDropdownDefinitionSave(req, res, db, user)); }
  if (url.pathname === "/api/products/reorder" && req.method === "POST") { if (!requireCapability("masters.edit", user)) return userWriteError(res, 403, "You do not have permission to reorder products."); return safeUserOperation(res, () => productCatalogReorder(req, res, db, user)); }
  if (url.pathname === "/api/assignment-rules" && req.method === "GET") { if (!requireCapability("leads.assign", user)) return userWriteError(res, 403, "You do not have permission to manage assignment rules."); return safeUserOperation(res, () => assignmentRulesList(res, db)); }
  if (url.pathname === "/api/assignment-rules" && req.method === "POST") { if (!requireCapability("leads.assign", user)) return userWriteError(res, 403, "You do not have permission to manage assignment rules."); return safeUserOperation(res, () => assignmentRuleWrite(req, res, db, user)); }
  if (url.pathname === "/api/assignment-rules/manual" && req.method === "POST") { if (!requireCapability("leads.assign", user)) return userWriteError(res, 403, "You do not have permission to assign leads."); return assignmentManualWrite(req, res, db, user); }
  const assignmentRuleMatch = url.pathname.match(/^\/api\/assignment-rules\/([^/]+)$/);
  if (assignmentRuleMatch && req.method === "PATCH") { if (!requireCapability("leads.assign", user)) return userWriteError(res, 403, "You do not have permission to manage assignment rules."); return safeUserOperation(res, () => assignmentRuleWrite(req, res, db, user, decodeURIComponent(assignmentRuleMatch[1]))); }
  if (assignmentRuleMatch && req.method === "DELETE") { if (!requireCapability("leads.assign", user)) return userWriteError(res, 403, "You do not have permission to manage assignment rules."); return safeUserOperation(res, () => assignmentRuleDelete(res, db, user, decodeURIComponent(assignmentRuleMatch[1]), req.socket.remoteAddress)); }
  const productStageMatch = url.pathname.match(/^\/api\/products\/([^/]+)\/stages(?:\/([^/]+))?$/);
  if (productStageMatch && req.method === "GET") { if (!requireCapability("leads.view", user)) return userWriteError(res, 403, "You do not have permission to view product stages."); return safeUserOperation(res, () => productStagesList(res, db, decodeURIComponent(productStageMatch[1]))); }
  if (productStageMatch && req.method === "POST") { if (!requireCapability("masters.edit", user)) return userWriteError(res, 403, "You do not have permission to manage product stages."); return safeUserOperation(res, () => productStageWrite(req, res, db, user, decodeURIComponent(productStageMatch[1]), productStageMatch[2] ? decodeURIComponent(productStageMatch[2]) : null)); }
  if (productStageMatch && productStageMatch[2] && req.method === "DELETE") { if (!requireCapability("masters.edit", user)) return userWriteError(res, 403, "You do not have permission to manage product stages."); return safeUserOperation(res, () => productOptionDelete(res, db, user, decodeURIComponent(productStageMatch[1]), decodeURIComponent(productStageMatch[2]), "stage", req.socket.remoteAddress)); }
  const productCallResolutionMatch = url.pathname.match(/^\/api\/products\/([^/]+)\/call-resolutions(?:\/([^/]+))?$/);
  if (productCallResolutionMatch && req.method === "GET") { if (!requireCapability("leads.view", user)) return userWriteError(res, 403, "You do not have permission to view product call resolutions."); return safeUserOperation(res, () => productCallResolutionsList(res, db, decodeURIComponent(productCallResolutionMatch[1]))); }
  if (productCallResolutionMatch && req.method === "POST") { if (!requireCapability("masters.edit", user)) return userWriteError(res, 403, "You do not have permission to manage product call resolutions."); return safeUserOperation(res, () => productCallResolutionWrite(req, res, db, user, decodeURIComponent(productCallResolutionMatch[1]), productCallResolutionMatch[2] ? decodeURIComponent(productCallResolutionMatch[2]) : null)); }
  if (productCallResolutionMatch && productCallResolutionMatch[2] && req.method === "DELETE") { if (!requireCapability("masters.edit", user)) return userWriteError(res, 403, "You do not have permission to manage product call resolutions."); return safeUserOperation(res, () => productOptionDelete(res, db, user, decodeURIComponent(productCallResolutionMatch[1]), decodeURIComponent(productCallResolutionMatch[2]), "resolution", req.socket.remoteAddress)); }
  if (url.pathname === "/api/targets" && req.method === "GET") { if (!requireCapability("targets.manage", user)) return userWriteError(res, 403, "You do not have permission to view targets."); return safeUserOperation(res, () => targetsList(res, db)); }
  if (url.pathname === "/api/targets" && req.method === "POST") { if (!requireCapability("targets.manage", user)) return userWriteError(res, 403, "You do not have permission to edit targets."); return safeUserOperation(res, () => targetWrite(req, res, db, user)); }
  const targetMatch = url.pathname.match(/^\/api\/targets\/([^/]+)$/); if (targetMatch && req.method === "POST") { if (!requireCapability("targets.manage", user)) return userWriteError(res, 403, "You do not have permission to edit targets."); return safeUserOperation(res, () => targetWrite(req, res, db, user, decodeURIComponent(targetMatch[1]))); }
  if (url.pathname === "/api/workspace-settings" && req.method === "GET") { if (!requireCapability("workspace.manage", user)) return userWriteError(res, 403, "You do not have permission to view workspace settings."); return safeUserOperation(res, () => settingsList(res, db)); }
  if (url.pathname === "/api/workspace-settings" && req.method === "POST") { if (!requireCapability("workspace.manage", user)) return userWriteError(res, 403, "You do not have permission to edit workspace settings."); return safeUserOperation(res, () => settingWrite(req, res, db, user)); }
  if (url.pathname === "/api/lead-fields" && req.method === "GET") { if (!requireCapability("leads.view", user)) return json(res, 403, { error: "You do not have permission to view lead fields." }); return safeUserOperation(res, () => leadFieldsList(res, db)); }
  if (url.pathname === "/api/lead-fields" && req.method === "POST") { if (!requireCapability("workspace.manage", user)) return userWriteError(res, 403, "You do not have permission to manage lead fields."); return leadFieldsWrite(req, res, db, user); }
  const leadFieldMatch = url.pathname.match(/^\/api\/lead-fields\/([^/]+)$/);
  if (leadFieldMatch && req.method === "DELETE") { if (!requireCapability("workspace.manage", user)) return userWriteError(res, 403, "You do not have permission to manage lead fields."); return leadFieldsDelete(res, db, user, decodeURIComponent(leadFieldMatch[1]), req.socket.remoteAddress); }
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
  if (activityMatch && req.method === "GET") { if (!requireCapability("leads.view", user)) return json(res, 403, { error: "You do not have permission to access this resource." }); return activityList(res, db, user, decodeURIComponent(activityMatch[1]), activityMatch[2], url); }
  const noteMatch = url.pathname.match(/^\/api\/leads\/([^/]+)\/notes$/);
  if (noteMatch && req.method === "POST") { if (!requireCapability("leads.edit", user)) return json(res, 403, { error: "You do not have permission to edit leads." }); return addLeadNote(req, res, db, user, decodeURIComponent(noteMatch[1])); }
  const callMatch = url.pathname.match(/^\/api\/leads\/([^/]+)\/calls$/);
  if (callMatch && req.method === "POST") { if (!requireCapability("leads.call", user)) return json(res, 403, { error: "You do not have permission to log calls." }); return addLeadCall(req, res, db, user, decodeURIComponent(callMatch[1])); }
  const followupCreateMatch = url.pathname.match(/^\/api\/leads\/([^/]+)\/followups$/);
  if (followupCreateMatch && req.method === "POST") { if (!requireCapability("leads.edit", user)) return json(res, 403, { error: "You do not have permission to edit leads." }); return addLeadFollowup(req, res, db, user, decodeURIComponent(followupCreateMatch[1])); }
  const followupActionMatch = url.pathname.match(/^\/api\/leads\/([^/]+)\/followups\/([^/]+)\/(reschedule|complete)$/);
  if (followupActionMatch && req.method === "POST") { if (!requireCapability("leads.edit", user)) return json(res, 403, { error: "You do not have permission to edit leads." }); const leadId = decodeURIComponent(followupActionMatch[1]); const followupId = decodeURIComponent(followupActionMatch[2]); return followupActionMatch[3] === "reschedule" ? rescheduleLeadFollowup(req, res, db, user, leadId, followupId) : completeLeadFollowup(req, res, db, user, leadId, followupId); }
  if (url.pathname === "/api/product-master" && req.method === "GET") {
    if (!requireCapability("leads.view", user)) return json(res, 403, { error: "You do not have permission to access this resource." });
    return productMasterList(res, db, url, user);
  }
  if (url.pathname === "/api/leads" && req.method === "GET") {
    if (!requireCapability("leads.view", user)) return json(res, 403, { error: "You do not have permission to access this resource." });
    return leadsList(req, res, db, url, user);
  }
  if (url.pathname === "/api/leads/counts" && req.method === "GET") {
    if (!requireCapability("leads.view", user)) return json(res, 403, { error: "You do not have permission to access this resource." });
    try { return await leadsCounts(res, db, user); } catch { return json(res, 500, { error: "Unable to load lead counts." }); }
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
  if (url.pathname === "/api/leads/bulk-product-resolution" && req.method === "POST") { if (!requireCapability("leads.edit", user)) return json(res, 403, { error: "You do not have permission to edit leads." }); return moveLeadsToProductResolution(req, res, db, user); }
  if (url.pathname === "/api/leads/bulk-archive" && req.method === "POST") { if (!requireCapability("leads.delete", user)) return json(res, 403, { error: "You do not have permission to archive leads." }); return archiveLeads(req, res, db, user); }
  if (url.pathname === "/api/leads/bulk-delete" && req.method === "POST") { if (!requireCapability("leads.delete", user)) return json(res, 403, { error: "You do not have permission to permanently delete leads." }); return permanentlyDeleteLeads(req, res, db, user); }
  const roundRobinMatch = url.pathname.match(/^\/api\/leads\/([^/]+)\/round-robin$/);
  if (roundRobinMatch && req.method === "POST") { if (!requireCapability("leads.assign", user)) return json(res, 403, { error: "You do not have permission to assign leads." }); return reassignLeadRoundRobin(req, res, db, user, decodeURIComponent(roundRobinMatch[1])); }
  const leadProductStageMatch = url.pathname.match(/^\/api\/leads\/([^/]+)\/product-stage$/);
  if (leadProductStageMatch && req.method === "POST") { if (!requireCapability("leads.edit", user)) return json(res, 403, { error: "You do not have permission to edit leads." }); return changeLeadProductStage(req, res, db, user, decodeURIComponent(leadProductStageMatch[1])); }
  const leadWriteMatch = url.pathname.match(/^\/api\/leads\/([^/]+)\/(stage|permission|products)$/);
  if (leadWriteMatch && req.method === "POST") {
    const id = decodeURIComponent(leadWriteMatch[1]);
    if (leadWriteMatch[2] === "permission") {
      if (!requireCapability("leads.permission", user)) return json(res, 403, { error: "You do not have permission to change permission." });
      return changeLeadPermission(req, res, db, user, id);
    }
    if (!requireCapability("leads.edit", user)) return json(res, 403, { error: "You do not have permission to edit leads." });
    return leadWriteMatch[2] === "stage" ? changeLeadStage(req, res, db, user, id) : updateLeadProducts(req, res, db, user, id);
  }
  const leadUpdateMatch = url.pathname.match(/^\/api\/leads\/([^/]+)$/);
  if (leadUpdateMatch && ["PATCH", "PUT"].includes(req.method)) { if (!requireCapability("leads.edit", user)) return json(res, 403, { error: "You do not have permission to edit leads." }); const id = decodeURIComponent(leadUpdateMatch[1]); const body = await readJson(req); if (body.field !== undefined) return updateInlineLeadField(req, res, db, user, id, body); try { return await updateLead(req, res, db, user, id, body); } catch (error) { return json(res, error.status || 400, { error: error.message || "Invalid lead field." }); } }
  const leadMatch = url.pathname.match(/^\/api\/leads\/([^/]+)$/);
  if (leadMatch && req.method === "GET") {
    if (!requireCapability("leads.view", user)) return json(res, 403, { error: "You do not have permission to access this resource." });
    return leadDetail(req, res, db, decodeURIComponent(leadMatch[1]), user);
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

let databasePromise;
function applicationDb() {
  if (databasePromise) return databasePromise;
  const guarded = guardedDatabaseUrl(PG_URL);
  if (!guarded.ok) {
    reportFailure("server", { code: guarded.code }, guarded.reason, guarded.target);
    return null;
  }
  databasePromise = openDb(guarded.value).then(async (db) => {
    await db.pruneSessions();
    await db.throttlePrune();
    return db;
  }).catch((error) => {
    databasePromise = undefined;
    throw error;
  });
  return databasePromise;
}

async function handler(req, res) {
  try {
    const db = await applicationDb();
    if (!db) return json(res, 503, { error: "Server configuration is unavailable." });
    return await route(req, res, db);
  } catch (error) {
    console.error(`request failed method=${req.method} path=${new URL(req.url || "/", "http://localhost").pathname} code=${error?.code || error?.name || "unknown"}`);
    return json(res, 500, { error: "Request failed." });
  }
}

if (require.main === module) start().catch((error) => { reportFailure("server", error, error?.code === "EADDRINUSE" ? "Stop the process already using the API port." : "Check PostgreSQL availability and credentials."); process.exitCode = 1; });
module.exports = { handler, login, route, publicUser, leadsList, leadsCounts, leadDetail, activityList, addLeadNote, addLeadCall, addLeadFollowup, rescheduleLeadFollowup, completeLeadFollowup, leadView, LEAD_SORTS, LEAD_VIEWS, quickFiltersList, quickFilterCreate, quickFilterUpdate, quickFilterDelete, userPreferenceGet, userPreferenceWrite, userPreferenceDelete, validateUserPreferenceValue, tablePreferenceGet, tablePreferenceWrite, tablePreferenceDelete, validateTableColumnWidths, productCatalogList, QUICK_FILTER_FIELDS, QUICK_FILTER_OPERATORS, reassignLeadRoundRobin, assignLeadRoundRobin, resolutionAllowedForProducts };
