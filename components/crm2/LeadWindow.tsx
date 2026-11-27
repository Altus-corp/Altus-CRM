"use client";
// Lead detail opens as a WINDOW (not a side panel): ‹ › moves through the list it came from; maximise; tabs.
import { useEffect, useMemo, useRef, useState } from "react";
import { BUCKET, TONES } from "@/app/lib/crm2/config";
import { displayProductCode } from "@/app/lib/product-display";
import { isChannelPartnerColumn } from "@/app/lib/channel-partner";
import { ChannelPartnerSelect } from "@/components/leads/channel-partner-select";
import { ZoomMeetingModal } from "@/components/leads/zoom-meeting-modal";
import { GoogleMeetModal } from "@/components/leads/google-meet-modal";
import { googleCalendarCreateUrl } from "@/app/lib/google-calendar-link";
import { uploadLeadAttachment, type UploadedLeadFile } from "@/app/lib/lead-attachments-client";
import { VoiceDictationButton } from "@/components/leads/voice-dictation-button";
import { BANT_FIELD_LABELS, BANT_OPTIONS, bantCustomKey, bantToneStyle, type BantField } from "@/app/lib/bant";
import { ContactsTab } from "./ContactsTab";
import { BantConfirm } from "./BantConfirm";
import { LEAD_ADDRESS_COUNTRIES, leadAddressFieldKeyForColumn, locationCities, locationStates } from "@/app/lib/lead-address-fields";
import { computedFieldValue, daysSince, missingFields, personName } from "@/app/lib/crm2/metrics";
import type { LeadRow } from "@/app/lib/crm2/types";
import { v2AddAttachment, v2AddDecisionMakerContact, v2AddNote, v2AddProduct, v2ChangeLeadType, v2CreateProposal, v2LeadChannelPartners, v2LeadProductAssignments, v2RemoveProduct, v2LogCall, v2LogProposalWhatsAppShare, v2SendProposalEmail, v2SetProposalApproval, v2SyncLeadCalls, v2UpdateBant, v2UpdateField } from "@/app/crm/actions";
import { useCrm } from "./context";
import { assignableOpts, canAssignOwner, dialLead } from "./leads";
import { Avatar, Icon, Pill, Popover, Win, fdate, fdt, toneStyle, usePop, useToast } from "./ui";

type Activity = { id: string; activity_type: string; note: string | null; created_at: string; actor: string; follow_up_at: string | null; metadata?: { attachments?: UploadedLeadFile[]; direction?: string | null; duration_seconds?: number | null; started_at?: string | null; connected?: boolean; contact_name?: string | null; matched_phone?: string | null; dialled_number?: string | null } | null };
type MeetingDetail = { id: string; kind: "Zoom" | "Google Meet"; topic: string; notes: string | null; startTime: string; durationMinutes: number; joinUrl: string; calendarUrl?: string | null; recordingUrl: string | null; transcriptText: string | null; transcriptUrl: string | null };
type ProposalRow = { id: string; fileUrl: string; fileName: string; fileSize: number | null; details: string | null; approved: boolean; approvedAt: string | null; createdAt: string };
type ContactOpt = { id: string; name: string; email: string | null; phone: string | null; contactType: "primary" | "secondary" };
const TABS = [["overview", "Overview"], ["products", "Products & Life Cycle"], ["activity", "Activity"], ["calls", "Calls"], ["meetings", "Meetings"], ["notes", "Notes"], ["contacts", "Add Contact"], ["attachments", "Add Attachment"], ["proposals", "Add Proposal"]] as const;

