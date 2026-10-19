const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");

test("WhatsApp phone formatting normalizes Indian local and international numbers", async () => {
  const { formatWhatsAppPhone } = await import("../src/screens/leads/quick-contact.ts");
  assert.equal(formatWhatsAppPhone("9876543210"), "919876543210");
  assert.equal(formatWhatsAppPhone("+91 98765 43210"), "919876543210");
  assert.equal(formatWhatsAppPhone("98765-43210"), "919876543210");
  assert.equal(formatWhatsAppPhone("00 91 98765-43210"), "919876543210");
  assert.equal(formatWhatsAppPhone(""), null);
  assert.equal(formatWhatsAppPhone("1234"), null);
});

test("row quick-contact actions retain disabled email and WhatsApp controls", () => {
  const source = fs.readFileSync("src/screens/leads/page.tsx", "utf8");
  assert.match(source, /title="No email available"/);
  assert.match(source, /title="No phone number available"/);
  assert.match(source, /aria-disabled="true"/);
  assert.match(source, /<WhatsAppIcon color="var\(--ink-3\)"/);
  assert.match(source, /target="_blank" rel="noopener noreferrer"/);
  assert.match(source, /onPointerDown=\{stopRowInteraction\}/);
  assert.match(source, /canContact=\{canQuickContact\}/);
});
