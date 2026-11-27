"use client";
// Altus CRM v2 — every dashboard. Same Workspace rows, same metrics, one panel at a time (no scrolling).
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BUCKET, PERIODS, PRODUCT_TARGET_RESOLUTIONS, TONES, type Tone } from "@/app/lib/crm2/config";
import * as M from "@/app/lib/crm2/metrics";
import type { LeadRow, Workspace } from "@/app/lib/crm2/types";
import { useCrm, type Ctx } from "./context";
import { v2SaveTarget } from "@/app/crm/actions";
import { DataTable, ShareWhatsApp, type Col } from "./DataTable";
import { FilterBar } from "./bars";
import { Bars, Donut, Gap, HStack, Legend, PctBar, Spark, type Series } from "./charts";
import { applyFilters, hiddenWithCustom, leadBulk, leadBulkAddValue, leadCard, leadCols, leadFilters, leadTone, useLeadEditor, type FilterState } from "./leads";
import { displayProductCode } from "@/app/lib/product-display";
import { Avatar, Icon, Pill, Tiles, Win, cap, fdate, fdt, fmt, money, toneStyle, useToast } from "./ui";

type R = Record<string, unknown> & { id: string };
export type DX = { ctx: Ctx; users: string[]; leads: LeadRow[]; range: M.DateRange; days: number; periodLabel: string; listWin: (title: string, rows: LeadRow[]) => void; goDash: (id: string) => void };
const Panel = ({ title, children, extra }: { title: string; children: ReactNode; extra?: ReactNode }) => <div className="panel" style={{ minHeight: 0 }}><div className="panel-h"><span className="lbl">{title}</span>{extra}</div><div style={{ padding: "8px 10px", overflow: "auto", flex: 1 }}>{children}</div></div>;
const Split = ({ l, r, lw = "36%" }: { l: ReactNode; r: ReactNode; lw?: string }) => <div className="dsplit" style={{ display: "grid", gridTemplateColumns: `${lw} 1fr`, gap: 10, flex: 1, minHeight: 0 }}>{l}{r}</div>;
const S = (pairs: [string, Tone][]): Series[] => pairs.map(([n, tone]) => ({ n, tone }));
const person = (ws: Workspace, k = "person"): Col<R> => ({ k, label: "Person", group: false, render: (r) => <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Avatar name={String(r[k])} photo={M.photoFor(ws, r.id)} /><b>{String(r[k])}</b></span> });
const num = (k: string, label: string, render?: (r: R) => ReactNode): Col<R> => ({ k, label, num: true, group: false, val: (r) => Number(r[k]), render });

function LeadList({ id, rows, title, group, sort, hideExtra = [], q }: { id: string; rows: LeadRow[]; title?: string; group?: string; sort?: { k: string; dir: 1 | -1 }; hideExtra?: string[]; q?: string }) {
  const ctx = useCrm(); const toast = useToast(); const [wa, setWa] = useState<LeadRow[] | null>(null);
  const cols = useMemo(() => leadCols(ctx.ws, ctx.canEdit, toast), [ctx.ws, ctx.canEdit, toast]);
  const { onEdit, modal } = useLeadEditor(ctx, toast);
  return <><DataTable<LeadRow> id={id} rows={rows} cols={cols} title={title} q={q} hidden={[...hiddenWithCustom(ctx.ws), ...hideExtra]} group={group ?? null} sort={sort ?? null} frozen={1} views={["table", "kanban", "cards", "calendar"]}
    kanban={{ key: (r) => r.bucket, cols: Object.values(BUCKET).map((b) => ({ k: b.key, label: b.label, tone: b.tone })) }} calendarKey={(r) => r.nextFollowUp} rowTone={leadTone}
    onOpen={(r, list) => ctx.openLead(r, list)} onEdit={onEdit} bulk={leadBulk(ctx, toast, setWa)} bulkExtra={leadBulkAddValue(ctx, toast)} dupeKey={(r) => r.phone} exportName={title ?? "Leads"} card={leadCard(ctx.ws)} minHeight={280}
    detail={{ count: (r) => r.extraContacts, rows: (r) => r.extraRows }} />
    {wa && <ShareWhatsApp title="Message" text={wa.map((r) => r.name).join(", ")} onClose={() => setWa(null)} />}{modal}</>;
}
export function ListWin({ title, rows, onClose }: { title: string; rows: LeadRow[]; onClose: () => void }) {
  return <Win title={title} onClose={onClose}><div className="win-b" style={{ display: "flex", padding: 10 }}><LeadList id={"win-" + title.slice(0, 20)} rows={rows} title={title} sort={{ k: "score", dir: -1 }} /></div></Win>;
}

