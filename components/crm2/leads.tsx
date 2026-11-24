"use client";
// Lead columns, filters, KPI chips and bulk actions — shared by every lead table and dashboard list.
import { useState, type ReactNode } from "react";
import { BUCKET, BUCKETS, TONES, type Tone } from "@/app/lib/crm2/config";
import { computedFieldValue, customRange, daysSince, inRange, missingFields, nextAction, periodRange, personName, photoFor, priorityScore, winProb } from "@/app/lib/crm2/metrics";
import type { LeadRow, Workspace } from "@/app/lib/crm2/types";
import { v2AddProduct, v2UpdateField } from "@/app/crm/actions";
import { displayProductCode } from "@/app/lib/product-display";
import { Avatar, Icon, Pill, Win, ago, cap, fdate } from "./ui";
import type { BulkAction, Col, Opt } from "./DataTable";
import type { Ctx } from "./context";

export const leadTone = (r: LeadRow): Tone => BUCKET[r.bucket].tone;
/** Calls go through Altus Contacts (same click-to-call API the classic CRM uses) — never a bare tel: link. */
export async function dialLead(leadId: string, assignmentId: string, number: string) {
  try {
    const res = await fetch("/api/altus-contacts/dial", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leadId, assignmentId, number }) });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || j.ok === false) throw new Error(j.error || "Unable to start the call.");
    return { ok: true, message: "Call requested in Altus Contacts." };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Unable to start the call." }; }
}
const salesPeople = (ws: Workspace) => ws.people.filter((p) => p.roles.some((r) => r === "sales_executive" || r === "sales_manager" || r === "consultant" || r === "admin"));
/** Full sales-person list — for display and the "Sales person" filter chip, which anyone may use to filter what they already see. */
export const ownerOpts = (ws: Workspace): Opt[] => salesPeople(ws).map((p) => ({ v: p.id, l: p.name }));
/** Whether this viewer may reassign a lead's owner at all — matches manuallyAssignLeads' own server-side check
 * (admin, or a sales_manager reassigning within their own team). Sales executives/consultants can't reassign. */
export const canAssignOwner = (ws: Workspace) => ws.roles.includes("admin") || ws.roles.includes("sales_manager");
/** Who a manager/admin may hand a lead to: admin -> any sales person; sales_manager -> their own team only
 * (ws.scope is already [self, ...team]) — the server enforces the same scoping again regardless. */
export const assignableOpts = (ws: Workspace): Opt[] => ws.roles.includes("admin") ? ownerOpts(ws) : salesPeople(ws).filter((p) => ws.scope.includes(p.id)).map((p) => ({ v: p.id, l: p.name }));
const resTone = (ws: Workspace, r: LeadRow): Tone => (r.resolutionId ? BUCKET[ws.resolutions.find((x) => x.id === r.resolutionId)?.bucket ?? "approach"].tone : "lav");

