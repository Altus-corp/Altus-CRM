"use client";
// Sidebars per module + every page. Table pages = filter bar → KPI chips → table (≈80% of the screen).
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BUCKETS, BUCKET, TONES, dashesFor, primaryRole, type BucketKey, type Tone } from "@/app/lib/crm2/config";
import { indiaToday } from "@/app/lib/lead-event-schedule";
import * as M from "@/app/lib/crm2/metrics";
import type { LeadRow } from "@/app/lib/crm2/types";
import { v2ListMarketplace, v2ListUsers, v2SaveBucket, v2SaveHygieneRule, v2SaveTarget } from "@/app/crm/actions";
import { LeadsManagementApi } from "@/components/marketplace/leads-management-api";
import { AdminTeamsPage } from "./teams-board";
import { AdminColumnsPage, AdminDropdownsPage, AdminLeadConfigPage, AdminProductsPage } from "./lead-config-board";
import { CreateAmbassadorAccountModal } from "@/components/ambassadors/create-ambassador-account-modal";
import { AmbassadorAddModal } from "@/components/ambassadors/ambassador-add-modal";
import { displayProductCode } from "@/app/lib/product-display";
import { APP_ROLES, ROLE_LABELS, type AppRole } from "@/app/lib/roles";
import { toggleUserSuspension } from "@/app/dashboard/users/actions";
import { UserModal } from "@/app/dashboard/users/user-modal";
import { EditUserModal } from "@/app/dashboard/users/edit-user-modal";
import { DeleteUserDialog } from "@/app/dashboard/users/delete-user-dialog";
import { UserRolesEditor } from "@/app/dashboard/users/user-roles-editor";
import type { V2ManagedUser } from "@/app/crm/actions";
import { useCrm, type Ctx } from "./context";
import { DataTable, ShareWhatsApp, type Col } from "./DataTable";
import { FilterBar, KpiBar } from "./bars";
import { applyFilters, hiddenWithCustom, leadBulk, leadCard, leadCols, leadEditor, leadFilters, leadKpis, leadTone, type FilterDef, type FilterState, type Kpi } from "./leads";
import { Avatar, Icon, Pill, Popover, fdt, toneStyle, usePop, useToast } from "./ui";

export type NavItem = { id: string; label: string; icon?: string; cnt?: number; group?: string };
export function sidebar(ctx: Ctx, mod: string): NavItem[] {
  const { ws } = ctx; const isAdmin = ws.roles.includes("admin"); const isMgr = isAdmin || ws.roles.includes("sales_manager");
  const live = ws.rows.filter(M.isLive);
  if (mod === "dashboards") return dashesFor(ws.roles).map((d) => ({ id: d.id, label: d.label, icon: d.icon }));
  if (mod === "sales") return [
    { id: "leads", label: isMgr ? "Leads Master" : "My Leads", icon: "list", cnt: live.length },
    { id: "focus-leads", label: "Focused Leads", icon: "fire", cnt: live.filter((r) => r.focusedOn === indiaToday()).length },
    ...(isMgr ? [{ id: "team", label: "Team Leads", icon: "users" }] : []),
    { id: "uncategorized", label: "Uncategorized", icon: "layers", cnt: ws.rows.filter((r) => r.product === "UNCATEGORIZED").length },
    { id: "follow-ups", label: "Follow-ups", icon: "cal", cnt: live.filter((r) => r.nextFollowUp && (M.daysSince(r.nextFollowUp) ?? 0) >= 0).length },
    { id: "product-ALL", label: "All products", icon: "cards", group: "Products", cnt: live.length },
    ...ws.products.map((p) => ({ id: "product-" + p.code, label: displayProductCode(p.code), group: "Products", cnt: live.filter((r) => r.product === p.code).length })),
    { id: "dnd", label: "Do Not Call", icon: "ban", cnt: ws.rows.length - live.length },
    { id: "calls", label: "Call Log", icon: "phone" }, { id: "activity", label: "Activity Report", icon: "list" },
    { id: "classic-templates", label: "Message Templates", icon: "note" },
  ];
  if (mod === "ambassadors") return [{ id: "dashboard", label: "Dashboard", icon: "home" }, { id: "mine", label: "My Ambassador", icon: "user", cnt: live.filter((r) => r.product === "AMBASSADOR").length }, { id: "accounts", label: "Ambassador Accounts", icon: "key", cnt: live.filter((r) => r.product === "AMBASSADOR" && !r.ambassadorHasAccount).length }, ...(isAdmin ? [{ id: "all", label: "All Ambassadors", icon: "users", cnt: M.ambassadorIds(ws).length }] : []), { id: "leads", label: "Ambassador Leads", icon: "list", cnt: ws.rows.filter((r) => r.ambassador).length + ws.ambassadorManagedRows.length }, { id: "targets", label: "Targets & Actuals", icon: "target" }, { id: "classic-ambassadors", label: "Ambassador workspace (classic)", icon: "ext" }];
  if (mod === "admin") return [{ id: "targets", label: "Targets Setup", icon: "target" }, { id: "users", label: "Users", icon: "user" }, { id: "team", label: "Teams", icon: "users" }, { id: "marketplace", label: "CRM Marketplace · API", icon: "key" }];
  if (mod === "control") return [{ id: "buckets", label: "Stage Buckets", icon: "funnel" }, { id: "hygiene", label: "Hygiene Rules", icon: "db" }, { id: "colours", label: "Colour Legend", icon: "palette" }, { id: "leadcfg", label: "Lead Configuration", icon: "sliders" }, { id: "columns", label: "Columns management", icon: "cols" }, { id: "products", label: "Product management", icon: "layers" }, { id: "dropdowns", label: "Dropdown management", icon: "list" }, { id: "classic-smtp", label: "Email (SMTP)", icon: "mail" }];
  return [{ id: "overview", label: "Overview", icon: "info" }];
}
const CLASSIC: Record<string, [string, string]> = {
  "classic-templates": ["/dashboard/message-templates", "Message templates"], "classic-ambassadors": ["/dashboard/my-ambassador", "Ambassador workspace"],
  "classic-smtp": ["/dashboard/settings", "My email (SMTP) settings"],
};

