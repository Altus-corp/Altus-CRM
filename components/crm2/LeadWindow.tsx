"use client";
// Lead detail opens as a WINDOW (not a side panel): ‹ › moves through the list it came from; maximise; tabs.
import { useEffect, useMemo, useState } from "react";
import { BUCKET, TONES } from "@/app/lib/crm2/config";
import { displayProductCode } from "@/app/lib/product-display";
import { isChannelPartnerColumn } from "@/app/lib/channel-partner";
import { ChannelPartnerSelect } from "@/components/leads/channel-partner-select";
import { daysSince, missingFields, nextAction, personName, priorityScore, winProb } from "@/app/lib/crm2/metrics";
import type { LeadRow } from "@/app/lib/crm2/types";
import { v2AddNote, v2LeadChannelPartners, v2LogCall, v2UpdateField } from "@/app/crm/actions";
import { useCrm } from "./context";
import { dialLead, ownerOpts } from "./leads";
import { Avatar, Icon, Pill, Win, fdate, fdt, toneStyle, useToast } from "./ui";

type Activity = { id: string; activity_type: string; note: string | null; created_at: string; actor: string; follow_up_at: string | null };
const TABS = [["overview", "Overview"], ["products", "Products & stages"], ["activity", "Activity"], ["calls", "Calls"], ["meetings", "Meetings"], ["notes", "Notes"], ["ai", "AI insights"]] as const;

