import { altusContactsErrorResponse, altusContactsRequest } from "@/app/lib/altus-contacts";
import { requireAltusContactsIdentity } from "../_helpers";

type Call = { user?: string } & Record<string, unknown>;

export async function GET(request: Request) {
  try {
    const { email } = await requireAltusContactsIdentity();
    const requested = Number(new URL(request.url).searchParams.get("limit") ?? "50");
    const limit = Number.isInteger(requested) ? Math.min(100, Math.max(1, requested)) : 50;
    const response = await altusContactsRequest<Call[]>(`/calls?limit=${limit}`);
    const calls = (response.data ?? []).filter((call) => call.user?.trim().toLowerCase() === email);
    return Response.json({ ok: true, data: calls, next_cursor: response.next_cursor ?? null });
  } catch (error) {
    return altusContactsErrorResponse(error);
  }
}
