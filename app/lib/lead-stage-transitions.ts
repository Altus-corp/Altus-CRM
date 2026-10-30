import "server-only";
import { createAdminClient } from "@/app/lib/supabase/admin";
import { indiaToday } from "@/app/lib/lead-event-schedule";

type TransitionResult = { ok: boolean; date: string; promoted: number; message: string };

export async function promoteScheduledLeadStages(): Promise<TransitionResult> {
  const { data, error } = await createAdminClient().rpc("promote_scheduled_lead_stages");
  if (error) return {
    ok: false, date: indiaToday(), promoted: 0,
    message: error.code === "PGRST202"
      ? "Automatic stage transitions are not set up yet. Apply 20261031_schedule_event_stage_transitions.sql in Supabase."
      : "Scheduled stage transitions could not be completed. Check the database job history and retry.",
  };
  if (!data || typeof data !== "object" || data.ok !== true || typeof data.promoted !== "number" || typeof data.date !== "string" || typeof data.message !== "string") {
    return { ok: false, date: indiaToday(), promoted: 0, message: "The stage transition returned an invalid result." };
  }
  return { ok: true, date: data.date, promoted: data.promoted, message: data.message };
}
