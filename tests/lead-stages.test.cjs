const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { Readable } = require("node:stream");
const stages = require("../shared/dropdown-seed.json").lead_stage;
const { analyzeUpload } = require("../server/lead-import.cjs");
const { route } = require("../server/index.cjs");

const requestedStages = ["pool", "duringpso", "completed"];
const owner = { id: "owner-1", name: "Fixture Owner", email: "owner@example.test", role: "Owner", active: true, offboarded: false };

function response() { return { status: 0, headers: {}, body: "", setHeader() {}, writeHead(status, headers) { this.status = status; this.headers = headers; }, end(body) { this.body = String(body || ""); } }; }
function request(method, url, body) { const req = Readable.from([Buffer.from(JSON.stringify(body || {}))]); req.method = method; req.url = url; req.headers = { "x-altus": "1" }; req.socket = { remoteAddress: "127.0.0.1", encrypted: false }; return req; }
function dbFor(current = null) {
  const sql = [];
  return {
    sql,
    sessionUser: async () => owner.id,
    userById: async () => owner,
    throttleBlocked: async () => null,
    throttleClear: async () => {},
    query: async (text) => {
      sql.push(text);
      if (text.includes("SELECT * FROM leads WHERE id=$1")) return { rows: current ? [current] : [] };
      if (text.includes("SELECT id FROM leads WHERE")) return { rows: [] };
      if (text.includes("SELECT stage FROM leads WHERE id=$1")) return { rows: current ? [{ stage: current.stage }] : [] };
      if (text.includes("FROM dropdown_definitions d JOIN dropdown_options")) return { rows: [{ id: "stage-option" }] };
      return { rows: [] };
    },
    transaction: async (work) => work({ query: async (text) => { sql.push(text); if (text.includes("SELECT stage FROM leads WHERE id=$1")) return { rows: current ? [{ stage: current.stage }] : [] }; return { rows: [] }; } }),
  };
}

test("shared stage set contains pool, duringpso, and completed", () => {
  assert.deepEqual(requestedStages.every((value) => stages.some((stage) => stage.value === value)), true);
});

test("create accepts all three new stages through the server write path", async () => {
  for (const stage of requestedStages) {
    const db = dbFor(); const res = response();
    await route(request("POST", "/api/leads", { name: `Fixture ${stage}`, email: `${stage}@example.test`, lead_type: "DL", stage }), res, db);
    assert.equal(res.status, 201, stage);
    assert.ok(db.sql.some((sql) => sql.includes("INSERT INTO leads") && sql.includes("stage")), stage);
  }
});

test("update can edit a lead already in pool, duringpso, or completed", async () => {
  for (const stage of requestedStages) {
    const current = { id: `lead-${stage}`, name: "Before", email: `${stage}@example.test`, phone: null, company: null, lead_type: "DL", priority: "P3", stage, permission: "Pending", lead_status: null, owner_user_id: null, pso_date: null, custom_values: {}, legacy_finance: {} };
    const db = dbFor(current); const res = response();
    await route(request("PATCH", `/api/leads/${current.id}`, { name: `Edited ${stage}` }), res, db);
    assert.equal(res.status, 200, stage);
    assert.ok(db.sql.some((sql) => sql.includes("UPDATE leads SET")), stage);
  }
});

test("stage endpoint accepts all three new stages", async () => {
  for (const stage of requestedStages) {
    const db = dbFor({ id: "lead-1", stage: "lead" }); const res = response();
    await route(request("POST", "/api/leads/lead-1/stage", { stage }), res, db);
    assert.equal(res.status, 200, stage);
    assert.equal(JSON.parse(res.body).stage, stage);
  }
});

test("import validation accepts all three new stages with fixture data", async () => {
  for (const stage of requestedStages) {
    const data = Buffer.from(`name,email,stage\nFixture ${stage},${stage}@example.test,${stage}\n`);
    const analysis = await analyzeUpload(data, `${stage}.csv`, { query: async (sql) => sql.includes("FROM users") ? { rows: [] } : { rows: [] } });
    assert.equal(analysis.errors.length, 0, stage);
    assert.equal(analysis.valid[0].values.stage, stage);
  }
});

test("Leads UI renders every shared stage option", () => {
  const source = fs.readFileSync("src/screens/leads/page.tsx", "utf8");
  assert.match(fs.readFileSync("shared/dropdown-seed.json", "utf8"), /"lead_stage"\s*:/);
  for (const stage of requestedStages) assert.ok(stages.some((option) => option.value === stage));
});
