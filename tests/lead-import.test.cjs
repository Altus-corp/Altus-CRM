const test = require("node:test");
const assert = require("node:assert/strict");
const { Readable } = require("node:stream");
const ExcelJS = require("exceljs");
const { analyzeUpload, parseCsv, apply, excelCellValue, template, TEMPLATE_HEADERS, publicAnalysis, comparablePhone } = require("../server/lead-import.cjs");
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

test("CSV parser handles BOM, quoted commas, quoted newlines, and trims cells", () => {
  const rows = parseCsv(Buffer.from("\uFEFF name ,email\r\n\" Example, Person \" , person@example.test\n\"Line one\nLine two\",two@example.test\n", "utf8"));
  assert.deepEqual(rows, [["name", "email"], ["Example, Person", "person@example.test"], ["Line one\nLine two", "two@example.test"]]);
});

test("invalid UTF-8 is rejected clearly", () => assert.throws(() => parseCsv(Buffer.from([0xff, 0xfe, 0x6e, 0x61, 0x6d, 0x65])), /valid UTF-8/));

test("file, row, column, and cell limits are enforced", async () => {
  await assert.rejects(() => analyzeUpload(Buffer.alloc(5 * 1024 * 1024 + 1), "too-large.csv", referenceDb()), /5 MB/);
  const tooManyRows = Buffer.from(["name", ...Array.from({ length: 5001 }, (_, index) => `Row ${index}`)].join("\n")); await assert.rejects(() => analyzeUpload(tooManyRows, "too-many.csv", referenceDb()), /5000/);
  await assert.rejects(() => analyzeUpload(Buffer.from(`name\n${"x".repeat(2001)}\n`), "too-long.csv", referenceDb()), /2000/);
  await assert.rejects(() => analyzeUpload(Buffer.from(`name,${Array.from({ length: 50 }, (_, index) => `c${index}`).join(",")}\nFixture\n`), "too-many-columns.csv", referenceDb()), /50-column/);
});

test("XLSX preview reads Leads, ignores Instructions, preserves text phone, and rejects multiple data sheets", async () => {
  const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet("Leads"); sheet.addRow(["Name", "Stage"]); sheet.addRow(["Excel Example", "lead"]); const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const analysis = await analyzeUpload(buffer, "fixture.xlsx", referenceDb()); assert.equal(analysis.valid.length, 1); assert.equal(analysis.valid[0].values.name, "Excel Example");
  assert.match(excelCellValue({ value: { formula: "A3" } }).error, /Formula cell has no cached value/);
  const fixture = await template("xlsx"); const sampleBook = new ExcelJS.Workbook(); await sampleBook.xlsx.load(fixture.body); assert.deepEqual(sampleBook.worksheets.map((item) => item.name), ["Leads", "Instructions"]); assert.equal(typeof sampleBook.getWorksheet("Leads").getCell(2, 3).value, "string"); assert.equal(sampleBook.getWorksheet("Leads").getCell(2, 3).numFmt, "@"); const sampleAnalysis = await analyzeUpload(fixture.body, "sample.xlsx", referenceDb()); assert.equal(sampleAnalysis.valid.length, 3); assert.equal(sampleAnalysis.errors.length, 0); assert.deepEqual({ valid: publicAnalysis(sampleAnalysis).valid, errors: publicAnalysis(sampleAnalysis).errors, duplicates: publicAnalysis(sampleAnalysis).possible_duplicates }, { valid: 3, errors: 0, duplicates: 0 });
  const multi = new ExcelJS.Workbook(); multi.addWorksheet("One").addRow(["Name", "One"]); multi.addWorksheet("Two").addRow(["Name", "Two"]); const multiBuffer = Buffer.from(await multi.xlsx.writeBuffer()); await assert.rejects(() => analyzeUpload(multiBuffer, "multi.xlsx", referenceDb()), /more than one used sheet/);
});

test("XLSX hyperlink and rich-text cells convert to ordinary sample values", async () => {
  const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet("Leads"); sheet.addRow(TEMPLATE_HEADERS); for (let i = 1; i <= 3; i += 1) sheet.addRow([`Sample Rich ${i}`, { text: `rich${i}@example.test`, hyperlink: `mailto:rich${i}@example.test` }, `000000000${i}`, "Sample Company", "DL", "lead", "Pending", "", "", "2026-01-15", "2026-01-20", "Sample City", "Sample Role", `RICH-${i}`, "SAMPLE-DELETE-ME"]); sheet.getCell(2, 1).value = { richText: [{ text: "Sample " }, { text: "Rich 1" }] }; const buffer = Buffer.from(await workbook.xlsx.writeBuffer()); const analysis = await analyzeUpload(buffer, "rich.xlsx", referenceDb()); assert.equal(analysis.valid.length, 3); assert.equal(analysis.errors.length, 0);
});

