"use client";

import { useState, useTransition, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { LeadsTable, type LeadColumn, type LeadRow } from "./leads-table";
import {
  createManualLead,
  importLeadsCsv,
  manuallyAssignLeads,
} from "@/app/dashboard/leads/actions";

type Product = { id: string; code: string; name: string };
type Stage = { id: string; product_id: string; name: string; position: number };
type ProductResolution = {
  product_id: string;
  resolution_id: string;
  resolution_name: string;
};
type TeamMember = { id: string; name: string };

export function SalesLeadsWorkspace({
  columns,
  leads,
  focusedLeadIds,
  assignedNames,
  preferences,
  products,
  stages,
  productResolutions,
  isSalesManager = false,
  teamMembers = [],
}: {
  columns: LeadColumn[];
  leads: LeadRow[];
  focusedLeadIds: string[];
  assignedNames: Record<string, string>;
  preferences: {
    order: string[];
    widths: Record<string, number>;
    frozen: string[];
    hidden: string[];
  };
  products: Product[];
  stages: Stage[];
  productResolutions: ProductResolution[];
  isSalesManager?: boolean;
  teamMembers?: TeamMember[];
}) {
  // Focused Leads is the sales user's starting workspace; Lead Master is the second view.
  const urlView =
    useSearchParams().get("view") === "master" ? "master" : "focused";
  const [view, setView] = useState<"master" | "focused">(urlView);
  const [syncedUrlView, setSyncedUrlView] = useState(urlView);
  const [addLeadMode, setAddLeadMode] = useState<
    "choice" | "manual" | "bulk" | null
  >(null);
  const router = useRouter();
  const [selectedAssignmentIds, setSelectedAssignmentIds] = useState<string[]>([]);
  const [assigneeId, setAssigneeId] = useState("");
  const [assignmentMessage, setAssignmentMessage] = useState("");
  const [isAssigning, startAssigning] = useTransition();
  if (syncedUrlView !== urlView) {
    setSyncedUrlView(urlView);
    setView(urlView);
  }
  const focusedIds = new Set(focusedLeadIds);
  const displayedLeads =
    view === "focused"
      ? leads.filter((lead) => focusedIds.has(lead.assignment_id))
      : leads;
  const assignSelected = () => {
    if (!assigneeId || !selectedAssignmentIds.length) return;
    const formData = new FormData();
    formData.set("assigneeId", assigneeId);
    selectedAssignmentIds.forEach((assignmentId) => formData.append("assignmentId", assignmentId));
    setAssignmentMessage("");
    startAssigning(async () => {
      try {
        await manuallyAssignLeads(formData);
        setSelectedAssignmentIds([]);
        setAssigneeId("");
        setAssignmentMessage("Selected leads were assigned to your team member.");
        router.refresh();
      } catch (error) {
        setAssignmentMessage(error instanceof Error ? error.message : "Unable to assign the selected leads.");
      }
    });
  };

  return (
    <section className="mx-auto max-w-7xl" aria-label="Sales leads">
      <header className="border border-slate-200 bg-white px-4 py-3">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <div>
            <p className="text-[10px] font-extrabold tracking-[0.12em] text-red-600">
              LEADS
            </p>
            <h1 className="mt-0.5 text-[19px] font-extrabold tracking-[-0.04em] text-slate-900">
              {view === "focused" ? "Focused leads" : "Lead Master"}
            </h1>
            <p className="mt-1 text-xs text-slate-500">
              {view === "focused"
                ? "Leads assigned to you today. Tomorrow they move to Lead Master."
                : "All leads assigned to you, including leads from earlier days."}
            </p>
          </div>
          <span className="text-xs font-bold text-slate-500">
            {displayedLeads.length} records shown
          </span>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 [&>button:first-child]:order-2 [&>button:last-child]:order-1">
          <button
            type="button"
            onClick={() => setView("master")}
            className={`rounded border px-3 py-2 text-left transition ${view === "master" ? "border-red-200 border-b-2 border-b-red-600 bg-red-50/60" : "border-slate-200 bg-slate-50 hover:border-slate-300"}`}
          >
            <p className="text-xs font-extrabold text-slate-800">Lead Master</p>
            <p className="mt-0.5 text-[10px] text-slate-500">
              All assigned leads · {leads.length}
            </p>
          </button>
          <button
            type="button"
            onClick={() => setView("focused")}
            className={`rounded border px-3 py-2 text-left transition ${view === "focused" ? "border-red-200 border-b-2 border-b-red-600 bg-red-50/60" : "border-slate-200 bg-slate-50 hover:border-slate-300"}`}
          >
            <p className="text-xs font-extrabold text-slate-800">
              Focused Leads
            </p>
            <p className="mt-0.5 text-[10px] text-slate-500">
              Assigned today · {focusedLeadIds.length}
            </p>
          </button>
        </div>
      </header>
      {isSalesManager && (
        <section className="mt-3 rounded-lg border border-red-100 bg-red-50/50 px-4 py-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div><p className="text-sm font-extrabold text-slate-800">Assign selected leads to your team</p><p className="mt-0.5 text-xs text-slate-500">You can delegate only product work currently assigned to you.</p></div>
            <div className="flex flex-wrap items-center gap-2">
              <select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)} disabled={isAssigning || !teamMembers.length} className="h-9 min-w-52 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 disabled:bg-slate-100">
                <option value="">{teamMembers.length ? "Choose team member" : "No team members configured"}</option>
                {teamMembers.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
              </select>
              <button type="button" onClick={assignSelected} disabled={isAssigning || !assigneeId || !selectedAssignmentIds.length} className="h-9 rounded-md bg-[#d90000] px-4 text-xs font-extrabold text-white disabled:cursor-not-allowed disabled:bg-slate-300">{isAssigning ? "Assigning…" : `Assign selected${selectedAssignmentIds.length ? ` (${selectedAssignmentIds.length})` : ""}`}</button>
            </div>
          </div>
          {assignmentMessage && <p className={`mt-2 text-xs font-bold ${assignmentMessage.startsWith("Selected") ? "text-emerald-700" : "text-red-700"}`}>{assignmentMessage}</p>}
        </section>
      )}
      <div className="mt-3">
        <LeadsTable
          columns={columns}
          leads={displayedLeads}
          assignedNames={assignedNames}
          preferences={preferences}
          editableConfiguration={{ products, stages, productResolutions }}
          showHeader={false}
          onAddLead={() => setAddLeadMode("choice")}
          selectedIds={isSalesManager ? selectedAssignmentIds : []}
          onSelectionChange={isSalesManager ? setSelectedAssignmentIds : undefined}
        />
      </div>
      {addLeadMode === "choice" && (
        <AddLeadChoiceModal
          onManual={() => setAddLeadMode("manual")}
          onBulk={() => setAddLeadMode("bulk")}
          onClose={() => setAddLeadMode(null)}
        />
      )}
      {addLeadMode === "manual" && (
        <ManualLeadModal
          products={products}
          onClose={() => setAddLeadMode(null)}
        />
      )}
      {addLeadMode === "bulk" && (
        <BulkLeadModal
          products={products}
          onClose={() => setAddLeadMode(null)}
        />
      )}
    </section>
  );
}

