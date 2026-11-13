import { requireAdmin } from "@/app/lib/auth";
import { createAdminClient } from "@/app/lib/supabase/admin";
import { LeadsManagementApi, type ApiActivityLog } from "@/components/marketplace/leads-management-api";

export const instant = false;

export default async function CrmMarketPlacePage() {
  await requireAdmin();
  const admin = createAdminClient();
  const [{ data: apiKeys, error: apiKeysError }, { data: activityLogs, error: activityLogsError }] = await Promise.all([
    admin
      .from("crm_marketplace_api_keys")
      .select("id, name, key_prefix, key_last4, subscriptions, is_active, created_at, last_used_at")
      .order("created_at", { ascending: false }),
    admin
      .from("crm_marketplace_api_activity_logs")
      .select("id, api_key_name, method, action, service, success, status_code, lead_id, created_at, lead:leads(lead_number, first_name, last_name)")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  const databaseReady = !apiKeysError;
  const auditReady = !activityLogsError;

  return (
    <section className="mx-auto max-w-[1500px]">
      <p className="text-[10px] font-extrabold tracking-[0.12em] text-red-600">
        ADMIN
      </p>
      <h1 className="mt-0.5 text-[22px] font-extrabold tracking-[-0.04em] text-slate-900">
        CRM Market Place
      </h1>
      <p className="mt-1 text-sm text-slate-500">Manage integrations and API access for your CRM.</p>
      <div className="mt-5"><LeadsManagementApi apiKeys={(apiKeys ?? [])} databaseReady={databaseReady} apiActivityLogs={(activityLogs ?? []) as unknown as ApiActivityLog[]} auditReady={auditReady} /></div>
    </section>
  );
}
