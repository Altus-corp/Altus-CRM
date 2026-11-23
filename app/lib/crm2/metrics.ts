// Altus CRM v2 — pure metric functions. Run on the client over the Workspace payload, so every
// dashboard, KPI chip and AI rule uses exactly the same numbers.
import { BUCKET, BUCKETS, DEFAULT_TARGETS, PRODUCT_TARGET_RESOLUTIONS, REPORT_GROUPS, type BucketKey, type PeriodKey, type Tone } from "./config";
import type { LeadRow, Workspace } from "./types";

export const DAY = 86_400_000;
export const now = () => Date.now();
export const daysSince = (d: string | null | undefined, ref = now()) => (d ? Math.floor((ref - new Date(d).getTime()) / DAY) : null);
export const inDays = (d: string | null | undefined, days: number, ref = now()) => !!d && ref - new Date(d).getTime() < days * DAY && new Date(d).getTime() <= ref;
export const dayKey = (d: string | number | Date) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };
const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);

/* ---------- calendar-aware date ranges (IST) for the Date filter — see PERIODS in config.ts ---------- */
export type DateRange = { from: number; to: number }; // epoch ms, inclusive
const IST = 5.5 * 3_600_000;
const istParts = (ms: number) => { const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(ms); const g = (t: string) => Number(p.find((x) => x.type === t)?.value); return { y: g("year"), m: g("month"), d: g("day") }; };
const dayStart = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d) - IST;
const dayEnd = (y: number, m: number, d: number) => dayStart(y, m, d + 1) - 1;
const weekday = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 Sun .. 6 Sat
const mondayOf = (y: number, m: number, d: number) => { const wd = weekday(y, m, d); return d - (wd === 0 ? 6 : wd - 1); };
/** Actual start/end instants (IST) for a Date-filter key — calendar-bound for week/month/quarter/year, rolling for last-N-days. */
export function periodRange(key: PeriodKey | string, ref = now()): DateRange {
  const { y, m, d } = istParts(ref); const todayStart = dayStart(y, m, d), todayEnd = dayEnd(y, m, d);
  const lastNDays = (n: number) => ({ from: dayStart(y, m, d - n + 1), to: todayEnd });
  switch (key) {
    case "today": return { from: todayStart, to: todayEnd };
    case "yesterday": return { from: dayStart(y, m, d - 1), to: dayEnd(y, m, d - 1) };
    case "d7": return lastNDays(7);
    case "d10": return lastNDays(10);
    case "d15": return lastNDays(15);
    case "d30": return lastNDays(30);
    case "d60": return lastNDays(60);
    case "thisweek": return { from: dayStart(y, m, mondayOf(y, m, d)), to: todayEnd };
    case "lastweek": { const thisMon = dayStart(y, m, mondayOf(y, m, d)); return { from: dayStart(y, m, mondayOf(y, m, d) - 7), to: thisMon - 1 }; }
    case "thismonth": return { from: dayStart(y, m, 1), to: todayEnd };
    case "lastmonth": { const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1; return { from: dayStart(py, pm, 1), to: dayStart(y, m, 1) - 1 }; }
    case "thisquarter": { const qm = Math.floor((m - 1) / 3) * 3 + 1; return { from: dayStart(y, qm, 1), to: todayEnd }; }
    case "lastquarter": { const qm = Math.floor((m - 1) / 3) * 3 + 1; const thisQStart = dayStart(y, qm, 1); const py = qm === 1 ? y - 1 : y, pqm = qm === 1 ? 10 : qm - 3; return { from: dayStart(py, pqm, 1), to: thisQStart - 1 }; }
    case "lastyear": return { from: dayStart(y - 1, 1, 1), to: dayStart(y, 1, 1) - 1 };
    default: return lastNDays(7);
  }
}
/** A user-picked start/end date (as from <input type="date">, "YYYY-MM-DD") — whole calendar days, IST. */
export function customRange(from: string, to: string): DateRange {
  const f = from ? from.split("-").map(Number) : null; const t = to ? to.split("-").map(Number) : null;
  return { from: f ? dayStart(f[0], f[1], f[2]) : -8_640_000_000_000_000, to: t ? dayEnd(t[0], t[1], t[2]) : 8_640_000_000_000_000 };
}
export const inRange = (d: string | null | undefined, range: DateRange) => { if (!d) return false; const t = new Date(d).getTime(); return t >= range.from && t <= range.to; };
export const rangeDays = (range: DateRange) => Math.max(1, Math.round((range.to - range.from) / DAY));

