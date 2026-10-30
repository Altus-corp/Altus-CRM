"use client";

import { useState, type FormEvent } from "react";
import { importLeadsCsv } from "@/app/dashboard/leads/actions";
import { ManualLeadModal } from "./sales-leads-workspace";

type SampleColumn = { label: string; field_key: string; source?: string; field_type?: string; options?: string[]; computed_from?: string[] };
type Product = { id: string; code: string; name: string };
type NamedOption = { name: string };
type SalesPerson = { id: string; name: string };

const LEAD_TYPES = ["Database Leads", "Qualified Leads", "Reference Leads", "Leads"];
const FIXED_HEADERS = ["First Name", "Last Name", "Cell Number", "Lead Type", "Sales Person", "Product", "Additional Product 1", "Additional Product 2", "Additional Product 3", "Additional Product 4", "Additional Product 5"];

function normalize(value: string) { return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " "); }
function excelColumn(index: number) { let result = ""; let value = index; while (value > 0) { const remainder = (value - 1) % 26; result = String.fromCharCode(65 + remainder) + result; value = Math.floor((value - 1) / 26); } return result; }
function sampleValue(column: SampleColumn) { if (column.field_key === "stage") return "Pre PSO"; if (column.field_key === "call_resolution") return "Call for next"; if (column.field_key === "email") return "ananya@example.com"; if (column.field_key.includes("date")) return "23-jan-2026"; return "Sample value"; }

