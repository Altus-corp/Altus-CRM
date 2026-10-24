import { altusContactsErrorResponse, altusContactsRequest, AltusContactsError } from "@/app/lib/altus-contacts";
import { apiNumber, requireAltusContactsIdentity } from "../../_helpers";

type SendResponse = { id: string } & Record<string, unknown>;

export async function POST(request: Request) {
  try {
    const { email, userId, supabase } = await requireAltusContactsIdentity();
    const input = await request.json().catch(() => ({})) as { number?: unknown; body?: unknown; mode?: unknown };
    const number = apiNumber(input.number);
    const body = typeof input.body === "string" ? input.body.trim() : "";
    const mode = input.mode === "auto" ? "auto" : "compose";
    if (!body || body.length > 1000) throw new AltusContactsError("An SMS message must contain 1 to 1000 characters.", 400);
    const response = await altusContactsRequest<SendResponse>("/messages/send", { method: "POST", body: JSON.stringify({ user: email, number, body, mode }) });
    if (response.data?.id) await supabase.from("altus_contact_requests").insert({ request_id: response.data.id, user_id: userId, kind: "sms" });
    return Response.json(response, { status: 202 });
  } catch (error) {
    return altusContactsErrorResponse(error);
  }
}
