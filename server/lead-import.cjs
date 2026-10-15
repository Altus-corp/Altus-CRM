"use strict";

const crypto = require("crypto");
const ExcelJS = require("exceljs");
const { writeAudit } = require("./audit.cjs");
const LeadFields = require("./lead-fields.cjs");
const LEAD_STAGE_OPTIONS = require("../shared/lead-stages.json");
const LEAD_STAGES = new Set(LEAD_STAGE_OPTIONS.map(({ value }) => value));

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 5000;
const MAX_COLUMNS = 50;
const MAX_CELL_LENGTH = 2000;
const MAX_XLSX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([".csv", ".xlsx"]);
const TEMPLATE_CORE_HEADERS = Object.freeze(["Lead No", "First Name", "Last Name", "Company Name", "Cell No", "Email ID", "Designation"]);
const LEAD_TYPES = Object.freeze({ DL: "P3", L: "P3", QDL: "P3", QL: "P2", R: "P1" });

const SOURCE_CUSTOM_FIELDS = Object.freeze({
  lead_acquisition_date: "date", business_category: "text", nature_of_business: "text", proposed_solution: "text",
  invite_sent_by_introducer: "boolean", invite_date_sent: "date", introducer_call_done: "boolean", introducer_call_date: "date",
  introducer_feedback: "text", introducer_name: "text", employee_name: "text", association_network_name: "text", chapter_name: "text",
  extra_notes: "text", last_called_on: "date", calling_resolution: "text", next_call_on: "date", calling_remarks: "text",
  intro_video_sent: "boolean", email_sent: "boolean", whatsapp_message_sent: "boolean",
});
const SOURCE_HEADER_ALIASES = new Map([
  ["leadacquisitiondate", "custom:lead_acquisition_date"], ["businesscategory", "custom:business_category"], ["natureofbusiness", "custom:nature_of_business"], ["proposedsolution", "custom:proposed_solution"],
  ["invitesentbyintroducer", "custom:invite_sent_by_introducer"], ["invitedatesent", "custom:invite_date_sent"], ["introducercalldone", "custom:introducer_call_done"], ["introducercalldate", "custom:introducer_call_date"],
  ["introducerfeedback", "custom:introducer_feedback"], ["introducername", "custom:introducer_name"], ["employeename", "custom:employee_name"], ["associationnetworkname", "custom:association_network_name"], ["chaptername", "custom:chapter_name"],
  ["extranotes", "custom:extra_notes"], ["lastcalledon", "custom:last_called_on"], ["callingresolution", "custom:calling_resolution"], ["nextcallon", "custom:next_call_on"], ["callingremarks", "custom:calling_remarks"],
  ["2minsintrovideosent", "custom:intro_video_sent"], ["emailsent", "custom:email_sent"], ["msg sent on whatsapp", "custom:whatsapp_message_sent"], ["msgsentonwhatsapp", "custom:whatsapp_message_sent"],
]);

