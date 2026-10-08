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

const PORT = Number(process.env.CRM_PORT || 4321);
const HOST = process.env.CRM_HOST || "127.0.0.1";
const STATIC = path.resolve(process.env.CRM_STATIC || path.join(__dirname, "..", "dist"));
const PG_URL = process.env.CRM_PG_URL || "";
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
  const sortParam = url.searchParams.get("sort");
  if (sortParam && !Object.prototype.hasOwnProperty.call(LEAD_SORTS, sortParam)) return invalidLeadsQuery(res);
  const sort = sortParam || "updated_at";
  const directionParam = String(url.searchParams.get("direction") || "desc").toLowerCase();
  if (![
    "asc", "desc",
  ].includes(directionParam)) return invalidLeadsQuery(res);
  const direction = directionParam === "asc" ? "ASC" : "DESC";
  const pageSize = integerParam(url.searchParams.get("page_size"), 50, 100); const page = integerParam(url.searchParams.get("page"), 1, 1000000); const offset = (page - 1) * pageSize;
  const filterSql = where.length ? "WHERE " + where.join(" AND ") : "";
  const count = await db.query(`SELECT count(*)::int AS total FROM leads l ${filterSql}`, params);
  const listParams = params.slice(); listParams.push(pageSize, offset);
  const rows = await db.query(`SELECT l.id,l.source_id,l.name,l.email,l.company,l.phone,l.stage,l.permission,l.lead_status,l.owner_user_id,l.pso_date,l.next_follow_up_at,l.last_call_at,l.updated_at,l.is_pre_ps_done,l.lead_no,l.lead_type,l.lead_source,l.source_system,l.designation,l.city,l.custom_values,l.legacy_finance FROM leads l ${filterSql} ORDER BY l.${sort} ${direction} NULLS LAST, l.id ASC LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`, listParams);
  return json(res, 200, { items: rows.rows, page, page_size: pageSize, total: count.rows[0].total, sort, direction: direction.toLowerCase(), view: view || null });
}

async function leadDetail(req, res, db, id) {
  const lead = (await db.query("SELECT * FROM leads WHERE id = $1", [id])).rows[0];
  if (!lead) return json(res, 404, { error: "Lead not found." });
  const [calls, followups, history, messages] = await Promise.all([
    db.query("SELECT * FROM lead_calls WHERE lead_id = $1 ORDER BY happened_at DESC NULLS LAST, id DESC", [id]),
    db.query("SELECT * FROM lead_followups WHERE lead_id = $1 ORDER BY due_at ASC NULLS LAST, id ASC", [id]),
    db.query("SELECT * FROM lead_history WHERE lead_id = $1 ORDER BY occurred_at DESC NULLS LAST, id DESC", [id]),
    db.query("SELECT * FROM lead_messages WHERE lead_id = $1 ORDER BY sent_at DESC NULLS LAST, id DESC", [id]),
  ]);
  return json(res, 200, { lead, calls: calls.rows, followups: followups.rows, history: history.rows, messages: messages.rows });
}

