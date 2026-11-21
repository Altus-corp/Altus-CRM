"use client";
// Add Contact tab — v2-styled, but every write goes through the exact same classic actions
// (createLeadContact, updateLeadContact, makeLeadContactPrimary, sendEmailToLeadContact) unchanged.
import { useEffect, useState } from "react";
import { createLeadContact, makeLeadContactPrimary, sendEmailToLeadContact, updateLeadContact } from "@/app/dashboard/leads/actions";
import type { Workspace } from "@/app/lib/crm2/types";
import { dialLead } from "./leads";
import { Icon, Pill, Win, useToast } from "./ui";

type LeadContact = { id: string; first_name: string; last_name: string | null; email: string | null; phone: string | null; designation: string | null; department_function: string | null; contact_type: "primary" | "secondary"; created_at: string };
const fd = (o: Record<string, string>) => { const f = new FormData(); Object.entries(o).forEach(([k, v]) => f.set(k, v)); return f; };
const normalize = (v: string) => v.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");

export function ContactsTab({ leadId, assignmentId, ws, readOnly }: { leadId: string; assignmentId: string; ws: Workspace; readOnly: boolean }) {
  const toast = useToast();
  const [contacts, setContacts] = useState<LeadContact[] | null>(null);
  const [draft, setDraft] = useState({ firstName: "", lastName: "", email: "", phone: "", designation: "", departmentFunction: "", contactType: "secondary" });
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<LeadContact | null>(null);
  const [emailing, setEmailing] = useState<LeadContact | null>(null);
  const [dialling, setDialling] = useState<string | null>(null);

  const designationOptions = ws.columns.find((c) => c.source === "custom" && c.fieldType === "dropdown" && normalize(c.label) === "designation")?.options ?? [];
  const departmentOptions = ws.columns.find((c) => c.source === "custom" && c.fieldType === "dropdown" && normalize(c.label) === "departmentfunction")?.options ?? [];

  const load = () => { fetch(`/api/leads/${leadId}/contacts?assignmentId=${encodeURIComponent(assignmentId)}`, { cache: "no-store" }).then((r) => r.json()).then((j: { ok?: boolean; contacts?: LeadContact[] }) => setContacts(j.ok ? j.contacts ?? [] : [])).catch(() => setContacts([])); };
  useEffect(load, [leadId, assignmentId]);

  const submit = async () => {
    if (!draft.firstName.trim()) return toast("First name is required.");
    setSaving(true);
    const r = await createLeadContact(fd({ leadId, assignmentId, ...draft }));
    setSaving(false); toast(r.message);
    if (r.ok) { setDraft({ firstName: "", lastName: "", email: "", phone: "", designation: "", departmentFunction: "", contactType: "secondary" }); load(); }
  };
  const makePrimary = async (contactId: string) => { const r = await makeLeadContactPrimary(fd({ leadId, assignmentId, contactId })); toast(r.message); if (r.ok) load(); };
  const call = async (c: LeadContact) => { if (!c.phone) return; setDialling(c.id); const r = await dialLead(leadId, assignmentId, c.phone); toast(r.message); setDialling(null); };

  return <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 14, maxWidth: 820 }}>
    <div><h4 style={{ margin: "0 0 4px" }}>Lead contacts</h4><p style={{ color: "var(--muted)", fontSize: 12 }}>The lead record is the Primary contact. Saving a new Primary contact updates the lead and preserves the previous lead contact as Secondary.</p></div>

    {!readOnly && <div className="panel" style={{ padding: 14 }}>
      <div className="fgrid" style={{ padding: 0 }}>
        <div className="fld"><label>First name *</label><input value={draft.firstName} onChange={(e) => setDraft({ ...draft, firstName: e.target.value })} /></div>
        <div className="fld"><label>Last name</label><input value={draft.lastName} onChange={(e) => setDraft({ ...draft, lastName: e.target.value })} /></div>
        <div className="fld"><label>Email</label><input value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></div>
        <div className="fld"><label>Phone</label><input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></div>
        <div className="fld"><label>Designation</label><select value={draft.designation} onChange={(e) => setDraft({ ...draft, designation: e.target.value })}><option value="">{designationOptions.length ? "Select" : "No designation dropdown configured"}</option>{designationOptions.map((o) => <option key={o} value={o}>{o}</option>)}</select></div>
        <div className="fld"><label>Department/Function</label><select value={draft.departmentFunction} onChange={(e) => setDraft({ ...draft, departmentFunction: e.target.value })}><option value="">{departmentOptions.length ? "Select" : "No dropdown configured"}</option>{departmentOptions.map((o) => <option key={o} value={o}>{o}</option>)}</select></div>
        <div className="fld"><label>Contact type</label><select value={draft.contactType} onChange={(e) => setDraft({ ...draft, contactType: e.target.value })}><option value="secondary">Secondary</option><option value="primary">Primary</option></select></div>
      </div>
      <p style={{ color: "var(--muted)", fontSize: 11, marginTop: 8 }}>Saving a new Primary contact updates the lead and moves the previous lead contact into the Secondary list.</p>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}><button className="btn red" disabled={saving} onClick={submit}>{saving ? "Saving…" : "Add contact"}</button></div>
    </div>}

    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {contacts == null ? <div className="empty">Loading…</div> : contacts.length ? contacts.map((c) => <div key={c.id} className="panel" style={c.contact_type === "primary" ? { borderColor: "var(--red-100)", background: "var(--red-50)" } : undefined}>
        <div className="panel-h">
          <b>{[c.first_name, c.last_name].filter(Boolean).join(" ")}</b>
          <span style={{ color: "var(--muted)", fontWeight: 400 }}>{c.designation || "No designation"}{c.department_function ? ` · ${c.department_function}` : ""}</span>
          <span style={{ flex: 1 }} />
          <Pill tone={c.contact_type === "primary" ? "rose" : "slate"}>{c.contact_type}</Pill>
          {!readOnly && <button className="ib" disabled={!c.phone || dialling === c.id} title={c.phone ? `Call ${c.phone}` : "No phone number"} onClick={() => call(c)}><Icon n="phone" s="s" /></button>}
          {!readOnly && <button className="ib" disabled={!c.email} title={c.email ? `Email ${c.email}` : "No email address"} onClick={() => setEmailing(c)}><Icon n="mail" s="s" /></button>}
          {!readOnly && <button className="ib" title="Edit contact" onClick={() => setEditing(c)}><Icon n="edit" s="s" /></button>}
          {!readOnly && c.contact_type === "secondary" && <button className="btn sm" onClick={() => makePrimary(c.id)}>Make primary</button>}
        </div>
        {(c.phone || c.email) && <div style={{ padding: "8px 12px", color: "var(--muted)", fontSize: 12 }}>{[c.phone, c.email].filter(Boolean).join(" · ")}</div>}
      </div>) : <div className="empty">No Secondary contacts have been added to this lead.</div>}
    </div>

    {editing && <EditContact contact={editing} leadId={leadId} assignmentId={assignmentId} designationOptions={designationOptions} departmentOptions={departmentOptions} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    {emailing?.email && <EmailContact leadId={leadId} assignmentId={assignmentId} to={emailing.email} name={[emailing.first_name, emailing.last_name].filter(Boolean).join(" ")} onClose={() => setEmailing(null)} />}
  </div>;
}

