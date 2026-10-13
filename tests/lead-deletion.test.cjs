"use strict";

const assert = require("node:assert/strict");
const { Readable } = require("node:stream");
const test = require("node:test");
const { route } = require("../server/index.cjs");

function response() { return { status: 0, body: "", setHeader() {}, writeHead(status) { this.status = status; }, end(body) { this.body = String(body || ""); } }; }
function request(path, body) { const req = Readable.from([Buffer.from(JSON.stringify(body))]); req.method = "POST"; req.url = path; req.headers = { "x-altus": "1" }; req.socket = { remoteAddress: "127.0.0.1", encrypted: false }; return req; }
function dbFor(actor, sql) { const query = async (statement, params) => { sql.push(statement); if (statement.includes("user_capability_overrides")) return { rows: [] }; if (statement.startsWith("UPDATE leads")) return { rows: (params[0] || []).map((id) => ({ id })) }; if (statement.startsWith("SELECT id FROM leads")) return { rows: (params[0] || []).map((id) => ({ id })) }; return { rows: [] }; }; return { sessionUser: async () => actor.id, userById: async () => actor, query, transaction: async (work) => work({ query }) }; }

const admin = { id: "admin-1", role: "Admin", active: true, offboarded: false };
const sales = { id: "sales-1", role: "Sales", active: true, offboarded: false };

test("Admin can archive selected leads while Sales cannot", async () => {
  const sql = []; const allowed = response(); await route(request("/api/leads/bulk-archive", { ids: ["lead-1", "lead-2"] }), allowed, dbFor(admin, sql));
  assert.equal(allowed.status, 200); assert.equal(JSON.parse(allowed.body).archived, 2); assert.ok(sql.some((statement) => statement.startsWith("UPDATE leads") && statement.includes("'archived'")));
  const denied = response(); await route(request("/api/leads/bulk-archive", { ids: ["lead-1"] }), denied, dbFor(sales, [])); assert.equal(denied.status, 403);
});

test("permanent bulk deletion requires DELETE confirmation and clears related lead records", async () => {
  const missingConfirmation = response(); await route(request("/api/leads/bulk-delete", { ids: ["lead-1"] }), missingConfirmation, dbFor(admin, [])); assert.equal(missingConfirmation.status, 400);
  const sql = []; const allowed = response(); await route(request("/api/leads/bulk-delete", { ids: ["lead-1"], confirmation: "DELETE" }), allowed, dbFor(admin, sql));
  assert.equal(allowed.status, 200); assert.equal(JSON.parse(allowed.body).deleted, 1); assert.ok(sql.some((statement) => statement.includes("DELETE FROM lead_notes"))); assert.ok(sql.some((statement) => statement === "DELETE FROM leads WHERE id=ANY($1::text[])"));
});