async function downloadSample(columns: SampleColumn[], products: Product[], resolutions: NamedOption[], salesPeople: SalesPerson[]) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Altus CRM";
  const sheet = workbook.addWorksheet("Leads", { views: [{ state: "frozen", ySplit: 1 }] });
  const fixedKeys = new Set(["first_name", "first", "name", "lead_name", "last_name", "last", "phone", "phone_number", "lead_type", "lead_database", "assigned_to", "sales_person", "product", "product_code"]);
  const fixedLabels = new Set(FIXED_HEADERS.map(normalize));
  const restColumns = columns.filter((column) => !column.computed_from?.length && !fixedKeys.has(column.field_key) && column.field_key !== "stage" && column.source !== "stage" && !fixedLabels.has(normalize(column.label)) && !/^additional product \d+$/i.test(column.label.trim()) && !["lead_number", "lead_acquisition_date", "created_at"].includes(column.field_key) && !["lead no", "lead number", "lead acquisition date", "stage"].includes(normalize(column.label)));
  const headers = [...FIXED_HEADERS, ...restColumns.map((column) => column.label)];
  const row = ["Ananya", "Sharma", "9876543210", "Database Leads", "", "PSO", "BSSO", "", "", "", "", ...restColumns.map(sampleValue)];
  sheet.addRow(headers); sheet.addRow(row);
  sheet.columns.forEach((column) => { column.width = Math.min(30, Math.max(16, String(column.header ?? "").length + 4)); });
  sheet.getColumn(3).numFmt = "@";
  sheet.getRow(1).eachCell((cell) => { cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD90000" } }; cell.alignment = { vertical: "middle" }; });
  sheet.autoFilter = { from: "A1", to: `${excelColumn(headers.length)}1` };

  const lists = workbook.addWorksheet("Lists"); lists.state = "veryHidden";
  const validations = new Map<number, string[]>();
  validations.set(4, LEAD_TYPES);
  validations.set(5, salesPeople.map((person) => person.name));
  validations.set(6, products.map((product) => product.code));
  [7, 8, 9, 10, 11].forEach((index) => validations.set(index, products.map((product) => product.code)));
  restColumns.forEach((column, index) => {
    const target = FIXED_HEADERS.length + index + 1;
    if (column.field_key === "call_resolution" || column.source === "resolution") validations.set(target, resolutions.map((resolution) => resolution.name));
    else if (column.field_type === "dropdown" && column.options?.length) validations.set(target, column.options);
  });
  const validationSheet = sheet as unknown as { dataValidations: { add: (range: string, rule: unknown) => void } };
  let listIndex = 1;
  validations.forEach((values, targetIndex) => {
    const options = [...new Set(values.map((value) => value.trim()).filter(Boolean))]; if (!options.length) return;
    const listColumn = excelColumn(listIndex);
    lists.getCell(`${listColumn}1`).value = headers[targetIndex - 1];
    options.forEach((option, optionIndex) => { lists.getCell(`${listColumn}${optionIndex + 2}`).value = option; });
    validationSheet.dataValidations.add(`${excelColumn(targetIndex)}2:${excelColumn(targetIndex)}1001`, { type: "list", allowBlank: true, formulae: [`'Lists'!$${listColumn}$2:$${listColumn}$${options.length + 1}`], showErrorMessage: true, errorStyle: "error", errorTitle: "Choose a listed value", error: "Select a value from the dropdown." });
    listIndex += 1;
  });
  [[1, "First Name is required."], [2, "Last Name is required."], [3, "Cell Number must have exactly 10 digits."]].forEach(([index, error]) => validationSheet.dataValidations.add(`${excelColumn(Number(index))}2:${excelColumn(Number(index))}1001`, { type: "custom", allowBlank: false, formulae: [Number(index) === 3 ? `AND(LEN(${excelColumn(Number(index))}2)=10,ISNUMBER(--${excelColumn(Number(index))}2))` : `${excelColumn(Number(index))}2<>""`], showErrorMessage: true, errorStyle: "error", errorTitle: "Required field", error }));
  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const link = document.createElement("a"); link.href = url; link.download = "leads-import-template.xlsx"; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function AdminLeadImport({ sampleColumns, products, resolutions, salesPeople, ownImports = false }: { sampleColumns: SampleColumn[]; products: Product[]; resolutions: NamedOption[]; salesPeople: SalesPerson[]; ownImports?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const [addMode, setAddMode] = useState<"choice" | "manual" | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setIsImporting(true); setMessage(null);
    try {
      const result = await importLeadsCsv(new FormData(form));
      setMessage({ ok: result.ok, text: result.ok ? `${result.message} ${result.imported ?? 0} added${result.skipped ? `, ${result.skipped} skipped` : ""}.` : result.message });
      if (result.ok) form.reset();
    } catch {
      setMessage({ ok: false, text: "The import could not be completed. Refresh the leads list before retrying." });
    } finally { setIsImporting(false); }
  }
  return <>
    <button type="button" onClick={() => { if (ownImports) setAddMode("choice"); else setIsOpen(true); setMessage(null); }} className="h-9 rounded-md bg-[#d90000] px-3 text-xs font-extrabold text-white shadow-sm hover:bg-red-700">+ Add Lead</button>
    {addMode === "choice" && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-labelledby="add-ambassador-lead-title">
      <div className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4"><div><p className="text-[11px] font-extrabold tracking-[0.12em] text-red-600">LEADS</p><h2 id="add-ambassador-lead-title" className="mt-1 text-xl font-extrabold text-slate-900">Add leads</h2><p className="mt-1 text-sm text-slate-500">Add a lead manually or import in bulk. All leads are assigned to you and kept outside round robin.</p></div><button type="button" onClick={() => setAddMode(null)} aria-label="Close" className="h-8 w-8 shrink-0 rounded-lg text-slate-500 hover:bg-slate-100">&#215;</button></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => setAddMode("manual")} className="rounded-xl border border-red-200 bg-red-50 p-5 text-left hover:bg-red-100"><span className="block text-base font-extrabold text-red-700">Manual</span><span className="mt-1 block text-sm text-slate-600">Enter one lead using a form.</span></button>
          <button type="button" onClick={() => { setAddMode(null); setIsOpen(true); }} className="rounded-xl border border-slate-200 p-5 text-left hover:bg-slate-50"><span className="block text-base font-extrabold text-slate-900">Bulk import</span><span className="mt-1 block text-sm text-slate-600">Upload multiple leads with Excel or CSV.</span></button>
        </div>
      </div>
    </div>}
    {addMode === "manual" && <ManualLeadModal products={products} outsideRoundRobin onClose={() => setAddMode(null)} />}
    {isOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-labelledby="import-leads-title"><form onSubmit={submit} className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-[11px] font-extrabold tracking-[0.12em] text-red-600">LEADS MASTER</p><h2 id="import-leads-title" className="mt-1 text-xl font-extrabold text-slate-900">Import leads</h2><p className="mt-1 text-sm text-slate-500">{ownImports ? "Upload Excel or CSV. Imported leads are assigned to you and kept outside round robin." : "Upload Excel or CSV. Lead Type controls the destination of each row."}</p></div><button type="button" onClick={() => setIsOpen(false)} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100">&#215;</button></div><div className="mt-5 rounded-lg border border-red-100 bg-red-50 p-3 text-xs text-red-700"><p className="font-extrabold">Need the current format?</p><button type="button" disabled={isDownloading} onClick={async () => { setIsDownloading(true); try { await downloadSample(sampleColumns, products, resolutions, salesPeople); } finally { setIsDownloading(false); } }} className="mt-1 font-bold underline disabled:opacity-50">{isDownloading ? "Preparing Excel..." : "Download Excel template"}</button></div><label className="mt-3 block rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center"><span className="text-sm font-extrabold text-slate-700">Choose Excel or CSV file</span><span className="mt-1 block text-xs text-slate-500">{ownImports ? "First Name, Last Name, and a 10-digit Cell Number are required. Sales Person is ignored: all imports are assigned to you. Product defaults to PSO and Lead Type to Database Leads when blank." : "First Name, Last Name, and a 10-digit Cell Number are required. Leave Sales Person blank to keep the lead unassigned. Product defaults to PSO and Lead Type defaults to Database Leads when blank."}</span><input name="file" type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" required className="mt-3 block w-full text-xs text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-white file:px-3 file:py-2 file:text-xs file:font-bold file:text-slate-700" /></label>{message && <p className={`mt-3 rounded-lg px-3 py-2 text-sm font-semibold ${message.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{message.text}</p>}<div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => setIsOpen(false)} className="h-9 rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-600 hover:bg-slate-50">Cancel</button><button disabled={isImporting} className="h-9 rounded-lg bg-[#d90000] px-4 text-sm font-extrabold text-white hover:bg-red-700 disabled:opacity-60">{isImporting ? "Importing..." : "Import leads"}</button></div></form></div>}
  </>;
}
