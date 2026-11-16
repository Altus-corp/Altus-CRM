import type { LeadColumn, LeadRow } from "@/components/leads/leads-table";
import { LEAD_ADDRESS_FIELD_DEFINITIONS, leadAddressFieldKeyForColumn } from "@/app/lib/lead-address-fields";

export function completeLeadDetailColumns(lead: LeadRow, columns: LeadColumn[]): LeadColumn[] {
  const normalizedLabel = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  const isPrimaryContactNameColumn = (column: LeadColumn) => {
    const names = [normalizedLabel(column.field_key), normalizedLabel(column.label)];
    return names.some((name) => ["firstname", "contactfirstname", "lastname", "contactlastname"].includes(name));
  };
  // Full Name is a calculated convenience column for the grid. In Details it
  // would repeat the Primary contact's First Name and Last Name, so show the
  // separate source fields there instead. Remove configured name variants so
  // the two canonical fields below are always displayed exactly once.
  const result = columns.filter((column) =>
    column.field_key !== "lead_name" &&
    !(["first_name", "last_name"].every((field) => column.computed_from?.includes(field))) &&
    !isPrimaryContactNameColumn(column),
  );
  const keys = new Set(result.map((column) => column.field_key));
  const hasSystemColumn = (key: "lead_number" | "lead_acquisition_date") => result.some((column) => key === "lead_number"
    ? column.field_key === key || ["leadno", "leadnumber"].includes(normalizedLabel(column.label))
    : column.field_key === key || normalizedLabel(column.label) === "leadacquisitiondate");
  const add = (key: string, label: string) => {
    if (keys.has(key) || (key === "lead_number" || key === "lead_acquisition_date") && hasSystemColumn(key)) return;
    keys.add(key);
    result.push({ id: `__detail_${key}`, field_key: key, label, field_type: "text", read_only: true });
  };
  // Core CRM information must remain available in Details even if an admin
  // hides it from the grid or has not yet added the corresponding table row.
  add("lead_number", "Lead no.");
  add("lead_acquisition_date", "Lead acquisition date");
  // The canonical lead row is always the Primary contact. Keep its name
  // split into First Name and Last Name; secondary contacts are shown by the
  // Details tab as a separate list.
  add("first_name", "First name");
  add("last_name", "Last name");
  add("email", "Email");
  add("phone", "Phone");
  add("product", "Product");
  add("stage", "Stage");
  add("call_resolution", "Activity resolution");
  add("assigned_to", "Sales person");
  add("assigned_at", "Assigned on");
  add("focused_on", "Focused on");
  add("last_called_on", "Last called on");
  add("next_follow_up", "Next follow up");
  add("created_at", "Created at");
  // Address information belongs in the Details workspace, not in every lead
  // grid. Add these built-in fields even when an admin has not created table
  // columns for them, while respecting an existing matching custom field.
  const configuredAddressFields = new Set(
    result
      .map((column) => leadAddressFieldKeyForColumn(column))
      .filter((key): key is NonNullable<typeof key> => Boolean(key)),
  );
  for (const field of LEAD_ADDRESS_FIELD_DEFINITIONS) {
    if (configuredAddressFields.has(field.field_key)) continue;
    keys.add(field.field_key);
    result.push({
      id: `__detail_${field.field_key}`,
      field_key: field.field_key,
      label: field.label,
      source: "custom",
      field_type: field.field_type,
      options: field.field_key === "country" ? ["India"] : [],
    });
  }
  for (const key of Object.keys(lead.custom_data ?? {})) {
    if (["firstname", "contactfirstname", "lastname", "contactlastname"].includes(normalizedLabel(key))) continue;
    add(key, key.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()));
  }
  return result;
}

export function storedDetailValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}
