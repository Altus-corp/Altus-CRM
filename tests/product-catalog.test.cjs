"use strict";

const assert = require("node:assert/strict");
const { Readable } = require("node:stream");
const test = require("node:test");
const { route } = require("../server/index.cjs");

function response() { return { status: 0, body: "", setHeader() {}, writeHead(status) { this.status = status; }, end(body) { this.body = String(body || ""); } }; }
function request() { const req = Readable.from([]); req.method = "GET"; req.url = "/api/products"; req.headers = {}; req.socket = { remoteAddress: "127.0.0.1", encrypted: false }; return req; }
function dbFor(user) { return { sessionUser: async () => user?.id || null, userById: async () => user, query: async () => ({ rows: [{ id: "product-1", code: "", label: "Product One" }] }) }; }

test("active product catalog is available to lead users and uses a stable lead product code", async () => {
  const res = response();
  await route(request(), res, dbFor({ id: "sales-1", role: "Sales", active: true, offboarded: false }));
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(res.body), { products: [{ id: "product-1", code: "Product One", label: "Product One" }] });
});

test("product catalog does not expose products to users without lead access", async () => {
  const res = response();
  await route(request(), res, dbFor(null));
  assert.equal(res.status, 401);
});
