const test = require("node:test");
const assert = require("node:assert/strict");
const { Readable } = require("node:stream");
const ExcelJS = require("exceljs");
const { analyzeUpload, parseCsv, apply, excelCellValue, template, TEMPLATE_HEADERS, TEMPLATE_ROWS, publicAnalysis, comparablePhone } = require("../server/lead-import.cjs");
const { route } = require("../server/index.cjs");

function referenceDb({ leads = [], users = [{ id: "owner-1", email: "owner@example.test" }], masters = [], columns = ["file_hash", "actor_user_id"] } = {}) {
  return { query: async (sql) => sql.includes("information_schema.columns") ? { rows: columns.map((column_name) => ({ column_name })) } : sql.includes("master_values") ? { rows: masters } : sql.includes("FROM users") ? { rows: users } : sql.includes("FROM leads") ? { rows: leads } : { rows: [] } };
}

function csvRequest(buffer, filename, headers = {}) {
  const request = Readable.from([buffer]); request.method = "POST"; request.url = "/api/leads/import/preview"; request.headers = { "x-altus": "1", "x-altus-filename": filename, ...headers }; request.socket = { remoteAddress: "127.0.0.1", encrypted: false }; return request;
}
function response() { return { status: 0, headers: {}, body: "", setHeader(name, value) { this.headers[name] = value; }, writeHead(status, headers) { this.status = status; Object.assign(this.headers, headers); }, end(body) { this.body = String(body || ""); } }; }
function routeDb(actor, options = {}) { const base = referenceDb(options); return { ...base, sessionUser: async () => actor.id, userById: async () => actor }; }
async function withDatabaseTarget(value, callback) { const previous = process.env.CRM_PG_URL; process.env.CRM_PG_URL = value; try { return await callback(); } finally { if (previous === undefined) delete process.env.CRM_PG_URL; else process.env.CRM_PG_URL = previous; } }
function sourceRow(overrides = {}) { const row = [...TEMPLATE_ROWS[0]]; for (const [header, value] of Object.entries(overrides)) row[TEMPLATE_HEADERS.indexOf(header)] = value; return row; }

test("CSV parser handles BOM, quoted commas, quoted newlines, and trims cells", () => {
  const rows = parseCsv(Buffer.from("\uFEFF name ,email\r\n\" Example, Person \" , person@example.test\n\"Line one\nLine two\",two@example.test\n", "utf8"));
  assert.deepEqual(rows, [["name", "email"], ["Example, Person", "person@example.test"], ["Line one\nLine two", "two@example.test"]]);
});

test("bulk upload accepts the workbook metadata rows and all source columns", async () => {
  const headers = ["Lead No", "Lead Acquisition Date", "First Name", "Last Name", "Company Name", "Cell No", "Email ID", "Designation", "Business Category", "Nature of Business", "Proposed Solution", "Invite Sent by Introducer", "Invite Date Sent", "Introducer Call Done", "Introducer Call Date", "Introducer Feedback", "Introducer Name", "Employee Name", "Association/Network Name", "Chapter Name", "Extra Notes", "Last Called On", "Calling Resolution", "Next Call On", "Calling Remarks", "2 Mins Intro Video Sent", "Email Sent", "Msg sent on Whatsapp"];
  const row = ["L-TEST-001", "7-Sep-2026", "Test", "Lead", "Test Company", "9820000000", "test@example.test", "Founder", "Retail", "Services", "PSO", "Yes", "07/09/2026", "No", "08/09/2026", "Feedback", "Introducer", "Employee", "Network", "Chapter", "Notes", "7-Sep-2026", "Ringing", "10-Sep-2026", "Remarks", "Yes", "No", "Yes"];
  const csv = ["Updated On :-,13-Oct-2026", "", "DD,Auto,Auto", headers.join(","), row.join(",")].join("\n");
  const analysis = await analyzeUpload(Buffer.from(csv), "workbook.csv", referenceDb());
  assert.equal(analysis.errors.length, 0);
  assert.equal(analysis.valid.length, 1);
  assert.equal(analysis.valid[0].values.email, "test@example.test");
  assert.equal(analysis.valid[0].values.phone, "9820000000");
  assert.equal(analysis.valid[0].values.custom_fields.lead_acquisition_date, "2026-09-07");
  assert.equal(analysis.valid[0].values.custom_fields.calling_resolution, "Ringing");
  assert.equal(analysis.valid[0].values.custom_fields.whatsapp_message_sent, true);
});

