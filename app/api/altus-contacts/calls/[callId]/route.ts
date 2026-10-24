import { altusContactsErrorResponse, altusContactsRequest, AltusContactsError } from "@/app/lib/altus-contacts";
import { requireAltusContactsIdentity } from "../../_helpers";

type Call = { user?: string } & Record<string, unknown>;

export async function GET(_request: Request, context: RouteContext<"/api/altus-contacts/calls/[callId]">) {
  try {
    const { callId } = await context.params;
    if (!/^\d+$/.test(callId)) throw new AltusContactsError("Invalid call ID.", 400);
    const { email } = await requireAltusContactsIdentity();
    const response = await altusContactsRequest<Call>(`/calls/${callId}`);
    if (response.data?.user?.trim().toLowerCase() !== email) throw new AltusContactsError("This call is not available to your account.", 404);
    return Response.json({ ok: true, data: response.data });
  } catch (error) {
    return altusContactsErrorResponse(error);
  }
}
