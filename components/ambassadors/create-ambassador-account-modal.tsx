"use client";

import { useActionState, useEffect, useState, type FormEvent } from "react";
import { Download, FileSpreadsheet, Upload, X } from "lucide-react";
import { PasswordField } from "@/components/auth/password-field";
import { createAmbassadorAccount, importAmbassadorAccounts } from "@/app/dashboard/my-ambassador/actions";

const headers = ["First Name", "Last Name", "Email", "Mobile Number", "Password"];
const normalize = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ");

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
  return <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/45 p-4 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-label={title}>
    <section className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl">
      <div className="flex items-start justify-between gap-4">
        <div><p className="text-[10px] font-extrabold tracking-[0.14em] text-red-600">AMBASSADOR ACCOUNT</p><h2 className="mt-1 text-xl font-extrabold text-slate-900">{title}</h2></div>
        <button type="button" onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
      </div>
      {children}
    </section>
  </div>;
}

function ManualAccountForm({ onClose }: { onClose: () => void }) {
  const [passwordMode, setPasswordMode] = useState<"manual" | "generated">("manual");
  const [state, action, isPending] = useActionState(createAmbassadorAccount, {});

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape" && !isPending) onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isPending, onClose]);

  return <>
    <p className="mt-1 text-sm text-slate-500">Create an Ambassador-only CRM login. Their temporary credentials will be sent by email.</p>
    <form action={action} className="mt-5 space-y-4">
      {state.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{state.error}</p>}
      {state.success && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">{state.success}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-bold text-slate-700">First name *<input name="firstName" required placeholder="John" className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-medium outline-none focus:border-red-500" /></label>
        <label className="text-xs font-bold text-slate-700">Last name *<input name="lastName" required placeholder="Doe" className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-medium outline-none focus:border-red-500" /></label>
        <label className="text-xs font-bold text-slate-700">Email address *<input name="email" type="email" required placeholder="john@example.com" className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-medium outline-none focus:border-red-500" /></label>
        <label className="text-xs font-bold text-slate-700">Mobile number *<input name="phone" type="tel" inputMode="numeric" required placeholder="9876543210" className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-medium outline-none focus:border-red-500" /></label>
      </div>
      <fieldset>
        <legend className="text-xs font-bold text-slate-700">Temporary password *</legend>
        <div className="mt-1.5 flex gap-2">
          <label className={`cursor-pointer rounded-md border px-3 py-1.5 text-xs font-bold ${passwordMode === "manual" ? "border-red-400 bg-red-50 text-red-700" : "border-slate-200 text-slate-600"}`}><input className="sr-only" type="radio" name="passwordMode" value="manual" checked={passwordMode === "manual"} onChange={() => setPasswordMode("manual")} />Set manually</label>
          <label className={`cursor-pointer rounded-md border px-3 py-1.5 text-xs font-bold ${passwordMode === "generated" ? "border-red-400 bg-red-50 text-red-700" : "border-slate-200 text-slate-600"}`}><input className="sr-only" type="radio" name="passwordMode" value="generated" checked={passwordMode === "generated"} onChange={() => setPasswordMode("generated")} />Generate automatically</label>
        </div>
        {passwordMode === "manual" && <PasswordField name="password" required minLength={12} autoComplete="new-password" placeholder="Enter password" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-medium outline-none focus:border-red-500" />}
        <p className="mt-1 text-[11px] font-medium text-slate-500">Minimum 12 characters: uppercase, lowercase, number, and symbol.</p>
      </fieldset>
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" disabled={isPending} onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-4 text-xs font-bold text-slate-600 disabled:opacity-50">{state.success ? "OK" : "Cancel"}</button><button disabled={isPending} className="h-9 rounded-lg bg-[#d90000] px-4 text-xs font-extrabold text-white disabled:opacity-60">{isPending ? "Creating…" : "Create Ambassador account"}</button></div>
    </form>
  </>;
}

function BulkAccountImport({ onClose }: { onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function downloadTemplate() {
    const ExcelJS = (await import("exceljs")).default;
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet("Ambassador Accounts", { views: [{ state: "frozen", ySplit: 1 }] });
    sheet.addRow(headers);
    sheet.addRow(["John", "Doe", "john@example.com", "9876543210", "Str0ng!Passw0rd"]);
    sheet.getRow(1).eachCell((cell) => { cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD90000" } }; });
    sheet.getColumn(4).numFmt = "@";
    sheet.columns.forEach((column) => { column.width = Math.max(18, String(column.header ?? "").length + 4); });
    const lastRow = 501;
    const requiredValidation = (formula: string, error: string) => ({ type: "custom" as const, allowBlank: false, formulae: [formula], showErrorMessage: true, errorStyle: "stop" as const, errorTitle: "Required field", error });
    for (let row = 2; row <= lastRow; row += 1) {
      sheet.getCell(`A${row}`).dataValidation = requiredValidation(`A${row}<>""`, "First Name is required.");
      sheet.getCell(`B${row}`).dataValidation = requiredValidation(`B${row}<>""`, "Last Name is required.");
      sheet.getCell(`D${row}`).dataValidation = requiredValidation(`AND(LEN(D${row})=10,ISNUMBER(--D${row}))`, "Mobile Number must contain exactly 10 digits.");
      sheet.getCell(`E${row}`).dataValidation = requiredValidation(`LEN(E${row})>=12`, "Password must be at least 12 characters (uppercase, lowercase, number, and symbol).");
    }
    const buffer = await book.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "ambassador-account-import-template.xlsx";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importFile(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    setPending(true);
    setMessage("");
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
        firstName: get(row, "First Name"), lastName: get(row, "Last Name"), email: get(row, "Email"),
        phone: get(row, "Mobile Number"), password: get(row, "Password"),
      }));
      const result = await importAmbassadorAccounts(parsed);
      setMessage(result.message);
      if (result.ok) setFile(null);
    } catch {
      setMessage("The spreadsheet could not be read. Use the downloaded Excel template.");
    } finally {
      setPending(false);
    }
  }

  return <>
    <p className="mt-1 text-sm text-slate-500">Download the template, set each Ambassador&apos;s own 12-character password in the Password column, and upload up to 500 accounts. Credentials are emailed to each Ambassador automatically.</p>
    <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">Each password needs uppercase, lowercase, a number, and a symbol. Delete the completed sheet from your computer after uploading, since it contains plain-text passwords.</p>
    <button type="button" onClick={downloadTemplate} className="mt-4 inline-flex items-center gap-2 text-xs font-extrabold text-red-600 underline"><Download className="h-4 w-4" />Download Excel template</button>
    <form onSubmit={importFile} className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
      <FileSpreadsheet className="h-6 w-6 text-red-600" />
      <label className="mt-2 block text-xs font-bold text-slate-700">Excel file<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="mt-2 block w-full text-xs" /></label>
      {message && <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">{message}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-xs font-bold">{message ? "OK" : "Cancel"}</button>
        <button disabled={pending} className="h-9 rounded-lg bg-[#d90000] px-4 text-xs font-extrabold text-white disabled:opacity-60"><Upload className="mr-1.5 inline h-3.5 w-3.5" />{pending ? "Importing…" : "Import accounts"}</button>
      </div>
    </form>
  </>;
}

export function CreateAmbassadorAccountModal() {
  const [step, setStep] = useState<"choice" | "manual" | "bulk" | null>(null);
  const close = () => setStep(null);

  return <>
    <button type="button" onClick={() => setStep("choice")} className="h-9 rounded-lg bg-[#d90000] px-4 text-xs font-extrabold text-white shadow-sm hover:bg-red-700">+ Create Ambassador Account</button>

    {step === "choice" && <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/45 p-4 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-label="Create Ambassador Account">
      <div className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-[10px] font-extrabold tracking-[0.14em] text-red-600">AMBASSADOR ACCOUNT</p><h2 className="mt-1 text-xl font-extrabold text-slate-900">Create Ambassador Account</h2><p className="mt-1 text-sm text-slate-500">Create one Ambassador login manually, or upload many from the standard template.</p></div>
          <button type="button" onClick={close} aria-label="Close" className="h-8 w-8 shrink-0 rounded-lg text-slate-500 hover:bg-slate-100">&#215;</button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => setStep("manual")} className="rounded-xl border border-red-200 bg-red-50 p-5 text-left hover:bg-red-100"><span className="block text-base font-extrabold text-red-700">Manual</span><span className="mt-1 block text-sm text-slate-600">Create one Ambassador account using a form.</span></button>
          <button type="button" onClick={() => setStep("bulk")} className="rounded-xl border border-slate-200 p-5 text-left hover:bg-slate-50"><span className="block text-base font-extrabold text-slate-900">Bulk upload</span><span className="mt-1 block text-sm text-slate-600">Create many Ambassador accounts with Excel.</span></button>
        </div>
      </div>
    </div>}

    {step === "manual" && <Modal title="Create Ambassador Account" onClose={close}><ManualAccountForm onClose={close} /></Modal>}
    {step === "bulk" && <Modal title="Bulk Import Ambassador Accounts" onClose={close}><BulkAccountImport onClose={close} /></Modal>}
  </>;
}