const D: Record<string, (x: DX) => ReactNode> = {};
D.hot = (x) => {
  const live = x.leads.filter((l) => ["closing", "negotiation", "followup", "approach"].includes(l.bucket));
  const fc = Math.round(live.filter((l) => l.bucket === "closing").length * 0.72 + live.filter((l) => l.bucket === "negotiation").length * 0.48 + live.filter((l) => l.bucket === "followup").length * 0.1);
  return <><Tiles items={[...(["closing", "negotiation", "followup", "approach"] as const).map((k) => { const ls = live.filter((l) => l.bucket === k); return { label: BUCKET[k].label, value: ls.length, sub: `${ls.filter((l) => (M.daysSince(l.lastCalledAt) ?? 0) > 3).length} not called 3+ days`, tone: BUCKET[k].tone, icon: "fire", onClick: () => x.listWin(`${BUCKET[k].label} leads`, ls) }; }), { label: "Expected closures · 30 d", value: "~" + fc, sub: "Stage-weighted", tone: "sage", icon: "trend" }, { label: "Overdue on hot leads", value: live.filter((l) => l.bucket !== "approach" && l.nextFollowUp && (M.daysSince(l.nextFollowUp) ?? 0) > 0).length, sub: "Clear these first", tone: "rose", icon: "clock" }]} />
    <LeadList id="d-hot" rows={live} group="bucket" sort={{ k: "score", dir: -1 }} hideExtra={["contact", "hyg", "source"]} /></>;
};
D.calling = (x) => {
  const rows = M.callingReport(x.ctx.ws, x.users, x.range); const s = (k: keyof (typeof rows)[number]) => rows.reduce((a, r) => a + Number(r[k]), 0);
  const daily = M.dailyCalls(x.ctx.ws, x.users, Math.max(7, Math.min(30, x.days)));
  return <><Tiles items={[{ label: "Calls", value: fmt(s("calls")), sub: `Target ${fmt(s("target"))}`, tone: "slate", icon: "phone" }, { label: "Connected", value: fmt(s("connected")), sub: `${Math.round((s("connected") / Math.max(1, s("calls"))) * 100)}% connect rate`, tone: "mint", icon: "check" }, { label: "Out / in", value: `${fmt(s("outgoing"))} / ${fmt(s("incoming"))}`, tone: "sky", icon: "phone" }, { label: "Unique leads called", value: fmt(s("unique")), sub: `${fmt(s("assigned"))} assigned in period`, tone: "lav", icon: "users" }, { label: "Talk time", value: Math.round(s("talkMins") / 60) + " h", tone: "sage", icon: "clock" }, { label: "Below call target", value: `${rows.filter((r) => r.calls < r.target).length} / ${rows.length}`, tone: "rose", icon: "flag" }]} />
    <Split l={<Panel title={`Daily calls · last ${daily.length} days`}><Bars data={daily.map((d) => ({ label: fdate(d.day), short: d.day.slice(8), v: [d.connected, d.total - d.connected] }))} series={S([["Connected", "mint"], ["Not connected", "slate"]])} /><Legend series={S([["Connected", "mint"], ["Not connected", "slate"]])} /></Panel>}
      r={<DataTable<R> id="d-call" title={`Per person · ${x.periodLabel}`} exportName={`Calling report ${x.periodLabel}`} rows={rows as unknown as R[]} sort={{ k: "calls", dir: -1 }} frozen={1} onOpen={(r) => x.listWin(`Leads called by ${r.person}`, x.leads.filter((l) => l.owner === r.id && M.inRange(l.lastCalledAt, x.range)))}
        cols={[person(x.ctx.ws), num("calls", "Calls", (r) => <PctBar a={Number(r.calls)} t={Number(r.target)} tone="butter" />), num("outgoing", "Outgoing"), num("incoming", "Incoming"), num("connected", "Connected"), num("connectRate", "Connect %", (r) => <b style={{ color: Number(r.connectRate) >= 35 ? TONES.mint.ink : TONES.rose.ink }}>{String(r.connectRate)}%</b>), num("unique", "Unique leads"), num("assigned", "Assigned"), num("calledPct", "Assigned & called %", (r) => `${r.calledPct}%`), num("talkMins", "Talk mins"), num("followUps", "Follow-ups set")]} />} /></>;
};
D.ageing = (x) => {
  const ws = x.ctx.ws; const rows = M.ageing(ws, x.users) as R[]; const all = x.leads.filter((l) => l.owner && x.users.includes(l.owner) && !l.lastCalledAt && l.bucket !== "lost" && l.assignedAt); const ser = M.AGE_BANDS.map(([n, , , t]) => ({ n, tone: t }));
  return <><Tiles items={[{ label: "Never called", value: all.length, tone: "lav", icon: "phone", sub: "assigned leads", onClick: () => x.listWin("Never called", all) }, { label: "> 3 days", value: all.filter((l) => (M.daysSince(l.assignedAt) ?? 0) > 3).length, tone: "butter", icon: "clock" }, { label: "> 7 days", value: all.filter((l) => (M.daysSince(l.assignedAt) ?? 0) > 7).length, tone: "peach", icon: "clock" }, { label: "> 15 days", value: all.filter((l) => (M.daysSince(l.assignedAt) ?? 0) > 15).length, tone: "rose", icon: "flag" }, { label: "Follow-up untouched 7+ d", value: rows.reduce((s, r) => s + Number(r.followupStale), 0), tone: "rose", icon: "cal" }]} />
    <Split lw="40%" l={<Panel title="Pending by age · per person"><HStack rows={rows.map((r) => ({ label: String(r.person), v: M.AGE_BANDS.map(([b]) => Number(r[b])) }))} series={ser} /><Legend series={ser} /></Panel>}
      r={<DataTable<R> id="d-age" title="Assigned but never called · days since assignment" exportName="Lead ageing" rows={rows} sort={{ k: "notCalled", dir: -1 }} frozen={1} onOpen={(r) => x.listWin(`Never called · ${r.person}`, all.filter((l) => l.owner === r.id))}
        cols={[person(x.ctx.ws), ...M.AGE_BANDS.map(([b, , , t]) => num(b, b, (r) => (Number(r[b]) ? <Pill tone={t}>{String(r[b])}</Pill> : <span style={{ color: "var(--faint)" }}>0</span>))), num("notCalled", "Total never called"), num("oldest", "Oldest (days)"), num("followupStale", "Follow-up untouched 7+ d")]} />} /></>;
};
D["follow-ups"] = (x) => {
  const ws = x.ctx.ws; const rows = M.followups(ws, x.users); const fl = x.leads.filter((l) => l.nextFollowUp && (M.daysSince(l.nextFollowUp) ?? 0) >= -7 && l.bucket !== "lost"); const ser = S([["Overdue", "rose"], ["Today", "peach"], ["Tomorrow", "butter"], ["This week", "sky"]]);
  const t = (k: "overdue" | "today" | "tomorrow" | "week" | "total") => rows.reduce((s, r) => s + r[k], 0);
  return <><Tiles items={[{ label: "Overdue", value: t("overdue"), tone: "rose", icon: "flag" }, { label: "Due today", value: t("today"), tone: "peach", icon: "cal" }, { label: "Tomorrow", value: t("tomorrow"), tone: "butter", icon: "cal" }, { label: "Rest of week", value: t("week"), tone: "sky", icon: "cal" }, { label: "Follow-up discipline", value: Math.round(100 - (t("overdue") / Math.max(1, t("total"))) * 100) + "%", tone: "sage", icon: "check", sub: "not overdue" }]} />
    <Split lw="32%" l={<Panel title="Follow-ups per person"><HStack rows={rows.map((r) => ({ label: r.person, v: [r.overdue, r.today, r.tomorrow, r.week] }))} series={ser} /><Legend series={ser} /></Panel>} r={<LeadList id="d-fu" rows={fl} group="nextFollowUp" sort={{ k: "nextFollowUp", dir: 1 }} />} /></>;
};
D.ranking = (x) => {
  const rows = M.ranking(x.ctx.ws, x.users, x.range);
  return <><div className="dgrid" style={{ padding: 0, flex: "none" }}>{rows.slice(0, 3).map((r, i) => <div key={r.id} className="tile" style={{ gridColumn: "span 4", ...toneStyle((["sage", "sky", "peach"] as Tone[])[i]), flexDirection: "row", alignItems: "center", gap: 12 }}><span style={{ fontSize: 24 }}>{["🥇", "🥈", "🥉"][i]}</span><Avatar name={r.person} photo={M.photoFor(x.ctx.ws, r.id)} /><div style={{ flex: 1 }}><b>{r.person}</b><div className="ts">{r.closures} closing · {r.demos} demos · {r.refs} refs · {r.connected} connects</div></div><span className="tv">{r.score}</span></div>)}</div>
    <DataTable<R> id="d-rank" title="Score = 30% closures · 20% demos · 15% connects · 15% references · 10% ambassadors · 10% follow-up discipline" exportName="Sales ranking" rows={rows as unknown as R[]} sort={{ k: "rank", dir: 1 }} frozen={2}
      cols={[num("rank", "#"), person(x.ctx.ws), num("score", "Score /100", (r) => <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span className="bar-in" style={{ width: 80 }}><i style={{ width: `${r.score}%`, background: TONES.sage.mk }} /></span><b>{String(r.score)}</b></span>), num("closures", "Closing-stage leads"), num("demos", "Demos", (r) => <PctBar a={Number(r.demos)} t={Number(r.demosT)} />), num("connected", "Connected calls"), num("refs", "References", (r) => <PctBar a={Number(r.refs)} t={Number(r.refsT)} />), num("ambs", "Ambassadors", (r) => <PctBar a={Number(r.ambs)} t={Number(r.ambT)} />), num("discipline", "Follow-up discipline", (r) => `${r.discipline}%`)]} /></>;
};
/** One row per (person, target type) — same 5 plain columns for everything, instead of a wide sheet
 * with 3 columns per target type. Grouped by person in the table so it's still easy to scan per-person. */