test("unsupported XLSX cell content becomes a column error, never object text", async () => {
  assert.deepEqual(excelCellValue({ value: { unsupported: true } }, 2), { error: "unsupported cell content in column 2" }); const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet("Leads"); sheet.addRow(TEMPLATE_HEADERS); const row = sheet.addRow(["Sample Unsupported", "unsupported@example.test", "9876543210", "Sample Company", "DL", "lead", "Pending", "", "", "2026-01-15", "2026-01-20", "Sample City", "Sample Role", "UNSUPPORTED-1", "SAMPLE-DELETE-ME"]); row.getCell(2).value = { unsupported: true }; const buffer = Buffer.from(await workbook.xlsx.writeBuffer()); const analysis = await analyzeUpload(buffer, "unsupported.xlsx", referenceDb()); assert.equal(analysis.errors.length, 1); assert.doesNotMatch(JSON.stringify(analysis), /\[object Object\]/);
});

test("short, placeholder, and real full-length phones use the intended duplicate rule", async () => {
  assert.equal(comparablePhone("12345"), null); assert.equal(comparablePhone("0000000001"), null); assert.equal(comparablePhone("9876543210"), "9876543210"); const data = Buffer.from(`${TEMPLATE_HEADERS.join(",")}\nSample Short,s1@example.test,12345,Sample Company,DL,lead,Pending,,,2026-01-15,2026-01-20,Sample City,Sample Role,S-1,SAMPLE-DELETE-ME\nSample Placeholder,s2@example.test,0000000001,Sample Company,DL,lead,Pending,,,2026-01-15,2026-01-20,Sample City,Sample Role,S-2,SAMPLE-DELETE-ME\nSample Real,s3@example.test,9876543210,Sample Company,DL,lead,Pending,,,2026-01-15,2026-01-20,Sample City,Sample Role,S-3,SAMPLE-DELETE-ME\n`); const analysis = await analyzeUpload(data, "phones.csv", referenceDb({ leads: [{ id: "real", phone: "9876543210" }, { id: "placeholder", phone: "0000000001" }, { id: "short", phone: "12345" }] })); assert.equal(analysis.mapped[0].duplicate, undefined); assert.equal(analysis.mapped[1].duplicate, undefined); assert.equal(analysis.mapped[2].duplicate, true);
});

test("template CSV has the accepted headers and all sample rows are valid", async () => {
  const file = await template("csv"); const lines = file.body.toString("utf8").trim().split("\n"); assert.deepEqual(lines[0].split(",").map((value) => value.replace(/\r$/, "")), TEMPLATE_HEADERS); assert.equal(lines.length, 4); const analysis = await analyzeUpload(file.body, "sample.csv", referenceDb()); assert.equal(analysis.valid.length, 3); assert.equal(analysis.errors.length, 0);
  const mixed = Buffer.from(`${TEMPLATE_HEADERS.join(",")}\nSample Lead (test),sample@example.test,9000000000,Sample Company,DL,lead,Pending,,,2026-01-15,2026-01-20,Sample City,Sample Role,SAMPLE-001,SAMPLE-DELETE-ME\nReal Lead,real@example.test,9000000004,Sample Company,DL,lead,Pending,,,2026-01-15,2026-01-20,Sample City,Sample Role,REAL-001,REAL-001\n`); const mixedAnalysis = await analyzeUpload(mixed, "mixed.csv", referenceDb()); assert.equal(mixedAnalysis.valid.length, 2); assert.equal(mixedAnalysis.errors.length, 0);
});

test("templates are fixed dummy data and isolated from database rows", async () => {
  const calls = [];
  const throwingDb = { query: async (sql) => { calls.push(sql); if (sql.includes("master_values")) return { rows: [{ master_type: "lead_type", code: "REAL_ONLY" }] }; throw new Error("customer-table query attempted"); }, sessionUser: async () => "owner", userById: async () => ({ id: "owner", role: "Owner" }) };
  const otherDb = { query: async () => { throw new Error("any query attempted"); }, sessionUser: async () => "owner", userById: async () => ({ id: "owner", role: "Owner" }) };
  const first = await template("csv"); const second = await template("csv"); assert.deepEqual(first.body, second.body); assert.equal(calls.length, 0);
  const firstRows = parseCsv(first.body); for (const row of firstRows.slice(1)) { assert.match(row[0], /Sample/); assert.match(row[1], /@example\.test$/); assert.equal(row[8], ""); assert.equal(row[14], "SAMPLE-DELETE-ME"); assert.match(row[2], /^000000000\d$/); }
  const responseA = response(); await route({ method: "GET", url: "/api/leads/import/template?format=csv", headers: {}, socket: { remoteAddress: "127.0.0.1" } }, responseA, throwingDb); const responseB = response(); await route({ method: "GET", url: "/api/leads/import/template?format=csv", headers: {}, socket: { remoteAddress: "127.0.0.1" } }, responseB, otherDb); assert.equal(responseA.status, 200); assert.equal(responseB.status, 200); assert.equal(responseA.body, responseB.body);
});

