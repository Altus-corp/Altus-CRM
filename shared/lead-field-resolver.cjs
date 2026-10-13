"use strict";

const EMPTY_STRINGS = new Set(["not provided"]);

// All lead reads use this priority: real leads column, custom_values.lead_fields,
// custom_values, legacy_finance, then legacy camelCase aliases.
const FIELD_MAP = Object.freeze({
  leadNo: { column: "lead_no" },
  leadTypeCode: { column: "lead_type" },
  company: { column: "company", aliases: ["Company", "Company Name"] },
  cellNo: { columns: ["phone", "alternate_phone"], aliases: ["cell_no", "mobile", "Mobile", "Cell No"] },
  phone: { columns: ["phone", "alternate_phone"], aliases: ["cell_no", "mobile", "Mobile", "Cell No"] },
  email: { column: "email", aliases: ["Email", "Email ID"] },
  designation: { column: "designation", aliases: ["Designation"] },
  city: { columns: ["city", "location"], aliases: ["City", "Location"] },
  leadSource: { columns: ["lead_source", "lead_source_secondary"], aliases: ["leadSource", "Lead Source", "Source"] },
  sourceSystem: { column: "source_system" },
  permission: { column: "permission" },
  stage: { column: "stage" },
  lead_status: { column: "lead_status" },
  psoDate: { column: "pso_date" },
  lastCalledOn: { column: "last_call_at", custom: "last_called_on", aliases: ["lastCalledOn", "Last Called On"] },
  nextFollowUpAt: { column: "next_follow_up_at" },
  owner: { column: "owner_user_id" },
  isPrePsDone: { column: "is_pre_ps_done" },
  first_name: { column: "first_name", aliases: ["firstName", "First Name"] },
  last_name: { column: "last_name", aliases: ["lastName", "Last Name"] },
  leadAcquiredDate: { custom: "lead_acquisition_date", aliases: ["leadAcquiredDate", "leadAcquisitionDate", "Lead Acquisition Date"] },
  lead_acquisition_date: { custom: "lead_acquisition_date", aliases: ["leadAcquiredDate", "leadAcquisitionDate", "Lead Acquisition Date"] },
  businessCategory: { custom: "business_category", aliases: ["businessCategory", "Business Category"] },
  business_category: { custom: "business_category", aliases: ["businessCategory", "Business Category"] },
  industry: { custom: "industry", aliases: ["industryName", "Industry"] },
  natureOfBusiness: { custom: "nature_of_business", aliases: ["natureOfBusiness", "Nature of Business"] },
  nature_of_business: { custom: "nature_of_business", aliases: ["natureOfBusiness", "Nature of Business"] },
  proposedSolution: { custom: "proposed_solution", aliases: ["proposedSolution", "Proposed Solution"] },
  proposed_solution: { custom: "proposed_solution", aliases: ["proposedSolution", "Proposed Solution"] },
  inviteSentByIntroducer: { custom: "invite_sent_by_introducer", aliases: ["inviteSentByIntroducer", "Invite Sent by Introducer"] },
  invite_sent_by_introducer: { custom: "invite_sent_by_introducer", aliases: ["inviteSentByIntroducer", "Invite Sent by Introducer"] },
  inviteDateSent: { custom: "invite_date_sent", aliases: ["inviteDateSent", "Invite Date Sent"] },
  invite_date_sent: { custom: "invite_date_sent", aliases: ["inviteDateSent", "Invite Date Sent"] },
  introducerCallDone: { custom: "introducer_call_done", aliases: ["introducerCallDone", "Introducer Call Done"] },
  introducer_call_done: { custom: "introducer_call_done", aliases: ["introducerCallDone", "Introducer Call Done"] },
  introducerCallDate: { custom: "introducer_call_date", aliases: ["introducerCallDate", "Introducer Call Date"] },
  introducer_call_date: { custom: "introducer_call_date", aliases: ["introducerCallDate", "Introducer Call Date"] },
  introducerFeedback: { custom: "introducer_feedback", aliases: ["introducerFeedback", "Introducer Feedback"] },
  introducer_feedback: { custom: "introducer_feedback", aliases: ["introducerFeedback", "Introducer Feedback"] },
  introducerName: { custom: "introducer_name", aliases: ["introducerName", "Introducer Name"] },
  introducer_name: { custom: "introducer_name", aliases: ["introducerName", "Introducer Name"] },
  employeeName: { custom: "employee_name", aliases: ["employeeName", "Employee Name"] },
  employee_name: { custom: "employee_name", aliases: ["employeeName", "Employee Name"] },
  associationNetworkName: { custom: "association_network_name", aliases: ["associationNetworkName", "associationName", "Association/Network Name"] },
  association_network_name: { custom: "association_network_name", aliases: ["associationNetworkName", "associationName", "Association/Network Name"] },
  chapterName: { custom: "chapter_name", aliases: ["chapterName", "Chapter Name"] },
  chapter_name: { custom: "chapter_name", aliases: ["chapterName", "chapter", "Chapter Name"] },
  callingResolution: { custom: "calling_resolution", aliases: ["callingResolution", "Calling Resolution"] },
  calling_resolution: { custom: "calling_resolution", aliases: ["callingResolution", "Calling Resolution"] },
  nextCallOn: { custom: "next_call_on", aliases: ["nextCallOn", "Next Call On"] },
  next_call_on: { custom: "next_call_on", aliases: ["nextCallOn", "Next Call On"] },
  callingRemarks: { custom: "calling_remarks", aliases: ["callingRemarks", "Calling Remarks"] },
  calling_remarks: { custom: "calling_remarks", aliases: ["callingRemarks", "Calling Remarks"] },
  introVideoSent: { custom: "intro_video_sent", aliases: ["introVideoSent", "2 Mins Intro Video Sent"] },
  intro_video_sent: { custom: "intro_video_sent", aliases: ["introVideoSent", "2 Mins Intro Video Sent"] },
  emailSent: { custom: "email_sent", aliases: ["emailSent", "Email Sent"] },
  email_sent: { custom: "email_sent", aliases: ["emailSent", "Email Sent"] },
  whatsappMessageSent: { custom: "whatsapp_message_sent", aliases: ["whatsappMessageSent", "Msg Sent on Whatsapp"] },
  whatsapp_message_sent: { custom: "whatsapp_message_sent", aliases: ["whatsappMessageSent", "lastWhatsAppAt", "Msg Sent on Whatsapp"] },
  extraNotes: { custom: "extra_notes", aliases: ["extraNotes", "extraInfo", "Extra Notes"] },
  extra_notes: { custom: "extra_notes", aliases: ["extraNotes", "extraInfo", "Extra Notes"] },
  rating: { custom: "rating", aliases: ["leadRating", "Rating"] },
  created_at: { column: "created_at" },
  updated_at: { column: "updated_at" },
  last_opened_at: { column: "last_opened_at" },
});