/* ---------- generic table page ---------- */
function TablePage<T extends { id: string }>({ pid, rows, filters, kpis, table, trail }: { pid: string; rows: T[]; filters: FilterDef<T>[]; kpis?: (rows: T[]) => Kpi<T>[]; table: (rows: T[], q: string) => ReactNode; trail?: ReactNode }) {
  const [f, setF] = useState<FilterState>({}); const [q, setQ] = useState(""); const [k, setK] = useState<string | null>(null);
  const after = useMemo(() => applyFilters(rows, filters, f), [rows, filters, f]); const kp = kpis ? kpis(after) : []; const kk = kp.find((x) => x.k === k);
  const shown = kk?.test ? after.filter(kk.test) : after;
  return <><FilterBar defs={filters} rows={rows} state={f} setState={setF} q={q} setQ={setQ} trail={trail} />{kp.length > 0 && <KpiBar kpis={kp} active={k} onPick={setK} />}<div key={pid} style={{ display: "contents" }}>{table(shown, q)}</div></>;
}
function LeadPage({ pid, rows, group, sort, kanbanStages, trail }: { pid: string; rows: LeadRow[]; group?: string; sort?: { k: string; dir: 1 | -1 }; kanbanStages?: string[]; trail?: ReactNode }) {
  const ctx = useCrm(); const toast = useToast(); const [wa, setWa] = useState<LeadRow[] | null>(null);
  const cols = useMemo(() => leadCols(ctx.ws, ctx.canEdit, toast), [ctx.ws, ctx.canEdit, toast]); const filters = useMemo(() => leadFilters(ctx.ws), [ctx.ws]);
  const kpis = kanbanStages ? (rs: LeadRow[]): Kpi<LeadRow>[] => [{ k: "all", n: rs.length, label: "Total", tone: "slate" }, ...kanbanStages.map((s, i) => ({ k: "st" + i, n: rs.filter((r) => r.stage === s).length, label: s, tone: (["lav", "sky", "peach", "butter", "mint"] as Tone[])[i % 5], test: (r: LeadRow) => r.stage === s })), { k: "overdue", n: rs.filter((r) => r.nextFollowUp && (M.daysSince(r.nextFollowUp) ?? 0) > 0).length, label: "Overdue follow-ups", tone: "rose", test: (r) => !!r.nextFollowUp && (M.daysSince(r.nextFollowUp) ?? 0) > 0 }] : (rs: LeadRow[]) => leadKpis(ctx.ws, rs);
  const stageCols = kanbanStages?.map((s, i) => ({ k: s, label: s, tone: (["lav", "sky", "peach", "butter", "mint"] as Tone[])[i % 5] }));
  return <><TablePage pid={pid} rows={rows} filters={filters} kpis={kpis} trail={trail} table={(shown, q) => <DataTable<LeadRow> id={pid} rows={shown} q={q} cols={cols} hidden={hiddenWithCustom(ctx.ws)} group={group ?? null} sort={sort ?? null} frozen={2} views={["table", "kanban", "cards", "calendar"]}
    kanban={stageCols ? { key: (r) => r.stage, cols: stageCols, onMove: (r, s) => { const st = ctx.ws.products.find((p) => p.code === r.product)?.stages.find((x) => x.name === s); if (st) leadEditor(ctx, toast)([r], { k: "stageId", label: "Stage" }, st.id).then(() => ctx.patchRows([r.id], { stage: s, stageId: st.id })); } } : { key: (r) => r.bucket, cols: BUCKETS.map((b) => ({ k: b.key, label: b.label, tone: b.tone })) }}
    calendarKey={(r) => r.nextFollowUp} rowTone={leadTone} onOpen={(r, list) => ctx.openLead(r, list)} onEdit={leadEditor(ctx, toast)} bulk={leadBulk(ctx, toast, setWa)} dupeKey={(r) => r.phone} exportName={pid} card={leadCard(ctx.ws)}
    detail={{ count: (r) => r.extraContacts, rows: (r) => r.extraRows }} />} />
    {wa && <ShareWhatsApp title="Message to selected leads" text="" onClose={() => setWa(null)} />}</>;
}

