import { requireUser } from "@/app/lib/auth";
import { createClient } from "@/app/lib/supabase/server";
import { createAdminClient } from "@/app/lib/supabase/admin";
import { getSalesManagerTeamMemberIds } from "@/app/lib/sales-manager-team";

export async function GET(request: Request, context: { params: Promise<{ leadId: string }> }) {
  try {
    const user = await requireUser();
    const { leadId } = await context.params;
    const assignmentId = new URL(request.url).searchParams.get("assignmentId");
    if (!assignmentId) return Response.json({ ok: false, error: "Product assignment is required." }, { status: 400 });
    let supabase = await createClient();
    if (!user.roles.includes("admin")) {
      const allowedOwnerIds = user.roles.includes("sales_manager")
        ? [user.userId, ...(await getSalesManagerTeamMemberIds(user.userId))]
        : [user.userId];
      const admin = createAdminClient();
      const { data: assignment, error: assignmentError } = await admin
        .from("lead_product_assignments")
        .select("id")
        .eq("id", assignmentId)
        .eq("lead_id", leadId)
        .in("assigned_to", allowedOwnerIds)
        .maybeSingle();
      if (assignmentError || !assignment) return Response.json({ ok: false, error: "This lead is not assigned to you or your team." }, { status: 403 });
      supabase = admin;
    }
    const { data, error } = await supabase
      .from("lead_proposals")
      .select("id, file_url, file_name, file_size, details, approved, approved_at, created_at, created_by")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false });
    if (error) return Response.json({ ok: false, error: error.message }, { status: 400 });
    return Response.json({
      ok: true,
      proposals: (data ?? []).map((p) => ({ id: p.id, fileUrl: p.file_url, fileName: p.file_name, fileSize: p.file_size, details: p.details, approved: p.approved, approvedAt: p.approved_at, createdAt: p.created_at })),
    });
  } catch {
    return Response.json({ ok: false, error: "Unable to load proposals." }, { status: 401 });
  }
}
