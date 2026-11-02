"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, ChevronDown, Users } from "lucide-react";

type ReportData = {
  from: string;
  to: string;
  people: { id: string; name: string }[];
  selectedScope: string;
  counts: Record<string, number>;
  total: number;
};

type Period = "today" | "yesterday" | "day_before_yesterday" | "custom";

const cards = [
  ["Registered", ["registered"], "bg-[#b9d9ac] text-slate-900 border-[#7ca871]"],
  ["Registered for Next", ["registered for next"], "bg-[#cce6bd] text-slate-900 border-[#89b77b]"],
  ["Verbal Yes", ["verbal yes"], "bg-[#cfe8bd] text-slate-900 border-[#8ab37b]"],
  ["Tentative", ["tentative"], "bg-[#f6c994] text-slate-900 border-[#d89c60]"],
  ["Tentative for Next", ["tentative for next"], "bg-[#f8d3a6] text-slate-900 border-[#d9aa72]"],
  ["Call for Next", ["call for next"], "bg-[#fff0b3] text-slate-900 border-[#e9cc6a]"],
  ["I will get back if I want", ["i will get back", "i will get back if i want"], "bg-[#f5b1b1] text-slate-900 border-[#df8585]"],
  ["Not Interested", ["not interested"], "bg-[#ec0000] text-white border-[#b40000]"],
  ["DND", ["dnd"], "bg-[#dc0000] text-white border-[#a90000]"],
  ["Past Attended", ["past attended", "did not attend"], "bg-[#e7baff] text-slate-900 border-[#bc77df]"],
  ["Old Graduate", ["old graduate", "old graduate"], "bg-[#f2b5ff] text-slate-900 border-[#ca6dde]"],
  ["No Busy", ["no busy"], "bg-white text-slate-900 border-[#4273da]"],
  ["Ringing", ["ringing"], "bg-white text-slate-900 border-[#4273da]"],
  ["Call Back", ["call back", "callback"], "bg-white text-slate-900 border-[#4273da]"],
  ["Wrong Number", ["wrong number"], "bg-[#a2a2a2] text-slate-950 border-[#656565]"],
] as const;

const periodLabel: Record<Period, string> = {
  today: "Today",
  yesterday: "Yesterday",
  day_before_yesterday: "Day before yesterday",
  custom: "Custom",
};

export function ActivityResolutionOverview({ mode }: { mode: "executive" | "manager" | "admin" }) {
  const [period, setPeriod] = useState<Period>("today");
  const [scope, setScope] = useState(mode === "manager" ? "me" : "all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ range: period, user: scope });
      if (period === "custom") {
        if (customFrom) params.set("from", customFrom);
        if (customTo) params.set("to", customTo);
      }
      const response = await fetch(`/api/reports/activity-resolutions?${params}`, { cache: "no-store" });
      const result = await response.json() as { ok?: boolean; data?: ReportData; error?: string };
      if (!response.ok || !result.ok || !result.data) throw new Error(result.error || "Resolution overview could not be loaded.");
      setData(result.data);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Resolution overview could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [customFrom, customTo, period, scope]);

  useEffect(() => { void load(); }, [load]);
  const shownPeople = data?.people ?? [];
  const cardCount = (aliases: readonly string[]) => aliases.reduce((sum, key) => sum + (data?.counts[key] ?? 0), 0);

  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="Activity resolution overview">
    <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
      <div><p className="text-[10px] font-extrabold tracking-[0.13em] text-red-600">ACTIVITY REPORT</p><h2 className="mt-1 text-xl font-extrabold tracking-[-0.04em] text-slate-900">Activity resolution overview</h2><p className="mt-1 text-xs text-slate-500">Counts are based on activity resolutions recorded in the selected India-time date range.</p></div>
      <div className="flex flex-wrap items-center gap-2">
        {mode !== "executive" && <label className="relative"><Users className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" /><select value={scope} onChange={(event) => setScope(event.target.value)} className="h-8 appearance-none rounded-lg border border-slate-200 bg-white py-0 pl-7 pr-7 text-[11px] font-bold text-slate-700 outline-none focus:border-red-400"><option value={mode === "manager" ? "me" : "all"}>{mode === "manager" ? "My activity" : "All CRM users"}</option>{mode === "manager" && <option value="team">My team</option>}{shownPeople.filter((person) => person.id !== (mode === "manager" ? undefined : "")).map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select><ChevronDown className="pointer-events-none absolute right-2 top-2 h-3.5 w-3.5 text-slate-400" /></label>}
        <label className="relative"><CalendarDays className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" /><select value={period} onChange={(event) => setPeriod(event.target.value as Period)} className="h-8 appearance-none rounded-lg border border-slate-200 bg-white py-0 pl-7 pr-7 text-[11px] font-bold text-slate-700 outline-none focus:border-red-400">{(Object.keys(periodLabel) as Period[]).map((key) => <option key={key} value={key}>{periodLabel[key]}</option>)}</select><ChevronDown className="pointer-events-none absolute right-2 top-2 h-3.5 w-3.5 text-slate-400" /></label>
      </div>
    </div>
    {period === "custom" && <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl bg-slate-50 p-2.5"><label className="text-[10px] font-bold text-slate-600">From<input type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} className="mt-1 block h-8 rounded border border-slate-200 bg-white px-2 text-xs" /></label><label className="text-[10px] font-bold text-slate-600">To<input type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} className="mt-1 block h-8 rounded border border-slate-200 bg-white px-2 text-xs" /></label><button type="button" onClick={() => void load()} className="h-8 rounded bg-[#d90000] px-3 text-[11px] font-extrabold text-white">Apply</button></div>}
    {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{error}</p>}
    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-8">
      {cards.map(([label, aliases, tone]) => <div key={label} className={`min-h-[72px] rounded-lg border px-2.5 py-2 ${tone}`}><p className="text-[10px] font-extrabold leading-tight">{label}</p><p className="mt-2 text-2xl font-extrabold leading-none">{loading ? "…" : cardCount(aliases)}</p></div>)}
      <div className="min-h-[72px] rounded-lg border border-[#4d4d4d] bg-[#555] px-2.5 py-2 text-white"><p className="text-[10px] font-extrabold leading-tight">Total Calls</p><p className="mt-2 text-2xl font-extrabold leading-none">{loading ? "…" : data?.total ?? 0}</p></div>
    </div>
    {data && <p className="mt-3 text-[10px] font-semibold text-slate-400">Showing {data.from === data.to ? data.from : `${data.from} to ${data.to}`}{mode === "manager" && scope === "team" ? " · team members only" : ""}.</p>}
  </section>;
}
