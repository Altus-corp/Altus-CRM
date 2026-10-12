"use strict";

const crypto = require("crypto");
const ExcelJS = require("exceljs");
const { writeAudit } = require("./audit.cjs");
const LEAD_STAGE_OPTIONS = require("../shared/lead-stages.json");
const LEAD_STAGES = new Set(LEAD_STAGE_OPTIONS.map(({ value }) => value));

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 5000;
const MAX_COLUMNS = 50;
const MAX_CELL_LENGTH = 2000;
const MAX_XLSX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([".csv", ".xlsx"]);
const TEMPLATE_HEADERS = Object.freeze(["name", "email", "phone", "company", "lead_type", "stage", "permission", "lead_status", "owner", "pso_date", "next_follow_up", "city", "designation", "lead_number", "source_ref"]);
const TEMPLATE_ROWS = Object.freeze([
  ["Sample Lead 1 (test row)", "sample1@example.test", "0000000001", "Sample Company", "DL", "lead", "Pending", "", "", "2026-01-15", "2026-01-20", "Sample City", "Sample Role", "SAMPLE-001", "SAMPLE-DELETE-ME"],
  ["Sample Lead 2 (test row)", "sample2@example.test", "0000000002", "Sample Company", "L", "qualified", "Pending", "", "", "2026-02-15", "2026-02-20", "Sample City", "Sample Role", "SAMPLE-002", "SAMPLE-DELETE-ME"],
  ["Sample Lead 3 (test row)", "sample3@example.test", "0000000003", "Sample Company", "R", "calling", "Pending", "", "", "2026-03-15", "2026-03-20", "Sample City", "Sample Role", "SAMPLE-003", "SAMPLE-DELETE-ME"],
]);
const LEAD_TYPES = Object.freeze({ DL: "P3", L: "P3", QDL: "P3", QL: "P2", R: "P1" });

const HEADER_ALIASES = new Map([
  ["name", "name"], ["fullname", "name"], ["leadname", "name"],
  ["email", "email"], ["emailaddress", "email"],
  ["phone", "phone"], ["phonenumber", "phone"], ["mobile", "phone"], ["cell", "phone"], ["cellno", "phone"],
  ["company", "company"], ["companyname", "company"], ["organisation", "company"], ["organization", "company"],
  ["leadtype", "lead_type"], ["leadtypecode", "lead_type"], ["type", "lead_type"],
  ["stage", "stage"], ["leadstage", "stage"],
  ["permission", "permission"], ["permissiontocall", "permission"], ["permissiontocallstatus", "permission"],
  ["leadstatus", "lead_status"], ["status", "lead_status"],
  ["owner", "owner"], ["owneremail", "owner"], ["assignedto", "owner"],
  ["psodate", "pso_date"], ["pso", "pso_date"],
  ["nextfollowup", "next_follow_up_at"], ["nextfollowupat", "next_follow_up_at"], ["followupdate", "next_follow_up_at"],
  ["city", "city"], ["designation", "designation"], ["jobtitle", "designation"],
  ["leadnumber", "lead_no"], ["leadno", "lead_no"], ["sourceleadnumber", "lead_no"],
  ["sourceref", "source_ref"], ["sourceid", "source_ref"], ["externalid", "source_ref"],
]);

class ImportError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

function normalizeHeader(value) { return String(value ?? "").trim().toLowerCase().replace(/[\s_-]+/g, ""); }
function normalizePhone(value) { return String(value ?? "").replace(/\D/g, ""); }
function comparablePhone(value) { const normalized = normalizePhone(value); if (normalized.length < 10 || /^0+$/.test(normalized) || /^(\d)\1+$/.test(normalized) || /^0{8,}\d{1,2}$/.test(normalized)) return null; return normalized; }
function normalizeEmail(value) { const text = String(value ?? "").trim().toLowerCase(); return text || null; }
function text(value) { return String(value ?? "").trim(); }
function isBlankRow(row) { return row.every((value) => text(value) === ""); }

function decodeUtf8(buffer) {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buffer).replace(/^\uFEFF/, ""); }
  catch { throw new ImportError("The CSV file is not valid UTF-8."); }
}

