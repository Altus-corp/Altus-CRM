"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const { Readable } = require("node:stream");
const { route } = require("../server/index.cjs");

function loadPolicy() {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "screens", "leads", "inline-field-policy.ts"), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function("exports", "module", output)(module.exports, module);
  return module.exports;
}

function response() {
  return { status: 0, body: "", setHeader() {}, writeHead(status) { this.status = status; }, end(body) { this.body = String(body || ""); } };
}

function request(body) {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  req.method = "PATCH";
  req.url = "/api/leads/fixture-lead";
  req.headers = { "x-altus": "1" };
  req.socket = { remoteAddress: "127.0.0.1", encrypted: false };
  return req;
}

function inlineDb(definitions, { proposedSolution = "", activeResolutions = [], products = [] } = {}) {
  const lead = { id: "fixture-lead", name: "Synthetic Lead", email: "fixture@example.test", phone: "9000000000", lead_type: "DL", custom_values: { lead_fields: { calling_resolution: "Registered for Next", proposed_solution: proposedSolution } } };
  const writes = [];
  const configuredProducts = products.length ? products : proposedSolution ? [{ code: proposedSolution, label: proposedSolution, resolutions: activeResolutions }] : [];
  const normalized = (value) => String(value || "").trim().toLowerCase();
  const query = async (text, params = []) => {
    if (text.includes("FROM workspace_settings")) return { rows: [{ value: definitions }] };
    if (text.startsWith("SELECT * FROM leads WHERE id=$1")) return { rows: [lead] };
    if (text.includes("FROM master_values WHERE master_type='product'")) {
      const requested = new Set((params[0] || []).map(normalized));
      return { rows: configuredProducts.filter((product) => requested.has(normalized(product.code)) || requested.has(normalized(product.label))).map((product) => ({ code: product.code, label: product.label })) };
    }
    if (text.includes("FROM product_call_resolutions")) return { rows: configuredProducts.filter((product) => (params[1] || []).includes(product.code) && (product.resolutions || []).includes(params[0])).map((product) => ({ code: product.code, label: params[0] })) };
    if (text.startsWith("UPDATE leads SET custom_values")) { writes.push({ text, params }); return { rows: [{ ...lead, custom_values: { lead_fields: { calling_resolution: null } } }] }; }
    return { rows: [] };
  };
  return { writes, sessionUser: async () => "owner-1", userById: async () => ({ id: "owner-1", role: "Owner", active: true, offboarded: false }), query, transaction: async (work) => work({ query }) };
}

async function patch(db, body) {
  const res = response();
  await route(request(body), res, db);
  return { status: res.status, body: JSON.parse(res.body) };
}

test("Calling Resolution remains a built-in table column without an admin definition", () => {
  const policy = loadPolicy();
  assert.deepEqual(policy.BUILT_IN_TABLE_COLUMN_KEYS, ["calling_resolution"]);
  assert.equal(policy.canonicalManagedFieldKey("callingResolution"), "calling_resolution");
});

test("direct PATCH rejects an inactive managed field", async () => {
  const db = inlineDb([{ key: "extra_notes", label: "Extra Notes", type: "text", active: false, detail_visible: true, options: [] }]);
  const result = await patch(db, { field: "extra_notes", value: "No longer allowed" });
  assert.equal(result.status, 400);
  assert.match(result.body.error, /inactive or no longer exists/);
  assert.equal(db.writes.length, 0);
});

test("choosing the empty inline option persists built-in Calling Resolution as null", async () => {
  const db = inlineDb([]);
  const result = await patch(db, { field: "calling_resolution", value: "" });
  assert.equal(result.status, 200);
  assert.equal(db.writes.length, 1);
  assert.equal(db.writes[0].params[0], "calling_resolution");
  assert.equal(db.writes[0].params[1], "null");
});