test("bulk upload apply persists source columns in the leads row", async () => {
  const row = sourceRow({ "Lead No": "DB-TEST-001", "First Name": "Database", "Last Name": "Fixture", "Cell No": "9820000001", "Email ID": "database@example.test" });
  const file = Buffer.from([TEMPLATE_HEADERS, row].map((values) => values.map((value) => String(value ?? "")).join(",")).join("\n"));
  const db = referenceDb(); let leadParams;
  db.transaction = async (work) => work({ query: async (sql, params) => { if (sql.includes("INSERT INTO leads")) { leadParams = params; return { rows: [{ id: "lead-db-test" }] }; } return { rows: [] }; } });
  const analysis = await analyzeUpload(file, "database.csv", db); const request = csvRequest(file, "database.csv", { "x-altus-file-hash": analysis.fileHash }); request.url = "/api/leads/import/apply";
  const result = await apply(request, db, { id: "owner" }); assert.equal(result.created, 1); assert.ok(leadParams);
  assert.equal(leadParams[2], "Database Fixture"); assert.equal(leadParams[3], "Database"); assert.equal(leadParams[4], "Fixture"); assert.equal(leadParams[5], "database@example.test"); assert.equal(leadParams[6], "9820000001"); assert.equal(leadParams[10], "DB-TEST-001");
  const storedCustom = JSON.parse(leadParams[19]); assert.equal(storedCustom.lead_fields.lead_acquisition_date, "2026-01-15"); assert.equal(storedCustom.lead_fields.business_category, "Business"); assert.equal(storedCustom.lead_fields.employee_name, "Sample Employee"); assert.equal(storedCustom.lead_fields.whatsapp_message_sent, true);
});

test("invalid UTF-8 is rejected clearly", () => assert.throws(() => parseCsv(Buffer.from([0xff, 0xfe, 0x6e, 0x61, 0x6d, 0x65])), /valid UTF-8/));

test("file, row, column, and cell limits are enforced", async () => {
  await assert.rejects(() => analyzeUpload(Buffer.alloc(5 * 1024 * 1024 + 1), "too-large.csv", referenceDb()), /5 MB/);
  const tooManyRows = Buffer.from(["Lead No", ...Array.from({ length: 5001 }, (_, index) => `Row ${index}`)].join("\n")); await assert.rejects(() => analyzeUpload(tooManyRows, "too-many.csv", referenceDb()), /5000/);
  await assert.rejects(() => analyzeUpload(Buffer.from(`Lead No\n${"x".repeat(2001)}\n`), "too-long.csv", referenceDb()), /2000/);
  await assert.rejects(() => analyzeUpload(Buffer.from(`Lead No,${Array.from({ length: 50 }, (_, index) => `c${index}`).join(",")}\nFixture\n`), "too-many-columns.csv", referenceDb()), /50-column/);
});

test("XLSX preview reads Leads, ignores Instructions, preserves text phone, and rejects multiple data sheets", async () => {
  const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet("Leads"); sheet.addRow(["Lead No", "Stage"]); sheet.addRow(["EXCEL-001", "lead"]); const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const analysis = await analyzeUpload(buffer, "fixture.xlsx", referenceDb()); assert.equal(analysis.valid.length, 1); assert.equal(analysis.valid[0].values.name, "EXCEL-001");
  assert.match(excelCellValue({ value: { formula: "A3" } }).error, /Formula cell has no cached value/);
  const fixture = await template("xlsx"); const sampleBook = new ExcelJS.Workbook(); await sampleBook.xlsx.load(fixture.body); assert.deepEqual(sampleBook.worksheets.map((item) => item.name), ["Leads", "Instructions"]); assert.equal(typeof sampleBook.getWorksheet("Leads").getCell(2, 3).value, "string"); assert.equal(sampleBook.getWorksheet("Leads").getCell(2, 6).numFmt, "@"); const sampleAnalysis = await analyzeUpload(fixture.body, "sample.xlsx", referenceDb()); assert.equal(sampleAnalysis.valid.length, 1); assert.equal(sampleAnalysis.errors.length, 0); assert.deepEqual({ valid: publicAnalysis(sampleAnalysis).valid, errors: publicAnalysis(sampleAnalysis).errors, duplicates: publicAnalysis(sampleAnalysis).possible_duplicates }, { valid: 1, errors: 0, duplicates: 0 });
  const multi = new ExcelJS.Workbook(); multi.addWorksheet("One").addRow(["Name", "One"]); multi.addWorksheet("Two").addRow(["Name", "Two"]); const multiBuffer = Buffer.from(await multi.xlsx.writeBuffer()); await assert.rejects(() => analyzeUpload(multiBuffer, "multi.xlsx", referenceDb()), /more than one used sheet/);
});

