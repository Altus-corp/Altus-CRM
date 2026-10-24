import { altusContactsErrorResponse, altusContactsRequest, AltusContactsError } from "@/app/lib/altus-contacts";
import { requireAltusContactsIdentity } from "../../_helpers";

export async function GET(_request: Request, context: RouteContext<"/api/altus-contacts/dial/[requestId]">) {
  try {
    const { requestId } = await context.params;
    const { userId, supabase } = await requireAltusContactsIdentity();
    const { data: ownedRequest } = await supabase.from("altus_contact_requests").select("request_id").eq("request_id", requestId).eq("user_id", userId).eq("kind", "dial").maybeSingle();
    if (!ownedRequest) throw new AltusContactsError("This dial request is not available to your account.", 404);
    const response = await altusContactsRequest<unknown>(`/dial/${encodeURIComponent(requestId)}`);
    return Response.json(response);
  } catch (error) {
    return altusContactsErrorResponse(error);
  }
}