test("Calling Resolution accepts only the lead product's active resolutions without an admin definition", async () => {
  const accepted = await patch(inlineDb([], { proposedSolution: "BSSO", activeResolutions: ["Registered"] }), { field: "calling_resolution", value: "Registered" });
  assert.equal(accepted.status, 200);
  const rejected = await patch(inlineDb([], { proposedSolution: "BSSO", activeResolutions: ["Registered"] }), { field: "calling_resolution", value: "DND/NI" });
  assert.equal(rejected.status, 400);
  assert.match(rejected.body.error, /not active for the lead's Proposed Solution product/);
});

test("Calling Resolution rejects a value active only for another product", async () => {
  const products = [
    { code: "A", label: "Product A", resolutions: ["A only"] },
    { code: "B", label: "Product B", resolutions: ["B only"] },
  ];
  const result = await patch(inlineDb([], { proposedSolution: "Product A", products }), { field: "calling_resolution", value: "B only" });
  assert.equal(result.status, 400);
  assert.match(result.body.error, /not active for the lead's Proposed Solution product/);
});

test("Calling Resolution accepts a Proposed Solution product name despite case and surrounding spaces", async () => {
  const result = await patch(inlineDb([], {
    proposedSolution: "  product a  ",
    products: [{ code: "A", label: "Product A", resolutions: ["A only"] }],
  }), { field: "calling_resolution", value: "A only" });
  assert.equal(result.status, 200);
});

test("Calling Resolution options are isolated per product and combined only for multi-product leads", () => {
  const policy = loadPolicy();
  const products = [{ code: "A", label: "Product A" }, { code: "B", label: "Product B" }];
  const options = { A: [{ value: "A only", label: "A only" }], B: [{ value: "B only", label: "B only" }] };
  assert.deepEqual(policy.callResolutionOptionsForProposedSolution("Product A", products, options).map((option) => option.value), ["A only"]);
  assert.deepEqual(policy.callResolutionOptionsForProposedSolution("Product B", products, options).map((option) => option.value), ["B only"]);
  assert.deepEqual(policy.callResolutionOptionsForProposedSolution("  product a ; PRODUCT B  ", products, options).map((option) => option.value), ["A only", "B only"]);
});

test("a failed inline save restores the exact pre-save list and detail snapshot", () => {
  const policy = loadPolicy();
  const previousData = { items: [{ id: "fixture-lead", calling_resolution: "Registered for Next" }] };
  const previousDetail = { lead: previousData.items[0] };
  const optimisticData = { items: [{ id: "fixture-lead", calling_resolution: "Tentative for Next" }] };
  assert.notDeepEqual(optimisticData, previousData);
  const restored = policy.rollbackInlineLeadUpdate(previousData, previousDetail);
  assert.strictEqual(restored.data, previousData);
  assert.strictEqual(restored.detail, previousDetail);
  assert.equal(restored.data.items[0].calling_resolution, "Registered for Next");
});

test("active admin aliases use legacy lead data once, while inactive fields and stale preferences are omitted", () => {
  const policy = loadPolicy();
  const { resolveLeadValue } = require("../shared/lead-field-resolver.cjs");
  const lead = { first_name: "Ada", last_name: "Lovelace", company: "Analytical Engines", phone: "9000000000", email: "ada@example.test", designation: "Founder" };
  const aliases = {
    first_name: "Ada",
    last_name: "Lovelace",
    company_name: "Analytical Engines",
    call_no: "9000000000",
    email_id: "ada@example.test",
    designation: "Founder",
  };
  for (const [adminKey, expected] of Object.entries(aliases)) {
    const legacyKey = policy.legacyLeadColumnForAdminField(adminKey);
    assert.ok(legacyKey, `${adminKey} has a legacy alias`);
    assert.equal(resolveLeadValue(lead, legacyKey), expected);
  }
  const merged = policy.mergeCoreAndConfiguredTableColumns(
    [{ key: "cellNo", displayKey: "phone" }, { key: "name", displayKey: "name" }],
    [{ key: "call_no", displayKey: "phone" }, { key: "phone", displayKey: "phone" }],
  );
  assert.deepEqual(merged.map((field) => field.key), ["name", "call_no"], "an active admin alias replaces the legacy column exactly once");
  const callingResolution = policy.mergeCoreAndConfiguredTableColumns(
    [{ key: "calling_resolution", label: "Calling Resolution", displayKey: "calling_resolution" }],
    [{ key: "calling_resolution", label: "Admin Call Resolution", displayKey: "calling_resolution" }],
  );
  assert.deepEqual(callingResolution, [{ key: "calling_resolution", label: "Admin Call Resolution", displayKey: "calling_resolution" }]);
  const activePickerKeys = new Set(["leadNo", "name", "company_name", "stage"]);
  assert.deepEqual(
    policy.keepAllowedColumnOrder(["leadNo", "leadSource", "company_name", "rating", "stage", "company_name"], activePickerKeys),
    ["leadNo", "company_name", "stage"],
  );
  assert.equal(activePickerKeys.has("designation"), false, "an inactive or deleted admin field is not available");
});

test("an old layout appends the built-in Calling Resolution column once and records it as known", () => {
  const policy = loadPolicy();
  const reconciled = policy.reconcileColumnLayout(["leadNo", "name"], [], new Set(["leadNo", "name", "calling_resolution"]), ["calling_resolution"]);
  assert.deepEqual(reconciled.visible, ["leadNo", "name", "calling_resolution"]);
  assert.deepEqual(reconciled.known, ["leadNo", "name", "calling_resolution"]);
});

test("a field known when the user hid it remains hidden after reload", () => {
  const policy = loadPolicy();
  const reconciled = policy.reconcileColumnLayout(["leadNo", "name"], ["leadNo", "name", "calling_resolution"], new Set(["leadNo", "name", "calling_resolution"]), ["calling_resolution"]);
  assert.deepEqual(reconciled.visible, ["leadNo", "name"]);
});

test("inactive or deleted fields are still removed from a saved layout", () => {
  const policy = loadPolicy();
  const reconciled = policy.reconcileColumnLayout(["leadNo", "calling_resolution", "name"], ["leadNo", "calling_resolution", "name"], new Set(["leadNo", "name"]), []);
  assert.deepEqual(reconciled.visible, ["leadNo", "name"]);
});