const DUP_CORE_LABELS = new Set(["lead no", "lead number", "last name", "company name"]);
export function leadCols(ws: Workspace, canEdit: boolean, toast?: (m: string) => void): Col<LeadRow>[] {
  const custom = ws.columns.filter((c) => c.source === "custom" && !["company_name", "priority"].includes(c.key) && !DUP_CORE_LABELS.has(c.label.trim().toLowerCase()));
  const e = <T,>(x: T) => (canEdit ? x : undefined);
  const call = (r: LeadRow) => { dialLead(r.leadId, r.id, r.phone).then((res) => toast?.(res.message)); };
  return [
    { k: "name", label: "Lead", w: 180, group: false, render: (r) => <>{r.name}{r.isNew && <span className="newtag">NEW</span>}</> },
    { k: "contact", label: "Contact", w: 84, group: false, text: (r) => r.phone, render: (r) => <span className="cact" onClick={(ev) => ev.stopPropagation()}><a href="#" onClick={(ev) => { ev.preventDefault(); call(r); }} title="Call via Altus Contacts"><Icon n="phone" /></a><a href={`https://wa.me/91${r.phone.replace(/\D/g, "").slice(-10)}`} target="_blank" rel="noopener noreferrer" title="WhatsApp"><Icon n="wa" /></a>{r.email && <a href={`mailto:${r.email}`} title={r.email}><Icon n="mail" /></a>}</span> },
    { k: "company", label: "Company", group: false, edit: e({ type: "text" as const }) },
    { k: "phone", label: "Cell number", group: false },
    { k: "product", label: "Product", text: (r) => r.product, render: (r) => <Pill tone="slate">{displayProductCode(r.product)}</Pill> },
    { k: "stage", label: "Stage" },
    { k: "bucket", label: "Priority stage", text: (r) => BUCKET[r.bucket].label, val: (r) => BUCKET[r.bucket].weight, groupVal: (r) => BUCKET[r.bucket].label, groupTone: (r) => BUCKET[r.bucket].tone, render: (r) => <Pill tone={BUCKET[r.bucket].tone}>{BUCKET[r.bucket].label}</Pill> },
    { k: "resolution", label: "Call resolution", text: (r) => r.resolution ?? "Not called", groupTone: (r) => resTone(ws, r), render: (r) => (r.resolution ? <Pill tone={resTone(ws, r)}>{r.resolution}</Pill> : <span style={{ color: "var(--faint)" }}>Not called</span>), edit: e({ options: () => ws.resolutions.map((x) => ({ v: x.id, l: x.name, tone: BUCKET[x.bucket].tone })) }) },
    { k: "owner", label: "Sales person", text: (r) => personName(ws, r.owner), render: (r) => (r.owner ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Avatar name={personName(ws, r.owner)} photo={photoFor(ws, r.owner)} />{personName(ws, r.owner)}</span> : <span style={{ color: "var(--faint)" }}>Unassigned</span>), edit: canEdit && canAssignOwner(ws) ? { options: () => assignableOpts(ws) } : undefined },
    { k: "lastCalledAt", label: "Last called", groupVal: (r) => (!r.lastCalledAt ? "Never called" : (daysSince(r.lastCalledAt) ?? 0) <= 3 ? "0–3 days" : (daysSince(r.lastCalledAt) ?? 0) <= 7 ? "4–7 days" : "8+ days"), render: (r) => { const d = daysSince(r.lastCalledAt); return <span style={{ color: d == null ? TONES.rose.ink : d > 7 ? TONES.butter.ink : undefined, fontWeight: d == null || d > 7 ? 700 : 400 }}>{ago(r.lastCalledAt)}</span>; } },
    { k: "notCalled", label: "Not called since assigned", num: true, group: false, val: (r) => (!r.lastCalledAt && r.assignedAt ? daysSince(r.assignedAt) : null), render: (r) => { const v = !r.lastCalledAt && r.assignedAt ? daysSince(r.assignedAt) : null; return v == null ? "—" : <b style={{ color: v > 3 ? TONES.rose.ink : TONES.butter.ink }}>{v} d</b>; } },
    { k: "nextFollowUp", label: "Next follow-up", edit: e({ type: "date" as const }), groupVal: (r) => { if (!r.nextFollowUp) return "No follow-up"; const d = -(daysSince(r.nextFollowUp) ?? 0); return d < 0 ? "Overdue" : d === 0 ? "Today" : d <= 7 ? "This week" : "Later"; }, render: (r) => { if (!r.nextFollowUp) return "—"; const d = -(daysSince(r.nextFollowUp) ?? 0); return <span style={{ color: d < 0 ? TONES.rose.ink : d === 0 ? TONES.peach.ink : undefined, fontWeight: d <= 0 ? 700 : 400 }}>{fdate(r.nextFollowUp)}{d < 0 ? ` · ${-d}d late` : d === 0 ? " · today" : ""}</span>; } },
    { k: "score", label: "Focus score", num: true, group: false, val: priorityScore },
    { k: "win", label: "AI win %", num: true, group: false, val: winProb, render: (r) => { const p = winProb(r); return <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span className="bar-in" style={{ width: 50 }}><i style={{ width: `${p}%`, background: TONES[p > 50 ? "mint" : p > 20 ? "butter" : "slate"].mk }} /></span>{p}%</span>; } },
    { k: "action", label: "AI next best action", w: 240, group: false, val: nextAction },
    { k: "source", label: "Source", text: (r) => r.source, groupVal: (r) => cap(r.source), render: (r) => cap(r.source) },
    { k: "calls", label: "Calls (60 d)", num: true, group: false }, { k: "connected", label: "Connected", num: true, group: false },
    { k: "hyg", label: "Empty fields", num: true, group: false, val: (r) => missingFields(ws, r).length, render: (r) => { const m = missingFields(ws, r); return m.length ? <span title={m.join(", ")} style={{ color: m.length > 4 ? TONES.rose.ink : TONES.butter.ink, fontWeight: 700 }}>{m.length}</span> : <span style={{ color: TONES.mint.ink }}>✓</span>; } },
    { k: "email", label: "Email", group: false, edit: e({ type: "text" as const }) },
    { k: "ambassador", label: "Ambassador", text: (r) => (r.ambassador ? personName(ws, r.ambassador) : "—") },
    { k: "createdAt", label: "Created on", groupVal: (r) => fdate(r.createdAt) }, { k: "assignedAt", label: "Assigned on", groupVal: (r) => fdate(r.assignedAt) },
    { k: "no", label: "Lead no.", group: false },
    ...custom.map((c): Col<LeadRow> => c.computedFrom.length
      ? { k: "c:" + c.key, label: c.label, text: (r) => computedFieldValue(r, c.computedFrom) }
      : c.label.trim().toLowerCase() === "lead acquisition date"
        ? { k: "c:" + c.key, label: c.label, text: (r) => fdate(r.createdAt) }
        : { k: "c:" + c.key, label: c.label, text: (r) => r.custom[c.key] ?? "", edit: e(c.fieldType === "dropdown" && c.options.length ? { options: () => c.options.map((o) => ({ v: o, l: o })) } : { type: "text" as const }) }),
  ];
}
export const LEAD_HIDDEN = ["phone", "notCalled", "score", "action", "connected", "email", "createdAt", "assignedAt", "no"];
export const hiddenWithCustom = (ws: Workspace) => [...LEAD_HIDDEN, ...ws.columns.filter((c) => c.source === "custom").map((c) => "c:" + c.key)];

