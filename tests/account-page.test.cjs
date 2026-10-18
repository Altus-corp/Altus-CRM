const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

test("account page presents the current profile in a scoped details card", () => {
  const page = fs.readFileSync("src/screens/account/page.tsx", "utf8");
  const styles = fs.readFileSync("src/screens/account/account.css", "utf8");
  assert.match(page, /account-profile-card/);
  assert.match(page, /account-profile-avatar/);
  assert.match(page, /account-details-list/);
  assert.match(page, /to="\/change-password"/);
  assert.match(page, /account\.signOut/);
  assert.match(styles, /\.account-profile-footer/);
});