export function LeadWindow({ row, list, onClose, onNav }: { row: LeadRow; list: LeadRow[]; onClose: () => void; onNav: (r: LeadRow) => void }) {
  const ctx = useCrm(); const { ws } = ctx; const toast = useToast();
  const l = ws.rows.find((x) => x.id === row.id) ?? row; const b = BUCKET[l.bucket]; const miss = missingFields(ws, l);
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("overview"); const [actsFor, setActsFor] = useState<{ key: string; data: Activity[] } | null>(null); const actKey = `${l.id}:${tab}`; const acts = actsFor?.key === actKey ? actsFor.data : null; const [logOpen, setLogOpen] = useState(false); const [note, setNote] = useState(""); const [dialling, setDialling] = useState(false);
  useEffect(() => { if (tab !== "activity" && tab !== "notes") return; let live = true; fetch(`/api/leads/${l.leadId}/activities?assignmentId=${l.id}`).then((r) => r.json()).then((j) => live && setActsFor({ key: actKey, data: j.ok ? j.activities : [] })).catch(() => live && setActsFor({ key: actKey, data: [] })); return () => { live = false; }; }, [tab, l.leadId, l.id, actKey]);
  const idx = list.findIndex((x) => x.id === l.id); const nav = (d: number) => { if (!list.length) return; onNav(list[(idx + d + list.length) % list.length]); };
  const save = async (field: string, value: string, patch: Partial<LeadRow>) => { const r = await v2UpdateField([{ leadId: l.leadId, assignmentId: l.id }], field, value); toast(r.message); if (r.ok) ctx.patchRows([l.id], patch); };
  const coreFields: [string, string, string][] = [["Lead no.", "no", l.no], ["First name", "first_name", l.first], ["Last name", "last_name", l.last], ["Cell number", "phone", l.phone], ["Email", "email", l.email], ["Company", "company_name", l.company]];
  const customCols = ws.columns.filter((c) => c.source === "custom" && c.key !== "company_name");
  const isFieldMissing = (lab: string, key: string, val: string) => miss.includes(lab) || (ws.hygiene.some((h) => h.key === key) && !val && ["followup", "negotiation", "closing"].includes(l.bucket));
  const [cp, setCp] = useState<{ ids: string[]; names: string } | null>(null);
  const hasChannelPartnerColumn = customCols.some((c) => isChannelPartnerColumn({ field_key: c.key, label: c.label }));
  useEffect(() => { if (!hasChannelPartnerColumn) return; let live = true; v2LeadChannelPartners(l.leadId).then((r) => live && setCp(r)).catch(() => live && setCp({ ids: [], names: "" })); return () => { live = false; }; }, [l.leadId, hasChannelPartnerColumn]);
  const others = useMemo(() => ws.rows.filter((x) => x.leadId === l.leadId), [ws.rows, l.leadId]);
  const calls = ws.calls.filter((c) => c.a === l.id); const meets = ws.meetings.filter((m) => m.leadId === l.leadId);

  return <Win onClose={onClose} title={<span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}><Avatar name={l.name} /><span>{l.name}{l.isNew && <span className="newtag">NEW</span>}<div style={{ color: "var(--muted)", fontSize: 12, fontWeight: 400 }}>{l.company || "No company"} · {l.phone} · <Pill tone="slate">{displayProductCode(l.product)}</Pill> <Pill tone={b.tone}>{b.label}</Pill></div></span></span>}
    extra={<><button className="btn" disabled={dialling} onClick={() => { setDialling(true); dialLead(l.leadId, l.id, l.phone).then((r) => { toast(r.message); setDialling(false); }); }}><Icon n="phone" s="s" /> {dialling ? "Calling…" : "Call"}</button><a className="btn" href={`https://wa.me/91${l.phone.replace(/\D/g, "").slice(-10)}`} target="_blank" rel="noopener noreferrer"><Icon n="wa" s="s" /> WhatsApp</a>{l.email && <a className="btn" href={`mailto:${l.email}`}><Icon n="mail" s="s" /> Email</a>}
      {ctx.canEdit && <button className="btn red" onClick={() => setLogOpen(true)}><Icon n="check" s="s" /> Log call</button>}<a className="btn" href={`/dashboard/leads?lead=${l.leadId}`} title="Open in classic CRM (meetings, transcripts, attachments)"><Icon n="ext" s="s" /> Classic</a>
      <button className="ib" onClick={() => nav(-1)} title="Previous lead"><Icon n="chevl" /></button><button className="ib" onClick={() => nav(1)} title="Next lead"><Icon n="chevr" /></button></>}>
    <div className="tabs">{TABS.map(([k, t]) => <button key={k} className={`tab ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>{t}</button>)}</div>
    <div className="win-b">
      {tab === "overview" && <div className="lw-grid"><div className="fgrid">
        {coreFields.map(([lab, key, val]) => { const isMiss = isFieldMissing(lab, key, val); return (
          <div key={key} className={`fld ${isMiss ? "miss" : ""}`}><label>{lab}{isMiss ? " · missing" : ""}</label><input defaultValue={val} readOnly={!ctx.canEdit || key === "no"} placeholder={isMiss ? "Needed from follow-up" : "—"} onBlur={(e) => { if (e.target.value !== val) save(key, e.target.value, key === "email" ? { email: e.target.value } : key === "company_name" ? { company: e.target.value } : { custom: { ...l.custom, [key]: e.target.value } }); }} /></div>); })}
        {customCols.map((c) => {
          const val = l.custom[c.key] ?? ""; const isMiss = isFieldMissing(c.label, c.key, val); const disabled = !ctx.canEdit;
          const onSave = (next: string) => { if (next !== val) save(c.key, next, { custom: { ...l.custom, [c.key]: next } }); };
          if (isChannelPartnerColumn({ field_key: c.key, label: c.label })) return <div key={c.key} className={`fld ${isMiss ? "miss" : ""}`}><label>{c.label}{isMiss ? " · missing" : ""}</label>
            {cp ? <ChannelPartnerSelect leadId={l.leadId} assignmentId={l.id} names={cp.names} options={[]} selectedIds={cp.ids} onSaved={(ids) => setCp({ ids, names: cp.names })} /> : <span style={{ color: "var(--faint)" }}>Loading…</span>}</div>;
          return <div key={c.key} className={`fld ${isMiss ? "miss" : ""}`}><label>{c.label}{isMiss ? " · missing" : ""}</label>
            {c.fieldType === "dropdown" ? <select disabled={disabled} defaultValue={val} onChange={(e) => onSave(e.target.value)}><option value="">Select</option>{c.options.map((o) => <option key={o} value={o}>{o}</option>)}</select>
              : c.fieldType === "checkbox" ? <label style={{ marginTop: 4, display: "inline-flex", alignItems: "center", gap: 8 }}><input type="checkbox" disabled={disabled} defaultChecked={val === "true"} onChange={(e) => onSave(e.target.checked ? "true" : "false")} /> Yes</label>
              : c.fieldType === "textarea" || c.fieldType === "long_text" ? <textarea defaultValue={val} readOnly={disabled} placeholder={isMiss ? "Needed from follow-up" : "—"} style={{ minHeight: 70 }} onBlur={(e) => onSave(e.target.value)} />
              : <input type={c.fieldType === "date" ? "date" : c.fieldType === "number" ? "number" : "text"} defaultValue={c.fieldType === "date" ? (Number.isNaN(new Date(val).getTime()) ? "" : new Date(val).toISOString().slice(0, 10)) : val} readOnly={disabled} placeholder={isMiss ? "Needed from follow-up" : "—"} onBlur={(e) => onSave(e.target.value)} />}
          </div>;
        })}
      </div>
        <div className="lw-rail"><div className="tile" style={toneStyle(b.tone)}><span className="tl1"><Icon n="fire" s="s" /> Priority stage</span><span className="tv">{b.label}</span><span className="ts">Focus score {priorityScore(l)} · {l.stage}</span></div>
          <div className="tile" style={toneStyle("aqua")}><span className="tl1"><Icon n="spark" s="s" /> AI read</span><span className="tv">{winProb(l)}% win</span><span className="ts">{nextAction(l)}</span></div>
          <div className="tile" style={toneStyle(miss.length ? "butter" : "mint")}><span className="tl1"><Icon n="db" s="s" /> Data hygiene</span><span className="tv">{miss.length ? `${miss.length} empty` : "Complete"}</span><span className="ts">{miss.join(", ") || "All key fields filled"}</span></div>
          <div className="fld"><label>Next follow-up</label><input type="datetime-local" disabled={!ctx.canEdit} defaultValue={l.nextFollowUp ? new Date(l.nextFollowUp).toISOString().slice(0, 16) : ""} onBlur={(e) => e.target.value && save("nextFollowUp", new Date(e.target.value).toISOString(), { nextFollowUp: new Date(e.target.value).toISOString() })} /></div>
          <div className="fld"><label>Sales person</label><select disabled={!ctx.canEdit} defaultValue={l.owner ?? ""} onChange={(e) => save("owner", e.target.value, { owner: e.target.value })}><option value="">Unassigned</option>{ownerOpts(ws).map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</select></div></div></div>}
      {tab === "products" && <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>{others.map((o) => { const pd = ws.products.find((p) => p.code === o.product); return <div key={o.id} className="panel"><div className="panel-h"><Pill tone="slate">{displayProductCode(o.product)}</Pill><span style={{ color: "var(--muted)", fontWeight: 400 }}>{pd?.name}</span><span style={{ flex: 1 }} />{o.resolution && <Pill tone={BUCKET[o.bucket].tone}>{o.resolution}</Pill>}<span style={{ color: "var(--muted)", fontWeight: 400 }}>{personName(ws, o.owner)}</span></div>
        <div style={{ display: "flex", gap: 6, padding: 12, flexWrap: "wrap" }}>{(pd?.stages ?? []).map((s, i) => { const cur = pd!.stages.findIndex((x) => x.name === o.stage); return <span key={s.id} className="pill" style={{ ...toneStyle(i === cur ? "mint" : i < cur ? "sage" : "slate"), padding: "5px 12px" }}>{i < cur ? "✓ " : i === cur ? "● " : ""}{s.name}</span>; })}</div></div>; })}</div>}
      {(tab === "activity" || tab === "notes") && <div className="tl">{tab === "notes" && ctx.canEdit && <div style={{ display: "flex", gap: 8, marginBottom: 10 }}><textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note…" style={{ flex: 1, height: 70, border: "1px solid var(--line)", borderRadius: 9, padding: 10 }} /><button className="btn red" onClick={async () => { const r = await v2AddNote({ leadId: l.leadId, assignmentId: l.id }, note); toast(r.message); if (r.ok) { setNote(""); setTab("activity"); } }}>Save note</button></div>}
        {acts == null ? <div className="empty">Loading…</div> : acts.filter((a) => tab === "activity" || a.activity_type === "note").map((a) => <div key={a.id} className="tli"><span className="tdot" style={{ background: TONES[a.activity_type === "call" ? "sky" : a.activity_type === "note" ? "peach" : "slate"].mk }} /><div><b>{a.activity_type}{a.note ? ` · ${a.note}` : ""}</b><div style={{ color: "var(--muted)", fontSize: 11.5 }}>{fdt(a.created_at)} · {a.actor}{a.follow_up_at ? ` · follow-up ${fdate(a.follow_up_at)}` : ""}</div></div></div>)}{acts && !acts.length && <div className="empty">No activity yet.</div>}</div>}
      {tab === "calls" && <div style={{ padding: 12 }}><table className="t"><thead><tr><th>Date</th><th>Direction</th><th>Status</th><th>Duration</th></tr></thead><tbody>{calls.map((c, i) => <tr key={i}><td>{fdt(c.t)}</td><td>{c.out ? "Outgoing" : "Incoming"}</td><td><Pill tone={c.c ? "mint" : "rose"}>{c.c ? "Connected" : "Not connected"}</Pill></td><td>{c.d ? Math.round(c.d / 60) + " min" : "—"}</td></tr>)}</tbody></table>{!calls.length && <div className="empty">No calls in the last 60 days.</div>}</div>}
      {tab === "meetings" && <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>{meets.map((m, i) => <div key={i} className="panel" style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 10 }}><Pill tone={m.upcoming ? "sky" : "mint"}>{m.upcoming ? "Upcoming" : "Done"}</Pill><b>{m.kind}</b><span>{fdt(m.t)}</span><span style={{ color: "var(--muted)" }}>{personName(ws, m.u)}</span></div>)}{!meets.length && <div className="empty">No meetings. Schedule Zoom / Google Meet from the classic lead view.</div>}</div>}
      {tab === "ai" && <div style={{ padding: 14, display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 10 }}>{([["Win probability", winProb(l) + "%", "mint", "Stage, recency and connects"], ["Next best action", nextAction(l), "aqua", "Do this on the next touch"], ["Risk", (daysSince(l.lastCalledAt) ?? 99) > 7 ? `Going cold — ${l.lastCalledAt ? daysSince(l.lastCalledAt) + " days since last call" : "never called"}` : "Low", (daysSince(l.lastCalledAt) ?? 99) > 7 ? "rose" : "sage", "Recency & follow-up discipline"], ["Missing data", miss.join(", ") || "None", miss.length ? "butter" : "mint", "Fill before the next stage"]] as const).map(([t, v, tn, s]) => <div key={t} className="ins" style={{ borderColor: TONES[tn].bd }}><span className="cat" style={{ color: TONES[tn].ink }}><Icon n="spark" s="s" /> {t}</span><h4>{v}</h4><p>{s}</p></div>)}</div>}
    </div>
    {logOpen && <LogCall onClose={() => setLogOpen(false)} onSave={async (resId, fu, n) => { const r = await v2LogCall({ leadId: l.leadId, assignmentId: l.id }, resId, fu, n); toast(r.message); if (r.ok) { const x = ws.resolutions.find((q) => q.id === resId); ctx.patchRows([l.id], { resolutionId: resId, resolution: x?.name ?? null, bucket: x?.bucket ?? l.bucket, lastCalledAt: new Date().toISOString(), nextFollowUp: fu || l.nextFollowUp }); setLogOpen(false); } }} />}
  </Win>;
}
function LogCall({ onClose, onSave }: { onClose: () => void; onSave: (resolutionId: string, followUpAt: string, note: string) => void }) {
  const { ws } = useCrm(); const [res, setRes] = useState(""); const [fu, setFu] = useState(""); const [n, setN] = useState("");
  return <Win small title="Log call" onClose={onClose}><div className="win-b" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
    <div className="lbl">Resolution</div><div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{ws.resolutions.map((r) => <button key={r.id} className="pill" style={{ ...toneStyle(BUCKET[r.bucket].tone), padding: "5px 10px", outline: res === r.id ? "2px solid var(--ink)" : "none" }} onClick={() => setRes(r.id)}>{r.name}</button>)}</div>
    <div className="fld"><label>Next follow-up</label><input type="datetime-local" value={fu} onChange={(e) => setFu(e.target.value)} /></div><div className="fld"><label>Note</label><input value={n} onChange={(e) => setN(e.target.value)} placeholder="What happened?" /></div>
    <button className="btn red" disabled={!res} onClick={() => onSave(res, fu ? new Date(fu).toISOString() : "", n)}>Save</button></div></Win>;
}