test("unchanged sample files validate and apply all three rows; duplicates remain idempotent", async () => {
  for (const [format, filename] of [["csv", "sample.csv"], ["xlsx", "sample.xlsx"]]) {
    const file = await template(format); const db = referenceDb(); let leadInserts = 0; db.transaction = async (work) => work({ query: async (sql) => { if (sql.includes("INSERT INTO leads")) { leadInserts += 1; return { rows: [{ id: `lead-${leadInserts}` }] }; } return { rows: [] }; } }); const analysis = await analyzeUpload(file.body, filename, db); assert.equal(analysis.valid.length, 3); assert.equal(analysis.errors.length, 0); const request = csvRequest(file.body, filename, { "x-altus-file-hash": analysis.fileHash }); request.url = "/api/leads/import/apply"; const result = await apply(request, db, { id: "owner" }); assert.equal(result.created, 3); assert.equal(leadInserts, 3);
    const duplicateLeads = analysis.valid.map((row) => ({ id: `existing-${row.rowNumber}`, source_id: row.sourceId, phone: row.values.phone, email: row.values.email })); const duplicateDb = referenceDb({ leads: duplicateLeads }); const duplicateAnalysis = await analyzeUpload(file.body, filename, duplicateDb); assert.equal(duplicateAnalysis.valid.length, 0); assert.equal(duplicateAnalysis.errors.length, 0); assert.equal(duplicateAnalysis.mapped.filter((row) => row.duplicate).length, 3);
    const allowDb = referenceDb({ leads: duplicateLeads }); let allowedInserts = 0; allowDb.transaction = async (work) => work({ query: async (sql) => { if (sql.includes("INSERT INTO leads")) { allowedInserts += 1; return { rows: [{ id: `allowed-${allowedInserts}` }] }; } return { rows: [] }; } }); const allowAnalysis = await analyzeUpload(file.body, filename, allowDb, { allowDuplicates: true }); assert.equal(allowAnalysis.valid.length, 3); const allowRequest = csvRequest(file.body, filename, { "x-altus-file-hash": allowAnalysis.fileHash, "x-altus-allow-duplicates": "1" }); allowRequest.url = "/api/leads/import/apply"; const allowed = await apply(allowRequest, allowDb, { id: "owner" }); assert.equal(allowed.created, 3); assert.equal(allowedInserts, 3);
  }
});

test("import validation reports required name, master values, dates, and duplicates", async () => {
  const data = "name,phone,email,stage,pso_date\nGood, +91 9000000000,good@example.test,lead,15/01/2026\nEmail match,,old@example.test,lead,2026-01-15\nMissing,,bad@example.test,not-a-stage,31/02/2026\nRepeat,+91 9000000000,repeat@example.test,lead,2026-01-15\n";
  const analysis = await analyzeUpload(Buffer.from(data), "fixture.csv", referenceDb({ leads: [{ id: "existing", phone: "9000000000", email: "old@example.test" }] }));
  assert.equal(analysis.fileHash.length, 64); assert.equal(analysis.errors.length, 1); assert.equal(analysis.mapped.some((row) => row.errors.length > 0), true); assert.equal(analysis.mapped.some((row) => row.duplicate), true); assert.equal(analysis.mapped.some((row) => row.sourceId === `upload:${analysis.fileHash}:2`), true);
  const missingName = await analyzeUpload(Buffer.from("name,email\n,empty@example.test\n"), "missing.csv", referenceDb()); assert.match(missingName.errors[0].errors[0], /name: value is required/);
});

test("same file hash and row number produce the same idempotent source_id", async () => {
  const data = Buffer.from("name,email\nIdempotent,idem@example.test\n"); const first = await analyzeUpload(data, "same.csv", referenceDb()); const second = await analyzeUpload(data, "same.csv", referenceDb({ leads: [{ id: "already", source_id: first.valid[0].sourceId }] })); assert.equal(first.valid[0].sourceId, second.mapped[0].sourceId); assert.equal(second.mapped[0].duplicate, true);
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