export const personName = (ws: Workspace, id: string | null | undefined) => (id && ws.people.find((p) => p.id === id)?.name) || "Unassigned";
export const photoFor = (ws: Workspace, id: string | null | undefined) => (id && ws.photos[id]) || null;
export const isLive = (r: LeadRow) => r.bucket !== "lost";

export function priorityScore(l: LeadRow) {
  const b = BUCKET[l.bucket].weight;
  const fu = l.nextFollowUp ? Math.max(0, 20 - Math.abs(daysSince(l.nextFollowUp) ?? 0)) : 0;
  const rec = l.lastCalledAt ? Math.max(0, 15 - (daysSince(l.lastCalledAt) ?? 99)) : 0;
  const pr = (l.custom.priority || "").toLowerCase();
  return Math.round(b + fu + rec + (pr === "high" ? 10 : pr === "medium" ? 5 : 0));
}
export function winProb(l: LeadRow) {
  const base: Record<BucketKey, number> = { closing: 72, negotiation: 48, followup: 26, approach: 11, new: 6, lost: 1 };
  const stale = l.lastCalledAt && (daysSince(l.lastCalledAt) ?? 0) > 7 ? 9 : 0;
  return Math.min(95, Math.max(1, Math.round(base[l.bucket] + (l.connected > 2 ? 5 : 0) - stale)));
}
export function nextAction(l: LeadRow) {
  const d = daysSince(l.lastCalledAt);
  if (l.bucket === "closing") return d != null && d > 2 ? "Call today — closing lead going cold" : "Send agreement / collect payment";
  if (l.bucket === "negotiation") return "Share revised proposal & fix a decision date";
  if (l.bucket === "followup") return l.nextFollowUp && (daysSince(l.nextFollowUp) ?? 0) > 0 ? "Overdue follow-up — call now" : "Book demo / meeting";
  if (l.bucket === "approach") return "Try in the best connect slot (see Best Time to Call)";
  if (l.bucket === "new") return l.owner ? "First call within 24 h of assignment" : "Assign to a sales person";
  return "Archive or move to DND";
}
export const missingFields = (ws: Workspace, l: LeadRow) => ws.hygiene.filter((h) => !fieldValue(l, h.key)).map((h) => h.label);
export function fieldValue(l: LeadRow, key: string): string {
  const std: Record<string, string | null> = { email: l.email, phone: l.phone, first_name: l.first, last_name: l.last, company_name: l.company };
  return (key in std ? std[key] : l.custom[key]) || "";
}
const bucketReached = (rowBucket: BucketKey, from: BucketKey) => {
  const order: BucketKey[] = ["new", "approach", "followup", "negotiation", "closing"];
  return rowBucket !== "lost" && order.indexOf(rowBucket) >= order.indexOf(from);
};

