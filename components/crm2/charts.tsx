"use client";
// Thin-mark SVG charts with hover tooltips (native <title>) and legends — no chart library needed.
import { TONES, type Tone } from "@/app/lib/crm2/config";
import { fmt } from "./ui";

export type Series = { n: string; tone: Tone };
const c = (t: Tone) => TONES[t].mk;
export function Legend({ series }: { series: Series[] }) {
  return <div className="legend">{series.map((s) => <span key={s.n}><i style={{ background: c(s.tone) }} />{s.n}</span>)}</div>;
}
export function Bars({ data, series, h = 190, stacked = true }: { data: { label: string; short?: string; v: number[] }[]; series: Series[]; h?: number; stacked?: boolean }) {
  const W = 560, pl = 30, pb = 22, pt = 8;
  const max = Math.max(1, ...data.map((d) => (stacked ? d.v.reduce((a, b) => a + b, 0) : Math.max(...d.v))));
  const bw = (W - pl) / Math.max(1, data.length); const sc = (v: number) => ((h - pb - pt) * v) / max;
  return <svg viewBox={`0 0 ${W} ${h}`} width="100%" style={{ maxHeight: h + 40 }}>
    {[0, 0.5, 1].map((f) => { const y = h - pb - (h - pb - pt) * f; return <g key={f}><line x1={pl} x2={W} y1={y} y2={y} stroke="#EEE" /><text x={pl - 5} y={y + 3} fontSize={9} textAnchor="end" fill="#9CA3AF">{Math.round(max * f)}</text></g>; })}
    {data.map((d, i) => { const x = pl + i * bw + bw * 0.18, w = Math.max(3, bw * 0.64); let y = h - pb;
      return <g key={i}>{stacked ? d.v.map((v, k) => { const hh = sc(v); if (hh <= 0) return null; y -= hh; return <rect key={k} x={x} y={y + (k ? 1 : 0)} width={w} height={Math.max(0, hh - (k ? 1 : 0))} rx={k === d.v.length - 1 ? 3 : 0} fill={c(series[k].tone)}><title>{`${d.label} · ${series[k].n}: ${fmt(v)}`}</title></rect>; })
        : d.v.map((v, k) => { const sw = w / d.v.length, hh = sc(v); return <rect key={k} x={x + k * sw} y={h - pb - hh} width={sw - 1.5} height={hh} rx={2} fill={c(series[k].tone)}><title>{`${d.label} · ${series[k].n}: ${fmt(v)}`}</title></rect>; })}
        {(data.length <= 16 || i % Math.ceil(data.length / 12) === 0) && <text x={x + w / 2} y={h - 7} fontSize={9} textAnchor="middle" fill="#6B7280">{d.short ?? d.label}</text>}</g>; })}
  </svg>;
}
export function HStack({ rows, series, lw = 120 }: { rows: { label: string; v: number[] }[]; series: Series[]; lw?: number }) {
  const max = Math.max(1, ...rows.map((r) => r.v.reduce((a, b) => a + b, 0)));
  return <div style={{ display: "flex", flexDirection: "column", gap: 7, padding: "4px 2px" }}>{rows.map((r) => { const tot = r.v.reduce((a, b) => a + b, 0); return (
    <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5 }}><span style={{ width: lw, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontWeight: 700 }}>{r.label}</span>
      <div style={{ flex: 1, display: "flex", gap: 2, height: 14, background: "#F4F4F6", borderRadius: 4, overflow: "hidden" }}>{r.v.map((v, k) => v ? <i key={k} title={`${series[k].n}: ${v}`} style={{ display: "block", width: `${(100 * v) / max}%`, background: c(series[k].tone) }} /> : null)}</div>
      <b style={{ width: 34, textAlign: "right" }}>{fmt(tot)}</b></div>); })}</div>;
}
export function Donut({ parts, center, sub = "TOTAL" }: { parts: { n: string; v: number; tone: Tone }[]; center?: string; sub?: string }) {
  const R = 52, r = 34, tot = Math.max(1, parts.reduce((a, p) => a + p.v, 0));
  const pt = (rr: number, a: number) => `${60 + rr * Math.cos(a)} ${60 + rr * Math.sin(a)}`;
  const arcs = parts.reduce<{ a: number; out: { n: string; d: string; tone: Tone; v: number }[] }>((acc, p) => { if (!p.v) return acc; const a0 = acc.a, a1 = a0 + (2 * Math.PI * p.v) / tot - 0.02; const L = a1 - a0 > Math.PI ? 1 : 0; return { a: a1 + 0.02, out: [...acc.out, { n: p.n, tone: p.tone, v: p.v, d: `M${pt(R, a0)} A${R} ${R} 0 ${L} 1 ${pt(R, a1)} L${pt(r, a1)} A${r} ${r} 0 ${L} 0 ${pt(r, a0)}Z` }] }; }, { a: -Math.PI / 2, out: [] }).out;
  return <div style={{ display: "flex", alignItems: "center", gap: 12 }}><svg viewBox="0 0 120 120" width={120} height={120}>{arcs.map((a) => <path key={a.n} d={a.d} fill={c(a.tone)}><title>{`${a.n}: ${a.v} (${Math.round((a.v / tot) * 100)}%)`}</title></path>)}
    <text x={60} y={60} textAnchor="middle" fontSize={18} fontWeight={700}>{center ?? fmt(tot)}</text><text x={60} y={74} textAnchor="middle" fontSize={8} fill="#6B7280">{sub}</text></svg>
    <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5 }}>{parts.map((p) => <span key={p.n} style={{ display: "flex", alignItems: "center", gap: 6 }}><i style={{ width: 9, height: 9, borderRadius: 3, background: c(p.tone) }} />{p.n}<b style={{ marginLeft: "auto", paddingLeft: 10 }}>{fmt(p.v)}</b></span>)}</div></div>;
}
export function Spark({ v, tone = "lav" }: { v: number[]; tone?: Tone }) {
  const max = Math.max(1, ...v), W = 90, H = 22; const pts = v.map((x, i) => `${(i * W) / Math.max(1, v.length - 1)},${H - 2 - ((H - 4) * x) / max}`).join(" ");
  return <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}><polyline points={pts} fill="none" stroke={c(tone)} strokeWidth={1.6} /></svg>;
}
export function PctBar({ a, t, tone = "rose" }: { a: number; t: number; tone?: Tone }) {
  const p = Math.min(100, Math.round((a / Math.max(1, t)) * 100));
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span className="bar-in" style={{ width: 60 }}><i style={{ width: `${p}%`, background: c(a >= t ? "sage" : tone) }} /></span>{a}/{t}</span>;
}
export const Gap = ({ g }: { g: number }) => <span className={g >= 0 ? "gap-pos" : "gap-neg"}>{g >= 0 ? `+${g} surplus` : `${g} deficit`}</span>;
