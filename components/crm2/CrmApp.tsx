"use client";
// Altus CRM v2 — app shell: module bar (auto-hides after 8 s), retained left menu, title bar, bars, dashboards,
// lead window, mobile bottom nav. Navigation is client-side (data loads once), so any page is ≤ 2 clicks.
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BUCKET, DASHES, DEFAULT_DASH, PERIODS, TONES, dashesFor, modulesFor, primaryRole } from "@/app/lib/crm2/config";
import * as M from "@/app/lib/crm2/metrics";
import type { LeadRow, Workspace } from "@/app/lib/crm2/types";
import { refreshWorkspace, v2CreateLead } from "@/app/crm/actions";
import { CrmCtx, useCrm, type Ctx, type Route } from "./context";
import { TableQCtx } from "./DataTable";
import { DashboardBody, ListWin, type DX } from "./dashboards";
import { FilterBar, KpiBar } from "./bars";
import { LeadWindow } from "./LeadWindow";
import { PageBody, sidebar } from "./pages";
import { ownerOpts, type FilterDef, type FilterState, type Kpi } from "./leads";
import { displayProductCode } from "@/app/lib/product-display";
import { Avatar, Icon, Pill, Popover, PortalCtx, ToastHost, Win, cap, fmt, toneStyle, usePop, useToast } from "./ui";

export function CrmApp({ initial, initialRoute }: { initial: Workspace; initialRoute: Route }) {
  const [portal, setPortal] = useState<HTMLElement | null>(null);
  return <div className="crm2"><PortalCtx.Provider value={portal}><ToastHost><Shell initial={initial} initialRoute={initialRoute} /></ToastHost></PortalCtx.Provider><div ref={setPortal} /></div>;
}