function normalizeValue(value) {
  if (typeof value === "string" && EMPTY_STRINGS.has(value.trim().toLowerCase())) return null;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const key of ["value", "text", "display", "raw", "date", "label"]) {
      if (Object.prototype.hasOwnProperty.call(value, key) && (typeof value[key] !== "object" || value[key] === null)) return normalizeValue(value[key]);
    }
    return null;
  }
  return value === "" ? null : value;
}

function nestedObjectSources(value, output = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return output;
  const entries = Object.entries(value);
  if (entries.some(([, child]) => child && typeof child === "object" && !Array.isArray(child))) {
    output.push(value);
    for (const [, child] of entries) nestedObjectSources(child, output);
  }
  return output;
}

function resolveLeadValue(lead, key) {
  if (!lead) return null;
  if (key === "name") {
    const first = resolveLeadValue(lead, "first_name");
    const last = resolveLeadValue(lead, "last_name");
    if (first || last) return [first, last].filter(Boolean).join(" ");
    return normalizeValue(lead.name);
  }
  const definition = FIELD_MAP[key] || { custom: key };
  const columns = definition.columns || (definition.column ? [definition.column] : []);
  for (const column of columns) {
    if (lead[column] === undefined) continue;
    const value = normalizeValue(lead[column]);
    if (value !== null && value !== undefined) return value;
  }
  const workbookSources = nestedObjectSources(lead.custom_values?.mishtie_workbook);
  const sources = [lead.custom_values?.lead_fields, lead.custom_values, lead.legacy_finance, ...workbookSources];
  const keys = [definition.custom || key, ...(definition.aliases || [])];
  for (const source of sources) {
    if (!source || typeof source !== "object" || Array.isArray(source)) continue;
    for (const candidate of keys) {
      if (Object.prototype.hasOwnProperty.call(source, candidate)) {
        const value = normalizeValue(source[candidate]);
        if (value !== null && value !== undefined) return value;
      }
    }
  }
  return null;
}

function sqlExpression(key, alias = "l") {
  if (key === "name") return `COALESCE(NULLIF(CONCAT_WS(' ', NULLIF(${alias}.first_name,''), NULLIF(${alias}.last_name,'')), ''), NULLIF(${alias}.name,''))`;
  const definition = FIELD_MAP[key] || { custom: key };
  // Direct lead columns keep the existing indexed query path. Custom-backed
  // fields (and lastCalledOn, which has both sources) use the fallback chain.
  const columns = definition.columns || (definition.column ? [definition.column] : []);
  if (columns.length && !definition.custom) return columns.length === 1 ? `${alias}.${columns[0]}` : `COALESCE(${columns.map((column) => `${alias}.${column}`).join(", ")})`;
  const expressions = [];
  for (const column of columns) expressions.push(`${alias}.${column}`);
  const keys = [definition.custom || key, ...(definition.aliases || [])];
  for (const source of ["lead_fields", null, "legacy_finance"]) {
    for (const candidate of keys) {
      const escaped = String(candidate).replace(/'/g, "''");
      expressions.push(source ? `${alias}.custom_values->'${source}'->>'${escaped}'` : `${alias}.custom_values->>'${escaped}'`);
    }
  }
  return `NULLIF(NULLIF(COALESCE(${expressions.join(",")}), ''), 'Not provided')`;
}

module.exports = { FIELD_MAP, normalizeValue, resolveLeadValue, sqlExpression };