export function callingReport(ws: Workspace, users: string[], range: DateRange) {
  const days = rangeDays(range);
  return users.map((id) => {
    const cs = ws.calls.filter((c) => c.u === id && inRange(c.t, range));
    const conn = cs.filter((c) => c.c).length;
    const assigned = ws.rows.filter((r) => r.owner === id && inRange(r.assignedAt, range));
    const called = assigned.filter((r) => r.lastCalledAt).length;
    const tgt = (ws.targets[id]?.callsPerDay ?? DEFAULT_TARGETS.sales.callsPerDay) * Math.min(days, 6);
    return { id, person: personName(ws, id), calls: cs.length, outgoing: cs.filter((c) => c.out).length, incoming: cs.filter((c) => !c.out).length, connected: conn, connectRate: cs.length ? Math.round((conn / cs.length) * 100) : 0, unique: new Set(cs.map((c) => c.a).filter(Boolean)).size, assigned: assigned.length, calledPct: assigned.length ? Math.round((called / assigned.length) * 100) : 0, talkMins: Math.round(sum(cs, (c) => c.d) / 60), followUps: ws.rows.filter((r) => r.owner === id && r.nextFollowUp && inRange(r.lastCalledAt, range)).length, target: tgt };
  });
}
export function dailyCalls(ws: Workspace, users: string[], days: number) {
  const out: { day: string; total: number; connected: number }[] = [];
  for (let d = days - 1; d >= 0; d--) { const k = dayKey(now() - d * DAY); const cs = ws.calls.filter((c) => users.includes(c.u) && dayKey(c.t) === k); out.push({ day: k, total: cs.length, connected: cs.filter((c) => c.c).length }); }
  return out;
}
export function hourHeat(ws: Workspace, users: string[], range: DateRange) {
  const g: Record<string, { n: number; c: number }> = {};
  ws.calls.filter((c) => users.includes(c.u) && inRange(c.t, range)).forEach((c) => { const t = new Date(c.t); const k = `${t.getDay()}-${t.getHours()}`; (g[k] ||= { n: 0, c: 0 }).n++; if (c.c) g[k].c++; });
  return g;
}
export const AGE_BANDS: [string, number, number, Tone][] = [["0–1 d", 0, 1, "mint"], ["2–3 d", 2, 3, "sage"], ["4–7 d", 4, 7, "butter"], ["8–14 d", 8, 14, "peach"], ["15–30 d", 15, 30, "rose"], ["30+ d", 31, 99999, "lav"]];
export function ageing(ws: Workspace, users: string[]) {
  return users.map((id) => {
    const mine = ws.rows.filter((l) => l.owner === id && isLive(l) && l.assignedAt);
    const nc = mine.filter((l) => !l.lastCalledAt);
    const row: Record<string, number | string> = { id, person: personName(ws, id), notCalled: nc.length };
    AGE_BANDS.forEach(([lab, a, b]) => { row[lab] = nc.filter((l) => { const d = daysSince(l.assignedAt) ?? 0; return d >= a && d <= b; }).length; });
    row.followupStale = mine.filter((l) => l.bucket === "followup" && l.lastCalledAt && (daysSince(l.lastCalledAt) ?? 0) > 7).length;
    row.oldest = nc.length ? Math.max(...nc.map((l) => daysSince(l.assignedAt) ?? 0)) : 0;
    return row;
  });
}
export function followups(ws: Workspace, users: string[]) {
  return users.map((id) => {
    const mine = ws.rows.filter((l) => l.owner === id && l.nextFollowUp && isLive(l));
    const d = (l: LeadRow) => -(daysSince(l.nextFollowUp) ?? 0);
    return { id, person: personName(ws, id), overdue: mine.filter((l) => d(l) < 0).length, today: mine.filter((l) => d(l) === 0).length, tomorrow: mine.filter((l) => d(l) === 1).length, week: mine.filter((l) => d(l) > 1 && d(l) <= 7).length, total: mine.length };
  });
}
export function targets(ws: Workspace, users: string[], range: DateRange) {
  const wk = rangeDays(range) / 7; const T = (x: number) => Math.max(1, Math.round(x * wk));
  const days = rangeDays(range); const focusedIds = new Set(ws.rows.filter((r) => r.focusedOn).map((r) => r.id));
  return users.map((id) => {
    const t = { ...DEFAULT_TARGETS.sales, ...ws.targets[id] };
    const demos = ws.meetings.filter((e) => e.u === id && !e.upcoming && inRange(e.t, range)).length;
    const refs = ws.references.filter((e) => e.u === id && inRange(e.t, range)).length;
    const ambs = ws.ambAppointed.filter((e) => e.u === id && inRange(e.t, range)).length;
    // Meeting target tracks when the Zoom/Meet link was sent (sentAt), not when the call itself happens.
    const meetingsSent = ws.meetings.filter((e) => e.u === id && inRange(e.sentAt, range)).length;
    // Calls target scoped to round-robin Focused Leads only — same per-day scaling as the general calling report.
    const focusedCalls = ws.calls.filter((c) => c.u === id && c.a && focusedIds.has(c.a) && inRange(c.t, range)).length;
    const focusedCallsT = Math.max(1, Math.round(t.focusedCalls * Math.min(days, 6)));
    return { id, person: personName(ws, id),
      demosRaw: t.demos, demosT: T(t.demos), demos, demosGap: demos - T(t.demos),
      refsRaw: t.references, refsT: T(t.references), refs, refsGap: refs - T(t.references),
      ambRaw: t.ambassadors, ambT: T(t.ambassadors), ambs, ambGap: ambs - T(t.ambassadors),
      meetingsRaw: t.meetings, meetingsT: T(t.meetings), meetingsSent, meetingsGap: meetingsSent - T(t.meetings),
      focusedCallsRaw: t.focusedCalls, focusedCallsT, focusedCalls, focusedCallsGap: focusedCalls - focusedCallsT };
  });
}
/** Per-(person, product) activity target — a lead counts the period its resolution last changed to one of that
 * product's PRODUCT_TARGET_RESOLUTIONS. Only products with a resolution list configured get a column. */