/** Save an edit through the existing actions, then patch the local rows. */
export function leadEditor(ctx: Ctx, toast: (m: string) => void) {
  return async (rows: LeadRow[], col: Col<LeadRow>, value: string) => {
    const field = col.k === "owner" ? "owner" : col.k === "resolution" ? "resolutionId" : col.k === "nextFollowUp" ? "nextFollowUp" : col.k === "company" ? "company_name" : col.k.startsWith("c:") ? col.k.slice(2) : col.k;
    const res = await v2UpdateField(rows.map((r) => ({ leadId: r.leadId, assignmentId: r.id })), field, field === "nextFollowUp" ? new Date(value).toISOString() : value);
    toast(res.message);
    if (!res.ok) return;
    const patch: Partial<LeadRow> = field === "owner" ? { owner: value, assignedAt: new Date().toISOString() } : field === "resolutionId" ? (() => { const x = ctx.ws.resolutions.find((q) => q.id === value); return { resolutionId: value, resolution: x?.name ?? null, bucket: x?.bucket ?? "approach", lastCalledAt: new Date().toISOString() }; })() : field === "nextFollowUp" ? { nextFollowUp: new Date(value).toISOString() } : field === "company_name" ? { company: value } : field === "email" ? { email: value } : {};
    if (col.k.startsWith("c:")) rows.forEach((r) => ctx.patchRows([r.id], { custom: { ...r.custom, [field]: value } }));
    else ctx.patchRows(rows.map((r) => r.id), patch);
  };
}
/** "Add value" bulk panel — in the bulk bar between "Change field" and WhatsApp. Product is additive (checks
 * several, each becomes a new product assignment, existing ones untouched); every other dropdown field
 * (Call resolution, Sales person, and any custom dropdown column) is single-valued so picking one replaces it,
 * same as "Change field" — only the fields you actually pick a value for are touched. */
