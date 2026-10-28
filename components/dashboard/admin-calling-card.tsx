"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, PhoneCall, Users } from "lucide-react";
import type { CallSummaryData } from "@/app/lib/sales-dashboard";

const REFRESH_MS = 60_000;

export function AdminCallingCard() {
  const [data, setData] = useState<CallSummaryData | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/call-summary", { cache: "no-store" });
      const result = await response.json() as { ok?: boolean; data?: CallSummaryData; error?: string };
      if (!response.ok || !result.ok || !result.data) throw new Error(result.error || "Unable to load the monthly summary.");
      setData(result.data);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load the monthly summary.");
    }
  }, []);

  useEffect(() => {
    const first = window.setTimeout(() => void load(), 0);
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearTimeout(first); window.clearInterval(interval); document.removeEventListener("visibilitychange", onVisible); };
  }, [load]);

  const peak = Math.max(1, data?.calls ?? 0, data?.assignedLeads ?? 0);
  const perLead = data && data.assignedLeads ? (data.calls / data.assignedLeads).toFixed(1) : "—";
  const connectRate = data && data.calls ? Math.round((data.connected / data.calls) * 100) : 0;

  return <section className="max-w-xl rounded-2xl border border-slate-100 bg-white p-5 shadow-sm" aria-label="Monthly calling overview">
    <div className="flex items-start justify-between gap-3">
      <div><p className="text-[10px] font-extrabold tracking-[0.12em] text-red-600">THIS MONTH</p><h2 className="mt-0.5 text-lg font-extrabold tracking-[-0.03em] text-slate-900">Calls vs Assigned Leads</h2><p className="text-xs font-medium text-slate-500">{data?.monthLabel ?? "Loading…"}</p></div>
      <Link href="/dashboard/admin/call-report" className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-red-600 px-3.5 text-xs font-bold text-white transition hover:bg-red-700">View more <ArrowRight className="h-3.5 w-3.5" /></Link>
    </div>

    {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-700" role="alert">{error}</p>}
    {data?.message && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">{data.message}</p>}

    <div className="mt-5 space-y-4">
      <Metric icon={<PhoneCall className="h-4 w-4" />} label="Total calls" value={data?.calls} width={data ? (data.calls / peak) * 100 : 0} bar="bg-red-500" tint="bg-red-50 text-red-600" />
      <Metric icon={<Users className="h-4 w-4" />} label="Leads assigned" value={data?.assignedLeads} width={data ? (data.assignedLeads / peak) * 100 : 0} bar="bg-sky-500" tint="bg-sky-50 text-sky-600" />
    </div>

    <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4 text-xs font-semibold text-slate-600">
      <span className="rounded-full bg-slate-100 px-3 py-1">{perLead} calls per assigned lead</span>
      <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">{data ? `${data.connected} connected · ${connectRate}%` : "…"}</span>
    </div>
  </section>;
}

function Metric({ icon, label, value, width, bar, tint }: { icon: React.ReactNode; label: string; value: number | undefined; width: number; bar: string; tint: string }) {
  return <div>
    <div className="flex items-end justify-between"><span className="flex items-center gap-2 text-sm font-semibold text-slate-600"><span className={`grid h-7 w-7 place-items-center rounded-lg ${tint}`}>{icon}</span>{label}</span><span className="text-3xl font-extrabold leading-none text-slate-900">{value ?? "…"}</span></div>
    <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100" role="presentation"><div className={`h-full rounded-full transition-all duration-500 ${bar}`} style={{ width: `${Math.min(100, width)}%` }} /></div>
  </div>;
}
