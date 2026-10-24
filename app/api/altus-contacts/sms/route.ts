import { altusContactsErrorResponse, altusContactsRequest } from "@/app/lib/altus-contacts";
import { requireAltusContactsIdentity } from "../_helpers";

type Sms = { employee?: string } & Record<string, unknown>;

export async function GET(request: Request) {
  try {
    const { email } = await requireAltusContactsIdentity();
    const requested = Number(new URL(request.url).searchParams.get("limit") ?? "50");
    const limit = Number.isInteger(requested) ? Math.min(100, Math.max(1, requested)) : 50;
    const response = await altusContactsRequest<Sms[]>(`/sms?limit=${limit}`);
    const messages = (response.data ?? []).filter((message) => message.employee?.trim().toLowerCase() === email);
    return Response.json({ ok: true, data: messages, next_before: response.next_before ?? null });
  } catch (error) {
    return altusContactsErrorResponse(error);
  }
}
