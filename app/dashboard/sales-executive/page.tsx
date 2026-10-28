import { redirect } from "next/navigation";
import { requireUser } from "@/app/lib/auth";
import { SalesExecutiveDashboard } from "@/components/dashboard/sales-executive-dashboard";

export const instant = false;

export default async function SalesExecutivePage() {
  const { roles } = await requireUser();

  if (!roles.includes("sales_executive")) {
    redirect("/dashboard");
  }

  return <SalesExecutiveDashboard />;
}
