"use client";

import { useState, type FormEvent } from "react";
import { Download, FileSpreadsheet, Plus, Upload, X } from "lucide-react";
import { createOwnAmbassador, importAmbassadors, type AmbassadorInput } from "@/app/dashboard/my-ambassador/actions";

const headers = ["Participant First Name", "Participant Last Name", "Cell Number", "Email"];
const normalize = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ");
const emptyInput = (): AmbassadorInput => ({ firstName: "", lastName: "", cellNumber: "", email: "", salesPersonId: "", commission: "", commissionNotes: "", priority: "", agreementStatus: "", signedAgreementLink: "", lastCalledOn: "", lastCallNotes: "", remark: "", mananSirNotes: "", targetLeads: "", targetDemo: "", targetProposals: "", targetSales: "" });
const inputClass = "mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-50";

// Excel auto-converts typed emails/links into hyperlink cells, whose raw
// value is an object like { text, hyperlink }, not a plain string — reading
// that with String(value) produces "[object Object]" instead of the text.
function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const record = value as { text?: unknown; richText?: { text?: unknown }[]; result?: unknown };
    if (typeof record.text === "string") return record.text;
    if (Array.isArray(record.richText)) return record.richText.map((part) => (typeof part.text === "string" ? part.text : "")).join("");
    if ("result" in record) return cellText(record.result);
    return "";
  }
  return String(value);
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/45 p-3" role="dialog" aria-modal="true" aria-label={title}>
    <div className="max-h-[calc(100svh-24px)] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
      <div className="flex items-start justify-between gap-4">
        <div><p className="text-[10px] font-extrabold tracking-[0.15em] text-red-600">AMBASSADOR</p><h2 className="mt-1 text-xl font-extrabold text-slate-900">{title}</h2></div>
        <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Close"><X className="h-4 w-4" /></button>
      </div>
      {children}
    </div>
  </div>;
}

