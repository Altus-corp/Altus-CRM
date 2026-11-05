"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { syncAltusCorpAmbassadors } from "@/app/dashboard/my-ambassador/actions";

export function AmbassadorExternalSync() {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <button type="button" disabled={isPending}
        onClick={() => startTransition(async () => setMessage((await syncAltusCorpAmbassadors()).message))}
        className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-bold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60">
        <RefreshCw className={isPending ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        {isPending ? "Syncing ambassadors..." : "Sync AltusCorp ambassadors"}
      </button>
      {message ? <p role="status" className="text-sm text-slate-600">{message}</p> : null}
    </div>
  );
}
