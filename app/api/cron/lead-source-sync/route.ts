import { createAdminClient } from "@/app/lib/supabase/admin";
import {
  syncAltusCorpQualifiedLeads,
  syncGoogleAppsScriptBssoLeads,
  syncGoogleAppsScriptPsoLeads,
  syncMananvasaQualifiedLeads,
  syncProductivityShastraQualifiedLeads,
} from "@/app/dashboard/leads/actions";

type SyncResult = {
  ok: boolean;
  message: string;
  imported?: number;
  updated?: number;
  skipped?: number;
};

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ ok: false, message: "Unauthorized." }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: adminRole, error: adminError } = await admin
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();
  if (adminError || !adminRole?.user_id) {
    return Response.json({ ok: false, message: "No CRM admin account is available to record synced leads." }, { status: 500 });
  }

  const sources: Array<{ source: string; run: (actorUserId: string) => Promise<SyncResult> }> = [
    { source: "Productivity Shastra", run: syncProductivityShastraQualifiedLeads },
    { source: "PSO Google Sheet", run: syncGoogleAppsScriptPsoLeads },
    { source: "BSSO Google Sheet", run: syncGoogleAppsScriptBssoLeads },
    { source: "Mananvasa", run: syncMananvasaQualifiedLeads },
    { source: "AltusCorp", run: syncAltusCorpQualifiedLeads },
  ];

  const results: Array<SyncResult & { source: string }> = [];
  for (const item of sources) {
    const result = await item.run(adminRole.user_id);
    results.push({ source: item.source, ...result });
  }

  const imported = results.reduce((total, item) => total + (item.imported ?? 0), 0);
  const updated = results.reduce((total, item) => total + (item.updated ?? 0), 0);
  const skipped = results.reduce((total, item) => total + (item.skipped ?? 0), 0);
  const failed = results.filter((item) => !item.ok);

  // Always respond 200 to the scheduler so an optional, unconfigured source
  // cannot trigger repeated runs. Each individual source outcome is returned.
  return Response.json({
    ok: true,
    partial: failed.length > 0,
    message: `Lead source sync completed: ${imported} added, ${updated} updated, ${skipped} skipped.${failed.length ? ` ${failed.length} source${failed.length === 1 ? "" : "s"} need attention.` : ""}`,
    imported,
    updated,
    skipped,
    results,
  });
}