type TRow2 = { id: string; personId: string; person: string; metric: string; kind: string; target: number; actual: number; daily: number; gap: number };
type DetailItem = { label: string; sub?: string; date: string };
/** The leads/calls/meetings behind a target row's Actual/Daily-avg count — same filters metrics.ts uses to
 * compute that count, just returning the underlying rows instead of a total. */
function targetDetail(ws: Workspace, range: M.DateRange, personId: string, kind: string): DetailItem[] {
  const leadFor = (leadId?: string) => (leadId ? ws.rows.find((r) => r.leadId === leadId)?.name : undefined);
  if (kind === "demos") return ws.meetings.filter((e) => e.u === personId && !e.upcoming && M.inRange(e.t, range)).map((e) => ({ label: leadFor(e.leadId) ?? "Lead", sub: e.kind, date: e.t }));
  if (kind === "meet") return ws.meetings.filter((e) => e.u === personId && M.inRange(e.sentAt, range)).map((e) => ({ label: leadFor(e.leadId) ?? "Lead", sub: e.kind, date: e.sentAt }));
  if (kind === "refs") return ws.references.filter((e) => e.u === personId && M.inRange(e.t, range)).map((e) => ({ label: e.name ?? "Lead", date: e.t }));
  if (kind === "amb") return ws.ambAppointed.filter((e) => e.u === personId && M.inRange(e.t, range)).map((e) => ({ label: e.name ?? "Lead", date: e.t }));
  if (kind === "fcalls") { const focusedIds = new Set(ws.rows.filter((r) => r.focusedOn).map((r) => r.id)); return ws.calls.filter((c) => c.u === personId && c.a && focusedIds.has(c.a) && M.inRange(c.t, range)).map((c) => ({ label: ws.rows.find((r) => r.id === c.a)?.name ?? "Lead", sub: c.c ? "Connected" : "Not connected", date: c.t })); }
  if (kind.startsWith("prod:")) { const code = kind.slice(5); const names = new Set((PRODUCT_TARGET_RESOLUTIONS[code] ?? []).map(M.normResolution)); return ws.rows.filter((l) => l.owner === personId && l.product === code && l.resolution && names.has(M.normResolution(l.resolution)) && M.inRange(l.lastCalledAt, range)).map((l) => ({ label: l.name, sub: l.resolution ?? undefined, date: l.lastCalledAt ?? "" })); }
  return [];
}
function TargetDetailModal({ title, items, onClose }: { title: string; items: DetailItem[]; onClose: () => void }) {
  return <Win small title={`${title} (${items.length})`} onClose={onClose}><div className="win-b" style={{ padding: 10, display: "flex", flexDirection: "column", gap: 2, overflow: "auto" }}>
    {items.length === 0 && <div className="empty">Nothing in this period yet.</div>}
    {[...items].sort((a, b) => +new Date(b.date) - +new Date(a.date)).map((it, i) => <div key={i} className="tli"><span className="tdot" style={{ background: TONES.slate.mk }} /><div><b>{it.label}</b>{it.sub ? ` · ${it.sub}` : ""}<div style={{ color: "var(--muted)", fontSize: 11.5 }}>{fdt(it.date)}</div></div></div>)}
  </div></Win>;
}
function Targets(x: DX) {
  const ctx = useCrm(); const isAmb = ctx.role === "ambassador"; const isAdmin = ctx.ws.roles.includes("admin"); const [tab, setTab] = useState(isAmb ? "amb" : "sales"); const [editPerson, setEditPerson] = useState<{ id: string; name: string } | null>(null);
  const [detail, setDetail] = useState<{ title: string; items: DetailItem[] } | null>(null);
  const sales = M.targets(ctx.ws, x.users, x.range), amb = M.ambTargets(ctx.ws, x.range, isAmb ? ctx.ws.me : undefined); const sum = (rs: R[], k: string) => rs.reduce((s, r) => s + Number(r[k]), 0);
  const prod = M.productActivityTargets(ctx.ws, x.users, x.range); const prodByUser = new Map(prod.rows.map((r) => [r.id, r.byCode]));
  const tiles = tab === "sales" ? [["Demos / meetings / pitches", sum(sales, "demos"), sum(sales, "demosT")], ["References", sum(sales, "refs"), sum(sales, "refsT")], ["Ambassadors appointed", sum(sales, "ambs"), sum(sales, "ambT")], ["People on all targets", sales.filter((r) => r.demosGap >= 0 && r.refsGap >= 0 && r.ambGap >= 0).length, sales.length]] as const : [["Ambassador demos", sum(amb, "demos"), sum(amb, "demosT")], ["Ambassador leads", sum(amb, "leads"), sum(amb, "leadsT")], ["On demo target", amb.filter((r) => r.demosGap >= 0).length, amb.length]] as const;
  const targetRows: TRow2[] = sales.flatMap((r): TRow2[] => {
    const row = (suffix: string, metric: string, kind: string, target: number, actual: number, gap: number): TRow2 => ({ id: `${r.id}-${suffix}`, personId: r.id, person: r.person, metric, kind, target, actual, daily: +(actual / x.days).toFixed(1), gap });
    const base = [
      row("demos", "Demos / meetings / pitches · wk", "demos", r.demosT, r.demos, r.demosGap),
      row("refs", "References · wk", "refs", r.refsT, r.refs, r.refsGap),
      row("amb", "Ambassadors appointed · wk", "amb", r.ambT, r.ambs, r.ambGap),
      row("meet", "Meetings scheduled (link sent) · wk", "meet", r.meetingsT, r.meetingsSent, r.meetingsGap),
      row("fcalls", "Calls on Focused Leads · per day", "fcalls", r.focusedCallsT, r.focusedCalls, r.focusedCallsGap),
    ];
    const products = prod.codes.map((c) => { const v = prodByUser.get(r.id)?.[c] ?? { raw: 0, actual: 0, target: 0, gap: 0 }; return row(`p-${c}`, `${displayProductCode(c)} activity · wk`, `prod:${c}`, v.target, v.actual, v.gap); });
    return [...base, ...products];
  });
  const openDetail = (r: TRow2) => setDetail({ title: `${r.metric} · ${r.person}`, items: targetDetail(ctx.ws, x.range, r.personId, r.kind) });
  const clickableNum = (n: number, r: TRow2) => <button type="button" className="btn ghost sm" style={{ padding: "0 6px" }} onClick={() => openDetail(r)}>{n}</button>;
  return <><div className="bar" style={{ flex: "none" }}>{!isAmb && <button className={`stab ${tab === "sales" ? "on" : ""}`} onClick={() => setTab("sales")}><Icon n="trend" s="s" /> Sales team</button>}<button className={`stab ${tab === "amb" ? "on" : ""}`} onClick={() => setTab("amb")}><Icon n="users" s="s" /> Ambassadors</button><span className="sample" style={{ marginLeft: "auto" }}>Weekly targets scaled to {x.periodLabel}{isAdmin && tab === "sales" ? " · admin: click a person to set their targets" : ""}</span></div>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "0 14px 10px" }}>{tiles.map(([l, a, t]) => <Pill key={l} tone={a >= t ? "sage" : "rose"}>{l} · {a}/{t} · {a - t >= 0 ? `+${a - t} surplus` : `${a - t} deficit`}</Pill>)}</div>
    {tab === "sales" ? <DataTable<TRow2> id="d-tg-s" title={`One row per person per target type — group by Person to scan one at a time${isAdmin ? ". Click a person to set their targets." : ""}`} exportName={`Targets ${x.periodLabel}`} rows={targetRows} group="person" frozen={2} rowTone={(r) => (r.gap >= 0 ? "sage" : "rose")}
      cols={[{ k: "person", label: "Person", group: false, render: (r) => isAdmin
        ? <button className="pi" style={{ padding: 0, border: 0, background: "none", display: "inline-flex", alignItems: "center", gap: 6 }} onClick={() => setEditPerson({ id: r.personId, name: r.person })}><Avatar name={r.person} photo={M.photoFor(ctx.ws, r.personId)} /><b>{r.person}</b></button>
        : <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Avatar name={r.person} photo={M.photoFor(ctx.ws, r.personId)} /><b>{r.person}</b></span> },
        { k: "metric", label: "Target type", group: false },
        { k: "target", label: "Target", num: true, group: false, val: (r) => r.target },
        { k: "daily", label: "Daily avg", num: true, group: false, val: (r) => r.daily, render: (r) => clickableNum(r.daily, r) },
        { k: "actual", label: "Actual (this period)", num: true, group: false, val: (r) => r.actual, render: (r) => <button type="button" onClick={() => openDetail(r)} style={{ padding: 0, border: 0, background: "none", cursor: "pointer", width: "100%" }} title="See the leads/calls behind this number"><PctBar a={r.actual} t={r.target} /></button> },
        { k: "gap", label: "Gap", num: true, group: false, val: (r) => r.gap, render: (r) => <Gap g={r.gap} /> }]} />
      : <DataTable<R> id="d-tg-a" title="Ambassadors · Demos 3/wk · Leads 10/wk" exportName="Ambassador targets" rows={amb as unknown as R[]} frozen={1} rowTone={(r) => (Number(r.demosGap) + Number(r.leadsGap) >= 0 ? "sage" : "rose")}
        cols={[person(x.ctx.ws), num("demos", "Demos / meetings / pitches", (r) => <PctBar a={Number(r.demos)} t={Number(r.demosT)} />), num("demosGap", "Demo gap", (r) => <Gap g={Number(r.demosGap)} />), num("leads", "Leads added", (r) => <PctBar a={Number(r.leads)} t={Number(r.leadsT)} />), num("leadsGap", "Lead gap", (r) => <Gap g={Number(r.leadsGap)} />)]} />}
    {editPerson && <PersonTargetsModal personId={editPerson.id} personName={editPerson.name} prodCodes={prod.codes} onClose={() => setEditPerson(null)} onSaved={() => ctx.refresh()} />}
    {detail && <TargetDetailModal title={detail.title} items={detail.items} onClose={() => setDetail(null)} />}</>;
}
D.targets = (x) => <Targets {...x} />;
type Cadence = "daily" | "weekly" | "monthly";
const CADENCES: [Cadence, string][] = [["daily", "Daily"], ["weekly", "Weekly"], ["monthly", "Monthly"]];
/** Converts a number entered in `cadence` to the stored base cadence ("weekly" for every target except
 * Focused-lead calls, which is stored "daily") — so admin can type "100 a month" and it just works. */