test("XLSX hyperlink and rich-text cells convert to ordinary sample values", async () => {
  const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet("Leads"); sheet.addRow(TEMPLATE_HEADERS); for (let i = 1; i <= 3; i += 1) sheet.addRow(sourceRow({ "Lead No": `RICH-${i}`, "First Name": "Sample", "Last Name": `Rich ${i}`, "Email ID": { text: `rich${i}@example.test`, hyperlink: `mailto:rich${i}@example.test` }, "Cell No": `000000000${i}` })); sheet.getCell(2, 3).value = { richText: [{ text: "Sample " }, { text: "Rich 1" }] }; const buffer = Buffer.from(await workbook.xlsx.writeBuffer()); const analysis = await analyzeUpload(buffer, "rich.xlsx", referenceDb()); assert.equal(analysis.valid.length, 3); assert.equal(analysis.errors.length, 0);
});

test("unsupported XLSX cell content becomes a column error, never object text", async () => {
  assert.deepEqual(excelCellValue({ value: { unsupported: true } }, 2), { error: "unsupported cell content in column 2" }); const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet("Leads"); sheet.addRow(TEMPLATE_HEADERS); const row = sheet.addRow(sourceRow({ "Lead No": "UNSUPPORTED-1", "Email ID": "unsupported@example.test", "Cell No": "9876543210" })); row.getCell(7).value = { unsupported: true }; const buffer = Buffer.from(await workbook.xlsx.writeBuffer()); const analysis = await analyzeUpload(buffer, "unsupported.xlsx", referenceDb()); assert.equal(analysis.errors.length, 1); assert.doesNotMatch(JSON.stringify(analysis), /\[object Object\]/);
});

test("short, placeholder, and real full-length phones use the intended duplicate rule", async () => {
  assert.equal(comparablePhone("12345"), null); assert.equal(comparablePhone("0000000001"), null); assert.equal(comparablePhone("9876543210"), "9876543210"); const data = Buffer.from([TEMPLATE_HEADERS, sourceRow({ "Lead No": "S-1", "Last Name": "Short", "Email ID": "s1@example.test", "Cell No": "12345" }), sourceRow({ "Lead No": "S-2", "Last Name": "Placeholder", "Email ID": "s2@example.test", "Cell No": "0000000001" }), sourceRow({ "Lead No": "S-3", "Last Name": "Real", "Email ID": "s3@example.test", "Cell No": "9876543210" })].map((row) => row.map((value) => String(value ?? "")).join(",")).join("\n")); const analysis = await analyzeUpload(data, "phones.csv", referenceDb({ leads: [{ id: "real", phone: "9876543210" }, { id: "placeholder", phone: "0000000001" }, { id: "short", phone: "12345" }] })); assert.equal(analysis.mapped[0].duplicate, undefined); assert.equal(analysis.mapped[1].duplicate, undefined); assert.equal(analysis.mapped[2].duplicate, true);
});

test("template CSV has the accepted headers and all sample rows are valid", async () => {
  const file = await template("csv"); const lines = file.body.toString("utf8").trim().split("\n"); assert.deepEqual(lines[0].split(",").map((value) => value.replace(/\r$/, "")), TEMPLATE_HEADERS); assert.equal(lines.length, 2); const analysis = await analyzeUpload(file.body, "sample.csv", referenceDb()); assert.equal(analysis.valid.length, 1); assert.equal(analysis.errors.length, 0);
  const mixed = Buffer.from([TEMPLATE_HEADERS, sourceRow({ "Lead No": "SAMPLE-001", "Last Name": "Test", "Email ID": "sample@example.test", "Cell No": "9000000000" }), sourceRow({ "Lead No": "REAL-001", "Last Name": "Real", "Email ID": "real@example.test", "Cell No": "9000000004" })].map((row) => row.map((value) => String(value ?? "")).join(",")).join("\n")); const mixedAnalysis = await analyzeUpload(mixed, "mixed.csv", referenceDb()); assert.equal(mixedAnalysis.valid.length, 2); assert.equal(mixedAnalysis.errors.length, 0);
});

