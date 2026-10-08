"use strict";

const crypto = require("crypto");
const { Client } = require("pg");

const SOURCE_TENANT = "altus";
const SNAPSHOT_SQL = "SELECT seq, state FROM t_altus.snapshots ORDER BY seq DESC LIMIT 1";
const CHILDREN = {
  lead_calls: "calls",
  lead_followups: "followups",
  lead_history: "history",
  lead_messages: "messages",
};

// Planning-only admin import sections. These definitions are intentionally not
// executed by this script until the source dump has been reviewed and approved.
const ADMIN_DATA_SECTIONS = Object.freeze([
  "templates", "assignment_rules", "targets", "masters", "settings", "audit_log", "integrations", "call_analytics_inputs",
]);

const ROLE_MAP = { "Sales Person": "Sales", User: "Sales", Admin: "Admin", "Super Admin": "Owner", Owner: "Owner" };
const CORE_KEYS = new Set([
  "id", "name", "firstName", "lastName", "email", "cellNo", "altCellNo", "company", "designation",
  "city", "state", "pincode", "area", "location", "leadNo", "externalId", "sourceSystem", "leadSource",
  "leadSourceSecondary", "leadTypeCode", "leadStatus", "stage", "pipeline", "priority", "owner", "team",
  "product", "service", "businessCategory", "businessSector", "natureOfBusiness", "industryCovered",
  "companySize", "turnover", "entity", "classification", "network", "campaign", "whoReferred",
  "expectedDealSize", "createdAt", "updatedAt", "lastActivityAt", "lastCallAt", "nextFollowUpAt",
  "permission", "psoDate", "isPrePsDone",
]);
const FINANCE_KEYS = new Set([
  "amountPaid", "balanceReceivable", "totalPayable", "invoiceDate", "invoiceLink", "invoiceNo",
  "lastPaymentDate", "lastPaymentMode", "paymentNotes", "registrationFeePaid", "gstApplicable", "tdsApplicable",
  "materialSentTotal", "survey1500",
]);
const DATE_KEYS = [
  "createdAt", "updatedAt", "lastActivityAt", "lastCallAt", "nextFollowUpAt", "psoDate", "leadAcquiredDate",
  "targetDate", "assignedAt", "permissionSetAt", "invoiceDate", "lastPaymentDate", "registrationTime",
  "firstCalledOn", "lastCalledOn", "lastEmailAt", "lastSmsAt", "lastWhatsAppAt", "introducerCallDate", "inviteDateSent",
];
const NUMBER_KEYS = ["expectedDealSize", "amountPaid", "balanceReceivable", "totalPayable", "materialSentTotal", "turnover"];

function args() {
  const out = { mode: "dry-run" };
  for (const arg of process.argv.slice(2)) {
    if (arg === "--dry-run") out.mode = "dry-run";
    else if (arg === "--apply") out.mode = "apply";
    else if (arg === "--verify") out.mode = "verify";
    else throw new Error("Unknown argument: " + arg);
  }
  return out;
}

function checksum(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function nonempty(value) {
  return value !== undefined && value !== null && !(typeof value === "string" && value.trim() === "");
}

function dateValue(value, field, failures) {
  if (!nonempty(value)) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) { failures[field] = (failures[field] || 0) + 1; return null; }
  return parsed.toISOString();
}

function numberValue(value, field, failures) {
  if (!nonempty(value)) return null;
  const normalized = String(value).replace(/[,₹$\s]/g, "");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) { failures[field] = (failures[field] || 0) + 1; return null; }
  return parsed;
}

function booleanValue(value, field, failures) {
  if (!nonempty(value)) return null;
  if (value === true || /^(yes|true|1)$/i.test(String(value).trim())) return true;
  if (value === false || /^(no|false|0)$/i.test(String(value).trim())) return false;
  failures[field] = (failures[field] || 0) + 1;
  return null;
}

function sourceId(kind, row, index) {
  return String(row?.id || `${SOURCE_TENANT}:${kind}:${index}`);
}

function userModel(user) {
  return {
    sourceId: String(user.id),
    id: String(user.id),
    name: String(user.name || [user.first, user.last].filter(Boolean).join(" ") || "Unnamed"),
    email: String(user.email || "").trim().toLowerCase(),
    role: ROLE_MAP[user.role] || "Viewer",
    active: user.active !== false,
    offboarded: user.offboarded === true,
  };
}

