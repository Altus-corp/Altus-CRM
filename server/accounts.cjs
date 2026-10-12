"use strict";

const crypto = require("crypto");
const { writeAudit } = require("./audit.cjs");

function json(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers });
  res.end(JSON.stringify(body));
}

function readJson(req, limit = 16384) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) reject(Object.assign(new Error("Request too large."), { status: 413 }));
      else chunks.push(chunk);
    });
    req.on("end", () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}); }
      catch { reject(Object.assign(new Error("Invalid JSON."), { status: 400 })); }
    });
    req.on("error", reject);
  });
}

async function transaction(db, work) {
  if (typeof db.transaction === "function") return db.transaction(work);
  await db.query("BEGIN");
  try { const result = await work(db); await db.query("COMMIT"); return result; }
  catch (error) { await db.query("ROLLBACK").catch(() => {}); throw error; }
}

function normalizeName(value) {
  return String(value || "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

function text(value) {
  const result = String(value ?? "").trim();
  return result || null;
}

function accountFields(body) {
  const name = text(body.name);
  if (!name) return null;
  return {
    name,
    normalized_name: normalizeName(name),
    email: text(body.email),
    phone: text(body.phone),
    website: text(body.website),
    address: body.address && typeof body.address === "object" && !Array.isArray(body.address) ? body.address : {},
    owner_user_id: text(body.owner_user_id),
  };
}

function contactFields(body) {
  const name = text(body.name);
  if (!name) return null;
  return {
    name,
    first_name: text(body.first_name),
    last_name: text(body.last_name),
    email: text(body.email),
    phone: text(body.phone),
    alternate_phone: text(body.alternate_phone),
    designation: text(body.designation),
    account_id: text(body.account_id),
  };
}

async function accountDuplicate(db, fields, excludeId = null) {
  const result = await db.query(
    "SELECT id FROM accounts WHERE ($1 <> '' AND normalized_name = $1 OR ($2 IS NOT NULL AND lower(email) = lower($2)) OR ($3 IS NOT NULL AND phone = $3)) AND ($4 IS NULL OR id <> $4) AND status <> 'archived' ORDER BY id ASC LIMIT 5",
    [fields.normalized_name, fields.email, fields.phone, excludeId],
  );
  return result.rows;
}

async function contactDuplicate(db, fields, excludeId = null) {
  const result = await db.query(
    "SELECT id FROM contacts WHERE (($1 IS NOT NULL AND lower(email) = lower($1)) OR ($2 IS NOT NULL AND phone = $2)) AND ($3 IS NULL OR id <> $3) AND status <> 'archived' ORDER BY id ASC LIMIT 5",
    [fields.email, fields.phone, excludeId],
  );
  return result.rows;
}

function pageParams(url) {
  const pageSize = Math.min(Math.max(Number.parseInt(url.searchParams.get("page_size") || "50", 10) || 50, 1), 100);
  const page = Math.max(Number.parseInt(url.searchParams.get("page") || "1", 10) || 1, 1);
  return { page, pageSize, offset: (page - 1) * pageSize };
}

async function accountsList(req, res, db, url) {
  const params = [];
  const where = [];
  const bind = (value) => { params.push(value); return `$${params.length}`; };
  const search = text(url.searchParams.get("search") || url.searchParams.get("q"));
  if (search) { const p = bind(`%${search}%`); where.push(`(a.name ILIKE ${p} OR a.email ILIKE ${p} OR a.phone ILIKE ${p})`); }
  const status = text(url.searchParams.get("status"));
  if (status && !["active", "archived"].includes(status)) return json(res, 400, { error: "Invalid account status." });
  if (status) where.push(`a.status = ${bind(status)}`); else where.push("a.status = 'active'");
  const owner = text(url.searchParams.get("owner"));
  if (owner) where.push(`a.owner_user_id = ${bind(owner)}`);
  const filterSql = `WHERE ${where.join(" AND ")}`;
  const { page, pageSize, offset } = pageParams(url);
  const count = await db.query(`SELECT count(*)::int AS total FROM accounts a ${filterSql}`, params);
  const listParams = params.slice(); listParams.push(pageSize, offset);
  const rows = await db.query(`SELECT a.id,a.source_id,a.name,a.email,a.phone,a.website,a.address,a.owner_user_id,a.status,a.created_at,a.updated_at, count(DISTINCT c.id)::int AS contact_count, count(DISTINCT cl.lead_id)::int AS lead_count FROM accounts a LEFT JOIN contacts c ON c.account_id=a.id AND c.status <> 'archived' LEFT JOIN contact_leads cl ON cl.contact_id=c.id ${filterSql} GROUP BY a.id ORDER BY a.name ASC,a.id ASC LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`, listParams);
  return json(res, 200, { items: rows.rows, page, page_size: pageSize, total: count.rows[0]?.total || 0 });
}

async function accountDetail(res, db, id) {
  const account = (await db.query("SELECT * FROM accounts WHERE id = $1", [id])).rows[0];
  if (!account) return json(res, 404, { error: "Account not found." });
  const [contacts, leads] = await Promise.all([
    db.query("SELECT * FROM contacts WHERE account_id = $1 AND status <> 'archived' ORDER BY name ASC,id ASC", [id]),
    db.query("SELECT DISTINCT l.id,l.source_id,l.name,l.email,l.phone,l.company,l.stage,l.permission,l.lead_status,l.owner_user_id,l.updated_at FROM leads l JOIN contact_leads cl ON cl.lead_id=l.id JOIN contacts c ON c.id=cl.contact_id WHERE c.account_id=$1 ORDER BY l.updated_at DESC NULLS LAST,l.id ASC", [id]),
  ]);
  return json(res, 200, { account, contacts: contacts.rows, leads: leads.rows });
}

async function contactsList(res, db, url) {
  const params = [];
  const where = ["c.status = 'active'"];
  const bind = (value) => { params.push(value); return `$${params.length}`; };
  const search = text(url.searchParams.get("search") || url.searchParams.get("q"));
  if (search) { const p = bind(`%${search}%`); where.push(`(c.name ILIKE ${p} OR c.email ILIKE ${p} OR c.phone ILIKE ${p} OR c.designation ILIKE ${p})`); }
  const accountId = text(url.searchParams.get("account_id"));
  if (accountId) where.push(`c.account_id = ${bind(accountId)}`);
  const { page, pageSize, offset } = pageParams(url);
  const filterSql = `WHERE ${where.join(" AND ")}`;
  const count = await db.query(`SELECT count(*)::int AS total FROM contacts c ${filterSql}`, params);
  const listParams = params.slice(); listParams.push(pageSize, offset);
  const rows = await db.query(`SELECT c.id,c.source_id,c.account_id,c.name,c.first_name,c.last_name,c.email,c.phone,c.alternate_phone,c.designation,c.status,c.created_at,c.updated_at,a.name AS account_name,count(DISTINCT cl.lead_id)::int AS lead_count FROM contacts c LEFT JOIN accounts a ON a.id=c.account_id LEFT JOIN contact_leads cl ON cl.contact_id=c.id ${filterSql} GROUP BY c.id,a.name ORDER BY c.name ASC,c.id ASC LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`, listParams);
  return json(res, 200, { items: rows.rows, page, page_size: pageSize, total: count.rows[0]?.total || 0 });
}

async function contactDetail(res, db, id) {
  const contact = (await db.query("SELECT c.*,a.name AS account_name FROM contacts c LEFT JOIN accounts a ON a.id=c.account_id WHERE c.id=$1", [id])).rows[0];
  if (!contact) return json(res, 404, { error: "Contact not found." });
  const leads = await db.query("SELECT l.id,l.source_id,l.name,l.email,l.phone,l.company,l.stage,l.permission,l.lead_status,l.owner_user_id,l.updated_at FROM leads l JOIN contact_leads cl ON cl.lead_id=l.id WHERE cl.contact_id=$1 ORDER BY l.updated_at DESC NULLS LAST,l.id ASC", [id]);
  return json(res, 200, { contact, leads: leads.rows });
}

async function createAccount(req, res, db, actor) {
  const body = await readJson(req); const fields = accountFields(body); if (!fields) return json(res, 400, { error: "Invalid account data." });
  if ((await accountDuplicate(db, fields)).length) return json(res, 409, { error: "Possible duplicate account." });
  const id = `account-${crypto.randomUUID()}`;
  try { await transaction(db, async (tx) => { await tx.query("INSERT INTO accounts (id,source_id,name,normalized_name,email,phone,website,address,owner_user_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)", [id, id, fields.name, fields.normalized_name, fields.email, fields.phone, fields.website, JSON.stringify(fields.address), fields.owner_user_id]); await writeAudit(tx, { actorUserId: actor.id, action: "account.created", entityType: "account", entityId: id, ip: req.socket.remoteAddress }); }); return json(res, 201, { id }); }
  catch { return json(res, 500, { error: "Unable to create account." }); }
}

async function updateAccount(req, res, db, actor, id) {
  const current = (await db.query("SELECT * FROM accounts WHERE id=$1", [id])).rows[0]; if (!current) return json(res, 404, { error: "Account not found." });
  const fields = accountFields({ ...current, ...(await readJson(req)) }); if (!fields) return json(res, 400, { error: "Invalid account data." });
  if ((await accountDuplicate(db, fields, id)).length) return json(res, 409, { error: "Possible duplicate account." });
  try { await transaction(db, async (tx) => { await tx.query("UPDATE accounts SET name=$2,normalized_name=$3,email=$4,phone=$5,website=$6,address=$7,owner_user_id=$8,updated_at=now() WHERE id=$1", [id, fields.name, fields.normalized_name, fields.email, fields.phone, fields.website, JSON.stringify(fields.address), fields.owner_user_id]); await writeAudit(tx, { actorUserId: actor.id, action: "account.updated", entityType: "account", entityId: id, ip: req.socket.remoteAddress }); }); return json(res, 200, { id }); }
  catch { return json(res, 500, { error: "Unable to update account." }); }
}

async function archiveAccount(req, res, db, actor, id) {
  const current = (await db.query("SELECT id,status FROM accounts WHERE id=$1", [id])).rows[0]; if (!current) return json(res, 404, { error: "Account not found." });
  try { await transaction(db, async (tx) => { await tx.query("UPDATE accounts SET status='archived',updated_at=now() WHERE id=$1", [id]); await writeAudit(tx, { actorUserId: actor.id, action: "account.archived", entityType: "account", entityId: id, oldValue: current.status, newValue: "archived", ip: req.socket.remoteAddress }); }); return json(res, 200, { id, status: "archived" }); }
  catch { return json(res, 500, { error: "Unable to archive account." }); }
}

async function createContact(req, res, db, actor) {
  const body = await readJson(req); const fields = contactFields(body); if (!fields) return json(res, 400, { error: "Invalid contact data." });
  if ((await contactDuplicate(db, fields)).length) return json(res, 409, { error: "Possible duplicate contact." });
  const id = `contact-${crypto.randomUUID()}`;
  try { await transaction(db, async (tx) => { await tx.query("INSERT INTO contacts (id,source_id,account_id,name,first_name,last_name,email,phone,alternate_phone,designation) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", [id, id, fields.account_id, fields.name, fields.first_name, fields.last_name, fields.email, fields.phone, fields.alternate_phone, fields.designation]); await writeAudit(tx, { actorUserId: actor.id, action: "contact.created", entityType: "contact", entityId: id, ip: req.socket.remoteAddress }); }); return json(res, 201, { id }); }
  catch { return json(res, 500, { error: "Unable to create contact." }); }
}

async function updateContact(req, res, db, actor, id) {
  const current = (await db.query("SELECT * FROM contacts WHERE id=$1", [id])).rows[0]; if (!current) return json(res, 404, { error: "Contact not found." });
  const fields = contactFields({ ...current, ...(await readJson(req)) }); if (!fields) return json(res, 400, { error: "Invalid contact data." });
  if ((await contactDuplicate(db, fields, id)).length) return json(res, 409, { error: "Possible duplicate contact." });
  try { await transaction(db, async (tx) => { await tx.query("UPDATE contacts SET account_id=$2,name=$3,first_name=$4,last_name=$5,email=$6,phone=$7,alternate_phone=$8,designation=$9,updated_at=now() WHERE id=$1", [id, fields.account_id, fields.name, fields.first_name, fields.last_name, fields.email, fields.phone, fields.alternate_phone, fields.designation]); await writeAudit(tx, { actorUserId: actor.id, action: "contact.updated", entityType: "contact", entityId: id, ip: req.socket.remoteAddress }); }); return json(res, 200, { id }); }
  catch { return json(res, 500, { error: "Unable to update contact." }); }
}

async function archiveContact(req, res, db, actor, id) {
  const current = (await db.query("SELECT id,status FROM contacts WHERE id=$1", [id])).rows[0]; if (!current) return json(res, 404, { error: "Contact not found." });
  try { await transaction(db, async (tx) => { await tx.query("UPDATE contacts SET status='archived',updated_at=now() WHERE id=$1", [id]); await writeAudit(tx, { actorUserId: actor.id, action: "contact.archived", entityType: "contact", entityId: id, oldValue: current.status, newValue: "archived", ip: req.socket.remoteAddress }); }); return json(res, 200, { id, status: "archived" }); }
  catch { return json(res, 500, { error: "Unable to archive contact." }); }
}

async function convertLead(req, res, db, actor, leadId) {
  const lead = (await db.query("SELECT id,source_id,name,first_name,last_name,email,phone,alternate_phone,company,designation,owner_user_id FROM leads WHERE id=$1", [leadId])).rows[0];
  if (!lead) return json(res, 404, { error: "Lead not found." });
  const body = await readJson(req); const accountId = text(body.account_id); const accountFieldsValue = accountFields({ name: body.account_name || lead.company, email: body.account_email, phone: body.account_phone, website: body.website, address: body.address, owner_user_id: lead.owner_user_id });
  if (!accountId && !accountFieldsValue) return json(res, 400, { error: "An account or company name is required." });
  const contactFieldsValue = contactFields({ name: body.contact_name || lead.name, first_name: lead.first_name, last_name: lead.last_name, email: lead.email, phone: lead.phone, alternate_phone: lead.alternate_phone, designation: lead.designation, account_id: accountId });
  try {
    const result = await transaction(db, async (tx) => {
      let targetAccountId = accountId;
      if (targetAccountId) { const existing = (await tx.query("SELECT id FROM accounts WHERE id=$1 AND status <> 'archived'", [targetAccountId])).rows[0]; if (!existing) throw Object.assign(new Error("missing account"), { status: 404 }); }
      else { targetAccountId = `account-${crypto.randomUUID()}`; await tx.query("INSERT INTO accounts (id,source_id,name,normalized_name,email,phone,website,address,owner_user_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)", [targetAccountId, `lead-account-${lead.source_id || lead.id}`, accountFieldsValue.name, accountFieldsValue.normalized_name, accountFieldsValue.email, accountFieldsValue.phone, accountFieldsValue.website, JSON.stringify(accountFieldsValue.address), accountFieldsValue.owner_user_id]); }
      const contactId = `contact-${crypto.randomUUID()}`;
      await tx.query("INSERT INTO contacts (id,source_id,account_id,name,first_name,last_name,email,phone,alternate_phone,designation) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", [contactId, `lead-contact-${lead.source_id || lead.id}`, targetAccountId, contactFieldsValue.name, contactFieldsValue.first_name, contactFieldsValue.last_name, contactFieldsValue.email, contactFieldsValue.phone, contactFieldsValue.alternate_phone, contactFieldsValue.designation]);
      await tx.query("INSERT INTO contact_leads (contact_id,lead_id,relationship,source_id) VALUES ($1,$2,'converted',$3) ON CONFLICT (contact_id,lead_id) DO NOTHING", [contactId, lead.id, `lead-contact-link-${lead.source_id || lead.id}`]);
      await writeAudit(tx, { actorUserId: actor.id, action: "lead.converted_to_account", entityType: "lead", entityId: lead.id, newValue: targetAccountId, ip: req.socket.remoteAddress });
      return { account_id: targetAccountId, contact_id: contactId };
    });
    return json(res, 201, result);
  } catch (error) { return json(res, error.status === 404 ? 404 : 500, { error: error.status === 404 ? "Account not found." : "Unable to convert lead." }); }
}

function csvValue(value) { return `"${String(value ?? "").replace(/"/g, '""')}"`; }
function csvResponse(res, headers, rows) { res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename=${headers[0].toLowerCase()}-export.csv`, "Cache-Control": "no-store" }); res.end([headers.join(","), ...rows.map((row) => headers.map((header) => csvValue(row[header])).join(","))].join("\n")); }

async function accountsExport(res, db, url) {
  const search = text(url.searchParams.get("search") || url.searchParams.get("q"));
  const params = []; const where = ["a.status = 'active'"];
  if (search) { params.push(`%${search}%`); where.push(`(a.name ILIKE $1 OR a.email ILIKE $1 OR a.phone ILIKE $1)`); }
  const rows = await db.query(`SELECT a.id,a.name,a.email,a.phone,a.website,a.owner_user_id,a.status FROM accounts a WHERE ${where.join(" AND ")} ORDER BY a.name ASC,a.id ASC`, params);
  return csvResponse(res, ["id", "name", "email", "phone", "website", "owner_user_id", "status"], rows.rows);
}

async function contactsExport(res, db, url) {
  const search = text(url.searchParams.get("search") || url.searchParams.get("q"));
  const params = []; const where = ["c.status = 'active'"];
  if (search) { params.push(`%${search}%`); where.push(`(c.name ILIKE $1 OR c.email ILIKE $1 OR c.phone ILIKE $1)`); }
  const rows = await db.query(`SELECT c.id,c.name,c.email,c.phone,c.designation,a.name AS account_name,c.status FROM contacts c LEFT JOIN accounts a ON a.id=c.account_id WHERE ${where.join(" AND ")} ORDER BY c.name ASC,c.id ASC`, params);
  return csvResponse(res, ["id", "name", "email", "phone", "designation", "account_name", "status"], rows.rows);
}

module.exports = { accountsList, accountDetail, contactsList, contactDetail, createAccount, updateAccount, archiveAccount, createContact, updateContact, archiveContact, convertLead, accountsExport, contactsExport, normalizeName };