export function LeadWindow({ row, list, onClose, onNav }: { row: LeadRow; list: LeadRow[]; onClose: () => void; onNav: (r: LeadRow) => void }) {
  const ctx = useCrm(); const { ws } = ctx; const toast = useToast();
  const l = ws.rows.find((x) => x.id === row.id) ?? row; const b = BUCKET[l.bucket]; const miss = missingFields(ws, l);
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("overview"); const [actsFor, setActsFor] = useState<{ key: string; data: Activity[] } | null>(null); const actKey = `${l.id}:${tab}`; const acts = actsFor?.key === actKey ? actsFor.data : null; const [activitiesNonce, setActivitiesNonce] = useState(0); const [logOpen, setLogOpen] = useState(false); const [note, setNote] = useState(""); const [calendarFor, setCalendarFor] = useState<{ title: string; note: string; when: string } | null>(null); const [dialling, setDialling] = useState(false); const [gmeetOpen, setGmeetOpen] = useState(false); const [zoomOpen, setZoomOpen] = useState(false);
  const [syncingCalls, setSyncingCalls] = useState(false);
  const [meetingsFor, setMeetingsFor] = useState<{ key: string; data: MeetingDetail[] } | null>(null); const meetingDetails = meetingsFor?.key === actKey ? meetingsFor.data : null; const [meetingsNonce, setMeetingsNonce] = useState(0); const [transcriptFor, setTranscriptFor] = useState<MeetingDetail | null>(null);
  const [attFile, setAttFile] = useState<File | null>(null); const [attNote, setAttNote] = useState(""); const [attBusy, setAttBusy] = useState(false);
  const [propsFor, setPropsFor] = useState<{ key: string; data: ProposalRow[] } | null>(null); const proposals = propsFor?.key === actKey ? propsFor.data : null; const [propsNonce, setPropsNonce] = useState(0);
  const [propFile, setPropFile] = useState<File | null>(null); const [propDetails, setPropDetails] = useState(""); const [propBusy, setPropBusy] = useState(false);
  const [contactsFor, setContactsFor] = useState<{ key: string; data: ContactOpt[] } | null>(null); const contactOpts = contactsFor?.key === actKey ? contactsFor.data : null;
  const [clientSel, setClientSel] = useState<Record<string, Set<string>>>({}); const [sendBusy, setSendBusy] = useState<string | null>(null);
  const [productsFor, setProductsFor] = useState<{ leadId: string; items: Awaited<ReturnType<typeof v2LeadProductAssignments>> } | null>(null);
  const productList = productsFor?.leadId === l.leadId ? productsFor.items : null;
  const [productNonce, setProductNonce] = useState(0); const [removing, setRemoving] = useState<string | null>(null);
  const [typeBusy, setTypeBusy] = useState(false);
  useEffect(() => { let live = true; v2LeadProductAssignments(l.leadId).then((items) => { if (live) setProductsFor({ leadId: l.leadId, items }); }).catch(() => { if (live) { setProductsFor(null); toast("Unable to load products."); } }); return () => { live = false; }; }, [l.leadId, productNonce, toast]);
  const bantRefs = useRef<Record<string, HTMLSelectElement | null>>({});
  const [dmPrompt, setDmPrompt] = useState<{ field: BantField; prevValue: string } | null>(null);
  const [bantPrompt, setBantPrompt] = useState<{ field: Exclude<BantField, "a">; prevValue: string } | null>(null);
  const [dmForm, setDmForm] = useState({ firstName: "", lastName: "", phone: "", email: "" });
  const [dmBusy, setDmBusy] = useState(false);
  useEffect(() => { if (tab !== "activity" && tab !== "notes" && tab !== "attachments" && tab !== "calls") return; let live = true; fetch(`/api/leads/${l.leadId}/activities?assignmentId=${l.id}`).then((r) => r.json()).then((j) => live && setActsFor({ key: actKey, data: j.ok ? j.activities : [] })).catch(() => live && setActsFor({ key: actKey, data: [] })); return () => { live = false; }; }, [tab, l.leadId, l.id, actKey, activitiesNonce]);
  // Altus Contacts calls aren't pushed into the CRM by a webhook — they're pulled on demand, matched by this
  // lead's phone number so a call placed by ANY user (not just whoever opens this lead) still shows up here.
  useEffect(() => { if (!ctx.canEdit) return; let live = true; v2SyncLeadCalls({ leadId: l.leadId, assignmentId: l.id }).then((r) => { if (live && r.ok) setActivitiesNonce((n) => n + 1); }).catch(() => undefined); return () => { live = false; }; }, [l.leadId, l.id, ctx.canEdit]);
  useEffect(() => { if (tab !== "meetings") return; let live = true; fetch(`/api/leads/${l.leadId}/meetings?assignmentId=${l.id}`).then((r) => r.json()).then((j) => live && setMeetingsFor({ key: actKey, data: j.ok ? j.meetings : [] })).catch(() => live && setMeetingsFor({ key: actKey, data: [] })); return () => { live = false; }; }, [tab, l.leadId, l.id, actKey, meetingsNonce]);
  useEffect(() => { if (tab !== "proposals") return; let live = true; fetch(`/api/leads/${l.leadId}/proposals?assignmentId=${l.id}`).then((r) => r.json()).then((j) => live && setPropsFor({ key: actKey, data: j.ok ? j.proposals : [] })).catch(() => live && setPropsFor({ key: actKey, data: [] })); return () => { live = false; }; }, [tab, l.leadId, l.id, actKey, propsNonce]);
  useEffect(() => { if (tab !== "proposals") return; let live = true; fetch(`/api/leads/${l.leadId}/contacts?assignmentId=${l.id}`).then((r) => r.json()).then((j) => { if (!live) return; const rows = j.ok ? j.contacts as { id: string; first_name: string; last_name: string | null; email: string | null; phone: string | null; contact_type: "primary" | "secondary" }[] : []; setContactsFor({ key: actKey, data: rows.map((c) => ({ id: c.id, name: [c.first_name, c.last_name].filter(Boolean).join(" ") || "Contact", email: c.email, phone: c.phone, contactType: c.contact_type })) }); }).catch(() => live && setContactsFor({ key: actKey, data: [] })); return () => { live = false; }; }, [tab, l.leadId, l.id, actKey]);
  const idx = list.findIndex((x) => x.id === l.id); const nav = (d: number) => { if (!list.length) return; onNav(list[(idx + d + list.length) % list.length]); };
  const save = async (field: string, value: string, patch: Partial<LeadRow>) => { const r = await v2UpdateField([{ leadId: l.leadId, assignmentId: l.id }], field, value); toast(r.message); if (r.ok) ctx.patchRows([l.id], patch); };
  // Confirmed authority defers the save until the decision-maker form is submitted — picking it just
  // opens the prompt; the select itself gets reverted to its previous value if the admin cancels.
  const handleBantChange = async (field: BantField, value: string) => {
    const prevValue = l.custom[bantCustomKey(field)] ?? "";
    // Only ask for the decision maker when this lead doesn't already have one on file — re-confirming
    // Authority (e.g. after toggling it to Assumed and back) must not re-prompt for details it already has.
    if (field === "a" && value === "Confirmed" && !l.custom.bant_decision_maker_name) { setDmForm({ firstName: "", lastName: "", phone: "", email: "" }); setDmPrompt({ field, prevValue }); return; }
    if (field !== "a" && value === "Confirmed") { setBantPrompt({ field, prevValue }); return; }
    const r = await v2UpdateBant({ leadId: l.leadId, assignmentId: l.id }, field, value);
    toast(r.message);
    if (r.ok) ctx.patchRows([l.id], { custom: { ...l.custom, [bantCustomKey(field)]: value } });
    else { const el = bantRefs.current[field]; if (el) el.value = prevValue; }
  };
  const submitDecisionMaker = async () => {
    if (!dmPrompt || !dmForm.firstName.trim()) return;
    setDmBusy(true);
    const contactRes = await v2AddDecisionMakerContact({ leadId: l.leadId, assignmentId: l.id }, dmForm);
    if (!contactRes.ok) { toast(contactRes.message); setDmBusy(false); return; }
    const decisionMakerName = [dmForm.firstName.trim(), dmForm.lastName.trim()].filter(Boolean).join(" ");
    const bantRes = await v2UpdateBant({ leadId: l.leadId, assignmentId: l.id }, dmPrompt.field, "Confirmed", decisionMakerName);
    setDmBusy(false);
    toast(bantRes.ok ? contactRes.message : bantRes.message);
    if (bantRes.ok) ctx.patchRows(ws.rows.filter((r) => r.leadId === l.leadId).map((r) => r.id), { custom: { ...l.custom, [bantCustomKey(dmPrompt.field)]: "Confirmed", bant_decision_maker_name: decisionMakerName } });
    else { const el = bantRefs.current[dmPrompt.field]; if (el) el.value = dmPrompt.prevValue; }
    setDmPrompt(null);
  };
  const cancelDecisionMaker = () => { if (dmPrompt) { const el = bantRefs.current[dmPrompt.field]; if (el) el.value = dmPrompt.prevValue; } setDmPrompt(null); };
  // Overview's text fields are uncontrolled (save-on-blur) — dictation just appends into the live DOM value via
  // a ref, same as typing would; the existing onBlur still picks it up whenever the field loses focus.
  const fieldRefs = useRef<Record<string, HTMLInputElement | HTMLTextAreaElement | null>>({});
  const dictateInto = (key: string) => (text: string) => { const el = fieldRefs.current[key]; if (el) el.value = el.value ? `${el.value} ${text}` : text; };
  const coreFields: [string, string, string][] = [["Lead no.", "no", l.no], ["First name", "first_name", l.first], ["Last name", "last_name", l.last], ["Cell number", "phone", l.phone], ["Email", "email", l.email], ["Company", "company_name", l.company]];
  // Some configs have a stray duplicate custom column for a field that's already a core field above
  // (same label, different field_key) — matched by label like classic CRM's own lead-no/acquisition-date checks.
  const DUP_CORE_LABELS = new Set(["lead no", "lead number", "last name", "company name"]);
  // "resolution"- and "bant"-sourced columns (e.g. "Activity resolution", "BANT") are configured fields too,
  // just backed by something other than custom_data — same treatment as "custom" ones here.
  const customCols = ws.columns.filter((c) => (c.source === "custom" || c.source === "resolution" || c.source === "bant") && c.key !== "company_name" && !DUP_CORE_LABELS.has(c.label.trim().toLowerCase()));
  const overviewSections = [
    { title: "Mandatory Details", fields: ["no", "createdon", "leadtype", "firstname", "lastname", "fullname", "cellnumber", "email", "product", "lifecycle"] },
    { title: "Decision Details", fields: ["bant", "leadtemperature", "spanco", "assignedto", "focusedon", "demogiven", "activityresolution", "followupon"] },
    { title: "Business Details", fields: ["company", "designation", "departmentfunction", "decisionmakername"] },
    { title: "Introducer Details", fields: ["introducername", "introducercalldone", "introducercalldate", "introducerfeedback"] },
    { title: "Address", fields: ["addressline1", "addressline2", "addressline3", "addressline4", "nearbylandmark", "city", "pincode", "country", "state", "googlepinattachment"] },
    { title: "Social Media", fields: ["instagramid", "linkedinid", "facebookid"] },
    { title: "Statutory Details", fields: ["gstin", "bankname", "accountholdername", "accountnumber", "ifsccode", "cancelledcheque", "selfie", "pancopy", "kycidproof", "gstcertificate", "tdsrate"] },
  ];
  const normal = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const coreKeys: Record<string, string> = { no: "no", first_name: "firstname", last_name: "lastname", phone: "cellnumber", email: "email", company_name: "company" };
  const customKey = (c: typeof customCols[number]) => {
    if (c.source === "bant") return "bant";
    if (c.source === "resolution") return "activityresolution";
    const addressField = leadAddressFieldKeyForColumn({ field_key: c.key, label: c.label });
    if (addressField) return addressField === "google_map" ? "googlepinattachment" : normal(addressField);
    const key = normal(c.label);
    if (key === "leadacquisitiondate" || key === "leadno") return "";
    if (key.startsWith("addressline")) return key.slice(0, 12);
    if (key === "postalcode" || key === "zipcode") return "pincode";
    if (key === "googlemap" || key === "googlemaps" || key === "maplink") return "googlepinattachment";
    return key;
  };
  const listedKeys = new Set(overviewSections.flatMap((s) => s.fields));
  const otherColumns = customCols.filter((c) => !listedKeys.has(customKey(c)) && customKey(c) !== "");
  const sections = [...overviewSections, ...(otherColumns.length ? [{ title: "Other Details", fields: otherColumns.map(customKey) }] : [])];
  const isFieldMissing = (lab: string, key: string, val: string) => miss.includes(lab) || (ws.hygiene.some((h) => h.key === key) && !val && ["followup", "negotiation", "closing"].includes(l.bucket));
  const [cp, setCp] = useState<{ ids: string[]; names: string } | null>(null);
  const hasChannelPartnerColumn = customCols.some((c) => isChannelPartnerColumn({ field_key: c.key, label: c.label }));
  useEffect(() => { if (!hasChannelPartnerColumn) return; let live = true; v2LeadChannelPartners(l.leadId).then((r) => live && setCp(r)).catch(() => live && setCp({ ids: [], names: "" })); return () => { live = false; }; }, [l.leadId, hasChannelPartnerColumn]);
  const others = useMemo(() => ws.rows.filter((x) => x.leadId === l.leadId), [ws.rows, l.leadId]);
  const curProduct = ws.products.find((p) => p.code === l.product);
  // Prefer the per-lead, phone-matched call activities (any caller) over ws.calls, which only reflects
  // whichever team member's call history has separately been synced via the classic Call Report page.
  const contactForActivity = (a: Activity) => {
    if (a.metadata?.contact_name) return a.metadata.contact_name;
    const digits = String(a.metadata?.matched_phone ?? a.metadata?.dialled_number ?? "").replace(/\D/g, "");
    if (digits.length < 10) return "";
    const matches = [l, ...l.extraRows].filter((c) => c.phone.replace(/\D/g, "").slice(-10) === digits.slice(-10)).map((c) => c.name).filter(Boolean);
    const names = [...new Set(matches)];
    return names.length === 1 ? names[0] : "";
  };
  const calls = tab === "calls" && acts !== null
    ? acts.filter((a) => a.activity_type === "call").map((a) => ({ t: a.metadata?.started_at ?? a.created_at, out: String(a.metadata?.direction ?? "").toLowerCase() !== "incoming", c: Boolean(a.metadata?.connected), d: Number(a.metadata?.duration_seconds) || 0, by: a.actor, contact: contactForActivity(a) }))
    : ws.calls.filter((c) => c.a === l.id).map((c) => ({ ...c, by: personName(ws, c.u), contact: "" }));

  return <Win onClose={onClose} title={<span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}><Avatar name={l.name} /><span>{l.name}{l.isNew && <span className="newtag">NEW</span>}<div style={{ color: "var(--muted)", fontSize: 12, fontWeight: 400 }}>{l.company || "No company"} · {l.phone}</div><span className="lead-product-pills" aria-label="Lead products">{productList ? productList.map((p) => { const target = ws.rows.find((r) => r.id === p.id); const selected = p.id === l.id; return <button type="button" key={p.id} className={`lead-product-pill ${selected ? "selected" : ""}`} aria-pressed={selected} disabled={!p.canRemove || !target} title={!p.canRemove ? "Assigned to another user" : !target ? "Assignment is not loaded" : `View ${displayProductCode(p.code)}`} onClick={() => { if (target) onNav(target); }}>{displayProductCode(p.code)}</button>; }) : <Pill tone="slate">{displayProductCode(l.product)}</Pill>} <Pill tone={b.tone}>{b.label}</Pill></span></span></span>}
    extra={<><button className="btn" disabled={dialling} onClick={() => { setDialling(true); dialLead(l.leadId, l.id, l.phone).then((r) => { toast(r.message); setDialling(false); }); }}><Icon n="phone" s="s" /> {dialling ? "Calling…" : "Call"}</button><a className="btn" href={`https://wa.me/91${l.phone.replace(/\D/g, "").slice(-10)}`} target="_blank" rel="noopener noreferrer"><Icon n="wa" s="s" /> WhatsApp</a>{l.email && <a className="btn" href={`mailto:${l.email}`}><Icon n="mail" s="s" /> Email</a>}<button className="btn" onClick={() => setGmeetOpen(true)} title="Schedule a Google Meet"><Icon n="video" s="s" /> Google Meet</button><button className="btn" onClick={() => setZoomOpen(true)} title="Schedule a Zoom meeting"><Icon n="video" s="s" /> Zoom</button>
      {ctx.canEdit && <button className="btn red" onClick={() => setLogOpen(true)}><Icon n="check" s="s" /> Log call</button>}<a className="btn" href={`/dashboard/leads?lead=${l.leadId}`} title="Open in classic CRM (meetings, transcripts, attachments)"><Icon n="ext" s="s" /> Classic</a>
      <button className="ib" onClick={() => nav(-1)} title="Previous lead"><Icon n="chevl" /></button><button className="ib" onClick={() => nav(1)} title="Next lead"><Icon n="chevr" /></button></>}>
    <div className="lead-layout">
    <aside className="lead-profile">
      <div className="lead-profile-person"><Avatar name={l.name} /><div><strong>{l.name}</strong><span>{l.company || "No company"}</span><div className="lead-profile-badges"><Pill tone="slate">{displayProductCode(l.product)}</Pill> <Pill tone={b.tone}>{b.label}</Pill></div></div></div>
      <div className="lead-profile-actions">
        <button type="button" onClick={() => setTab("notes")}><Icon n="note" />Note</button>
        {l.email && <a href={`mailto:${l.email}`}><Icon n="mail" />Email</a>}
        <button type="button" onClick={() => setTab("activity")}><Icon n="list" />Activity</button>
        <button type="button" onClick={() => setTab("meetings")}><Icon n="cal" />Meetings</button>
      </div>
      <div className="lead-profile-section"><h3>Contact details</h3><dl>
        <dt>Email</dt><dd>{l.email ? <a href={`mailto:${l.email}`}>{l.email}</a> : "—"}</dd>
        <dt>Phone</dt><dd>{l.phone || "—"}</dd>
        <dt>Company</dt><dd>{l.company || "—"}</dd>
        <dt>Lead number</dt><dd>{l.no || "—"}</dd>
        <dt>Lead acquisition date</dt><dd>{fdate(l.createdAt)}</dd>
      </dl></div>
    </aside>
    <div className="lead-content">
    <div className="tabs">{TABS.map(([k, t]) => <button key={k} className={`tab ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>{t}</button>)}</div>
    <div className="win-b">
      {tab === "overview" && <div className="lw-grid"><div className="overview-sections" key={l.id}>
        {sections.map((section) => <details className="overview-section" key={section.title} open={section.title === "Mandatory Details" ? true : undefined}><summary>{section.title}</summary><div className="fgrid overview-fields">
        {section.title === "Mandatory Details" && <>
          <div className="fld" style={{ order: section.fields.indexOf("createdon") }}><label>Created on</label><input value={fdate(l.createdAt)} readOnly /></div>
          <div className="fld" style={{ order: section.fields.indexOf("leadtype") }}><label>Lead Type</label><select value={l.source.trim().toLowerCase().replace(/ /g, "_")} disabled={!ws.roles.includes("admin") || typeBusy} onChange={async (e) => { const value = e.target.value; setTypeBusy(true); try { const result = await v2ChangeLeadType(l.leadId, value); toast(result.message); if (result.ok) ctx.patchRows(ws.rows.filter((r) => r.leadId === l.leadId).map((r) => r.id), { source: value.replace(/_/g, " ") }); } catch { toast("Unable to update lead type."); } finally { setTypeBusy(false); } }}>{!["reference leads", "qualified leads", "database leads", "leads"].includes(l.source.trim().toLowerCase()) && <option value={l.source.trim().toLowerCase().replace(/ /g, "_")}>{l.source || "Not specified"}</option>}<option value="reference_leads">Reference Lead</option><option value="qualified_leads">Qualified Lead</option><option value="database_leads">Database Leads</option><option value="leads">Lead</option></select></div>
          <div className="fld" style={{ order: section.fields.indexOf("product") }}><label>Product</label><select value={l.id} onChange={(e) => { const r = others.find((o) => o.id === e.target.value); if (r) onNav(r); }}>{others.map((o) => <option key={o.id} value={o.id}>{displayProductCode(o.product)}</option>)}</select></div>
          <div className="fld" style={{ order: section.fields.indexOf("lifecycle") }}><label>Life Cycle</label><select disabled={!ctx.canEdit || !curProduct?.stages.length} value={l.stageId ?? ""} onChange={(e) => { const st = curProduct?.stages.find((s) => s.id === e.target.value); if (st) save("stageId", st.id, { stage: st.name, stageId: st.id }); }}><option value="" disabled>Choose…</option>{(curProduct?.stages ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        </>}
        {section.title === "Decision Details" && <>
          <div className="fld" style={{ order: section.fields.indexOf("assignedto") }}><label>Assigned to</label><select disabled={!ctx.canEdit || !canAssignOwner(ws)} value={l.owner ?? ""} onChange={(e) => save("owner", e.target.value, { owner: e.target.value })}><option value="">Unassigned</option>{assignableOpts(ws).map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</select></div>
          <div className="fld" style={{ order: section.fields.indexOf("focusedon") }}><label>Focused On</label><input value={l.focusedOn ? fdate(l.focusedOn) : "—"} readOnly /></div>
          <div className="fld" style={{ order: section.fields.indexOf("followupon") }}><label>Follow Up On</label><input type="datetime-local" disabled={!ctx.canEdit} defaultValue={l.nextFollowUp ? new Date(l.nextFollowUp).toISOString().slice(0, 16) : ""} onBlur={(e) => e.target.value && save("nextFollowUp", new Date(e.target.value).toISOString(), { nextFollowUp: new Date(e.target.value).toISOString() })} /></div>
        </>}
        {section.title === "Business Details" && <div className="fld" style={{ order: section.fields.indexOf("decisionmakername") }}><label>Decision maker name</label><input readOnly value={l.custom.bant_decision_maker_name || "—"} /><span style={{ fontSize: 11, color: "var(--muted)" }}>{l.custom.bant_decision_maker_name ? "Saved from confirmed Authority" : "Existing contacts do not identify a decision maker."}</span></div>}
        {coreFields.filter(([, key]) => section.fields.includes(coreKeys[key])).map(([lab, key, val]) => { const isMiss = isFieldMissing(lab, key, val); const canDictate = ctx.canEdit && key !== "no"; return (
          <div key={key} className={`fld ${isMiss ? "miss" : ""}`} style={{ order: section.fields.indexOf(coreKeys[key]) }}><label>{lab}{isMiss ? " · missing" : ""}</label>
            <div style={{ position: "relative" }}>
              <input ref={(el) => { fieldRefs.current[key] = el; }} defaultValue={val} readOnly={!ctx.canEdit || key === "no"} placeholder={isMiss ? "Needed from follow-up" : "—"} style={canDictate ? { paddingRight: 32 } : undefined} onBlur={(e) => { if (e.target.value !== val) { const v = e.target.value; const patch: Partial<LeadRow> = key === "email" ? { email: v } : key === "company_name" ? { company: v } : key === "first_name" ? { first: v, name: [v, l.last].filter(Boolean).join(" ") } : key === "last_name" ? { last: v, name: [l.first, v].filter(Boolean).join(" ") } : key === "phone" ? { phone: v } : { custom: { ...l.custom, [key]: v } }; save(key, v, patch); } }} />
              {canDictate && <VoiceDictationButton onResult={dictateInto(key)} showLanguagePicker={false} className="absolute right-2 top-1.5" />}
            </div>
          </div>); })}
        {customCols.filter((c) => customKey(c) !== "" && section.fields.includes(customKey(c))).map((c) => {
          if (c.computedFrom.length) { const computed = computedFieldValue(l, c.computedFrom); return <div key={c.key} className="fld" style={{ order: section.fields.indexOf(customKey(c)) }}><label>{c.label}</label><input value={computed || "—"} readOnly title="Derived automatically — edit the fields it's built from instead" /></div>; }
          if (c.label.trim().toLowerCase() === "lead acquisition date") return <div key={c.key} className="fld" style={{ order: section.fields.indexOf(customKey(c)) }}><label>{c.label}</label><input value={fdate(l.createdAt)} readOnly title="The date this lead was created" /></div>;
          if (c.source === "resolution") return <div key={c.key} className="fld" style={{ order: section.fields.indexOf(customKey(c)) }}><label>{c.label}</label>
            <select disabled={!ctx.canEdit} value={l.resolutionId ?? ""} onChange={(e) => { const x = ws.resolutions.find((r) => r.id === e.target.value); save("resolutionId", e.target.value, { resolutionId: e.target.value, resolution: x?.name ?? null, bucket: x?.bucket ?? l.bucket, lastCalledAt: new Date().toISOString() }); }}>
              <option value="">Not called</option>
              {ws.resolutions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>;
          if (c.source === "bant") return <div key={c.key} className="fld" style={{ order: section.fields.indexOf("bant") }}>
            <label>{c.label}</label>
            <div className="overview-bant" style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 8, marginTop: 4 }}>
              {(Object.keys(BANT_FIELD_LABELS) as BantField[]).map((f) => {
                const v = l.custom[bantCustomKey(f)] ?? ""; const bantStyle = bantToneStyle(v);
                return <div key={f}>
                  <span style={{ display: "block", fontSize: 10, fontWeight: 700, color: "var(--faint)", letterSpacing: .5, textTransform: "uppercase", marginBottom: 3 }}>{f.toUpperCase()} · {BANT_FIELD_LABELS[f]}</span>
                  <select ref={(el) => { bantRefs.current[f] = el; }} disabled={!ctx.canEdit} defaultValue={v} onChange={(e) => handleBantChange(f, e.target.value)} style={{ width: "100%", border: "1px solid var(--line)", borderRadius: 6, padding: "4px 6px", fontWeight: 700, ...bantStyle }}>
                    <option value="">Select</option>
                    {BANT_OPTIONS[f].map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                  {v === "Confirmed" && f !== "a" && <><div style={{ marginTop: 5, fontSize: 11, overflowWrap: "anywhere" }}>{(f === "b" ? l.custom.bant_budget_range : f === "n" ? l.custom.bant_need_note : l.custom[ws.columns.find((col) => normal(col.label) === "expectedclosing")?.key ?? ""]) || "—"}</div><button type="button" className="btn ghost sm" disabled={!ctx.canEdit} onClick={() => setBantPrompt({ field: f, prevValue: v })}>Edit details</button></>}
                  {v === "Confirmed" && f === "a" && <><div style={{ marginTop: 5, fontSize: 11, overflowWrap: "anywhere" }}>{l.custom.bant_decision_maker_name || "See contacts"}</div><button type="button" className="btn ghost sm" disabled={!ctx.canEdit} onClick={() => { setDmForm({ firstName: "", lastName: "", phone: "", email: "" }); setDmPrompt({ field: "a", prevValue: v }); }}>Edit details</button></>}
                </div>;
              })}
            </div>
          </div>;
          const val = l.custom[c.key] ?? ""; const isMiss = isFieldMissing(c.label, c.key, val); const disabled = !ctx.canEdit;
          const onSave = (next: string) => { if (next !== val) save(c.key, next, { custom: { ...l.custom, [c.key]: next } }); };
          const addressField = leadAddressFieldKeyForColumn({ field_key: c.key, label: c.label });
          const addressValue = (field: "country" | "state") => { const col = customCols.find((item) => leadAddressFieldKeyForColumn({ field_key: item.key, label: item.label }) === field); return col ? l.custom[col.key] ?? "" : ""; };
          const addressOptions = addressField === "country" ? [...LEAD_ADDRESS_COUNTRIES] : addressField === "state" ? locationStates(addressValue("country")) : addressField === "city" ? locationCities(addressValue("country"), addressValue("state")) : null;
          if (isChannelPartnerColumn({ field_key: c.key, label: c.label })) return <div key={c.key} className={`fld ${isMiss ? "miss" : ""}`} style={{ order: section.fields.indexOf(customKey(c)) }}><label>{c.label}{isMiss ? " · missing" : ""}</label>
            {cp ? <ChannelPartnerSelect leadId={l.leadId} assignmentId={l.id} names={cp.names} options={[]} selectedIds={cp.ids} onSaved={(ids) => setCp({ ids, names: ids.map((id) => personName(ws, id)).join(", ") })} /> : <span style={{ color: "var(--faint)" }}>Loading…</span>}</div>;
          return <div key={c.key} className={`fld ${isMiss ? "miss" : ""}`} style={{ order: section.fields.indexOf(customKey(c)) }}><label>{c.label}{isMiss ? " · missing" : ""}</label>
            {c.fieldType === "dropdown" ? <select disabled={disabled} value={val} onChange={(e) => onSave(e.target.value)}><option value="">Select</option>{val && !(addressOptions ?? c.options).includes(val) && <option value={val}>{val}</option>}{(addressOptions ?? c.options).map((o) => <option key={o} value={o}>{o}</option>)}</select>
              : c.fieldType === "checkbox" ? <label style={{ marginTop: 4, display: "inline-flex", alignItems: "center", gap: 8 }}><input type="checkbox" disabled={disabled} defaultChecked={val === "true"} onChange={(e) => onSave(e.target.checked ? "true" : "false")} /> Yes</label>
              : c.fieldType === "textarea" || c.fieldType === "long_text" ? <div style={{ position: "relative" }}><textarea ref={(el) => { fieldRefs.current[c.key] = el; }} defaultValue={val} readOnly={disabled} placeholder={isMiss ? "Needed from follow-up" : "—"} style={{ width: "100%", minHeight: 70, paddingRight: disabled ? undefined : 32 }} onBlur={(e) => onSave(e.target.value)} />{!disabled && <VoiceDictationButton onResult={dictateInto(c.key)} showLanguagePicker={false} className="absolute right-2 top-2" />}</div>
              : c.fieldType === "date" || c.fieldType === "number" ? <input type={c.fieldType} defaultValue={c.fieldType === "date" ? (Number.isNaN(new Date(val).getTime()) ? "" : new Date(val).toISOString().slice(0, 10)) : val} readOnly={disabled} placeholder={isMiss ? "Needed from follow-up" : "—"} onBlur={(e) => onSave(e.target.value)} />
              : <div style={{ position: "relative" }}><input ref={(el) => { fieldRefs.current[c.key] = el; }} type="text" defaultValue={val} readOnly={disabled} placeholder={isMiss ? "Needed from follow-up" : "—"} style={disabled ? undefined : { paddingRight: 32 }} onBlur={(e) => onSave(e.target.value)} />{!disabled && <VoiceDictationButton onResult={dictateInto(c.key)} showLanguagePicker={false} className="absolute right-2 top-1.5" />}</div>}
          </div>;
        })}
        {section.title === "Address" && section.fields.filter((key) => !customCols.some((c) => customKey(c) === key)).map((key) => <div className="fld" key={key} style={{ order: section.fields.indexOf(key) }}><label>{({ addressline1: "Address Line 1", addressline2: "Address Line 2", addressline3: "Address Line 3", addressline4: "Address Line 4", nearbylandmark: "Nearby Landmark", city: "City", pincode: "Pin Code", country: "Country", state: "State", googlepinattachment: "Google Pin Attachment" } as Record<string, string>)[key]}</label><span style={{ color: "var(--muted)", fontSize: 12 }}>Not configured</span></div>)}
      </div></details>)}
      </div>
        <div className="lw-rail"><div className="tile" style={toneStyle(miss.length ? "butter" : "mint")}><span className="tl1"><Icon n="db" s="s" /> Data hygiene</span><span className="tv">{miss.length ? `${miss.length} empty` : "Complete"}</span><span className="ts">{miss.join(", ") || "All key fields filled"}</span></div>
          <div className="fld"><label>Product</label><select value={l.id} onChange={(e) => { const r = others.find((o) => o.id === e.target.value); if (r) onNav(r); }}>{others.map((o) => <option key={o.id} value={o.id}>{displayProductCode(o.product)}</option>)}</select>
            {ctx.canEdit && <div style={{ marginTop: 6 }}><AddMoreProducts leadId={l.leadId} assignmentId={l.id} already={others.map((o) => o.product)} onAdded={() => ctx.refresh()} /></div>}</div>
          </div></div>}
      {tab === "products" && <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>{productList === null ? <div className="empty">Loading products…</div> : productList.map((o) => { const pd = ws.products.find((p) => p.id === o.productId); return <div key={o.id} className="panel"><div className="panel-h"><Pill tone="slate">{displayProductCode(o.code)}</Pill><span style={{ color: "var(--muted)", fontWeight: 400 }}>{o.name}</span><span style={{ flex: 1 }} />{o.resolution && <Pill tone="slate">{o.resolution}</Pill>}<span style={{ color: "var(--muted)", fontWeight: 400 }}>{personName(ws, o.owner)}</span>{o.canRemove && <button className="btn sm" disabled={!!removing} onClick={async () => { if (!window.confirm(`Remove ${displayProductCode(o.code)}? Its history will be preserved.`)) return; setRemoving(o.id); const result = await v2RemoveProduct(l.leadId, o.id); setRemoving(null); toast(result.message); if (result.ok) { if (o.id === l.id) onClose(); else setProductNonce((n) => n + 1); await ctx.refresh(); } }}>Remove</button>}</div>
        <div style={{ display: "flex", gap: 6, padding: 12, flexWrap: "wrap" }}>{(pd?.stages ?? []).map((s, i) => { const cur = pd!.stages.findIndex((x) => x.name === o.stage); return <span key={s.id} className="pill" style={{ ...toneStyle(i === cur ? "mint" : i < cur ? "sage" : "slate"), padding: "5px 12px" }}>{i < cur ? "✓ " : i === cur ? "● " : ""}{s.name}</span>; })}</div></div>; })}
        {ctx.canEdit && productList && <AddMoreProducts leadId={l.leadId} assignmentId={l.id} already={productList.map((o) => o.code)} onAdded={() => { setProductNonce((n) => n + 1); ctx.refresh(); }} />}</div>}
      {(tab === "activity" || tab === "notes") && <div className="tl">{tab === "activity" && ctx.canEdit && <button type="button" className="btn sm" style={{ marginBottom: 10 }} disabled={syncingCalls} onClick={async () => { setSyncingCalls(true); try { const result = await v2SyncLeadCalls({ leadId: l.leadId, assignmentId: l.id }); toast(result.message); if (result.ok) setActivitiesNonce((n) => n + 1); } catch { toast("Unable to sync calls."); } finally { setSyncingCalls(false); } }}>{syncingCalls ? "Syncing calls…" : "Sync calls"}</button>}{tab === "notes" && ctx.canEdit && <div style={{ display: "flex", gap: 8, marginBottom: 10 }}><div style={{ position: "relative", flex: 1 }}><textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note…" style={{ width: "100%", height: 70, border: "1px solid var(--line)", borderRadius: 9, padding: "10px 34px 10px 10px" }} /><VoiceDictationButton onResult={(text) => setNote((cur) => (cur ? `${cur} ${text}` : text))} showLanguagePicker={false} className="absolute right-2 top-2" /></div><button className="btn red" onClick={async () => { const r = await v2AddNote({ leadId: l.leadId, assignmentId: l.id }, note); toast(r.message); if (r.ok) { setNote(""); setActivitiesNonce((n) => n + 1); setTab("activity"); } }}>Save note</button></div>}
        {acts == null ? <div className="empty">Loading…</div> : acts.filter((a) => tab === "activity" || a.activity_type === "note").map((a) => <div key={a.id} className="tli"><span className="tdot" style={{ background: TONES[a.activity_type === "call" ? "sky" : a.activity_type === "note" ? "peach" : "slate"].mk }} /><div style={{ flex: 1 }}><b>{a.activity_type}{a.activity_type === "call" && contactForActivity(a) ? ` · ${contactForActivity(a)}` : ""}{a.note ? ` · ${a.note}` : ""}</b><div style={{ color: "var(--muted)", fontSize: 11.5 }}>{fdt(a.created_at)} · {a.actor}{a.follow_up_at ? ` · follow-up ${fdate(a.follow_up_at)}` : ""}</div></div>
          {a.note && <button type="button" className="ib" title="Add to calendar" onClick={() => setCalendarFor({ title: `${a.activity_type === "note" ? "Note" : "Follow-up"}: ${l.name}`, note: a.note ?? "", when: a.follow_up_at ? new Date(a.follow_up_at).toISOString().slice(0, 16) : "" })}><Icon n="cal" s="s" /></button>}
        </div>)}{acts && !acts.length && <div className="empty">No activity yet.</div>}</div>}
      {tab === "calls" && <div style={{ padding: 12 }}>{acts === null ? <div className="empty">Loading…</div> : <><table className="t"><thead><tr><th>Date</th><th>Contact</th><th>Direction</th><th>Status</th><th>Duration</th><th>Called by</th></tr></thead><tbody>{calls.map((c, i) => <tr key={i}><td>{fdt(c.t)}</td><td>{c.contact || "—"}</td><td>{c.out ? "Outgoing" : "Incoming"}</td><td><Pill tone={c.c ? "mint" : "rose"}>{c.c ? "Connected" : "Not connected"}</Pill></td><td>{c.d ? Math.round(c.d / 60) + " min" : "—"}</td><td>{c.by || "—"}</td></tr>)}</tbody></table>{!calls.length && <div className="empty">No calls found for this lead.</div>}</>}</div>}
      {tab === "meetings" && <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>{meetingDetails === null ? <div className="empty">Loading…</div> : meetingDetails.map((m) => { const upcoming = new Date(m.startTime).getTime() > new Date(ws.generatedAt).getTime(); return <div key={m.id} className="panel" style={{ flexDirection: "column", gap: 6, padding: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}><Pill tone={upcoming ? "sky" : "mint"}>{upcoming ? "Upcoming" : "Done"}</Pill><b>{m.kind}</b><span>{m.topic}</span><span style={{ color: "var(--muted)" }}>{fdt(m.startTime)} · {m.durationMinutes}m</span></div>
        {m.notes && <div style={{ color: "var(--muted)", fontSize: 12.5 }}>{m.notes}</div>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {upcoming && <a className="btn" href={m.joinUrl} target="_blank" rel="noopener noreferrer"><Icon n="video" s="s" /> Join</a>}
          {m.recordingUrl ? <a className="btn" href={m.recordingUrl} target="_blank" rel="noopener noreferrer"><Icon n="play" s="s" /> Watch recording</a> : !upcoming && <span style={{ color: "var(--muted)", fontSize: 12.5, alignSelf: "center" }}>Recording not available yet</span>}
          {m.transcriptText ? <button type="button" className="btn" onClick={() => setTranscriptFor(m)}><Icon n="note" s="s" /> View transcript</button> : m.transcriptUrl ? <a className="btn" href={m.transcriptUrl} target="_blank" rel="noopener noreferrer"><Icon n="note" s="s" /> View transcript</a> : !upcoming && <span style={{ color: "var(--muted)", fontSize: 12.5, alignSelf: "center" }}>Transcript not available yet</span>}
        </div>
      </div>; })}{meetingDetails !== null && !meetingDetails.length && <div className="empty">No meetings. Schedule a Zoom or Google Meet from the header above.</div>}</div>}
      {tab === "contacts" && <ContactsTab leadId={l.leadId} assignmentId={l.id} ws={ws} readOnly={!ctx.canEdit} />}
      {tab === "attachments" && <div className="tl">
        {ctx.canEdit && <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
          <input type="file" onChange={(e) => setAttFile(e.target.files?.[0] ?? null)} accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.txt" />
          <div style={{ position: "relative" }}><textarea value={attNote} onChange={(e) => setAttNote(e.target.value)} placeholder="Note for this attachment (optional)…" style={{ width: "100%", height: 60, border: "1px solid var(--line)", borderRadius: 9, padding: "10px 34px 10px 10px" }} /><VoiceDictationButton onResult={(text) => setAttNote((cur) => (cur ? `${cur} ${text}` : text))} showLanguagePicker={false} className="absolute right-2 top-2" /></div>
          <button className="btn red" style={{ alignSelf: "flex-start" }} disabled={attBusy || (!attFile && !attNote.trim())} onClick={async () => {
            setAttBusy(true);
            try {
              const uploaded = attFile ? await uploadLeadAttachment(l.leadId, l.id, attFile) : null;
              const r = await v2AddAttachment({ leadId: l.leadId, assignmentId: l.id }, uploaded, attNote);
              toast(r.message);
              if (r.ok) { setAttFile(null); setAttNote(""); setActivitiesNonce((n) => n + 1); }
            } catch (e) { toast(e instanceof Error ? e.message : "Upload failed."); }
            setAttBusy(false);
          }}>{attBusy ? "Uploading…" : "Upload attachment"}</button>
        </div>}
        {acts == null ? <div className="empty">Loading…</div> : acts.filter((a) => a.activity_type === "note" && a.metadata?.attachments?.length).map((a) => <div key={a.id} className="tli">
          <span className="tdot" style={{ background: TONES.slate.mk }} />
          <div style={{ flex: 1 }}>
            {a.note && <div><b>{a.note}</b></div>}
            <div style={{ marginTop: 4 }}>{a.metadata!.attachments!.map((att, i) => <a key={i} className="btn sm" style={{ marginRight: 6 }} href={att.url} target="_blank" rel="noopener noreferrer"><Icon n="file" s="s" /> {att.name}</a>)}</div>
            <div style={{ color: "var(--muted)", fontSize: 11.5, marginTop: 4 }}>{fdt(a.created_at)} · {a.actor}</div>
          </div>
        </div>)}
        {acts && !acts.filter((a) => a.activity_type === "note" && a.metadata?.attachments?.length).length && <div className="empty">No attachments yet.</div>}
      </div>}
      {tab === "proposals" && <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        {ctx.canEdit && <div className="panel" style={{ padding: 12, gap: 8 }}>
          <span className="lbl">Upload proposal</span>
          <input type="file" onChange={(e) => setPropFile(e.target.files?.[0] ?? null)} accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx" />
          <div style={{ position: "relative" }}><textarea value={propDetails} onChange={(e) => setPropDetails(e.target.value)} placeholder="Details about this proposal…" style={{ width: "100%", height: 60, border: "1px solid var(--line)", borderRadius: 9, padding: "10px 34px 10px 10px" }} /><VoiceDictationButton onResult={(text) => setPropDetails((cur) => (cur ? `${cur} ${text}` : text))} showLanguagePicker={false} className="absolute right-2 top-2" /></div>
          <button className="btn red sm" style={{ alignSelf: "flex-start" }} disabled={propBusy || !propFile} onClick={async () => {
            if (!propFile) return; setPropBusy(true);
            try {
              const uploaded = await uploadLeadAttachment(l.leadId, l.id, propFile);
              const r = await v2CreateProposal({ leadId: l.leadId, assignmentId: l.id }, uploaded, propDetails);
              toast(r.message);
              if (r.ok) { setPropFile(null); setPropDetails(""); setPropsNonce((n) => n + 1); }
            } catch (e) { toast(e instanceof Error ? e.message : "Upload failed."); }
            setPropBusy(false);
          }}>{propBusy ? "Uploading…" : "Upload proposal"}</button>
        </div>}
        <table className="t">
          <thead><tr><th>Proposal</th><th>Details</th><th>Approved</th><th>Clients</th><th>Send</th></tr></thead>
          <tbody>{(proposals ?? []).map((p) => {
            const sel = clientSel[p.id] ?? new Set<string>();
            const canSend = p.approved && sel.size > 0;
            const sending = sendBusy === p.id;
            return <tr key={p.id} style={sending ? { opacity: 0.5, pointerEvents: "none" } : undefined}>
              <td><a href={p.fileUrl} target="_blank" rel="noopener noreferrer"><Icon n="file" s="s" /> {p.fileName}</a></td>
              <td style={{ maxWidth: 220, whiteSpace: "normal" }}>{p.details || "—"}</td>
              <td>{ws.roles.includes("admin")
                ? <select value={p.approved ? "yes" : "no"} onChange={async (e) => { const approved = e.target.value === "yes"; const r = await v2SetProposalApproval(p.id, approved); toast(r.message); if (r.ok) setPropsFor((cur) => (cur ? { ...cur, data: cur.data.map((x) => (x.id === p.id ? { ...x, approved } : x)) } : cur)); }}><option value="no">No</option><option value="yes">Yes</option></select>
                : <Pill tone={p.approved ? "mint" : "rose"}>{p.approved ? "Yes" : "No"}</Pill>}</td>
              <td><ClientsPicker contacts={contactOpts ?? []} selected={sel} onChange={(n) => setClientSel((cur) => ({ ...cur, [p.id]: n }))} /></td>
              <td>{sending ? <span style={{ color: "var(--muted)", fontSize: 11.5, fontWeight: 700 }}>Sending…</span> : <div style={{ display: "flex", gap: 6 }}>
                <button type="button" className="ib" title={p.approved ? "Email the proposal" : "Approve the proposal first"} disabled={!canSend} onClick={async () => {
                  const emails = (contactOpts ?? []).filter((c) => sel.has(c.id) && c.email).map((c) => c.email!);
                  if (!emails.length) { toast("None of the selected clients has an email address."); return; }
                  setSendBusy(p.id); const r = await v2SendProposalEmail({ leadId: l.leadId, assignmentId: l.id }, p.id, emails); toast(r.message); setSendBusy(null);
                }}><Icon n="mail" s="s" /></button>
                <button type="button" className="ib" title={p.approved ? "Share on WhatsApp" : "Approve the proposal first"} disabled={!canSend} onClick={async () => {
                  const targets = (contactOpts ?? []).filter((c) => sel.has(c.id) && c.phone);
                  if (!targets.length) { toast("None of the selected clients has a phone number."); return; }
                  setSendBusy(p.id);
                  for (const c of targets) window.open(`https://wa.me/91${c.phone!.replace(/\D/g, "").slice(-10)}?text=${encodeURIComponent(`Hi ${c.name}, please find the proposal here: ${p.fileUrl}`)}`, "_blank", "noopener");
                  const r = await v2LogProposalWhatsAppShare({ leadId: l.leadId, assignmentId: l.id }, p.id, targets.map((c) => c.name).join(", ")); toast(r.message); setSendBusy(null);
                }}><Icon n="wa" s="s" /></button>
              </div>}</td>
            </tr>;
          })}</tbody>
        </table>
        {proposals && !proposals.length && <div className="empty">No proposals yet.</div>}
      </div>}
    </div>
    </div></div>
    {logOpen && <LogCall onClose={() => setLogOpen(false)} onSave={async (resId, fu, n) => { const r = await v2LogCall({ leadId: l.leadId, assignmentId: l.id }, resId, fu, n); toast(r.message); if (r.ok) { const x = ws.resolutions.find((q) => q.id === resId); ctx.patchRows([l.id], { resolutionId: resId, resolution: x?.name ?? null, bucket: x?.bucket ?? l.bucket, lastCalledAt: new Date().toISOString(), nextFollowUp: fu || l.nextFollowUp }); setLogOpen(false); } }} />}
    {bantPrompt && <BantConfirm key={`${l.id}-${bantPrompt.field}`} field={bantPrompt.field} row={l} ws={ws} onClose={() => { const el = bantRefs.current[bantPrompt.field]; if (el) el.value = l.custom[bantCustomKey(bantPrompt.field)] ?? ""; setBantPrompt(null); }} onSave={async (detail, key) => { try { const result = await v2UpdateBant({ leadId: l.leadId, assignmentId: l.id }, bantPrompt.field, "Confirmed", detail); toast(result.message); if (result.ok) { ctx.patchRows(ws.rows.filter((r) => r.leadId === l.leadId).map((r) => r.id), { custom: { ...l.custom, [bantCustomKey(bantPrompt.field)]: "Confirmed", [key]: detail } }); const el = bantRefs.current[bantPrompt.field]; if (el) el.value = "Confirmed"; setBantPrompt(null); } return result.ok; } catch { toast("Unable to update BANT."); return false; } }} />}
    {transcriptFor && <Win small title={`Transcript · ${transcriptFor.kind} · ${transcriptFor.topic}`} onClose={() => setTranscriptFor(null)}><div className="win-b" style={{ padding: 14 }}><pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 13, lineHeight: 1.5, margin: 0 }}>{transcriptFor.transcriptText}</pre></div></Win>}
    {calendarFor && <Win small title="Add to calendar" onClose={() => setCalendarFor(null)}><div className="win-b" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      <div><b>{calendarFor.title}</b></div>
      {calendarFor.note && <div style={{ color: "var(--muted)", fontSize: 12.5 }}>{calendarFor.note}</div>}
      <div className="fld"><label>Date and time</label><input type="datetime-local" value={calendarFor.when} onChange={(e) => setCalendarFor((c) => (c ? { ...c, when: e.target.value } : c))} /></div>
      <button type="button" className="btn red" disabled={!calendarFor.when} onClick={() => { const start = new Date(calendarFor.when); window.open(googleCalendarCreateUrl({ title: calendarFor.title, description: calendarFor.note, start, end: new Date(start.getTime() + 30 * 60_000) }), "_blank", "noopener"); setCalendarFor(null); }}><Icon n="cal" s="s" /> Add to Google Calendar</button>
    </div></Win>}
    {dmPrompt && <Win small title="Decision maker" onClose={cancelDecisionMaker}><div className="win-b" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ color: "var(--muted)", fontSize: 12.5 }}>Add the decision maker&apos;s details — they&apos;ll be saved as a Secondary Contact for this lead.</div>
      <div className="fld"><label>First name</label><input value={dmForm.firstName} onChange={(e) => setDmForm((f) => ({ ...f, firstName: e.target.value }))} /></div>
      <div className="fld"><label>Last name</label><input value={dmForm.lastName} onChange={(e) => setDmForm((f) => ({ ...f, lastName: e.target.value }))} /></div>
      <div className="fld"><label>Contact (optional)</label><input value={dmForm.phone} onChange={(e) => setDmForm((f) => ({ ...f, phone: e.target.value }))} /></div>
      <div className="fld"><label>Email (optional)</label><input value={dmForm.email} onChange={(e) => setDmForm((f) => ({ ...f, email: e.target.value }))} /></div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}><button type="button" className="btn" onClick={cancelDecisionMaker}>Cancel</button><button type="button" className="btn red" disabled={dmBusy || !dmForm.firstName.trim()} onClick={submitDecisionMaker}>{dmBusy ? "Saving…" : "Save"}</button></div>
    </div></Win>}
    {gmeetOpen && <GoogleMeetModal leadId={l.leadId} assignmentId={l.id} leadName={l.name} onClose={() => setGmeetOpen(false)} onScheduled={() => { ctx.refresh(); setMeetingsNonce((n) => n + 1); }} />}
    {zoomOpen && <ZoomMeetingModal leadId={l.leadId} assignmentId={l.id} leadName={l.name} onClose={() => setZoomOpen(false)} onScheduled={() => { ctx.refresh(); setMeetingsNonce((n) => n + 1); }} />}
  </Win>;
}
/** Multi-select "Add product" — pick several at once (same checkbox-multi-select the classic Add-lead form uses),
 * each becomes a new product assignment; the lead's existing products, stages and owner are untouched. */