test("templates are fixed dummy data and isolated from database rows", async () => {
  const calls = [];
  const throwingDb = { query: async (sql) => { calls.push(sql); if (sql.includes("master_values")) return { rows: [{ master_type: "lead_type", code: "REAL_ONLY" }] }; throw new Error("customer-table query attempted"); }, sessionUser: async () => "owner", userById: async () => ({ id: "owner", role: "Owner" }) };
  const otherDb = { query: async () => { throw new Error("any query attempted"); }, sessionUser: async () => "owner", userById: async () => ({ id: "owner", role: "Owner" }) };
  const first = await template("csv"); const second = await template("csv"); assert.deepEqual(first.body, second.body); assert.equal(calls.length, 0);
  const firstRows = parseCsv(first.body); for (const row of firstRows.slice(1)) { assert.match(row[0], /^SAMPLE-00\d$/); assert.match(row[6], /@example\.test$/); assert.match(row[2], /^Sample$/); assert.match(row[5], /^000000000\d$/); }
  const responseA = response(); await route({ method: "GET", url: "/api/leads/import/template?format=csv", headers: {}, socket: { remoteAddress: "127.0.0.1" } }, responseA, throwingDb); const responseB = response(); await route({ method: "GET", url: "/api/leads/import/template?format=csv", headers: {}, socket: { remoteAddress: "127.0.0.1" } }, responseB, otherDb); assert.equal(responseA.status, 200); assert.equal(responseB.status, 200); assert.equal(responseA.body, responseB.body);
});

test("unchanged sample files validate and apply the example row; duplicates remain idempotent", async () => {
  for (const [format, filename] of [["csv", "sample.csv"], ["xlsx", "sample.xlsx"]]) {
    const file = await template(format); const db = referenceDb(); let leadInserts = 0; db.transaction = async (work) => work({ query: async (sql) => { if (sql.includes("INSERT INTO leads")) { leadInserts += 1; return { rows: [{ id: `lead-${leadInserts}` }] }; } return { rows: [] }; } }); const analysis = await analyzeUpload(file.body, filename, db); assert.equal(analysis.valid.length, 1); assert.equal(analysis.errors.length, 0); const request = csvRequest(file.body, filename, { "x-altus-file-hash": analysis.fileHash }); request.url = "/api/leads/import/apply"; const result = await apply(request, db, { id: "owner" }); assert.equal(result.created, 1); assert.equal(leadInserts, 1);
    const duplicateLeads = analysis.valid.map((row) => ({ id: `existing-${row.rowNumber}`, source_id: row.sourceId, phone: row.values.phone, email: row.values.email })); const duplicateDb = referenceDb({ leads: duplicateLeads }); const duplicateAnalysis = await analyzeUpload(file.body, filename, duplicateDb); assert.equal(duplicateAnalysis.valid.length, 1); assert.equal(duplicateAnalysis.errors.length, 0); assert.equal(duplicateAnalysis.mapped.filter((row) => row.duplicate).length, 1);
    const allowDb = referenceDb({ leads: duplicateLeads }); let allowedInserts = 0; allowDb.transaction = async (work) => work({ query: async (sql) => { if (sql.includes("INSERT INTO leads")) { allowedInserts += 1; return { rows: [{ id: `allowed-${allowedInserts}` }] }; } return { rows: [] }; } }); const allowAnalysis = await analyzeUpload(file.body, filename, allowDb, { allowDuplicates: true }); assert.equal(allowAnalysis.valid.length, 1); const allowRequest = csvRequest(file.body, filename, { "x-altus-file-hash": allowAnalysis.fileHash, "x-altus-allow-duplicates": "1" }); allowRequest.url = "/api/leads/import/apply"; const allowed = await apply(allowRequest, allowDb, { id: "owner" }); assert.equal(allowed.created, 1); assert.equal(allowedInserts, 1);
  }
});

