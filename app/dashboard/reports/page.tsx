import { requireAdmin } from "@/app/lib/auth";
import { ActivityResolutionOverview } from "@/components/dashboard/activity-resolution-overview";

export const instant = false;

export default async function ReportsPage() {
  await requireAdmin();

  return <section className="mx-auto max-w-[1500px]">
    <ActivityResolutionOverview mode="admin" />
  </section>;
}
