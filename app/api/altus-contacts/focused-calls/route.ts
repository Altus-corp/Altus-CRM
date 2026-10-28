import { altusContactsErrorResponse, altusContactsRequest } from "@/app/lib/altus-contacts";
import { requireAltusContactsIdentity } from "../_helpers";
import { callNumbers, dateFromCall, indiaDayRange, isConnected, numberKey, type ContactCall } from "@/app/lib/altus-call-utils";

export async function GET() {
  try {
    const { email, supabase } = await requireAltusContactsIdentity();
    const { start, end } = indiaDayRange();
    const { data: leads, error } = await supabase.from("leads").select("id, phone").gte("assigned_at", start.toISOString()).lt("assigned_at", end.toISOString());
    if (error) throw new Error(error.message);
    const phoneToLeadId = new Map<string, string>();
    for (const lead of leads ?? []) {
      const phone = numberKey(lead.phone);
      if (phone) phoneToLeadId.set(phone, lead.id);
    }
    if (!phoneToLeadId.size) return Response.json({ ok: true, data: { assignedLeads: 0, matchedCalls: 0, connectedCalls: 0, contactedLeads: 0 } });

    const response = await altusContactsRequest<ContactCall[]>(`/calls?limit=100&user=${encodeURIComponent(email)}`);
    const todayCalls = (response.data ?? []).filter((call) => {
      if (call.user?.trim().toLowerCase() !== email) return false;
      const date = dateFromCall(call);
      return Boolean(date && date >= start && date < end);
    });
    const matched = todayCalls.filter((call) => callNumbers(call).some((phone) => phoneToLeadId.has(phone)));
    const contactedLeadIds = new Set(matched.flatMap((call) => callNumbers(call).map((phone) => phoneToLeadId.get(phone)).filter((id): id is string => Boolean(id))));
    return Response.json({ ok: true, data: { assignedLeads: leads?.length ?? 0, matchedCalls: matched.length, connectedCalls: matched.filter(isConnected).length, contactedLeads: contactedLeadIds.size } });
  } catch (error) {
    return altusContactsErrorResponse(error);
  }
}
