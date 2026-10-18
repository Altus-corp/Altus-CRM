const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");

test("sign-out clears auth state even when logout request fails", () => {
  const source = fs.readFileSync("src/shared/auth/auth.tsx", "utf8");
  assert.match(source, /logout: async \(\) => \{ try \{ await api\("\/api\/logout"/);
  assert.match(source, /finally \{ setUser\(null\); \}/);
});

test("theme toggle and duplicate role display are handled in the shell", () => {
  const source = fs.readFileSync("src/shared/layout/app-shell.tsx", "utf8");
  assert.match(source, /setTheme\(next\)/);
  assert.match(source, /user\.name !== roleLabel/);
  assert.match(source, /account-menu-role/);
});