export function AmbassadorAddModal() {
  const [step, setStep] = useState<"choice" | "manual" | "bulk" | null>(null);
  const close = () => setStep(null);

  // Manual single-record state
  const [draft, setDraft] = useState<AmbassadorInput>(emptyInput());
  const [manualMessage, setManualMessage] = useState("");
  const [manualPending, setManualPending] = useState(false);
  const set = (key: keyof AmbassadorInput, next: string) => setDraft((current) => ({ ...current, [key]: next }));
  async function submitManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setManualPending(true);
    setManualMessage("");
    const result = await createOwnAmbassador(draft);
    setManualPending(false);
    setManualMessage(result.message);
    if (result.ok) setDraft(emptyInput());
  }

  // Bulk import state
  const [file, setFile] = useState<File | null>(null);
  const [bulkMessage, setBulkMessage] = useState("");
  const [bulkPending, setBulkPending] = useState(false);

  async function downloadTemplate() {
    const ExcelJS = (await import("exceljs")).default;
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet("Ambassadors", { views: [{ state: "frozen", ySplit: 1 }] });
    sheet.addRow(headers);
    sheet.addRow(["Mayur", "Gaikwad", "9876543210", "mayur@example.com"]);
    sheet.getRow(1).eachCell((cell) => { cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD90000" } }; });
    sheet.getColumn(3).numFmt = "@";
    sheet.columns.forEach((column) => { column.width = Math.max(18, String(column.header ?? "").length + 4); });
    const lastRow = 501;
    const requiredValidation = (formula: string, error: string) => ({ type: "custom" as const, allowBlank: false, formulae: [formula], showErrorMessage: true, errorStyle: "stop" as const, errorTitle: "Required field", error });
    for (let row = 2; row <= lastRow; row += 1) {
      sheet.getCell(`A${row}`).dataValidation = requiredValidation(`A${row}<>""`, "Participant First Name is required.");
      sheet.getCell(`B${row}`).dataValidation = requiredValidation(`B${row}<>""`, "Participant Last Name is required.");
      sheet.getCell(`C${row}`).dataValidation = requiredValidation(`AND(LEN(C${row})=10,ISNUMBER(--C${row}))`, "Cell Number must contain exactly 10 digits.");
    }
    const buffer = await book.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "ambassador-import-template.xlsx";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importFile(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    setBulkPending(true);
    setBulkMessage("");
    try {
      const ExcelJS = (await import("exceljs")).default;
      const book = new ExcelJS.Workbook();
      await book.xlsx.load(await file.arrayBuffer() as never);
      const sheet = book.worksheets[0];
      const values: string[][] = [];
      sheet?.eachRow({ includeEmpty: false }, (row) => {
        const rowValues = Array.isArray(row.values) ? row.values.slice(1).map((value) => cellText(value).trim()) : [];
        if (rowValues.some(Boolean)) values.push(rowValues);
      });
      const indexes = new Map((values[0] ?? []).map((header, index) => [normalize(header), index]));
      const get = (row: string[], header: string) => row[indexes.get(normalize(header)) ?? -1] ?? "";
      const parsed = values.slice(1).map((row) => ({
        ...emptyInput(),
        firstName: get(row, "Participant First Name"), lastName: get(row, "Participant Last Name"),
        cellNumber: get(row, "Cell Number"), email: get(row, "Email"),
      }));
      const result = await importAmbassadors(parsed);
      setBulkMessage(result.message);
      if (result.ok) setFile(null);
    } catch {
      setBulkMessage("The spreadsheet could not be read. Use the downloaded Excel template.");
    } finally {
      setBulkPending(false);
    }
  }

  return <>
    <button type="button" onClick={() => setStep("choice")} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#d90000] px-3 text-xs font-extrabold text-white hover:bg-red-700"><Plus className="h-3.5 w-3.5" />Add Ambassador</button>

    {step === "choice" && <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-label="Add Ambassador">
      <div className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-[10px] font-extrabold tracking-[0.15em] text-red-600">AMBASSADOR</p><h2 className="mt-1 text-xl font-extrabold text-slate-900">Add Ambassador</h2><p className="mt-1 text-sm text-slate-500">Add one Ambassador manually, or upload many from the standard template.</p></div>
          <button type="button" onClick={close} aria-label="Close" className="h-8 w-8 shrink-0 rounded-lg text-slate-500 hover:bg-slate-100">&#215;</button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => setStep("manual")} className="rounded-xl border border-red-200 bg-red-50 p-5 text-left hover:bg-red-100"><span className="block text-base font-extrabold text-red-700">Manual</span><span className="mt-1 block text-sm text-slate-600">Add one Ambassador using a form.</span></button>
          <button type="button" onClick={() => setStep("bulk")} className="rounded-xl border border-slate-200 p-5 text-left hover:bg-slate-50"><span className="block text-base font-extrabold text-slate-900">Bulk upload</span><span className="mt-1 block text-sm text-slate-600">Upload multiple Ambassadors with Excel.</span></button>
        </div>
      </div>
    </div>}

    {step === "manual" && <Modal title="Add Ambassador" onClose={close}>
      <p className="mt-1 text-sm text-slate-500">First and Last Name are stored separately and displayed as Full Name. This record will be assigned to you.</p>
      <form onSubmit={submitManual} className="mt-5">
        <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
          <label className="text-xs font-bold text-slate-700">Participant First Name *<input value={draft.firstName} onChange={(e) => set("firstName", e.target.value)} required className={inputClass} /></label>
          <label className="text-xs font-bold text-slate-700">Participant Last Name *<input value={draft.lastName} onChange={(e) => set("lastName", e.target.value)} required className={inputClass} /></label>
          <label className="text-xs font-bold text-slate-700">Cell Number *<input value={draft.cellNumber} onChange={(e) => set("cellNumber", e.target.value.replace(/\D/g, "").slice(-10))} inputMode="numeric" required className={inputClass} /></label>
          <label className="text-xs font-bold text-slate-700">Email <span className="font-medium text-slate-400">(optional)</span><input value={draft.email ?? ""} onChange={(e) => set("email", e.target.value)} type="email" maxLength={254} placeholder="name@example.com" className={inputClass} /></label>
        </div>
        {manualMessage && <p className={`mt-3 rounded-lg px-3 py-2 text-xs font-semibold ${manualMessage.includes("created") ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{manualMessage}</p>}
        <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button type="button" onClick={close} className="h-9 rounded-lg border border-slate-200 px-4 text-xs font-bold text-slate-600">{manualMessage ? "OK" : "Cancel"}</button>
          <button disabled={manualPending} className="h-9 rounded-lg bg-[#d90000] px-4 text-xs font-extrabold text-white disabled:opacity-60">{manualPending ? "Saving…" : "Create Ambassador"}</button>
        </div>
      </form>
    </Modal>}

    {step === "bulk" && <Modal title="Bulk Import Ambassadors" onClose={close}>
      <p className="mt-1 text-sm text-slate-500">Download the template, complete the listed columns, and upload up to 500 records. Every imported Ambassador is assigned to you.</p>
      <button type="button" onClick={downloadTemplate} className="mt-4 inline-flex items-center gap-2 text-xs font-extrabold text-red-600 underline"><Download className="h-4 w-4" />Download Excel template</button>
      <form onSubmit={importFile} className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
        <FileSpreadsheet className="h-6 w-6 text-red-600" />
        <label className="mt-2 block text-xs font-bold text-slate-700">Excel file<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="mt-2 block w-full text-xs" /></label>
        {bulkMessage && <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">{bulkMessage}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={close} className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-xs font-bold">{bulkMessage ? "OK" : "Cancel"}</button>
          <button disabled={bulkPending} className="h-9 rounded-lg bg-[#d90000] px-4 text-xs font-extrabold text-white disabled:opacity-60"><Upload className="mr-1.5 inline h-3.5 w-3.5" />{bulkPending ? "Importing…" : "Import records"}</button>
        </div>
      </form>
    </Modal>}
  </>;
}