export function productActivityTargets(ws: Workspace, users: string[], range: DateRange) {
  const wk = rangeDays(range) / 7; const T = (x: number) => Math.max(1, Math.round(x * wk));
  const codes = Object.keys(PRODUCT_TARGET_RESOLUTIONS).filter((c) => ws.products.some((p) => p.code === c));
  const namesByCode = new Map(codes.map((c) => [c, new Set(PRODUCT_TARGET_RESOLUTIONS[c].map(normResolution))]));
  return { codes, rows: users.map((id) => {
    const t = ws.targets[id]?.products ?? {};
    const byCode: Record<string, { raw: number; actual: number; target: number; gap: number }> = {};
    for (const code of codes) {
      const names = namesByCode.get(code)!;
      const actual = ws.rows.filter((l) => l.owner === id && l.product === code && l.resolution && names.has(normResolution(l.resolution)) && inRange(l.lastCalledAt, range)).length;
      const raw = t[code] ?? 0; const target = T(raw);
      byCode[code] = { raw, actual, target, gap: actual - target };
    }
    return { id, person: personName(ws, id), byCode };
  }) };
}
export function ambassadorIds(ws: Workspace) { return ws.people.filter((p) => p.roles.includes("ambassador")).map((p) => p.id); }
export function ambTargets(ws: Workspace, range: DateRange, only?: string) {
  const wk = rangeDays(range) / 7; const T = (x: number) => Math.max(1, Math.round(x * wk));
  return ambassadorIds(ws).filter((id) => !only || id === only).map((id) => {
    const t = { ...DEFAULT_TARGETS.ambassador, ...ws.targets[id] };
    const demos = ws.meetings.filter((e) => e.u === id && !e.upcoming && inRange(e.t, range)).length;
    const leads = ws.ambLeads.filter((e) => e.u === id && inRange(e.t, range)).length;
    return { id, person: personName(ws, id), demosT: T(t.demos), demos, demosGap: demos - T(t.demos), leadsT: T(t.leads), leads, leadsGap: leads - T(t.leads) };
  });
}
export const INFLOW_DAYS = [1, 3, 7, 10, 15, 22, 30];
export function inflow(ws: Workspace, kind: "amb" | "sales", ids: string[], range: DateRange) {
  return ids.map((id) => {
    const src = kind === "amb" ? ws.ambLeads.filter((e) => e.u === id).map((e) => e.t) : ws.rows.filter((r) => r.owner === id && r.assignedAt).map((r) => r.assignedAt as string);
    const row: Record<string, number | string | number[]> = { id, person: personName(ws, id) };
    INFLOW_DAYS.forEach((d) => { row["d" + d] = src.filter((t) => inDays(t, d)).length; });
    row.range = src.filter((t) => inRange(t, range)).length;
    row.spark = Array.from({ length: 14 }, (_, i) => src.filter((t) => dayKey(t) === dayKey(now() - (13 - i) * DAY)).length);
    return row;
  });
}
export function ranking(ws: Workspace, users: string[], range: DateRange) {
  const cr = Object.fromEntries(callingReport(ws, users, range).map((r) => [r.id, r]));
  const tg = Object.fromEntries(targets(ws, users, range).map((r) => [r.id, r]));
  const rows = users.map((id) => {
    const f = followups(ws, [id])[0];
    return { id, person: personName(ws, id), closures: ws.rows.filter((l) => l.owner === id && l.bucket === "closing").length, calls: cr[id].calls, connected: cr[id].connected, demos: tg[id].demos, demosT: tg[id].demosT, refs: tg[id].refs, refsT: tg[id].refsT, ambs: tg[id].ambs, ambT: tg[id].ambT, discipline: Math.round((f.total ? 1 - f.overdue / f.total : 1) * 100), score: 0, rank: 0 };
  });
  const mx = (k: "closures" | "connected") => Math.max(1, ...rows.map((r) => r[k]));
  rows.forEach((r) => { r.score = Math.round(30 * r.closures / mx("closures") + 20 * Math.min(1, r.demos / r.demosT) + 15 * r.connected / mx("connected") + 15 * Math.min(1, r.refs / r.refsT) + 10 * Math.min(1, r.ambs / r.ambT) + 10 * r.discipline / 100); });
  rows.sort((a, b) => b.score - a.score).forEach((r, i) => { r.rank = i + 1; });
  return rows;
}
export function hygiene(ws: Workspace, leads: LeadRow[]) {
  return (["followup", "negotiation", "closing"] as BucketKey[]).map((b) => {
    const ls = leads.filter((l) => l.bucket === b);
    const rules = ws.hygiene.filter((h) => bucketReached(b, h.fromBucket));
    const row: Record<string, number | string> = { bucket: b, stage: BUCKET[b].label, leads: ls.length };
    let empty = 0;
    ws.hygiene.forEach((h) => { const n = rules.includes(h) ? ls.filter((l) => !fieldValue(l, h.key)).length : 0; row[h.key] = n; empty += n; });
    row.empty = empty; row.complete = ls.length && rules.length ? Math.round(100 - (empty / (ls.length * rules.length)) * 100) : 100;
    return row;
  });
}
export function resolutionReport(ws: Workspace, leads: LeadRow[], range: DateRange) {
  return ws.resolutions.map((r) => { const ls = leads.filter((l) => l.resolutionId === r.id); const p = ls.filter((l) => inRange(l.lastCalledAt, range)).length; return { id: r.id, name: r.name, bucket: BUCKET[r.bucket].label, bucketKey: r.bucket, tone: BUCKET[r.bucket].tone, today: ls.filter((l) => inDays(l.lastCalledAt, 1)).length, period: p, avg: +(p / rangeDays(range)).toFixed(1), total: ls.length }; });
}
// Strips case, spacing AND punctuation so "Follow up" / "Follow Up" / "old, graduate" / "Old Graduate" /
// "Ringing/Did Not Pick" / "Ringing/ Did Not Pick" (real duplicate lead_resolutions rows) all collapse together.
export const normResolution = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
/** Groups leads by their current call resolution into the reporting cards (REPORT_GROUPS) — independent of
 * the priority-stage buckets. A lead whose resolution isn't in any group's list is left out of every card. */
