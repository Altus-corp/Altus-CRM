import { NextRequest } from "next/server";
import { requireUser } from "@/app/lib/auth";
import { createAdminClient } from "@/app/lib/supabase/admin";
import { getSalesManagerTeamMemberIds } from "@/app/lib/sales-manager-team";

// AltusCorp signs each document URL for 300 seconds, so it is never stored
// directly on a lead. This route re-fetches a fresh URL at click time and
// redirects there, scoped to whoever can already see this Ambassador.
const ALLOWED_TYPES = new Set(["selfie", "panCopy", "cancelledCheque", "kycIdProof", "gstCertificate"]);

export async function GET(request: NextRequest, context: { params: Promise<{ type: string }> }) {
  try {
    const user = await requireUser();
    const { type } = await context.params;
    if (!ALLOWED_TYPES.has(type)) return Response.json({ ok: false, error: "Unknown document type." }, { status: 400 });
    const externalId = request.nextUrl.searchParams.get("externalId") ?? "";
    if (!/^[0-9a-f-]{36}$/i.test(externalId)) return Response.json({ ok: false, error: "Invalid document reference." }, { status: 400 });

    const admin = createAdminClient();
    const { data: lead, error: leadError } = await admin
      .from("leads")
      .select("id, assigned_to")
      .eq("external_source", "altuscorp_ambassador")
      .eq("external_id", externalId)
      .maybeSingle();
    if (leadError || !lead) return Response.json({ ok: false, error: "This Ambassador record is not available." }, { status: 404 });

    let allowed = user.roles.includes("admin") || lead.assigned_to === user.userId;
    if (!allowed && user.roles.includes("sales_manager")) {
      const teamMemberIds = await getSalesManagerTeamMemberIds(user.userId);
      allowed = Boolean(lead.assigned_to && teamMemberIds.includes(lead.assigned_to));
    }
    if (!allowed) return Response.json({ ok: false, error: "You do not have access to this Ambassador's documents." }, { status: 403 });

    const apiKey = process.env.ALTUSCORP_EXTERNAL_LEADS_API_KEY?.trim();
    const baseUrl = (process.env.ALTUSCORP_EXTERNAL_LEADS_API_BASE_URL?.trim() || "https://altuscorp.in/api/external").replace(/\/$/, "");
    if (!apiKey) return Response.json({ ok: false, error: "AltusCorp API is not configured." }, { status: 503 });

    const response = await fetch(`${baseUrl}/ambassadors/${externalId}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) return Response.json({ ok: false, error: "AltusCorp could not return this document." }, { status: 502 });
    const payload = await response.json().catch(() => null) as { data?: Record<string, unknown>; documents?: Record<string, unknown> } | Record<string, unknown> | null;
    const record = (payload && typeof payload === "object" && "data" in payload ? payload.data : payload) as { documents?: Record<string, { url?: string } | null> } | null;
    const url = record?.documents?.[type]?.url;
    if (typeof url !== "string" || !/^https:\/\//.test(url)) return Response.json({ ok: false, error: "This document has not been uploaded." }, { status: 404 });

    return Response.redirect(url, 302);
  } catch {
    return Response.json({ ok: false, error: "Unable to open this document." }, { status: 401 });
  }
}