export function ManualLeadModal({
  products,
  onClose,
  outsideRoundRobin = false,
}: {
  products: Product[];
  onClose: () => void;
  outsideRoundRobin?: boolean;
}) {
  const router = useRouter();
  const [productId, setProductId] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("productId", productId);
    startTransition(async () => {
      try {
        const result = await createManualLead(formData);
        setMessage(result.message);
        if (result.ok) {
          router.refresh();
          window.setTimeout(onClose, 600);
        }
      } catch {
        setMessage("Unable to add the lead. Refresh the leads list before retrying.");
      }
    });
  };
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[120] grid place-items-center bg-slate-950/35 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="manual-lead-title"
    >
      <form
        onSubmit={submit}
        className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-extrabold tracking-[0.13em] text-red-600">
              MANUAL LEAD
            </p>
            <h2
              id="manual-lead-title"
              className="mt-1 text-xl font-extrabold text-slate-900"
            >
              Add lead
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {outsideRoundRobin ? "The lead will be assigned to you and kept outside round robin." : "The lead will be assigned to you and recorded in its activity trail."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            aria-label="Close"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
          >
            ×
          </button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-bold text-slate-700">
            First name *
            <input
              required
              name="firstName"
              maxLength={120}
              autoFocus
              className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-red-400"
            />
          </label>
          <label className="text-xs font-bold text-slate-700">
            Last name
            <input
              name="lastName"
              maxLength={120}
              className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-red-400"
            />
          </label>
          <label className="text-xs font-bold text-slate-700">
            Email
            <input
              name="email"
              type="email"
              maxLength={254}
              className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-red-400"
            />
          </label>
          <label className="text-xs font-bold text-slate-700">
            Phone
            <input
              name="phone"
              maxLength={30}
              inputMode="tel"
              className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-red-400"
            />
          </label>
          <label className="text-xs font-bold text-slate-700">
            Product *
            <select
              required
              value={productId}
              onChange={(event) => setProductId(event.target.value)}
              className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-red-400"
            >
              <option value="">Choose product</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.code} - {product.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {message && (
          <p
            className={`mt-4 rounded-lg px-3 py-2 text-xs font-bold ${message.startsWith("Lead created") ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}
          >
            {message}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="h-9 rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-600"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending || !productId}
            className="h-9 rounded-lg bg-[#d90000] px-4 text-sm font-extrabold text-white disabled:opacity-50"
          >
            {isPending ? "Adding..." : "Add lead"}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

function AddLeadChoiceModal({
  onManual,
  onBulk,
  onClose,
}: {
  onManual: () => void;
  onBulk: () => void;
  onClose: () => void;
}) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[120] grid place-items-center bg-slate-950/35 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-lead-mode-title"
    >
      <section className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-extrabold tracking-[0.13em] text-red-600">
              ADD LEAD
            </p>
            <h2
              id="add-lead-mode-title"
              className="mt-1 text-xl font-extrabold text-slate-900"
            >
              How would you like to add leads?
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Manual leads and uploaded leads are assigned to you.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
          >
            ×
          </button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={onManual}
            className="rounded-xl border border-red-200 bg-red-50 p-4 text-left hover:bg-red-100"
          >
            <p className="text-sm font-extrabold text-red-700">Manual</p>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              Add one contact with details and product.
            </p>
          </button>
          <button
            type="button"
            onClick={onBulk}
            className="rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-red-200 hover:bg-slate-50"
          >
            <p className="text-sm font-extrabold text-slate-800">Bulk upload</p>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              Upload an Excel or CSV sheet of leads.
            </p>
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

async function downloadSalesTemplate(products: Product[]) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Leads", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  const headers = [
    "First Name",
    "Last Name",
    "Cell Number",
    "Lead Type",
    "Sales Person",
    "Product",
    "Additional Product 1",
    "Additional Product 2",
    "Additional Product 3",
    "Additional Product 4",
    "Additional Product 5",
  ];
  sheet.addRow(headers);
  sheet.addRow([
    "Ananya",
    "Sharma",
    "9876543210",
    "Leads",
    "",
    "PSO",
    "",
    "",
    "",
    "",
    "",
  ]);
  sheet.columns.forEach((column) => {
    column.width = Math.max(16, String(column.header ?? "").length + 4);
  });
  sheet.getColumn(3).numFmt = "@";
  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFD90000" },
    };
  });
  const lists = workbook.addWorksheet("Lists");
  lists.state = "veryHidden";
  const leadTypes = [
    "Database Leads",
    "Qualified Leads",
    "Reference Leads",
    "Leads",
  ];
  const productCodes = products.map((product) => product.code).filter(Boolean);
  lists.getCell("A1").value = "Lead Type";
  leadTypes.forEach((value, index) => {
    lists.getCell(`A${index + 2}`).value = value;
  });
  lists.getCell("B1").value = "Product";
  productCodes.forEach((value, index) => {
    lists.getCell(`B${index + 2}`).value = value;
  });
  const validations = sheet as unknown as {
    dataValidations: { add: (range: string, rule: unknown) => void };
  };
  validations.dataValidations.add("D2:D1001", {
    type: "list",
    allowBlank: true,
    formulae: [`'Lists'!$A$2:$A$${leadTypes.length + 1}`],
  });
  if (productCodes.length)
    ["F", "G", "H", "I", "J", "K"].forEach((column) =>
      validations.dataValidations.add(`${column}2:${column}1001`, {
        type: "list",
        allowBlank: true,
        formulae: [`'Lists'!$B$2:$B$${productCodes.length + 1}`],
      }),
    );
  validations.dataValidations.add("A2:A1001", {
    type: "custom",
    allowBlank: false,
    formulae: ['A2<>""'],
  });
  validations.dataValidations.add("B2:B1001", {
    type: "custom",
    allowBlank: false,
    formulae: ['B2<>""'],
  });
  validations.dataValidations.add("C2:C1001", {
    type: "custom",
    allowBlank: false,
    formulae: ["AND(LEN(C2)=10,ISNUMBER(--C2))"],
  });
  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "my-leads-import-template.xlsx";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function BulkLeadModal({
  products,
  onClose,
}: {
  products: Product[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const [isDownloading, setIsDownloading] = useState(false);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await importLeadsCsv(new FormData(event.currentTarget));
      setMessage(
        result.ok
          ? `${result.message} ${result.imported ?? 0} added${result.skipped ? `, ${result.skipped} skipped` : ""}.`
          : result.message,
      );
      if (result.ok) {
        router.refresh();
        window.setTimeout(onClose, 800);
      }
    });
  };
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[120] grid place-items-center bg-slate-950/35 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-lead-title"
    >
      <form
        onSubmit={submit}
        className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-extrabold tracking-[0.13em] text-red-600">
              BULK LEADS
            </p>
            <h2
              id="bulk-lead-title"
              className="mt-1 text-xl font-extrabold text-slate-900"
            >
              Import leads
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Every valid row is assigned to you and recorded in the activity
              trail.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            aria-label="Close"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
          >
            ×
          </button>
        </div>
        <div className="mt-5 rounded-lg border border-red-100 bg-red-50 p-3 text-xs text-red-700">
          <p className="font-extrabold">Need the current format?</p>
          <button
            type="button"
            disabled={isDownloading}
            onClick={async () => {
              setIsDownloading(true);
              try {
                await downloadSalesTemplate(products);
              } finally {
                setIsDownloading(false);
              }
            }}
            className="mt-1 font-bold underline disabled:opacity-50"
          >
            {isDownloading ? "Preparing Excel..." : "Download Excel template"}
          </button>
        </div>
        <label className="mt-3 block rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center">
          <span className="text-sm font-extrabold text-slate-700">
            Choose Excel or CSV file
          </span>
          <span className="mt-1 block text-xs text-slate-500">
            First Name, Last Name, and a 10-digit Cell Number are required.
            Product defaults to PSO; Lead Type follows the sheet.
          </span>
          <input
            name="file"
            type="file"
            required
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            className="mt-3 block w-full text-xs text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-white file:px-3 file:py-2 file:text-xs file:font-bold file:text-slate-700"
          />
        </label>
        {message && (
          <p
            className={`mt-3 rounded-lg px-3 py-2 text-xs font-bold ${message.includes("successfully") ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}
          >
            {message}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="h-9 rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-600"
          >
            Cancel
          </button>
          <button
            disabled={isPending}
            className="h-9 rounded-lg bg-[#d90000] px-4 text-sm font-extrabold text-white disabled:opacity-50"
          >
            {isPending ? "Importing..." : "Import leads"}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
