export type ExternalLeadSourceDefinition = {
  id: string;
  label: string;
  externalSource: string;
  endpointEnv: string;
  apiKeyEnv: string;
  endpoint: string;
  productCode: string;
  stageName: string;
  leadDatabase: "qualified_leads";
  externalIdSourceFields: string[];
  scheduleSourceFields: string[];
  messageSourceFields: string[];
};

// Each incoming API is declared here. New sources can reuse the generic sync
// pipeline in the Leads actions without changing the CRM data model.
export const externalLeadSources = {
  google_apps_script_pso: {
    id: "google_apps_script_pso",
    label: "PSO Google Sheet",
    externalSource: "google_apps_script_pso",
    endpointEnv: "GOOGLE_APPS_SCRIPT_PSO_LEADS_URL",
    apiKeyEnv: "GOOGLE_APPS_SCRIPT_PSO_LEADS_KEY",
    endpoint: "https://script.google.com/macros/s/AKfycbxzf9-JIftEW6OMhzdpELKpvbLU_18zXV2ru4tVLYu_yeWqp26hku5KBBndUa14V3Sr/exec",
    productCode: "PSO",
    stageName: "Pre PSO",
    leadDatabase: "qualified_leads",
    externalIdSourceFields: ["Timestamp", "timestamp", "Response ID", "response_id"],
    scheduleSourceFields: ["Event Date", "event_date", "eventDate"],
    messageSourceFields: ["Form Message", "form_message", "message", "Message", "remarks", "Remarks"],
  },
  google_apps_script_bsso: {
    id: "google_apps_script_bsso",
    label: "BSSO Google Sheet",
    externalSource: "google_apps_script_bsso",
    endpointEnv: "GOOGLE_APPS_SCRIPT_BSSO_LEADS_URL",
    apiKeyEnv: "GOOGLE_APPS_SCRIPT_BSSO_LEADS_KEY",
    endpoint: "https://script.google.com/macros/s/AKfycbwHJmxFcvNlOA1OyFW84xUcMtBPhtAUL9LBaJ4J4I86vssKBtv6trsx67b0MaccuCbffw/exec",
    productCode: "BSSO",
    stageName: "Pre BSSO",
    leadDatabase: "qualified_leads",
    externalIdSourceFields: ["Registered At", "registered_at", "registeredAt", "Timestamp", "timestamp"],
    scheduleSourceFields: ["Session", "session", "Session Date", "session_date", "event_date"],
    messageSourceFields: ["Form Message", "form_message", "message", "Message", "remarks", "Remarks"],
  },
} satisfies Record<string, ExternalLeadSourceDefinition>;

export type ExternalLeadRecord = Record<string, unknown>;

export function externalLeadRecords(payload: unknown): ExternalLeadRecord[] {
  if (Array.isArray(payload)) return payload.filter(isRecord);
  if (!isRecord(payload)) return [];
  for (const candidate of [payload.data, payload.leads, payload.items, payload.results, payload.rows]) {
    if (Array.isArray(candidate)) return candidate.filter(isRecord);
    if (isRecord(candidate)) {
      for (const nested of [candidate.data, candidate.leads, candidate.items, candidate.results, candidate.rows]) {
        if (Array.isArray(nested)) return nested.filter(isRecord);
      }
    }
  }
  if (sourceRecordValue(payload, ["id", "lead id", "name", "first name", "email", "phone"])) return [payload];
  return [];
}

export function sourceText(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

export function sourceLeadName(record: ExternalLeadRecord) {
  const rawName = sourceRecordValue(record, ["first_name", "firstName", "first name", "name", "full_name", "fullName", "full name"]);
  const lastName = sourceRecordValue(record, ["last_name", "lastName", "last name"]);
  if (lastName || !rawName.includes(" ")) return { firstName: rawName, lastName };
  const [firstName, ...rest] = rawName.split(/\s+/);
  return { firstName, lastName: rest.join(" ") };
}

export function sourceLeadPhone(record: ExternalLeadRecord) {
  const explicitValue = sourceRecordValue(record, ["phone", "phone_number", "phoneNumber", "phone number", "mobile", "mobile_number", "mobile number", "mobile no", "cell_number", "cell number", "cell no", "contact", "contact number", "contact no"]);
  if (explicitValue) return explicitValue;
  // Google Forms headers are editable, so also support variants such as
  // "WhatsApp / Contact No." without requiring a connector code change.
  for (const [key, value] of Object.entries(record)) {
    if (/(phone|mobile|cell|contact|whatsapp)/.test(normalizeFieldName(key))) {
      const text = sourceText(value);
      if (text) return text;
    }
  }
  return null;
}

export function sourceLeadEmail(record: ExternalLeadRecord) {
  return sourceRecordValue(record, ["email", "email_address", "emailAddress", "email address"]) || null;
}

export function sourceLeadId(record: ExternalLeadRecord, firstName: string, phone: string | null, email: string | null, sourceIdFields: string[] = []) {
  const explicitId = sourceRecordValue(record, [...sourceIdFields, "id", "lead_id", "leadId", "lead id", "uuid", "row_id", "rowId", "row id"]);
  if (explicitId) return explicitId;
  // Some Sheets feeds have no row ID. A stable fallback makes subsequent syncs idempotent.
  return [phone?.replace(/\D/g, ""), email?.toLowerCase(), firstName.toLowerCase()].filter(Boolean).join(":");
}

export function sourceRecordValue(record: ExternalLeadRecord, names: string[]) {
  for (const name of names) {
    const direct = sourceText(record[name]);
    if (direct) return direct;
  }
  const normalizedNames = new Set(names.map(normalizeFieldName));
  for (const [key, value] of Object.entries(record)) {
    if (normalizedNames.has(normalizeFieldName(key))) {
      const text = sourceText(value);
      if (text) return text;
    }
  }
  return "";
}

function normalizeFieldName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ");
}

export function configuredSourceUrl(source: ExternalLeadSourceDefinition) {
  const endpoint = (process.env[source.endpointEnv] || source.endpoint).trim();
  const apiKey = process.env[source.apiKeyEnv]?.trim();
  if (!apiKey) return null;
  const url = new URL(endpoint);
  url.searchParams.set("key", apiKey);
  return url;
}

function isRecord(value: unknown): value is ExternalLeadRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
