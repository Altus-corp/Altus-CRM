import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/app/lib/auth";
import { getDashboardNavigation } from "@/app/lib/navigation";

export const instant = false;

type WorkspacePageProps = {
  params: Promise<{ workspace: string }>;
};

export default async function WorkspacePage({ params }: WorkspacePageProps) {
  const { workspace } = await params;
  const { roles } = await requireUser();
  const href = `/dashboard/${workspace}`;
  const workspaceItem = getDashboardNavigation(roles).find(
    (item) => item.href === href,
  );

  if (!workspaceItem) {
    notFound();
  }

  if (
    [
      "admin",
      "sales-manager",
      "sales-executive",
      "consultant",
      "marketing-manager",
      "marketing-executive",
    ].includes(workspace)
  ) {
    const matchingRole = workspace.replaceAll("-", "_");

    if (!roles.includes(matchingRole as (typeof roles)[number])) {
      redirect("/dashboard");
    }
  }

  return (
    <section aria-label={workspaceItem.label} />
  );
}
