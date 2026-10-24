import { altusContactsErrorResponse, altusContactsRequest } from "@/app/lib/altus-contacts";
import { requireAltusContactsIdentity } from "../_helpers";

type UserStat = { user?: string } & Record<string, unknown>;
type Stats = { from?: string; to?: string; by_user?: UserStat[] };

export async function GET() {
  try {
    const { email } = await requireAltusContactsIdentity();
    const response = await altusContactsRequest<Stats>("/stats");
    const userStat = response.data?.by_user?.find((stat) => stat.user?.trim().toLowerCase() === email) ?? null;
    return Response.json({ ok: true, data: { from: response.data?.from ?? null, to: response.data?.to ?? null, user: userStat } });
  } catch (error) {
    return altusContactsErrorResponse(error);
  }
}
