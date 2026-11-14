import type { ReactNode } from "react";
import { connection } from "next/server";
import { requireUser } from "@/app/lib/auth";
import { isAmbassadorWorkspace, ROLE_LABELS } from "@/app/lib/roles";
import { getAmbassadorOwner } from "@/app/lib/ambassador-owner";
import { getDashboardNavigation } from "@/app/lib/navigation";
import { createClient } from "@/app/lib/supabase/server";
import { getLeadSharedConfig } from "@/app/lib/lead-shared-config";
import { DashboardShell } from "./dashboard-shell";

export const instant = false;

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  await connection();
  const { roles, userId, displayName, email } = await requireUser();
  const roleLabel = roles.map((role) => ROLE_LABELS[role]).join(" · ");
  const ambassadorOwner = isAmbassadorWorkspace(roles) ? await getAmbassadorOwner() : undefined;
  const hasSalesWorkspace = !isAmbassadorWorkspace(roles) && roles.some((role) => role === "sales_executive" || role === "sales_manager" || role === "consultant");
  const supabase = await createClient();
  const indiaDateParts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const indiaDate = [indiaDateParts.find((part) => part.type === "year")?.value, indiaDateParts.find((part) => part.type === "month")?.value, indiaDateParts.find((part) => part.type === "day")?.value].join("-");
  // The Products submenu is available to Admin, Sales Executives, and Sales
  // Managers, so each needs the shared active-product configuration.
  const sharedConfigPromise = !isAmbassadorWorkspace(roles) && roles.some((role) => role === "admin" || role === "sales_executive" || role === "sales_manager")
    ? getLeadSharedConfig()
    : Promise.resolve(null);
  // This single-row counter is maintained by a database trigger. Retain the
  // exact-count fallback only until the accompanying migration is applied.
  const focusedCountPromise = hasSalesWorkspace
    ? supabase.from("lead_focused_assignment_counts").select("assignment_count").eq("user_id", userId).eq("focused_on", indiaDate).maybeSingle()
    : Promise.resolve({ data: null, error: null });
  const [sharedConfig, focusedCountResult] = await Promise.all([sharedConfigPromise, focusedCountPromise]);
  const focusedCountFallback = hasSalesWorkspace && focusedCountResult.error
    ? await supabase.from("lead_product_assignments").select("id", { count: "exact", head: true }).eq("assigned_to", userId).eq("focused_on", indiaDate).eq("is_active", true)
    : null;
  const todayAssignedLeads = Number(focusedCountResult.data?.assignment_count ?? focusedCountFallback?.count ?? 0);

  return (
    <DashboardShell navigation={getDashboardNavigation(roles)} roles={roles} displayName={displayName} email={email} roleLabel={roleLabel} ambassadorOwnerLabel={ambassadorOwner?.label} ambassadorOwnerPhone={ambassadorOwner?.phone} todayAssignedLeads={todayAssignedLeads} products={sharedConfig?.products ?? []}>
      {children}
    </DashboardShell>
  );
}