function Shell({ initial, initialRoute }: { initial: Workspace; initialRoute: Route }) {
  const toast = useToast();
  const [ws, setWs] = useState(initial); const role = primaryRole(ws.roles);
  const [route, setRoute] = useState<Route>(initialRoute); const [product, setProduct] = useState("ALL"); const [period, setPeriod] = useState("today");
  const [lead, setLead] = useState<{ row: LeadRow; list: LeadRow[] } | null>(null); const [listWin, setListWin] = useState<{ title: string; rows: LeadRow[] } | null>(null);
  const [focus, setFocus] = useState(false); const [sideMini, setSideMini] = useState(false); const [sheet, setSheet] = useState<null | "modules" | "sections">(null); const [adding, setAdding] = useState(false);
  const canEdit = ws.roles.some((r) => r === "admin" || r === "sales_manager" || r === "sales_executive" || r === "consultant");
  const mods = modulesFor(ws.roles);

  const go = useCallback((r: Partial<Route> & { module: string }) => {
    const mod = r.module; const first = mod === "dashboards" ? DEFAULT_DASH[role] ?? dashesFor(ws.roles)[0]?.id ?? "ai" : r.page ?? "";
    const page = r.page ?? first; const next = { module: mod, page };
    setRoute(next); setSheet(null); window.history.pushState(null, "", `/crm/${mod}/${page}`);
  }, [role, ws.roles]);
  useEffect(() => { const f = () => { const [, , m, p] = location.pathname.split("/"); if (m) setRoute({ module: m, page: p ?? "" }); }; addEventListener("popstate", f); return () => removeEventListener("popstate", f); }, []);
  const refresh = useCallback(async () => { try { setWs(await refreshWorkspace()); toast("Data refreshed"); } catch { toast("Refresh failed"); } }, [toast]);
  useEffect(() => { const t = setInterval(() => { refreshWorkspace().then(setWs).catch(() => {}); }, 5 * 60_000); return () => clearInterval(t); }, []);
  const patchRows = useCallback((ids: string[], patch: Partial<LeadRow>) => setWs((w) => ({ ...w, rows: w.rows.map((r) => (ids.includes(r.id) ? { ...r, ...patch } : r)) })), []);
  const ctx: Ctx = { ws, role, canEdit, product, setProduct, period, setPeriod, route, go, openLead: (row, list) => setLead({ row, list: list ?? [row] }), patchRows, refresh };

  const mod = mods.find((m) => m.id === route.module) ?? mods[0];
  const items = sidebar(ctx, mod.id);
  const isDash = mod.id === "dashboards" || (mod.id === "sales" && route.page === "activity") || (mod.id === "ambassadors" && route.page === "targets");
  const dashId = mod.id === "dashboards" ? route.page || DEFAULT_DASH[role] || "ai" : route.page === "activity" ? "resolution" : "targets";
  const title = mod.id === "dashboards" ? DASHES.find((d) => d.id === dashId)?.label ?? "Dashboard" : items.find((i) => i.id === route.page)?.label ?? mod.label;
  // Ambassadors can't edit leads generally, but can add a new one from Sales Lead Master / Focused Leads (same
  // v2CreateLead flow as everyone else — it round-robins, it doesn't hand the lead to them).
  const canAddLead = canEdit || (role === "ambassador" && mod.id === "sales" && (route.page === "leads" || route.page === "focus-leads"));

  return <CrmCtx.Provider value={ctx}><div className={`app ${focus ? "focus" : ""}`}>
    <ModuleBar mods={mods} cur={mod.id} onPick={(id) => { const m = mods.find((x) => x.id === id)!; if (m.ext) window.open(m.ext, "_blank", "noopener"); else go({ module: id }); }} />
    <div className="m-top"><button className="mmod" onClick={() => setSheet("modules")}><Icon n={mod.icon} />{mod.label}<Icon n="chevd" s="s" /></button><span style={{ flex: 1 }} /><button className="btn sm" onClick={() => setSheet("sections")}><Icon n="list" s="s" /> {items.length} sections</button><AccountMenu /></div>
    <div className="body">
      <aside className={`side ${sideMini ? "mini" : ""}`}><div className="side-h"><span className="mark"><Icon n={mod.icon} /></span><b>{mod.label.toUpperCase()}</b></div>
        <nav className="nav"><Nav items={items} cur={route.page} pick={(id) => go({ module: mod.id, page: id })} /></nav>
        <div className="side-f"><button className="ni" onClick={() => setSideMini((x) => !x)}><Icon n={sideMini ? "chevr" : "chevl"} /><span className="nl">Collapse menu</span></button><Link className="ni" href="/dashboard"><Icon n="ext" /><span className="nl">Classic CRM</span></Link></div></aside>
      <main className="main">
        <TitleBar title={title} module={mod.label} focus={focus} setFocus={setFocus} onAdd={canAddLead && mod.id !== "admin" && mod.id !== "control" ? () => setAdding(true) : undefined} />
        {ws.warnings.length > 0 && <div className="sample" style={{ flex: "none" }}>{ws.warnings.join(" · ")}</div>}
        {isDash ? <DashArea dashId={dashId} lockDash={mod.id !== "dashboards"} onList={(t, r) => setListWin({ title: t, rows: r })} /> : <PageBody mod={mod.id} page={route.page} />}
      </main></div>
    <nav className="mnav">{mobileTabs(role).map(([m, p, ic, l]) => <button key={l} className={route.module === m && (!p || route.page === p) ? "on" : ""} onClick={() => (m === "more" ? setSheet("modules") : go({ module: m, page: p || undefined }))}><Icon n={ic} s="l" />{l}</button>)}</nav>
    {canAddLead && <button className="fab" onClick={() => setAdding(true)}><Icon n="plus" /></button>}
    {sheet === "modules" && <Win small title="Modules" onClose={() => setSheet(null)}><div className="win-b" style={{ padding: 12 }}><div className="modgrid">{mods.map((m) => <button key={m.id} className={m.id === mod.id ? "on" : ""} onClick={() => (m.ext ? window.open(m.ext, "_blank", "noopener") : go({ module: m.id }))}><Icon n={m.icon} s="l" />{m.label}{m.soon && <span className="soon">SOON</span>}</button>)}</div>
      <div className="install" style={{ marginTop: 14 }}><Icon n="download" /><div><b>Install on your phone</b><div style={{ opacity: 0.75 }}>Open this link in Chrome / Safari → Share → &ldquo;Add to Home Screen&rdquo;.</div></div></div></div></Win>}
    {sheet === "sections" && <Win small title={`${mod.label} · sections`} onClose={() => setSheet(null)}><div className="win-b seclist">{items.map((i) => <button key={i.id} onClick={() => go({ module: mod.id, page: i.id })} style={i.id === route.page ? { color: "var(--red)" } : undefined}><Icon n={i.icon ?? "chevr"} />{i.group ? <span style={{ color: "var(--muted)", fontWeight: 400 }}>{i.group} ›</span> : null}{i.label}{i.cnt != null && <span style={{ marginLeft: "auto", color: "var(--muted)" }}>{fmt(i.cnt)}</span>}</button>)}</div></Win>}
    {lead && <LeadWindow row={lead.row} list={lead.list} onClose={() => setLead(null)} onNav={(row) => setLead({ row, list: lead.list })} />}
    {listWin && <ListWin title={listWin.title} rows={listWin.rows} onClose={() => setListWin(null)} />}
    {adding && <AddLead onClose={() => setAdding(false)} />}
  </div></CrmCtx.Provider>;
}

