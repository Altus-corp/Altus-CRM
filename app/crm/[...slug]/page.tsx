import { connection } from "next/server";
import { requireUser } from "@/app/lib/auth";
import { loadWorkspace } from "@/app/lib/crm2/workspace";
import { CrmApp } from "@/components/crm2/CrmApp";

export const instant = false;

// One server load per visit; after that every page/dashboard switch is instant on the client.
export default async function CrmPage({ params }: { params: Promise<{ slug: string[] }> }) {
  await connection();
  const user = await requireUser();
  const { slug } = await params;
  const workspace = await loadWorkspace(user);
  return <CrmApp initial={workspace} initialRoute={{ module: slug[0] ?? "dashboards", page: slug[1] ?? "" }} />;
}
