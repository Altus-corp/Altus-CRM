"use client";
// Filter bar (one row, carousel, clear all, local search) and mini KPI chips (count first, then title).
import { useRef, useState, type ReactNode } from "react";
import { PERIODS, TONES } from "@/app/lib/crm2/config";
import type { FilterDef, FilterState, Kpi } from "./leads";
import { Icon, Popover, fmt, usePop } from "./ui";

export function FilterBar<T>({ defs, rows, state, setState, q, setQ, lead, trail }: { defs: FilterDef<T>[]; rows: T[]; state: FilterState; setState: (s: FilterState) => void; q: string; setQ: (q: string) => void; lead?: ReactNode; trail?: ReactNode }) {
  const [min, setMin] = useState(false); const car = useRef<HTMLDivElement>(null); const pop = usePop();
  const [searchOpen, setSearchOpen] = useState(false);
  const active = defs.filter((d) => { const v = state[d.k]; return v && ("period" in v || v.size > 0); });
  if (min) return <div className="bar can-hide"><button className="fchip" onClick={() => setMin(false)}><Icon n="funnel" s="s" /> Filters {active.length ? `(${active.length})` : ""} <Icon n="chevd" s="s" /></button></div>;
  const d = defs.find((x) => x.k === pop.key);
  return <div className="bar boxed can-hide">{lead}
    {defs.length > 0 && <><button className="carr" onClick={() => car.current?.scrollBy({ left: -300, behavior: "smooth" })}><Icon n="chevl" s="s" /></button>
    <div className="carousel" ref={car}>{defs.map((x) => { const v = state[x.k]; const on = !!v && ("period" in v || v.size > 0); const lab = !on ? x.label : "period" in v! ? `${x.label}: ${PERIODS.find((p) => p.key === (v as { period: string }).period)?.label}` : `${x.label} (${(v as Set<string>).size})`;
      return <button key={x.k} className={`fchip ${on ? "on" : ""}`} onClick={(e) => pop.open(e.currentTarget, x.k)}><Icon n={x.icon} s="s" />{lab}{on ? <span className="x" onClick={(e) => { e.stopPropagation(); const n = { ...state }; delete n[x.k]; setState(n); }}><Icon n="x" s="s" /></span> : <Icon n="chevd" s="s" />}</button>; })}</div>
    <button className="carr" onClick={() => car.current?.scrollBy({ left: 300, behavior: "smooth" })}><Icon n="chevr" s="s" /></button></>}
    {active.length > 0 && <button className="clearall" onClick={() => setState({})}>Clear all ({active.length})</button>}
    {trail}
    <span style={{ flex: 1 }} />
    {searchOpen || q ? <div className="lsearch"><Icon n="search" s="s" /><input autoFocus placeholder="Search this table…" value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => { if (!q) setSearchOpen(false); }} /></div>
      : <button className="sb" title="Search this table" onClick={() => setSearchOpen(true)}><Icon n="search" s="s" /></button>}
    <div className="secbtns"><button className="sb" title="Minimise" onClick={() => setMin(true)}><Icon n="min" s="s" /></button></div>
    {pop.anchor && d && <Popover anchor={pop.anchor} onClose={pop.close} width={260}><FilterPicker def={d} rows={rows} value={state[d.k]} onApply={(v) => { const n = { ...state }; if (v) n[d.k] = v; else delete n[d.k]; setState(n); pop.close(); }} /></Popover>}
  </div>;
}
function FilterPicker<T>({ def, rows, value, onApply }: { def: FilterDef<T>; rows: T[]; value: FilterState[string] | undefined; onApply: (v: FilterState[string] | null) => void }) {
  const [q, setQ] = useState(""); const [sel, setSel] = useState<Set<string>>(new Set(value && !("period" in value) ? value : []));
  if (def.period) return <><div className="ph">{def.label}</div><button className="pi" onClick={() => onApply(null)}>Any time</button>{PERIODS.map((p) => <button key={p.key} className={`pi ${value && "period" in value && value.period === p.key ? "on" : ""}`} onClick={() => onApply({ period: p.key })}>{p.label}</button>)}</>;
  const opts = def.opts ? def.opts(rows) : [];
  return <><div className="ph">{def.label}</div><input type="text" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
    <div style={{ display: "flex", gap: 8, padding: "2px 8px 4px", fontSize: 11.5 }}><button style={{ color: "var(--red)", fontWeight: 700 }} onClick={() => setSel(new Set(opts.map((o) => o.v)))}>Select all</button><button style={{ color: "var(--muted)", fontWeight: 700 }} onClick={() => setSel(new Set())}>Clear</button></div>
    {opts.filter((o) => o.l.toLowerCase().includes(q.toLowerCase())).map((o) => <label key={o.v} className="pi" style={{ cursor: "pointer" }}><input type="checkbox" className="cb" checked={sel.has(o.v)} onChange={() => setSel((s) => { const n = new Set(s); if (n.has(o.v)) n.delete(o.v); else n.add(o.v); return n; })} /> {o.l}<span className="r">{rows.filter((r) => String(def.get(r)) === o.v).length}</span></label>)}
    <button className="btn red sm" style={{ width: "100%", marginTop: 6 }} onClick={() => onApply(sel.size ? sel : null)}>Apply</button></>;
}
export function KpiBar<T>({ kpis, active, onPick }: { kpis: Kpi<T>[]; active: string | null; onPick: (k: string | null) => void }) {
  const [min, setMin] = useState(false);
  if (min) return <div className="bar can-hide"><button className="fchip" onClick={() => setMin(false)}><Icon n="gauge" s="s" /> KPI chips <Icon n="chevd" s="s" /></button></div>;
  return <div className="bar can-hide"><div className="carousel">{kpis.map((k) => { const t = TONES[k.tone]; return <button key={k.k} className={`kchip ${active === k.k ? "on" : ""}`} style={{ background: t.bg, borderColor: t.bd, color: t.ink }} onClick={() => onPick(active === k.k ? null : k.k)}><span className="d" style={{ background: t.mk }} /><b>{fmt(k.n)}</b>{k.label}</button>; })}</div>
    <div className="secbtns"><button className="sb" title="Minimise" onClick={() => setMin(true)}><Icon n="min" s="s" /></button></div></div>;
}