/* ---------- page router ---------- */
export function PageBody({ mod, page }: { mod: string; page: string }) {
  const ctx = useCrm(); const { ws } = ctx; const live = ws.rows.filter(M.isLive);
  if (CLASSIC[page]) { const [href, label] = CLASSIC[page]; return <Center tone="slate" icon="ext" title={label} text="This screen is unchanged and keeps working in the classic CRM (same login, same data)."><a className="btn red" href={href}><Icon n="ext" s="s" /> Open {label}</a></Center>; }
  if (mod === "sales") {
    if (page === "leads") return <LeadPage pid="sales-leads" rows={live.filter((r) => r.product !== "UNCATEGORIZED")} sort={{ k: "score", dir: -1 }} />;
    if (page === "focus-leads") return <LeadPage pid="sales-focus" rows={live.filter((r) => r.focusedOn === indiaToday())} sort={{ k: "score", dir: -1 }} />;
    if (page === "team") return <LeadPage pid="sales-team" rows={live.filter((r) => r.owner)} group="owner" />;
    if (page === "uncategorized") return <LeadPage pid="sales-uncat" rows={ws.rows.filter((r) => r.product === "UNCATEGORIZED")} />;
    if (page === "follow-ups") return <LeadPage pid="sales-fu" rows={live.filter((r) => r.nextFollowUp)} group="nextFollowUp" sort={{ k: "nextFollowUp", dir: 1 }} />;
    if (page.startsWith("product-")) { const code = page.slice(8); const p = ws.products.find((x) => x.code === code); return <LeadPage key={page} pid={"sales-" + page} rows={code === "ALL" ? live : live.filter((r) => r.product === code)} kanbanStages={p?.stages.map((s) => s.name)} />; }
    if (page === "dnd") return <LeadPage pid="sales-dnd" rows={ws.rows.filter((r) => !M.isLive(r))} group="resolution" />;
    if (page === "calls") return <CallLog />;
    if (page === "activity") return null; // rendered as the Activity Resolution dashboard by the shell
  }
  if (mod === "ambassadors") {
    if (page === "dashboard") return <AmbassadorDashboardPage />;
    if (page === "mine") return <LeadPage pid="amb-mine" rows={live.filter((r) => r.product === "AMBASSADOR")} sort={{ k: "score", dir: -1 }} trail={<span className="trail-pill">{ws.roles.includes("admin") ? <CreateAmbassadorAccountModal /> : <><AmbassadorAddModal /><CreateAmbassadorAccountModal /></>}</span>} />;
    if (page === "accounts") return <AmbassadorAccountsPage />;
    if (page === "all" && ws.roles.includes("admin")) return <AmbassadorTable />;
    if (page === "leads") return <LeadPage pid="amb-leads" rows={[...ws.rows.filter((r) => r.ambassador), ...ws.ambassadorManagedRows]} group="ambassador" />;
  }
  if (mod === "admin" && page === "targets") return <TargetsSetup />;
  if (mod === "admin" && page === "users") return <AdminUsersPage />;
  if (mod === "admin" && page === "marketplace") return <AdminMarketplacePage />;
  if (mod === "admin" && page === "team") return <AdminTeamsPage />;
  if (mod === "control" && page === "buckets") return <BucketsPage />;
  if (mod === "control" && page === "hygiene") return <HygienePage />;
  if (mod === "control" && page === "colours") return <ColoursPage />;
  if (mod === "control" && page === "leadcfg") return <AdminLeadConfigPage />;
  if (mod === "control" && page === "columns") return <AdminColumnsPage />;
  if (mod === "control" && page === "products") return <AdminProductsPage />;
  if (mod === "control" && page === "dropdowns") return <AdminDropdownsPage />;
  return <Center tone="lav" icon="info" title="Coming soon" text="This module's slot is reserved in the top bar, so the layout will not change when it ships." />;
}
const Center = ({ tone, icon, title, text, children }: { tone: Tone; icon: string; title: string; text: string; children?: ReactNode }) => <div className="soonbox"><div className="tile" style={{ ...toneStyle(tone), padding: 28, alignItems: "center", gap: 10, textAlign: "center" }}><Icon n={icon} s="l" /><span className="tv">{title}</span><span className="ts">{text}</span>{children}</div></div>;

