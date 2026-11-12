"use client";

import { useActionState, useState, useTransition } from "react";
import {
  deleteUserAccount,
  exportUserLeadAssignments,
  getUserDeletionPreview,
  type UserDeletionPreview,
} from "./actions";

type TransferUser = { id: string; name: string };

type DeleteUserDialogProps = {
  user: { id: string; name: string; email: string };
  transferUsers: TransferUser[];
};

const UNASSIGNED_POOL_VALUE = "__unassigned_pool__";

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export function DeleteUserDialog({ user, transferUsers }: DeleteUserDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [preview, setPreview] = useState<UserDeletionPreview | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [downloadMessage, setDownloadMessage] = useState("");
  const [isLoadingPreview, startPreviewTransition] = useTransition();
  const [isDownloading, startDownloadTransition] = useTransition();
  const [state, formAction, isDeleting] = useActionState(deleteUserAccount, {});

  const eligibleTransferUsers = transferUsers.filter((candidate) => candidate.id !== user.id);
  const needsTransfer = Boolean(preview && (preview.allAssignments || preview.directlyOwnedLeads));

  function openDialog() {
    setIsOpen(true);
    setPreview(null);
    setPreviewError("");
    setDownloadMessage("");
    startPreviewTransition(async () => {
      try {
        setPreview(await getUserDeletionPreview(user.id));
      } catch (error) {
        setPreviewError(error instanceof Error ? error.message : "Unable to load the deletion preview.");
      }
    });
  }

  function downloadCsv() {
    setDownloadMessage("");
    startDownloadTransition(async () => {
      try {
        const exported = await exportUserLeadAssignments(user.id);
        const headings = ["Lead Number", "Full Name", "Email", "Phone", "Product", "Stage", "Activity Resolution", "Assigned At", "Focused On", "Status"];
        const lines = [headings.map(csvCell).join(","), ...exported.rows.map((row) => [row.leadNumber, row.fullName, row.email, row.phone, row.product, row.stage, row.resolution, row.assignedAt, row.focusedOn, row.status].map(csvCell).join(","))];
        const file = new Blob([`\uFEFF${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(file);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${user.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "user"}-lead-assignments.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        setDownloadMessage(exported.isTruncated ? "The first 5,000 assignment records were downloaded." : `${exported.rows.length} assignment record${exported.rows.length === 1 ? "" : "s"} downloaded.`);
      } catch (error) {
        setDownloadMessage(error instanceof Error ? error.message : "Unable to download the assigned lead data.");
      }
    });
  }

  if (!isOpen) {
    return <button type="button" onClick={openDialog} className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-50">Delete user</button>;
  }

  return (
    <>
      <button type="button" onClick={openDialog} className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-50">Delete user</button>
      <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4 backdrop-blur-[2px]">
        <section role="dialog" aria-modal="true" aria-labelledby={`delete-user-${user.id}`} className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id={`delete-user-${user.id}`} className="text-lg font-extrabold tracking-[-0.03em] text-slate-900">Delete {user.name}?</h2>
              <p className="mt-1 text-sm font-medium text-slate-500">Review ownership first. This permanently removes login access; it does not delete CRM leads or activity history.</p>
            </div>
            <button type="button" onClick={() => !isDeleting && setIsOpen(false)} disabled={isDeleting} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-md text-lg text-slate-500 hover:bg-slate-100 disabled:opacity-50">×</button>
          </div>

          {isLoadingPreview && <p className="mt-5 rounded-lg bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-600">Loading assigned CRM work…</p>}
          {previewError && <p role="alert" className="mt-5 rounded-lg bg-red-50 px-3 py-3 text-sm font-semibold text-red-700">{previewError}</p>}
          {preview && (
            <>
              <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <Impact label="Active assigned work" value={preview.activeAssignments} />
                <Impact label="Lead Master" value={preview.leadMaster} />
                <Impact label="Focused Leads today" value={preview.focusedLeads} />
                <Impact label="Ambassadors" value={preview.ambassadors} />
              </div>
              <p className="mt-2 text-xs font-medium text-slate-500">{preview.allAssignments} total product-assignment record{preview.allAssignments === 1 ? "" : "s"} and {preview.directlyOwnedLeads} legacy lead owner record{preview.directlyOwnedLeads === 1 ? "" : "s"} will be transferred.</p>
              {(preview.teamsManaged > 0 || preview.seniorAmbassadorLinks > 0) && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">{preview.teamsManaged > 0 && "This user manages a sales team. Reassign or remove that team before deletion. "}{preview.seniorAmbassadorLinks > 0 && "This user is a Senior Ambassador; reassign Junior Ambassadors before deletion."}</p>}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                <div><p className="text-sm font-bold text-slate-800">Optional backup</p><p className="text-xs font-medium text-slate-500">Download assigned product-lead data before continuing.</p></div>
                <button type="button" onClick={downloadCsv} disabled={isDownloading} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-red-300 hover:text-red-700 disabled:opacity-60">{isDownloading ? "Preparing…" : "Download CSV"}</button>
              </div>
              {downloadMessage && <p role="status" className="mt-2 text-xs font-semibold text-slate-600">{downloadMessage}</p>}
            </>
          )}

          <form action={formAction} className="mt-5 space-y-3 border-t border-slate-100 pt-4">
            <input type="hidden" name="userId" value={user.id} />
            {state.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{state.error}</p>}
            {state.success && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">{state.success}</p>}
            <label className="block text-xs font-bold text-slate-700">Move assigned CRM work
              <select name="transferToUserId" required={needsTransfer} defaultValue="" className="mt-1.5 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-red-500">
                <option value="">{needsTransfer ? "Choose an active CRM user or an unassigned pool" : "No transfer needed"}</option>
                <option value={UNASSIGNED_POOL_VALUE}>Return all work to the unassigned pool</option>
                {eligibleTransferUsers.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
              </select>
            </label>
            <p className="text-xs font-medium text-slate-500">Choose a CRM user to transfer ownership, or return the work to its product&apos;s unassigned pool. When returned to the pool, active Ambassador relationship-manager links are cleared rather than left pointing to a deleted user.</p>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setIsOpen(false)} disabled={isDeleting} className="rounded-md border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 disabled:opacity-60">Cancel</button>
              <button disabled={!preview || isLoadingPreview || Boolean(preview?.teamsManaged) || Boolean(preview?.seniorAmbassadorLinks) || isDeleting} className="rounded-md bg-red-700 px-4 py-2 text-sm font-extrabold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-slate-300">{isDeleting ? "Deleting…" : "Move work and delete user"}</button>
            </div>
          </form>
        </section>
      </div>
    </>
  );
}

function Impact({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg border border-slate-100 bg-white px-3 py-2.5 shadow-sm"><p className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-xl font-extrabold text-slate-900">{value}</p></div>;
}
