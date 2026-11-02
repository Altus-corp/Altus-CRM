import { requireAdmin } from "@/app/lib/auth";
import { AdminSalesAnalytics } from "@/components/dashboard/admin-sales-analytics";

export const instant = false;

export default async function AdminOverviewPage() {
  await requireAdmin();

  return <AdminSalesAnalytics />;
}
