"use client";

import { useState, type FormEvent } from "react";
import { importLeadsCsv } from "@/app/dashboard/leads/actions";

type SampleColumn = { label: string; field_key: string; computed_from?: string[] };

function downloadSample(columns: SampleColumn[]) {
  const importColumns = columns.filter((column) => !column.computed_from?.length);
  const headers = importColumns.map((column) => column.label);
  const sample = importColumns.map((column) => {
    if (column.field_key === "lead_name") return "Ananya Sharma";
    if (column.field_key === "product") return "BSSO";
    if (column.field_key === "stage") return "Pre BSSO";
    if (column.field_key === "call_resolution") return "Call for next";
    if (column.field_key === "email") return "ananya@example.com";
    if (column.field_key === "phone") return "+919876543210";
    if (column.field_key.includes("date")) return "23-jan-2026";
    return "Sample value";
  });
  const csv = [headers, sample].map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "leads-import-sample.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function AdminLeadImport({ sampleColumns }: { sampleColumns: SampleColumn[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsImporting(true);
    setMessage(null);
    const result = await importLeadsCsv(new FormData(event.currentTarget));
    setIsImporting(false);
    setMessage({ ok: result.ok, text: result.ok ? `${result.message} ${result.imported ?? 0} added${result.skipped ? `, ${result.skipped} skipped` : ""}.` : result.message });
    if (result.ok) event.currentTarget.reset();
  }

  return <>
    <button type="button" onClick={() => { setIsOpen(true); setMessage(null); }} className="h-9 rounded-md bg-[#d90000] px-3 text-xs font-extrabold text-white shadow-sm hover:bg-red-700">＋ Add Lead</button>
    {isOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-labelledby="import-leads-title">
      <form onSubmit={submit} className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4"><div><p className="text-[11px] font-extrabold tracking-[0.12em] text-red-600">LEADS MASTER</p><h2 id="import-leads-title" className="mt-1 text-xl font-extrabold text-slate-900">Import leads</h2><p className="mt-1 text-sm text-slate-500">Upload a CSV file and select where these leads belong.</p></div><button type="button" onClick={() => setIsOpen(false)} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100">×</button></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="text-sm font-bold text-slate-700">Lead database<select name="leadDatabase" required defaultValue="" className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-red-400"><option value="" disabled>Select database</option><option value="leads">Leads</option><option value="reference_leads">Reference Leads</option><option value="qualified_leads">Qualified Leads</option><option value="database_leads">Database Leads</option></select></label><div className="rounded-lg border border-red-100 bg-red-50 p-3 text-xs text-red-700"><p className="font-extrabold">Need the current format?</p><button type="button" onClick={() => downloadSample(sampleColumns)} className="mt-1 font-bold underline">Download configured sample CSV</button></div></div>
        <label className="mt-3 block rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center"><span className="text-sm font-extrabold text-slate-700">Choose CSV file</span><span className="mt-1 block text-xs text-slate-500">The sample uses the columns configured in Columns Management. Product is required for every imported lead.</span><input name="file" type="file" accept=".csv,text/csv" required className="mt-3 block w-full text-xs text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-white file:px-3 file:py-2 file:text-xs file:font-bold file:text-slate-700" /></label>
        {message && <p className={`mt-3 rounded-lg px-3 py-2 text-sm font-semibold ${message.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{message.text}</p>}
        <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => setIsOpen(false)} className="h-9 rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-600 hover:bg-slate-50">Cancel</button><button disabled={isImporting} className="h-9 rounded-lg bg-[#d90000] px-4 text-sm font-extrabold text-white hover:bg-red-700 disabled:opacity-60">{isImporting ? "Importing..." : "Import leads"}</button></div>
      </form>
    </div>}
  </>;
}
