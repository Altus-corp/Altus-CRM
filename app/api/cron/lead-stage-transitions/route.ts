import { promoteScheduledLeadStages } from "@/app/lib/lead-stage-transitions";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ ok: false, message: "Unauthorized." }, { status: 401 });
  const result = await promoteScheduledLeadStages();
  return Response.json(result, { status: result.ok ? 200 : 500 });
}
