import { createHash } from "crypto";
import { NextRequest } from "next/server";
import { createAdminClient } from "@/app/lib/supabase/admin";

const services = ["database_leads", "reference_leads", "qualified_leads", "leads"] as const;
type LeadService = (typeof services)[number];
type ApiKeyRow = {
  id: string;
  name: string;
  subscriptions: Record<string, { read?: boolean; write?: boolean }>;
};

const serviceLabels: Record<LeadService, string> = {
  database_leads: "Database Leads",
  reference_leads: "Reference Leads",
  qualified_leads: "Qualified Leads",
  leads: "Leads",
};

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function presentedKey(request: NextRequest) {
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  return bearer || request.headers.get("x-api-key")?.trim() || "";
}

async function recordApiActivity(supabase: ReturnType<typeof createAdminClient>, key: ApiKeyRow, success: boolean, statusCode: number, details: Record<string, unknown> = {}) {
  await supabase.from("crm_marketplace_api_activity_logs").insert({
    api_key_id: key.id,
    api_key_name: key.name,
    endpoint: "/api/marketplace/leads/config",
    method: "GET",
    action: "read_configuration",
    success,
    status_code: statusCode,
    details,
  });
}

export async function GET(request: NextRequest) {
  const apiKey = presentedKey(request);
  if (!apiKey) {
    return json({ ok: false, error: "Provide Authorization: Bearer API_KEY or x-api-key." }, 401);
  }

  const supabase = createAdminClient();
  const keyHash = createHash("sha256").update(apiKey).digest("hex");
  const { data, error } = await supabase
    .from("crm_marketplace_api_keys")
    .select("id, name, subscriptions")
    .eq("key_hash", keyHash)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    return json({ ok: false, error: error.code === "42P01" ? "CRM Market Place API is not configured yet." : "Unable to validate API key." }, 503);
  }
  if (!data) return json({ ok: false, error: "Invalid or paused API key." }, 401);

  const key = data as ApiKeyRow;
  const allowedServices = services.flatMap((id) => {
    const access = key.subscriptions?.[id];
    return access?.read || access?.write
      ? [{ id, label: serviceLabels[id], read: Boolean(access.read), write: Boolean(access.write) }]
      : [];
  });
  if (!allowedServices.length) {
    await recordApiActivity(supabase, key, false, 403, { error: "This API key does not have access to any lead service." });
    return json({ ok: false, error: "This API key does not have access to any lead service." }, 403);
  }

  const [{ data: products, error: productsError }, { data: stages, error: stagesError }] = await Promise.all([
    supabase.from("lead_products").select("id, code, name").eq("is_active", true).order("code"),
    supabase.from("lead_stages").select("product_id, name, position").eq("is_active", true).order("position"),
  ]);
  if (productsError || stagesError) {
    await recordApiActivity(supabase, key, false, 500, { error: "Unable to load active products and stages." });
    return json({ ok: false, error: "Unable to load active products and stages." }, 500);
  }

  await supabase.from("crm_marketplace_api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", key.id);
  await recordApiActivity(supabase, key, true, 200, { service_count: allowedServices.length, product_count: products?.length ?? 0, stage_count: stages?.length ?? 0 });

  return json({
    ok: true,
    services: allowedServices,
    products: (products ?? []).map((product) => ({
      code: product.code,
      name: product.name,
      stages: (stages ?? [])
        .filter((stage) => stage.product_id === product.id)
        .map((stage) => ({ name: stage.name, position: stage.position })),
    })),
  });
}