export function reportGroups(leads: LeadRow[], range: DateRange) {
  return REPORT_GROUPS.map((g) => {
    const names = new Set(g.resolutions.map(normResolution));
    const rows = leads.filter((l) => l.resolution && names.has(normResolution(l.resolution)));
    const periodRows = rows.filter((l) => inRange(l.lastCalledAt, range));
    return { key: g.key, label: g.label, tone: g.tone, rows, periodRows, total: rows.length, period: periodRows.length };
  });
}
export function funnel(ws: Workspace, code: string, leads: LeadRow[]) {
  const p = ws.products.find((x) => x.code === code); if (!p) return [];
  const ls = leads.filter((l) => l.product === code && isLive(l)); const idx = (s: string) => p.stages.findIndex((x) => x.name === s);
  return p.stages.map((s, i) => ({ stage: s.name, n: ls.filter((l) => idx(l.stage) >= i).length }));
}
export function sources(leads: LeadRow[]) {
  const srcs = [...new Set(leads.map((l) => l.source || "—"))];
  return srcs.map((s) => { const ls = leads.filter((l) => (l.source || "—") === s); const won = ls.filter((l) => l.bucket === "closing").length; const calls = sum(ls, (l) => l.calls), conn = sum(ls, (l) => l.connected); return { id: s, source: s, leads: ls.length, connectRate: calls ? Math.round((conn / calls) * 100) : 0, hot: ls.filter((l) => l.bucket === "closing" || l.bucket === "negotiation").length, won, conv: ls.length ? +((won / ls.length) * 100).toFixed(1) : 0, lost: ls.filter((l) => l.bucket === "lost").length }; });
}
export function speedToLead(ws: Workspace, users: string[]) {
  return users.map((id) => {
    const mine = ws.rows.filter((l) => l.owner === id && l.assignedAt);
    const firsts = mine.map((l) => { const c = ws.calls.filter((x) => x.a === l.id && new Date(x.t) >= new Date(l.assignedAt as string)).map((x) => new Date(x.t).getTime()); return c.length ? (Math.min(...c) - new Date(l.assignedAt as string).getTime()) / 3_600_000 : null; }).filter((h): h is number => h != null);
    const avg = firsts.length ? sum(firsts, (h) => h) / firsts.length : 0;
    return { id, person: personName(ws, id), assigned: mine.length, called: firsts.length, never: mine.filter((l) => !l.lastCalledAt).length, avgHrs: +avg.toFixed(1), within1h: firsts.length ? Math.round((firsts.filter((h) => h <= 1).length / firsts.length) * 100) : 0, within24h: firsts.length ? Math.round((firsts.filter((h) => h <= 24).length / firsts.length) * 100) : 0 };
  });
}
export function lostReasons(ws: Workspace, leads: LeadRow[]) {
  return ws.resolutions.filter((r) => r.bucket === "lost").map((r) => ({ reason: r.name, n: leads.filter((l) => l.resolutionId === r.id).length })).sort((a, b) => b.n - a.n);
}

