import { requireAdmin } from "@/app/lib/auth";
import { istTodayKey } from "@/app/lib/altus-call-utils";
import { CallReport } from "./call-report";

export const instant = false;

export default async function CallReportPage() {
  await requireAdmin();

  return <CallReport todayKey={istTodayKey()} />;
}
