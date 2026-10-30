import type { LeadColumn, LeadRow } from "@/components/leads/leads-table";

export function completeLeadDetailColumns(lead: LeadRow, columns: LeadColumn[]): LeadColumn[] {
  const result = [...columns];
  const keys = new Set(result.map((column) => column.field_key));
  const add = (key: string, label: string) => {
    if (keys.has(key)) return;
    keys.add(key);
    result.push({ id: `__detail_${key}`, field_key: key, label, field_type: "text", read_only: true });
  };
  if (!keys.has("lead_name")) add("first_name", "First name");
  add("last_name", "Contact last name");
  add("email", "Email");
  add("phone", "Phone");
  add("assigned_at", "Assigned on");
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
