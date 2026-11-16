import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/app/lib/supabase/admin";

type LeadTableColumn = { field_key: string; label: string };

function normalizedColumnName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function systemColumnKey(column: LeadTableColumn) {
  if (column.field_key === "lead_number" || ["leadno", "leadnumber"].includes(normalizedColumnName(column.label))) return "lead_number";
  if (column.field_key === "lead_acquisition_date" || normalizedColumnName(column.label) === "leadacquisitiondate") return "lead_acquisition_date";
  return null;
}

// Older projects can contain a manually-created column with the same label as
// these built-in fields. Prefer the canonical system field and do not render a
// duplicate under a legacy custom key.
export function withoutDuplicateSystemColumns<T extends LeadTableColumn>(columns: T[]) {
  const canonicalKeys = new Set(columns.filter((column) => ["lead_number", "lead_acquisition_date"].includes(column.field_key)).map((column) => column.field_key));
  const seen = new Set<string>();
  return columns.filter((column) => {
    const key = systemColumnKey(column);
    if (!key) return true;
    if (canonicalKeys.has(key)) return column.field_key === key;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// These are admin-managed definitions shared by every CRM user. They are safe
// to cache separately from a user's private lead records.
export async function getLeadSharedConfig() {
  "use cache";
  cacheLife("minutes");
  cacheTag("lead-shared-config");

  const supabase = createAdminClient();
  const [{ data: columns, error: columnsError }, { data: products }, { data: stages }, { data: resolutions }, { data: resolutionMappings }] = await Promise.all([
    supabase.from("lead_table_columns").select("id, field_key, label, source, field_type, options, is_visible, computed_from").order("position"),
    supabase.from("lead_products").select("id, code, name").eq("is_active", true).order("code"),
    supabase.from("lead_stages").select("id, product_id, name, position").eq("is_active", true).order("position"),
    supabase.from("lead_resolutions").select("id, name").order("name"),
    supabase.from("lead_product_resolutions").select("product_id, resolution_id"),
  ]);

  return { columns: withoutDuplicateSystemColumns(columns ?? []), columnsError, products: products ?? [], stages: stages ?? [], resolutions: resolutions ?? [], resolutionMappings: resolutionMappings ?? [] };
}
