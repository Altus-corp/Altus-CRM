"use server";

import { requireAdmin } from "@/app/lib/auth";
import { createAdminClient } from "@/app/lib/supabase/admin";

const PAGE_SIZE = 1000;
const MAX_PAGES = 200;

export type ExportRow = {
  assignmentId: string;
  leadId: string;
  leadNumber: number | null;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  productCode: string | null;
  stage: string | null;
  resolution: string | null;
  assignedTo: string | null;
  assignedAt: string | null;
  focusedOn: string | null;
  nextFollowUpAt: string | null;
  isActive: boolean | null;
  isClosed: boolean | null;
  createdAt: string | null;
  externalSource: string | null;
  externalId: string | null;
  leadDatabase: string | null;
  customData: Record<string, unknown>;
  ambassador?: {
    agreementStatus: string | null;
    commission: number | null;
    commissionNotes: string | null;
    priority: number | null;
    signedAgreementLink: string | null;
    lastCalledOn: string | null;
    lastCallNotes: string | null;
    remark: string | null;
    mananSirNotes: string | null;
    targetLeads: number | null;
    targetDemo: number | null;
    targetProposals: number | null;
    targetSales: number | null;
    actualLeads: number | null;
    actualDemo: number | null;
    actualProposals: number | null;
    actualSales: number | null;
  };
};

type AssignmentRow = {
  id: string;
  lead_id: string;
  assigned_to: string | null;
  assigned_at: string | null;
  focused_on: string | null;
  next_follow_up_at: string | null;
  is_active: boolean | null;
  is_closed: boolean | null;
  is_ambassador: boolean | null;
  ambassador_agreement_status: string | null;
  ambassador_commission: number | null;
  ambassador_commission_notes: string | null;
  ambassador_priority: number | null;
  ambassador_signed_agreement_link: string | null;
  ambassador_last_called_on: string | null;
  ambassador_last_call_notes: string | null;
  ambassador_remark: string | null;
  ambassador_manan_sir_notes: string | null;
  ambassador_target_leads: number | null;
  ambassador_target_demo: number | null;
  ambassador_target_proposals: number | null;
  ambassador_target_sales: number | null;
  ambassador_actual_leads: number | null;
  ambassador_actual_demo: number | null;
  ambassador_actual_proposals: number | null;
  ambassador_actual_sales: number | null;
  product: { code: string } | { code: string }[] | null;
  stage: { name: string } | { name: string }[] | null;
  resolution: { name: string } | { name: string }[] | null;
  lead:
    | {
        lead_number: number | null;
        first_name: string;
        last_name: string | null;
        email: string | null;
        phone: string | null;
        custom_data: Record<string, unknown> | null;
        external_source: string | null;
        external_id: string | null;
        lead_database: string | null;
        created_at: string | null;
      }
    | {
        lead_number: number | null;
        first_name: string;
        last_name: string | null;
        email: string | null;
        phone: string | null;
        custom_data: Record<string, unknown> | null;
        external_source: string | null;
        external_id: string | null;
        lead_database: string | null;
        created_at: string | null;
      }[]
    | null;
};

const one = <T,>(value: T | T[] | null): T | null => (Array.isArray(value) ? value[0] ?? null : value);

export async function getLeadsAndAmbassadorsExport(): Promise<{
  ok: boolean;
  message?: string;
  customColumns?: { field_key: string; label: string }[];
  leads?: ExportRow[];
  ambassadors?: ExportRow[];
}> {
  try {
    await requireAdmin();
    const supabase = createAdminClient();

    const [{ data: customColumns, error: columnsError }, { data: profiles, error: profilesError }] = await Promise.all([
      supabase.from("lead_table_columns").select("field_key, label").eq("source", "custom").order("position"),
      supabase.from("profiles").select("id, first_name, last_name, full_name"),
    ]);
    if (columnsError) throw new Error(columnsError.message);
    if (profilesError) throw new Error(profilesError.message);
    const nameById = new Map(
      (profiles ?? []).map((profile) => [
        profile.id,
        [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.full_name || "Unassigned user",
      ]),
    );

    const leads: ExportRow[] = [];
    const ambassadors: ExportRow[] = [];
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const offset = page * PAGE_SIZE;
      const { data, error } = await supabase
        .from("lead_product_assignments")
        .select(
          "id, lead_id, assigned_to, assigned_at, focused_on, next_follow_up_at, is_active, is_closed, is_ambassador, ambassador_agreement_status, ambassador_commission, ambassador_commission_notes, ambassador_priority, ambassador_signed_agreement_link, ambassador_last_called_on, ambassador_last_call_notes, ambassador_remark, ambassador_manan_sir_notes, ambassador_target_leads, ambassador_target_demo, ambassador_target_proposals, ambassador_target_sales, ambassador_actual_leads, ambassador_actual_demo, ambassador_actual_proposals, ambassador_actual_sales, product:lead_products(code), stage:lead_stages(name), resolution:lead_resolutions(name), lead:leads(lead_number, first_name, last_name, email, phone, custom_data, external_source, external_id, lead_database, created_at)",
        )
        .order("id")
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as unknown as AssignmentRow[];
      if (!rows.length) break;

      for (const row of rows) {
        const lead = one(row.lead);
        if (!lead) continue;
        const product = one(row.product);
        const stage = one(row.stage);
        const resolution = one(row.resolution);
        const exportRow: ExportRow = {
          assignmentId: row.id,
          leadId: row.lead_id,
          leadNumber: lead.lead_number,
          firstName: lead.first_name,
          lastName: lead.last_name,
          email: lead.email,
          phone: lead.phone,
          productCode: product?.code ?? null,
          stage: stage?.name ?? null,
          resolution: resolution?.name ?? null,
          assignedTo: row.assigned_to ? nameById.get(row.assigned_to) ?? row.assigned_to : null,
          assignedAt: row.assigned_at,
          focusedOn: row.focused_on,
          nextFollowUpAt: row.next_follow_up_at,
          isActive: row.is_active,
          isClosed: row.is_closed,
          createdAt: lead.created_at,
          externalSource: lead.external_source,
          externalId: lead.external_id,
          leadDatabase: lead.lead_database,
          customData:
            lead.custom_data && typeof lead.custom_data === "object" && !Array.isArray(lead.custom_data)
              ? (lead.custom_data as Record<string, unknown>)
              : {},
        };
        if (row.is_ambassador) {
          exportRow.ambassador = {
            agreementStatus: row.ambassador_agreement_status,
            commission: row.ambassador_commission,
            commissionNotes: row.ambassador_commission_notes,
            priority: row.ambassador_priority,
            signedAgreementLink: row.ambassador_signed_agreement_link,
            lastCalledOn: row.ambassador_last_called_on,
            lastCallNotes: row.ambassador_last_call_notes,
            remark: row.ambassador_remark,
            mananSirNotes: row.ambassador_manan_sir_notes,
            targetLeads: row.ambassador_target_leads,
            targetDemo: row.ambassador_target_demo,
            targetProposals: row.ambassador_target_proposals,
            targetSales: row.ambassador_target_sales,
            actualLeads: row.ambassador_actual_leads,
            actualDemo: row.ambassador_actual_demo,
            actualProposals: row.ambassador_actual_proposals,
            actualSales: row.ambassador_actual_sales,
          };
          ambassadors.push(exportRow);
        } else {
          leads.push(exportRow);
        }
      }
      if (rows.length < PAGE_SIZE) break;
    }

    return { ok: true, customColumns: customColumns ?? [], leads, ambassadors };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Unable to export leads and Ambassadors." };
  }
}