function makeLead(person, index, users, failures) {
  for (const field of DATE_KEYS) dateValue(person[field], field, failures);
  for (const field of NUMBER_KEYS) numberValue(person[field], field, failures);
  const ownerText = nonempty(person.owner) ? String(person.owner) : null;
  const owner = ownerText && (users.bySource.get(ownerText) || users.byEmail.get(ownerText.toLowerCase()));
  if (ownerText && !owner) users.unresolvedOwners.add(ownerText);
  const custom = {};
  const finance = {};
  for (const [key, value] of Object.entries(person)) {
    if (CORE_KEYS.has(key)) continue;
    if (FINANCE_KEYS.has(key)) finance[key] = value;
    else custom[key] = value;
  }
  return {
    id: "lead:" + String(person.id || `${SOURCE_TENANT}:${index}`),
    sourceId: String(person.id || `${SOURCE_TENANT}:${index}`),
    name: String(person.name || [person.firstName, person.lastName].filter(Boolean).join(" ") || "Unnamed"),
    firstName: person.firstName || null, lastName: person.lastName || null, email: person.email || null,
    phone: person.cellNo || null, alternatePhone: person.altCellNo || null, company: person.company || null,
    designation: person.designation || null, city: person.city || null, state: person.state || null,
    pincode: person.pincode || null, area: person.area || null, location: person.location || null,
    leadNo: person.leadNo || null, externalId: person.externalId || null, sourceSystem: person.sourceSystem || null,
    leadSource: person.leadSource || null, leadSourceSecondary: person.leadSourceSecondary || null,
    leadType: person.leadTypeCode || null, leadStatus: person.leadStatus || null, stage: person.stage || null,
    pipeline: person.pipeline || null, priority: person.priority || null, permission: person.permission || null,
    psoDate: dateValue(person.psoDate, "psoDate", failures), isPrePsDone: booleanValue(person.isPrePsDone, "isPrePsDone", failures),
    ownerUserId: owner?.id || null, team: person.team || null,
    nextFollowUpAt: dateValue(person.nextFollowUpAt, "nextFollowUpAt", failures), lastCallAt: dateValue(person.lastCallAt, "lastCallAt", failures),
    createdAt: dateValue(person.createdAt, "createdAt", failures), updatedAt: dateValue(person.updatedAt, "updatedAt", failures),
    customValues: custom, legacyFinance: finance,
    checksum: checksum(person),
  };
}

async function sourceData(source) {
  const snap = (await source.query(SNAPSHOT_SQL)).rows[0];
  if (!snap) throw new Error("crm_import has no snapshot");
  const state = JSON.parse(snap.state);
  const credentials = new Set((await source.query("SELECT user_id FROM t_altus.credentials")).rows.map((row) => String(row.user_id)));
  return { seq: Number(snap.seq), state, credentials };
}

async function targetUsers(target) {
  const rows = (await target.query("SELECT id, source_id, name, email, role, active, offboarded FROM users")).rows;
  return { rows, bySource: new Map(rows.filter((row) => row.source_id).map((row) => [String(row.source_id), row])), byEmail: new Map(rows.map((row) => [String(row.email).toLowerCase(), row])) };
}

function childLeadSource(row) {
  return row?.personId || row?.person_id || row?.leadId || row?.lead_id || row?.contactId || row?.contact_id || null;
}

function childLeadId(row) {
  const source = childLeadSource(row);
  return source ? "lead:" + String(source) : null;
}

