import { requireUser } from "@/app/lib/auth";
import { createClient } from "@/app/lib/supabase/server";

export async function GET(request: Request, context: { params: Promise<{ leadId: string }> }) {
  try {
    await requireUser();
    const { leadId } = await context.params;
    const assignmentId = new URL(request.url).searchParams.get("assignmentId");
    if (!assignmentId) return Response.json({ ok: false, error: "Product assignment is required." }, { status: 400 });
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("lead_activities")
      .select("id, activity_type, note, follow_up_at, created_at, metadata, created_by")
      .eq("lead_id", leadId)
      .eq("lead_product_assignment_id", assignmentId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return Response.json({ ok: false, error: error.message }, { status: 400 });
    const actorIds = [...new Set((data ?? []).map((activity) => activity.created_by).filter((id): id is string => Boolean(id)))];
    const { data: profiles } = actorIds.length
      ? await supabase.from("profiles").select("id, first_name, last_name, full_name").in("id", actorIds)
      : { data: [] as { id: string; first_name: string | null; last_name: string | null; full_name: string | null }[] };
    const actors = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name || [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "CRM user"]));
    return Response.json({ ok: true, activities: (data ?? []).map((activity) => ({ ...activity, actor: activity.created_by ? actors.get(activity.created_by) ?? "CRM user" : null })) });
  } catch {
    return Response.json({ ok: false, error: "Unable to load lead activity." }, { status: 401 });
  }
}
