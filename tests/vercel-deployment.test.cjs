"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

test("Vercel deployment routes API requests to the CRM handler and preserves SPA routes", () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
  const api = fs.readFileSync(path.join(root, "api", "index.cjs"), "utf8");
  const server = fs.readFileSync(path.join(root, "server", "index.cjs"), "utf8");

  assert.match(api, /require\("\.\.\/server\/index\.cjs"\)/);
  assert.match(api, /req\.url = `\/api\/\$\{route\}/);
  assert.deepEqual(config.rewrites[0], { source: "/api/:path*", destination: "/api/index?path=:path*" });
  assert.deepEqual(config.rewrites.at(-1), { source: "/(.*)", destination: "/index.html" });
  assert.match(server, /async function handler\(req, res\)/);
});
