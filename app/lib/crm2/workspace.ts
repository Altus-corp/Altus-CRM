import "server-only";
// Altus CRM v2 — one server loader that turns the existing Supabase tables into the Workspace payload.
// READ-ONLY. All writes go through the existing server actions in app/dashboard/leads/actions.ts.
import { createAdminClient } from "@/app/lib/supabase/admin";
import { getSalesManagerTeamMemberIds } from "@/app/lib/sales-manager-team";
import { attendanceForEmail, getWmsAttendance, toWmsProfileImageUrl } from "@/app/lib/wms-attendance";
import type { AppRole } from "@/app/lib/roles";
import { DEFAULT_RESOLUTION_BUCKETS, type BucketKey } from "./config";
import type { CallEv, HygieneRule, LeadRow, MeetEv, Person, ProductDef, ResolutionDef, SimpleEv, TargetSet, Workspace } from "./types";

const MAX_ROWS = Number(process.env.CRM2_MAX_ROWS || 20000);
const PAGE = 1000;
const DAY = 86_400_000;
const SALES_ROLES: AppRole[] = ["sales_executive", "sales_manager", "consultant", "admin"];

type User = { userId: string; roles: AppRole[]; displayName: string };
type Raw = Record<string, unknown>;
const s = (v: unknown) => (v == null ? "" : String(v));

async function pageAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, cap = MAX_ROWS): Promise<{ data: T[]; error: string | null }> {
  const out: T[] = [];
  for (let from = 0; from < cap; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) return { data: out, error: error.message };
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return { data: out, error: null };
}