function EditContact({ contact, leadId, assignmentId, designationOptions, departmentOptions, onClose, onSaved }: { contact: LeadContact; leadId: string; assignmentId: string; designationOptions: string[]; departmentOptions: string[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [v, setV] = useState({ firstName: contact.first_name, lastName: contact.last_name ?? "", email: contact.email ?? "", phone: contact.phone ?? "", designation: contact.designation ?? "", departmentFunction: contact.department_function ?? "" });
  const [saving, setSaving] = useState(false);
  const save = async () => { setSaving(true); const r = await updateLeadContact(fd({ leadId, assignmentId, contactId: contact.id, ...v })); setSaving(false); toast(r.message); if (r.ok) onSaved(); };
  return <Win small title="Edit contact" onClose={onClose}><div className="win-b" style={{ padding: 14 }}>
    <div className="fgrid" style={{ padding: 0 }}>
      <div className="fld"><label>First name *</label><input value={v.firstName} onChange={(e) => setV({ ...v, firstName: e.target.value })} /></div>
      <div className="fld"><label>Last name</label><input value={v.lastName} onChange={(e) => setV({ ...v, lastName: e.target.value })} /></div>
      <div className="fld"><label>Email</label><input value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /></div>
      <div className="fld"><label>Phone</label><input value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} /></div>
      <div className="fld"><label>Designation</label><select value={v.designation} onChange={(e) => setV({ ...v, designation: e.target.value })}><option value="">{designationOptions.length ? "Select" : "No dropdown configured"}</option>{designationOptions.map((o) => <option key={o} value={o}>{o}</option>)}</select></div>
      <div className="fld"><label>Department/Function</label><select value={v.departmentFunction} onChange={(e) => setV({ ...v, departmentFunction: e.target.value })}><option value="">{departmentOptions.length ? "Select" : "No dropdown configured"}</option>{departmentOptions.map((o) => <option key={o} value={o}>{o}</option>)}</select></div>
    </div>
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}><button className="btn" onClick={onClose}>Cancel</button><button className="btn red" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save changes"}</button></div>
  </div></Win>;
}

function EmailContact({ leadId, assignmentId, to, name, onClose }: { leadId: string; assignmentId: string; to: string; name: string; onClose: () => void }) {
  const toast = useToast();
  const [subject, setSubject] = useState(""); const [body, setBody] = useState(""); const [sending, setSending] = useState(false);
  const send = async () => {
    if (!subject.trim() || !body.trim()) return toast("Enter a subject and a message.");
    setSending(true); const r = await sendEmailToLeadContact(fd({ leadId, assignmentId, to, subject, body })); setSending(false); toast(r.message);
    if (r.ok) onClose();
  };
  return <Win small title={`Email ${name || to}`} onClose={onClose}><div className="win-b" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
    <p style={{ color: "var(--muted)", fontSize: 12 }}>To: {to}. Sent from the assigned Sales Person&apos;s mailbox.</p>
    <div className="fld"><label>Subject</label><input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" /></div>
    <div className="fld"><label>Message</label><textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your message…" style={{ minHeight: 120 }} /></div>
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}><button className="btn" onClick={onClose}>Cancel</button><button className="btn red" disabled={sending} onClick={send}>{sending ? "Sending…" : "Send email"}</button></div>
  </div></Win>;
}
