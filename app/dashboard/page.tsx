import { requireUser } from "@/app/lib/auth";
import { isAmbassadorWorkspace } from "@/app/lib/roles";
import { AmbassadorDashboard } from "@/components/dashboard/ambassador-dashboard";
import { AdminSalesAnalytics } from "@/components/dashboard/admin-sales-analytics";
import { SalesExecutiveDashboard } from "@/components/dashboard/sales-executive-dashboard";
import { SalesManagerDashboard } from "@/app/dashboard/sales-manager/page";

export const instant = false;

export default async function DashboardPage() {
  const { roles } = await requireUser();
  if (isAmbassadorWorkspace(roles)) return <AmbassadorDashboard />;

  if (roles.includes("admin")) {
    return <AdminSalesAnalytics />;
  }

  if (roles.includes("sales_manager")) {
    return <SalesManagerDashboard />;
  }

  if (roles.includes("sales_executive")) {
    return <SalesExecutiveDashboard />;
  }

  return <section aria-label="Dashboard" />;
}
