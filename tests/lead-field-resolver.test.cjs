"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveLeadValue, sqlExpression } = require("../shared/lead-field-resolver.cjs");

test("resolver uses the documented source priority and normalizes Not provided", () => {
  const lead = {
    company: "Real company",
    custom_values: {
      lead_fields: { company: "Configured company", rating: 4 },
      company: "Legacy custom company",
    },
    legacy_finance: { company: "Finance company" },
  };
  assert.equal(resolveLeadValue(lead, "company"), "Real company");
  assert.equal(resolveLeadValue({ custom_values: { lead_fields: { company: "Configured company" }, company: "Legacy custom company" } }, "company"), "Configured company");
  assert.equal(resolveLeadValue({ custom_values: { company: "Legacy custom company" }, legacy_finance: { company: "Finance company" } }, "company"), "Legacy custom company");
  assert.equal(resolveLeadValue({ custom_values: { company: "Not provided" } }, "company"), null);
});

test("name uses first and last names consistently, then falls back to name", () => {
  assert.equal(resolveLeadValue({ name: "Old Name", first_name: "First", last_name: "Last" }, "name"), "First Last");
  assert.equal(resolveLeadValue({ name: "Stored Name" }, "name"), "Stored Name");
  assert.equal(resolveLeadValue({ name: "Not provided" }, "name"), null);
});

test("business category and industry remain separate mappings", () => {
  const lead = { custom_values: { business_category: "Retail", industry: "Health" } };
  assert.equal(resolveLeadValue(lead, "business_category"), "Retail");
  assert.equal(resolveLeadValue(lead, "industry"), "Health");
});

test("contact and location fields fall back to alternate lead columns", () => {
  const lead = { alternate_phone: "+91 99999 00000", location: "Pune", lead_source_secondary: "Referral" };
  assert.equal(resolveLeadValue(lead, "phone"), "+91 99999 00000");
  assert.equal(resolveLeadValue(lead, "city"), "Pune");
  assert.equal(resolveLeadValue(lead, "leadSource"), "Referral");
});

test("resolved SQL expressions use the same source order", () => {
  const sql = sqlExpression("business_category");
  assert.match(sql, /lead_fields/);
  assert.match(sql, /legacy_finance/);
  assert.match(sql, /Not provided/);
});
