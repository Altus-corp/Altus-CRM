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
  // The Products submenu is available to both Sales Executives and Sales
  // Managers, so both roles need the shared active-product configuration.
  const sharedConfig = !isAmbassadorWorkspace(roles) && roles.some((role) => role === "sales_executive" || role === "sales_manager")
    ? await getLeadSharedConfig()
    : null;
  const { count: todayAssignedLeads } = hasSalesWorkspace
    ? await supabase.from("lead_product_assignments").select("id", { count: "exact", head: true }).eq("assigned_to", userId).eq("focused_on", indiaDate).eq("is_active", true)
    : { count: 0 };

  return (
    <DashboardShell navigation={getDashboardNavigation(roles)} roles={roles} displayName={displayName} email={email} roleLabel={roleLabel} ambassadorOwnerLabel={ambassadorOwner?.label} ambassadorOwnerPhone={ambassadorOwner?.phone} todayAssignedLeads={todayAssignedLeads ?? 0} products={sharedConfig?.products ?? []}>
      {children}
    </DashboardShell>
  );
}
