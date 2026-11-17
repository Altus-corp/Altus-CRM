"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { saveLeadChannelPartners } from "@/app/dashboard/leads/actions";

type AmbassadorOption = { id: string; name: string };

export function ChannelPartnerSelect({ leadId, assignmentId, names, options, selectedIds, onSaved }: {
  leadId: string; assignmentId: string; names: string | null | undefined;
  options: AmbassadorOption[]; selectedIds: string[];
  onSaved: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(selectedIds);
  const [loadedOptions, setLoadedOptions] = useState<AmbassadorOption[]>(options);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const availableOptions = loadedOptions.length ? loadedOptions : options;

  useEffect(() => {
    if (options.length) setLoadedOptions(options);
  }, [options]);

  const loadAmbassadorUsers = async () => {
    if (availableOptions.length || loadingOptions) return;
    setLoadingOptions(true);
    try {
      const response = await fetch("/api/ambassadors/options", { cache: "no-store" });
      const result = await response.json() as { ok?: boolean; error?: string; options?: AmbassadorOption[] };
      if (!response.ok || !result.ok) throw new Error(result.error || "Ambassador users could not be loaded.");
      setLoadedOptions(result.options ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Ambassador users could not be loaded.");
    } finally {
      setLoadingOptions(false);
    }
  };

  useEffect(() => {
    if (open) void loadAmbassadorUsers();
  }, [open]);

  const close = () => { if (!pending) setOpen(false); };
  return <>
    <button type="button" aria-label="Select Channel Partners" title={names || "Select Ambassadors"} onClick={(event) => { event.stopPropagation(); setDraft(selectedIds); setError(""); setOpen(true); }} onDoubleClick={(event) => event.stopPropagation()} className="inline-flex max-w-full items-center gap-2 text-left font-semibold text-slate-700 hover:text-red-700"><span className="truncate">{names || "Select Ambassadors"}</span><span aria-hidden="true">▾</span></button>
    {open && createPortal(<div className="fixed inset-0 z-[150] grid place-items-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby={`channel-partner-title-${leadId}`} onClick={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}>
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl"><h2 id={`channel-partner-title-${leadId}`} className="text-lg font-bold text-slate-900">Channel Partner</h2><p className="mt-1 text-sm text-slate-500">Select one or more Ambassadors.</p>
        <fieldset disabled={pending || loadingOptions} className="mt-4 max-h-64 space-y-2 overflow-y-auto">{availableOptions.map((option) => <label key={option.id} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={draft.includes(option.id)} onChange={(event) => setDraft((ids) => event.target.checked ? [...ids, option.id] : ids.filter((id) => id !== option.id))} className="accent-red-600" />{option.name}</label>)}{loadingOptions ? <p className="text-sm text-slate-500">Loading Ambassador users...</p> : !availableOptions.length && <p className="text-sm text-slate-500">No active Ambassador users available.</p>}</fieldset>
        {error && <p role="alert" className="mt-3 text-xs text-red-700">{error}</p>}
        <div className="mt-4 flex justify-end gap-2"><button type="button" disabled={pending} onClick={close} className="rounded-lg border px-3 py-2 text-sm font-bold text-slate-600">Cancel</button><button type="button" disabled={pending} onClick={() => startTransition(async () => {
          const form = new FormData(); form.set("leadId", leadId); form.set("assignmentId", assignmentId);
          draft.forEach((id) => form.append("ambassadorIds", id));
          try { const result = await saveLeadChannelPartners(form); if (!result.ok) { setError(result.message); return; } onSaved(draft); setOpen(false); }
          catch { setError("Unable to save Channel Partners. Please retry."); }
        })} className="rounded-lg bg-red-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-60">{pending ? "Saving..." : "Save"}</button></div>
      </div>
    </div>, document.body)}
  </>;
}
