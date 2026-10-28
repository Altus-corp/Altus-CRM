import { requireAdmin } from "@/app/lib/auth";
import { AdminCallingCard } from "@/components/dashboard/admin-calling-card";

export const instant = false;

export default async function AdminOverviewPage() {
  await requireAdmin();

  return <AdminCallingCard />;
}
