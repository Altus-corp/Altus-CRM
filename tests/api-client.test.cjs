const test = require("node:test");
const assert = require("node:assert/strict");

test("ApiError preserves the server message and exposes status and path", async () => {
  const { api, ApiError } = await import("../src/shared/api/client.ts");
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 409, json: async () => ({ error: "Conflict." }) });
  try {
    await assert.rejects(() => api("/api/example"), (error) => error instanceof ApiError && error instanceof Error && error.message === "Conflict." && error.status === 409 && error.path === "/api/example");
  } finally { global.fetch = originalFetch; }
});
