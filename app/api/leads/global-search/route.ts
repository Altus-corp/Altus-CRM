import { NextRequest } from "next/server";
import { requireUser } from "@/app/lib/auth";
import { createAdminClient } from "@/app/lib/supabase/admin";
import { displayProductCode } from "@/app/lib/product-display";

const text = (value: unknown) => (typeof value === "string" || typeof value === "number" ? String(value) : "");

/** Global Search over EVERY lead in the CRM (every product, Ambassador leads, Uncategorized) regardless of
 * who's assigned to it — unlike the normal workspace, which is scoped to what the viewer may edit. Visibility
 * here is intentionally wider than edit rights: finding a lead doesn't mean you can touch it, except claiming
 * it via claimUnassignedLeadAssignment when it has no owner yet. */
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim().toLowerCase() ?? "";
  if (query.length < 2) return Response.json({ ok: true, results: [] });
  await requireUser();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("lead_product_assignments")
    .select("id, lead_id, assigned_to, is_ambassador, product:lead_products(code), stage:lead_stages(name), lead:leads(first_name, last_name, email, phone, lead_number, custom_data, ambassador_imported_by)")
    .eq("is_active", true)
    .limit(4000);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  const matches = (data ?? []).flatMap((row) => {
    const lead = Array.isArray(row.lead) ? row.lead[0] : row.lead;
    const product = Array.isArray(row.product) ? row.product[0] : row.product;
    const stage = Array.isArray(row.stage) ? row.stage[0] : row.stage;
    if (!lead) return [];
    const haystack = [lead.first_name, lead.last_name, lead.email, lead.phone, lead.lead_number ? `L-${lead.lead_number}` : "", product?.code, stage?.name, JSON.stringify(lead.custom_data ?? {})].map(text).join(" ").toLowerCase();
    if (!haystack.includes(query)) return [];
    return [{
      assignmentId: row.id, leadId: row.lead_id,
      name: [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Unnamed lead",
      phone: lead.phone ?? null, email: lead.email ?? null,
      product: product?.code ? displayProductCode(product.code) : "Uncategorized",
      isAmbassadorProduct: product?.code === "AMBASSADOR",
      assignedToId: row.assigned_to ?? null,
      ambassadorImporterId: text(lead.ambassador_imported_by) || null,
    }];
  }).slice(0, 30);

  const ownerIds = [...new Set(matches.map((m) => m.assignedToId).filter((id): id is string => Boolean(id)))];
  const importerIds = [...new Set(matches.map((m) => m.ambassadorImporterId).filter((id): id is string => Boolean(id)))];
  const [ownerProfiles, importerRoles, importerProfiles] = await Promise.all([
    ownerIds.length ? admin.from("profiles").select("id, first_name, last_name, full_name").in("id", ownerIds) : Promise.resolve({ data: [] }),
    importerIds.length ? admin.from("user_roles").select("user_id").eq("role", "ambassador").in("user_id", importerIds) : Promise.resolve({ data: [] }),
    importerIds.length ? admin.from("profiles").select("id, first_name, last_name, full_name").in("id", importerIds) : Promise.resolve({ data: [] }),
  ]);
  const nameOf = (p?: { first_name: string | null; last_name: string | null; full_name: string | null }) => p ? [p.first_name, p.last_name].filter(Boolean).join(" ") || p.full_name || null : null;
  const ownerById = new Map((ownerProfiles.data ?? []).map((p) => [p.id, nameOf(p)]));
  const ambassadorRoleIds = new Set((importerRoles.data ?? []).map((r) => r.user_id));
  const importerById = new Map((importerProfiles.data ?? []).map((p) => [p.id, nameOf(p)]));

  const results = matches.map((m) => ({
    assignmentId: m.assignmentId, leadId: m.leadId, name: m.name, phone: m.phone, email: m.email,
    product: m.product, isAmbassadorProduct: m.isAmbassadorProduct,
    assignedToId: m.assignedToId, assignedToName: m.assignedToId ? ownerById.get(m.assignedToId) ?? null : null,
    ambassadorName: m.ambassadorImporterId && ambassadorRoleIds.has(m.ambassadorImporterId) ? importerById.get(m.ambassadorImporterId) ?? null : null,
  }));
  return Response.json({ ok: true, results });
}
