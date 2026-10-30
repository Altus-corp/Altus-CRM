import { NextRequest } from "next/server";
import { requireUser } from "@/app/lib/auth";
import { createAdminClient } from "@/app/lib/supabase/admin";

const text = (value: unknown) => typeof value === "string" || typeof value === "number" ? String(value) : "";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim().toLowerCase() ?? "";
  if (query.length < 2) return Response.json({ ok: true, results: [] });
  const { userId } = await requireUser();
  const { data, error } = await createAdminClient()
    .from("lead_product_assignments")
    .select("id, lead_id, product:lead_products(code, name), stage:lead_stages(name), resolution:lead_resolutions(name), lead:leads(first_name, last_name, email, phone, lead_number, custom_data)")
    .eq("assigned_to", userId)
    .eq("is_active", true)
    .limit(1000);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  const results = (data ?? []).flatMap((row) => {
    const lead = Array.isArray(row.lead) ? row.lead[0] : row.lead;
    const product = Array.isArray(row.product) ? row.product[0] : row.product;
    const stage = Array.isArray(row.stage) ? row.stage[0] : row.stage;
    const resolution = Array.isArray(row.resolution) ? row.resolution[0] : row.resolution;
    if (!lead) return [];
    const resolutionName = resolution?.name?.trim().toLowerCase().replace(/[,_-]+/g, " ").replace(/\s+/g, " ") ?? "";
    if (["dnd", "not interested", "wrong number", "old graduate"].includes(resolutionName)) return [];
    const haystack = [lead.first_name, lead.last_name, lead.email, lead.phone, lead.lead_number ? `L-${lead.lead_number}` : "", product?.code, product?.name, stage?.name, resolution?.name, JSON.stringify(lead.custom_data ?? {})].map(text).join(" ").toLowerCase();
    if (!haystack.includes(query)) return [];
    return [{ assignmentId: row.id, leadId: row.lead_id, name: [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Unnamed lead", phone: lead.phone ?? null, email: lead.email ?? null, product: product?.code ?? null, stage: stage?.name ?? null }];
  }).slice(0, 20);
  return Response.json({ ok: true, results });
}
