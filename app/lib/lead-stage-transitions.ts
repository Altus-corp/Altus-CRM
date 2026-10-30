import { createAdminClient } from "@/app/lib/supabase/admin";
import { externalLeadSources } from "@/app/lib/external-lead-sources";
import { indiaToday } from "@/app/lib/lead-event-schedule";

type TransitionResult = { ok: boolean; date: string; promoted: number; message: string };

const normalize = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ");

export async function promoteScheduledLeadStages(date = indiaToday()): Promise<TransitionResult> {
  const supabase = createAdminClient();
  const sources = Object.values(externalLeadSources);
  const productCodes = [...new Set(sources.map((source) => source.productCode))];
  const { data: products, error: productsError } = await supabase.from("lead_products").select("id, code").in("code", productCodes);
  if (productsError) return { ok: false, date, promoted: 0, message: productsError.message };
  const productByCode = new Map((products ?? []).map((product) => [product.code, product]));
  const productIds = [...productByCode.values()].map((product) => product.id);
  if (!productIds.length) return { ok: true, date, promoted: 0, message: "No configured event products are available." };

  const [{ data: stages, error: stagesError }, { data: assignments, error: assignmentsError }] = await Promise.all([
    supabase.from("lead_stages").select("id, product_id, name").in("product_id", productIds),
    supabase.from("lead_product_assignments").select("id, lead_id, product_id, stage_id, assigned_to, created_by").eq("scheduled_event_date", date).eq("is_active", true).eq("is_closed", false).in("product_id", productIds),
  ]);
  if (stagesError) return { ok: false, date, promoted: 0, message: stagesError.message };
  if (assignmentsError) return { ok: false, date, promoted: 0, message: assignmentsError.message };

  let promoted = 0;
  for (const source of sources) {
    const product = productByCode.get(source.productCode);
    if (!product) continue;
    const sourceStages = (stages ?? []).filter((stage) => stage.product_id === product.id);
    const preStage = sourceStages.find((stage) => normalize(stage.name) === normalize(source.stageName));
    const duringStage = sourceStages.find((stage) => normalize(stage.name) === normalize(`During ${source.productCode}`));
    if (!preStage || !duringStage) continue;
    const eligible = (assignments ?? []).filter((assignment) => assignment.product_id === product.id && assignment.stage_id === preStage.id);
    if (!eligible.length) continue;
    const { data: moved, error: moveError } = await supabase
      .from("lead_product_assignments")
      .update({ stage_id: duringStage.id })
      .in("id", eligible.map((assignment) => assignment.id))
      .eq("stage_id", preStage.id)
      .select("id, lead_id, assigned_to, created_by");
    if (moveError) return { ok: false, date, promoted, message: moveError.message };
    promoted += moved?.length ?? 0;
    const activities = (moved ?? []).flatMap((assignment) => {
      const actor = assignment.assigned_to ?? assignment.created_by;
      return actor ? [{
        lead_id: assignment.lead_id,
        lead_product_assignment_id: assignment.id,
        activity_type: "stage_changed",
        note: `Automatically moved from ${preStage.name} to ${duringStage.name} for the scheduled event date (${date}).`,
        metadata: { automated: true, source: "scheduled_event_stage_transition", from_stage: preStage.name, to_stage: duringStage.name, scheduled_event_date: date },
        created_by: actor,
      }] : [];
    });
    if (activities.length) {
      const { error: activityError } = await supabase.from("lead_activities").insert(activities);
      if (activityError) return { ok: false, date, promoted, message: activityError.message };
    }
  }
  return { ok: true, date, promoted, message: promoted ? `${promoted} lead product assignment${promoted === 1 ? "" : "s"} moved to its During stage.` : "No scheduled Pre-stage assignments needed promotion." };
}