/* ---------------- rule-engine insights (used directly, and as the facts sent to Claude) ---------------- */
export type Insight = { cat: string; tone: Tone; sev: "high" | "med" | "low"; title: string; body: string; metric: string | number; action: { label: string; dash?: string; filter?: "closing" | "negotiation" | "overdue" | "never-called" } };
export function insights(ws: Workspace, leads: LeadRow[], users: string[]): Insight[] {
  const out: Insight[] = [];
  const closing = leads.filter((l) => l.bucket === "closing").sort((a, b) => priorityScore(b) - priorityScore(a));
  out.push({ cat: "Money now", tone: "mint", sev: "high", title: `${closing.length} leads are one call from closing`, body: `${closing.filter((l) => (daysSince(l.lastCalledAt) ?? 0) > 3).length} of them not called in 3+ days. Top: ${closing.slice(0, 3).map((l) => l.name).join(", ") || "—"}.`, metric: closing.length, action: { label: "Open closing list", filter: "closing" } });
  const neg = leads.filter((l) => l.bucket === "negotiation");
  out.push({ cat: "Money now", tone: "butter", sev: "high", title: `${neg.length} deals in negotiation`, body: `${neg.filter((l) => !l.nextFollowUp || (daysSince(l.nextFollowUp) ?? 0) > 0).length} have no future follow-up date. Fix a decision date on each call.`, metric: neg.length, action: { label: "Open negotiation list", filter: "negotiation" } });
  const overdue = leads.filter((l) => isLive(l) && l.nextFollowUp && (daysSince(l.nextFollowUp) ?? 0) > 0);
  const by: Record<string, number> = {}; overdue.forEach((l) => { if (l.owner) by[l.owner] = (by[l.owner] || 0) + 1; });
  const worst = Object.entries(by).sort((a, b) => b[1] - a[1])[0];
  out.push({ cat: "Risk", tone: "rose", sev: "high", title: `${overdue.length} follow-ups are overdue`, body: worst ? `${personName(ws, worst[0])} holds ${worst[1]} of them.` : "None — good discipline.", metric: overdue.length, action: { label: "Open overdue follow-ups", filter: "overdue" } });
  const nc = leads.filter((l) => l.owner && !l.lastCalledAt && isLive(l)); const old = nc.filter((l) => (daysSince(l.assignedAt) ?? 0) > 3);
  out.push({ cat: "Risk", tone: "butter", sev: "med", title: `${old.length} assigned leads never called for 3+ days`, body: `Out of ${nc.length} uncalled leads. Re-assign or call before noon.`, metric: old.length, action: { label: "Open ageing list", filter: "never-called" } });
  const tg = targets(ws, users, periodRange("d7")); const behind = tg.filter((r) => r.demosGap < 0);
  out.push({ cat: "People", tone: "rose", sev: behind.length > 2 ? "high" : "med", title: `${behind.length} of ${tg.length} below demo target this week`, body: behind.map((r) => `${r.person} ${r.demos}/${r.demosT}`).join(" · ") || "Everyone on target.", metric: behind.length, action: { label: "Open targets", dash: "targets" } });
  out.push({ cat: "People", tone: "peach", sev: "med", title: `References this week: ${sum(tg, (r) => r.refs)} / ${sum(tg, (r) => r.refsT)}`, body: `${tg.filter((r) => r.refsGap < 0).length} people below 15/week.`, metric: sum(tg, (r) => r.refs), action: { label: "Open targets", dash: "targets" } });
  const heat = hourHeat(ws, users, periodRange("d30")); const hrs: Record<string, { n: number; c: number }> = {};
  Object.entries(heat).forEach(([k, v]) => { const h = k.split("-")[1]; (hrs[h] ||= { n: 0, c: 0 }).n += v.n; hrs[h].c += v.c; });
  const best = Object.entries(hrs).filter(([, v]) => v.n > 20).sort((a, b) => b[1].c / b[1].n - a[1].c / a[1].n).slice(0, 2);
  if (best.length) out.push({ cat: "Opportunity", tone: "sky", sev: "low", title: `Best connect windows: ${best.map(([h]) => `${+h > 12 ? +h - 12 : h}${+h >= 12 ? " PM" : " AM"}`).join(" & ")}`, body: `Connect rate ${best.map(([, v]) => Math.round((v.c / v.n) * 100) + "%").join(" / ")}. Put hot-list calls here.`, metric: Math.round((best[0][1].c / best[0][1].n) * 100) + "%", action: { label: "Open best time", dash: "best-time" } });
  const src = sources(leads).filter((s) => s.leads >= 10).sort((a, b) => b.conv - a.conv);
  if (src.length > 1) out.push({ cat: "Opportunity", tone: "sage", sev: "low", title: `${src[0].source} converts best (${src[0].conv}%)`, body: `${src[src.length - 1].source} converts lowest (${src[src.length - 1].conv}%).`, metric: src[0].conv + "%", action: { label: "Open sources", dash: "sources" } });
  const hy = hygiene(ws, leads); const tot = sum(hy, (r) => Number(r.empty));
  out.push({ cat: "Process", tone: "aqua", sev: "med", title: `${tot} empty fields on leads past follow-up`, body: hy.map((r) => `${r.stage}: ${r.complete}%`).join(" · "), metric: tot, action: { label: "Open hygiene", dash: "hygiene" } });
  const zero = ambTargets(ws, periodRange("d7")).filter((a) => a.leads === 0);
  if (zero.length) out.push({ cat: "People", tone: "lav", sev: "med", title: `${zero.length} ambassadors added zero leads in 7 days`, body: zero.slice(0, 5).map((a) => a.person).join(", "), metric: zero.length, action: { label: "Open ambassador inflow", dash: "ambassador-inflow" } });
  const fc = Math.round(closing.length * 0.72 + neg.length * 0.48 + leads.filter((l) => l.bucket === "followup").length * 0.1);
  out.push({ cat: "Forecast", tone: "mint", sev: "low", title: `Expected closures in 30 days: ~${fc}`, body: "Weighted by stage (Closing 72% · Negotiation 48% · Follow-up 10%).", metric: fc, action: { label: "Open hot pipeline", dash: "hot" } });
  return out;
}
export { BUCKETS };