export async function loadWorkspace(user: User): Promise<Workspace> {
  const db = createAdminClient();
  const warnings: string[] = [];
  const isAdmin = user.roles.includes("admin");
  const isAmbassadorOnly = user.roles.includes("ambassador") && !isAdmin && !user.roles.some((r) => SALES_ROLES.includes(r));
  const isMarketingOnly = !isAdmin && !user.roles.some((r) => SALES_ROLES.includes(r)) && !isAmbassadorOnly;
  const since60 = new Date(Date.now() - 60 * DAY).toISOString();

  /* people + roles */
  const [{ data: profiles }, { data: roleRows }, { data: teamRows }] = await Promise.all([
    db.from("profiles").select("id, first_name, last_name, full_name, is_suspended"),
    db.from("user_roles").select("user_id, role"),
    db.from("sales_manager_team_members").select("user_id, manager_id"),
  ]);
  const rolesBy = new Map<string, AppRole[]>();
  (roleRows ?? []).forEach((r: Raw) => { const id = s(r.user_id); rolesBy.set(id, [...(rolesBy.get(id) ?? []), r.role as AppRole]); });
  const mgrBy = new Map((teamRows ?? []).map((t: Raw) => [s(t.user_id), s(t.manager_id)]));
  const people: Person[] = (profiles ?? []).filter((p: Raw) => !p.is_suspended).map((p: Raw) => ({ id: s(p.id), name: [p.first_name, p.last_name].filter(Boolean).join(" ") || s(p.full_name) || "User", roles: rolesBy.get(s(p.id)) ?? [], managerId: mgrBy.get(s(p.id)) ?? null }));
  const salesIds = people.filter((p) => p.roles.some((r) => r === "sales_executive" || r === "sales_manager" || r === "consultant")).map((p) => p.id);

  /* real profile photos, same source as the classic CRM's WmsProfileAvatar — matched by email, never fatal if WMS is unreachable */
  const photos: Record<string, string> = {};
  try {
    const [{ data: authUsers }, wms] = await Promise.all([db.auth.admin.listUsers({ page: 1, perPage: 1000 }), getWmsAttendance()]);
    const emailById = new Map((authUsers?.users ?? []).map((u) => [u.id, u.email ?? ""]));
    people.forEach((p) => {
      const email = emailById.get(p.id);
      const record = email ? attendanceForEmail(wms, email) : null;
      const url = record ? toWmsProfileImageUrl(record.profileImage) : null;
      if (url) photos[p.id] = url;
    });
  } catch { /* WMS/profile photos are a nice-to-have — initials remain the fallback. */ }

  /* scope: who this viewer may see */
  let scope: string[];
  if (isAdmin || isMarketingOnly) scope = salesIds;
  else if (user.roles.includes("sales_manager")) scope = [user.userId, ...(await getSalesManagerTeamMemberIds(user.userId).catch(() => []))];
  else scope = [user.userId];

  /* config */
  const [{ data: prodRows }, { data: stageRows }, { data: resRows }, { data: colRows }, bucketRes, hygRes, tgtRes] = await Promise.all([
    db.from("lead_products").select("id, code, name, is_active").eq("is_active", true),
    db.from("lead_stages").select("id, product_id, name, position, is_active").eq("is_active", true).order("position"),
    db.from("lead_resolutions").select("id, name, is_active").eq("is_active", true),
    db.from("lead_table_columns").select("field_key, label, source, position, field_type, options, computed_from").order("position"),
    db.from("crm_resolution_buckets").select("resolution_id, bucket"),
    db.from("crm_hygiene_rules").select("field_key, label, from_bucket, weight, is_active").eq("is_active", true),
    db.from("crm_targets").select("user_id, demos, references_per_week, ambassadors, calls_per_day, leads, meetings, focused_calls, product_targets"),
  ]);
  if (bucketRes.error || hygRes.error || tgtRes.error) warnings.push("Run supabase/migrations/20261117_crm_v2_ui.sql and 20261123_add_target_product_meeting_calls.sql to enable editable buckets, hygiene rules and targets (defaults in use).");
  const bucketOverride = new Map((bucketRes.data ?? []).map((b: Raw) => [s(b.resolution_id), b.bucket as BucketKey]));
  const resolutions: ResolutionDef[] = (resRows ?? []).map((r: Raw) => ({ id: s(r.id), name: s(r.name), bucket: bucketOverride.get(s(r.id)) ?? DEFAULT_RESOLUTION_BUCKETS[s(r.name).trim().toLowerCase()] ?? "approach" }));
  const resById = new Map(resolutions.map((r) => [r.id, r]));
  const products: ProductDef[] = (prodRows ?? []).map((p: Raw) => ({ id: s(p.id), code: s(p.code), name: s(p.name), stages: (stageRows ?? []).filter((st: Raw) => s(st.product_id) === s(p.id)).map((st: Raw) => ({ id: s(st.id), name: s(st.name) })) }));
  const prodById = new Map(products.map((p) => [p.id, p]));
  const stageById = new Map(products.flatMap((p) => p.stages.map((st) => [st.id, st.name] as const)));
  const columns = (colRows ?? []).map((c: Raw) => ({ key: s(c.field_key), label: s(c.label), source: s(c.source), fieldType: s(c.field_type) || "text", options: Array.isArray(c.options) ? c.options.map(String) : [], computedFrom: Array.isArray(c.computed_from) ? c.computed_from.map(String) : [] }));
  const hygiene: HygieneRule[] = hygRes.data?.length
    ? hygRes.data.map((h: Raw) => ({ key: s(h.field_key), label: s(h.label), fromBucket: (h.from_bucket as BucketKey) || "followup", weight: Number(h.weight) || 1 }))
    : [{ key: "email", label: "Email", fromBucket: "followup", weight: 2 }, ...columns.filter((c) => c.source === "custom").slice(0, 12).map((c) => ({ key: c.key, label: c.label, fromBucket: "followup" as BucketKey, weight: 1 }))];
  const targets: Record<string, TargetSet> = {};
  (tgtRes.data ?? []).forEach((t: Raw) => { targets[s(t.user_id)] = { demos: Number(t.demos) || undefined, references: Number(t.references_per_week) || undefined, ambassadors: Number(t.ambassadors) || undefined, callsPerDay: Number(t.calls_per_day) || undefined, leads: Number(t.leads) || undefined, meetings: Number(t.meetings) || undefined, focusedCalls: Number(t.focused_calls) || undefined, products: t.product_targets && typeof t.product_targets === "object" ? t.product_targets as Record<string, number> : undefined }; });

  /* assignments (lead × product) */
  const sel = "id, lead_id, product_id, stage_id, latest_resolution_id, assigned_to, assigned_at, next_follow_up_at, focused_on, is_new_inbound, is_active, updated_at, ambassador_user_id, lead:leads!inner(id, lead_number, first_name, last_name, email, phone, created_at, custom_data, lead_database, ambassador_imported_by, created_by)";
  const asg = await pageAll<Raw>((from, to) => {
    let q = db.from("lead_product_assignments").select(sel).eq("is_active", true);
    if (isAmbassadorOnly) q = q.eq("lead.ambassador_imported_by", user.userId);
    else if (!isAdmin && !isMarketingOnly) q = q.in("assigned_to", scope);
    return q.order("created_at", { ascending: false }).range(from, to) as unknown as PromiseLike<{ data: Raw[] | null; error: { message: string } | null }>;
  });
  if (asg.error) warnings.push("Lead load: " + asg.error);
  if (asg.data.length >= MAX_ROWS) warnings.push(`Showing the latest ${MAX_ROWS} assignments (raise CRM2_MAX_ROWS to load more).`);
  const asgIds = asg.data.map((a) => s(a.id));

  /* calls (60 d) + call activities (last-called date) */
  const calls = await pageAll<Raw>((from, to) => {
    let q = db.from("lead_call_log").select("user_id, called_at, is_connected, direction, duration_seconds, lead_product_assignment_id").gte("called_at", since60);
    if (!isAdmin && !isMarketingOnly) q = q.in("user_id", isAmbassadorOnly ? [user.userId] : scope);
    return q.order("called_at", { ascending: false }).range(from, to) as unknown as PromiseLike<{ data: Raw[] | null; error: { message: string } | null }>;
  }, 60000);
  const callEv: CallEv[] = calls.data.map((c) => ({ u: s(c.user_id), t: s(c.called_at), c: !!c.is_connected, out: c.direction !== "incoming", d: Number(c.duration_seconds) || 0, a: c.lead_product_assignment_id ? s(c.lead_product_assignment_id) : null }));
  const lastCall = new Map<string, string>(); const callCount = new Map<string, [number, number]>();
  callEv.forEach((c) => { if (!c.a) return; if (!lastCall.has(c.a) || lastCall.get(c.a)! < c.t) lastCall.set(c.a, c.t); const k = callCount.get(c.a) ?? [0, 0]; k[0]++; if (c.c) k[1]++; callCount.set(c.a, k); });
  for (let i = 0; i < asgIds.length; i += 300) {
    const { data } = await db.from("lead_activities").select("lead_product_assignment_id, created_at").eq("activity_type", "call").in("lead_product_assignment_id", asgIds.slice(i, i + 300)).order("created_at", { ascending: false }).limit(3000);
    (data ?? []).forEach((a: Raw) => { const id = s(a.lead_product_assignment_id); const t = s(a.created_at); if (!lastCall.has(id) || lastCall.get(id)! < t) lastCall.set(id, t); });
  }

  const ambIds = new Set(people.filter((p) => p.roles.includes("ambassador")).map((p) => p.id));
  const hidePii = isMarketingOnly;
  /** Which Ambassador is tied to a lead. The real, actively-used source is `lead_channel_partners`
   * (tagged by a sales person via the Channel Partner picker); `leads.ambassador_imported_by` only gets
   * set when an Ambassador submits a lead through their own login — check both. */
  const leadIdsForCp = [...new Set(asg.data.map((a) => s((a.lead as Raw)?.id)))];
  const cpByLead = new Map<string, string>();
  type ContactRec = { firstName: string; lastName: string; phone: string; email: string };
  const contactsByLead = new Map<string, ContactRec[]>();
  for (let i = 0; i < leadIdsForCp.length; i += 300) {
    const batch = leadIdsForCp.slice(i, i + 300);
    const [{ data }, { data: contactRows }] = await Promise.all([
      db.from("lead_channel_partners").select("lead_id, ambassador_id").in("lead_id", batch),
      db.from("lead_contacts").select("lead_id, first_name, last_name, phone, email").in("lead_id", batch),
    ]);
    (data ?? []).forEach((r: Raw) => { if (!cpByLead.has(s(r.lead_id))) cpByLead.set(s(r.lead_id), s(r.ambassador_id)); });
    (contactRows ?? []).forEach((r: Raw) => { const id = s(r.lead_id); const list = contactsByLead.get(id) ?? []; list.push({ firstName: s(r.first_name), lastName: s(r.last_name), phone: s(r.phone), email: s(r.email) }); contactsByLead.set(id, list); });
  }
  const buildRow = (a: Raw): LeadRow => {
    const L = (a.lead ?? {}) as Raw; const cd = (L.custom_data ?? {}) as Record<string, unknown>;
    const custom: Record<string, string> = {}; Object.entries(cd).forEach(([k, v]) => { if (v != null && typeof v !== "object") custom[k] = String(v); });
    const res = a.latest_resolution_id ? resById.get(s(a.latest_resolution_id)) : undefined;
    const p = prodById.get(s(a.product_id)); const last = lastCall.get(s(a.id)) ?? null; const cc = callCount.get(s(a.id)) ?? [0, 0];
    const name = [L.first_name, L.last_name].filter(Boolean).join(" ");
    const importer = cpByLead.get(s(L.id)) || s(L.ambassador_imported_by);
    const base = {
      id: s(a.id), leadId: s(L.id), no: s(L.lead_number), name: hidePii ? `Lead ${s(L.lead_number)}` : name, first: hidePii ? "" : s(L.first_name), last: hidePii ? "" : s(L.last_name),
      company: s(cd.company_name), phone: hidePii ? "" : s(L.phone), email: hidePii ? "" : s(L.email),
      product: p?.code ?? "UNCATEGORIZED", productId: p?.id ?? null, stage: stageById.get(s(a.stage_id)) ?? "—", stageId: a.stage_id ? s(a.stage_id) : null,
      resolution: res?.name ?? null, resolutionId: res?.id ?? null, bucket: res ? res.bucket : last ? "approach" : "new",
      owner: a.assigned_to ? s(a.assigned_to) : null, assignedAt: a.assigned_at ? s(a.assigned_at) : null, nextFollowUp: a.next_follow_up_at ? s(a.next_follow_up_at) : null,
      lastCalledAt: last, calls: cc[0], connected: cc[1], createdAt: s(L.created_at), source: s(L.lead_database).replace(/_/g, " "),
      ambassador: importer && ambIds.has(importer) ? importer : null, isNew: !!a.is_new_inbound, focusedOn: a.focused_on ? s(a.focused_on) : null,
      ambassadorHasAccount: !!a.ambassador_user_id, custom,
    };
    // Secondary contacts: same lead/assignment (same product, stage, resolution, owner, etc.) — only their own
    // name, phone and email differ from the Primary (lead) row. Rendered as a child row under the lead in the table.
    const contacts = hidePii ? [] : contactsByLead.get(s(L.id)) ?? [];
    // id stays the same as the parent (it's the same real lead/assignment) so Call/Email/edit actions on a child
    // row still act on the real record — React's own list key (not this field) is what the table uses for identity.
    const extraRows: LeadRow[] = contacts.map((c) => ({ ...base, name: [c.firstName, c.lastName].filter(Boolean).join(" "), first: c.firstName, last: c.lastName, phone: c.phone, email: c.email, extraContacts: 0, extraRows: [] }));
    return { ...base, extraContacts: extraRows.length, extraRows };
  };
  const rows: LeadRow[] = asg.data.map(buildRow);

  /* Ambassador Leads (v2-only addition): every lead from an Ambassador this viewer is the relationship manager for
   * (ambassador_relationship_managers), even if that specific lead/product is currently assigned to someone else.
   * Scoped to Ambassador Leads only — never merged into `rows`, so it can't inflate other tabs/dashboards/KPIs. */
  let ambassadorManagedRows: LeadRow[] = [];
  if (!isAdmin && !isMarketingOnly && !isAmbassadorOnly) {
    const managerScope = user.roles.includes("sales_manager") ? scope : [user.userId];
    const { data: relRows, error: relError } = await db.from("ambassador_relationship_managers").select("ambassador_id, crm_user_id").in("crm_user_id", managerScope);
    if (relError && !["42P01", "PGRST205"].includes((relError as { code?: string }).code ?? "")) warnings.push("Ambassador relationship managers: " + relError.message);
    const managedAmbassadorIds = [...new Set((relRows ?? []).map((r: Raw) => s(r.ambassador_id)))];
    if (managedAmbassadorIds.length) {
      const [{ data: cpRows, error: cpError }, extraByImporter] = await Promise.all([
        db.from("lead_channel_partners").select("lead_id, ambassador_id").in("ambassador_id", managedAmbassadorIds).limit(10000),
        pageAll<Raw>((from, to) => db.from("lead_product_assignments").select(sel).eq("is_active", true).in("lead.ambassador_imported_by", managedAmbassadorIds).order("created_at", { ascending: false }).range(from, to) as unknown as PromiseLike<{ data: Raw[] | null; error: { message: string } | null }>, 5000),
      ]);
      if (cpError && !["42P01", "PGRST205"].includes((cpError as { code?: string }).code ?? "")) warnings.push("Ambassador channel partners: " + cpError.message);
      (cpRows ?? []).forEach((r: Raw) => { if (!cpByLead.has(s(r.lead_id))) cpByLead.set(s(r.lead_id), s(r.ambassador_id)); });
      const managedLeadIds = [...new Set((cpRows ?? []).map((r: Raw) => s(r.lead_id)))];
      const extraByPartner = managedLeadIds.length
        ? await pageAll<Raw>((from, to) => db.from("lead_product_assignments").select(sel).eq("is_active", true).in("lead_id", managedLeadIds).order("created_at", { ascending: false }).range(from, to) as unknown as PromiseLike<{ data: Raw[] | null; error: { message: string } | null }>, 5000)
        : { data: [] as Raw[], error: null };
      const seen = new Set(asgIds); const seenExtra = new Set<string>();
      ambassadorManagedRows = [...extraByPartner.data, ...extraByImporter.data]
        .filter((a) => { const id = s(a.id); if (seen.has(id) || seenExtra.has(id)) return false; seenExtra.add(id); return true; })
        .map(buildRow);
    }
  }

  /* meetings, references, ambassador appointments, ambassador lead inflow */
  const [zoom, meet, refs, ambL] = await Promise.all([
    db.from("lead_zoom_meetings").select("host_user_id, start_time, created_at, lead_id").gte("start_time", since60).limit(5000),
    db.from("lead_google_meetings").select("host_user_id, start_time, created_at, lead_id").gte("start_time", since60).limit(5000),
    db.from("leads").select("created_by, created_at, id, first_name, last_name").eq("lead_database", "reference_leads").gte("created_at", since60).limit(10000),
    db.from("leads").select("ambassador_imported_by, created_at, id, first_name, last_name").not("ambassador_imported_by", "is", null).gte("created_at", since60).limit(10000),
  ]);
  const t0 = Date.now();
  const meetings: MeetEv[] = [...(zoom.data ?? []).map((m: Raw) => ({ ...m, kind: "Zoom" })), ...(meet.data ?? []).map((m: Raw) => ({ ...m, kind: "Google Meet" }))].map((m: Raw) => ({ u: s(m.host_user_id), t: s(m.start_time), sentAt: s(m.created_at) || s(m.start_time), kind: s(m.kind), leadId: s(m.lead_id), upcoming: new Date(s(m.start_time)).getTime() > t0 }));
  const leadName = (r: Raw) => [r.first_name, r.last_name].filter(Boolean).join(" ") || "Lead";
  const references: SimpleEv[] = (refs.data ?? []).map((r: Raw) => ({ u: s(r.created_by), t: s(r.created_at), leadId: s(r.id), name: leadName(r) }));
  const ambLeads: SimpleEv[] = (ambL.data ?? []).map((r: Raw) => ({ u: s(r.ambassador_imported_by), t: s(r.created_at), leadId: s(r.id), name: leadName(r) }));
  const ambProduct = products.find((p) => p.code.toUpperCase() === "AMBASSADOR");
  const ambAppointed: SimpleEv[] = asg.data.filter((a) => ambProduct && s(a.product_id) === ambProduct.id && a.latest_resolution_id && resById.get(s(a.latest_resolution_id))?.bucket === "closing" && a.assigned_to).map((a) => ({ u: s(a.assigned_to), t: s(a.updated_at), leadId: s((a.lead as Raw)?.id), name: leadName((a.lead as Raw) ?? {}) }));

  return { generatedAt: new Date().toISOString(), me: user.userId, roles: user.roles, displayName: user.displayName, scope, people, photos, products, resolutions, rows, ambassadorManagedRows, calls: callEv, meetings, references, ambAppointed, ambLeads, targets, hygiene, columns, warnings };
}
