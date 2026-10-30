import { requireUser } from "@/app/lib/auth";
import { isAmbassadorWorkspace } from "@/app/lib/roles";
import { AmbassadorDashboard } from "@/components/dashboard/ambassador-dashboard";
import { AdminCallingCard } from "@/components/dashboard/admin-calling-card";
import { SalesExecutiveDashboard } from "@/components/dashboard/sales-executive-dashboard";

export const instant = false;

export default async function DashboardPage() {
  const { roles } = await requireUser();
  if (isAmbassadorWorkspace(roles)) return <AmbassadorDashboard />;

  if (roles.includes("admin")) {
    return <AdminCallingCard />;
  }

  if (roles.includes("sales_executive")) {
    return <SalesExecutiveDashboard />;
  }

  return <section aria-label="Dashboard" />;
}
