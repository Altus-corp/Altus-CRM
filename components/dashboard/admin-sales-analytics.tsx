"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { BarChart3, PhoneCall, Target, UserRoundCheck, Users } from "lucide-react";
import type { CallReportData } from "@/app/lib/sales-dashboard";

const REFRESH_MS = 5 * 60_000;

function todayKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function AdminSalesAnalytics() {
  const [date, setDate] = useState(todayKey);
  const [data, setData] = useState<CallReportData | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/admin/call-report?date=${encodeURIComponent(date)}&month=${encodeURIComponent(date.slice(0, 7))}`, { cache: "no-store" });
      const result = await response.json() as { ok?: boolean; data?: CallReportData; error?: string };
      if (!response.ok || !result.ok || !result.data) throw new Error(result.error || "Analytics could not be loaded.");
      setData(result.data);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Analytics could not be loaded.");
    }
  }, [date]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const totals = data?.totals;
  const connectRate = totals?.calls ? Math.round((totals.connected / totals.calls) * 100) : 0;
  const chartDays = useMemo(() => {
    const daysInMonth = new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0).getDate();
    return Array.from({ length: daysInMonth }, (_, index) => ({ day: index + 1, calls: data?.monthDays[String(index + 1)] ?? 0 }));
  }, [data?.monthDays, date]);
  const peak = Math.max(1, ...chartDays.map((item) => item.calls));

  return <section className="mx-auto max-w-[1500px] space-y-4" aria-label="Admin sales analytics">
    <header className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-end">
      <div><p className="text-[10px] font-extrabold tracking-[0.13em] text-red-600">ADMIN DASHBOARD</p><h1 className="mt-1 text-2xl font-extrabold tracking-[-0.04em] text-slate-900">Sales performance &amp; analytics</h1><p className="mt-1 text-xs text-slate-500">Monitor calling activity, lead coverage, and each CRM user&apos;s performance.</p></div>
      <label className="text-[10px] font-bold text-slate-500">Report date<input type="date" max={todayKey()} value={date} onChange={(event) => setDate(event.target.value || todayKey())} className="mt-1 block h-9 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-700 outline-none focus:border-red-400" /></label>
    </header>
    {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
    {data?.message && <p className="rounded-xl bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800">{data.message}</p>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric icon={<PhoneCall className="h-5 w-5" />} tone="bg-red-50 text-red-600" label="Calls made" value={data ? totals?.calls ?? 0 : null} detail={data ? `${totals?.incoming ?? 0} incoming · ${totals?.outgoing ?? 0} outgoing` : "Loading…"} />
      <Metric icon={<UserRoundCheck className="h-5 w-5" />} tone="bg-emerald-50 text-emerald-600" label="Connected calls" value={data ? totals?.connected ?? 0 : null} detail={data ? `${connectRate}% connect rate` : "Loading…"} />
      <Metric icon={<Target className="h-5 w-5" />} tone="bg-violet-50 text-violet-600" label="Focused leads contacted" value={data ? totals?.leadsCalled ?? 0 : null} detail={data ? `${totals?.assigned ?? 0} assigned today` : "Loading…"} />
      <Metric icon={<Users className="h-5 w-5" />} tone="bg-sky-50 text-sky-600" label="Active CRM users" value={data ? data.members.length : null} detail={data ? `${totals?.followUps ?? 0} follow-ups due` : "Loading…"} />
    </div>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(360px,1fr)]">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between"><div><div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-lg bg-red-50 text-red-600"><BarChart3 className="h-4 w-4" /></span><h2 className="font-extrabold text-slate-900">Monthly call trend</h2></div><p className="mt-1 text-xs text-slate-500">Daily calls for {date.slice(0, 7)}.</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-extrabold text-slate-600">{chartDays.reduce((sum, item) => sum + item.calls, 0)} calls</span></div><div className="mt-5 flex h-52 items-end gap-[3px] border-b border-slate-200 px-1">{chartDays.map((item) => <div key={item.day} className="group relative flex h-full min-w-0 flex-1 items-end"><div title={`${item.day}: ${item.calls} calls`} className="w-full rounded-t bg-gradient-to-t from-[#d90000] to-[#ff6b6b] transition-opacity group-hover:opacity-70" style={{ height: `${Math.max(item.calls ? 5 : 1, (item.calls / peak) * 100)}%` }} /><span className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-[10px] font-bold text-white shadow group-hover:block">Day {item.day}: {item.calls}</span></div>)}</div><div className="mt-2 flex justify-between text-[9px] font-semibold text-slate-400"><span>1</span><span>{Math.ceil(chartDays.length / 2)}</span><span>{chartDays.length}</span></div></section>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><h2 className="font-extrabold text-slate-900">Team conversion</h2><p className="mt-1 text-xs text-slate-500">Selected-day call performance.</p><div className="mt-5 grid place-items-center"><div className="grid h-36 w-36 place-items-center rounded-full p-3" style={{ background: `conic-gradient(#00a65a 0deg ${connectRate * 3.6}deg, #e8eef4 ${connectRate * 3.6}deg 360deg)` }}><div className="grid h-full w-full place-items-center rounded-full bg-white text-center"><strong className="text-3xl font-extrabold text-slate-900">{data ? `${connectRate}%` : "…"}</strong><span className="text-[10px] font-bold text-slate-500">connected</span></div></div></div><dl className="mt-5 grid grid-cols-2 gap-2 text-center"><div className="rounded-lg bg-slate-50 p-2"><dt className="text-[10px] font-bold text-slate-500">Calls</dt><dd className="mt-1 text-lg font-extrabold text-slate-900">{data ? totals?.calls ?? 0 : "…"}</dd></div><div className="rounded-lg bg-emerald-50 p-2"><dt className="text-[10px] font-bold text-emerald-700">Connected</dt><dd className="mt-1 text-lg font-extrabold text-emerald-800">{data ? totals?.connected ?? 0 : "…"}</dd></div></dl></section>
    </div>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 p-4"><h2 className="font-extrabold text-slate-900">User performance</h2><p className="mt-1 text-xs text-slate-500">Performance for each active CRM user on the selected day.</p></div><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-[10px] font-extrabold uppercase tracking-wide text-slate-500"><tr>{["CRM user", "Calls", "Connected", "Connect rate", "Assigned", "Focused called", "Follow-ups"].map((label) => <th key={label} className="whitespace-nowrap px-4 py-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{data?.members.map((member) => <tr key={member.userId}><th className="px-4 py-3 font-bold text-slate-800">{member.name}</th><td className="px-4 py-3">{member.calls}<span className="ml-1 text-[10px] text-slate-400">({member.incoming} in / {member.outgoing} out)</span></td><td className="px-4 py-3 font-bold text-emerald-700">{member.connected}</td><td className="px-4 py-3">{member.connectRate}%</td><td className="px-4 py-3">{member.assigned}</td><td className="px-4 py-3">{member.leadsCalled}</td><td className="px-4 py-3">{member.followUps}</td></tr>)}{data && !data.members.length && <tr><td colSpan={7} className="px-4 py-10 text-center text-sm font-semibold text-slate-400">No active CRM users found.</td></tr>}{!data && <tr><td colSpan={7} className="px-4 py-10 text-center text-sm font-semibold text-slate-400">Loading performance…</td></tr>}</tbody></table></div></section>
  </section>;
}

function Metric({ icon, tone, label, value, detail }: { icon: ReactNode; tone: string; label: string; value: number | null; detail: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between"><span className={`grid h-10 w-10 place-items-center rounded-xl ${tone}`}>{icon}</span><p className="text-2xl font-extrabold text-slate-900">{value === null ? "…" : value.toLocaleString("en-IN")}</p></div><p className="mt-3 text-xs font-bold text-slate-700">{label}</p><p className="mt-1 text-[10px] font-medium text-slate-500">{detail}</p></div>;
}