const toBaseCadence = (value: number, cadence: Cadence, base: "daily" | "weekly") => {
  const perDay = cadence === "daily" ? value : cadence === "weekly" ? value / 7 : value / 30;
  return Math.max(0, Math.round(base === "daily" ? perDay : perDay * 7));
};
type Entry = { value: number; unit: Cadence };
const TargetRow = ({ label, entry, onChange }: { label: string; entry: Entry; onChange: (e: Entry) => void }) => <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 100px", gap: 8, alignItems: "center" }}>
  <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink-2)" }}>{label}</span>
  <input type="number" min={0} value={entry.value} onChange={(e) => onChange({ ...entry, value: Math.max(0, Math.round(Number(e.target.value) || 0)) })} style={{ height: 30, border: "1px solid var(--line)", borderRadius: 6, padding: "0 8px", fontSize: 13, textAlign: "right" }} />
  <select value={entry.unit} onChange={(e) => onChange({ ...entry, unit: e.target.value as Cadence })} style={{ height: 30, border: "1px solid var(--line)", borderRadius: 6, fontSize: 12.5 }}>{CADENCES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
</div>;
function PersonTargetsModal({ personId, personName, prodCodes, onClose, onSaved }: { personId: string; personName: string; prodCodes: string[]; onClose: () => void; onSaved: () => void }) {
  const { ws } = useCrm(); const toast = useToast(); const t = ws.targets[personId] ?? {};
  const [demos, setDemos] = useState<Entry>({ value: t.demos ?? 3, unit: "weekly" });
  const [refs, setRefs] = useState<Entry>({ value: t.references ?? 15, unit: "weekly" });
  const [amb, setAmb] = useState<Entry>({ value: t.ambassadors ?? 3, unit: "weekly" });
  const [meet, setMeet] = useState<Entry>({ value: t.meetings ?? 3, unit: "weekly" });
  const [fcalls, setFcalls] = useState<Entry>({ value: t.focusedCalls ?? 20, unit: "daily" });
  const [products, setProducts] = useState<Record<string, Entry>>(() => Object.fromEntries(prodCodes.map((c) => [c, { value: t.products?.[c] ?? 0, unit: "weekly" as Cadence }])));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const res = await v2SaveTarget(personId, {
      demos: toBaseCadence(demos.value, demos.unit, "weekly"),
      references_per_week: toBaseCadence(refs.value, refs.unit, "weekly"),
      ambassadors: toBaseCadence(amb.value, amb.unit, "weekly"),
      meetings: toBaseCadence(meet.value, meet.unit, "weekly"),
      focused_calls: toBaseCadence(fcalls.value, fcalls.unit, "daily"),
      product_targets: Object.fromEntries(prodCodes.map((c) => [c, toBaseCadence(products[c].value, products[c].unit, "weekly")])),
    });
    setBusy(false); toast(res.message);
    if (res.ok) { onSaved(); onClose(); }
  };
  return <Win small title={`Targets · ${personName}`} onClose={onClose}><div className="win-b" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
    <p style={{ margin: 0, fontSize: 11.5, color: "var(--muted)" }}>Enter each target in whichever cadence is easiest — daily, weekly or monthly — it&apos;s converted automatically.</p>
    <TargetRow label="Demos / meetings / pitches" entry={demos} onChange={setDemos} />
    <TargetRow label="References" entry={refs} onChange={setRefs} />
    <TargetRow label="Ambassadors appointed" entry={amb} onChange={setAmb} />
    <TargetRow label="Meetings scheduled (link sent)" entry={meet} onChange={setMeet} />
    <TargetRow label="Calls on Focused Leads" entry={fcalls} onChange={setFcalls} />
    {prodCodes.length > 0 && <div style={{ borderTop: "1px solid var(--line-2)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
      {prodCodes.map((c) => <TargetRow key={c} label={`${displayProductCode(c)} activity`} entry={products[c]} onChange={(e) => setProducts((p) => ({ ...p, [c]: e }))} />)}
    </div>}
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, borderTop: "1px solid var(--line-2)", paddingTop: 10 }}>
      <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
      <button className="btn red" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save targets"}</button>
    </div>
  </div></Win>;
}
const Inflow = (kind: "amb" | "sales") => function InflowDash(x: DX) {
  const ws = x.ctx.ws; const ids = kind === "amb" ? M.ambassadorIds(ws) : x.users; const rows = M.inflow(ws, kind, ids, x.range) as R[]; const s = (k: string) => rows.reduce((a, r) => a + Number(r[k]), 0);
  return <><Tiles items={[{ label: "Today", value: s("d1"), tone: "lav", icon: "plus" }, { label: "3 days", value: s("d3"), tone: "lav" }, { label: "7 days", value: s("d7"), tone: "lav" }, { label: "30 days", value: s("d30"), tone: "lav" }, { label: kind === "amb" ? "Ambassadors with 0 in 7 d" : "People with 0 in 3 d", value: rows.filter((r) => !Number(kind === "amb" ? r.d7 : r.d3)).length, tone: "rose", icon: "flag" }, { label: "Selected period", value: s("range"), sub: x.periodLabel, tone: "slate" }]} />
    <DataTable<R> id={"d-in-" + kind} title={kind === "amb" ? "New leads added by each ambassador" : "Leads added / assigned to each sales person"} exportName={kind === "amb" ? "Ambassador inflow" : "Assignments"} rows={rows} frozen={1} sort={{ k: "d7", dir: -1 }} rowTone={(r) => (Number(r.d7) ? "lav" : "rose")}
      cols={[person(x.ctx.ws), ...M.INFLOW_DAYS.map((d) => num("d" + d, d === 1 ? "Today" : `${d} days`, (r) => (Number(r["d" + d]) ? <b>{String(r["d" + d])}</b> : <span style={{ color: TONES.rose.ink }}>0</span>))), num("range", `Selected (${x.periodLabel})`, (r) => <Pill tone="lav">{String(r.range)}</Pill>), { k: "spark", label: "Last 14 days", group: false, val: (r) => (r.spark as number[]).reduce((a, b) => a + b, 0), render: (r) => <Spark v={r.spark as number[]} /> }]} /></>;
};
const AmbInflow = Inflow("amb"), SalesInflow = Inflow("sales");
D["ambassador-inflow"] = (x) => <AmbInflow {...x} />;
D.assignments = (x) => <SalesInflow {...x} />;
D.hygiene = (x) => {
  const ws = x.ctx.ws; const rows = M.hygiene(ws, x.leads); const drill = x.leads.filter((l) => ["followup", "negotiation", "closing"].includes(l.bucket) && M.missingFields(ws, l).length);
  const mx = Math.max(0.01, ...rows.flatMap((r) => ws.hygiene.map((h) => Number(r[h.key]) / Math.max(1, Number(r.leads)))));
  return <><Tiles items={[...rows.map((r) => ({ label: String(r.stage), value: `${r.complete}%`, sub: `${r.empty} empty · ${r.leads} leads`, tone: (Number(r.complete) > 75 ? "mint" : Number(r.complete) > 55 ? "butter" : "rose") as Tone, icon: "db" }))]} />
    <div className="panel" style={{ flex: "none", maxHeight: 210 }}><div style={{ overflow: "auto" }}><table className="t heat" style={{ width: "100%" }}><thead><tr><th>Stage (from follow-up on)</th><th className="num">Leads</th><th className="num">Complete</th>{ws.hygiene.map((h) => <th key={h.key} className="num">{h.label}</th>)}</tr></thead>
      <tbody>{rows.map((r) => <tr key={String(r.bucket)}><td><Pill tone={BUCKET[r.bucket as keyof typeof BUCKET].tone}>{String(r.stage)}</Pill></td><td className="num">{String(r.leads)}</td><td className="num"><b>{String(r.complete)}%</b></td>{ws.hygiene.map((h) => { const v = Number(r[h.key]); const p = v / Math.max(1, Number(r.leads)); return <td key={h.key} className="num" title={`${r.stage} · ${h.label} empty: ${v}`} style={{ cursor: "pointer", background: `rgba(217,103,126,${((p / mx) * 0.55).toFixed(2)})` }} onClick={() => x.listWin(`${r.stage} leads missing ${h.label}`, x.leads.filter((l) => l.bucket === r.bucket && !M.hygieneFieldValue(ws, l, h.key)))}>{v}</td>; })}</tr>)}</tbody></table></div></div>
    <LeadList id="d-hy" rows={drill} title="Leads with empty fields (only after follow-up starts)" group="owner" sort={{ k: "hyg", dir: -1 }} /></>;
};
D.resolution = (x) => {
  const ws = x.ctx.ws; const rows = M.resolutionReport(ws, x.leads, x.range) as unknown as R[];
  const parts = Object.values(BUCKET).filter((b) => b.key !== "new").map((b) => ({ n: b.label, tone: b.tone, v: rows.filter((r) => r.bucketKey === b.key).reduce((s, r) => s + Number(r.total), 0) }));
  return <Split lw="30%" l={<Panel title="Resolutions by bucket"><Donut parts={parts} sub="LEADS" /></Panel>} r={<DataTable<R> id="d-res" title="Activity resolution overview" exportName="Activity resolution" rows={rows} group="bucket" rowTone={(r) => r.tone as Tone}
    cols={[{ k: "name", label: "Activity resolution", group: false, render: (r) => <Pill tone={r.tone as Tone}>{String(r.name)}</Pill> }, { k: "bucket", label: "Bucket", groupTone: (r) => r.tone as Tone }, num("today", "Today"), num("period", x.periodLabel), num("avg", "Average / day"), num("total", "Total")]} />} />;
};
D.reports = (x) => {
  const groups = M.reportGroups(x.leads, x.range);
  return <><Tiles items={groups.map((g) => ({ label: g.label, value: g.period, sub: `${g.total} total`, tone: g.tone, icon: "list", onClick: () => x.listWin(g.label, g.periodRows) }))} />
    <LeadList id="d-rep" rows={groups.flatMap((g) => g.rows)} title={`All leads across the report cards · ${x.periodLabel}`} group="resolution" /></>;
};
D.funnel = (x) => {
  const ctx = x.ctx; const prods = ctx.product === "ALL" ? ctx.ws.products : ctx.ws.products.filter((p) => p.code === ctx.product);
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(340px,1fr))", gap: 10, overflow: "auto", flex: 1, alignContent: "start" }}>{prods.map((p) => { const f = M.funnel(ctx.ws, p.code, x.leads); const top = Math.max(1, f[0]?.n ?? 1); return <Panel key={p.id} title={`${displayProductCode(p.code)} · ${p.name}`}>{f.map((s, i) => <div key={s.stage} style={{ display: "flex", alignItems: "center", gap: 8, margin: "5px 0", fontSize: 11.5 }}><span style={{ width: 130, fontWeight: 700 }}>{s.stage}</span><div style={{ flex: 1, background: "#F4F4F6", borderRadius: 5, height: 18 }}><i title={`${s.stage}: ${s.n}`} style={{ display: "block", height: "100%", width: `${(s.n / top) * 100}%`, background: TONES[(["lav", "sky", "peach", "butter", "mint"] as Tone[])[i % 5]].mk, borderRadius: 5 }} /></div><b style={{ width: 30, textAlign: "right" }}>{s.n}</b><span style={{ width: 40, textAlign: "right", color: "var(--muted)" }}>{i ? Math.round((s.n / Math.max(1, f[i - 1].n)) * 100) + "%" : ""}</span></div>)}</Panel>; })}</div>;
};
D.sources = (x) => {
  const rows = M.sources(x.leads) as unknown as R[];
  return <Split lw="40%" l={<Panel title="Leads vs hot leads by source"><Bars stacked={false} data={rows.map((r) => ({ label: cap(String(r.source)), short: cap(String(r.source)).split(" ")[0], v: [Number(r.leads), Number(r.hot)] }))} series={S([["Leads", "slate"], ["Hot", "mint"]])} h={220} /><Legend series={S([["Leads", "slate"], ["Hot (negotiation + closing)", "mint"]])} /></Panel>}
    r={<DataTable<R> id="d-src" title="Source quality" exportName="Lead sources" rows={rows} sort={{ k: "conv", dir: -1 }} cols={[{ k: "source", label: "Source", text: (r) => String(r.source), render: (r) => <b>{cap(String(r.source))}</b> }, num("leads", "Leads"), num("connectRate", "Connect %"), num("hot", "In negotiation / closing"), num("won", "Closing"), num("conv", "Conversion %", (r) => <b style={{ color: TONES.mint.ink }}>{String(r.conv)}%</b>), num("lost", "Lost / DND")]} />} />;
};
D.speed = (x) => {
  const rows = M.speedToLead(x.ctx.ws, x.users) as unknown as R[]; const avg = (k: string) => rows.reduce((s, r) => s + Number(r[k]), 0) / Math.max(1, rows.length);
  return <><Tiles items={[{ label: "Team avg to first call", value: avg("avgHrs").toFixed(1) + " h", tone: "butter", icon: "clock" }, { label: "Called within 1 h", value: Math.round(avg("within1h")) + "%", tone: "mint", icon: "check" }, { label: "Never called", value: rows.reduce((s, r) => s + Number(r.never), 0), tone: "rose", icon: "flag" }]} />
    <DataTable<R> id="d-sp" title="Hours from assignment to first call" exportName="Speed to lead" rows={rows} sort={{ k: "avgHrs", dir: 1 }} cols={[person(x.ctx.ws), num("assigned", "Assigned"), num("called", "Called"), num("never", "Never called"), num("avgHrs", "Avg hours", (r) => <b style={{ color: Number(r.avgHrs) > 12 ? TONES.rose.ink : TONES.mint.ink }}>{String(r.avgHrs)} h</b>), num("within1h", "Within 1 h", (r) => `${r.within1h}%`), num("within24h", "Within 24 h", (r) => `${r.within24h}%`)]} /></>;
};
D["best-time"] = (x) => {
  const ws = x.ctx.ws; const heatRange = x.days >= 30 ? x.range : M.periodRange("d30"); const g = M.hourHeat(ws, x.users, heatRange); const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], hrs = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
  return <Panel title="Connect rate by weekday × hour (last 30+ days)"><table className="heat" style={{ borderCollapse: "separate", borderSpacing: 3, margin: "auto" }}><tbody><tr><td />{hrs.map((h) => <td key={h} style={{ fontWeight: 700, color: "var(--muted)" }}>{h > 12 ? `${h - 12}p` : `${h}a`}</td>)}</tr>{days.map((dn, i) => <tr key={dn}><td style={{ fontWeight: 700, color: "var(--muted)", width: 40 }}>{dn}</td>{hrs.map((h) => { const c = g[`${i + 1}-${h}`] ?? { n: 0, c: 0 }; const r = c.n ? c.c / c.n : 0; return <td key={h} title={`${dn} ${h}:00 · ${c.n} calls · ${Math.round(r * 100)}% connected`} style={{ background: `rgba(63,167,122,${(r * 1.4).toFixed(2)})`, width: 54, height: 30, textAlign: "center", borderRadius: 4 }}>{Math.round(r * 100)}%</td>; })}</tr>)}</tbody></table><Legend series={[{ n: "Darker = more calls connect", tone: "mint" }]} /></Panel>;
};
D.meetings = (x) => {
  const ctx = x.ctx; const ev = ctx.ws.meetings.filter((e) => (ctx.role === "ambassador" ? e.u === ctx.ws.me : x.users.includes(e.u) || M.ambassadorIds(ctx.ws).includes(e.u)) && (e.upcoming || M.inRange(e.t, x.range))).map((e, i) => ({ id: "e" + i, ...e, person: M.personName(ctx.ws, e.u), lead: ctx.ws.rows.find((r) => r.leadId === e.leadId)?.name ?? "—", status: e.upcoming ? "Upcoming" : "Done" })) as unknown as R[];
  return <><Tiles items={[{ label: "Done in period", value: ev.filter((e) => !e.upcoming).length, tone: "sky", icon: "video" }, { label: "Upcoming", value: ev.filter((e) => e.upcoming).length, tone: "slate", icon: "cal" }, { label: "Zoom", value: ev.filter((e) => e.kind === "Zoom").length, tone: "lav" }, { label: "Google Meet", value: ev.filter((e) => e.kind === "Google Meet").length, tone: "peach" }]} />
    <DataTable<R> id="d-ev" title="Demos, meetings & pitches" exportName="Meetings" rows={ev} group="status" views={["table", "calendar"]} calendarKey={(r) => String(r.t)} rowTone={(r) => (r.upcoming ? "sky" : "mint")} onOpen={(r) => { const l = ctx.ws.rows.find((q) => q.leadId === r.leadId); if (l) ctx.openLead(l); }}
      cols={[{ k: "t", label: "When", render: (r) => fdt(String(r.t)), groupVal: (r) => fdate(String(r.t)) }, { k: "kind", label: "Via" }, { k: "status", label: "Status", render: (r) => <Pill tone={r.upcoming ? "sky" : "mint"}>{String(r.status)}</Pill> }, { k: "person", label: "By" }, { k: "lead", label: "Lead" }]} /></>;
};
D["ambassador-performance"] = (x) => {
  const ws = x.ctx.ws; const rows = M.ambassadorIds(ws).map((id) => { const own = ws.rows.filter((r) => r.ambassador === id); return { id, person: M.personName(ws, id), leads: ws.ambLeads.filter((e) => e.u === id && M.inRange(e.t, x.range)).length, demos: ws.meetings.filter((m) => m.u === id && !m.upcoming && M.inRange(m.t, x.range)).length, hot: own.filter((r) => r.bucket === "closing" || r.bucket === "negotiation").length, closing: own.filter((r) => r.bucket === "closing").length, total: own.length }; }) as unknown as R[];
  return <DataTable<R> id="d-ap" title={`Ambassador performance · ${x.periodLabel}`} exportName="Ambassador performance" rows={rows} sort={{ k: "leads", dir: -1 }} cols={[person(x.ctx.ws), num("leads", "Leads added"), num("demos", "Demos"), num("hot", "Leads in negotiation / closing"), num("closing", "Closing"), num("total", "All their leads")]} />;
};
D.lost = (x) => {
  const ws = x.ctx.ws; const lost = x.leads.filter((l) => l.bucket === "lost"); const rs = M.lostReasons(ws, x.leads);
  return <Split lw="34%" l={<Panel title="Why we lose"><Donut parts={rs.map((r, i) => ({ n: r.reason, v: r.n, tone: (["rose", "peach", "butter", "lav", "slate", "sky", "sage"] as Tone[])[i % 7] }))} sub="LOST / DND" /></Panel>} r={<LeadList id="d-lost" rows={lost} group="resolution" />} />;
};
D["my-day"] = (x) => {
  const ctx = x.ctx; const users = ctx.role === "sales_manager" ? x.users : [ctx.ws.me]; const today = M.callingReport(ctx.ws, users, M.periodRange("today"));
  const calls = today.reduce((s, r) => s + r.calls, 0), conn = today.reduce((s, r) => s + r.connected, 0), tgt = today.reduce((s, r) => s + r.target, 0);
  const mine = x.leads.filter((l) => l.owner && users.includes(l.owner)); const due = mine.filter((l) => l.nextFollowUp && M.daysSince(l.nextFollowUp) === 0), over = mine.filter((l) => l.bucket !== "lost" && l.nextFollowUp && (M.daysSince(l.nextFollowUp) ?? 0) > 0);
  const tg = M.targets(ctx.ws, users, M.periodRange("d7")); const list = mine.filter((l) => l.bucket !== "lost").sort((a, b) => M.priorityScore(b) - M.priorityScore(a)).slice(0, 150);
  return <><Tiles items={[{ label: "Calls today", value: `${calls} / ${tgt}`, sub: "target", tone: calls >= tgt ? "sage" : "rose", icon: "phone" }, { label: "Connected", value: conn, tone: "mint", icon: "check" }, { label: "Follow-ups due today", value: due.length, tone: "peach", icon: "cal", onClick: () => x.listWin("Due today", due) }, { label: "Overdue", value: over.length, tone: "rose", icon: "flag", onClick: () => x.listWin("Overdue follow-ups", over) }, { label: "Closing + negotiation", value: mine.filter((l) => l.bucket === "closing" || l.bucket === "negotiation").length, tone: "butter", icon: "fire" }, { label: "Demos this week", value: `${tg.reduce((s, r) => s + r.demos, 0)} / ${tg.reduce((s, r) => s + r.demosT, 0)}`, tone: "sky", icon: "video" }]} />
    <LeadList id="d-my" rows={list} title="Today's call list — highest focus score first" hideExtra={["hyg", "source", "product"]} /></>;
};
function MyAmbassadorDash(x: DX) {
  const ctx = x.ctx; const t = M.ambTargets(ctx.ws, M.periodRange("d7"), ctx.ws.me)[0]; const mine = ctx.ws.rows.filter((r) => r.ambassador === ctx.ws.me);
  const filters = useMemo(() => leadFilters(ctx.ws), [ctx.ws]);
  const [f, setF] = useState<FilterState>({}); const [q, setQ] = useState("");
  const shown = useMemo(() => applyFilters(mine, filters, f), [mine, filters, f]);
  return <><Tiles items={t ? [{ label: "Leads this week", value: `${t.leads} / ${t.leadsT}`, sub: t.leadsGap >= 0 ? `+${t.leadsGap} surplus` : `${t.leadsGap} deficit`, tone: t.leadsGap >= 0 ? "sage" : "rose", icon: "plus" }, { label: "Demos this week", value: `${t.demos} / ${t.demosT}`, sub: t.demosGap >= 0 ? `+${t.demosGap} surplus` : `${t.demosGap} deficit`, tone: t.demosGap >= 0 ? "sage" : "rose", icon: "video" }, { label: "In negotiation / closing", value: mine.filter((r) => r.bucket === "closing" || r.bucket === "negotiation").length, tone: "mint", icon: "fire" }, { label: "All my leads", value: mine.length, tone: "slate", icon: "list" }] : []} />
    <FilterBar defs={filters} rows={mine} state={f} setState={setF} q={q} setQ={setQ} />
    <LeadList id="d-ma" rows={shown} title="Leads I have introduced" hideExtra={["contact", "hyg", "win"]} q={q} /></>;
}
D["my-ambassador"] = (x) => <MyAmbassadorDash {...x} />;
D.ai = (x) => <AiDash {...x} />;

