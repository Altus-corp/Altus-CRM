"use strict";

const { sqlExpression } = require("../shared/lead-field-resolver.cjs");

const QUICK_FILTER_FIELDS = Object.freeze({
  name: { label: "Name", sql: sqlExpression("name"), kind: "text" },
  email: { label: "Email", sql: sqlExpression("email"), kind: "text" },
  phone: { label: "Phone", sql: sqlExpression("phone"), kind: "text" },
  company: { label: "Company", sql: sqlExpression("company"), kind: "text" },
  stage: { label: "Stage", sql: sqlExpression("stage"), kind: "text" },
  permission: { label: "Permission", sql: sqlExpression("permission"), kind: "text" },
  lead_status: { label: "Lead status", sql: sqlExpression("lead_status"), kind: "text" },
  owner: { label: "Owner", sql: sqlExpression("owner"), kind: "text" },
  lead_no: { label: "Lead number", sql: sqlExpression("leadNo"), kind: "text" },
  lead_type: { label: "Lead type", sql: sqlExpression("leadTypeCode"), kind: "text" },
  lead_source: { label: "Lead source", sql: sqlExpression("leadSource"), kind: "text" },
  city: { label: "City", sql: sqlExpression("city"), kind: "text" },
  designation: { label: "Designation", sql: sqlExpression("designation"), kind: "text" },
  business_category: { label: "Business category", sql: sqlExpression("business_category"), kind: "text" },
  industry: { label: "Industry", sql: sqlExpression("industry"), kind: "text" },
  rating: { label: "Rating", sql: sqlExpression("rating"), kind: "text" },
  pso_date: { label: "PSO date", sql: sqlExpression("psoDate"), kind: "date" },
  next_follow_up_at: { label: "Next follow-up", sql: sqlExpression("nextFollowUpAt"), kind: "date" },
});

const QUICK_FILTER_OPERATORS = Object.freeze({
  equals: "Equals",
  contains: "Contains",
  starts_with: "Starts with",
  not_equals: "Does not equal",
  is_empty: "Is empty",
  is_not_empty: "Is not empty",
  gt: "Greater than",
  gte: "At least",
  lt: "Less than",
  lte: "At most",
});

function validateConditions(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 12) return { error: "Add at least one valid condition." };
  const conditions = [];
  for (const raw of value) {
    const field = String(raw?.field || "");
    const operator = String(raw?.operator || "");
    const definition = QUICK_FILTER_FIELDS[field];
    if (!definition || !Object.prototype.hasOwnProperty.call(QUICK_FILTER_OPERATORS, operator)) return { error: "Invalid quick filter condition." };
    const valueText = raw?.value == null ? "" : String(raw.value).trim();
    if (!valueText && !["is_empty", "is_not_empty"].includes(operator)) return { error: "Each condition needs a value." };
    if (["gt", "gte", "lt", "lte"].includes(operator) && definition.kind !== "date") return { error: "Comparison operators are only supported for dates." };
    if (definition.kind === "date" && valueText && !/^\d{4}-\d{2}-\d{2}$/.test(valueText)) return { error: "Dates must use YYYY-MM-DD." };
    conditions.push({ field, operator, value: valueText });
  }
  return { conditions };
}

function validateQuickFilter(body, existing = {}) {
  const name = String(body?.name ?? existing.name ?? "").trim();
  if (!name || name.length > 80) return { error: "A quick filter name is required." };
  const result = validateConditions(body?.conditions ?? existing.conditions);
  if (result.error) return result;
  const view = String(body?.view ?? existing.view ?? "");
  const filters = body?.filters ?? existing.filters ?? {};
  if (!filters || typeof filters !== "object" || Array.isArray(filters)) return { error: "Invalid lead filters." };
  return { value: { name, conditions: result.conditions, join: String(body?.join ?? existing.join ?? "AND").toUpperCase() === "OR" ? "OR" : "AND", view, filters } };
}

function buildQuickFilterWhere(value, bind) {
  const checked = validateConditions(value?.conditions);
  if (checked.error) return checked;
  const predicates = checked.conditions.map(({ field, operator, value: conditionValue }) => {
    const definition = QUICK_FILTER_FIELDS[field];
    const column = definition.sql;
    if (operator === "is_empty") return `${column} IS NULL OR ${definition.kind === "text" ? `${column} = ''` : "FALSE"}`;
    if (operator === "is_not_empty") return `${column} IS NOT NULL${definition.kind === "text" ? ` AND ${column} <> ''` : ""}`;
    const placeholder = bind(definition.kind === "text" && ["contains", "starts_with"].includes(operator) ? (operator === "contains" ? `%${conditionValue}%` : `${conditionValue}%`) : conditionValue);
    if (operator === "equals") return `${column} = ${placeholder}`;
    if (operator === "not_equals") return `${column} IS DISTINCT FROM ${placeholder}`;
    if (operator === "contains" || operator === "starts_with") return `${column} ILIKE ${placeholder}`;
    const cast = definition.kind === "date" ? "::date" : "";
    return `${column} ${({ gt: ">", gte: ">=", lt: "<", lte: "<=" })[operator]} ${placeholder}${cast}`;
  });
  const join = String(value?.join || "AND").toUpperCase() === "OR" ? " OR " : " AND ";
  return { sql: `(${predicates.map((predicate) => `(${predicate})`).join(join)})` };
}

module.exports = { QUICK_FILTER_FIELDS, QUICK_FILTER_OPERATORS, validateQuickFilter, buildQuickFilterWhere };
