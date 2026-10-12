const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(target) : [target];
  });
}

test("src UI source uses TypeScript only", () => {
  const violations = sourceFiles(path.resolve("src")).filter((file) => [".js", ".jsx", ".cjs"].includes(path.extname(file)));
  assert.deepEqual(violations, []);
});