async function applyData(target, data, importedUsers, leads, runId, report) {
  const allMessages = data.state.messages || [];
  const linkedMessages = allMessages.filter((row) => childLeadSource(row));
  const unlinkedMessages = allMessages.filter((row) => !childLeadSource(row));
  await target.query("BEGIN");
  try {
    await target.query(
      "INSERT INTO import_runs (id, source_tenant, mode, status, source_snapshot_seq, source_checksum, counts) VALUES ($1, $2, 'apply', 'running', $3, $4, $5)",
      [runId, SOURCE_TENANT, data.seq, checksum(data.state), JSON.stringify(report.source_counts)]
    );

    for (const user of importedUsers) {
      const bySource = (await target.query("SELECT id FROM users WHERE source_id = $1", [user.sourceId])).rows[0];
      const byId = (await target.query("SELECT id, source_id FROM users WHERE id = $1", [user.id])).rows[0];
      const byEmail = (await target.query("SELECT id, source_id FROM users WHERE lower(email) = lower($1)", [user.email])).rows[0];
      if (byId && !bySource && !byId.source_id) throw new Error("User ID conflicts with existing account: " + user.id);
      if (!bySource && !byId && byEmail && !byEmail.source_id) continue;
      if (bySource) {
        const current = (await target.query("SELECT name,email,role,active,offboarded FROM users WHERE source_id = $1", [user.sourceId])).rows[0];
        if (current && current.name === user.name && current.email === user.email && current.role === user.role && current.active === user.active && current.offboarded === user.offboarded) continue;
        await target.query("UPDATE users SET name=$2,email=$3,role=$4,active=$5,offboarded=$6 WHERE source_id=$1", [user.sourceId, user.name, user.email, user.role, user.active, user.offboarded]);
      } else {
        await target.query("INSERT INTO users (id,source_id,name,email,role,active,offboarded) VALUES ($1,$2,$3,$4,$5,$6,$7)", [user.id, user.sourceId, user.name, user.email, user.role, user.active, user.offboarded]);
      }
    }

    for (const lead of leads) {
      const current = (await target.query("SELECT source_checksum, is_pre_ps_done FROM leads WHERE source_id = $1", [lead.sourceId])).rows[0];
      if (current?.source_checksum === lead.checksum && current.is_pre_ps_done === lead.isPrePsDone) continue;
      await target.query(
        "INSERT INTO leads (id,source_id,source_tenant,name,first_name,last_name,email,phone,alternate_phone,company,designation,city,state,pincode,area,location,lead_no,external_id,source_system,lead_source,lead_source_secondary,lead_type,lead_status,stage,pipeline,priority,permission,pso_date,is_pre_ps_done,owner_user_id,team,next_follow_up_at,last_call_at,created_at,updated_at,custom_values,legacy_finance,source_checksum,import_run_id) VALUES ($1,$2,'altus',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38) ON CONFLICT (source_id) DO UPDATE SET name=EXCLUDED.name,first_name=EXCLUDED.first_name,last_name=EXCLUDED.last_name,email=EXCLUDED.email,phone=EXCLUDED.phone,alternate_phone=EXCLUDED.alternate_phone,company=EXCLUDED.company,designation=EXCLUDED.designation,city=EXCLUDED.city,state=EXCLUDED.state,pincode=EXCLUDED.pincode,area=EXCLUDED.area,location=EXCLUDED.location,lead_no=EXCLUDED.lead_no,external_id=EXCLUDED.external_id,source_system=EXCLUDED.source_system,lead_source=EXCLUDED.lead_source,lead_source_secondary=EXCLUDED.lead_source_secondary,lead_type=EXCLUDED.lead_type,lead_status=EXCLUDED.lead_status,stage=EXCLUDED.stage,pipeline=EXCLUDED.pipeline,priority=EXCLUDED.priority,permission=EXCLUDED.permission,pso_date=EXCLUDED.pso_date,is_pre_ps_done=EXCLUDED.is_pre_ps_done,owner_user_id=EXCLUDED.owner_user_id,team=EXCLUDED.team,next_follow_up_at=EXCLUDED.next_follow_up_at,last_call_at=EXCLUDED.last_call_at,created_at=EXCLUDED.created_at,updated_at=EXCLUDED.updated_at,custom_values=EXCLUDED.custom_values,legacy_finance=EXCLUDED.legacy_finance,source_checksum=EXCLUDED.source_checksum,import_run_id=EXCLUDED.import_run_id",
        [lead.id,lead.sourceId,lead.name,lead.firstName,lead.lastName,lead.email,lead.phone,lead.alternatePhone,lead.company,lead.designation,lead.city,lead.state,lead.pincode,lead.area,lead.location,lead.leadNo,lead.externalId,lead.sourceSystem,lead.leadSource,lead.leadSourceSecondary,lead.leadType,lead.leadStatus,lead.stage,lead.pipeline,lead.priority,lead.permission,lead.psoDate,lead.isPrePsDone,lead.ownerUserId,lead.team,lead.nextFollowUpAt,lead.lastCallAt,lead.createdAt,lead.updatedAt,JSON.stringify(lead.customValues),JSON.stringify(lead.legacyFinance),lead.checksum,runId]
      );
    }

    const childRows = [
      ["lead_calls", data.state.calls || []],
      ["lead_followups", data.state.followups || []],
      ["lead_history", data.state.history || []],
      ["lead_messages", linkedMessages],
    ];
    for (const [table, rows] of childRows) {
      for (let index = 0; index < rows.length; index++) {
        const row = rows[index]; const id = sourceId(table, row, index); const leadId = childLeadId(row);
        const rowChecksum = checksum(row);
        const current = (await target.query(`SELECT source_checksum FROM ${table} WHERE source_id = $1`, [id])).rows[0];
        if (current?.source_checksum === rowChecksum) continue;
        if (table === "lead_calls") await target.query("INSERT INTO lead_calls (id,source_id,lead_id,user_id,happened_at,note,resolution,custom_values,source_checksum,import_run_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (source_id) DO UPDATE SET lead_id=EXCLUDED.lead_id,user_id=EXCLUDED.user_id,happened_at=EXCLUDED.happened_at,note=EXCLUDED.note,resolution=EXCLUDED.resolution,custom_values=EXCLUDED.custom_values,source_checksum=EXCLUDED.source_checksum,import_run_id=EXCLUDED.import_run_id", [id,id,leadId,row.userId||row.user_id||null,dateValue(row.happenedAt||row.at,"happenedAt",{}),row.note||row.notes||null,row.resolution||null,JSON.stringify(row),rowChecksum,runId]);
        else if (table === "lead_followups") await target.query("INSERT INTO lead_followups (id,source_id,lead_id,assigned_to,due_at,status,note,completed_at,custom_values,source_checksum,import_run_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (source_id) DO UPDATE SET lead_id=EXCLUDED.lead_id,assigned_to=EXCLUDED.assigned_to,due_at=EXCLUDED.due_at,status=EXCLUDED.status,note=EXCLUDED.note,completed_at=EXCLUDED.completed_at,custom_values=EXCLUDED.custom_values,source_checksum=EXCLUDED.source_checksum,import_run_id=EXCLUDED.import_run_id", [id,id,leadId,row.assignedTo||row.assigned_to||null,dateValue(row.dueAt||row.due_at,"dueAt",{}),row.status||null,row.note||null,dateValue(row.completedAt||row.completed_at,"completedAt",{}),JSON.stringify(row),rowChecksum,runId]);
        else if (table === "lead_history") await target.query("INSERT INTO lead_history (id,source_id,lead_id,occurred_at,actor_id,action,entity,entity_id,field,from_value,to_value,note,custom_values,source_checksum,import_run_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT (source_id) DO UPDATE SET lead_id=EXCLUDED.lead_id,occurred_at=EXCLUDED.occurred_at,actor_id=EXCLUDED.actor_id,action=EXCLUDED.action,entity=EXCLUDED.entity,entity_id=EXCLUDED.entity_id,field=EXCLUDED.field,from_value=EXCLUDED.from_value,to_value=EXCLUDED.to_value,note=EXCLUDED.note,custom_values=EXCLUDED.custom_values,source_checksum=EXCLUDED.source_checksum,import_run_id=EXCLUDED.import_run_id", [id,id,leadId,dateValue(row.at||row.occurredAt,"at",{}),row.actorId||row.actor_id||null,row.action||null,row.entity||null,row.entityId||row.entity_id||null,row.field||null,row.from==null?null:String(row.from),row.to==null?null:String(row.to),row.note||null,JSON.stringify(row),rowChecksum,runId]);
        else await target.query("INSERT INTO lead_messages (id,source_id,lead_id,sent_at,channel,status,sender,body,custom_values,source_checksum,import_run_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (source_id) DO UPDATE SET lead_id=EXCLUDED.lead_id,sent_at=EXCLUDED.sent_at,channel=EXCLUDED.channel,status=EXCLUDED.status,sender=EXCLUDED.sender,body=EXCLUDED.body,custom_values=EXCLUDED.custom_values,source_checksum=EXCLUDED.source_checksum,import_run_id=EXCLUDED.import_run_id", [id,id,leadId,dateValue(row.sentAt||row.at,"sentAt",{}),row.channel||null,row.status||null,row.sender||null,row.body||row.message||null,JSON.stringify(row),rowChecksum,runId]);
      }
    }
    for (let index = 0; index < unlinkedMessages.length; index++) {
      const row = unlinkedMessages[index]; const id = sourceId("unlinked_messages", row, index); const rowChecksum = checksum(row);
      const current = (await target.query("SELECT source_checksum FROM unlinked_messages WHERE source_id = $1", [id])).rows[0];
      if (current?.source_checksum === rowChecksum) continue;
      await target.query("INSERT INTO unlinked_messages (id,source_id,source_checksum,import_run_id,raw) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (source_id) DO UPDATE SET source_checksum=EXCLUDED.source_checksum,import_run_id=EXCLUDED.import_run_id,raw=EXCLUDED.raw", [id,id,rowChecksum,runId,JSON.stringify(row)]);
    }
    await target.query("UPDATE import_runs SET status='complete',completed_at=now() WHERE id=$1", [runId]);
    await target.query("COMMIT");
    report.apply_run_recorded = 1;
  } catch (error) { await target.query("ROLLBACK"); throw error; }
}