function parseCsv(buffer) {
  const source = decodeUtf8(buffer);
  const rows = [];
  let row = [], cell = "", quoted = false, afterQuote = false;
  const pushCell = () => { if (cell.length > MAX_CELL_LENGTH) throw new ImportError(`Cell exceeds the ${MAX_CELL_LENGTH}-character limit.`); row.push(cell.trim()); cell = ""; };
  const pushRow = () => { pushCell(); if (!isBlankRow(row)) rows.push(row); row = []; afterQuote = false; };
  for (let i = 0; i < source.length; i += 1) {
    const character = source[i];
    if (quoted) {
      if (character === '"') { if (source[i + 1] === '"') { cell += '"'; i += 1; } else { quoted = false; afterQuote = true; } }
      else cell += character;
      continue;
    }
    if (afterQuote) {
      if (character === ",") { pushCell(); afterQuote = false; }
      else if (character === "\r") { if (source[i + 1] === "\n") i += 1; pushRow(); }
      else if (character === "\n") pushRow();
      else if (/\s/.test(character)) { /* permit whitespace after a quoted cell */ }
      else throw new ImportError("The CSV file has invalid characters after a quoted cell.");
      continue;
    }
    if (character === '"' && cell.trim() === "") { cell = ""; quoted = true; }
    else if (character === ",") pushCell();
    else if (character === "\r") { if (source[i + 1] === "\n") i += 1; pushRow(); }
    else if (character === "\n") pushRow();
    else cell += character;
  }
  if (quoted) throw new ImportError("The CSV file has an unterminated quoted cell.");
  if (cell || row.length) pushRow();
  if (!rows.length) throw new ImportError("The file has no header row.");
  return rows;
}

function zipUncompressedSize(buffer) {
  let total = 0; let entries = 0;
  for (let offset = 0; offset + 46 <= buffer.length; offset += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) continue;
    const uncompressed = buffer.readUInt32LE(offset + 24);
    if (uncompressed === 0xffffffff) throw new ImportError("The Excel file uses unsupported ZIP64 entries.");
    total += uncompressed; entries += 1;
    if (total > MAX_XLSX_UNCOMPRESSED_BYTES) throw new ImportError("The Excel file is too large after decompression.");
  }
  if (!entries) throw new ImportError("The Excel file is not a valid XLSX archive.");
}

function excelCellValue(cell, columnNumber) {
  const value = cell.value;
  if (value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, "formula")) { if (value.result === undefined || value.result === null) return { error: "Formula cell has no cached value." }; return excelCellValue({ value: value.result }, columnNumber); }
  if (value instanceof Date) return { value };
  if (value && typeof value === "object") {
    if (Array.isArray(value.richText)) return { value: value.richText.map((part) => String(part?.text ?? "")).join("") };
    if (Object.prototype.hasOwnProperty.call(value, "text") || Object.prototype.hasOwnProperty.call(value, "hyperlink")) { const display = value.text ?? value.hyperlink; return { value: String(display ?? "").replace(/^mailto:/i, "") }; }
    return { error: `unsupported cell content in column ${columnNumber || "?"}` };
  }
  return { value: value == null ? "" : value };
}

async function parseXlsx(buffer) {
  zipUncompressedSize(buffer);
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(buffer, { formulae: false }); } catch { throw new ImportError("The Excel file could not be read as a valid .xlsx workbook."); }
  const usedSheets = workbook.worksheets.filter((sheet) => {
    if (sheet.name === "Instructions") return false;
    let used = false;
    sheet.eachRow({ includeEmpty: false }, (row) => { if (row.values?.some((value) => text(value) !== "")) used = true; });
    return used;
  });
  if (usedSheets.length > 1) throw new ImportError("The .xlsx file contains more than one used sheet. Only the Leads sheet and Instructions sheet are supported.");
  const sheet = workbook.getWorksheet("Leads") || usedSheets[0] || workbook.worksheets[0];
  if (!sheet) throw new ImportError("The Excel file has no worksheet.");
  const rows = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const values = []; const errors = [];
    const max = Math.min(Math.max(row.cellCount, row.actualCellCount || 0), MAX_COLUMNS + 1);
    if (row.cellCount > MAX_COLUMNS) errors.push(`The row exceeds the ${MAX_COLUMNS}-column limit.`);
    for (let index = 1; index <= max; index += 1) {
      const result = excelCellValue(row.getCell(index), index);
      if (result.error) errors.push(`Column ${index}: ${result.error}`);
      let value = result.value instanceof Date ? result.value : result.value == null ? "" : String(result.value);
      if (value.length > MAX_CELL_LENGTH) errors.push(`Column ${index}: cell exceeds the ${MAX_CELL_LENGTH}-character limit.`);
      values.push(value);
    }
    if (!isBlankRow(values)) rows.push({ values, errors, rowNumber });
  });
  if (!rows.length) throw new ImportError("The file has no header row.");
  return rows;
}

