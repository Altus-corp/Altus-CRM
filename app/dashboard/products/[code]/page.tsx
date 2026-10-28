import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { requireUser } from "@/app/lib/auth";
import { createClient } from "@/app/lib/supabase/server";
import { getLeadSharedConfig } from "@/app/lib/lead-shared-config";
import type { LeadColumn, LeadRow } from "@/components/leads/leads-table";
import { ProductStageBoard, type BoardDropdown, type BoardLead, type PreDetails } from "./product-stage-board";

export const instant = false;

type ProductPageProps = {
  params: Promise<{ code: string }>;
};

type RawAssignment = { id: string; assigned_to: string | null; assigned_at: string | null; next_follow_up_at: string | null; product: LeadRow["product_assignments"][number]["product"] | NonNullable<LeadRow["product_assignments"][number]["product"]>[]; stage: { name: string } | { name: string }[] | null; resolution: { name: string } | { name: string }[] | null };
type LeadInfo = { lead_number: number | null; first_name: string; last_name: string | null; phone: string | null; email: string | null; created_at: string; custom_data: Record<string, unknown> | null; assignments: RawAssignment[] | null };
type Named = { name: string } | { name: string }[] | null;
type Row = { id: string; lead_id: string; stage_id: string | null; latest_resolution_id: string | null; assigned_at: string | null; next_follow_up_at: string | null; resolution: Named; lead: LeadInfo | LeadInfo[] | null };

// Stages that make up a product's journey, in order. Products not listed here show every active stage.
const PRODUCT_PHASES: Record<string, string[]> = {
  PSO: ["Pre PSO", "During PSO", "PSO Attendant"],
};

const one = <T,>(value: T | T[] | null): T | null => (Array.isArray(value) ? value[0] ?? null : value);

