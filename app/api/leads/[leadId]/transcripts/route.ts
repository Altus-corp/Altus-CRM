import { requireUser } from "@/app/lib/auth";
import { createClient } from "@/app/lib/supabase/server";

export async function GET(_request: Request, context: RouteContext<"/api/leads/[leadId]/transcripts">) {
  try {
    await requireUser();
    const { leadId } = await context.params;
    const supabase = await createClient();
    const { data, error } = await supabase.from("lead_call_transcripts").select("id, altus_call_id, transcript_text, lead_product_assignment_id, created_at, updated_at").eq("lead_id", leadId).order("updated_at", { ascending: false });
    if (error) return Response.json({ ok: false, error: error.message }, { status: 400 });
    return Response.json({ ok: true, transcripts: data ?? [] });
  } catch {
    return Response.json({ ok: false, error: "Unable to load call transcripts." }, { status: 401 });
  }
}