async function parseFile(buffer, filename) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new ImportError("Choose a non-empty CSV or .xlsx file.");
  if (buffer.length > MAX_FILE_BYTES) throw new ImportError("The file exceeds the 5 MB limit.", 413);
  const extension = String(filename || "").toLowerCase().slice(String(filename || "").lastIndexOf("."));
  if (!ALLOWED_EXTENSIONS.has(extension)) throw new ImportError("Only .csv and .xlsx files are supported.");
  const rows = extension === ".csv" ? parseCsv(buffer).map((values, index) => ({ values, errors: [], rowNumber: index + 1 })) : await parseXlsx(buffer);
  if (rows.length - 1 > MAX_ROWS) throw new ImportError(`The file exceeds the ${MAX_ROWS}-row limit.`);
  return { rows, extension, fileHash: crypto.createHash("sha256").update(buffer).digest("hex") };
}

function parseDate(value, field) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0 && value < 100000) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(value * 86400000));
    return field === "next_follow_up_at" ? date.toISOString() : date.toISOString().slice(0, 10);
  }
  if (value instanceof Date) { if (Number.isNaN(value.getTime())) return null; return field === "next_follow_up_at" ? value.toISOString() : value.toISOString().slice(0, 10); }
  const raw = text(value);
  if (!raw) return null;
  let match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.exec(raw);
  if (!match) { const india = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw); if (india) match = [null, india[3], india[2], india[1]]; }
  if (!match) return null;
  const iso = `${match[1]}-${match[2]}-${match[3]}`;
  const date = new Date(field === "next_follow_up_at" && /T| /.test(raw) ? raw : `${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso) return null;
  return field === "next_follow_up_at" && /T| /.test(raw) ? date.toISOString() : iso;
}

async function loadReferenceData(db) {
  const masters = await db.query("SELECT master_type,code,label FROM master_values WHERE active=true", []);
  const values = new Map();
  for (const row of masters.rows || []) { const key = text(row.master_type).toLowerCase().replace(/[\s_-]+/g, ""); if (!values.has(key)) values.set(key, new Set()); values.get(key).add(text(row.code || row.label).toLowerCase()); values.get(key).add(text(row.label).toLowerCase()); }
  const users = await db.query("SELECT id,email FROM users WHERE active=true AND offboarded=false", []);
  const leads = await db.query("SELECT id,source_id,email,phone FROM leads", []);
  return { masters: values, users: new Map((users.rows || []).map((row) => [normalizeEmail(row.email), row])), leads: leads.rows || [] };
}

function masterHas(data, keys, value) {
  const sets = keys.map((key) => data.masters.get(key)).filter(Boolean);
  return !sets.length || sets.some((set) => set.has(text(value).toLowerCase()));
}

function mapHeaders(values) {
  if (values.length > MAX_COLUMNS) throw new ImportError(`The file exceeds the ${MAX_COLUMNS}-column limit.`);
  const columns = []; const ignored = []; const seen = new Set();
  values.forEach((value, index) => { const raw = text(value); const canonical = HEADER_ALIASES.get(normalizeHeader(raw)); if (!canonical || seen.has(canonical)) { if (raw) ignored.push(raw); columns[index] = null; } else { columns[index] = canonical; seen.add(canonical); } });
  if (!seen.has("name")) throw new ImportError("The file must contain a name column.");
  return { columns, ignored };
}

function rowValues(row, columns, reference, rowNumber) {
  const values = Object.create(null); const errors = [...(row.errors || [])];
  columns.forEach((column, index) => { if (column) values[column] = row.values[index] instanceof Date ? row.values[index] : text(row.values[index]); });
  const name = text(values.name); if (!name) errors.push("name: value is required.");
  const email = normalizeEmail(values.email); if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("email: invalid email address.");
  const phone = values.phone == null ? "" : text(values.phone); const normalizedPhone = normalizePhone(phone);
  if (phone && !normalizedPhone) errors.push("phone: must contain digits.");
  const leadType = text(values.lead_type || "DL").toUpperCase(); if (!Object.prototype.hasOwnProperty.call(LEAD_TYPES, leadType) || !masterHas(reference, ["leadtype", "lead_type"], leadType)) errors.push("lead_type: invalid master value.");
  const stage = text(values.stage || "lead").toLowerCase(); if (!LEAD_STAGES.has(stage) || !masterHas(reference, ["stage", "leadstage"], stage)) errors.push("stage: invalid master value.");
  const permission = text(values.permission || "Pending"); if (!["Yes", "No", "Pending"].includes(permission)) errors.push("permission: must be Yes, No, or Pending.");
  const status = text(values.lead_status); if (status && !masterHas(reference, ["leadstatus", "status"], status)) errors.push("lead_status: invalid master value.");
  const psoDate = parseDate(values.pso_date, "pso_date"); if (values.pso_date && !psoDate) errors.push("pso_date: invalid date; use YYYY-MM-DD or DD/MM/YYYY.");
  const nextFollowup = parseDate(values.next_follow_up_at, "next_follow_up_at"); if (values.next_follow_up_at && !nextFollowup) errors.push("next_follow_up_at: invalid date; use YYYY-MM-DD or DD/MM/YYYY.");
  let ownerId = null; const owner = normalizeEmail(values.owner); if (owner) { ownerId = reference.users.get(owner)?.id || null; if (!ownerId) errors.push("owner: no active user matches that email."); }
  return { rowNumber, errors, values: { name, email, phone: phone || null, normalizedPhone, company: text(values.company) || null, lead_type: leadType, priority: LEAD_TYPES[leadType], stage, permission, lead_status: status || null, owner_user_id: ownerId, pso_date: psoDate, next_follow_up_at: nextFollowup, city: text(values.city) || null, designation: text(values.designation) || null, lead_no: text(values.lead_no) || null, source_ref: text(values.source_ref) || null } };
}

function classifyRows(rows, reference, fileHash, allowDuplicates) {
  const { columns, ignored } = mapHeaders(rows[0].values);
  const mapped = rows.slice(1).map((row) => rowValues(row, columns, reference, row.rowNumber));
  const phoneRows = new Map(), emailRows = new Map();
  for (const row of mapped) {
    const comparable = comparablePhone(row.values.phone); if (comparable) { const prior = phoneRows.get(comparable); if (prior) { row.duplicate = true; row.duplicateReason = `phone duplicate in file (row ${prior})`; row.errors.push(`possible duplicate: ${row.duplicateReason}.`); } else phoneRows.set(comparable, row.rowNumber); }
    if (row.values.email) { const prior = emailRows.get(row.values.email); if (prior) { row.duplicate = true; row.duplicateReason = `email duplicate in file (row ${prior})`; row.errors.push(`possible duplicate: ${row.duplicateReason}.`); } else emailRows.set(row.values.email, row.rowNumber); }
  }
  const existingPhone = new Map(), existingEmail = new Map(), existingSource = new Set();
  for (const lead of reference.leads) { const comparable = comparablePhone(lead.phone); if (comparable) existingPhone.set(comparable, lead.id); if (lead.email) existingEmail.set(normalizeEmail(lead.email), lead.id); if (lead.source_id) existingSource.add(lead.source_id); }
  for (const row of mapped) {
    row.sourceId = `upload:${fileHash}:${row.rowNumber}`;
    if (existingSource.has(row.sourceId)) row.duplicate = true;
    const matches = new Set(); const comparable = comparablePhone(row.values.phone); if (comparable && existingPhone.has(comparable)) matches.add(`phone (lead ${existingPhone.get(comparable)})`); if (row.values.email && existingEmail.has(row.values.email)) matches.add(`email (lead ${existingEmail.get(row.values.email)})`);
    if (matches.size) { row.duplicate = true; row.duplicateReason = `possible duplicate by ${[...matches].join(" and ")}`; if (!allowDuplicates) row.errors.push(`possible duplicate: ${row.duplicateReason}.`); }
  }
  const ready = mapped.filter((row) => row.errors.every((error) => error.startsWith("possible duplicate:")));
  const valid = ready.filter((row) => !row.duplicate || allowDuplicates);
  const errorRows = mapped.filter((row) => row.errors.some((error) => !error.startsWith("possible duplicate:")));
  return { mapped, ready, valid, errors: errorRows, ignored, columns };
}

async function analyzeUpload(buffer, filename, db, options = {}) {
  const parsed = await parseFile(buffer, filename); const reference = await loadReferenceData(db); const classified = classifyRows(parsed.rows, reference, parsed.fileHash, options.allowDuplicates === true);
  return { ...parsed, ...classified, preview: classified.valid.slice(0, 20).map((row) => ({ row: row.rowNumber, ...row.values })) };
}

function publicAnalysis(analysis) {
  const duplicateRows = analysis.mapped.filter((row) => row.duplicate && !row.errors.some((error) => !error.startsWith("possible duplicate:"))).map((row) => ({ row: row.rowNumber, reason: row.duplicateReason }));
  return { file_hash: analysis.fileHash, extension: analysis.extension, sheet_note: analysis.extension === ".xlsx" ? "The Leads sheet was read; Instructions was ignored." : null, total_rows: analysis.mapped.length, valid: analysis.valid.length, errors: analysis.errors.length, possible_duplicates: duplicateRows.length, duplicate_rows: duplicateRows, ignored_columns: analysis.ignored, preview_rows: analysis.preview, error_rows: analysis.errors.map((row) => ({ row: row.rowNumber, errors: row.errors })), can_apply: analysis.errors.length === 0 && analysis.valid.length > 0 }; }

function csvCell(value) { const cell = String(value ?? ""); return /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell; }
async function template(format) {
  if (format === "csv") return { body: Buffer.from([TEMPLATE_HEADERS, ...TEMPLATE_ROWS].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n", "utf8"), contentType: "text/csv; charset=utf-8", filename: "altus-leads-sample.csv" };
  if (format !== "xlsx") throw new ImportError("Template format must be xlsx or csv.");
  const workbook = new ExcelJS.Workbook();
  const leads = workbook.addWorksheet("Leads");
  leads.addRow(TEMPLATE_HEADERS);
  for (const values of TEMPLATE_ROWS) {
    const row = leads.addRow(values);
    row.getCell(TEMPLATE_HEADERS.indexOf("phone") + 1).numFmt = "@";
    row.getCell(TEMPLATE_HEADERS.indexOf("phone") + 1).value = String(values[TEMPLATE_HEADERS.indexOf("phone")]);
  }
  const instructions = workbook.addWorksheet("Instructions");
  ["Replace the example rows with your own leads (or keep them to test).", "Only name is required.", "Accepted lead type, stage, and status values come from the active Masters in the CRM.", "Use YYYY-MM-DD dates (and YYYY-MM-DD HH:mm for date-time values).", "Maximum 5000 rows and 5 MB."] .forEach((line) => instructions.addRow([line]));
  return { body: Buffer.from(await workbook.xlsx.writeBuffer()), contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename: "altus-leads-sample.xlsx" };
}

function readUpload(req) {
  return new Promise((resolve, reject) => {
    const contentLength = Number(req.headers["content-length"] || 0); if (contentLength > MAX_FILE_BYTES) return reject(new ImportError("The file exceeds the 5 MB limit.", 413));
    let size = 0; const chunks = [];
    req.on("data", (chunk) => { size += chunk.length; if (size > MAX_FILE_BYTES) { reject(new ImportError("The file exceeds the 5 MB limit.", 413)); req.destroy(); return; } chunks.push(chunk); });
    req.on("end", () => resolve(Buffer.concat(chunks))); req.on("error", reject);
  });
}

async function assertApplyMigration(db) {
  const result = await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='import_runs' AND column_name IN ('file_hash','actor_user_id')", []);
  const columns = new Set((result.rows || []).map((row) => row.column_name));
  if (!columns.has("file_hash") || !columns.has("actor_user_id")) throw new ImportError("Migration 008 has not been applied. No rows were written.", 409);
}

async function preview(req, db) {
  const buffer = await readUpload(req); const filename = String(req.headers["x-altus-filename"] || "upload.csv"); const analysis = await analyzeUpload(buffer, filename, db, { allowDuplicates: req.headers["x-altus-allow-duplicates"] === "1" }); return publicAnalysis(analysis);
}

async function apply(req, db, actor) {
  const buffer = await readUpload(req); const filename = String(req.headers["x-altus-filename"] || "upload.csv"); const expected = String(req.headers["x-altus-file-hash"] || "").trim().toLowerCase(); const analysis = await analyzeUpload(buffer, filename, db, { allowDuplicates: req.headers["x-altus-allow-duplicates"] === "1" });
  if (!expected || expected !== analysis.fileHash) throw new ImportError("The file hash does not match the previewed file.");
  if (analysis.errors.length) throw Object.assign(new ImportError("The file still contains row errors. Fix them before applying."), { analysis: publicAnalysis(analysis) });
  await assertApplyMigration(db);
  const runId = `upload-run-${crypto.randomUUID()}`; const counts = { total_rows: analysis.mapped.length, created: 0, skipped_duplicates: analysis.mapped.filter((row) => row.duplicate).length, skipped_errors: 0, errors: [] };
  try {
    await db.transaction(async (tx) => {
      await tx.query("INSERT INTO import_runs(id,source,mode,checksum,file_hash,actor_user_id,status,report) VALUES($1,'leads-upload','apply',$2,$2,$3,'running',$4::jsonb)", [runId, analysis.fileHash, actor.id, JSON.stringify({ total_rows: counts.total_rows })]);
      for (const row of analysis.ready) {
        if (row.duplicate && req.headers["x-altus-allow-duplicates"] !== "1") continue;
        const leadId = `lead-upload-${analysis.fileHash}-${row.rowNumber}`;
        const customValues = row.values.source_ref ? { source_ref: row.values.source_ref } : {};
        const inserted = await tx.query("INSERT INTO leads(id,source_id,name,email,phone,company,designation,city,lead_no,lead_type,priority,stage,permission,lead_status,owner_user_id,pso_date,next_follow_up_at,custom_values,legacy_finance,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'{}'::jsonb,now()) ON CONFLICT(source_id) DO NOTHING RETURNING id", [leadId, row.sourceId, row.values.name, row.values.email, row.values.phone, row.values.company, row.values.designation, row.values.city, row.values.lead_no, row.values.lead_type, row.values.priority, row.values.stage, row.values.permission, row.values.lead_status, row.values.owner_user_id, row.values.pso_date, row.values.next_follow_up_at, JSON.stringify(customValues)]);
        if (!inserted.rows[0]) { counts.skipped_duplicates += 1; continue; }
        counts.created += 1;
        await tx.query("INSERT INTO lead_history(id,source_id,lead_id,occurred_at,actor_id,action,entity,entity_id,note,custom_values,source_checksum,import_run_id) VALUES($1,$2,$3,now(),$4,'lead.imported','lead',$3,NULL,'{}'::jsonb,$5,$6)", [`upload-history-${analysis.fileHash}-${row.rowNumber}`, `upload-history:${analysis.fileHash}:${row.rowNumber}`, leadId, actor.id, analysis.fileHash, runId]);
      }
      await tx.query("UPDATE import_runs SET status='completed',completed_at=now(),report=$2::jsonb WHERE id=$1", [runId, JSON.stringify(counts)]);
      await writeAudit(tx, { actorUserId: actor.id, action: "leads.imported", entityType: "import_run", entityId: runId, newValue: JSON.stringify({ created: counts.created, skipped_duplicates: counts.skipped_duplicates, skipped_errors: counts.skipped_errors }), ip: req.socket.remoteAddress });
    });
  } catch { throw new ImportError("The lead import could not be completed; no rows were written.", 500); }
  return { import_run_id: runId, ...counts };
}

module.exports = { MAX_FILE_BYTES, MAX_ROWS, MAX_COLUMNS, MAX_CELL_LENGTH, parseCsv, parseFile, parseXlsx, analyzeUpload, publicAnalysis, preview, apply, template, normalizePhone, comparablePhone, normalizeEmail, mapHeaders, excelCellValue, TEMPLATE_HEADERS, TEMPLATE_ROWS };