type CallRow = { id: string; t: string; u: string; person: string; out: string; c: string; d: number; lead: string; product: string };
function CallLog() {
  const ctx = useCrm(); const { ws } = ctx;
  const rows: CallRow[] = useMemo(() => { const byA = new Map(ws.rows.map((r) => [r.id, r])); return ws.calls.slice(0, 5000).map((c, i) => { const l = c.a ? byA.get(c.a) : undefined; return { id: "c" + i, t: c.t, u: c.u, person: M.personName(ws, c.u), out: c.out ? "Outgoing" : "Incoming", c: c.c ? "Connected" : "Not connected", d: c.d, lead: l?.name ?? "—", product: l?.product ?? "—" }; }); }, [ws]);
  const filters: FilterDef<CallRow>[] = [{ k: "t", label: "Call date", icon: "cal", get: (r) => r.t, period: true }, { k: "u", label: "Sales person", icon: "user", get: (r) => r.person, opts: (rs) => [...new Set(rs.map((r) => r.person))].sort().map((v) => ({ v, l: v })) }, { k: "dir", label: "Direction", icon: "phone", get: (r) => r.out, opts: () => [{ v: "Outgoing", l: "Outgoing" }, { v: "Incoming", l: "Incoming" }] }, { k: "c", label: "Status", icon: "check", get: (r) => r.c, opts: () => [{ v: "Connected", l: "Connected" }, { v: "Not connected", l: "Not connected" }] }, { k: "p", label: "Product", icon: "cards", get: (r) => r.product, opts: (rs) => [...new Set(rs.map((r) => r.product))].sort().map((v) => ({ v, l: v })) }];
  const kpis = (rs: CallRow[]): Kpi<CallRow>[] => [{ k: "all", n: rs.length, label: "Calls", tone: "slate" }, { k: "c", n: rs.filter((r) => r.c === "Connected").length, label: "Connected", tone: "mint", test: (r) => r.c === "Connected" }, { k: "nc", n: rs.filter((r) => r.c !== "Connected").length, label: "Not connected", tone: "rose", test: (r) => r.c !== "Connected" }, { k: "o", n: rs.filter((r) => r.out === "Outgoing").length, label: "Outgoing", tone: "sky", test: (r) => r.out === "Outgoing" }, { k: "m", n: Math.round(rs.reduce((s, r) => s + r.d, 0) / 60), label: "Talk minutes", tone: "sage" }];
  const cols: Col<CallRow>[] = [{ k: "t", label: "Called at", render: (r) => fdt(r.t), groupVal: (r) => r.t.slice(0, 10) }, { k: "person", label: "Sales person" }, { k: "lead", label: "Lead", group: false }, { k: "product", label: "Product" }, { k: "out", label: "Direction" }, { k: "c", label: "Status", render: (r) => <Pill tone={r.c === "Connected" ? "mint" : "rose"}>{r.c}</Pill> }, { k: "d", label: "Duration (s)", num: true, group: false }];
  return <TablePage pid="calls" rows={rows} filters={filters} kpis={kpis} table={(shown, q) => <DataTable<CallRow> id="sales-calls" rows={shown} q={q} cols={cols} group="t" rowTone={(r) => (r.c === "Connected" ? "mint" : "rose")} exportName="Call log" />} />;
}
/** Ambassador leads (product === AMBASSADOR) with whether each already has a CRM login — same scope as "My
 * Ambassador" (self / own team / everyone, via ws.rows), plus an account-status column and filter so it's
 * easy to find which Ambassadors still need Create Ambassador Account run for them. */
function AmbassadorAccountsPage() {
  const ctx = useCrm(); const toast = useToast(); const { ws } = ctx;
  const [wa, setWa] = useState<LeadRow[] | null>(null);
  const rows = useMemo(() => ws.rows.filter((r) => M.isLive(r) && r.product === "AMBASSADOR"), [ws.rows]);
  const cols = useMemo((): Col<LeadRow>[] => [...leadCols(ws, ctx.canEdit, toast), { k: "acct", label: "Account", group: false, text: (r) => (r.ambassadorHasAccount ? "Has account" : "No account"), render: (r) => <Pill tone={r.ambassadorHasAccount ? "mint" : "rose"}>{r.ambassadorHasAccount ? "Has account" : "No account"}</Pill> }], [ws, ctx.canEdit, toast]);
  const filters = useMemo((): FilterDef<LeadRow>[] => [...leadFilters(ws), { k: "acct", label: "Account", icon: "key", get: (r) => (r.ambassadorHasAccount ? "yes" : "no"), opts: () => [{ v: "no", l: "No account yet" }, { v: "yes", l: "Has account" }] }], [ws]);
  const kpis = (rs: LeadRow[]): Kpi<LeadRow>[] => [{ k: "all", n: rs.length, label: "Ambassadors", tone: "slate" }, { k: "noacct", n: rs.filter((r) => !r.ambassadorHasAccount).length, label: "No account yet", tone: "rose", test: (r) => !r.ambassadorHasAccount }, { k: "acct", n: rs.filter((r) => r.ambassadorHasAccount).length, label: "Has account", tone: "mint", test: (r) => r.ambassadorHasAccount }];
  return <><TablePage pid="amb-accounts" rows={rows} filters={filters} kpis={kpis} trail={<span className="trail-pill">{ws.roles.includes("admin") ? <CreateAmbassadorAccountModal /> : <><AmbassadorAddModal /><CreateAmbassadorAccountModal /></>}</span>}
    table={(shown, q) => <DataTable<LeadRow> id="amb-accounts" rows={shown} q={q} cols={cols} hidden={hiddenWithCustom(ws)} frozen={2} views={["table", "cards"]} rowTone={leadTone} onOpen={(r, list) => ctx.openLead(r, list)} onEdit={leadEditor(ctx, toast)} bulk={leadBulk(ctx, toast, setWa)} exportName="Ambassador accounts" card={leadCard(ws)} />} />
    {wa && <ShareWhatsApp title="Message to selected leads" text="" onClose={() => setWa(null)} />}</>;
}
/** Ambassador Module → Dashboard: Agreement Signed/Waived + Pitched counts among this viewer's Ambassadors
 * (same scope as My Ambassador — self / self+team / everyone, via ws.rows), plus — for admin/manager only —
 * a per-sales-person breakdown of how many Ambassadors each of them has. */