function BulkAddValueModal({ rows, ctx, toast, onClose, onDone }: { rows: LeadRow[]; ctx: Ctx; toast: (m: string) => void; onClose: () => void; onDone: () => void }) {
  const ws = ctx.ws;
  const [prodSel, setProdSel] = useState<Set<string>>(new Set());
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const products = ws.products.filter((p) => p.code !== "AMBASSADOR");
  const customDropdowns = ws.columns.filter((c) => c.source === "custom" && c.fieldType === "dropdown" && c.options.length);
  const fieldRows: { key: string; label: string; opts: Opt[] }[] = [
    { key: "resolution", label: "Call resolution", opts: ws.resolutions.map((x) => ({ v: x.id, l: x.name })) },
    ...(canAssignOwner(ws) ? [{ key: "owner", label: "Sales person", opts: assignableOpts(ws) }] : []),
    ...customDropdowns.map((c) => ({ key: "c:" + c.key, label: c.label, opts: c.options.map((o) => ({ v: o, l: o })) })),
  ];
  const toggleProduct = (id: string) => setProdSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const hasAny = prodSel.size > 0 || Object.values(picks).some(Boolean);
  const apply = async () => {
    setBusy(true);
    const msgs: string[] = [];
    for (const pid of prodSel) msgs.push((await v2AddProduct(rows.map((r) => ({ leadId: r.leadId, assignmentId: r.id })), pid)).message);
    const editor = leadEditor(ctx, toast);
    for (const [key, value] of Object.entries(picks)) { if (value) await editor(rows, { k: key } as Col<LeadRow>, value); }
    setBusy(false);
    if (prodSel.size) ctx.refresh();
    if (msgs.length) toast(msgs.join(" · "));
    onDone(); onClose();
  };
  return <Win small title={`Add / change fields for ${rows.length} leads`} onClose={onClose}><div className="win-b" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 14 }}>
    {products.length > 0 && <div className="fld"><label>Add product(s) — keeps their existing products</label>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>{products.map((p) => <button key={p.id} type="button" className={`ptab ${prodSel.has(p.id) ? "on" : ""}`} onClick={() => toggleProduct(p.id)}>{displayProductCode(p.code)}</button>)}</div></div>}
    {fieldRows.map((f) => <div key={f.key} className="fld"><label>{f.label}</label>
      <select value={picks[f.key] ?? ""} onChange={(e) => setPicks((p) => ({ ...p, [f.key]: e.target.value }))}><option value="">— no change —</option>{f.opts.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</select></div>)}
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}><span style={{ color: "var(--muted)", fontSize: 11.5, flex: 1 }}>Only the fields you pick a value for are changed. Products are added, not replaced.</span>
      <button className="btn" onClick={onClose}>Cancel</button><button className="btn red" disabled={!hasAny || busy} onClick={apply}>{busy ? "Applying…" : `Apply to ${rows.length}`}</button></div>
  </div></Win>;
}
/** Matches DataTable's `bulkExtra` prop shape — use as `bulkExtra={leadBulkAddValue(ctx, toast)}`. */
export function leadBulkAddValue(ctx: Ctx, toast: (m: string) => void) {
  function Extra(rows: LeadRow[], clear: () => void): ReactNode { return <BulkAddValueButton rows={rows} clear={clear} ctx={ctx} toast={toast} />; }
  return Extra;
}
function BulkAddValueButton({ rows, clear, ctx, toast }: { rows: LeadRow[]; clear: () => void; ctx: Ctx; toast: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  if (!rows.length) return null;
  return <>
    <button className="btn sm" onClick={() => setOpen(true)}><Icon n="plus" s="s" /> Add value</button>
    {open && <BulkAddValueModal rows={rows} ctx={ctx} toast={toast} onClose={() => setOpen(false)} onDone={clear} />}
  </>;
}
export function leadBulk(ctx: Ctx, toast: (m: string) => void, onWhatsApp: (rows: LeadRow[]) => void): BulkAction<LeadRow>[] {
  // Reassign / stage / resolution / follow-up / any field in bulk = "Change field" in the bulk bar (same server actions).
  return [{ icon: "wa", label: "WhatsApp", run: (rows) => onWhatsApp(rows) }, { icon: "download", label: "Copy phones", run: (rows) => { navigator.clipboard?.writeText(rows.map((r) => r.phone).filter(Boolean).join(", ")); toast(`${rows.length} numbers copied`); void ctx; } }];
}

/* ---------- filters ---------- */
export type FilterDef<T> = { k: string; label: string; icon: string; get: (r: T) => string | null; opts?: (rows: T[]) => Opt[]; period?: boolean };
const uniq = <T,>(rows: T[], f: (r: T) => string | null) => [...new Set(rows.map(f).filter((x): x is string => !!x))].sort().map((v) => ({ v, l: v }));
export function leadFilters(ws: Workspace): FilterDef<LeadRow>[] {
  return [
    { k: "created", label: "Created", icon: "cal", get: (r) => r.createdAt, period: true },
    { k: "owner", label: "Sales person", icon: "user", get: (r) => r.owner ?? "none", opts: () => [{ v: "none", l: "Unassigned" }, ...ownerOpts(ws)] },
    { k: "product", label: "Product", icon: "cards", get: (r) => r.product, opts: (rows) => uniq(rows, (r) => r.product).map((o) => ({ ...o, l: displayProductCode(o.l) })) },
    { k: "stage", label: "Stage", icon: "layers", get: (r) => r.stage, opts: (rows) => uniq(rows, (r) => r.stage) },
    { k: "bucket", label: "Priority stage", icon: "fire", get: (r) => r.bucket, opts: () => BUCKETS.map((b) => ({ v: b.key, l: b.label })) },
    { k: "resolution", label: "Resolution", icon: "phone", get: (r) => r.resolution ?? "Not called", opts: (rows) => uniq(rows, (r) => r.resolution ?? "Not called") },
    { k: "fu", label: "Follow-up", icon: "clock", get: (r) => { if (!r.nextFollowUp) return "none"; const d = -(daysSince(r.nextFollowUp) ?? 0); return d < 0 ? "overdue" : d === 0 ? "today" : d <= 7 ? "week" : "later"; }, opts: () => [{ v: "overdue", l: "Overdue" }, { v: "today", l: "Today" }, { v: "week", l: "This week" }, { v: "later", l: "Later" }, { v: "none", l: "No follow-up" }] },
    { k: "source", label: "Source", icon: "megaphone", get: (r) => r.source, opts: (rows) => uniq(rows, (r) => r.source).map((o) => ({ ...o, l: cap(o.l) })) },
    { k: "amb", label: "Ambassador", icon: "users", get: (r) => (r.ambassador ? personName(ws, r.ambassador) : "None"), opts: (rows) => uniq(rows, (r) => (r.ambassador ? personName(ws, r.ambassador) : "None")) },
    { k: "hyg", label: "Data hygiene", icon: "db", get: (r) => (missingFields(ws, r).length ? "incomplete" : "complete"), opts: () => [{ v: "incomplete", l: "Has empty fields" }, { v: "complete", l: "Complete" }] },
  ];
}
export type FilterState = Record<string, Set<string> | { period: string; from?: string; to?: string }>;
export function applyFilters<T>(rows: T[], defs: FilterDef<T>[], f: FilterState) {
  return rows.filter((r) => defs.every((d) => { const v = f[d.k]; if (!v) return true; if ("period" in v) return inRange(d.get(r), v.period === "custom" ? customRange(v.from ?? "", v.to ?? "") : periodRange(v.period)); return v.size === 0 || v.has(String(d.get(r))); }));
}
export type Kpi<T> = { k: string; n: number; label: string; tone: Tone; test?: (r: T) => boolean };
export function leadKpis(ws: Workspace, rows: LeadRow[]): Kpi<LeadRow>[] {
  const t = (fn: (r: LeadRow) => boolean) => ({ n: rows.filter(fn).length, test: fn });
  return [
    { k: "all", label: "Total", tone: "slate", n: rows.length },
    { k: "new", label: "New / not called", tone: "lav", ...t((r) => r.bucket === "new") },
    { k: "approach", label: "Approach", tone: "sky", ...t((r) => r.bucket === "approach") },
    { k: "followup", label: "Follow-up", tone: "peach", ...t((r) => r.bucket === "followup") },
    { k: "negotiation", label: "Negotiation", tone: "butter", ...t((r) => r.bucket === "negotiation") },
    { k: "closing", label: "Closing", tone: "mint", ...t((r) => r.bucket === "closing") },
    { k: "lost", label: "Lost / DND", tone: "rose", ...t((r) => r.bucket === "lost") },
    { k: "overdue", label: "Overdue follow-ups", tone: "rose", ...t((r) => r.bucket !== "lost" && !!r.nextFollowUp && (daysSince(r.nextFollowUp) ?? 0) > 0) },
    { k: "uncalled", label: "Assigned, never called", tone: "butter", ...t((r) => !!r.owner && !r.lastCalledAt && r.bucket !== "lost") },
    { k: "hyg", label: "Incomplete data", tone: "aqua", ...t((r) => ["followup", "negotiation", "closing"].includes(r.bucket) && missingFields(ws, r).length > 0) },
  ];
}
export const leadCard = (ws: Workspace) => function LeadCard(r: LeadRow): ReactNode {
  return <><b>{r.name}</b><span style={{ color: "var(--muted)" }}>{r.company}</span><div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}><Pill tone="slate">{displayProductCode(r.product)}</Pill>{r.resolution && <Pill tone={resTone(ws, r)}>{r.resolution}</Pill>}</div>
    <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--muted)", fontSize: 11 }}>{r.owner ? <><Avatar name={personName(ws, r.owner)} photo={photoFor(ws, r.owner)} />{personName(ws, r.owner).split(" ")[0]}</> : "Unassigned"}<span style={{ marginLeft: "auto" }}>{r.nextFollowUp ? "FU " + fdate(r.nextFollowUp) : ago(r.lastCalledAt)}</span></div></>;
};