function AddMoreProducts({ leadId, assignmentId, already, onAdded }: { leadId: string; assignmentId: string; already: string[]; onAdded: () => void }) {
  const { ws } = useCrm(); const toast = useToast();
  const [sel, setSel] = useState<Set<string>>(new Set()); const [busy, setBusy] = useState(false);
  const options = ws.products.filter((p) => !already.includes(p.code));
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
/** Closed-by-default multi-select for the Proposal table's Clients column — same chip+checkbox-popover
 * pattern used elsewhere in v2 (e.g. the Sales person picker), instead of a native <select multiple>. */
function ClientsPicker({ contacts, selected, onChange }: { contacts: ContactOpt[]; selected: Set<string>; onChange: (s: Set<string>) => void }) {
  const pop = usePop();
  const label = selected.size ? `${selected.size} client${selected.size > 1 ? "s" : ""}` : "Select clients";
  return <>
    <button type="button" className="btn sm" onClick={(e) => pop.open(e.currentTarget)}>{label} <Icon n="chevd" s="s" /></button>
    {pop.anchor && <Popover anchor={pop.anchor} onClose={pop.close} width={220}>
      {contacts.map((c) => <label key={c.id} className="pi" style={{ cursor: "pointer" }}>
        <input type="checkbox" className="cb" checked={selected.has(c.id)} onChange={() => { const n = new Set(selected); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); onChange(n); }} />
        {c.name}{c.contactType === "primary" ? " (Primary)" : ""}
      </label>)}
      {!contacts.length && <div className="empty" style={{ padding: 10 }}>No contacts</div>}
    </Popover>}
  </>;
}