function AmbassadorDashboardPage() {
  const ctx = useCrm(); const toast = useToast(); const { ws } = ctx;
  const [wa, setWa] = useState<LeadRow[] | null>(null);
  const rows = useMemo(() => ws.rows.filter((r) => r.product === "AMBASSADOR"), [ws.rows]);
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const is = (r: LeadRow, label: string) => !!r.resolution && norm(r.resolution) === norm(label);
  const kpis = (rs: LeadRow[]): Kpi<LeadRow>[] => [
    { k: "all", n: rs.length, label: "All Ambassadors", tone: "slate" },
    { k: "signed", n: rs.filter((r) => is(r, "Agreement Signed/ Waived")).length, label: "Agreement Signed/ Waived", tone: "mint", test: (r) => is(r, "Agreement Signed/ Waived") },
    { k: "pitched", n: rs.filter((r) => is(r, "Pitched")).length, label: "Pitched", tone: "aqua", test: (r) => is(r, "Pitched") },
  ];
  const cols = useMemo(() => leadCols(ws, ctx.canEdit, toast), [ws, ctx.canEdit, toast]);
  // Looked up by label, not a hardcoded field_key, since custom column keys carry a random suffix
  // (e.g. "demo_given_8afb13") assigned when the column was created in Control Panel → Columns management.
  const demoCol = ws.columns.find((c) => norm(c.label) === "demogiven");
  const filters = useMemo((): FilterDef<LeadRow>[] => (demoCol ? [{ k: "demo", label: "Demo Given", icon: "video", get: (r) => r.custom[demoCol.key] || "none", opts: () => [{ v: "Yes", l: "Yes" }, { v: "No", l: "No" }, { v: "none", l: "Not set" }] }] : []), [demoCol]);
  const breakdown = useMemo(() => {
    const byOwner = new Map<string, number>();
    rows.forEach((r) => { if (r.owner) byOwner.set(r.owner, (byOwner.get(r.owner) ?? 0) + 1); });
    return [...byOwner.entries()].map(([id, n]) => ({ id, person: M.personName(ws, id), n })).sort((a, b) => b.n - a.n);
  }, [rows, ws]);
  const showBreakdown = ctx.role === "admin" || ctx.role === "sales_manager";
  const [ownerSel, setOwnerSel] = useState<string | null>(null);
  return <><TablePage pid="amb-dashboard" rows={rows} filters={filters} kpis={kpis}
    trail={showBreakdown ? <AmbassadorsPerPersonPick breakdown={breakdown} value={ownerSel} onChange={setOwnerSel} /> : undefined}
    table={(shown, q) => <DataTable<LeadRow> id="amb-dash-t" rows={ownerSel ? shown.filter((r) => r.owner === ownerSel) : shown} q={q} cols={cols} hidden={hiddenWithCustom(ws)} frozen={2} views={["table", "cards"]} rowTone={leadTone} onOpen={(r, list) => ctx.openLead(r, list)} onEdit={leadEditor(ctx, toast)} bulk={leadBulk(ctx, toast, setWa)} exportName="Ambassador dashboard" card={leadCard(ws)} detail={{ count: (r) => r.extraContacts, rows: (r) => r.extraRows }} />} />
    {wa && <ShareWhatsApp title="Message to selected leads" text="" onClose={() => setWa(null)} />}</>;
}
/** "Ambassadors per sales person" as a dropdown chip instead of an always-open panel — pick a person to filter the table to just their Ambassadors. */
function AmbassadorsPerPersonPick({ breakdown, value, onChange }: { breakdown: { id: string; person: string; n: number }[]; value: string | null; onChange: (id: string | null) => void }) {
  const ctx = useCrm(); const pop = usePop(); const sel = breakdown.find((b) => b.id === value);
  return <><button className={`fchip ${value ? "on" : ""}`} onClick={(e) => pop.open(e.currentTarget, "amb-per-person")}><Icon n="users" s="s" />{sel ? `${sel.person} (${sel.n})` : "Ambassadors per sales person"}<Icon n="chevd" s="s" /></button>
    {pop.anchor && <Popover anchor={pop.anchor} onClose={pop.close} width={260}><div className="ph">Ambassadors per sales person</div>
      {breakdown.length === 0 ? <div className="empty" style={{ padding: 10 }}>No ambassadors yet</div> : breakdown.map((b) => <button key={b.id} className={`pi ${value === b.id ? "on" : ""}`} onClick={() => { onChange(value === b.id ? null : b.id); pop.close(); }} style={{ display: "flex", alignItems: "center", gap: 8 }}><Avatar name={b.person} photo={M.photoFor(ctx.ws, b.id)} /><span style={{ flex: 1, textAlign: "left" }}>{b.person}</span><Pill tone="sky">{b.n}</Pill></button>)}
      {value && <button className="btn sm" style={{ width: "100%", marginTop: 6 }} onClick={() => { onChange(null); pop.close(); }}>Clear</button>}</Popover>}</>;
}
type AmbRow = { id: string; name: string; leads30: number; leadsAll: number; hot: number; demos30: number; tLeads: number; tDemos: number };
function AmbassadorTable() {
  const { ws } = useCrm();
  const rows: AmbRow[] = M.ambassadorIds(ws).map((id) => { const own = ws.rows.filter((r) => r.ambassador === id); return { id, name: M.personName(ws, id), leads30: ws.ambLeads.filter((e) => e.u === id && M.inDays(e.t, 30)).length, leadsAll: own.length, hot: own.filter((r) => r.bucket === "closing" || r.bucket === "negotiation").length, demos30: ws.meetings.filter((m) => m.u === id && !m.upcoming && M.inDays(m.t, 30)).length, tLeads: ws.targets[id]?.leads ?? 10, tDemos: ws.targets[id]?.demos ?? 3 }; });
  const cols: Col<AmbRow>[] = [{ k: "name", label: "Ambassador", group: false, render: (r) => <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><Avatar name={r.name} photo={M.photoFor(ws, r.id)} /><b>{r.name}</b></span> }, { k: "leads30", label: "Leads (30 d)", num: true }, { k: "demos30", label: "Demos (30 d)", num: true }, { k: "hot", label: "Leads in negotiation / closing", num: true }, { k: "leadsAll", label: "All leads", num: true }, { k: "tLeads", label: "Target leads / wk", num: true }, { k: "tDemos", label: "Target demos / wk", num: true }];
  const kpis = (rs: AmbRow[]): Kpi<AmbRow>[] => [{ k: "all", n: rs.length, label: "Ambassadors", tone: "slate" }, { k: "z", n: rs.filter((r) => !r.leads30).length, label: "No leads in 30 d", tone: "rose", test: (r) => !r.leads30 }, { k: "h", n: rs.filter((r) => r.hot).length, label: "With hot leads", tone: "mint", test: (r) => r.hot > 0 }];
  return <TablePage pid="amb" rows={rows} filters={[]} kpis={kpis} table={(shown, q) => <DataTable<AmbRow> id="amb-all" rows={shown} q={q} cols={cols} views={["table", "cards"]} exportName="Ambassadors" frozen={1} />} />;
}
type TRow = { id: string; person: string; kind: string; demos: number; references_per_week: number; ambassadors: number; calls_per_day: number; leads: number };
function TargetsSetup() {
  const { ws } = useCrm(); const toast = useToast(); const [rows, setRows] = useState<TRow[]>(() => ws.people.filter((p) => p.roles.some((r) => r === "sales_executive" || r === "sales_manager" || r === "consultant" || r === "ambassador")).map((p) => { const t = ws.targets[p.id] ?? {}; return { id: p.id, person: p.name, kind: p.roles.includes("ambassador") ? "Ambassador" : "Sales", demos: t.demos ?? 3, references_per_week: t.references ?? 15, ambassadors: t.ambassadors ?? 3, calls_per_day: t.callsPerDay ?? 60, leads: t.leads ?? 10 }; }));
  const n = (k: keyof TRow, label: string): Col<TRow> => ({ k, label, num: true, group: false, edit: { type: "text" } });
  return <DataTable<TRow> id="admin-targets" title="Weekly targets — click a number to edit, or select rows → Change field" rows={rows} group="kind" exportName="Targets" frozen={1}
    cols={[{ k: "person", label: "Person", group: false, render: (r) => <b>{r.person}</b> }, { k: "kind", label: "Type" }, n("demos", "Demos / meetings / pitches per week"), n("references_per_week", "References per week"), n("ambassadors", "Ambassadors appointed per week"), n("calls_per_day", "Calls per day"), n("leads", "Leads added per week")]}
    onEdit={async (rs, col, v) => { const val = Math.max(0, Math.round(Number(v) || 0)); for (const r of rs) { const res = await v2SaveTarget(r.id, { [col.k]: val }); if (!res.ok) return toast(res.message); } setRows((all) => all.map((x) => (rs.some((r) => r.id === x.id) ? { ...x, [col.k]: val } : x))); toast(`Saved for ${rs.length}`); }} />;
}
const roleTone = (role?: AppRole): Tone => (role === "admin" ? "rose" : role === "sales_manager" ? "sky" : role === "sales_executive" ? "mint" : role === "consultant" ? "aqua" : role === "ambassador" ? "peach" : "lav");
/** First ambassador's name + a "+N" badge — click it to expand the rest of the list below, in place. */
function AmbassadorsCell({ names }: { names: string[] }) {
  const [open, setOpen] = useState(false);
  if (!names.length) return <span style={{ color: "var(--faint)" }}>—</span>;
  return <div>
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{names[0]}
      {names.length > 1 && <button type="button" className={`exp-badge ${open ? "on" : ""}`} onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }} title={`${names.length - 1} more`}>+{names.length - 1}</button>}
    </span>
    {open && <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 4 }}>{names.slice(1).map((n) => <span key={n} style={{ color: "var(--muted)", fontSize: 11.5 }}>{n}</span>)}</div>}
  </div>;
}
function userCols(transferUsers: { id: string; name: string }[]): Col<V2ManagedUser>[] {
  return [
    { k: "name", label: "User", w: 220, group: false, text: (r) => `${r.name} ${r.email}`, render: (r) => <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><Avatar name={r.name} /><span><b>{r.name}</b><div style={{ color: "var(--muted)", fontSize: 11.5 }}>{r.email}</div></span></span> },
    { k: "phone", label: "Phone", group: false },
    { k: "roles", label: "Role", text: (r) => r.roles.map((x) => ROLE_LABELS[x]).join(", ") || "No role", groupVal: (r) => ROLE_LABELS[primaryRole(r.roles)] ?? "No role", groupTone: (r) => roleTone(primaryRole(r.roles)), render: (r) => <UserRolesEditor userId={r.id} name={r.name} roles={r.roles} /> },
    { k: "salesPerson", label: "Sales person", text: (r) => r.salesPersonName ?? "", groupVal: (r) => (r.roles.includes("ambassador") ? r.salesPersonName ?? "Unassigned" : "—"), render: (r) => !r.roles.includes("ambassador") ? <span style={{ color: "var(--faint)" }}>—</span> : r.salesPersonName ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Avatar name={r.salesPersonName} />{r.salesPersonName}</span> : <span style={{ color: "var(--faint)" }}>Unassigned</span> },
    { k: "ambassadors", label: "Ambassadors assigned", group: false, text: (r) => (r.ambassadorNames ?? []).join(", "), render: (r) => <AmbassadorsCell names={r.ambassadorNames ?? []} /> },
    { k: "status", label: "Status", text: (r) => (r.isSuspended ? "Suspended" : "Active"), groupVal: (r) => (r.isSuspended ? "Suspended" : "Active"), groupTone: (r) => (r.isSuspended ? "rose" : "mint"), render: (r) => <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><Pill tone={r.isSuspended ? "rose" : "mint"}>{r.isSuspended ? "Suspended" : "Active"}</Pill><form action={toggleUserSuspension}><input type="hidden" name="userId" value={r.id} /><input type="hidden" name="suspend" value={String(!r.isSuspended)} /><button className="btn sm">{r.isSuspended ? "Reactivate" : "Suspend"}</button></form></span> },
    { k: "actions", label: "", w: 90, group: false, render: (r) => <span className="cact" onClick={(ev) => ev.stopPropagation()}><EditUserModal user={r} /><DeleteUserDialog user={{ id: r.id, name: r.name, email: r.email }} transferUsers={transferUsers} /></span> },
  ];
}
function userFilters(): FilterDef<V2ManagedUser>[] {
  return [
    { k: "role", label: "Role", icon: "user", get: (r) => primaryRole(r.roles) ?? "none", opts: () => [{ v: "none", l: "No role" }, ...APP_ROLES.map((x) => ({ v: x, l: ROLE_LABELS[x] }))] },
    { k: "status", label: "Status", icon: "info", get: (r) => (r.isSuspended ? "suspended" : "active"), opts: () => [{ v: "active", l: "Active" }, { v: "suspended", l: "Suspended" }] },
  ];
}
const userKpis = (rs: V2ManagedUser[]): Kpi<V2ManagedUser>[] => [
  { k: "all", n: rs.length, label: "Total", tone: "slate" },
  { k: "active", n: rs.filter((r) => !r.isSuspended).length, label: "Active", tone: "mint", test: (r) => !r.isSuspended },
  { k: "suspended", n: rs.filter((r) => r.isSuspended).length, label: "Suspended", tone: "rose", test: (r) => r.isSuspended },
];
/** Same Add / Edit / Suspend / Delete user flows as /dashboard/users, embedded here (same server actions, no backend changes) — filter bar + KPI chips + table match the rest of the v2 UI. */
function AdminUsersPage() {
  const [data, setData] = useState<{ users: V2ManagedUser[]; transferUsers: { id: string; name: string }[] } | null>(null);
  const [error, setError] = useState(""); const [gen, setGen] = useState(0);
  const [f, setF] = useState<FilterState>({}); const [q, setQ] = useState(""); const [k, setK] = useState<string | null>(null);
  useEffect(() => { let live = true; v2ListUsers().then((d) => live && setData(d)).catch((e) => live && setError(e instanceof Error ? e.message : "Unable to load users.")); return () => { live = false; }; }, [gen]);
  if (error) return <Center tone="rose" icon="info" title="Could not load users" text={error} />;
  if (!data) return <div className="empty">Loading users…</div>;
  const filters = userFilters(); const after = applyFilters(data.users, filters, f); const kp = userKpis(after); const kk = kp.find((x) => x.k === k);
  const shown = kk?.test ? after.filter(kk.test) : after;
  return <>
    <FilterBar defs={filters} rows={data.users} state={f} setState={setF} q={q} setQ={setQ} lead={<><button className="btn" onClick={() => setGen((g) => g + 1)} title="Reload — a created/edited/suspended/deleted user doesn't appear until refreshed"><Icon n="refresh" s="s" /></button><UserModal /></>} />
    <KpiBar kpis={kp} active={k} onPick={setK} />
    <DataTable<V2ManagedUser> id="admin-users" rows={shown} q={q} cols={userCols(data.transferUsers)} frozen={1} views={["table", "cards"]} exportName="Users" />
  </>;
}
/** Same Leads Management API key UI as /dashboard/crm-market-place, embedded here (same server actions, no backend changes). */
function AdminMarketplacePage() {
  const [data, setData] = useState<Awaited<ReturnType<typeof v2ListMarketplace>> | null>(null);
  const [error, setError] = useState(""); const [gen, setGen] = useState(0);
  useEffect(() => { let live = true; v2ListMarketplace().then((d) => live && setData(d)).catch((e) => live && setError(e instanceof Error ? e.message : "Unable to load the marketplace.")); return () => { live = false; }; }, [gen]);
  if (error) return <Center tone="rose" icon="info" title="Could not load CRM Marketplace" text={error} />;
  if (!data) return <div className="empty">Loading…</div>;
  return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    <div style={{ display: "flex", justifyContent: "flex-end" }}><button className="btn" onClick={() => setGen((g) => g + 1)} title="Reload — a created/paused/edited key doesn't appear here until you refresh"><Icon n="refresh" s="s" /> Refresh</button></div>
    <LeadsManagementApi apiKeys={data.apiKeys} databaseReady={data.databaseReady} apiActivityLogs={data.apiActivityLogs} auditReady={data.auditReady} />
  </div>;
}
type BRow = { id: string; name: string; bucket: BucketKey; leads: number };
function BucketsPage() {
  const { ws, patchRows } = useCrm(); const toast = useToast(); const [rows, setRows] = useState<BRow[]>(() => ws.resolutions.map((r) => ({ id: r.id, name: r.name, bucket: r.bucket, leads: ws.rows.filter((x) => x.resolutionId === r.id).length })));
  return <DataTable<BRow> id="ctrl-buckets" title="Which call resolution counts as Closing / Negotiation / Follow-up / Approach / Lost" rows={rows} group="bucket" views={["table", "kanban"]} exportName="Stage buckets"
    kanban={{ key: (r) => r.bucket, cols: BUCKETS.map((b) => ({ k: b.key, label: b.label, tone: b.tone })), onMove: async (r, k) => { const res = await v2SaveBucket(r.id, k); toast(res.message); if (res.ok) setRows((a) => a.map((x) => (x.id === r.id ? { ...x, bucket: k as BucketKey } : x))); } }}
    cols={[{ k: "name", label: "Resolution", group: false, render: (r) => <Pill tone={BUCKET[r.bucket].tone}>{r.name}</Pill> }, { k: "bucket", label: "Bucket", text: (r) => BUCKET[r.bucket].label, groupVal: (r) => BUCKET[r.bucket].label, groupTone: (r) => BUCKET[r.bucket].tone, render: (r) => <Pill tone={BUCKET[r.bucket].tone}>{BUCKET[r.bucket].label}</Pill>, edit: { options: BUCKETS.map((b) => ({ v: b.key, l: b.label, tone: b.tone })) } }, { k: "leads", label: "Leads now", num: true }]}
    onEdit={async (rs, _c, v) => { for (const r of rs) { const res = await v2SaveBucket(r.id, v); if (!res.ok) return toast(res.message); } setRows((a) => a.map((x) => (rs.some((r) => r.id === x.id) ? { ...x, bucket: v as BucketKey } : x))); ws.rows.filter((x) => rs.some((r) => r.id === x.resolutionId)).forEach((x) => patchRows([x.id], { bucket: v as BucketKey })); toast("Saved — dashboards updated"); }} />;
}
type HRow = { id: string; label: string; from: string; weight: number; empty: number };
function HygienePage() {
  const { ws } = useCrm(); const toast = useToast(); const fields = [{ key: "email", label: "Email" }, ...ws.columns.filter((c) => c.source === "custom")];
  const [rows, setRows] = useState<HRow[]>(() => fields.map((f) => { const h = ws.hygiene.find((x) => x.key === f.key); return { id: f.key, label: f.label, from: h ? h.fromBucket : "off", weight: h?.weight ?? 1, empty: ws.rows.filter((r) => ["followup", "negotiation", "closing"].includes(r.bucket) && !M.fieldValue(r, f.key)).length }; }));
  return <DataTable<HRow> id="ctrl-hygiene" title="Fields that must be filled — and from which stage (default: once follow-up starts)" rows={rows} exportName="Hygiene rules"
    cols={[{ k: "label", label: "Field", group: false }, { k: "from", label: "Required from", render: (r) => (r.from === "off" ? <span style={{ color: "var(--faint)" }}>Not tracked</span> : <Pill tone="aqua">{BUCKET[r.from as BucketKey]?.label}</Pill>), edit: { options: [{ v: "off", l: "Not tracked" }, ...(["approach", "followup", "negotiation", "closing"] as BucketKey[]).map((b) => ({ v: b, l: BUCKET[b].label }))] } }, { k: "weight", label: "Importance (1–3)", num: true, edit: { options: [1, 2, 3].map((v) => ({ v: String(v), l: String(v) })) } }, { k: "empty", label: "Leads missing it now", num: true }]}
    onEdit={async (rs, col, v) => { for (const r of rs) { const next = { ...r, [col.k]: col.k === "weight" ? Number(v) : v }; const res = await v2SaveHygieneRule({ field_key: r.id, label: r.label, from_bucket: next.from === "off" ? "followup" : next.from, weight: next.weight, is_active: next.from !== "off" }); if (!res.ok) return toast(res.message); } setRows((a) => a.map((x) => (rs.some((r) => r.id === x.id) ? { ...x, [col.k]: col.k === "weight" ? Number(v) : v } : x))); toast("Saved — refresh to recalculate dashboards"); }} />;
}
function ColoursPage() {
  return <div className="card grow"><div className="card-b" style={{ padding: 14 }}><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(250px,1fr))", gap: 10 }}>{(Object.keys(TONES) as Tone[]).map((k) => <div key={k} className="tile" style={toneStyle(k)}><span className="tl1"><i style={{ width: 12, height: 12, borderRadius: 4, background: TONES[k].mk, display: "inline-block" }} />{TONES[k].name}</span><span className="tv" style={{ fontSize: 15 }}>{TONES[k].means}</span></div>)}</div>
    <h4 style={{ margin: "18px 0 8px" }}>Priority stages</h4><div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{BUCKETS.map((b) => <Pill key={b.key} tone={b.tone}>{b.label}</Pill>)}</div>
    <h4 style={{ margin: "18px 0 8px" }}>Chrome</h4><p style={{ color: "var(--muted)" }}>Altus red = active / primary actions · black = text · grey = secondary · white = surfaces. Pastels are only used for meaning.</p></div></div>;
}
