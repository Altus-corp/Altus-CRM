const test = require("node:test");
const assert = require("node:assert/strict");

test("DatePicker parseDateString parses ISO yyyy-MM-dd format", async () => {
  const { parseDateString } = await import("../src/shared/components/date-picker-utils.ts");

  assert.equal(parseDateString("2026-10-21"), "2026-10-21");
  assert.equal(parseDateString("2026/10/21"), "2026-10-21");
  assert.equal(parseDateString("2026.10.21"), "2026-10-21");
  assert.equal(parseDateString("2025-01-05"), "2025-01-05");
});

test("DatePicker parseDateString parses DD/MM/YYYY and DD-MM-YYYY formats", async () => {
  const { parseDateString } = await import("../src/shared/components/date-picker-utils.ts");

  assert.equal(parseDateString("21/10/2026"), "2026-10-21");
  assert.equal(parseDateString("21-10-2026"), "2026-10-21");
  assert.equal(parseDateString("05/01/2025"), "2025-01-05");
  assert.equal(parseDateString("5/1/2025"), "2025-01-05");
  assert.equal(parseDateString("21/10/26"), "2026-10-21");
});

test("DatePicker parseDateString parses text month formats", async () => {
  const { parseDateString } = await import("../src/shared/components/date-picker-utils.ts");

  assert.equal(parseDateString("21 Oct 2026"), "2026-10-21");
  assert.equal(parseDateString("21 October 2026"), "2026-10-21");
  assert.equal(parseDateString("October 21, 2026"), "2026-10-21");
  assert.equal(parseDateString("Oct 21 2026"), "2026-10-21");
  assert.equal(parseDateString("1 Jan 2025"), "2025-01-01");
});

test("DatePicker parseDateString rejects invalid dates", async () => {
  const { parseDateString } = await import("../src/shared/components/date-picker-utils.ts");

  assert.equal(parseDateString(""), null);
  assert.equal(parseDateString("invalid"), null);
  assert.equal(parseDateString("2026-02-30"), null); // 30 Feb is invalid
  assert.equal(parseDateString("2026-13-01"), null); // Month 13 invalid
  assert.equal(parseDateString("32/10/2026"), null); // Day 32 invalid
});

test("DatePicker formatDisplayDate formats yyyy-MM-dd to dd MMM yyyy", async () => {
  const { formatDisplayDate } = await import("../src/shared/components/date-picker-utils.ts");

  assert.equal(formatDisplayDate("2026-10-21"), "21 Oct 2026");
  assert.equal(formatDisplayDate("2025-01-05"), "05 Jan 2025");
  assert.equal(formatDisplayDate(""), "");
  assert.equal(formatDisplayDate(undefined), "");
  assert.equal(formatDisplayDate("invalid"), "");
});

test("DatePicker calendar grid calculations match calendar reality", async () => {
  const { getDaysInMonth, getFirstDayOfWeek, formatDateISO } = await import(
    "../src/shared/components/date-picker-utils.ts"
  );

  // October 2026: 31 days
  assert.equal(getDaysInMonth(2026, 9), 31);
  // February 2024 (leap year): 29 days
  assert.equal(getDaysInMonth(2024, 1), 29);
  // February 2025: 28 days
  assert.equal(getDaysInMonth(2025, 1), 28);

  // Oct 1, 2026 is a Thursday. In Monday-start (Mon=0, Tue=1, Wed=2, Thu=3), it should be 3.
  assert.equal(getFirstDayOfWeek(2026, 9), 3);

  assert.equal(formatDateISO(2026, 10, 21), "2026-10-21");
});
