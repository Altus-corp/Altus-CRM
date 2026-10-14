"use strict";

const { writeAudit } = require("./audit.cjs");

const SETTING_KEY = "lead_field_definitions";
const TYPES = new Set(["text", "textarea", "number", "date", "email", "phone", "url", "boolean"]);
const KEY_RE = /^[a-z][a-z0-9_]{1,63}$/;

// These fields are stored inside leads.custom_values.lead_fields. Core lead columns
// (name, email, phone, company, designation, lead_no, first_name, last_name) remain
// untouched and continue to use their existing database columns.
const DEFAULT_FIELDS = Object.freeze([
  ["lead_acquisition_date", "Lead Acquisition Date", "date"],
  ["business_category", "Business Category", "text"],
  ["nature_of_business", "Nature of Business", "text"],
  ["proposed_solution", "Proposed Solution", "text"],
  ["invite_sent_by_introducer", "Invite Sent by Introducer", "boolean"],
  ["invite_date_sent", "Invite Date Sent", "date"],
  ["introducer_call_done", "Introducer Call Done", "boolean"],
  ["introducer_call_date", "Introducer Call Date", "date"],
  ["introducer_feedback", "Introducer Feedback", "text"],
  ["introducer_name", "Introducer Name", "text"],
  ["employee_name", "Employee Name", "text"],
  ["association_network_name", "Association/Network Name", "text"],
  ["chapter_name", "Chapter Name", "text"],
  ["extra_notes", "Extra Notes", "text"],
  ["last_called_on", "Last Called On", "text"],
  ["calling_resolution", "Calling Resolution", "text"],
  ["next_call_on", "Next Call On", "text"],
  ["calling_remarks", "Calling Remarks", "textarea"],
  ["intro_video_sent", "2 Mins Intro Video Sent", "boolean"],
  ["email_sent", "Email Sent", "boolean"],
  ["whatsapp_message_sent", "Msg Sent on WhatsApp", "boolean"],
].map(([key, label, type], order) => Object.freeze({ key, label, type, active: true, detail_visible: true, order })));

function text(value) { return String(value ?? "").trim(); }
function plain(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function validDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()); }

function normalizeDefinitions(value, fallback = DEFAULT_FIELDS) {
  if (!Array.isArray(value)) return fallback.map((field) => ({ ...field }));
  const seen = new Set(); const fields = [];
  for (const [index, raw] of value.entries()) {
    const key = text(raw?.key).toLowerCase().replace(/[\s-]+/g, "_");
    const label = text(raw?.label);
    const type = text(raw?.type || "text").toLowerCase();
    if (!KEY_RE.test(key) || seen.has(key) || !label || label.length > 80 || !TYPES.has(type)) continue;
    seen.add(key);
    fields.push({ key, label, type, active: raw?.active !== false, detail_visible: raw?.detail_visible !== false, order: Number.isFinite(Number(raw?.order)) ? Number(raw.order) : index });
  }
  return fields.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
}

async function getDefinitions(db) {
  const row = (await db.query("SELECT value FROM workspace_settings WHERE setting_key=$1 AND active=true", [SETTING_KEY])).rows[0];
  return normalizeDefinitions(row?.value);
}

function normalizeValues(input, definitions, { allowEmpty = false } = {}) {
  const source = plain(input); const byKey = new Map(definitions.map((field) => [field.key, field])); const values = {};
  for (const [key, raw] of Object.entries(source)) {
    const field = byKey.get(key); if (!field) continue;
    if (field.type === "boolean") {
      if (raw === true || raw === false) values[key] = raw;
      else if (["yes", "true", "1"].includes(text(raw).toLowerCase())) values[key] = true;
      else if (["no", "false", "0"].includes(text(raw).toLowerCase())) values[key] = false;
      else if (allowEmpty && raw === "") values[key] = null;
      continue;
    }
    const value = text(raw); if (!value) { if (allowEmpty) values[key] = null; continue; }
    if (field.type === "date" && !validDate(value)) continue;
    if (field.type === "number" && !Number.isFinite(Number(value.replace(/,/g, "")))) continue;
    if (field.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) continue;
    if (field.type === "phone" && String(value).replace(/\D/g, "").length < 7) continue;
    if (field.type === "url") { try { new URL(value); } catch { continue; } }
    values[key] = value.slice(0, 2000);
  }
  return values;
}

function mergeLeadValues(existing, incoming, definitions) {
  const base = plain(existing); const current = plain(base.lead_fields);
  return { ...base, lead_fields: { ...current, ...normalizeValues(incoming, definitions, { allowEmpty: true }) } };
}

async function saveDefinitions(db, actor, raw, ip) {
  const fields = normalizeDefinitions(raw, []);
  if (!fields.length) throw Object.assign(new Error("Keep at least one lead field."), { status: 400 });
  await db.transaction(async (tx) => {
    const previous = (await tx.query("SELECT value FROM workspace_settings WHERE setting_key=$1", [SETTING_KEY])).rows[0]?.value ?? null;
    await tx.query("INSERT INTO workspace_settings(setting_key,value,active,updated_by,updated_at) VALUES($1,$2::jsonb,true,$3,now()) ON CONFLICT(setting_key) DO UPDATE SET value=EXCLUDED.value,active=true,updated_by=EXCLUDED.updated_by,updated_at=now()", [SETTING_KEY, JSON.stringify(fields), actor.id]);
    await writeAudit(tx, { actorUserId: actor.id, action: "lead_fields.updated", entityType: "workspace_setting", entityId: SETTING_KEY, oldValue: JSON.stringify(previous), newValue: JSON.stringify(fields), ip });
  });
  return fields;
}

module.exports = { SETTING_KEY, DEFAULT_FIELDS, getDefinitions, normalizeDefinitions, normalizeValues, mergeLeadValues, saveDefinitions };
