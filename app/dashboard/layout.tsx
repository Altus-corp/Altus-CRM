import type { ReactNode } from "react";
import { connection } from "next/server";
import { requireUser } from "@/app/lib/auth";
import { getDashboardNavigation } from "@/app/lib/navigation";
import { createClient } from "@/app/lib/supabase/server";
import { DashboardShell } from "./dashboard-shell";

export const instant = false;

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  await connection();
  const { roles, userId } = await requireUser();
  const hasSalesWorkspace = roles.some((role) => role === "sales_executive" || role === "sales_manager" || role === "consultant");
  const now = new Date();
  const indiaNow = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const indiaDayStart = new Date(Date.UTC(indiaNow.getUTCFullYear(), indiaNow.getUTCMonth(), indiaNow.getUTCDate(), -5, -30));
  const indiaDayEnd = new Date(indiaDayStart.getTime() + 24 * 60 * 60 * 1000);
  const supabase = await createClient();
  const { count: todayAssignedLeads } = hasSalesWorkspace
    ? await supabase.from("leads").select("id", { count: "exact", head: true }).eq("assigned_to", userId).gte("assigned_at", indiaDayStart.toISOString()).lt("assigned_at", indiaDayEnd.toISOString())
    : { count: 0 };

  return (
    <DashboardShell navigation={getDashboardNavigation(roles)} roles={roles} todayAssignedLeads={todayAssignedLeads ?? 0}>
      {children}
    </DashboardShell>
  );
}
