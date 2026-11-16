import { createHmac, randomUUID } from "node:crypto";
import { requireUser } from "@/app/lib/auth";
import { createAdminClient } from "@/app/lib/supabase/admin";

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json() as { leadId?: unknown; assignmentId?: unknown };
    const leadId = typeof body.leadId === "string" ? body.leadId : "";
    const assignmentId = typeof body.assignmentId === "string" ? body.assignmentId : "";
    if (!ID_PATTERN.test(leadId) || !ID_PATTERN.test(assignmentId)) return Response.json({ ok: false, error: "Invalid lead attachment request." }, { status: 400 });

    const uploadUrl = process.env.CDN_UPLOAD_URL;
    const signingSecret = process.env.CDN_UPLOAD_SIGNING_SECRET;
    if (!uploadUrl || !signingSecret) return Response.json({ ok: false, error: "CDN uploads are not configured yet." }, { status: 503 });
    const parsedUploadUrl = new URL(uploadUrl);
    if (parsedUploadUrl.protocol !== "https:") return Response.json({ ok: false, error: "CDN upload URL must use HTTPS." }, { status: 503 });

    const admin = createAdminClient();
    const { data: assignment, error: assignmentError } = await admin
      .from("lead_product_assignments")
      .select("id, lead_id, assigned_to")
      .eq("id", assignmentId)
      .eq("lead_id", leadId)
      .maybeSingle();
    if (assignmentError || !assignment) return Response.json({ ok: false, error: "This product work record is no longer available." }, { status: 404 });

    let allowed = user.roles.includes("admin") || assignment.assigned_to === user.userId;
    if (!allowed && user.roles.includes("ambassador")) {
      const { data: partner } = await admin
        .from("lead_channel_partners")
        .select("lead_id")
        .eq("lead_id", leadId)
        .eq("ambassador_id", user.userId)
        .maybeSingle();
      allowed = Boolean(partner);
    }
    if (!allowed) return Response.json({ ok: false, error: "You can upload attachments only for leads assigned to you." }, { status: 403 });

    const expires = Math.floor(Date.now() / 1000) + 5 * 60;
    const nonce = randomUUID();
    const signature = createHmac("sha256", signingSecret).update(`${leadId}|${assignmentId}|${nonce}|${expires}`).digest("hex");
    return Response.json({ ok: true, upload: { url: parsedUploadUrl.toString(), leadId, assignmentId, nonce, expires, signature } });
  } catch {
    return Response.json({ ok: false, error: "Unable to prepare the attachment upload." }, { status: 401 });
  }
}