export default async function ProductPage({ params }: ProductPageProps) {
  await connection();
  const { userId, roles } = await requireUser();

  if (!roles.includes("sales_executive")) {
    redirect("/dashboard");
  }

  const { code } = await params;
  const supabase = await createClient();
  const sharedConfig = await getLeadSharedConfig();
  const product = sharedConfig.products.find((item) => item.code.toLowerCase() === code.toLowerCase()) ?? null;

  if (!product) {
    notFound();
  }

  const [{ data: assignments, error }, dropdownResult]  = await Promise.all([
    supabase
      .from("lead_product_assignments")
      .select("id, lead_id, stage_id, latest_resolution_id, assigned_at, next_follow_up_at, resolution:lead_resolutions(name), lead:leads(lead_number, first_name, last_name, phone, email, created_at, custom_data, assignments:lead_product_assignments(id, assigned_to, assigned_at, next_follow_up_at, product:lead_products(id, code, name), stage:lead_stages(name), resolution:lead_resolutions(name)))")
      .eq("assigned_to", userId).eq("product_id", product.id).eq("is_active", true).eq("is_closed", false)
      .order("assigned_at", { ascending: false, nullsFirst: false }).limit(200),
    supabase.from("lead_stage_dropdowns").select("id, stage_id, label, position, options:lead_stage_dropdown_options(id, label, position)").eq("product_id", product.id).eq("is_active", true).order("position"),
  ]);

  if (error) {
    return <section className="mx-auto max-w-3xl rounded-xl bg-red-50 p-5 text-sm font-bold text-red-700">Leads for this product could not be loaded. Please refresh the page.</section>;
  }

  const phases = PRODUCT_PHASES[product.code.toUpperCase()];
  const stages = sharedConfig.stages.filter((stage) => stage.product_id === product.id)
    .filter((stage) => !phases || phases.some((phase) => phase.toLowerCase() === stage.name.toLowerCase()))
    .sort((a, b) => phases ? phases.findIndex((phase) => phase.toLowerCase() === a.name.toLowerCase()) - phases.findIndex((phase) => phase.toLowerCase() === b.name.toLowerCase()) : a.position - b.position)
    .map((stage) => ({ id: stage.id, name: stage.name }));

  const rows = (assignments ?? []) as unknown as Row[];
  const assignmentIds = rows.map((row) => row.id);
  const resolutionNames = new Map(sharedConfig.resolutions.map((resolution) => [resolution.id, resolution.name]));
  const resolutions = sharedConfig.resolutionMappings.filter((mapping) => mapping.product_id === product.id).flatMap((mapping) => {
    const name = resolutionNames.get(mapping.resolution_id);
    return name ? [{ id: mapping.resolution_id, name }] : [];
  }).sort((a, b) => a.name.localeCompare(b.name));
  const dropdownsReady = !dropdownResult.error;
  const dropdowns: BoardDropdown[] = (dropdownResult.data ?? []).map((dropdown) => ({ id: dropdown.id, stageId: dropdown.stage_id, label: dropdown.label, options: [...((dropdown.options ?? []) as { id: string; label: string; position: number }[])].sort((a, b) => a.position - b.position).map((option) => ({ id: option.id, label: option.label })) }));
  const isPso = product.code.toUpperCase() === "PSO";
  const assigneeIds = [...new Set(rows.flatMap((row) => (one(row.lead)?.assignments ?? []).map((assignment) => assignment.assigned_to)).filter((id): id is string => Boolean(id)))];
  const [notesResult, valuesResult, detailsResult, assigneesResult] = await Promise.all([
    assignmentIds.length ? supabase.from("lead_activities").select("lead_product_assignment_id, note, created_at").eq("activity_type", "note").in("lead_product_assignment_id", assignmentIds).order("created_at", { ascending: false }).limit(600) : Promise.resolve({ data: [] as { lead_product_assignment_id: string; note: string | null; created_at: string }[] }),
    dropdownsReady && assignmentIds.length && dropdowns.length ? supabase.from("lead_stage_dropdown_values").select("assignment_id, dropdown_id, option_id").in("assignment_id", assignmentIds) : Promise.resolve({ data: [] as { assignment_id: string; dropdown_id: string; option_id: string }[] }),
    isPso && assignmentIds.length ? supabase.from("lead_pre_pso_details").select("assignment_id, confirmation_notes").in("assignment_id", assignmentIds) : Promise.resolve({ data: [] as { assignment_id: string; confirmation_notes: string | null }[], error: null }),
    assigneeIds.length ? supabase.from("profiles").select("id, first_name, last_name").in("id", assigneeIds) : Promise.resolve({ data: [] as { id: string; first_name: string | null; last_name: string | null }[] }),
  ]);
  const latestNote = new Map<string, string>();
  for (const item of notesResult.data ?? []) if (item.note && !latestNote.has(item.lead_product_assignment_id)) latestNote.set(item.lead_product_assignment_id, item.note);
  const choices = new Map<string, Record<string, string>>();
  for (const value of valuesResult.data ?? []) choices.set(value.assignment_id, { ...(choices.get(value.assignment_id) ?? {}), [value.dropdown_id]: value.option_id });

  // Pre PSO confirmation details live in their own table; keep the page usable if its migration has not been run yet.
  const detailsReady = isPso && !detailsResult.error;
  const details = new Map<string, PreDetails>((detailsResult.data ?? []).map((row) => [row.assignment_id, { notes: row.confirmation_notes ?? "" }]));

  // The lead detail panel (double-click a row) needs the same data the Leads table gives it.
  const assignedNames = Object.fromEntries((assigneesResult.data ?? []).map((profile) => [profile.id, [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "Unassigned user"]));
  const detailColumns = (sharedConfig.columns as (LeadColumn & { is_visible: boolean })[]).filter((column) => column.is_visible);

  const leads: BoardLead[] = rows.flatMap((row) => {
    const lead = one(row.lead);
    if (!lead) return [];
    const assignments = lead.assignments ?? [];
    const mine = assignments.find((assignment) => assignment.id === row.id);
    const asList = <T,>(value: T | T[] | null | undefined): T[] => (Array.isArray(value) ? value : value ? [value] : []);
    const detail: LeadRow = {
      id: row.lead_id,
      lead_number: lead.lead_number,
      assignment_id: row.id,
      first_name: lead.first_name,
      last_name: lead.last_name,
      email: lead.email,
      phone: lead.phone,
      created_at: lead.created_at,
      custom_data: lead.custom_data ?? {},
      assigned_to: mine?.assigned_to ?? userId,
      assigned_at: row.assigned_at,
      focused_on: null,
      next_follow_up_at: row.next_follow_up_at,
      product: asList(mine?.product) as LeadRow["product"],
      stage: asList(mine?.stage),
      resolution: asList(mine?.resolution),
      product_assignments: assignments.map((item) => ({ id: item.id, assigned_to: item.assigned_to, assigned_at: item.assigned_at, focused_on: null, next_follow_up_at: item.next_follow_up_at, product: (asList(item.product)[0] ?? null) as LeadRow["product_assignments"][number]["product"], stage: asList(item.stage)[0] ?? null, resolution: asList(item.resolution)[0] ?? null })),
    };
    return [{
      detail,
      assignmentId: row.id,
      leadId: row.lead_id,
      stageId: row.stage_id,
      name: [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Unnamed lead",
      phone: lead.phone,
      email: lead.email,
      resolutionId: row.latest_resolution_id ?? "",
      details: details.get(row.id) ?? null,
      choices: choices.get(row.id) ?? {},
      nextFollowUpAt: row.next_follow_up_at,
      assignedAt: row.assigned_at,
      note: latestNote.get(row.id) ?? null,
    }];
  });

  return <ProductStageBoard product={{ code: product.code, name: product.name }} stages={stages} leads={leads} resolutions={resolutions} dropdowns={dropdowns} dropdownsReady={dropdownsReady} detailsReady={detailsReady} detailColumns={detailColumns} assignedNames={assignedNames} />;
}