test("import validation reports required name, master values, dates, and duplicates", async () => {
  const data = "Lead No,phone,email,stage,pso_date\nGOOD-001, +91 9000000000,good@example.test,lead,15/01/2026\nMATCH-001,,old@example.test,lead,2026-01-15\nBAD-001,,bad@example.test,not-a-stage,31/02/2026\nREPEAT-001,+91 9000000000,repeat@example.test,lead,2026-01-15\n";
  const analysis = await analyzeUpload(Buffer.from(data), "fixture.csv", referenceDb({ leads: [{ id: "existing", phone: "9000000000", email: "old@example.test" }] }));
  assert.equal(analysis.fileHash.length, 64); assert.equal(analysis.errors.length, 1); assert.equal(analysis.mapped.some((row) => row.errors.length > 0), true); assert.equal(analysis.mapped.some((row) => row.duplicate), true); assert.equal(analysis.mapped.some((row) => row.sourceId === `upload:${analysis.fileHash}:2`), true);
  await assert.rejects(() => analyzeUpload(Buffer.from("Email\nempty@example.test\n"), "missing.csv", referenceDb()), /Lead No/);
});

test("same file hash and row number produce the same idempotent source_id", async () => {
  const data = Buffer.from("Lead No,email\nIDEMP-OLD,idem@example.test\n"); const first = await analyzeUpload(data, "same.csv", referenceDb()); const second = await analyzeUpload(data, "same.csv", referenceDb({ leads: [{ id: "already", source_id: first.valid[0].sourceId }] })); assert.equal(first.valid[0].sourceId, second.mapped[0].sourceId); assert.equal(second.mapped[0].duplicate, true);
});

test("Sales can preview and apply while a role without lead edit cannot", async () => {
  const previous = process.env.ALLOW_SUPABASE_WRITE; process.env.ALLOW_SUPABASE_WRITE = "1";
  try {
    const file = Buffer.from("name\nFixture\n"); const salesDb = routeDb({ id: "sales", role: "Sales" }); salesDb.transaction = async (work) => work({ query: async (sql) => ({ rows: sql.includes("RETURNING id") ? [{ id: "lead" }] : [] }) }); const analysis = await analyzeUpload(file, "fixture.csv", salesDb); const applyRequest = csvRequest(file, "fixture.csv", { "x-altus-file-hash": analysis.fileHash }); applyRequest.url = "/api/leads/import/apply"; const applied = response(); await withDatabaseTarget("postgresql://fixture@127.0.0.1:5435/crm_dev", async () => { await route(applyRequest, applied, salesDb); }); assert.equal(applied.status, 200);
    const deniedRequest = csvRequest(file, "fixture.csv"); deniedRequest.url = "/api/leads/import/preview"; const denied = response(); await route(deniedRequest, denied, routeDb({ id: "viewer", role: "Viewer" })); assert.equal(denied.status, 403);
  } finally { if (previous === undefined) delete process.env.ALLOW_SUPABASE_WRITE; else process.env.ALLOW_SUPABASE_WRITE = previous; }
  const ownerRequest = csvRequest(Buffer.from("name\nFixture\n"), "fixture.csv"); const ownerRes = response(); await route(ownerRequest, ownerRes, routeDb({ id: "owner", role: "Owner" })); assert.equal(ownerRes.status, 200); assert.equal(JSON.parse(ownerRes.body).valid, 1);
  const adminRequest = csvRequest(Buffer.from("name\nFixture\n"), "fixture.csv"); const adminRes = response(); await route(adminRequest, adminRes, routeDb({ id: "admin", role: "Admin" })); assert.equal(adminRes.status, 200);
});

test("template route requires leads.import", async () => {
  const denied = response(); const request = { method: "GET", url: "/api/leads/import/template?format=csv", headers: {}, socket: { remoteAddress: "127.0.0.1" } }; await route(request, denied, routeDb({ id: "viewer", role: "Viewer" })); assert.equal(denied.status, 403);
});

