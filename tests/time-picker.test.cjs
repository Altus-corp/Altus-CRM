const test = require("node:test");
const assert = require("node:assert/strict");

test("TimePicker parseTimeString parses flexible time formats into HH:mm 24-hour format", async () => {
  const { parseTimeString } = await import("../src/shared/components/time-picker-utils.ts");

  // 12-hour with am/pm
  assert.equal(parseTimeString("6:30 pm"), "18:30");
  assert.equal(parseTimeString("6:30pm"), "18:30");
  assert.equal(parseTimeString("06:30 PM"), "18:30");
  assert.equal(parseTimeString("6:30 am"), "06:30");
  assert.equal(parseTimeString("12:00 am"), "00:00");
  assert.equal(parseTimeString("12:00 pm"), "12:00");
  assert.equal(parseTimeString("12:30 pm"), "12:30");

  // Digits without colon
  assert.equal(parseTimeString("630p"), "18:30");
  assert.equal(parseTimeString("630pm"), "18:30");
  assert.equal(parseTimeString("630a"), "06:30");
  assert.equal(parseTimeString("0630"), "06:30");
  assert.equal(parseTimeString("1830"), "18:30");

  // Single hour with am/pm
  assert.equal(parseTimeString("6pm"), "18:00");
  assert.equal(parseTimeString("6p"), "18:00");
  assert.equal(parseTimeString("9am"), "09:00");
  assert.equal(parseTimeString("9a"), "09:00");
  assert.equal(parseTimeString("12am"), "00:00");
  assert.equal(parseTimeString("12pm"), "12:00");

  // 24-hour format directly
  assert.equal(parseTimeString("18:30"), "18:30");
  assert.equal(parseTimeString("09:15"), "09:15");
  assert.equal(parseTimeString("00:00"), "00:00");

  // Invalid inputs
  assert.equal(parseTimeString(""), null);
  assert.equal(parseTimeString("invalid"), null);
  assert.equal(parseTimeString("25:00"), null);
  assert.equal(parseTimeString("12:60"), null);
  assert.equal(parseTimeString("13:00 pm"), null);
});

test("TimePicker formatDisplayTime formats 24h stored format into hh:mm AM/PM display string", async () => {
  const { formatDisplayTime } = await import("../src/shared/components/time-picker-utils.ts");

  assert.equal(formatDisplayTime("18:30"), "06:30 PM");
  assert.equal(formatDisplayTime("06:30"), "06:30 AM");
  assert.equal(formatDisplayTime("09:05"), "09:05 AM");
  assert.equal(formatDisplayTime("00:00"), "12:00 AM");
  assert.equal(formatDisplayTime("12:00"), "12:00 PM");
  assert.equal(formatDisplayTime("12:45"), "12:45 PM");
  assert.equal(formatDisplayTime("23:59"), "11:59 PM");
  assert.equal(formatDisplayTime(""), "");
  assert.equal(formatDisplayTime(undefined), "");
});

test("TimePicker decompose24 and compose24 convert accurately", async () => {
  const { decompose24, compose24 } = await import("../src/shared/components/time-picker-utils.ts");

  assert.deepEqual(decompose24("18:31"), { hour12: 6, minute: 31, period: "PM" });
  assert.deepEqual(decompose24("06:31"), { hour12: 6, minute: 31, period: "AM" });
  assert.deepEqual(decompose24("00:00"), { hour12: 12, minute: 0, period: "AM" });
  assert.deepEqual(decompose24("12:00"), { hour12: 12, minute: 0, period: "PM" });

  assert.equal(compose24(6, 31, "PM"), "18:31");
  assert.equal(compose24(6, 31, "AM"), "06:31");
  assert.equal(compose24(12, 0, "AM"), "00:00");
  assert.equal(compose24(12, 0, "PM"), "12:00");
});
