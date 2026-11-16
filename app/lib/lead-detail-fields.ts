import type { LeadColumn, LeadRow } from "@/components/leads/leads-table";

export function completeLeadDetailColumns(lead: LeadRow, columns: LeadColumn[]): LeadColumn[] {
  const result = [...columns];
  const keys = new Set(result.map((column) => column.field_key));
  const normalizedLabel = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
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
  if (!keys.has("lead_name")) add("first_name", "First name");
  add("last_name", "Contact last name");
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
  for (const key of Object.keys(lead.custom_data ?? {})) {
    add(key, key.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()));
  }
  return result;
}

export function storedDetailValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}
