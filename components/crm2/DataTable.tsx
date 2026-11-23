"use client";
// Altus CRM v2 — ONE table component for every table: group by, select all, change any field in bulk,
// sort ↑↓, local search, columns (show/hide/reorder/drag), freeze, pagination, export (Excel/PDF/Email/WhatsApp/Print),
// find duplicates, transpose, minimise/maximise, and Table / Kanban / Cards / Calendar views of the same rows.
// On phones (<768 px) the same component renders swipeable toolbar + cards.
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { TONES, type Tone } from "@/app/lib/crm2/config";
import { Icon, Pill, Popover, Win, fdate, fmt, toneStyle, usePop, useToast } from "./ui";
import { exportExcel, printTable, summaryText, toXlsxBase64, waLink } from "./export";
import { v2ShareEmail } from "@/app/crm/actions";

export type Opt = { v: string; l: string; tone?: Tone };
export type Col<T> = {
  k: string; label: string; w?: number; num?: boolean; group?: false;
  val?: (r: T) => unknown; text?: (r: T) => string; render?: (r: T) => ReactNode;
  groupVal?: (r: T) => string; groupTone?: (r: T) => Tone;
  edit?: { options?: Opt[] | (() => Opt[]); type?: "text" | "date" };
};
export type BulkAction<T> = { icon: string; label: string; run: (rows: T[], clear: () => void) => void | Promise<void> };
export type View = "table" | "kanban" | "cards" | "calendar";
export type TableProps<T extends { id: string }> = {
  id: string; rows: T[]; cols: Col<T>[]; title?: ReactNode; hidden?: string[]; frozen?: number; group?: string | null; sort?: { k: string; dir: 1 | -1 } | null;
  views?: View[]; kanban?: { key: (r: T) => string; cols: { k: string; label: string; tone: Tone }[]; onMove?: (r: T, k: string) => void };
  calendarKey?: (r: T) => string | null; rowTone?: (r: T) => Tone; onOpen?: (r: T, list: T[]) => void; bulk?: BulkAction<T>[];
  /** Rendered in the bulk bar right after "Change field" and before `bulk` (e.g. WhatsApp) — for a bulk action
   * that needs its own modal/panel rather than the single-field popover "Change field" gives you. */
  bulkExtra?: (rows: T[], clear: () => void) => ReactNode;
  onEdit?: (rows: T[], col: Col<T>, value: string) => Promise<void> | void; q?: string; dupeKey?: (r: T) => string; exportName?: string; card?: (r: T) => ReactNode; minHeight?: number;
  /** A "+N" badge next to the first column — click to expand child rows beneath it, same columns as the parent
   * row (e.g. a lead's secondary contacts: same product/stage/etc., only name/phone/email differ). */
  detail?: { count: (r: T) => number; rows: (r: T) => T[] };
};
/** Local search text for tables that do not receive `q` directly (e.g. dashboard tables). */
export const TableQCtx = createContext("");
type Prefs = { hidden: string[]; order: string[]; frozen: number; size: number; group: string | null; view: View };

export function useIsMobile() {
  const [m, setM] = useState(false);
  useEffect(() => { const q = window.matchMedia("(max-width: 767px)"); const f = () => setM(q.matches); f(); q.addEventListener("change", f); return () => q.removeEventListener("change", f); }, []);
  return m;
}
const textOf = <T,>(c: Col<T>, r: T): string => { const v = c.text ? c.text(r) : c.val ? c.val(r) : (r as Record<string, unknown>)[c.k]; return v == null ? "" : typeof v === "string" && /^\d{4}-\d\d-\d\dT/.test(v) ? fdate(v) : String(v); };
const sortVal = <T,>(c: Col<T>, r: T): unknown => { const v = c.val ? c.val(r) : (r as Record<string, unknown>)[c.k]; return typeof v === "string" && /^\d{4}-\d\d-\d\dT/.test(v) ? new Date(v).getTime() : v; };
const groupOf = <T,>(c: Col<T>, r: T) => (c.groupVal ? c.groupVal(r) : textOf(c, r)) || "—";