function AiDash(x: DX) {
  const ctx = useCrm(); const toast = useToast(); const rules = useMemo(() => M.insights(ctx.ws, x.leads, x.users), [ctx.ws, x.leads, x.users]);
  const [ai, setAi] = useState<{ brief?: string; insights?: { cat: string; sev: string; title: string; body: string }[]; source?: string } | null>(null);
  const [today] = useState(() => fdate(new Date()));
  const [cat, setCat] = useState("All"); const [q, setQ] = useState(""); const [answer, setAnswer] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const top = useMemo(() => x.leads.filter((l) => l.bucket !== "lost").sort((a, b) => M.priorityScore(b) - M.priorityScore(a)).slice(0, 50).map((l) => ({ name: l.name, company: l.company, product: l.product, stage: l.stage, bucket: l.bucket, resolution: l.resolution, owner: M.personName(ctx.ws, l.owner), lastCalledDays: M.daysSince(l.lastCalledAt), followUpInDays: l.nextFollowUp ? -(M.daysSince(l.nextFollowUp) ?? 0) : null, missing: M.missingFields(ctx.ws, l) })), [x.leads, ctx.ws]);
  const payload = (question?: string) => ({ role: ctx.role, product: ctx.product, period: x.periodLabel, facts: rules.map((r) => ({ cat: r.cat, title: r.title, body: r.body, metric: r.metric })), leads: top, question });
  useEffect(() => { fetch("/api/crm2/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload()) }).then((r) => r.json()).then(setAi).catch(() => setAi({ source: "rules" })); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.product, x.periodLabel]);
  const cards = ai?.insights?.length ? ai.insights.map((i) => ({ ...i, tone: (i.sev === "high" ? "rose" : i.sev === "med" ? "butter" : "sky") as Tone, metric: "", action: undefined as undefined | (typeof rules)[number]["action"] })) : rules;
  const cats = ["All", ...new Set(cards.map((c) => c.cat))];
  const act = (a?: (typeof rules)[number]["action"]) => { if (!a) return; if (a.dash) return x.goDash(a.dash); const f = a.filter; const rows = x.leads.filter((l) => (f === "closing" || f === "negotiation" ? l.bucket === f : f === "overdue" ? l.bucket !== "lost" && l.nextFollowUp && (M.daysSince(l.nextFollowUp) ?? 0) > 0 : !!l.owner && !l.lastCalledAt && (M.daysSince(l.assignedAt) ?? 0) > 3)); x.listWin(a.label, rows); };
  return <><div className="ins" style={{ borderColor: TONES.aqua.bd, background: TONES.aqua.bg, flex: "none" }}><span className="cat" style={{ color: TONES.aqua.ink }}><Icon n="spark" s="s" /> Daily brief · {today} · {ai?.source === "claude" ? "Claude" : "Rule engine (add ANTHROPIC_API_KEY for Claude)"}</span>
    <p style={{ fontSize: 13 }}>{ai?.brief ?? `${rules[0]?.title}. ${rules[2]?.title} — ${rules[2]?.body} ${rules[4]?.title}.`}</p>
    <div className="act"><div className="lsearch" style={{ flex: 1, width: "auto", background: "#fff" }}><Icon n="spark" s="s" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about your pipeline… e.g. “Which BSS leads can close this week?”" /></div>
      <button className="btn red sm" disabled={busy || !q} onClick={async () => { setBusy(true); const r = await fetch("/api/crm2/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload(q)) }).then((x) => x.json()).catch(() => ({})); setBusy(false); if (r.answer) setAnswer(r.answer); else toast("Add ANTHROPIC_API_KEY to enable Ask AI"); }}><Icon n="send" s="s" /> {busy ? "Thinking…" : "Ask AI"}</button></div></div>
    {answer && <Win small title={<><Icon n="spark" /> AI answer</>} onClose={() => setAnswer(null)}><div className="win-b" style={{ padding: 16, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{answer}</div></Win>}
    <div className="bar" style={{ flex: "none" }}>{cats.map((c) => <button key={c} className={`stab ${cat === c ? "on" : ""}`} onClick={() => setCat(c)}>{c}</button>)}</div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 10, overflow: "auto", flex: 1, alignContent: "start" }}>{cards.filter((c) => cat === "All" || c.cat === cat).map((c, i) => { const t = TONES[c.tone]; const sevT: Tone = c.sev === "high" ? "rose" : c.sev === "med" ? "butter" : "slate"; return (
      <div key={i} className="ins" style={{ borderColor: t.bd }}><span className="cat" style={{ color: t.ink }}><span style={{ width: 8, height: 8, borderRadius: 3, background: t.mk }} />{c.cat}<span className="sev" style={toneStyle(sevT)}>{c.sev === "high" ? "Act today" : c.sev === "med" ? "This week" : "Watch"}</span></span>
        <div style={{ display: "flex", gap: 10 }}><h4 style={{ flex: 1 }}>{c.title}</h4>{c.metric !== "" && <b style={{ fontSize: 20, color: t.ink }}>{String(c.metric)}</b>}</div><p>{c.body}</p>{c.action && <div className="act"><button className="btn sm" onClick={() => act(c.action)}><Icon n="chevr" s="s" /> {c.action.label}</button></div>}</div>); })}</div></>;
}

// Each dashboard renders as its own component (key = id) so hooks never mix between dashboards.
export function DashboardBody({ id, x }: { id: string; x: DX }) { const F = D[id]; return F ? <F key={id} {...x} /> : <div className="empty">Dashboard not found</div>; }
export { LeadList, money, PERIODS };
