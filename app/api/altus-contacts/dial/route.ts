import { altusContactsErrorResponse, altusContactsRequest } from "@/app/lib/altus-contacts";
import { apiNumber, requireAltusContactsIdentity } from "../_helpers";

type DialResponse = { id: string; status: string } & Record<string, unknown>;

export async function POST(request: Request) {
  try {
    const { email, userId, supabase } = await requireAltusContactsIdentity();
    const input = await request.json().catch(() => ({})) as { number?: unknown; leadId?: unknown; assignmentId?: unknown };
    const number = apiNumber(input.number);
    const response = await altusContactsRequest<DialResponse>("/dial", { method: "POST", body: JSON.stringify({ user: email, number }) });
    if (response.data?.id) await supabase.from("altus_contact_requests").insert({ request_id: response.data.id, user_id: userId, kind: "dial" });
    const leadId = typeof input.leadId === "string" ? input.leadId : "";
    const assignmentId = typeof input.assignmentId === "string" ? input.assignmentId : "";
    if (leadId && assignmentId) await supabase.from("lead_activities").insert({ lead_id: leadId, lead_product_assignment_id: assignmentId, activity_type: "call", created_by: userId, metadata: { source: "altus_contacts", request_id: response.data?.id ?? null } });
    return Response.json(response, { status: 202 });
  } catch (error) {
    return altusContactsErrorResponse(error);
  }
}
