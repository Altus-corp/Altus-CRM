"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, ChevronDown, Users } from "lucide-react";

type ReportData = {
  from: string;
  to: string;
  people: { id: string; name: string }[];
  selectedScope: string;
  days: string[];
  dailyTotals: Record<string, number>;
  resolutions: { id: string; name: string; count: number; dailyCounts: Record<string, number> }[];
  total: number;
};

type Period = "today" | "yesterday" | "day_before_yesterday" | "last_7_days" | "custom";

function resolutionTone(name: string) {
  const key = name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (/(^| )(dnd|not interested|wrong number|lost|abandoned|cancelled|meeting cancelled)( |$)/.test(key)) return "border-red-300 bg-red-600 text-white";
  if (/(registered|verbal yes|agreement signed|proposal signed|delivered|demo given)/.test(key)) return "border-emerald-300 bg-emerald-100 text-slate-900";
  if (/(follow|tentative|call for next|call back|next month|scheduled|meeting scheduled|invite again)/.test(key)) return "border-amber-300 bg-amber-100 text-slate-900";
  if (/(old graduate|did not attend|past attended)/.test(key)) return "border-fuchsia-300 bg-fuchsia-100 text-slate-900";
  if (/(no busy|ringing)/.test(key)) return "border-blue-400 bg-white text-slate-900";
  return "border-slate-200 bg-slate-50 text-slate-900";
}

const periodLabel: Record<Period, string> = {
  today: "Today",
  yesterday: "Yesterday",
  day_before_yesterday: "Day before yesterday",
  last_7_days: "Last 7 days",
  custom: "Custom",
};

