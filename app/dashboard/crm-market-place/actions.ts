"use server";

import { createHash, randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/app/lib/auth";
import { createAdminClient } from "@/app/lib/supabase/admin";

const leadServices = ["database_leads", "reference_leads", "qualified_leads", "leads"] as const;
type LeadService = (typeof leadServices)[number];
type SubscriptionInput = Partial<Record<LeadService, { read?: boolean; write?: boolean }>>;

const isLeadService = (value: string): value is LeadService => leadServices.includes(value as LeadService);

export async function createMarketplaceLeadsApiKey(input: { name: string; subscriptions: SubscriptionInput }) {
  const admin = await requireAdmin();
  const name = input.name.trim().replace(/\s+/g, " ");
  if (!name || name.length > 100) return { ok: false as const, message: "Enter an API name between 1 and 100 characters." };

  const subscriptions = Object.fromEntries(
    Object.entries(input.subscriptions ?? {}).flatMap(([service, access]) => {
      if (!isLeadService(service)) return [];
      const read = Boolean(access?.read);
      const write = Boolean(access?.write);
      return read || write ? [[service, { read, write }]] : [];
    }),
  );
  if (!Object.keys(subscriptions).length)
    return { ok: false as const, message: "Choose read or write access for at least one lead service." };

  const apiKey = `altus_live_${randomBytes(32).toString("base64url")}`;
  const keyHash = createHash("sha256").update(apiKey).digest("hex");
  const { error } = await createAdminClient().from("crm_marketplace_api_keys").insert({
    name,
    key_hash: keyHash,
    key_prefix: apiKey.slice(0, 19),
    key_last4: apiKey.slice(-4),
    subscriptions,
    created_by: admin.userId,
  });
  if (error) return { ok: false as const, message: error.code === "42P01" ? "Run the CRM Market Place API migration first." : error.message };

  revalidatePath("/dashboard/crm-market-place");
  return { ok: true as const, apiKey, message: "API key created." };
}

export async function setMarketplaceLeadsApiKeyStatus(keyId: string, isActive: boolean) {
  await requireAdmin();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(keyId))
    return { ok: false as const, message: "Invalid API key." };
  const { error } = await createAdminClient().from("crm_marketplace_api_keys").update({ is_active: isActive, updated_at: new Date().toISOString() }).eq("id", keyId);
  if (error) return { ok: false as const, message: error.message };
  revalidatePath("/dashboard/crm-market-place");
  return { ok: true as const, message: isActive ? "API key enabled." : "API key paused." };
}