test("Supabase apply is blocked without the process flag and preview remains available", async () => {
  const previous = process.env.ALLOW_SUPABASE_WRITE; delete process.env.ALLOW_SUPABASE_WRITE;
  try {
    await withDatabaseTarget("postgresql://fixture@db.fixture.supabase.co:5432/postgres", async () => {
      const applyRequest = csvRequest(Buffer.from("name\nFixture\n"), "fixture.csv"); applyRequest.url = "/api/leads/import/apply";
      const blocked = response(); const db = routeDb({ id: "owner", role: "Owner" }); await route(applyRequest, blocked, db);
      assert.equal(blocked.status, 403); assert.deepEqual(JSON.parse(blocked.body), { code: "SUPABASE_WRITE_BLOCKED", error: "Imports are blocked on this database. Start the server with ALLOW_SUPABASE_WRITE=1 for this process." });
      const previewRequest = csvRequest(Buffer.from("name\nFixture\n"), "fixture.csv"); const preview = response(); await route(previewRequest, preview, db); assert.equal(preview.status, 200);
    });
  } finally { if (previous === undefined) delete process.env.ALLOW_SUPABASE_WRITE; else process.env.ALLOW_SUPABASE_WRITE = previous; }
});

test("flagged Supabase apply and local apply are allowed by the target guard", async () => {
  const previous = process.env.ALLOW_SUPABASE_WRITE; process.env.ALLOW_SUPABASE_WRITE = "1";
  try {
    for (const target of ["postgresql://fixture@db.fixture.supabase.co:5432/postgres", "postgresql://fixture@127.0.0.1:5435/crm_dev"]) await withDatabaseTarget(target, async () => {
      const file = Buffer.from("name\nFixture\n"); const db = routeDb({ id: "owner", role: "Owner" }); db.transaction = async (work) => work({ query: async (sql) => ({ rows: sql.includes("RETURNING id") ? [{ id: "lead" }] : [] }) }); const analysis = await analyzeUpload(file, "fixture.csv", db); const request = csvRequest(file, "fixture.csv", { "x-altus-file-hash": analysis.fileHash }); request.url = "/api/leads/import/apply"; const res = response(); await route(request, res, db); assert.equal(res.status, 200);
    });
  } finally { if (previous === undefined) delete process.env.ALLOW_SUPABASE_WRITE; else process.env.ALLOW_SUPABASE_WRITE = previous; }
});

test("apply stops before any write when migration 008 columns are missing", async () => {
  const file = Buffer.from("name\nFixture\n"); const db = referenceDb({ columns: [] }); let transactionStarted = false; db.transaction = async () => { transactionStarted = true; }; const analysis = await analyzeUpload(file, "fixture.csv", db); const request = csvRequest(file, "fixture.csv", { "x-altus-file-hash": analysis.fileHash }); await assert.rejects(() => apply(request, db, { id: "owner" }), /Migration 008 has not been applied/); assert.equal(transactionStarted, false);
});

test("apply requires the preview hash and rolls back on a transaction failure", async () => {
  const file = Buffer.from("name,email\nRollback,rollback@example.test\n"); const db = referenceDb(); db.transaction = async (work) => { const tx = { query: async () => ({ rows: [] }) }; await work(tx); throw new Error("rollback fixture"); };
  const request = csvRequest(file, "fixture.csv", { "x-altus-file-hash": "wrong" }); await assert.rejects(() => apply(request, db, { id: "owner" }), /hash does not match/);
  const good = await require("../server/lead-import.cjs").analyzeUpload(file, "fixture.csv", db); const applyRequest = csvRequest(file, "fixture.csv", { "x-altus-file-hash": good.fileHash }); await assert.rejects(() => apply(applyRequest, db, { id: "owner" }), /no rows were written/);
});

test("import audit payload contains counts only, never row values", async () => {
  const file = Buffer.from("name,email\nPrivate Fixture,private@example.test\n"); const auditParams = []; const db = referenceDb(); db.transaction = async (work) => work({ query: async (sql, params) => { if (sql.includes("audit_log")) auditParams.push(params); return { rows: sql.includes("RETURNING id") ? [{ id: "lead" }] : [] }; } }); const analysis = await require("../server/lead-import.cjs").analyzeUpload(file, "fixture.csv", db); const req = csvRequest(file, "fixture.csv", { "x-altus-file-hash": analysis.fileHash }); await apply(req, db, { id: "owner" }); assert.equal(auditParams.length, 1); assert.doesNotMatch(JSON.stringify(auditParams), /Private Fixture|private@example\.test/);
});

