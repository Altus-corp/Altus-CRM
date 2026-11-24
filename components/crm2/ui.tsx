"use client";
// Altus CRM v2 — primitives: icons, pills, tiles, popover, window, toast.
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { TONES, type Tone } from "@/app/lib/crm2/config";

const P: Record<string, string> = {
  dash: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  megaphone: '<path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15 8a5 5 0 0 1 0 8"/><path d="M18 5a9 9 0 0 1 0 14"/>',
  trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>', users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M21.5 20a6.5 6.5 0 0 0-4-6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>', cap: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/>',
  receipt: '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6"/>', gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v9h14v-9M12 8v13"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>', gauge: '<path d="M4 18a9 9 0 1 1 16 0"/><path d="M12 13l4-4"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>', sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>', plus: '<path d="M12 5v14M5 12h14"/>', upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>', max: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>', min: '<path d="M5 12h14"/>',
  bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 0 0 4 0"/>', chevd: '<path d="M6 9l6 6 6-6"/>', chevr: '<path d="M9 6l6 6-6 6"/>', chevl: '<path d="M15 6l-6 6 6 6"/>', chevu: '<path d="M6 15l6-6 6 6"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>', phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  wa: '<path d="M3 21l1.6-4.7A8.5 8.5 0 1 1 7.8 19.6z"/><path d="M9 9c0 3 2.5 6 6 6l1-1.5-2-1-1 1c-1-.4-2-1.4-2.5-2.5l1-1-1-2z"/>', mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  print: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>', file: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5"/>',
  xls: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5"/><path d="M9 12l4 5M13 12l-4 5"/>', group: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  cols: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16"/>', pin: '<path d="M9 4h6l-1 6 3 3H7l3-3z"/><path d="M12 13v8"/>', table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/>',
  kanban: '<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="10" rx="1"/><rect x="17" y="4" width="4" height="13" rx="1"/>', cards: '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>', sort: '<path d="M8 4v16M4 8l4-4 4 4M16 20V4M12 16l4 4 4-4"/>', up: '<path d="M12 19V5M6 11l6-6 6 6"/>', down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>', archive: '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10h14V9M10 13h4"/>', ban: '<circle cx="12" cy="12" r="9"/><path d="M6 6l12 12"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>', fire: '<path d="M12 21c-4 0-7-3-7-7 0-4 4-6 4-10 3 2 4 4 4 6 1-1 2-2 2-4 3 2 4 5 4 8 0 4-3 7-7 7z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H4a3 3 0 0 0 4 4M16 6h4a3 3 0 0 1-4 4M12 13v4M8 21h8M9 17h6"/>', flag: '<path d="M5 21V4h11l-2 4 2 4H5"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>', funnel: '<path d="M3 4h18l-7 9v6l-4 2v-8z"/>', copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h4"/>',
  transpose: '<path d="M4 8h12l-3-3M20 16H8l3 3"/>', dup: '<rect x="4" y="4" width="11" height="11" rx="2"/><rect x="9" y="9" width="11" height="11" rx="2"/>', check: '<path d="M5 12l5 5 9-10"/>', menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3"/>', play: '<circle cx="12" cy="12" r="9"/><path d="M10 8l6 4-6 4z"/>', note: '<path d="M5 3h10l4 4v14H5z"/><path d="M9 12h6M9 16h6"/>', key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-1-1.5-1-2.5 1-1.5 2-1.5h2a4 4 0 0 0 4-4c0-4.5-4-8-9-8z"/>', db: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  dot3: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>', ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  focus: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>', send: '<path d="M4 12l16-8-6 16-3-7z"/>', home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>', refresh: '<path d="M20 11a8 8 0 0 0-14-4.5L4 9M4 4v5h5M4 13a8 8 0 0 0 14 4.5L20 15M20 20v-5h-5"/>',
};
export function Icon({ n, s, className = "" }: { n: string; s?: "s" | "l"; className?: string }) {
  return <svg className={`ic ${s ?? ""} ${className}`} viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: P[n] ?? P.dot3 }} />;
}
export const toneStyle = (t: Tone): CSSProperties => ({ background: TONES[t].bg, borderColor: TONES[t].bd, color: TONES[t].ink });
export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className="pill" style={toneStyle(tone)}><span className="d" style={{ background: TONES[tone].mk }} />{children}</span>;
}
const AVC = ["lav", "sky", "peach", "mint", "rose", "butter", "aqua", "sage"] as Tone[];
/** `photo` (real profile photo, e.g. from WMS attendance) renders over the initials when supplied; initials stay the fallback. */
export function Avatar({ name, photo }: { name: string; photo?: string | null }) {
  let h = 0; for (const ch of name) h = (h * 7 + ch.charCodeAt(0)) % 997; const t = TONES[AVC[h % AVC.length]];
  if (photo) return <span className="av" role="img" aria-label={name} style={{ backgroundImage: `url(${photo})`, backgroundSize: "cover", backgroundPosition: "center" }} />;
  return <span className="av" style={{ background: t.bg, color: t.ink }}>{name.split(" ").map((x) => x[0]).slice(0, 2).join("").toUpperCase()}</span>;
}
export type TileDef = { label: string; value: ReactNode; sub?: ReactNode; tone: Tone; icon?: string; onClick?: () => void };
export function Tiles({ items }: { items: TileDef[] }) {
  const span = Math.max(2, Math.floor(12 / Math.max(1, items.length)));
  return <div className="dgrid" style={{ padding: 0, flex: "none" }}>{items.map((t, i) => (
    <div key={i} className="tile" style={{ gridColumn: `span ${span}`, ...toneStyle(t.tone), cursor: t.onClick ? "pointer" : "default" }} onClick={t.onClick}>
      <span className="tl1">{t.icon && <Icon n={t.icon} s="s" />}{t.label}</span><span className="tv">{t.value}</span>{t.sub != null && <span className="ts">{t.sub}</span>}
    </div>))}</div>;
}

