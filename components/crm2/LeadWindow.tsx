"use client";
// Lead detail opens as a WINDOW (not a side panel): ‹ › moves through the list it came from; maximise; tabs.
import { useEffect, useMemo, useState } from "react";
import { BUCKET, TONES } from "@/app/lib/crm2/config";
import { displayProductCode } from "@/app/lib/product-display";
import { isChannelPartnerColumn } from "@/app/lib/channel-partner";
import { ChannelPartnerSelect } from "@/components/leads/channel-partner-select";
import { ZoomMeetingModal } from "@/components/leads/zoom-meeting-modal";
import { GoogleMeetModal } from "@/components/leads/google-meet-modal";
import { ContactsTab } from "./ContactsTab";
import { computedFieldValue, daysSince, missingFields, nextAction, personName, priorityScore, winProb } from "@/app/lib/crm2/metrics";
import type { LeadRow } from "@/app/lib/crm2/types";
import { v2AddNote, v2AddProduct, v2LeadChannelPartners, v2LogCall, v2UpdateField } from "@/app/crm/actions";
import { useCrm } from "./context";
import { assignableOpts, canAssignOwner, dialLead } from "./leads";
import { Avatar, Icon, Pill, Win, fdate, fdt, toneStyle, useToast } from "./ui";

type Activity = { id: string; activity_type: string; note: string | null; created_at: string; actor: string; follow_up_at: string | null };
type MeetingDetail = { id: string; kind: "Zoom" | "Google Meet"; topic: string; notes: string | null; startTime: string; durationMinutes: number; joinUrl: string; calendarUrl?: string | null; recordingUrl: string | null; transcriptText: string | null; transcriptUrl: string | null };
const TABS = [["overview", "Overview"], ["products", "Products & stages"], ["activity", "Activity"], ["calls", "Calls"], ["meetings", "Meetings"], ["notes", "Notes"], ["ai", "AI insights"], ["contacts", "Add Contact"]] as const;