test("new 28-column order maps all requested fields", async () => {
  const row = sourceRow({ "Lead No": "NEW-001", "Cell No": "+91 (98200) 00001", "Lead Acquisition Date": "7-Sep-2026", "Invite Date Sent": "07/09/2026", "Introducer Call Date": "2026-09-08", "Last Called On": "09/09/2026", "Next Call On": "10-Sep-2026", "2 Mins Intro Video Sent": "Yes", "Email Sent": "No", "Msg Sent on Whatsapp": "Yes" });
  const analysis = await analyzeUpload(Buffer.from([TEMPLATE_HEADERS, row].map((values) => values.map((value) => String(value ?? "")).join(",")).join("\n")), "new.csv", referenceDb());
  assert.equal(analysis.errors.length, 0); assert.equal(analysis.valid[0].values.lead_no, "NEW-001"); assert.equal(analysis.valid[0].values.phone, "919820000001");
  assert.equal(analysis.valid[0].values.custom_fields.lead_acquisition_date, "2026-09-07"); assert.equal(analysis.valid[0].values.custom_fields.next_call_on, "2026-09-10"); assert.equal(analysis.valid[0].values.custom_fields.whatsapp_message_sent, true);
});

test("old 19-column order remains supported and source_ref is retained", async () => {
  const headers = ["designation", "lead_number", "source_ref", "first_name", "last_name", "lead_acquisition_date", "business_category", "nature_of_business", "proposed_solution", "invite_sent_by_introducer", "invite_date_sent", "introducer_call_done", "introducer_call_date", "introducer_feedback", "introducer_name", "employee_name", "association_network_name", "chapter_name", "extra_notes"];
  const row = ["Founder", "OLD-001", "legacy-001", "Old", "Format", "2026-09-07", "Retail", "Services", "PSO", "No", "07/09/2026", "No", "7-Sep-2026", "Good", "Introducer", "Employee", "Network", "Chapter", "Note"];
  const analysis = await analyzeUpload(Buffer.from([headers, row].map((values) => values.join(",")).join("\n")), "old.csv", referenceDb());
  assert.equal(analysis.errors.length, 0); assert.equal(analysis.valid[0].values.lead_no, "OLD-001"); assert.equal(analysis.valid[0].values.source_ref, "legacy-001");
});

test("shuffled headers map by normalized name", async () => {
  const headers = ["Email ID", "Association/Network Name", "Lead No", "First Name", "Cell No"]; const row = ["shuffle@example.test", "Network", "SHUFFLE-001", "Shuffle", "9820000002"];
  const analysis = await analyzeUpload(Buffer.from([headers, row].map((values) => values.join(",")).join("\n")), "shuffled.csv", referenceDb());
  assert.equal(analysis.errors.length, 0); assert.equal(analysis.valid[0].values.email, "shuffle@example.test"); assert.equal(analysis.valid[0].values.custom_fields.association_network_name, "Network");
});

test("Lead No and First Name are sufficient", async () => {
  const analysis = await analyzeUpload(Buffer.from("Lead No,First Name\nMIN-001,Minimal\n"), "minimal.csv", referenceDb()); assert.equal(analysis.errors.length, 0); assert.equal(analysis.valid[0].values.name, "Minimal");
  await assert.rejects(() => analyzeUpload(Buffer.from("First Name\nMissing\n"), "missing-lead-no.csv", referenceDb()), /Lead No/);
});

test("unknown columns are ignored and reported", async () => {
  const analysis = await analyzeUpload(Buffer.from("Lead No,First Name,Tracking Extra\nIGN-001,Ignored,Value\n"), "ignored.csv", referenceDb()); assert.deepEqual(analysis.ignored, ["Tracking Extra"]); assert.deepEqual(publicAnalysis(analysis).ignored_columns, ["Tracking Extra"]); assert.equal(analysis.errors.length, 0);
});