/** Grouped nav items (e.g. "Products") collapse into a dropdown — closed by default, auto-opens if it holds the current page. */
function Nav({ items, cur, pick }: { items: ReturnType<typeof sidebar>; cur: string; pick: (id: string) => void }) {
  const curGroup = items.find((i) => i.id === cur)?.group;
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const isOpen = (grp: string) => open.has(grp) || grp === curGroup;
  const toggle = (grp: string) => setOpen((s) => { const n = new Set(s); if (n.has(grp)) n.delete(grp); else n.add(grp); return n; });
  const out: ReactNode[] = []; let g: string | undefined; let bucket: ReactNode[] = [];
  const flush = () => { if (g) { const grp = g; out.push(<div key={"grp" + grp} className={`grp ${isOpen(grp) ? "" : "closed"}`}><button className="ni grp-h" onClick={() => toggle(grp)}><Icon n="cards" /><span className="nl">{grp}</span><Icon n="chevd" s="s" className="chev" /></button><div className="sub">{bucket}</div></div>); bucket = []; } };
  items.forEach((i) => {
    if (i.group !== g) { flush(); g = i.group; }
    const btn = <button key={i.id} className={`ni ${i.id === cur ? "on" : ""}`} onClick={() => pick(i.id)} title={i.label}>{i.icon && !i.group ? <Icon n={i.icon} /> : null}<span className="nl">{i.label}</span>{i.cnt != null && <span className="cnt">{fmt(i.cnt)}</span>}</button>;
    if (i.group) bucket.push(btn); else out.push(btn);
  });
  flush();
  return <>{out}</>;
}
const mobileTabs = (role: string): [string, string, string, string][] => role === "ambassador" ? [["dashboards", "", "home", "Home"], ["sales", "leads", "list", "Leads"], ["sales", "focus-leads", "fire", "Focused"], ["dashboards", "meetings", "video", "Meetings"], ["more", "", "menu", "More"]] : [["dashboards", "", "home", "Home"], ["sales", "leads", "list", "Leads"], ["sales", "follow-ups", "cal", "Follow-ups"], ["sales", "calls", "phone", "Calls"], ["more", "", "menu", "More"]];

function ModuleBar({ mods, cur, onPick }: { mods: ReturnType<typeof modulesFor>; cur: string; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false); const hover = useRef(false); const timer = useRef<ReturnType<typeof setTimeout> | null>(null); const [tick, setTick] = useState(0);
  const arm = useCallback(() => { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(function close() { if (hover.current) { timer.current = setTimeout(close, 8000); return; } setOpen(false); }, 8000); setTick((t) => t + 1); }, []);
  const show = () => { setOpen(true); arm(); };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return <div className="modbar-wrap"><div className={`modbar ${open ? "open" : ""}`} onMouseEnter={() => (hover.current = true)} onMouseLeave={() => (hover.current = false)}>
    <span className="logo"><Icon n="trend" /> ALTUS</span>{mods.map((m) => <button key={m.id} className={`mod ${cur === m.id ? "on" : ""}`} onClick={() => { onPick(m.id); setOpen(false); }}><Icon n={m.icon} s="s" />{m.label}{m.soon && <span className="soon">SOON</span>}{m.ext && <Icon n="ext" s="s" />}</button>)}
    {open && <div key={tick} className="modtimer" style={{ width: "100%", animation: "crm2shrink 8s linear forwards" }} />}</div>
    <button className="modtab" onMouseEnter={() => !open && show()} onClick={() => (open ? setOpen(false) : show())} title="Modules — hides after 8 s"><Icon n={open ? "chevu" : "chevd"} s="s" /></button></div>;
}

