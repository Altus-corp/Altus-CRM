import { requireUser } from "@/app/lib/auth";

export const instant = false;

export default async function DashboardPage() {
  await requireUser();

  return <section aria-label="Dashboard" />;
}