async function transaction(db, work) {
  if (typeof db.transaction === "function") return db.transaction(work);
  await db.query("BEGIN");
  try { const result = await work(db); await db.query("COMMIT"); return result; } catch (error) { await db.query("ROLLBACK").catch(() => {}); throw error; }
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
  if (masterType === "resolution" && actor.role !== "Admin" && actor.role !== "Super Admin") return userWriteError(res, 403, "Only Admin may add resolutions.");
  const values = [String(body.source_id || id || `master-${crypto.randomUUID()}`), masterType, String(body.code || "").trim() || null, label, String(body.colour || "").trim() || null, Number.isInteger(body.sort_order) ? body.sort_order : 0, body.active !== false, body.value && typeof body.value === "object" ? body.value : {}, ...MASTER_FLAG_FIELDS.map((field) => body[field] === true)];
  const targetId = id || `master-${crypto.randomUUID()}`;
  await transaction(db, async (tx) => { await tx.query(`INSERT INTO master_values (id,source_id,master_type,code,label,colour,sort_order,active,value,${MASTER_FLAG_FIELDS.join(",")},updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,${MASTER_FLAG_FIELDS.map((_, i) => `$${10 + i}`).join(",")},now()) ON CONFLICT (id) DO UPDATE SET master_type=EXCLUDED.master_type,code=EXCLUDED.code,label=EXCLUDED.label,colour=EXCLUDED.colour,sort_order=EXCLUDED.sort_order,active=EXCLUDED.active,value=EXCLUDED.value,${MASTER_FLAG_FIELDS.map((field) => `${field}=EXCLUDED.${field}`).join(",")},updated_at=now()`, [targetId, ...values]); await writeAudit(tx, { actorUserId: actor.id, action: id ? "master.updated" : "master.created", entityType: "master_value", entityId: targetId, newValue: masterType, ip: req.socket.remoteAddress }); });
  return json(res, id ? 200 : 201, { id: targetId });
}
async function targetsList(res, db) { const rows = await db.query("SELECT id,source_id,user_id,target_date,weekday,week_start,quarter_start,non_keynote_target,keynote_target,total_target,week_override,quarter_override,absent FROM user_targets ORDER BY target_date NULLS LAST,user_id", []); return json(res, 200, { targets: rows.rows }); }
async function targetWrite(req, res, db, actor, id = null) { const body = await readJson(req); const userId = String(body.user_id || "").trim(); if (!userId) return userWriteError(res, 400, "Invalid target."); const targetId = id || `target-${crypto.randomUUID()}`; const values = [targetId, String(body.source_id || targetId), userId, body.target_date || null, body.weekday ?? null, body.week_start || null, body.quarter_start || null, Number(body.non_keynote_target || 0), Number(body.keynote_target || 0), Number(body.total_target || 0), body.week_override ?? null, body.quarter_override ?? null, body.absent === true]; await transaction(db, async (tx) => { await tx.query("INSERT INTO user_targets (id,source_id,user_id,target_date,weekday,week_start,quarter_start,non_keynote_target,keynote_target,total_target,week_override,quarter_override,absent,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now()) ON CONFLICT (id) DO UPDATE SET user_id=EXCLUDED.user_id,target_date=EXCLUDED.target_date,weekday=EXCLUDED.weekday,week_start=EXCLUDED.week_start,quarter_start=EXCLUDED.quarter_start,non_keynote_target=EXCLUDED.non_keynote_target,keynote_target=EXCLUDED.keynote_target,total_target=EXCLUDED.total_target,week_override=EXCLUDED.week_override,quarter_override=EXCLUDED.quarter_override,absent=EXCLUDED.absent,updated_at=now()", values); await writeAudit(tx, { actorUserId: actor.id, action: id ? "target.updated" : "target.created", entityType: "user_target", entityId: targetId, ip: req.socket.remoteAddress }); }); return json(res, id ? 200 : 201, { id: targetId }); }
async function settingsList(res, db) { const rows = await db.query("SELECT setting_key,value,active,updated_at FROM workspace_settings ORDER BY setting_key", []); return json(res, 200, { settings: rows.rows }); }
async function settingWrite(req, res, db, actor) { const body = await readJson(req); const key = String(body.setting_key || "").trim(); if (!key || body.value === undefined) return userWriteError(res, 400, "Invalid workspace setting."); await transaction(db, async (tx) => { await tx.query("INSERT INTO workspace_settings(setting_key,value,active,updated_by,updated_at) VALUES ($1,$2,true,$3,now()) ON CONFLICT (setting_key) DO UPDATE SET value=EXCLUDED.value,updated_by=EXCLUDED.updated_by,updated_at=now()", [key, body.value, actor.id]); await writeAudit(tx, { actorUserId: actor.id, action: "workspace_setting.updated", entityType: "workspace_setting", entityId: key, ip: req.socket.remoteAddress }); }); return json(res, 200, { setting_key: key }); }
async function employeesList(res, db) { const rows = await db.query("SELECT u.id,u.name,u.email,u.role,u.active,u.offboarded,e.serial,e.cell,e.products,e.backup_user_id,e.lead_transfer_allowed,e.colour FROM users u LEFT JOIN employee_profiles e ON e.user_id=u.id ORDER BY u.name,u.id", []); return json(res, 200, { employees: rows.rows }); }
async function employeeWrite(req, res, db, actor, id = null) { const body = await readJson(req); const userId = String(body.user_id || id || "").trim(); if (!userId) return userWriteError(res, 400, "Invalid employee."); await transaction(db, async (tx) => { await tx.query("INSERT INTO employee_profiles(user_id,serial,cell,products,backup_user_id,lead_transfer_allowed,colour,active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(user_id) DO UPDATE SET serial=EXCLUDED.serial,cell=EXCLUDED.cell,products=EXCLUDED.products,backup_user_id=EXCLUDED.backup_user_id,lead_transfer_allowed=EXCLUDED.lead_transfer_allowed,colour=EXCLUDED.colour,active=EXCLUDED.active", [userId, body.serial || null, body.cell || null, body.products || [], body.backup_user_id || null, body.lead_transfer_allowed === true, body.colour || null, body.active !== false]); await writeAudit(tx, { actorUserId: actor.id, action: "employee.updated", entityType: "user", entityId: userId, ip: req.socket.remoteAddress }); }); return json(res, 200, { user_id: userId }); }
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
  if (url.pathname === "/api/leads" && req.method === "GET") {
    if (!requireCapability("leads.view", user)) return json(res, 403, { error: "You do not have permission to access this resource." });
    return leadsList(req, res, db, url);
  }
  if (url.pathname === "/api/leads/counts" && req.method === "GET") {
    if (!requireCapability("leads.view", user)) return json(res, 403, { error: "You do not have permission to access this resource." });
    try { return await leadsCounts(res, db); } catch { return json(res, 500, { error: "Unable to load lead counts." }); }
  }
  const leadMatch = url.pathname.match(/^\/api\/leads\/([^/]+)$/);
  if (leadMatch && req.method === "GET") {
    if (!requireCapability("leads.view", user)) return json(res, 403, { error: "You do not have permission to access this resource." });
    return leadDetail(req, res, db, decodeURIComponent(leadMatch[1]));
  }
  if (url.pathname === "/api/logout" && req.method === "POST") { await db.dropSession(token); try { await writeAudit(db, { actorUserId: user.id, action: "auth.logout", entityType: "auth", entityId: user.id, newValue: "session_deleted", ip: req.socket.remoteAddress }); } catch {} return json(res, 200, { ok: true }, { "Set-Cookie": S.sessionCookie(req, "", 0, PROXY_CONFIG) }); }
  return json(res, 404, { error: "Not found." });
}

async function start() {
  if (!PG_URL) throw new Error("CRM_PG_URL is required; the server will not read postgres.url or any old data folder.");
  const db = await openDb(PG_URL);
  await db.pruneSessions();
  await db.throttlePrune();
  setInterval(() => { db.pruneSessions().catch(() => {}); db.throttlePrune().catch(() => {}); }, 5 * 60000).unref();
  const server = http.createServer((req, res) => route(req, res, db).catch(() => json(res, 500, { error: "Request failed." })));
  server.listen(PORT, HOST, () => console.log(`Altus CRM server listening on http://${HOST}:${PORT}`));
}

if (require.main === module) start().catch(() => { console.error("Server failed to start."); process.exitCode = 1; });
module.exports = { login, route, publicUser, leadsList, leadsCounts, leadDetail, leadView, LEAD_SORTS, LEAD_VIEWS };
