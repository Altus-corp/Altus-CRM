import { NextRequest } from "next/server";
import { requireUser } from "@/app/lib/auth";
import { createAdminClient } from "@/app/lib/supabase/admin";
import { displayProductCode } from "@/app/lib/product-display";

const text = (value: unknown) => typeof value === "string" || typeof value === "number" ? String(value) : "";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim().toLowerCase() ?? "";
  if (query.length < 2) return Response.json({ ok: true, results: [], users: [] });
  const user = await requireUser();
  const isAdmin = user.roles.includes("admin");
  const admin = createAdminClient();

  // Admins search every lead and Ambassador record system-wide; everyone else
  // is limited to the leads and Ambassadors assigned directly to them.
  let assignmentsQuery = admin
    .from("lead_product_assignments")
    .select("id, lead_id, product:lead_products(code, name), stage:lead_stages(name), resolution:lead_resolutions(name), lead:leads(first_name, last_name, email, phone, lead_number, custom_data)")
    .eq("is_active", true)
    .limit(1000);
  if (!isAdmin) assignmentsQuery = assignmentsQuery.eq("assigned_to", user.userId);
  const { data, error } = await assignmentsQuery;
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
    return [{ assignmentId: row.id, leadId: row.lead_id, name: [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Unnamed lead", phone: lead.phone ?? null, email: lead.email ?? null, product: product?.code ? displayProductCode(product.code) : null, stage: stage?.name ?? null, type: product?.code === "AMBASSADOR" ? "ambassador" as const : "lead" as const }];
  }).slice(0, 20);

  // Only admins can look up CRM users (the people who log into this system),
  // not leads or Ambassadors themselves.
  let users: { id: string; name: string; email: string | null; phone: string | null }[] = [];
  if (isAdmin) {
    const { data: authData, error: authError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (authError) return Response.json({ ok: false, error: "Users could not be loaded." }, { status: 500 });
    const userIds = authData.users.map((item) => item.id);
    const { data: profiles, error: profilesError } = userIds.length
      ? await admin.from("profiles").select("id, first_name, last_name, full_name, phone").in("id", userIds)
      : { data: [], error: null };
    if (profilesError) return Response.json({ ok: false, error: "Users could not be loaded." }, { status: 500 });
    const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
    users = authData.users.flatMap((authUser) => {
      const profile = profileById.get(authUser.id);
      const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || profile?.full_name || authUser.email || "Unnamed user";
      const haystack = [name, authUser.email, profile?.phone].map(text).join(" ").toLowerCase();
      if (!haystack.includes(query)) return [];
      return [{ id: authUser.id, name, email: authUser.email ?? null, phone: profile?.phone ?? null }];
    }).slice(0, 20);
  }

  return Response.json({ ok: true, results, users });
}