async function main() {
  const options = args();
  const targetUrl = process.env.CRM_PG_URL;
  const sourceUrl = process.env.CRM_IMPORT_PG_URL;
  if (!targetUrl || !sourceUrl) throw new Error("CRM_PG_URL and CRM_IMPORT_PG_URL are required.");
  const source = new Client({ connectionString: sourceUrl });
  const target = new Client({ connectionString: targetUrl });
  await source.connect(); await target.connect();
  try {
    const data = await sourceData(source);
    const targetUserState = await targetUsers(target);
    const failures = {};
    const ownerState = { bySource: new Map(), byEmail: new Map(), unresolvedOwners: new Set() };
    const importedUsers = (data.state.users || []).map(userModel);
    for (const user of importedUsers) { ownerState.bySource.set(user.sourceId, user); ownerState.byEmail.set(user.email, user); }
    for (const row of targetUserState.rows) { if (row.source_id) ownerState.bySource.set(String(row.source_id), row); ownerState.byEmail.set(String(row.email).toLowerCase(), row); }
    for (const user of importedUsers) {
      const matching = targetUserState.byEmail.get(user.email);
      if (matching && !matching.source_id) ownerState.bySource.set(user.sourceId, matching);
    }
    const leads = (data.state.people || []).map((person, index) => makeLead(person, index, ownerState, failures));
    const allMessages = data.state.messages || [];
    const linkedMessages = allMessages.filter((row) => childLeadSource(row));
    const unlinkedMessages = allMessages.filter((row) => !childLeadSource(row));
    const report = {
      mode: options.mode,
      source_snapshot_seq: data.seq,
      source_counts: {
        users: importedUsers.length, leads: leads.length,
        lead_calls: (data.state.calls || []).length,
        lead_followups: (data.state.followups || []).length,
        lead_history: (data.state.history || []).length,
        lead_messages: linkedMessages.length,
        unlinked_messages: unlinkedMessages.length,
      },
      conversion_failures: failures,
      unresolved_owner_count: ownerState.unresolvedOwners.size,
      credential_user_count: data.credentials.size,
      boolean_fields_checked: ["isPrePsDone"],
      users: { inserted: 0, updated: 0, matched_existing: 0, conflicts: 0 },
      would_insert_or_update: {},
    };
    for (const user of importedUsers) {
      const existing = targetUserState.bySource.get(user.sourceId) || targetUserState.rows.find((row) => row.id === user.id) || targetUserState.byEmail.get(user.email);
      if (!existing) report.users.inserted++;
      else if (existing.source_id === user.sourceId && existing.name === user.name && String(existing.email).toLowerCase() === user.email && existing.role === user.role && existing.active === user.active && existing.offboarded === user.offboarded) continue;
      else if (existing.source_id === user.sourceId) report.users.updated++;
      else if (!existing.source_id && String(existing.email).toLowerCase() === user.email) report.users.matched_existing++;
      else report.users.conflicts++;
    }
    for (const [table, rows] of Object.entries({ leads, lead_calls: data.state.calls || [], lead_followups: data.state.followups || [], lead_history: data.state.history || [], lead_messages: linkedMessages, unlinked_messages: unlinkedMessages })) {
      const existing = new Map((await target.query(`SELECT source_id, source_checksum FROM ${table}`)).rows.map((row) => [String(row.source_id), row.source_checksum]));
      const ids = rows.map((row, index) => table === "leads" ? row.sourceId : sourceId(table, row, index));
      const checksums = rows.map((row, index) => table === "leads" ? row.checksum : checksum(row));
      report.would_insert_or_update[table] = { insert: ids.filter((id) => !existing.has(id)).length, update: ids.filter((id, index) => existing.get(id) && existing.get(id) !== checksums[index]).length };
    }
    if (options.mode === "verify") {
      report.target_schema_count = (await target.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('import_runs','leads','lead_calls','lead_followups','lead_history','lead_messages','unlinked_messages')")).rows[0].n;
      report.verify = {};
      for (const [table, rows] of Object.entries({ leads, lead_calls: data.state.calls || [], lead_followups: data.state.followups || [], lead_history: data.state.history || [], lead_messages: linkedMessages, unlinked_messages: unlinkedMessages })) {
        const sourceEntries = rows.map((row, index) => [table === "leads" ? row.sourceId : sourceId(table, row, index), table === "leads" ? row.checksum : checksum(row)]).sort((a, b) => a[0].localeCompare(b[0]));
        const targetEntries = (await target.query(`SELECT source_id, source_checksum FROM ${table} ORDER BY source_id`)).rows.map((row) => [String(row.source_id), row.source_checksum]);
        const sourceAggregate = checksum(sourceEntries); const targetAggregate = checksum(targetEntries);
        const linked = table === "leads" || table === "unlinked_messages" ? true : Number((await target.query(`SELECT count(*)::int AS n FROM ${table} c LEFT JOIN leads l ON l.id=c.lead_id WHERE c.lead_id IS NULL OR l.id IS NULL OR c.source_id IS NULL`)).rows[0].n) === 0;
        report.verify[table] = { source_count: rows.length, target_count: targetEntries.length, null_source_id_count: targetEntries.filter((row) => !row[0]).length, all_children_linked: linked, aggregate_checksum_equal: sourceAggregate === targetAggregate };
      }
      const teamSizeSource = (data.state.people || []).filter((row) => nonempty(row.teamSize)).length;
      const teamSizeTarget = Number((await target.query("SELECT count(*)::int AS n FROM leads WHERE custom_values ? 'teamSize'")).rows[0].n);
      report.verify.team_size = { source_nonempty: teamSizeSource, target_preserved: teamSizeTarget, equal: teamSizeSource === teamSizeTarget };
      const sourceBoolean = { true: 0, false: 0, null: 0 };
      for (const person of data.state.people || []) { const value = booleanValue(person.isPrePsDone, "verify", {}); sourceBoolean[value === null ? "null" : String(value)]++; }
      const targetBoolean = (await target.query("SELECT count(*) FILTER (WHERE is_pre_ps_done IS TRUE)::int AS true_count, count(*) FILTER (WHERE is_pre_ps_done IS FALSE)::int AS false_count, count(*) FILTER (WHERE is_pre_ps_done IS NULL)::int AS null_count FROM leads")).rows[0];
      const ownerCheck = (await target.query("SELECT count(*) FILTER (WHERE owner_user_id IS NULL)::int AS unowned, count(*) FILTER (WHERE owner_user_id IS NOT NULL AND u.id IS NULL)::int AS unresolved FROM leads l LEFT JOIN users u ON u.id=l.owner_user_id")).rows[0];
      report.verify.is_pre_ps_done = { source_true: sourceBoolean.true, source_false: sourceBoolean.false, source_null: sourceBoolean.null, target_true: targetBoolean.true_count, target_false: targetBoolean.false_count, target_null: targetBoolean.null_count, equal: sourceBoolean.true === targetBoolean.true_count && sourceBoolean.false === targetBoolean.false_count && sourceBoolean.null === targetBoolean.null_count };
      const sourceUnowned = (data.state.people || []).filter((person) => !nonempty(person.owner)).length;
      report.verify.owners = { source_unowned: sourceUnowned, target_unowned: Number(ownerCheck.unowned), target_unresolved: Number(ownerCheck.unresolved), unowned_equal: sourceUnowned === Number(ownerCheck.unowned) };
    }
    if (options.mode === "apply") {
      const runId = "altus-" + Date.now() + "-" + crypto.randomBytes(5).toString("hex");
      await applyData(target, data, importedUsers, leads, runId, report);
    }
    console.log(JSON.stringify(report, null, 2));
  } finally { await source.end(); await target.end(); }
}

if (require.main === module) main().catch(() => { console.error("Import failed."); process.exitCode = 1; });

module.exports = { ADMIN_DATA_SECTIONS, ROLE_MAP, checksum, dateValue, numberValue };