function average(value: number, days: number) {
  const result = days ? value / days : 0;
  return Number.isInteger(result) ? String(result) : result.toFixed(1);
}

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
  const resolutions = data?.resolutions ?? [];
  const days = data?.days ?? [];
  const dayLabel = (day: string) => new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(new Date(`${day}T12:00:00Z`));
  const reportDay = days.length === 1 ? dayLabel(days[0]) : "Selected period";
  const freezeResolutionColumns = days.length >= 5;

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
    {mode === "admin" && <div className="mt-4 overflow-hidden rounded-lg border border-slate-500 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-0 text-left text-xs" style={{ minWidth: `${Math.max(700, 420 + (days.length * 94))}px` }}>
          <thead><tr className="font-extrabold text-slate-900"><th className={`w-11 min-w-11 border-b border-r border-slate-500 bg-slate-50 px-2 py-1.5 text-right ${freezeResolutionColumns ? "sticky left-0 z-30" : ""}`}>#</th><th className={`min-w-56 border-b border-r border-slate-500 bg-slate-50 px-2 py-1.5 ${freezeResolutionColumns ? "sticky left-11 z-30 shadow-[3px_0_5px_rgba(15,23,42,0.12)]" : ""}`}>Activity Resolution</th>{days.map((day) => <th key={day} className="min-w-[94px] border-b border-r border-slate-500 bg-violet-100 px-2 py-1.5 text-center" title={day}>{dayLabel(day)}</th>)}<th className="min-w-20 border-b border-r border-slate-500 bg-slate-200 px-2 py-1.5 text-center">Average</th><th className="min-w-20 border-b border-slate-500 bg-slate-300 px-2 py-1.5 text-center">Total</th></tr></thead>
          <tbody>
            {resolutions.map((resolution, index) => <tr key={resolution.id}>
              <td className={`border-b border-r border-slate-500 bg-white px-2 py-1 text-right font-bold text-slate-700 ${freezeResolutionColumns ? "sticky left-0 z-20" : ""}`}>{index + 1}</td>
              <td className={`border-b border-r border-slate-500 px-2 py-1 font-semibold ${resolutionTone(resolution.name)} ${freezeResolutionColumns ? "sticky left-11 z-20 shadow-[3px_0_5px_rgba(15,23,42,0.12)]" : ""}`}>{resolution.name}</td>
              {days.map((day) => <td key={day} className="border-b border-r border-slate-500 px-2 py-1 text-center font-extrabold text-slate-900">{loading ? "…" : resolution.dailyCounts[day] ?? 0}</td>)}
              <td className="border-b border-slate-500 bg-slate-50 px-2 py-1 text-center font-extrabold text-slate-900">{loading ? "…" : average(resolution.count, days.length)}</td>
              <td className="border-b border-slate-500 bg-slate-100 px-2 py-1 text-center font-extrabold text-slate-900">{loading ? "Loading" : resolution.count}</td>
            </tr>)}
            <tr><td className={`border-r border-slate-500 bg-zinc-700 px-2 py-1 text-right font-extrabold text-white ${freezeResolutionColumns ? "sticky left-0 z-20" : ""}`}>{resolutions.length + 1}</td><td className={`border-r border-slate-500 bg-zinc-700 px-2 py-1 font-extrabold text-white ${freezeResolutionColumns ? "sticky left-11 z-20 shadow-[3px_0_5px_rgba(15,23,42,0.12)]" : ""}`}>Total Calls</td>{days.map((day) => <td key={day} className="border-r border-slate-500 bg-zinc-700 px-2 py-1 text-center font-extrabold text-white">{loading ? "…" : data?.dailyTotals[day] ?? 0}</td>)}<td className="bg-zinc-800 px-2 py-1 text-center font-extrabold text-white">{loading ? "…" : average(data?.total ?? 0, days.length)}</td><td className="bg-zinc-900 px-2 py-1 text-center font-extrabold text-white">{loading ? "Loading" : data?.total ?? 0}</td></tr>
          </tbody>
        </table>
      </div>
    </div>}
    {false && <div className="mt-4 max-w-2xl overflow-hidden rounded-lg border border-slate-500 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-left text-xs">
          <thead><tr className="font-extrabold text-slate-900"><th className="w-11 border-b border-r border-slate-500 bg-slate-50 px-2 py-1.5 text-right">#</th><th className="border-b border-r border-slate-500 bg-slate-50 px-2 py-1.5">Day</th><th className="w-24 border-b border-slate-500 bg-violet-100 px-2 py-1.5 text-center capitalize">{reportDay}</th></tr></thead>
          <tbody>
            {resolutions.map((resolution, index) => <tr key={resolution.id}>
              <td className="border-b border-r border-slate-500 px-2 py-1 text-right font-bold text-slate-700">{index + 1}</td>
              <td className={`border-b border-r border-slate-500 px-2 py-1 font-semibold ${resolutionTone(resolution.name)}`}>{resolution.name}</td>
              <td className="border-b border-slate-500 px-2 py-1 text-center font-extrabold text-slate-900">{loading ? "…" : resolution.count}</td>
            </tr>)}
            <tr><td className="border-r border-slate-500 bg-zinc-700 px-2 py-1 text-right font-extrabold text-white">{resolutions.length + 1}</td><td className="border-r border-slate-500 bg-zinc-700 px-2 py-1 font-extrabold text-white">Total Calls</td><td className="bg-zinc-700 px-2 py-1 text-center font-extrabold text-white">{loading ? "…" : data?.total ?? 0}</td></tr>
          </tbody>
        </table>
      </div>
    </div>}
    <div className={mode === "admin" ? "hidden" : "mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-7"}>
      {resolutions.map((resolution) => <div key={resolution.id} className={`min-h-[72px] rounded-lg border px-2.5 py-2 ${resolutionTone(resolution.name)}`}>
        <p className="text-[10px] font-extrabold leading-tight">{resolution.name}</p>
        <p className="mt-2 text-2xl font-extrabold leading-none">{loading ? "…" : resolution.count}</p>
      </div>)}
      <div className="min-h-[72px] rounded-lg border border-[#4d4d4d] bg-[#555] px-2.5 py-2 text-white"><p className="text-[10px] font-extrabold leading-tight">Total Calls</p><p className="mt-2 text-2xl font-extrabold leading-none">{loading ? "…" : data?.total ?? 0}</p></div>
    </div>
    {!loading && !resolutions.length && <p className="mt-4 rounded-lg bg-slate-50 px-3 py-4 text-center text-xs font-semibold text-slate-500">No active activity resolutions are configured yet.</p>}
    {data && <p className="mt-3 text-[10px] font-semibold text-slate-400">Showing {data.from === data.to ? data.from : `${data.from} to ${data.to}`}{mode === "manager" && scope === "team" ? " · team members only" : ""}.</p>}
  </section>;
}