/* ---------- portal root inside .crm2 so scoped styles apply ---------- */
export const PortalCtx = createContext<HTMLElement | null>(null);
export function Portal({ children }: { children: ReactNode }) { const root = useContext(PortalCtx); return root ? createPortal(children, root) : null; }

/* ---------- popover anchored to an element ---------- */
export function Popover({ anchor, onClose, children, width, right }: { anchor: HTMLElement | null; onClose: () => void; children: ReactNode; width?: number; right?: boolean }) {
  const ref = useRef<HTMLDivElement>(null); const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    if (!anchor || !ref.current) return; const r = anchor.getBoundingClientRect(); const d = ref.current;
    let left = right ? r.right - d.offsetWidth : r.left; left = Math.max(8, Math.min(left, innerWidth - d.offsetWidth - 8));
    let top = r.bottom + 6; if (top + d.offsetHeight > innerHeight - 8) top = Math.max(8, r.top - d.offsetHeight - 6); setPos({ left, top });
  }, [anchor, right]);
  useEffect(() => { const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node) && !anchor?.contains(e.target as Node)) onClose(); }; const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); document.addEventListener("mousedown", h); document.addEventListener("keydown", k); return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); }; }, [anchor, onClose]);
  if (!anchor) return null;
  return <Portal><div ref={ref} className="pop" style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, width }}>{children}</div></Portal>;
}
export function usePop() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null); const [key, setKey] = useState<string>("");
  const open = useCallback((el: HTMLElement, k = "") => { setAnchor((a) => (a === el && key === k ? null : el)); setKey(k); }, [key]);
  const close = useCallback(() => setAnchor(null), []);
  return { anchor, key, open, close };
}

/* ---------- window (detail views open as windows, not side panels) ---------- */
export function Win({ title, onClose, children, small, extra }: { title: ReactNode; onClose: () => void; children: ReactNode; small?: boolean; extra?: ReactNode }) {
  const [full, setFull] = useState(false);
  // Blur whatever field is focused before actually closing, so its onBlur-triggered autosave fires first —
  // otherwise Escape (which never touches focus) or a fast click away can close the window mid-edit and drop it.
  const closeSafely = () => { (document.activeElement as HTMLElement | null)?.blur?.(); onClose(); };
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && closeSafely(); document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k); }, [onClose]);
  return <Portal><div className="ov" onMouseDown={(e) => e.target === e.currentTarget && closeSafely()}><div className={`win ${small ? "sm" : ""} ${full ? "full" : ""}`}>
    <div className="win-h"><h2>{title}</h2><span style={{ flex: 1 }} />{extra}<button className="ib" onClick={() => setFull((f) => !f)} title="Maximise"><Icon n="max" /></button><button className="ib" onClick={closeSafely} title="Close"><Icon n="x" /></button></div>
    {children}</div></div></Portal>;
}

/* ---------- toast ---------- */
const ToastCtx = createContext<(m: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastHost({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null); const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((m: string) => { setMsg(m); if (t.current) clearTimeout(t.current); t.current = setTimeout(() => setMsg(null), 2800); }, []);
  return <ToastCtx.Provider value={show}>{children}{msg && <Portal><div className="toast">{msg}</div></Portal>}</ToastCtx.Provider>;
}

export const fmt = (n: number | null | undefined) => (n == null ? "—" : Number(n).toLocaleString("en-IN"));
/** Capitalise the first letter of each word — for raw lowercase data (lead source, etc.) shown as display text. */
export const cap = (s: string | null | undefined) => (s ? s.replace(/\b\p{L}/gu, (c) => c.toUpperCase()) : s ?? "");
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const fdate = (d: string | number | Date | null | undefined) => { if (!d) return "—"; const x = new Date(d); return `${String(x.getDate()).padStart(2, "0")}-${MON[x.getMonth()]}-${x.getFullYear()}`; };
export const fdt = (d: string | null | undefined) => { if (!d) return "—"; const x = new Date(d); return `${fdate(x)} ${String(x.getHours()).padStart(2, "0")}:${String(x.getMinutes()).padStart(2, "0")}`; };
export const ago = (d: string | null | undefined) => { if (!d) return "Never"; const n = Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000); return n <= 0 ? "Today" : n === 1 ? "1 d ago" : `${n} d ago`; };
export const money = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