const HEADER_ALIASES = new Map([
  ["name", "name"], ["fullname", "name"], ["leadname", "name"],
  ["firstname", "first_name"], ["first", "first_name"], ["lastname", "last_name"], ["last", "last_name"],
  ["email", "email"], ["emailaddress", "email"], ["emailid", "email"],
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

function normalizeHeader(value) { return String(value ?? "").trim().toLowerCase().replace(/[\s_\-/]+/g, ""); }
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
  if (!match) {
    const named = /^(\d{1,2})-([A-Za-z]{3,9})-(\d{4})$/.exec(raw);
    if (named) {
      const month = new Map([["jan", 1], ["feb", 2], ["mar", 3], ["apr", 4], ["may", 5], ["jun", 6], ["jul", 7], ["aug", 8], ["sep", 9], ["oct", 10], ["nov", 11], ["dec", 12]]).get(named[2].slice(0, 3).toLowerCase());
      if (month) match = [null, named[3], String(month).padStart(2, "0"), String(named[1]).padStart(2, "0")];
    }
  }
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
  const leadFields = await LeadFields.getDefinitions(db);
  return { masters: values, users: new Map((users.rows || []).map((row) => [normalizeEmail(row.email), row])), leads: leads.rows || [], leadFields };
}

function masterHas(data, keys, value) {
  const sets = keys.map((key) => data.masters.get(key)).filter(Boolean);
  return !sets.length || sets.some((set) => set.has(text(value).toLowerCase()));
}

function isCoreLeadHeader(field) {
  return HEADER_ALIASES.has(normalizeHeader(field.key)) || HEADER_ALIASES.has(normalizeHeader(field.label));
}

function mapHeaders(values, leadFields = []) {
  if (values.length > MAX_COLUMNS) throw new ImportError(`The file exceeds the ${MAX_COLUMNS}-column limit.`);
  const columns = []; const ignored = []; const seen = new Set(); const customHeaders = new Map();
  const activeFields = leadFields.filter((field) => field.active !== false && !isCoreLeadHeader(field));
  const activeCustomKeys = new Set(activeFields.map((field) => `custom:${field.key}`));
  for (const field of activeFields) { customHeaders.set(normalizeHeader(field.key), `custom:${field.key}`); customHeaders.set(normalizeHeader(field.label), `custom:${field.key}`); }
  values.forEach((value, index) => { const raw = text(value); const normalized = normalizeHeader(raw); const sourceAlias = SOURCE_HEADER_ALIASES.get(normalized); const canonical = HEADER_ALIASES.get(normalized) || customHeaders.get(normalized) || (sourceAlias && activeCustomKeys.has(sourceAlias) ? sourceAlias : null); if (!canonical || seen.has(canonical)) { if (raw) ignored.push(raw); columns[index] = null; } else { columns[index] = canonical; seen.add(canonical); } });
  // Keep the historical generic `name` upload working, but tracking-sheet rows
  // must identify the lead with Lead No; First Name alone is not a substitute.
  if (!seen.has("lead_no") && !seen.has("name")) throw new ImportError("The file must contain a Lead No column.");
  const missingFields = activeFields.filter((field) => !seen.has(`custom:${field.key}`)).map((field) => field.label);
  if (missingFields.length) throw new ImportError(`The file is missing active Lead Field column(s): ${missingFields.join(", ")}. Download the latest sample file and use its headers.`);
  if (ignored.length) throw new ImportError(`The file contains unrecognised or duplicate column(s): ${ignored.join(", ")}. Download the latest sample file and use its headers.`);
  return { columns, ignored };
}

function isSheetFillerRow(row) {
  const cells = row.values.map((value) => normalizeHeader(value)).filter(Boolean);
  if (cells.length < 2) return false;
  const first = cells[0];
  if (!["dd", "auto", "fill", "autofill"].includes(first)) return false;
  return cells.slice(1).every((value) => ["auto", "fill", "autofill"].includes(value));
}

function importCustomValues(rawCustom) {
  const values = {};
  for (const [key, raw] of Object.entries(rawCustom)) {
    if (!Object.prototype.hasOwnProperty.call(SOURCE_CUSTOM_FIELDS, key)) continue;
    const value = text(raw); if (!value) continue;
    if (SOURCE_CUSTOM_FIELDS[key] === "boolean") {
      const normalized = value.toLowerCase();
      values[key] = ["yes", "true", "1"].includes(normalized) ? true : ["no", "false", "0"].includes(normalized) ? false : value;
    } else if (SOURCE_CUSTOM_FIELDS[key] === "date") values[key] = parseDate(raw, key) || value;
    else values[key] = value.slice(0, MAX_CELL_LENGTH);
  }
  return values;
}

function rowValues(row, columns, reference, rowNumber) {
  const values = Object.create(null); const errors = [...(row.errors || [])];
  columns.forEach((column, index) => { if (column) values[column] = row.values[index] instanceof Date ? row.values[index] : text(row.values[index]); });
  const firstName = text(values.first_name); const lastName = text(values.last_name); const leadNo = text(values.lead_no); const name = text(values.name) || [firstName, lastName].filter(Boolean).join(" ") || leadNo;
  const email = normalizeEmail(values.email); if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("email: invalid email address.");
  const phoneRaw = values.phone == null ? "" : text(values.phone); const normalizedPhone = normalizePhone(phoneRaw); const phone = normalizedPhone;
  if (phoneRaw && !normalizedPhone) errors.push("phone: must contain digits.");
  const leadType = text(values.lead_type || "DL").toUpperCase(); if (!Object.prototype.hasOwnProperty.call(LEAD_TYPES, leadType) || !masterHas(reference, ["leadtype", "lead_type"], leadType)) errors.push("lead_type: invalid master value.");
  const stage = text(values.stage || "lead").toLowerCase(); if (!LEAD_STAGES.has(stage) || !masterHas(reference, ["stage", "leadstage"], stage)) errors.push("stage: invalid master value.");
  const permission = text(values.permission || "Pending"); if (!["Yes", "No", "Pending"].includes(permission)) errors.push("permission: must be Yes, No, or Pending.");
  const status = text(values.lead_status); if (status && !masterHas(reference, ["leadstatus", "status"], status)) errors.push("lead_status: invalid master value.");
  const psoDate = parseDate(values.pso_date, "pso_date"); if (values.pso_date && !psoDate) errors.push("pso_date: invalid date; use 23-Jan-2026, YYYY-MM-DD, or DD/MM/YYYY.");
  const nextFollowup = parseDate(values.next_follow_up_at, "next_follow_up_at"); if (values.next_follow_up_at && !nextFollowup) errors.push("next_follow_up_at: invalid date; use 23-Jan-2026, YYYY-MM-DD, or DD/MM/YYYY.");
  let ownerId = null; const owner = normalizeEmail(values.owner); if (owner) { ownerId = reference.users.get(owner)?.id || null; if (!ownerId) errors.push("owner: no active user matches that email."); }
  const rawCustom = Object.fromEntries(Object.entries(values).filter(([key]) => key.startsWith("custom:")).map(([key, value]) => [key.slice(7), value]));
  for (const [key, type] of Object.entries(SOURCE_CUSTOM_FIELDS)) {
    if (!rawCustom[key]) continue;
    if (type === "date" && !parseDate(rawCustom[key], key)) errors.push(`${key}: invalid date; use 23-Jan-2026, YYYY-MM-DD, or DD/MM/YYYY.`);
    if (type === "boolean" && !["yes", "true", "1", "no", "false", "0"].includes(text(rawCustom[key]).toLowerCase())) errors.push(`${key}: invalid boolean; use Yes or No.`);
  }
  for (const field of reference.leadFields || []) {
    if (Object.prototype.hasOwnProperty.call(SOURCE_CUSTOM_FIELDS, field.key) || !rawCustom[field.key]) continue;
    if (field.type === "date" && !parseDate(rawCustom[field.key], field.key)) errors.push(`${field.label}: invalid date; use 23-Jan-2026, YYYY-MM-DD, or DD/MM/YYYY.`);
    if (field.type === "dropdown" && !(field.options || []).some((option) => text(option).toLowerCase() === text(rawCustom[field.key]).toLowerCase())) errors.push(`${field.label}: choose one of ${Array.from(field.options || []).join(", ")}.`);
  }
  const custom_fields = { ...LeadFields.normalizeValues(Object.fromEntries(Object.entries(rawCustom).filter(([key]) => !Object.prototype.hasOwnProperty.call(SOURCE_CUSTOM_FIELDS, key))), reference.leadFields || []), ...importCustomValues(rawCustom) };
  return { rowNumber, errors, values: { name, first_name: firstName || null, last_name: lastName || null, email, phone: phone || null, cell_no_raw: phoneRaw || null, cell_no_alt: phone || null, normalizedPhone, company: text(values.company) || null, lead_type: leadType, priority: LEAD_TYPES[leadType], stage, permission, lead_status: status || null, owner_user_id: ownerId, pso_date: psoDate, next_follow_up_at: nextFollowup, city: text(values.city) || null, designation: text(values.designation) || null, lead_no: leadNo || null, source_ref: text(values.source_ref) || null, custom_fields } };
}

function classifyRows(rows, reference, fileHash, allowDuplicates) {
  const sourceHeaderIndex = rows.findIndex((row) => { const headers = new Set(row.values.map(normalizeHeader)); return headers.has("leadno") || headers.has("leadnumber"); });
  const headerIndex = sourceHeaderIndex >= 0 ? sourceHeaderIndex : 0;
  const { columns, ignored } = mapHeaders(rows[headerIndex].values, reference.leadFields);
  const mapped = rows.slice(headerIndex + 1).filter((row) => !isSheetFillerRow(row)).map((row) => rowValues(row, columns, reference, row.rowNumber));
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
    if (matches.size) { row.duplicate = true; row.duplicateReason = `existing lead match by ${[...matches].join(" and ")}`; }
  }
  const ready = mapped.filter((row) => row.errors.every((error) => error.startsWith("possible duplicate:")));
  const valid = ready;
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
async function template(format, leadFields = LeadFields.DEFAULT_FIELDS) {
  const activeFields = leadFields.filter((field) => field.active !== false && !isCoreLeadHeader(field));
  const headers = [...TEMPLATE_CORE_HEADERS, ...activeFields.map((field) => field.label)];
  const sampleByHeader = { "Lead No": "SAMPLE-001", "First Name": "Sample", "Last Name": "Lead", "Company Name": "Sample Company", "Cell No": "0000000001", "Email ID": "sample1@example.test", "Designation": "Sample Role" };
  const sample = headers.map((header) => sampleByHeader[header] || activeFields.find((field) => field.label === header && field.type === "dropdown")?.options?.[0] || "");
  if (format === "csv") return { body: Buffer.from([headers, sample].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n", "utf8"), contentType: "text/csv; charset=utf-8", filename: "altus-leads-sample.csv" };
  if (format !== "xlsx") throw new ImportError("Template format must be xlsx or csv.");
  const workbook = new ExcelJS.Workbook();
  const leads = workbook.addWorksheet("Leads");
  leads.addRow(headers);
  for (const values of [sample]) {
    const row = leads.addRow(values);
    row.getCell(headers.indexOf("Cell No") + 1).numFmt = "@";
    row.getCell(headers.indexOf("Cell No") + 1).value = String(values[headers.indexOf("Cell No")]);
  }
  const instructions = workbook.addWorksheet("Instructions");
  ["Replace the example rows with your own leads (or keep them to test).", "Lead No is required; every other cell may be blank.", "Keep every active Lead Field column from the sample, even when a row has no value.", "Dates accept 23-Jan-2026, 2026-01-23, and DD/MM/YYYY (day first).", ...activeFields.filter((field) => field.type === "dropdown").map((field) => `${field.label} options: ${(field.options || []).join(", ")}`), "Maximum 5000 rows and 5 MB."] .forEach((line) => instructions.addRow([line]));
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

function mergeText(value) { return String(value ?? "").trim(); }
function mergeKey(value) { return mergeText(value).toLowerCase(); }
function filled(value) { return mergeText(value) !== ""; }
function sameValue(left, right) { return mergeKey(left) === mergeKey(right); }
const MERGE_FLAGS = new Set(["invite_sent_by_introducer", "introducer_call_done", "intro_video_sent", "email_sent", "whatsapp_message_sent"]);
const CORE_MERGE_FIELDS = ["name", "first_name", "last_name", "email", "phone", "cell_no_raw", "cell_no_alt", "company", "designation", "lead_no"];

async function findMergeLead(tx, values, sourceId) {
  if (filled(values.lead_no)) {
    const byLeadNo = await tx.query("SELECT * FROM leads WHERE lead_no=$1 LIMIT 1", [values.lead_no]);
    if (byLeadNo.rows[0]) return byLeadNo.rows[0];
  }
  const phone = comparablePhone(values.phone);
  if (phone) {
    const byPhone = await tx.query("SELECT * FROM leads WHERE $1 IN (regexp_replace(COALESCE(phone,''),'\\D','','g'), regexp_replace(COALESCE(alternate_phone,''),'\\D','','g'), regexp_replace(COALESCE(cell_no_alt,''),'\\D','','g')) LIMIT 1", [phone]);
    if (byPhone.rows[0]) return byPhone.rows[0];
  }
  const bySource = await tx.query("SELECT * FROM leads WHERE source_id=$1 LIMIT 1", [sourceId]);
  if (bySource.rows[0]) return bySource.rows[0];
  return null;
}

async function writeMergeLog(tx, uploadId, leadNo, field, oldValue, newValue, counters) {
  await tx.query("INSERT INTO merge_log(id,lead_no,field,old_value,new_value,upload_id) VALUES($1,$2,$3,$4,$5,$6)", [`merge-log-${uploadId}-${crypto.randomUUID()}`, leadNo || null, field, oldValue == null ? null : String(oldValue), String(newValue), uploadId]);
  counters.fields_filled += 1;
}

async function writeConflict(tx, uploadId, leadNo, field, existingValue, incomingValue, counters) {
  await tx.query("INSERT INTO merge_conflicts(id,lead_no,field,existing_value,incoming_value,upload_id) VALUES($1,$2,$3,$4,$5,$6)", [`merge-conflict-${uploadId}-${crypto.randomUUID()}`, leadNo || null, field, String(existingValue), String(incomingValue), uploadId]);
  counters.conflicts_needing_review += 1;
}

async function mergeLead(tx, lead, row, uploadId, counters) {
  const values = row.values; const updates = {}; const custom = { ...(lead.custom_values || {}) }; const currentCustom = { ...(custom.lead_fields || {}) };
  for (const field of CORE_MERGE_FIELDS) {
    const incoming = values[field]; if (!filled(incoming)) continue;
    const existing = lead[field]; if (!filled(existing)) { updates[field] = incoming; await writeMergeLog(tx, uploadId, values.lead_no, field, existing, incoming, counters); }
    else if (!sameValue(existing, incoming)) await writeConflict(tx, uploadId, values.lead_no, field, existing, incoming, counters);
  }
  for (const [field, rawIncoming] of Object.entries(values.custom_fields || {})) {
    const incoming = rawIncoming === true ? "Yes" : rawIncoming === false ? "No" : rawIncoming; if (!filled(incoming)) continue;
    const existing = currentCustom[field];
    if (MERGE_FLAGS.has(field)) {
      if (mergeKey(incoming) === "yes" && mergeKey(existing) !== "yes") { currentCustom[field] = true; await writeMergeLog(tx, uploadId, values.lead_no, field, existing, true, counters); }
      continue;
    }
    if (!filled(existing)) { currentCustom[field] = rawIncoming; await writeMergeLog(tx, uploadId, values.lead_no, field, existing, rawIncoming, counters); }
    else if (field === "extra_notes" && !sameValue(existing, incoming) && !mergeKey(existing).includes(mergeKey(incoming))) { currentCustom[field] = `${existing}\n${incoming}`; await writeMergeLog(tx, uploadId, values.lead_no, field, existing, currentCustom[field], counters); }
    else if (!sameValue(existing, incoming)) await writeConflict(tx, uploadId, values.lead_no, field, existing, incoming, counters);
  }
  if (Object.keys(currentCustom).length) custom.lead_fields = currentCustom;
  const changed = Object.keys(updates).length > 0 || JSON.stringify(custom) !== JSON.stringify(lead.custom_values || {});
  if (!changed) { counters.unchanged_leads += 1; return lead; }
  const merged = { ...lead, ...updates, custom_values: custom };
  await tx.query("UPDATE leads SET name=$2,first_name=$3,last_name=$4,email=$5,phone=$6,company=$7,designation=$8,lead_no=$9,custom_values=$10,updated_at=now() WHERE id=$1", [lead.id, merged.name, merged.first_name, merged.last_name, merged.email, merged.phone, merged.company, merged.designation, merged.lead_no, JSON.stringify(custom)]);
  if (Object.prototype.hasOwnProperty.call(updates, "cell_no_raw") || Object.prototype.hasOwnProperty.call(updates, "cell_no_alt")) await tx.query("UPDATE leads SET cell_no_raw=COALESCE(cell_no_raw,$2),cell_no_alt=COALESCE(cell_no_alt,$3) WHERE id=$1", [lead.id, merged.cell_no_raw || null, merged.cell_no_alt || null]);
  counters.existing_leads_updated += 1; return merged;
}

async function mergeCall(tx, lead, row, uploadId, counters) {
  const custom = row.values.custom_fields || {}; const calledOn = mergeText(custom.last_called_on); const resolution = mergeText(custom.calling_resolution); const remarks = mergeText(custom.calling_remarks); const nextCallOn = mergeText(custom.next_call_on);
  const introVideoSent = custom.intro_video_sent === true; const emailSent = custom.email_sent === true; const whatsappMessageSent = custom.whatsapp_message_sent === true;
  if (!calledOn && !resolution && !remarks && !nextCallOn && !introVideoSent && !emailSent && !whatsappMessageSent) return;
  const exact = await tx.query("SELECT * FROM call_log WHERE lead_id=$1 AND lower(trim(COALESCE(called_on,'')))=lower(trim($2)) AND lower(trim(COALESCE(resolution,'')))=lower(trim($3)) AND lower(trim(COALESCE(remarks,'')))=lower(trim($4)) LIMIT 1", [lead.id, calledOn, resolution, remarks]);
  if (exact.rows[0]) { if (introVideoSent || emailSent || whatsappMessageSent) await tx.query("UPDATE call_log SET intro_video_sent=intro_video_sent OR $2,email_sent=email_sent OR $3,whatsapp_message_sent=whatsapp_message_sent OR $4 WHERE id=$1", [exact.rows[0].id, introVideoSent, emailSent, whatsappMessageSent]); counters.call_log_rows_skipped_duplicates += 1; return; }
  const partial = await tx.query("SELECT * FROM call_log WHERE lead_id=$1 AND lower(trim(COALESCE(called_on,'')))=lower(trim($2)) AND lower(trim(COALESCE(resolution,'')))=lower(trim($3)) ORDER BY sequence_number DESC LIMIT 1", [lead.id, calledOn, resolution]);
  if (partial.rows[0] && ((!partial.rows[0].remarks && remarks) || (!partial.rows[0].next_call_on && nextCallOn) || introVideoSent || emailSent || whatsappMessageSent)) {
    await tx.query("UPDATE call_log SET remarks=COALESCE(NULLIF(remarks,''),$2),next_call_on=COALESCE(NULLIF(next_call_on,''),$3),intro_video_sent=intro_video_sent OR $4,email_sent=email_sent OR $5,whatsapp_message_sent=whatsapp_message_sent OR $6 WHERE id=$1", [partial.rows[0].id, remarks || null, nextCallOn || null, introVideoSent, emailSent, whatsappMessageSent]); counters.call_log_rows_filled += 1; return;
  }
  const sequence = Number((await tx.query("SELECT COALESCE(MAX(sequence_number),0)+1 AS next FROM call_log WHERE lead_id=$1", [lead.id])).rows[0]?.next || 1);
  await tx.query("INSERT INTO call_log(id,lead_id,lead_no,sequence_number,called_on,resolution,remarks,next_call_on,intro_video_sent,email_sent,whatsapp_message_sent,upload_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)", [`call-${uploadId}-${lead.id}-${sequence}`, lead.id, lead.lead_no || row.values.lead_no || null, sequence, calledOn || null, resolution || null, remarks || null, nextCallOn || null, introVideoSent, emailSent, whatsappMessageSent, uploadId]);
  counters.call_log_rows_added += 1;
}

async function preview(req, db) {
  const buffer = await readUpload(req); const filename = String(req.headers["x-altus-filename"] || "upload.csv"); const analysis = await analyzeUpload(buffer, filename, db, { allowDuplicates: req.headers["x-altus-allow-duplicates"] === "1" }); return publicAnalysis(analysis);
}

async function apply(req, db, actor) {
  const buffer = await readUpload(req); const filename = String(req.headers["x-altus-filename"] || "upload.csv"); const expected = String(req.headers["x-altus-file-hash"] || "").trim().toLowerCase(); const analysis = await analyzeUpload(buffer, filename, db, { allowDuplicates: req.headers["x-altus-allow-duplicates"] === "1" });
  if (!expected || expected !== analysis.fileHash) throw new ImportError("The file hash does not match the previewed file.");
  if (analysis.errors.length) throw Object.assign(new ImportError("The file still contains row errors. Fix them before applying."), { analysis: publicAnalysis(analysis) });
  await assertApplyMigration(db);
  const runId = `upload-run-${crypto.randomUUID()}`; const counts = { total_rows: analysis.mapped.length, new_leads_created: 0, existing_leads_updated: 0, fields_filled: 0, call_log_rows_added: 0, call_log_rows_filled: 0, call_log_rows_skipped_duplicates: 0, conflicts_needing_review: 0, unchanged_leads: 0, skipped_errors: 0, errors: [] };
  try {
    await db.transaction(async (tx) => {
      await tx.query("INSERT INTO uploads(upload_id,filename,uploaded_by) VALUES($1,$2,$3)", [runId, filename, actor.id]);
      await tx.query("INSERT INTO import_runs(id,source,mode,checksum,file_hash,actor_user_id,status,report) VALUES($1,'leads-upload','apply',$2,$2,$3,'running',$4::jsonb)", [runId, analysis.fileHash, actor.id, JSON.stringify({ total_rows: counts.total_rows })]);
      for (const row of analysis.ready) {
        const existing = await findMergeLead(tx, row.values, row.sourceId);
        if (existing) { await mergeLead(tx, existing, row, runId, counts); await mergeCall(tx, existing, row, runId, counts); continue; }
        const leadId = `lead-upload-${analysis.fileHash}-${row.rowNumber}`;
        const customValues = { ...(row.values.source_ref ? { source_ref: row.values.source_ref } : {}), ...(Object.keys(row.values.custom_fields || {}).length ? { lead_fields: row.values.custom_fields } : {}) };
        const inserted = await tx.query("INSERT INTO leads(id,source_id,name,first_name,last_name,email,phone,company,designation,city,lead_no,lead_type,priority,stage,permission,lead_status,owner_user_id,pso_date,next_follow_up_at,custom_values,legacy_finance,current_status,last_called_on,last_resolution,next_call_on,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,'{}'::jsonb,NULL,NULL,NULL,NULL,now()) ON CONFLICT(source_id) DO NOTHING RETURNING id", [leadId, row.sourceId, row.values.name, row.values.first_name, row.values.last_name, row.values.email, row.values.phone, row.values.company, row.values.designation, row.values.city, row.values.lead_no, row.values.lead_type, row.values.priority, row.values.stage, row.values.permission, row.values.lead_status, row.values.owner_user_id, row.values.pso_date, row.values.next_follow_up_at, JSON.stringify(customValues)]);
        if (!inserted.rows[0]) { counts.unchanged_leads += 1; continue; }
        counts.new_leads_created += 1;
        await tx.query("UPDATE leads SET cell_no_raw=$2,cell_no_alt=$3 WHERE id=$1", [leadId, row.values.cell_no_raw, row.values.cell_no_alt]);
        for (const [field, value] of Object.entries({ ...row.values, ...row.values.custom_fields })) if (filled(value)) await writeMergeLog(tx, runId, row.values.lead_no, field, null, value, counts);
        await tx.query("INSERT INTO lead_history(id,source_id,lead_id,occurred_at,actor_id,action,entity,entity_id,note,custom_values,source_checksum,import_run_id) VALUES($1,$2,$3,now(),$4,'lead.imported','lead',$3,NULL,'{}'::jsonb,$5,$6)", [`upload-history-${analysis.fileHash}-${row.rowNumber}`, `upload-history:${analysis.fileHash}:${row.rowNumber}`, leadId, actor.id, analysis.fileHash, runId]);
        await mergeCall(tx, { id: leadId, lead_no: row.values.lead_no, custom_values: {} }, row, runId, counts);
      }
      await tx.query("UPDATE import_runs SET status='completed',completed_at=now(),report=$2::jsonb WHERE id=$1", [runId, JSON.stringify(counts)]);
      await writeAudit(tx, { actorUserId: actor.id, action: "leads.imported", entityType: "import_run", entityId: runId, newValue: JSON.stringify({ created: counts.created, skipped_duplicates: counts.skipped_duplicates, skipped_errors: counts.skipped_errors }), ip: req.socket.remoteAddress });
    });
  } catch { throw new ImportError("The lead import could not be completed; no rows were written.", 500); }
  return { import_run_id: runId, upload_id: runId, created: counts.new_leads_created, skipped_duplicates: counts.call_log_rows_skipped_duplicates, ...counts };
}

module.exports = { MAX_FILE_BYTES, MAX_ROWS, MAX_COLUMNS, MAX_CELL_LENGTH, parseCsv, parseFile, parseXlsx, analyzeUpload, publicAnalysis, preview, apply, template, normalizePhone, comparablePhone, normalizeEmail, mapHeaders, excelCellValue, TEMPLATE_CORE_HEADERS };