export function LeadWindow({ row, list, onClose, onNav }: { row: LeadRow; list: LeadRow[]; onClose: () => void; onNav: (r: LeadRow) => void }) {
  const ctx = useCrm(); const { ws } = ctx; const toast = useToast();
  const l = ws.rows.find((x) => x.id === row.id) ?? row; const b = BUCKET[l.bucket]; const miss = missingFields(ws, l);
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("overview"); const [actsFor, setActsFor] = useState<{ key: string; data: Activity[] } | null>(null); const actKey = `${l.id}:${tab}`; const acts = actsFor?.key === actKey ? actsFor.data : null; const [logOpen, setLogOpen] = useState(false); const [note, setNote] = useState(""); const [dialling, setDialling] = useState(false); const [gmeetOpen, setGmeetOpen] = useState(false); const [zoomOpen, setZoomOpen] = useState(false);
  const [meetingsFor, setMeetingsFor] = useState<{ key: string; data: MeetingDetail[] } | null>(null); const meetingDetails = meetingsFor?.key === actKey ? meetingsFor.data : null; const [meetingsNonce, setMeetingsNonce] = useState(0); const [transcriptFor, setTranscriptFor] = useState<MeetingDetail | null>(null);
  useEffect(() => { if (tab !== "activity" && tab !== "notes") return; let live = true; fetch(`/api/leads/${l.leadId}/activities?assignmentId=${l.id}`).then((r) => r.json()).then((j) => live && setActsFor({ key: actKey, data: j.ok ? j.activities : [] })).catch(() => live && setActsFor({ key: actKey, data: [] })); return () => { live = false; }; }, [tab, l.leadId, l.id, actKey]);
  useEffect(() => { if (tab !== "meetings") return; let live = true; fetch(`/api/leads/${l.leadId}/meetings?assignmentId=${l.id}`).then((r) => r.json()).then((j) => live && setMeetingsFor({ key: actKey, data: j.ok ? j.meetings : [] })).catch(() => live && setMeetingsFor({ key: actKey, data: [] })); return () => { live = false; }; }, [tab, l.leadId, l.id, actKey, meetingsNonce]);
  const idx = list.findIndex((x) => x.id === l.id); const nav = (d: number) => { if (!list.length) return; onNav(list[(idx + d + list.length) % list.length]); };
  const save = async (field: string, value: string, patch: Partial<LeadRow>) => { const r = await v2UpdateField([{ leadId: l.leadId, assignmentId: l.id }], field, value); toast(r.message); if (r.ok) ctx.patchRows([l.id], patch); };
  const coreFields: [string, string, string][] = [["Lead no.", "no", l.no], ["First name", "first_name", l.first], ["Last name", "last_name", l.last], ["Cell number", "phone", l.phone], ["Email", "email", l.email], ["Company", "company_name", l.company]];
  // Some configs have a stray duplicate custom column for a field that's already a core field above
  // (same label, different field_key) — matched by label like classic CRM's own lead-no/acquisition-date checks.
  const DUP_CORE_LABELS = new Set(["lead no", "lead number", "last name", "company name"]);
  const customCols = ws.columns.filter((c) => c.source === "custom" && c.key !== "company_name" && !DUP_CORE_LABELS.has(c.label.trim().toLowerCase()));
  const isFieldMissing = (lab: string, key: string, val: string) => miss.includes(lab) || (ws.hygiene.some((h) => h.key === key) && !val && ["followup", "negotiation", "closing"].includes(l.bucket));
  const [cp, setCp] = useState<{ ids: string[]; names: string } | null>(null);
  const hasChannelPartnerColumn = customCols.some((c) => isChannelPartnerColumn({ field_key: c.key, label: c.label }));
  useEffect(() => { if (!hasChannelPartnerColumn) return; let live = true; v2LeadChannelPartners(l.leadId).then((r) => live && setCp(r)).catch(() => live && setCp({ ids: [], names: "" })); return () => { live = false; }; }, [l.leadId, hasChannelPartnerColumn]);
  const others = useMemo(() => ws.rows.filter((x) => x.leadId === l.leadId), [ws.rows, l.leadId]);
  const curProduct = ws.products.find((p) => p.code === l.product);
  const calls = ws.calls.filter((c) => c.a === l.id);

  return <Win onClose={onClose} title={<span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}><Avatar name={l.name} /><span>{l.name}{l.isNew && <span className="newtag">NEW</span>}<div style={{ color: "var(--muted)", fontSize: 12, fontWeight: 400 }}>{l.company || "No company"} · {l.phone} · <Pill tone="slate">{displayProductCode(l.product)}</Pill> <Pill tone={b.tone}>{b.label}</Pill></div></span></span>}
    extra={<><button className="btn" disabled={dialling} onClick={() => { setDialling(true); dialLead(l.leadId, l.id, l.phone).then((r) => { toast(r.message); setDialling(false); }); }}><Icon n="phone" s="s" /> {dialling ? "Calling…" : "Call"}</button><a className="btn" href={`https://wa.me/91${l.phone.replace(/\D/g, "").slice(-10)}`} target="_blank" rel="noopener noreferrer"><Icon n="wa" s="s" /> WhatsApp</a>{l.email && <a className="btn" href={`mailto:${l.email}`}><Icon n="mail" s="s" /> Email</a>}<button className="btn" onClick={() => setGmeetOpen(true)} title="Schedule a Google Meet"><Icon n="video" s="s" /> Google Meet</button><button className="btn" onClick={() => setZoomOpen(true)} title="Schedule a Zoom meeting"><Icon n="video" s="s" /> Zoom</button>
      {ctx.canEdit && <button className="btn red" onClick={() => setLogOpen(true)}><Icon n="check" s="s" /> Log call</button>}<a className="btn" href={`/dashboard/leads?lead=${l.leadId}`} title="Open in classic CRM (meetings, transcripts, attachments)"><Icon n="ext" s="s" /> Classic</a>
      <button className="ib" onClick={() => nav(-1)} title="Previous lead"><Icon n="chevl" /></button><button className="ib" onClick={() => nav(1)} title="Next lead"><Icon n="chevr" /></button></>}>
    <div className="tabs">{TABS.map(([k, t]) => <button key={k} className={`tab ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>{t}</button>)}</div>
    <div className="win-b">
      {tab === "overview" && <div className="lw-grid"><div className="fgrid">
        {coreFields.map(([lab, key, val]) => { const isMiss = isFieldMissing(lab, key, val); return (
          <div key={key} className={`fld ${isMiss ? "miss" : ""}`}><label>{lab}{isMiss ? " · missing" : ""}</label><input defaultValue={val} readOnly={!ctx.canEdit || key === "no"} placeholder={isMiss ? "Needed from follow-up" : "—"} onBlur={(e) => { if (e.target.value !== val) { const v = e.target.value; const patch: Partial<LeadRow> = key === "email" ? { email: v } : key === "company_name" ? { company: v } : key === "first_name" ? { first: v, name: [v, l.last].filter(Boolean).join(" ") } : key === "last_name" ? { last: v, name: [l.first, v].filter(Boolean).join(" ") } : key === "phone" ? { phone: v } : { custom: { ...l.custom, [key]: v } }; save(key, v, patch); } }} /></div>); })}
        {customCols.map((c) => {
          if (c.computedFrom.length) { const computed = computedFieldValue(l, c.computedFrom); return <div key={c.key} className="fld"><label>{c.label}</label><input value={computed || "—"} readOnly title="Derived automatically — edit the fields it's built from instead" /></div>; }
          if (c.label.trim().toLowerCase() === "lead acquisition date") return <div key={c.key} className="fld"><label>{c.label}</label><input value={fdate(l.createdAt)} readOnly title="The date this lead was created" /></div>;
          const val = l.custom[c.key] ?? ""; const isMiss = isFieldMissing(c.label, c.key, val); const disabled = !ctx.canEdit;
          const onSave = (next: string) => { if (next !== val) save(c.key, next, { custom: { ...l.custom, [c.key]: next } }); };
          if (isChannelPartnerColumn({ field_key: c.key, label: c.label })) return <div key={c.key} className={`fld ${isMiss ? "miss" : ""}`}><label>{c.label}{isMiss ? " · missing" : ""}</label>
            {cp ? <ChannelPartnerSelect leadId={l.leadId} assignmentId={l.id} names={cp.names} options={[]} selectedIds={cp.ids} onSaved={(ids) => setCp({ ids, names: ids.map((id) => personName(ws, id)).join(", ") })} /> : <span style={{ color: "var(--faint)" }}>Loading…</span>}</div>;
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
          <div className="fld"><label>Product</label><select value={l.id} onChange={(e) => { const r = others.find((o) => o.id === e.target.value); if (r) onNav(r); }}>{others.map((o) => <option key={o.id} value={o.id}>{displayProductCode(o.product)}</option>)}</select>
            {ctx.canEdit && <div style={{ marginTop: 6 }}><AddMoreProducts leadId={l.leadId} assignmentId={l.id} already={others.map((o) => o.product)} onAdded={() => ctx.refresh()} /></div>}</div>
          <div className="fld"><label>Stage</label><select disabled={!ctx.canEdit || !curProduct?.stages.length} value={l.stageId ?? ""} onChange={(e) => { const st = curProduct?.stages.find((s) => s.id === e.target.value); if (st) save("stageId", st.id, { stage: st.name, stageId: st.id }); }}><option value="" disabled>Choose…</option>{(curProduct?.stages ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          <div className="fld"><label>Next follow-up</label><input type="datetime-local" disabled={!ctx.canEdit} defaultValue={l.nextFollowUp ? new Date(l.nextFollowUp).toISOString().slice(0, 16) : ""} onBlur={(e) => e.target.value && save("nextFollowUp", new Date(e.target.value).toISOString(), { nextFollowUp: new Date(e.target.value).toISOString() })} /></div>
          <div className="fld"><label>Sales person</label><select disabled={!ctx.canEdit || !canAssignOwner(ws)} defaultValue={l.owner ?? ""} onChange={(e) => save("owner", e.target.value, { owner: e.target.value })}><option value="">Unassigned</option>{assignableOpts(ws).map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</select></div></div></div>}
      {tab === "products" && <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>{others.map((o) => { const pd = ws.products.find((p) => p.code === o.product); return <div key={o.id} className="panel"><div className="panel-h"><Pill tone="slate">{displayProductCode(o.product)}</Pill><span style={{ color: "var(--muted)", fontWeight: 400 }}>{pd?.name}</span><span style={{ flex: 1 }} />{o.resolution && <Pill tone={BUCKET[o.bucket].tone}>{o.resolution}</Pill>}<span style={{ color: "var(--muted)", fontWeight: 400 }}>{personName(ws, o.owner)}</span></div>
        <div style={{ display: "flex", gap: 6, padding: 12, flexWrap: "wrap" }}>{(pd?.stages ?? []).map((s, i) => { const cur = pd!.stages.findIndex((x) => x.name === o.stage); return <span key={s.id} className="pill" style={{ ...toneStyle(i === cur ? "mint" : i < cur ? "sage" : "slate"), padding: "5px 12px" }}>{i < cur ? "✓ " : i === cur ? "● " : ""}{s.name}</span>; })}</div></div>; })}
        {ctx.canEdit && <AddMoreProducts leadId={l.leadId} assignmentId={l.id} already={others.map((o) => o.product)} onAdded={() => ctx.refresh()} />}</div>}
      {(tab === "activity" || tab === "notes") && <div className="tl">{tab === "notes" && ctx.canEdit && <div style={{ display: "flex", gap: 8, marginBottom: 10 }}><textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note…" style={{ flex: 1, height: 70, border: "1px solid var(--line)", borderRadius: 9, padding: 10 }} /><button className="btn red" onClick={async () => { const r = await v2AddNote({ leadId: l.leadId, assignmentId: l.id }, note); toast(r.message); if (r.ok) { setNote(""); setTab("activity"); } }}>Save note</button></div>}
        {acts == null ? <div className="empty">Loading…</div> : acts.filter((a) => tab === "activity" || a.activity_type === "note").map((a) => <div key={a.id} className="tli"><span className="tdot" style={{ background: TONES[a.activity_type === "call" ? "sky" : a.activity_type === "note" ? "peach" : "slate"].mk }} /><div><b>{a.activity_type}{a.note ? ` · ${a.note}` : ""}</b><div style={{ color: "var(--muted)", fontSize: 11.5 }}>{fdt(a.created_at)} · {a.actor}{a.follow_up_at ? ` · follow-up ${fdate(a.follow_up_at)}` : ""}</div></div></div>)}{acts && !acts.length && <div className="empty">No activity yet.</div>}</div>}
      {tab === "calls" && <div style={{ padding: 12 }}><table className="t"><thead><tr><th>Date</th><th>Direction</th><th>Status</th><th>Duration</th></tr></thead><tbody>{calls.map((c, i) => <tr key={i}><td>{fdt(c.t)}</td><td>{c.out ? "Outgoing" : "Incoming"}</td><td><Pill tone={c.c ? "mint" : "rose"}>{c.c ? "Connected" : "Not connected"}</Pill></td><td>{c.d ? Math.round(c.d / 60) + " min" : "—"}</td></tr>)}</tbody></table>{!calls.length && <div className="empty">No calls in the last 60 days.</div>}</div>}
      {tab === "meetings" && <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>{meetingDetails === null ? <div className="empty">Loading…</div> : meetingDetails.map((m) => { const upcoming = new Date(m.startTime).getTime() > new Date(ws.generatedAt).getTime(); return <div key={m.id} className="panel" style={{ flexDirection: "column", gap: 6, padding: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}><Pill tone={upcoming ? "sky" : "mint"}>{upcoming ? "Upcoming" : "Done"}</Pill><b>{m.kind}</b><span>{m.topic}</span><span style={{ color: "var(--muted)" }}>{fdt(m.startTime)} · {m.durationMinutes}m</span></div>
        {m.notes && <div style={{ color: "var(--muted)", fontSize: 12.5 }}>{m.notes}</div>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {upcoming && <a className="btn" href={m.joinUrl} target="_blank" rel="noopener noreferrer"><Icon n="video" s="s" /> Join</a>}
          {m.recordingUrl ? <a className="btn" href={m.recordingUrl} target="_blank" rel="noopener noreferrer"><Icon n="play" s="s" /> Watch recording</a> : !upcoming && <span style={{ color: "var(--muted)", fontSize: 12.5, alignSelf: "center" }}>Recording not available yet</span>}
          {m.transcriptText ? <button type="button" className="btn" onClick={() => setTranscriptFor(m)}><Icon n="note" s="s" /> View transcript</button> : m.transcriptUrl ? <a className="btn" href={m.transcriptUrl} target="_blank" rel="noopener noreferrer"><Icon n="note" s="s" /> View transcript</a> : !upcoming && <span style={{ color: "var(--muted)", fontSize: 12.5, alignSelf: "center" }}>Transcript not available yet</span>}
        </div>
      </div>; })}{meetingDetails !== null && !meetingDetails.length && <div className="empty">No meetings. Schedule a Zoom or Google Meet from the header above.</div>}</div>}
      {tab === "ai" && <div style={{ padding: 14, display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 10 }}>{([["Win probability", winProb(l) + "%", "mint", "Stage, recency and connects"], ["Next best action", nextAction(l), "aqua", "Do this on the next touch"], ["Risk", (daysSince(l.lastCalledAt) ?? 99) > 7 ? `Going cold — ${l.lastCalledAt ? daysSince(l.lastCalledAt) + " days since last call" : "never called"}` : "Low", (daysSince(l.lastCalledAt) ?? 99) > 7 ? "rose" : "sage", "Recency & follow-up discipline"], ["Missing data", miss.join(", ") || "None", miss.length ? "butter" : "mint", "Fill before the next stage"]] as const).map(([t, v, tn, s]) => <div key={t} className="ins" style={{ borderColor: TONES[tn].bd }}><span className="cat" style={{ color: TONES[tn].ink }}><Icon n="spark" s="s" /> {t}</span><h4>{v}</h4><p>{s}</p></div>)}</div>}
      {tab === "contacts" && <ContactsTab leadId={l.leadId} assignmentId={l.id} ws={ws} readOnly={!ctx.canEdit} />}
    </div>
    {logOpen && <LogCall onClose={() => setLogOpen(false)} onSave={async (resId, fu, n) => { const r = await v2LogCall({ leadId: l.leadId, assignmentId: l.id }, resId, fu, n); toast(r.message); if (r.ok) { const x = ws.resolutions.find((q) => q.id === resId); ctx.patchRows([l.id], { resolutionId: resId, resolution: x?.name ?? null, bucket: x?.bucket ?? l.bucket, lastCalledAt: new Date().toISOString(), nextFollowUp: fu || l.nextFollowUp }); setLogOpen(false); } }} />}
    {transcriptFor && <Win small title={`Transcript · ${transcriptFor.kind} · ${transcriptFor.topic}`} onClose={() => setTranscriptFor(null)}><div className="win-b" style={{ padding: 14 }}><pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 13, lineHeight: 1.5, margin: 0 }}>{transcriptFor.transcriptText}</pre></div></Win>}
    {gmeetOpen && <GoogleMeetModal leadId={l.leadId} assignmentId={l.id} leadName={l.name} onClose={() => setGmeetOpen(false)} onScheduled={() => { ctx.refresh(); setMeetingsNonce((n) => n + 1); }} />}
    {zoomOpen && <ZoomMeetingModal leadId={l.leadId} assignmentId={l.id} leadName={l.name} onClose={() => setZoomOpen(false)} onScheduled={() => { ctx.refresh(); setMeetingsNonce((n) => n + 1); }} />}
  </Win>;
}
/** Multi-select "Add product" — pick several at once (same checkbox-multi-select the classic Add-lead form uses),
 * each becomes a new product assignment; the lead's existing products, stages and owner are untouched. */
function AddMoreProducts({ leadId, assignmentId, already, onAdded }: { leadId: string; assignmentId: string; already: string[]; onAdded: () => void }) {
  const { ws } = useCrm(); const toast = useToast();
  const [sel, setSel] = useState<Set<string>>(new Set()); const [busy, setBusy] = useState(false);
  const options = ws.products.filter((p) => p.code !== "AMBASSADOR" && !already.includes(p.code));
  if (!options.length) return null;
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return <div className="panel" style={{ padding: 12, gap: 8 }}>
    <span className="lbl">Add product</span>
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{options.map((p) => <button key={p.id} type="button" className={`ptab ${sel.has(p.id) ? "on" : ""}`} onClick={() => toggle(p.id)}>{displayProductCode(p.code)}</button>)}</div>
    <button className="btn red sm" disabled={!sel.size || busy} onClick={async () => {
      setBusy(true); const msgs: string[] = [];
      for (const pid of sel) msgs.push((await v2AddProduct([{ leadId, assignmentId }], pid)).message);
      setBusy(false); toast(msgs.join(" · ")); setSel(new Set()); onAdded();
    }}>{busy ? "Adding…" : `Add ${sel.size || ""}`}</button>
  </div>;
}
function LogCall({ onClose, onSave }: { onClose: () => void; onSave: (resolutionId: string, followUpAt: string, note: string) => void }) {
  const { ws } = useCrm(); const [res, setRes] = useState(""); const [fu, setFu] = useState(""); const [n, setN] = useState("");
  return <Win small title="Log call" onClose={onClose}><div className="win-b" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
    <div className="lbl">Resolution</div><div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{ws.resolutions.map((r) => <button key={r.id} className="pill" style={{ ...toneStyle(BUCKET[r.bucket].tone), padding: "5px 10px", outline: res === r.id ? "2px solid var(--ink)" : "none" }} onClick={() => setRes(r.id)}>{r.name}</button>)}</div>
    <div className="fld"><label>Next follow-up</label><input type="datetime-local" value={fu} onChange={(e) => setFu(e.target.value)} /></div><div className="fld"><label>Note</label><input value={n} onChange={(e) => setN(e.target.value)} placeholder="What happened?" /></div>
    <button className="btn red" disabled={!res} onClick={() => onSave(res, fu ? new Date(fu).toISOString() : "", n)}>Save</button></div></Win>;
}
