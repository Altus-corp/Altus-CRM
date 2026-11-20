// Altus CRM v2 — AI insights. Uses Claude when ANTHROPIC_API_KEY is set; otherwise returns
// { source: "rules" } and the UI shows the rule-engine insights (nothing breaks).
import { requireUser } from "@/app/lib/auth";
import { createAdminClient } from "@/app/lib/supabase/admin";

type Body = { role: string; product: string; period: string; facts: unknown; leads: unknown[]; question?: string };
const MODEL = process.env.CRM2_AI_MODEL || "claude-sonnet-5-5";
const TTL_MS = 2 * 3600_000;

export async function POST(request: Request) {
  const user = await requireUser();
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body) return Response.json({ error: "Bad request" }, { status: 400 });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return Response.json({ source: "rules" });

  const question = (body.question || "").slice(0, 600);
  const cacheKey = question ? null : `${user.userId}:${body.role}:${body.product}:${body.period}`;
  const db = createAdminClient();
  if (cacheKey) {
    const { data } = await db.from("crm_ai_insight_cache").select("payload, created_at").eq("cache_key", cacheKey).maybeSingle();
    if (data && Date.now() - new Date(data.created_at).getTime() < TTL_MS) return Response.json({ ...(data.payload as object), source: "claude", cached: true });
  }

  const system = `You are the sales analyst inside Altus Corp's CRM (Mumbai; products: PSO free masterclass → BSS paid coaching, Altus OS software, Ambassadors referral programme, PS, Keynote, Retainer).
Use ONLY the numbers and leads provided. Never invent figures or names. Be direct, practical, short. Indian business context.
Pipeline priority: Closing → Negotiation → Follow-up → Approach. Targets per week: sales 3 demos, 15 references, 3 ambassadors appointed, 60 calls/day; ambassadors 3 demos, 10 leads.`;
  const user_msg = question
    ? `Viewer role: ${body.role}. Product: ${body.product}. Period: ${body.period}.\nFACTS:\n${JSON.stringify(body.facts).slice(0, 12000)}\nTOP LEADS:\n${JSON.stringify(body.leads).slice(0, 12000)}\n\nQuestion: ${question}\nAnswer in under 180 words. Name specific leads/people from the data where useful.`
    : `Viewer role: ${body.role}. Product: ${body.product}. Period: ${body.period}.\nFACTS:\n${JSON.stringify(body.facts).slice(0, 12000)}\nTOP LEADS:\n${JSON.stringify(body.leads).slice(0, 12000)}\n\nReturn JSON only: {"brief": "<= 70 words, what to do today", "insights": [{"cat": "Money now|Risk|People|Opportunity|Process|Forecast", "sev": "high|med|low", "title": "<= 12 words", "body": "<= 35 words, specific"}] } with 6-10 insights, most urgent first.`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 1400, system, messages: [{ role: "user", content: user_msg }] }),
    });
    if (!r.ok) return Response.json({ source: "rules", error: `AI ${r.status}` });
    const j = (await r.json()) as { content?: { type: string; text?: string }[] };
    const text = (j.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("").trim();
    if (question) return Response.json({ source: "claude", answer: text });
    const m = text.match(/\{[\s\S]*\}/);
    const payload = m ? JSON.parse(m[0]) : { brief: text, insights: [] };
    if (cacheKey) await db.from("crm_ai_insight_cache").upsert({ cache_key: cacheKey, payload, created_at: new Date().toISOString() });
    return Response.json({ ...payload, source: "claude" });
  } catch {
    return Response.json({ source: "rules", error: "AI unavailable" });
  }
}
