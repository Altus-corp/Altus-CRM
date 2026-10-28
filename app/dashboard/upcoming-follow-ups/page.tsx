import { redirect } from "next/navigation";
import { connection } from "next/server";
import { requireUser } from "@/app/lib/auth";
import { createClient } from "@/app/lib/supabase/server";
import type { FollowUpItem } from "@/app/lib/sales-dashboard";
import { UpcomingFollowUps } from "./upcoming-follow-ups";

export const instant = false;

type Named = { name: string } | { name: string }[] | null;
type Coded = { code: string } | { code: string }[] | null;
type LeadInfo = { first_name: string; last_name: string | null; phone: string | null; email: string | null; custom_data: Record<string, unknown> | null };
type Row = { id: string; lead_id: string; next_follow_up_at: string; product: Coded; stage: Named; resolution: Named; lead: LeadInfo | LeadInfo[] | null };

const one = <T,>(value: T | T[] | null): T | null => (Array.isArray(value) ? value[0] ?? null : value);

export default async function UpcomingFollowUpsPage() {
  await connection();
  const { userId, roles } = await requireUser();

  if (!roles.includes("sales_executive")) {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  const [{ data, error }, { data: columns }] = await Promise.all([
    supabase.from("lead_product_assignments")
      .select("id, lead_id, next_follow_up_at, product:lead_products(code), stage:lead_stages(name), resolution:lead_resolutions(name), lead:leads(first_name, last_name, phone, email, custom_data)")
      .eq("assigned_to", userId).eq("is_active", true).eq("is_closed", false).not("next_follow_up_at", "is", null)
      .order("next_follow_up_at", { ascending: true }).limit(2000),
    supabase.from("lead_table_columns").select("field_key, label").eq("source", "custom"),
  ]);

  if (error) {
    return <section className="mx-auto max-w-3xl rounded-xl bg-red-50 p-5 text-sm font-bold text-red-700">Your follow-ups could not be loaded. Please refresh the page.</section>;
  }

  const companyKey = (columns ?? []).find((column) => /company|organi[sz]ation|business|firm/i.test(column.label))?.field_key;
  const items: FollowUpItem[] = ((data ?? []) as unknown as Row[]).flatMap((row) => {
    const lead = one(row.lead);
    if (!lead || Number.isNaN(new Date(row.next_follow_up_at).getTime())) return [];
    const company = companyKey ? lead.custom_data?.[companyKey] : null;
    return [{
      assignmentId: row.id,
      leadId: row.lead_id,
      name: [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Unnamed lead",
      company: typeof company === "string" && company.trim() ? company.trim() : "—",
      phone: lead.phone,
      email: lead.email,
      product: one(row.product)?.code ?? "—",
      stage: one(row.stage)?.name ?? null,
      resolution: one(row.resolution)?.name ?? null,
      followUpAt: row.next_follow_up_at,
    }];
  });

  return <UpcomingFollowUps items={items} />;
}
