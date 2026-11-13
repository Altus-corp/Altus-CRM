import { createHash } from "crypto";
import { revalidatePath } from "next/cache";
import { NextRequest } from "next/server";
import { createAdminClient } from "@/app/lib/supabase/admin";

const services = ["database_leads", "reference_leads", "qualified_leads", "leads"] as const;
type LeadService = (typeof services)[number];
type ApiKeyRow = { id: string; name: string; subscriptions: Record<string, { read?: boolean; write?: boolean }>; created_by: string | null };

const isService = (value: unknown): value is LeadService => typeof value === "string" && services.includes(value as LeadService);
const text = (value: unknown, limit = 500) => typeof value === "string" || typeof value === "number" ? String(value).trim().slice(0, limit) : "";
const one = <T,>(value: T | T[] | null) => Array.isArray(value) ? value[0] ?? null : value;
const json = (body: Record<string, unknown>, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function recordApiActivity(supabase: ReturnType<typeof createAdminClient>, key: ApiKeyRow, entry: { method: "GET" | "POST"; action: string; service?: LeadService; success: boolean; statusCode: number; leadId?: string; externalId?: string; details?: Record<string, unknown> }) {
  await supabase.from("crm_marketplace_api_activity_logs").insert({
    api_key_id: key.id,
    api_key_name: key.name,
    endpoint: "/api/marketplace/leads",
    method: entry.method,
    action: entry.action,
    service: entry.service ?? null,
    success: entry.success,
    status_code: entry.statusCode,
    lead_id: entry.leadId ?? null,
    external_id: entry.externalId ?? null,
    details: entry.details ?? {},
  });
}

function presentedKey(request: NextRequest) {
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  return bearer || request.headers.get("x-api-key")?.trim() || "";
}

async function authorize(request: NextRequest, service: LeadService, mode: "read" | "write") {
  const apiKey = presentedKey(request);
  if (!apiKey) return { error: json({ ok: false, error: "Provide Authorization: Bearer API_KEY or x-api-key." }, 401) };
  const keyHash = createHash("sha256").update(apiKey).digest("hex");
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("crm_marketplace_api_keys").select("id, name, subscriptions, created_by").eq("key_hash", keyHash).eq("is_active", true).maybeSingle();
  if (error) return { error: json({ ok: false, error: error.code === "42P01" ? "CRM Market Place API is not configured yet." : "Unable to validate API key." }, 503) };
  if (!data) return { error: json({ ok: false, error: "Invalid or paused API key." }, 401) };
  const key = data as ApiKeyRow;
  if (!key.subscriptions?.[service]?.[mode]) return { error: json({ ok: false, error: `This API key does not have ${mode} access to ${service}.` }, 403) };
  await supabase.from("crm_marketplace_api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", key.id);
  return { key, supabase };
}

export async function GET(request: NextRequest) {
  const service = request.nextUrl.searchParams.get("service");
  if (!isService(service)) return json({ ok: false, error: "service must be database_leads, reference_leads, qualified_leads, or leads." }, 400);
  const access = await authorize(request, service, "read");
  if (access.error) return access.error;
  const limit = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get("limit")) || 50));
  const page = Math.max(1, Number(request.nextUrl.searchParams.get("page")) || 1);
  const { data, error } = await access.supabase.from("leads").select("id, lead_number, first_name, last_name, email, phone, custom_data, created_at, updated_at, product:lead_products(code, name), stage:lead_stages(name)").eq("lead_database", service).order("created_at", { ascending: false }).range((page - 1) * limit, page * limit - 1);
  if (error) {
    await recordApiActivity(access.supabase, access.key, { method: "GET", action: "read_leads", service, success: false, statusCode: 500, details: { error: error.message } });
    return json({ ok: false, error: error.message }, 500);
  }
  await recordApiActivity(access.supabase, access.key, { method: "GET", action: "read_leads", service, success: true, statusCode: 200, details: { page, limit, returned_lead_count: data?.length ?? 0 } });
  return json({ ok: true, service, page, leads: (data ?? []).map((lead) => ({ ...lead, product: one(lead.product), stage: one(lead.stage) })) });
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return json({ ok: false, error: "Request body must be valid JSON." }, 400); }
  const service = body.service;
  if (!isService(service)) return json({ ok: false, error: "service must be database_leads, reference_leads, qualified_leads, or leads." }, 400);
  const access = await authorize(request, service, "write");
  if (access.error) return access.error;
  if (!access.key.created_by) return json({ ok: false, error: "This API key no longer has an owning CRM admin. Generate a replacement key." }, 409);
  const firstName = text(body.first_name ?? body.firstName, 120);
  const lastName = text(body.last_name ?? body.lastName, 120);
  const email = text(body.email, 254) || null;
  const phone = text(body.phone, 40) || null;
  const productCode = text(body.product_code ?? body.productCode, 80).toUpperCase();
  const stageName = text(body.stage_name ?? body.stageName, 120);
  const externalId = text(body.external_id ?? body.externalId, 180);
  const customData = body.custom_data ?? body.customData;
  if (!firstName || !productCode) {
    await recordApiActivity(access.supabase, access.key, { method: "POST", action: "create_lead", service, success: false, statusCode: 400, details: { error: "first_name and product_code are required." } });
    return json({ ok: false, error: "first_name and product_code are required." }, 400);
  }
  if (customData !== undefined && (!customData || typeof customData !== "object" || Array.isArray(customData))) {
    await recordApiActivity(access.supabase, access.key, { method: "POST", action: "create_lead", service, success: false, statusCode: 400, details: { error: "custom_data must be a JSON object.", product_code: productCode, external_id: externalId || null } });
    return json({ ok: false, error: "custom_data must be a JSON object." }, 400);
  }

  const { data: product, error: productError } = await access.supabase.from("lead_products").select("id, code").eq("code", productCode).eq("is_active", true).maybeSingle();
  if (productError || !product) {
    await recordApiActivity(access.supabase, access.key, { method: "POST", action: "create_lead", service, success: false, statusCode: 400, externalId: externalId || undefined, details: { error: `Active product ${productCode} was not found.`, product_code: productCode } });
    return json({ ok: false, error: `Active product ${productCode} was not found.` }, 400);
  }
  let stageId: string | null = null;
  if (stageName) {
    const { data: stage } = await access.supabase.from("lead_stages").select("id").eq("product_id", product.id).ilike("name", stageName).eq("is_active", true).maybeSingle();
    if (!stage) {
      await recordApiActivity(access.supabase, access.key, { method: "POST", action: "create_lead", service, success: false, statusCode: 400, externalId: externalId || undefined, details: { error: `Stage ${stageName} is not active for ${productCode}.`, product_code: productCode, stage_name: stageName } });
      return json({ ok: false, error: `Stage ${stageName} is not active for ${productCode}.` }, 400);
    }
    stageId = stage.id;
  } else {
    const { data: firstStage } = await access.supabase.from("lead_stages").select("id").eq("product_id", product.id).eq("is_active", true).order("position").limit(1).maybeSingle();
    stageId = firstStage?.id ?? null;
  }
  const externalSource = `crm_marketplace:${access.key.id}`;
  if (externalId) {
    const { data: existing } = await access.supabase.from("leads").select("id").eq("external_source", externalSource).eq("external_id", externalId).maybeSingle();
    if (existing) {
      await recordApiActivity(access.supabase, access.key, { method: "POST", action: "create_lead", service, success: false, statusCode: 409, leadId: existing.id, externalId, details: { error: "A lead with this external_id was already submitted using this API key.", product_code: productCode } });
      return json({ ok: false, error: "A lead with this external_id was already submitted using this API key.", lead_id: existing.id }, 409);
    }
  }
  const { data: lead, error: insertError } = await access.supabase.from("leads").insert({ first_name: firstName, last_name: lastName || null, email, phone, product_id: product.id, stage_id: stageId, custom_data: customData ?? {}, created_by: access.key.created_by, lead_database: service, external_source: externalSource, external_id: externalId || null }).select("id, lead_number, created_at").single();
  if (insertError) {
    const statusCode = insertError.code === "23505" ? 409 : 500;
    const errorMessage = insertError.code === "23505" ? "A lead with this phone number already exists." : insertError.message;
    await recordApiActivity(access.supabase, access.key, { method: "POST", action: "create_lead", service, success: false, statusCode, externalId: externalId || undefined, details: { error: errorMessage, product_code: productCode, stage_name: stageName || null } });
    return json({ ok: false, error: errorMessage }, statusCode);
  }
  const { data: assignment } = await access.supabase.from("lead_product_assignments").select("id").eq("lead_id", lead.id).eq("product_id", product.id).maybeSingle();
  await access.supabase.from("lead_activities").insert({ lead_id: lead.id, lead_product_assignment_id: assignment?.id ?? null, activity_type: "marketplace_api_lead_created", note: `Lead created through CRM Market Place API for ${service}.`, metadata: { marketplace_api_key_id: access.key.id, lead_database: service, product_code: product.code, external_id: externalId || null }, created_by: access.key.created_by });
  await recordApiActivity(access.supabase, access.key, { method: "POST", action: "create_lead", service, success: true, statusCode: 201, leadId: lead.id, externalId: externalId || undefined, details: { lead_number: lead.lead_number, product_code: product.code, stage_name: stageName || null } });
  revalidatePath("/dashboard/leads");
  revalidatePath("/dashboard");
  return json({ ok: true, message: "Lead created.", lead: { id: lead.id, lead_number: lead.lead_number, service, product_code: product.code, stage_name: stageName || null, created_at: lead.created_at } }, 201);
}