function TitleBar({ title, module, focus, setFocus, onAdd }: { title: string; module: string; focus: boolean; setFocus: (f: boolean) => void; onAdd?: () => void }) {
  const ctx = useCtx(); const { ws } = ctx; const pop = usePop(); const [q, setQ] = useState("");
  const results = useMemo(() => { const s = q.trim().toLowerCase(); if (s.length < 2) return null; return { leads: ws.rows.filter((r) => `${r.name} ${r.phone} ${r.company} ${r.email}`.toLowerCase().includes(s)).slice(0, 8), dashes: dashesFor(ws.roles).filter((d) => d.label.toLowerCase().includes(s)), people: ws.people.filter((p) => p.name.toLowerCase().includes(s)).slice(0, 4) }; }, [q, ws]);
  return <div className="tbar"><span className="crumb"><span className="m">{module}</span><span className="sep">▶</span><span>{title}</span></span><span className="sp" />
    <div className="gsearch" onClick={(e) => pop.open(e.currentTarget, "search")}><Icon n="search" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search leads, phone, company, people, dashboards…" /></div>
    <button className="ib mob-hide" title={`Refresh data (loaded ${new Date(ws.generatedAt).toLocaleTimeString("en-IN")})`} onClick={() => ctx.refresh()}><Icon n="refresh" /></button>
    {ws.roles.includes("admin") && <Link className="ib mob-hide" href="/dashboard/leads" title="Bulk upload leads (classic importer)"><Icon n="upload" /></Link>}
    {onAdd && <button className="btn red mob-hide" onClick={onAdd}><Icon n="plus" s="s" /> Add lead</button>}
    <button className="ib mob-hide" title="Maximise (focus mode)" onClick={() => { setFocus(!focus); try { if (!focus) document.documentElement.requestFullscreen?.(); else if (document.fullscreenElement) document.exitFullscreen(); } catch {} }}><Icon n={focus ? "min" : "focus"} /></button>
    <AccountMenu />
    {pop.anchor && pop.key === "search" && results && <Popover anchor={pop.anchor} onClose={pop.close} width={420}>
      {results.leads.length > 0 && <><div className="ph">Leads</div>{results.leads.map((l) => <button key={l.id} className="pi" onClick={() => { pop.close(); ctx.openLead(l, results.leads); }}><Avatar name={l.name} /><span><b>{l.name}</b><br /><span style={{ color: "var(--muted)", fontSize: 11 }}>{l.company} · {l.phone}</span></span><span className="r"><Pill tone={BUCKET[l.bucket].tone}>{l.product}</Pill></span></button>)}</>}
      {results.dashes.length > 0 && <><div className="ph">Dashboards</div>{results.dashes.map((d) => <button key={d.id} className="pi" onClick={() => { pop.close(); ctx.go({ module: "dashboards", page: d.id }); }}><Icon n={d.icon} /> {d.label}</button>)}</>}
      {results.people.length > 0 && <><div className="ph">People</div>{results.people.map((p) => <div key={p.id} className="pi"><Avatar name={p.name} photo={M.photoFor(ws, p.id)} />{p.name}</div>)}</>}
      {!results.leads.length && !results.dashes.length && !results.people.length && <div className="empty" style={{ padding: 20 }}>No matches</div>}</Popover>}
  </div>;
}
/** Bell + avatar (with their popovers) — shared so mobile's .m-top row and desktop's .tbar can each show their own copy. */
function AccountMenu() {
  const ctx = useCtx(); const { ws } = ctx; const pop = usePop();
  const overdue = ws.rows.filter((r) => M.isLive(r) && r.nextFollowUp && (M.daysSince(r.nextFollowUp) ?? 0) > 0); const fresh = ws.rows.filter((r) => r.isNew);
  return <div className="acct">
    <button className="ib" onClick={(e) => pop.open(e.currentTarget, "bell")}><Icon n="bell" />{fresh.length + overdue.length > 0 && <span className="dot">{fresh.length + overdue.length}</span>}</button>
    <button className="avatar" aria-label={ws.displayName} onClick={(e) => pop.open(e.currentTarget, "me")} style={ws.photos[ws.me] ? { backgroundImage: `url(${ws.photos[ws.me]})`, backgroundSize: "cover", backgroundPosition: "center", color: "transparent" } : undefined}>{ws.displayName.split(" ").map((x) => x[0]).slice(0, 2).join("").toUpperCase()}</button>
    {pop.anchor && pop.key === "bell" && <Popover anchor={pop.anchor} onClose={pop.close} width={340} right><div className="ph">Notifications</div>
      <button className="pi" onClick={() => { pop.close(); ctx.go({ module: "sales", page: "follow-ups" }); }}><span className="hi" style={{ ...toneStyle("rose"), width: 26, height: 26, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon n="flag" s="s" /></span>{overdue.length} follow-ups overdue</button>
      <button className="pi" onClick={() => { pop.close(); ctx.go({ module: "sales", page: "leads" }); }}><span className="hi" style={{ ...toneStyle("lav"), width: 26, height: 26, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon n="plus" s="s" /></span>{fresh.length} new inbound leads</button>
      <Link className="pi" href="/dashboard">All notifications (classic)</Link></Popover>}
    {pop.anchor && pop.key === "me" && <Popover anchor={pop.anchor} onClose={pop.close} right><div className="ph">{ws.displayName}</div><Link className="pi" href="/dashboard/settings"><Icon n="mail" /> My email (SMTP)</Link><Link className="pi" href="/dashboard"><Icon n="ext" /> Back to classic CRM</Link></Popover>}
  </div>;
}
const useCtx = useCrm;

const DASH_FILTERS: FilterDef<LeadRow>[] = [{ k: "source", label: "Source", icon: "megaphone", get: (r) => r.source, opts: (rs) => [...new Set(rs.map((r) => r.source))].sort().map((v) => ({ v, l: cap(v) })) }];
function DashArea({ dashId, lockDash, onList }: { dashId: string; lockDash: boolean; onList: (t: string, r: LeadRow[]) => void }) {
  const ctx = useCtx(); const { ws } = ctx; const [f, setF] = useState<FilterState>({}); const [q, setQ] = useState(""); const [people, setPeople] = useState<Set<string>>(new Set()); const [min, setMin] = useState(false); const [max, setMax] = useState(false);
  const strip = useRef<HTMLDivElement>(null); const dashes = dashesFor(ws.roles); const d = DASHES.find((x) => x.id === dashId) ?? dashes[0];
  const users = ws.scope.filter((u) => !people.size || people.has(u));
  const leads = useMemo(() => { let ls = ws.rows.filter((r) => ctx.product === "ALL" || r.product === ctx.product); if (people.size) ls = ls.filter((r) => r.owner && people.has(r.owner)); if (f.source && !("period" in f.source) && f.source.size) ls = ls.filter((r) => (f.source as Set<string>).has(r.source)); return ls; }, [ws.rows, ctx.product, people, f]);
  const range = M.periodRange(ctx.period); const days = M.rangeDays(range); const periodLabel = PERIODS.find((p) => p.key === ctx.period)?.label ?? "Today";
  const x: DX = { ctx, users, leads, range, days, periodLabel, listWin: onList, goDash: (id) => ctx.go({ module: "dashboards", page: id }) };
  const tc = M.callingReport(ws, users, M.periodRange("today")); const tg = M.targets(ws, users, M.periodRange("d7"));
  const kp: Kpi<LeadRow>[] = [{ k: "c", n: tc.reduce((s, r) => s + r.calls, 0), label: "Calls today", tone: "slate" }, { k: "cn", n: tc.reduce((s, r) => s + r.connected, 0), label: "Connected today", tone: "mint" }, { k: "hot", n: leads.filter((l) => l.bucket === "closing" || l.bucket === "negotiation").length, label: "Closing + negotiation", tone: "butter" }, { k: "fu", n: leads.filter((l) => M.isLive(l) && l.nextFollowUp && (M.daysSince(l.nextFollowUp) ?? 0) > 0).length, label: "Overdue follow-ups", tone: "rose" }, { k: "nc", n: leads.filter((l) => l.owner && !l.lastCalledAt && M.isLive(l)).length, label: "Never called", tone: "lav" }, { k: "dm", n: tg.reduce((s, r) => s + r.demos, 0), label: `Demos this week / ${tg.reduce((s, r) => s + r.demosT, 0)}`, tone: "sky" }, { k: "nw", n: leads.filter((l) => M.inDays(l.createdAt, 1)).length, label: "New leads today", tone: "lav" }];
  const kpiGo: Record<string, () => void> = { c: () => x.goDash("calling"), cn: () => x.goDash("calling"), dm: () => x.goDash("targets"), nw: () => x.goDash(dashes.some((q) => q.id === "assignments") ? "assignments" : "ageing"), hot: () => onList("Closing + negotiation", leads.filter((l) => l.bucket === "closing" || l.bucket === "negotiation")), fu: () => onList("Overdue follow-ups", leads.filter((l) => M.isLive(l) && l.nextFollowUp && (M.daysSince(l.nextFollowUp) ?? 0) > 0)), nc: () => onList("Never called", leads.filter((l) => l.owner && !l.lastCalledAt && M.isLive(l))) };
  const idx = dashes.findIndex((q) => q.id === d.id);
  const periods = <div className="strip" style={{ gap: 3, flex: "0 1 auto", minWidth: 0 }}><PeriodPick value={ctx.period} onChange={ctx.setPeriod} /><PeoplePick people={people} setPeople={setPeople} /><ProductPick ws={ws} value={ctx.product} onChange={ctx.setProduct} /></div>;
  return <TableQCtx.Provider value={q}>
    <FilterBar defs={DASH_FILTERS} rows={ws.rows} state={f} setState={setF} q={q} setQ={setQ} lead={periods} />
    <KpiBar kpis={kp} active={null} onPick={(k) => k && kpiGo[k]?.()} />
    {!lockDash && <div className="bar boxed can-hide"><span className="lbl">Dashboards</span><button className="carr" onClick={() => strip.current?.scrollBy({ left: -360, behavior: "smooth" })}><Icon n="chevl" s="s" /></button><div className="strip" ref={strip}>{dashes.map((dd) => <button key={dd.id} className={`stab ${dd.id === d.id ? "on" : ""}`} onClick={() => x.goDash(dd.id)}><span className="sw" style={{ background: TONES[dd.tone].mk }} />{dd.label}</button>)}</div><button className="carr" onClick={() => strip.current?.scrollBy({ left: 360, behavior: "smooth" })}><Icon n="chevr" s="s" /></button><span className="lbl">{idx + 1} / {dashes.length}</span></div>}
    <div className={`card grow ${min ? "min" : ""} ${max ? "maxed" : ""}`}><div className="card-h"><span className="hi" style={toneStyle(d.tone)}><Icon n={d.icon} /></span><h3>{d.label}</h3><span className="sub">{ctx.product === "ALL" ? "All products" : displayProductCode(ctx.product)} · {periodLabel}</span><span style={{ flex: 1 }} />
      {!lockDash && <><button className="sb" title="Previous" onClick={() => x.goDash(dashes[(idx - 1 + dashes.length) % dashes.length].id)}><Icon n="chevl" s="s" /></button><button className="sb" title="Next" onClick={() => x.goDash(dashes[(idx + 1) % dashes.length].id)}><Icon n="chevr" s="s" /></button></>}
      <a className="sb" title="Share on WhatsApp" target="_blank" rel="noopener noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`*${d.label}* · ${periodLabel}\n` + kp.map((k) => `${k.label}: ${k.n}`).join("\n"))}`}><Icon n="wa" s="s" /></a>
      <button className="sb" title="Print" onClick={() => window.print()}><Icon n="print" s="s" /></button>
      <span className="secbtns"><button className="sb" title="Minimise" onClick={() => setMin((v) => !v)}><Icon n="min" s="s" /></button><button className="sb" title="Maximise" onClick={() => setMax((v) => !v)}><Icon n="max" s="s" /></button></span></div>
      <div className="card-b" style={{ display: "flex", flexDirection: "column", gap: 10, padding: 10 }}><DashboardBody id={d.id} x={x} /></div></div>
  </TableQCtx.Provider>;
}
/** Date filter — defaults to Today; opens a dropdown of calendar-aware ranges (PERIODS, see M.periodRange). */
function PeriodPick({ value, onChange }: { value: string; onChange: (k: string) => void }) {
  const pop = usePop(); const label = PERIODS.find((p) => p.key === value)?.label ?? "Today";
  return <><button className="fchip on" onClick={(e) => pop.open(e.currentTarget, "period")}><Icon n="cal" s="s" />{label}<Icon n="chevd" s="s" /></button>
    {pop.anchor && <Popover anchor={pop.anchor} onClose={pop.close} width={220}><div className="ph">Date</div>
      {PERIODS.map((p) => <button key={p.key} className={`pi ${value === p.key ? "on" : ""}`} onClick={() => { onChange(p.key); pop.close(); }}>{p.label}</button>)}</Popover>}</>;
}
function PeoplePick({ people, setPeople }: { people: Set<string>; setPeople: (s: Set<string>) => void }) {
  const ctx = useCtx(); const pop = usePop(); const opts = ownerOpts(ctx.ws).filter((o) => ctx.ws.scope.includes(o.v));
  if (opts.length < 2) return null;
  return <><button className={`fchip ${people.size ? "on" : ""}`} onClick={(e) => pop.open(e.currentTarget, "p")}><Icon n="user" s="s" />{people.size ? `Sales person (${people.size})` : "Sales person"}<Icon n="chevd" s="s" /></button>
    {pop.anchor && <Popover anchor={pop.anchor} onClose={pop.close} width={240}><div className="ph">Sales person</div>{opts.map((o) => <label key={o.v} className="pi"><input type="checkbox" className="cb" checked={people.has(o.v)} onChange={() => { const n = new Set(people); if (n.has(o.v)) n.delete(o.v); else n.add(o.v); setPeople(n); }} /> {o.l}</label>)}<button className="btn sm" style={{ width: "100%", marginTop: 6 }} onClick={() => setPeople(new Set())}>Clear</button></Popover>}</>;
}
function ProductPick({ ws, value, onChange }: { ws: Workspace; value: string; onChange: (c: string) => void }) {
  const pop = usePop(); const opts = ["ALL", ...ws.products.map((p) => p.code)];
  return <><button className={`fchip ${value !== "ALL" ? "on" : ""}`} onClick={(e) => pop.open(e.currentTarget, "prod")}><Icon n="layers" s="s" />{value === "ALL" ? "Product" : displayProductCode(value)}<Icon n="chevd" s="s" /></button>
    {pop.anchor && <Popover anchor={pop.anchor} onClose={pop.close} width={240}><div className="ph">Product</div>{opts.map((c) => <button key={c} className={`pi ${value === c ? "on" : ""}`} onClick={() => { onChange(c); pop.close(); }}>{c === "ALL" ? "ALL" : displayProductCode(c)}<span className="r">{ws.rows.filter((r) => M.isLive(r) && (c === "ALL" || r.product === c)).length}</span></button>)}</Popover>}</>;
}
function AddLead({ onClose }: { onClose: () => void }) {
  const ctx = useCtx(); const toast = useToast(); const [v, setV] = useState({ firstName: "", lastName: "", phone: "", email: "" }); const [prods, setProds] = useState<string[]>([]); const [busy, setBusy] = useState(false);
  return <Win small title="Add lead" onClose={onClose}><div className="win-b"><div className="fgrid">{([["firstName", "First name *"], ["lastName", "Last name"], ["phone", "Cell number *"], ["email", "Email"]] as const).map(([k, l]) => <div key={k} className="fld"><label>{l}</label><input value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></div>)}</div>
    <div style={{ padding: "0 14px" }}><div className="lbl" style={{ marginBottom: 6 }}>Products</div><div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{ctx.ws.products.map((p) => <button key={p.id} className={`ptab ${prods.includes(p.id) ? "on" : ""}`} onClick={() => setProds((s) => (s.includes(p.id) ? s.filter((x) => x !== p.id) : [...s, p.id]))}>{displayProductCode(p.code)}</button>)}</div></div>
    <div style={{ padding: 14, display: "flex", gap: 8, alignItems: "center" }}><span style={{ color: "var(--muted)", fontSize: 11.5, flex: 1 }}>Uses the existing lead rules: duplicate check, round robin, notifications.</span><button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn red" disabled={busy || !v.firstName || !v.phone} onClick={async () => { setBusy(true); const r = await v2CreateLead({ ...v, productIds: prods }); setBusy(false); toast(r.message); if (r.ok) { onClose(); ctx.refresh(); } }}><Icon n="check" s="s" /> Save</button></div></div></Win>;
}
