import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/app/lib/supabase/admin";

// These are admin-managed definitions shared by every CRM user. They are safe
// to cache separately from a user's private lead records.
export async function getLeadSharedConfig() {
  "use cache";
  cacheLife("minutes");
  cacheTag("lead-shared-config");

  const supabase = createAdminClient();
  const [{ data: columns, error: columnsError }, { data: products }, { data: stages }, { data: resolutions }, { data: resolutionMappings }] = await Promise.all([
    supabase.from("lead_table_columns").select("id, field_key, label, field_type, options, is_visible, computed_from").order("position"),
    supabase.from("lead_products").select("id, code, name").eq("is_active", true).order("code"),
    supabase.from("lead_stages").select("id, product_id, name, position").eq("is_active", true).order("position"),
    supabase.from("lead_resolutions").select("id, name").order("name"),
    supabase.from("lead_product_resolutions").select("product_id, resolution_id"),
  ]);

  return { columns: columns ?? [], columnsError, products: products ?? [], stages: stages ?? [], resolutions: resolutions ?? [], resolutionMappings: resolutionMappings ?? [] };
}