test("template headers are exactly the requested 28 headers", async () => {
  const file = await template("csv"); assert.deepEqual(parseCsv(file.body)[0], ["Lead No", "Lead Acquisition Date", "First Name", "Last Name", "Company Name", "Cell No", "Email ID", "Designation", "Business Category", "Nature of Business", "Proposed Solution", "Invite Sent by Introducer", "Invite Date Sent", "Introducer Call Done", "Introducer Call Date", "Introducer Feedback", "Introducer Name", "Employee Name", "Association/Network Name", "Chapter Name", "Extra Notes", "Last Called On", "Calling Resolution", "Next Call On", "Calling Remarks", "2 Mins Intro Video Sent", "Email Sent", "Msg Sent on Whatsapp"]);
});

test("re-uploading a new-order file produces zero changes", async () => {
  const file = Buffer.from("Lead No,First Name\nIDEMP-001,Idempotent\n"); const state = { leads: [] }; const db = { query: async (sql) => sql.includes("information_schema.columns") ? { rows: [{ column_name: "file_hash" }, { column_name: "actor_user_id" }] } : sql.includes("master_values") ? { rows: [] } : sql.includes("FROM users") ? { rows: [{ id: "owner", email: "owner@example.test" }] } : sql.includes("FROM leads") ? { rows: state.leads } : { rows: [] }, transaction: async (work) => work({ query: async (sql, params) => { if (sql.includes("INSERT INTO leads")) { state.leads.push({ id: params[0], source_id: params[1], lead_no: params[10], name: params[2], first_name: params[3], last_name: params[4], email: params[5], phone: params[6], company: params[7], designation: params[8], custom_values: {} }); return { rows: [{ id: params[0] }] }; } if (sql.includes("SELECT * FROM leads WHERE lead_no")) return { rows: state.leads.filter((lead) => lead.lead_no === params[0]) }; if (sql.includes("SELECT * FROM leads WHERE $1 IN")) return { rows: [] }; return { rows: [] }; } }) };
  const first = await analyzeUpload(file, "idempotent.csv", db); const firstRequest = csvRequest(file, "idempotent.csv", { "x-altus-file-hash": first.fileHash }); firstRequest.url = "/api/leads/import/apply"; const firstResult = await apply(firstRequest, db, { id: "owner" }); assert.equal(firstResult.new_leads_created, 1);
  const second = await analyzeUpload(file, "idempotent.csv", db); const secondRequest = csvRequest(file, "idempotent.csv", { "x-altus-file-hash": second.fileHash }); secondRequest.url = "/api/leads/import/apply"; const secondResult = await apply(secondRequest, db, { id: "owner" }); assert.equal(secondResult.new_leads_created, 0); assert.equal(secondResult.existing_leads_updated, 0); assert.equal(secondResult.unchanged_leads, 1);
});

test("sheet metadata rows before Lead No are skipped", async () => {
  const csv = ["Updated On :-,13-Oct-2026", "", "DD,Auto,Auto", "Lead No,First Name", "META-001,Metadata"].join("\n"); const analysis = await analyzeUpload(Buffer.from(csv), "real-sheet.csv", referenceDb()); assert.equal(analysis.errors.length, 0); assert.equal(analysis.valid[0].values.lead_no, "META-001");
});

test("sheet Auto/Fill rows after Lead No are ignored", async () => {
  const csv = ["Lead No,First Name", "DD,Auto,Auto", "META-002,Metadata"].join("\n"); const analysis = await analyzeUpload(Buffer.from(csv), "autofill.csv", referenceDb()); assert.deepEqual(analysis.valid.map((row) => row.values.lead_no), ["META-002"]);
});

test("supported dates normalize and ambiguous or invalid dates are flagged", async () => {
  const good = await analyzeUpload(Buffer.from("Lead No,Lead Acquisition Date,Last Called On,Next Call On\nDATE-001,7-Sep-2026,2026-09-07,07/09/2026\n"), "dates.csv", referenceDb()); assert.equal(good.errors.length, 0); assert.equal(good.valid[0].values.custom_fields.last_called_on, "2026-09-07");
  const bad = await analyzeUpload(Buffer.from("Lead No,Lead Acquisition Date\nDATE-002,31/02/2026\n"), "bad-dates.csv", referenceDb()); assert.equal(bad.errors.length, 1); assert.match(bad.errors[0].errors[0], /invalid date/);
});
