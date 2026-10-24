import { altusContactsErrorResponse, altusContactsRequest, AltusContactsError } from "@/app/lib/altus-contacts";
import { requireAltusContactsIdentity } from "../../_helpers";

type Call = { user?: string };
type Note = { disposition: "interested" | "call_back" | "not_interested" | "wrong_number" | "no_answer" | null; note: string | null; follow_up_at: string | null };

export async function PUT(request: Request, context: RouteContext<"/api/altus-contacts/notes/[callId]">) {
  try {
    const { callId } = await context.params;
    if (!/^\d+$/.test(callId)) throw new AltusContactsError("Invalid call ID.", 400);
    const { email } = await requireAltusContactsIdentity();
    const call = await altusContactsRequest<Call>(`/calls/${callId}`);
    if (call.data?.user?.trim().toLowerCase() !== email) throw new AltusContactsError("This call is not available to your account.", 404);
    const input = await request.json().catch(() => ({})) as Partial<Note>;
    const validDispositions = new Set(["interested", "call_back", "not_interested", "wrong_number", "no_answer"]);
    if (input.disposition !== null && !validDispositions.has(input.disposition ?? "")) throw new AltusContactsError("Invalid call disposition.", 400);
    if (input.note !== null && typeof input.note !== "string") throw new AltusContactsError("Invalid note.", 400);
    if (input.follow_up_at !== null && (typeof input.follow_up_at !== "string" || Number.isNaN(Date.parse(input.follow_up_at)))) throw new AltusContactsError("Invalid follow-up date.", 400);
    const response = await altusContactsRequest<unknown>(`/notes/${callId}`, { method: "PUT", body: JSON.stringify({ user: email, disposition: input.disposition ?? null, note: input.note ?? null, follow_up_at: input.follow_up_at ?? null }) });
    return Response.json(response);
  } catch (error) {
    return altusContactsErrorResponse(error);
  }
}
