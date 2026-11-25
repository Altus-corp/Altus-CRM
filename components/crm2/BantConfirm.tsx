"use client";

import { useState } from "react";
import type { LeadRow, Workspace } from "@/app/lib/crm2/types";
import type { BantField } from "@/app/lib/bant";
import { Win } from "./ui";

export function BantConfirm({ field, row, ws, onClose, onSave }: { field: Exclude<BantField, "a">; row: LeadRow; ws: Workspace; onClose: () => void; onSave: (value: string, key: string) => Promise<boolean> }) {
  const column = ws.columns.find((c) => c.source === "custom" && c.fieldType === "dropdown" && c.label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "") === "expectedclosing");
  const key = field === "b" ? "bant_budget_range" : field === "n" ? "bant_need_note" : column?.key ?? "";
  const [value, setValue] = useState(row.custom[key] ?? ""); const [busy, setBusy] = useState(false);
  const label = field === "b" ? "Budget range" : field === "n" ? "Need note" : "Expected Closing";
  const save = async () => { setBusy(true); try { await onSave(value.trim(), key); } finally { setBusy(false); } };
  return <Win small title={`Confirm ${field === "b" ? "budget" : field === "n" ? "need" : "timeline"}`} onClose={onClose}><div className="win-b" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
    <div className="fld"><label htmlFor="bant-confirm-detail">{label}</label>
      {field === "t" ? column && column.options.length ? <select id="bant-confirm-detail" value={value} onChange={(e) => setValue(e.target.value)}><option value="">Select</option>{column.options.map((o) => <option key={o} value={o}>{o}</option>)}</select> : <div>Ask an admin to configure the Expected Closing dropdown.</div>
        : field === "n" ? <textarea id="bant-confirm-detail" value={value} maxLength={2000} onChange={(e) => setValue(e.target.value)} /> : <input id="bant-confirm-detail" value={value} maxLength={2000} placeholder="e.g. ₹50,000–₹1,00,000" onChange={(e) => setValue(e.target.value)} />}
    </div><div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}><button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button><button type="button" className="btn red" disabled={busy || !value.trim() || (field === "t" && !column?.options.includes(value))} onClick={save}>{busy ? "Saving…" : "Save"}</button></div>
  </div></Win>;
}