export function DataTable<T extends { id: string }>(p: TableProps<T>) {
  const toast = useToast(); const mobile = useIsMobile(); const pop = usePop(); const ctxQ = useContext(TableQCtx); const query = p.q ?? ctxQ;
  const [prefs, setPrefs] = useState<Prefs>(() => {
    const base: Prefs = { hidden: p.hidden ?? [], order: p.cols.map((c) => c.k), frozen: p.frozen ?? 2, size: 25, group: p.group ?? null, view: "table" };
    if (typeof window === "undefined") return base;
    try { const s = JSON.parse(localStorage.getItem("crm2:t:" + p.id) || "null"); return s ? { ...base, ...s } : base; } catch { return base; }
  });
  useEffect(() => { try { localStorage.setItem("crm2:t:" + p.id, JSON.stringify(prefs)); } catch {} }, [p.id, prefs]);
  const set = (x: Partial<Prefs>) => setPrefs((s) => ({ ...s, ...x }));
  const [sort, setSort] = useState(p.sort ?? null); const [page, setPage] = useState(1); const [sel, setSel] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set()); const [dupes, setDupes] = useState(false); const [min, setMin] = useState(false); const [maxed, setMaxed] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpanded = (id: string) => setExpanded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const [win, setWin] = useState<null | "transpose" | "email" | "whatsapp">(null); const [mShow, setMShow] = useState(20);
  const dragCol = useRef<string | null>(null);

  const colMap = useMemo(() => Object.fromEntries(p.cols.map((c) => [c.k, c])), [p.cols]);
  const order = useMemo(() => [...prefs.order.filter((k) => colMap[k]), ...p.cols.map((c) => c.k).filter((k) => !prefs.order.includes(k))], [prefs.order, colMap, p.cols]);
  const cols = order.map((k) => colMap[k]).filter((c) => !prefs.hidden.includes(c.k));
  const view: View = (p.views ?? ["table"]).includes(prefs.view) ? prefs.view : "table";

  const all = useMemo(() => {
    let rows = p.rows; const q = query.trim().toLowerCase();
    if (q) rows = rows.filter((r) => p.cols.some((c) => textOf(c, r).toLowerCase().includes(q)));
    if (dupes && p.dupeKey) { const cnt = new Map<string, number>(); rows.forEach((r) => cnt.set(p.dupeKey!(r), (cnt.get(p.dupeKey!(r)) ?? 0) + 1)); rows = rows.filter((r) => (cnt.get(p.dupeKey!(r)) ?? 0) > 1); }
    if (sort && colMap[sort.k]) { const c = colMap[sort.k]; rows = [...rows].sort((a, b) => { const x = sortVal(c, a), y = sortVal(c, b); if (x == null || x === "") return 1; if (y == null || y === "") return -1; return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * sort.dir; }); }
    return rows;
  }, [p.rows, query, p.cols, p.dupeKey, dupes, sort, colMap]);
  const size = prefs.size || all.length || 1; const pages = Math.max(1, Math.ceil(all.length / size)); const pg = Math.min(page, pages);
  const pageRows = mobile ? all.slice(0, mShow) : all.slice((pg - 1) * size, pg * size);
  const selected = all.filter((r) => sel.has(r.id)); const allPageSel = pageRows.length > 0 && pageRows.every((r) => sel.has(r.id));
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const clear = () => setSel(new Set());
  const editable = p.cols.filter((c) => c.edit);
  const exportCols = cols.map((c) => ({ label: c.label, text: (r: Record<string, unknown>) => textOf(c, r as unknown as T) }));
  const exportRows = (sel.size ? selected : all) as unknown as Record<string, unknown>[];
  const title = p.exportName ?? "Altus CRM export";

  let left = 34; const fz: Record<string, number> = {};
  if (!mobile) cols.forEach((c, i) => { if (i < prefs.frozen) { fz[c.k] = left; left += c.w ?? 140; } });

  const cell = (c: Col<T>, r: T): ReactNode => c.render ? c.render(r) : textOf(c, r) || "—";
  const groups = (rows: T[]) => { if (!prefs.group || !colMap[prefs.group]) return null; const gc = colMap[prefs.group]; const g = new Map<string, T[]>(); rows.forEach((r) => { const k = groupOf(gc, r); g.set(k, [...(g.get(k) ?? []), r]); }); const counts = new Map<string, number>(); all.forEach((r) => { const k = groupOf(gc, r); counts.set(k, (counts.get(k) ?? 0) + 1); }); return { gc, g, counts }; };

  const applyEdit = async (rows: T[], c: Col<T>, v: string) => { if (!p.onEdit) return toast("This field is read-only here"); await p.onEdit(rows, c, v); };

  /* ---------- toolbar ---------- */
  const tools = (
    <div className={mobile ? "mtools" : "tbl-tools"}>
      {p.title && !mobile && <h3 style={{ margin: "0 6px 0 2px", fontSize: 13.5, whiteSpace: "nowrap" }}>{p.title}</h3>}
      <button className="btn sm" onClick={(e) => pop.open(e.currentTarget, "group")}><Icon n="group" s="s" /> {prefs.group && colMap[prefs.group] ? <>Group: <span style={{ color: "var(--red)" }}>{colMap[prefs.group].label}</span></> : "Group by"} <Icon n="chevd" s="s" /></button>
      {mobile ? <button className="btn sm" onClick={(e) => pop.open(e.currentTarget, "sort")}><Icon n="sort" s="s" /> {sort && colMap[sort.k] ? `${colMap[sort.k].label} ${sort.dir > 0 ? "↑" : "↓"}` : "Sort"}</button> : null}
      <label className="selall"><input type="checkbox" className="cb" checked={allPageSel} onChange={() => setSel((s) => { const n = new Set(s); const on = !allPageSel; pageRows.forEach((r) => (on ? n.add(r.id) : n.delete(r.id))); return n; })} /> Select all</label>
      {!sel.size && <button className="btn sm ghost" style={{ color: "var(--muted)" }} onClick={() => setSel(new Set(all.map((r) => r.id)))}>All {fmt(all.length)}</button>}
      {(p.views?.length ?? 0) > 1 && <div className="vtog">{p.views!.filter((v) => !(mobile && v === "cards")).map((v) => <button key={v} className={view === v ? "on" : ""} onClick={() => set({ view: v })}><Icon n={{ table: "table", kanban: "kanban", cards: "cards", calendar: "cal" }[v]} s="s" />{view === v ? " " + v[0].toUpperCase() + v.slice(1) : ""}</button>)}</div>}
      <span className="sp" />
      {view === "table" && !mobile && <div className="pg">Rows <select value={prefs.size} onChange={(e) => { set({ size: +e.target.value }); setPage(1); }}>{[20, 25, 50, 100, 0].map((n) => <option key={n} value={n}>{n || "All"}</option>)}</select>
        <button className="sb" onClick={() => setPage(Math.max(1, pg - 1))}><Icon n="chevl" s="s" /></button> Page <input value={pg} onChange={(e) => setPage(Math.max(1, +e.target.value || 1))} /> of {pages} <button className="sb" onClick={() => setPage(Math.min(pages, pg + 1))}><Icon n="chevr" s="s" /></button></div>}
      <button className="btn sm" onClick={(e) => pop.open(e.currentTarget, "cols")}><Icon n="cols" s="s" /> {mobile ? "Fields" : "Columns"} <span style={{ background: "var(--line-2)", borderRadius: 5, padding: "0 5px" }}>{cols.length}</span></button>
      {!mobile && <button className="btn sm" onClick={(e) => pop.open(e.currentTarget, "freeze")}><Icon n="pin" s="s" /> Freeze {prefs.frozen}</button>}
      <button className="btn sm" onClick={(e) => pop.open(e.currentTarget, "export")}><Icon n="download" s="s" /> Export <Icon n="chevd" s="s" /></button>
      <div className="secbtns"><button className="sb" title="Minimise" onClick={() => setMin((m) => !m)}><Icon n="min" s="s" /></button><button className="sb" title="Maximise" onClick={() => setMaxed((m) => !m)}><Icon n="max" s="s" /></button></div>
    </div>);

  /* ---------- bulk bar ---------- */
  const bulk = sel.size > 0 && (
    <div className={mobile ? "mbulk" : "bulk"}><span className="n">{sel.size} selected</span>
      <button className="btn sm" onClick={(e) => pop.open(e.currentTarget, "bulkfield")}><Icon n="edit" s="s" /> Change field <Icon n="chevd" s="s" /></button>
      {p.bulkExtra?.(selected, clear)}
      {(p.bulk ?? []).map((b) => <button key={b.label} className="btn sm" onClick={() => b.run(selected, clear)}><Icon n={b.icon} s="s" /> {b.label}</button>)}
      <button className="btn sm" onClick={(e) => pop.open(e.currentTarget, "export")}><Icon n="download" s="s" /> Export selected</button>
      <span style={{ flex: 1 }} /><button className="btn sm ghost" onClick={clear}>Clear</button></div>);

  /* ---------- bodies ---------- */
  let body: ReactNode;
  if (view === "kanban" && p.kanban) {
    const kb = p.kanban;
    body = <div className="kan">{kb.cols.map((kc) => { const items = all.filter((r) => kb.key(r) === kc.k); return (
      <div key={kc.k} className="kcol"><div className="kcol-h" style={{ borderTopColor: TONES[kc.tone].mk }}><Pill tone={kc.tone}>{kc.label}</Pill><span style={{ marginLeft: "auto", color: "var(--muted)" }}>{items.length}</span></div>
        <div className="kcol-b" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { const id = e.dataTransfer.getData("text/id"); const r = all.find((x) => x.id === id); if (r && kb.onMove) kb.onMove(r, kc.k); }}>
          {items.slice(0, 80).map((r) => <div key={r.id} className="kcard" draggable onDragStart={(e) => e.dataTransfer.setData("text/id", r.id)} onClick={() => p.onOpen?.(r, all)}>{p.card ? p.card(r) : <><b>{cell(cols[0], r)}</b>{cols.slice(1, 4).map((c) => <span key={c.k} style={{ color: "var(--muted)" }}>{cell(c, r)}</span>)}</>}</div>)}
          {items.length > 80 && <div style={{ textAlign: "center", color: "var(--muted)", fontSize: 11 }}>+{items.length - 80} more</div>}</div></div>); })}</div>;
  } else if (view === "calendar" && p.calendarKey) {
    const ck = p.calendarKey; const t = new Date(); const first = new Date(t.getFullYear(), t.getMonth(), 1); const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
    body = <><div style={{ padding: "10px 10px 0", fontWeight: 700 }}>{first.toLocaleString("en-IN", { month: "long", year: "numeric" })}</div><div className="cal">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="lbl" style={{ padding: "2px 4px" }}>{d}</div>)}
      {Array.from({ length: 35 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); const k = d.toDateString(); const items = all.filter((r) => { const v = ck(r); return v && new Date(v).toDateString() === k; }); return (
        <div key={i} className={`cd ${k === t.toDateString() ? "today" : ""}`} style={{ opacity: d.getMonth() !== t.getMonth() ? 0.45 : 1 }}><span className="dn">{d.getDate()}</span>
          {items.slice(0, 3).map((r) => <span key={r.id} className="ce" style={toneStyle(p.rowTone?.(r) ?? "slate")} onClick={() => p.onOpen?.(r, all)}>{textOf(cols[0], r)}</span>)}{items.length > 3 && <span style={{ color: "var(--muted)", fontSize: 10 }}>+{items.length - 3} more</span>}</div>); })}</div></>;
  } else if (view === "cards" && !mobile) {
    body = <div className="cgrid">{all.slice(0, 150).map((r) => <div key={r.id} className="card" style={{ padding: 11, gap: 6, cursor: "pointer", boxShadow: `inset 3px 0 0 ${p.rowTone ? TONES[p.rowTone(r)].mk : "transparent"}` }} onClick={() => p.onOpen?.(r, all)}>{p.card ? p.card(r) : <><b>{cell(cols[0], r)}</b>{cols.slice(1, 5).map((c) => <span key={c.k} style={{ fontSize: 11.5 }}><span style={{ color: "var(--faint)" }}>{c.label}: </span>{cell(c, r)}</span>)}</>}</div>)}</div>;
  } else if (!all.length) {
    body = <div className="empty"><Icon n="search" s="l" /><div style={{ marginTop: 6 }}>No records match these filters.</div></div>;
  } else if (mobile) {
    const card = (r: T) => <div key={r.id} className={`mrow ${sel.has(r.id) ? "sel" : ""}`} style={{ ["--lbc" as string]: p.rowTone ? TONES[p.rowTone(r)].mk : "transparent" }} onClick={(e) => { if (!(e.target as HTMLElement).closest("input")) p.onOpen?.(r, all); }}>
      <input type="checkbox" className="cb" checked={sel.has(r.id)} onChange={() => toggle(r.id)} /><div className="mrow-b"><div className="mt">{cell(cols[0], r)}</div><div className="mm">{cols.slice(1).filter((c) => c.k !== "contact").slice(0, 6).map((c) => <span key={c.k}><i>{c.label}</i>{cell(c, r)}</span>)}</div></div></div>;
    const gr = groups(pageRows);
    body = <><div className="mlist">{gr ? [...gr.g.entries()].map(([k, rs]) => <div key={k}><div className="mgrp">{gr.gc.groupTone ? <Pill tone={gr.gc.groupTone(rs[0])}>{k}</Pill> : k}<span style={{ color: "var(--muted)", fontWeight: 400 }}>{gr.counts.get(k)}</span></div>{rs.map(card)}</div>) : pageRows.map(card)}</div>
      {all.length > pageRows.length ? <button className="btn more" onClick={() => setMShow((n) => n + 30)}>Show more · {pageRows.length} of {all.length}</button> : <div className="empty" style={{ padding: 12 }}>{all.length} records</div>}</>;
  } else {
    const gr = groups(pageRows);
    const childTr = (child: T, parentId: string, idx: number) => <tr key={parentId + ":c" + idx} className="child-row" onDoubleClick={() => p.onOpen?.(child, all)}>
      <td className="c0 frz" style={{ left: 0 }} />
      {cols.map((c, i) => <td key={c.k} className={`${c.num ? "num" : ""} ${fz[c.k] != null ? "frz" + (i === prefs.frozen - 1 ? " last" : "") : ""}`} style={fz[c.k] != null ? { left: fz[c.k] } : undefined}>{i === 0 ? <span className="lname" style={{ paddingLeft: 18 }}>{cell(c, child)}</span> : cell(c, child)}</td>)}</tr>;
    const tr = (r: T): ReactNode[] => { const tn = p.rowTone?.(r); const dCount = p.detail?.count(r) ?? 0; const isOpen = expanded.has(r.id);
      const main = <tr key={r.id} className={`${sel.has(r.id) ? "sel" : ""} ${tn ? "lb" : ""}`} style={tn ? ({ ["--lbc" as string]: TONES[tn].mk }) : undefined} onDoubleClick={() => p.onOpen?.(r, all)}>
        <td className="c0 frz" style={{ left: 0 }}><input type="checkbox" className="cb" checked={sel.has(r.id)} onChange={() => toggle(r.id)} /></td>
        {cols.map((c, i) => <td key={c.k} className={`${c.num ? "num" : ""} ${fz[c.k] != null ? "frz" + (i === prefs.frozen - 1 ? " last" : "") : ""} ${c.edit ? "edit" : ""}`} style={fz[c.k] != null ? { left: fz[c.k] } : undefined}
          onClick={(e) => { if (i === 0) return p.onOpen?.(r, all); if (c.edit) pop.open(e.currentTarget, `cell:${r.id}:${c.k}`); }}>{i === 0 ? <span className="lname">{cell(c, r)}{dCount > 0 && <button type="button" className={`exp-badge ${isOpen ? "on" : ""}`} onClick={(e) => { e.stopPropagation(); toggleExpanded(r.id); }} title={`${dCount} more contact${dCount > 1 ? "s" : ""}`}>+{dCount}</button>}</span> : cell(c, r)}</td>)}</tr>;
      const children = p.detail && isOpen ? p.detail.rows(r).map((child, idx) => childTr(child, r.id, idx)) : [];
      return [main, ...children]; };
    body = <table className="t"><thead><tr><th className="c0 frz" style={{ left: 0 }} />
      {cols.map((c, i) => { const s = sort?.k === c.k; return <th key={c.k} draggable onDragStart={() => (dragCol.current = c.k)} onDragOver={(e) => e.preventDefault()} onDrop={() => { const f = dragCol.current; if (!f || f === c.k) return; const o = order.filter((k) => k !== f); o.splice(o.indexOf(c.k), 0, f); set({ order: o }); }}
        className={`${c.num ? "num" : ""} ${s ? "sorted" : ""} ${fz[c.k] != null ? "frz" + (i === prefs.frozen - 1 ? " last" : "") : ""}`} style={{ ...(fz[c.k] != null ? { left: fz[c.k] } : {}), ...(c.w ? { minWidth: c.w } : {}) }}>
        <span className="h" onClick={() => setSort(!s ? { k: c.k, dir: 1 } : sort!.dir === 1 ? { k: c.k, dir: -1 } : null)}>{c.label} <span className="srt">{s ? (sort!.dir > 0 ? "▲" : "▼") : "↕"}</span></span></th>; })}</tr></thead>
      <tbody>{gr ? [...gr.g.entries()].flatMap(([k, rs]) => [<tr key={"g" + k} className="grp" onClick={() => setCollapsed((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; })}><td className="c0 frz" style={{ left: 0 }}>{collapsed.has(k) ? "▸" : "▾"}</td><td colSpan={cols.length}>{gr.gc.label}: {gr.gc.groupTone ? <Pill tone={gr.gc.groupTone(rs[0])}>{k}</Pill> : k} <span className="gc">{gr.counts.get(k)} records</span></td></tr>, ...(collapsed.has(k) ? [] : rs.flatMap(tr))]) : pageRows.flatMap(tr)}</tbody></table>;
  }

  /* ---------- popovers ---------- */
  const close = pop.close; const key = pop.key; let popBody: ReactNode = null; let popW: number | undefined; let popRight = false;
  if (key === "group") popBody = <><div className="ph">Group rows by</div><button className={`pi ${!prefs.group ? "on" : ""}`} onClick={() => { set({ group: null }); close(); }}>No grouping</button>{p.cols.filter((c) => c.group !== false).map((c) => <button key={c.k} className={`pi ${prefs.group === c.k ? "on" : ""}`} onClick={() => { set({ group: c.k }); setCollapsed(new Set()); close(); }}>{c.label}</button>)}</>;
  if (key === "sort") popBody = <><div className="ph">Sort by</div><button className="pi" onClick={() => { setSort(null); close(); }}>None</button>{p.cols.map((c) => <div key={c.k} className="pi">{c.label}<span className="r"><button onClick={() => { setSort({ k: c.k, dir: 1 }); close(); }}>↑</button>&nbsp;&nbsp;<button onClick={() => { setSort({ k: c.k, dir: -1 }); close(); }}>↓</button></span></div>)}</>;
  if (key === "freeze") popBody = <><div className="ph">Freeze first columns</div>{[0, 1, 2, 3, 4].map((n) => <button key={n} className={`pi ${prefs.frozen === n ? "on" : ""}`} onClick={() => { set({ frozen: n }); close(); }}>{n ? `First ${n}` : "None"}</button>)}<div style={{ padding: "6px 8px", color: "var(--muted)", fontSize: 11 }}>Tip: drag headers to reorder.</div></>;
  if (key === "cols") { popW = 280; popRight = true; popBody = <><div className="ph">Show columns</div><div style={{ display: "flex", gap: 8, padding: "0 8px 6px", fontSize: 11.5 }}><b>{p.cols.length - prefs.hidden.length} shown</b><span style={{ flex: 1 }} /><button style={{ color: "var(--red)", fontWeight: 700 }} onClick={() => set({ hidden: [] })}>Select all</button><button style={{ color: "var(--muted)", fontWeight: 700 }} onClick={() => set({ hidden: p.cols.slice(1).map((c) => c.k) })}>Clear</button></div>
    {order.map((k) => <div key={k} className="colrow"><input type="checkbox" className="cb" checked={!prefs.hidden.includes(k)} onChange={(e) => set({ hidden: e.target.checked ? prefs.hidden.filter((x) => x !== k) : [...prefs.hidden, k] })} /><span style={{ flex: 1 }}>{colMap[k].label}</span>
      <button className="sb" onClick={() => { const o = [...order]; const i = o.indexOf(k); if (i > 0) { [o[i - 1], o[i]] = [o[i], o[i - 1]]; set({ order: o }); } }}><Icon n="up" s="s" /></button><button className="sb" onClick={() => { const o = [...order]; const i = o.indexOf(k); if (i < o.length - 1) { [o[i + 1], o[i]] = [o[i], o[i + 1]]; set({ order: o }); } }}><Icon n="down" s="s" /></button></div>)}</>; }
  if (key === "export") { popRight = true; popBody = <><div className="ph">Export / share {sel.size ? `(${sel.size} selected)` : ""}</div>
    <button className="pi" onClick={async () => { close(); await exportExcel(title, exportCols, exportRows); toast(`Excel: ${exportRows.length} rows`); }}><Icon n="xls" /> Export to Excel</button>
    <button className="pi" onClick={() => { close(); if (!printTable(title, exportCols, exportRows)) toast("Allow pop-ups to save as PDF"); }}><Icon n="file" /> Export to PDF</button>
    <button className="pi" onClick={() => { close(); setWin("email"); }}><Icon n="mail" /> Email</button><button className="pi" onClick={() => { close(); setWin("whatsapp"); }}><Icon n="wa" /> WhatsApp</button>
    <button className="pi" onClick={() => { close(); printTable(title, exportCols, exportRows); }}><Icon n="print" /> Print</button><hr />
    {p.dupeKey && <button className="pi" onClick={() => { close(); setDupes(true); setPage(1); }}><Icon n="dup" /> Find duplicates</button>}
    <button className="pi" onClick={() => { close(); setWin("transpose"); }}><Icon n="transpose" /> Transpose view</button></>; }
  if (key === "bulkfield") { popW = 260; popBody = <BulkField cols={editable} onApply={async (c, v) => { close(); await applyEdit(selected, c, v); clear(); }} count={sel.size} />; }
  if (key.startsWith("cell:")) { const [, rid, ck] = key.split(":"); const r = all.find((x) => x.id === rid); const c = colMap[ck]; if (r && c) popBody = <CellEdit col={c} row={r} onPick={async (v) => { close(); await applyEdit([r], c, v); }} />; }

  return <div className={`card grow ${min ? "min" : ""} ${maxed ? "maxed" : ""}`} style={{ minHeight: p.minHeight }}>
    {tools}{bulk}<div className="tw">{body}</div>
    {view === "table" && !mobile && <div className="tbl-foot">Showing {all.length ? (pg - 1) * size + 1 : 0}–{Math.min(pg * size, all.length)} of {fmt(all.length)}{dupes && <> · <b style={{ color: "var(--red)" }}>duplicates only</b> <button className="btn sm ghost" onClick={() => setDupes(false)}>show all</button></>}
      <div className="pgn"><button onClick={() => setPage(Math.max(1, pg - 1))}>‹ Prev</button>{pagerNums(pg, pages).map((n, i) => n < 0 ? <button key={"e" + i} disabled>…</button> : <button key={n} className={n === pg ? "on" : ""} onClick={() => setPage(n)}>{n}</button>)}<button onClick={() => setPage(Math.min(pages, pg + 1))}>Next ›</button></div></div>}
    {pop.anchor && popBody && <Popover anchor={pop.anchor} onClose={close} width={popW} right={popRight}>{popBody}</Popover>}
    {win === "transpose" && <Win title="Transpose view — fields as rows" onClose={() => setWin(null)}><div className="win-b"><table className="t"><thead><tr><th>Field</th>{all.slice(0, 12).map((r) => <th key={r.id}>{textOf(cols[0], r)}</th>)}</tr></thead><tbody>{cols.map((c) => <tr key={c.k}><td><b>{c.label}</b></td>{all.slice(0, 12).map((r) => <td key={r.id}>{cell(c, r)}</td>)}</tr>)}</tbody></table></div></Win>}
    {win === "whatsapp" && <ShareWhatsApp title={title} text={summaryText(title, exportCols, exportRows)} onClose={() => setWin(null)} />}
    {win === "email" && <ShareEmail title={title} text={summaryText(title, exportCols, exportRows)} make={() => toXlsxBase64(title, exportCols, exportRows)} onClose={() => setWin(null)} />}
  </div>;
}
function pagerNums(p: number, n: number) { const s = [...new Set([1, 2, p - 1, p, p + 1, n - 1, n].filter((x) => x >= 1 && x <= n))].sort((a, b) => a - b); const out: number[] = []; s.forEach((x, i) => { if (i && x - s[i - 1] > 1) out.push(-i); out.push(x); }); return out; }
function opts<T>(c: Col<T>): Opt[] | null { const o = c.edit?.options; return o ? (typeof o === "function" ? o() : o) : null; }
function CellEdit<T>({ col, row, onPick }: { col: Col<T>; row: T; onPick: (v: string) => void }) {
  const [q, setQ] = useState(""); const [txt, setTxt] = useState(textOf(col, row)); const o = opts(col);
  if (!o) return <><div className="ph">Edit {col.label}</div><input type={col.edit?.type === "date" ? "date" : "text"} value={txt} onChange={(e) => setTxt(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onPick(txt)} autoFocus /><button className="btn red sm" style={{ width: "100%", marginTop: 6 }} onClick={() => onPick(txt)}>Save</button></>;
  return <><div className="ph">{col.label}</div><input type="text" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />{o.filter((x) => x.l.toLowerCase().includes(q.toLowerCase())).map((x) => <button key={x.v} className="pi" onClick={() => onPick(x.v)}>{x.tone ? <Pill tone={x.tone}>{x.l}</Pill> : x.l}</button>)}</>;
}
function BulkField<T>({ cols, onApply, count }: { cols: Col<T>[]; onApply: (c: Col<T>, v: string) => void; count: number }) {
  const [k, setK] = useState(cols[0]?.k ?? ""); const c = cols.find((x) => x.k === k); const o = c ? opts(c) : null; const [v, setV] = useState("");
  if (!cols.length) return <div className="ph">No editable fields on this table</div>;
  return <><div className="ph">Change a field for {count} records</div><select value={k} onChange={(e) => { setK(e.target.value); setV(""); }}>{cols.map((x) => <option key={x.k} value={x.k}>{x.label}</option>)}</select>
    {o ? <select value={v} onChange={(e) => setV(e.target.value)}><option value="">Choose…</option>{o.map((x) => <option key={x.v} value={x.v}>{x.l}</option>)}</select> : <input type={c?.edit?.type === "date" ? "date" : "text"} placeholder="New value" value={v} onChange={(e) => setV(e.target.value)} />}
    <button className="btn red sm" style={{ width: "100%", marginTop: 6 }} disabled={!v || !c} onClick={() => c && onApply(c, v)}>Apply to {count}</button></>;
}
export function ShareWhatsApp({ title, text, onClose, phone = "" }: { title: string; text: string; onClose: () => void; phone?: string }) {
  const [num, setNum] = useState(phone); const [t, setT] = useState(text); const toast = useToast();
  return <Win small title={<><Icon n="wa" /> WhatsApp — {title}</>} onClose={onClose}><div className="win-b" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
    <div className="fld"><label>Send to (number with country code)</label><input value={num} onChange={(e) => setNum(e.target.value)} placeholder="9198XXXXXXXX" /></div>
    <div className="fld"><label>Message</label><textarea style={{ width: "100%", height: 200, border: 0, outline: 0 }} value={t} onChange={(e) => setT(e.target.value)} /></div>
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}><span style={{ color: "var(--muted)", fontSize: 11.5, flex: 1 }}>Opens WhatsApp with this summary. Connect a WhatsApp Business API later to send PDFs directly.</span>
      <button className="btn" onClick={() => navigator.clipboard?.writeText(t).then(() => toast("Copied"))}><Icon n="copy" s="s" /> Copy</button><a className="btn red" href={waLink(num, t)} target="_blank" rel="noopener noreferrer"><Icon n="wa" s="s" /> Open WhatsApp</a></div></div></Win>;
}
export function ShareEmail({ title, text, make, onClose }: { title: string; text: string; make: () => Promise<string>; onClose: () => void }) {
  const [to, setTo] = useState(""); const [subj, setSubj] = useState(`${title} — ${new Date().toLocaleDateString("en-IN")}`); const [t, setT] = useState(text); const [busy, setBusy] = useState(false); const toast = useToast();
  return <Win small title={<><Icon n="mail" /> Email — {title}</>} onClose={onClose}><div className="win-b" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
    <div className="fld"><label>To (comma separated)</label><input value={to} onChange={(e) => setTo(e.target.value)} /></div><div className="fld"><label>Subject</label><input value={subj} onChange={(e) => setSubj(e.target.value)} /></div>
    <div className="fld"><label>Message · Excel file attached</label><textarea style={{ width: "100%", height: 170, border: 0, outline: 0 }} value={t} onChange={(e) => setT(e.target.value)} /></div>
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}><span style={{ color: "var(--muted)", fontSize: 11.5, flex: 1 }}>Sends through your own SMTP (Settings → Email).</span>
      <button className="btn red" disabled={busy} onClick={async () => { setBusy(true); const b64 = await make(); const r = await v2ShareEmail({ to, subject: subj, text: t, attachments: [{ filename: title.replace(/\W+/g, "_") + ".xlsx", base64: b64, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }] }); setBusy(false); toast(r.message); if (r.ok) onClose(); }}><Icon n="send" s="s" /> {busy ? "Sending…" : "Send"}</button></div></div></Win>;
}
