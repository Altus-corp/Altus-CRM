import { redirect } from "next/navigation";
import { connection } from "next/server";
import { requireUser } from "@/app/lib/auth";
import { createClient } from "@/app/lib/supabase/server";
import { MessageTemplatesManager } from "@/components/templates/message-templates-manager";
import type { MessageTemplate } from "@/app/lib/message-templates";

export const instant = false;

export default async function MessageTemplatesPage() {
  await connection();
  const { userId, roles } = await requireUser();
  if (!roles.some((role) => role === "admin" || role === "sales_executive" || role === "sales_manager")) redirect("/dashboard");

  const supabase = await createClient();
  const [{ data: products }, { data: stages }, { data: templates, error }] = await Promise.all([
    supabase.from("lead_products").select("id, code, name").eq("is_active", true).order("code"),
    supabase.from("lead_stages").select("id, product_id, name, position").order("position"),
    supabase.from("lead_message_templates").select("id, product_id, stage_id, channel, name, subject, body, created_by, stage:lead_stages(name)").order("created_at"),
  ]);

  if (error) return <section className="mx-auto max-w-3xl rounded-xl bg-red-50 p-5 text-sm font-bold text-red-700">Templates are not available yet. Run the 20261030_create_lead_message_templates.sql migration in Supabase, then reload.</section>;

  const rows = (templates ?? []).map((template) => {
    const stage = Array.isArray(template.stage) ? template.stage[0] : template.stage;
    return { id: template.id, product_id: template.product_id, stage_id: template.stage_id, stage_name: stage?.name ?? null, channel: template.channel, name: template.name, subject: template.subject, body: template.body, created_by: template.created_by } as MessageTemplate;
  });

  return <MessageTemplatesManager products={products ?? []} stages={stages ?? []} templates={rows} userId={userId} isAdmin={roles.includes("admin")} />;
}
