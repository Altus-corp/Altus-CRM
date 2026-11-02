"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ArrowRight, CheckCircle2, Clock, PhoneCall, PhoneIncoming, PhoneOutgoing, XCircle } from "lucide-react";
import { FollowUpActions } from "./follow-up-actions";
import { ActivityResolutionOverview } from "./activity-resolution-overview";
import type { RecentCall, SalesDashboardData, UpcomingFollowUp } from "@/app/lib/sales-dashboard";

const REFRESH_MS = 30_000;
const timeFormat = new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
const dayFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
const avatarTones = ["bg-sky-100 text-sky-700", "bg-rose-100 text-rose-700", "bg-violet-100 text-violet-700", "bg-amber-100 text-amber-700", "bg-emerald-100 text-emerald-700"];

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
const tone = (name: string) => avatarTones[[...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % avatarTones.length];
const clock = (value: string) => timeFormat.format(new Date(value)).toUpperCase();
const dateTime = (value: string) => `${dayFormat.format(new Date(value))}, ${clock(value)}`;

function outcomeClass(outcome: string) {
  const value = outcome.toLowerCase();
  if (/not interested|wrong|dnd|abandon|did not/.test(value)) return "bg-red-50 text-red-600";
  if (/interested|registered|verbal yes/.test(value)) return "bg-emerald-50 text-emerald-700";
  if (/follow|back|call for next|tentative/.test(value)) return "bg-amber-50 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

export function SalesExecutiveDashboard() {
  const [data, setData] = useState<SalesDashboardData | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/sales-dashboard", { cache: "no-store" });
      const result = await response.json() as { ok?: boolean; data?: SalesDashboardData; error?: string };
      if (!response.ok || !result.ok || !result.data) throw new Error(result.error || "Unable to load the dashboard.");
      setData(result.data);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load the dashboard.");
    }
  }, []);

  useEffect(() => {
    const first = window.setTimeout(() => void load(), 0);
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearTimeout(first); window.clearInterval(interval); document.removeEventListener("visibilitychange", onVisible); };
  }, [load]);

  const summary = data?.summary;
  const figure = (value: number | undefined) => (!data ? "…" : data.callsAvailable ? String(value ?? 0) : "—");

  return <div className="mx-auto max-w-7xl space-y-4">
    <ActivityResolutionOverview mode="executive" />
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
    <section className="rounded-2xl bg-white p-4 shadow-sm" aria-label="Calling activity">
      <div className="flex items-center justify-between"><h2 className="text-lg font-extrabold tracking-[-0.03em] text-slate-900">Calling Activity</h2><ViewAll /></div>
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-700" role="alert">{error}</p>}
      {data?.callsMessage && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">{data.callsMessage}</p>}
      <div className="mt-3 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat icon={<PhoneCall className="h-5 w-5" />} tint="bg-sky-100 text-sky-600" value={figure(summary?.callsMade)} label="Calls Made (total)" detail={data?.callsAvailable ? <><span className="inline-flex items-center gap-1" title="Incoming calls"><PhoneIncoming className="h-3 w-3 text-emerald-600" />{summary?.incoming ?? 0} in</span><span className="inline-flex items-center gap-1" title="Outgoing calls"><PhoneOutgoing className="h-3 w-3 text-sky-600" />{summary?.outgoing ?? 0} out</span></> : undefined} />
        <Stat icon={<CheckCircle2 className="h-5 w-5" />} tint="bg-emerald-100 text-emerald-600" value={figure(summary?.connected)} label="Connected" />
        <Stat icon={<Clock className="h-5 w-5" />} tint="bg-violet-100 text-violet-600" value={data ? String(summary?.followUps ?? 0) : "…"} label="Pending Follow-ups" />
        <Stat icon={<XCircle className="h-5 w-5" />} tint="bg-red-100 text-red-600" value={figure(summary?.notReachable)} label="Not Reachable" />
      </div>

      <h3 className="mt-5 text-sm font-extrabold text-slate-900">Recent Calls</h3>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead><tr className="bg-slate-50 text-xs font-semibold text-slate-500"><th className="rounded-l-lg px-3 py-2">Lead</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Date &amp; Time</th><th className="px-3 py-2">Outcome</th><th className="px-3 py-2">Next Follow-up</th><th className="rounded-r-lg px-3 py-2">Assigned To</th></tr></thead>
          <tbody>{data?.recentCalls.map((call) => <RecentCallRow key={call.id} call={call} />)}</tbody>
        </table>
        {!data && !error && <p className="px-3 py-6 text-center text-xs font-semibold text-slate-400">Loading calls…</p>}
        {data && !data.recentCalls.length && <p className="px-3 py-6 text-center text-xs font-semibold text-slate-400">{data.callsAvailable ? "No calls to your leads recorded yet." : "Call history is unavailable right now."}</p>}
      </div>
    </section>

    <section className="rounded-2xl bg-white p-4 shadow-sm" aria-label="Upcoming follow-ups">
      <div className="flex items-center justify-between"><h2 className="text-lg font-extrabold tracking-[-0.03em] text-slate-900">Upcoming Follow-ups</h2><ViewAll href="/dashboard/upcoming-follow-ups" /></div>
      <ul className="mt-3 space-y-2.5">{data?.upcomingFollowUps.map((item) => <FollowUpRow key={item.assignmentId} item={item} />)}</ul>
      {!data && !error && <p className="py-6 text-center text-xs font-semibold text-slate-400">Loading follow-ups…</p>}
      {data && !data.upcomingFollowUps.length && <p className="py-6 text-center text-xs font-semibold text-slate-400">No follow-ups scheduled.</p>}
    </section>
    </div>
  </div>;
}

function ViewAll({ href = "/dashboard/leads" }: { href?: string }) {
  return <Link href={href} className="inline-flex items-center gap-1 text-xs font-bold text-sky-600 hover:text-sky-800">View All <ArrowRight className="h-3.5 w-3.5" /></Link>;
}

function Stat({ icon, tint, value, label, detail }: { icon: ReactNode; tint: string; value: string; label: string; detail?: ReactNode }) {
  return <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3"><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tint}`}>{icon}</span><div><p className="text-xl font-extrabold leading-none text-slate-900">{value}</p><p className="mt-1 text-xs font-medium text-slate-500">{label}</p>{detail && <p className="mt-1 flex gap-3 text-[11px] font-semibold text-slate-600">{detail}</p>}</div></div>;
}

function Avatar({ name }: { name: string }) {
  return <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-extrabold ${tone(name)}`}>{initials(name)}</span>;
}

function RecentCallRow({ call }: { call: RecentCall }) {
  const Icon = call.direction === "incoming" ? PhoneIncoming : PhoneOutgoing;
  return <tr className="border-b border-slate-100 last:border-0">
    <td className="px-3 py-2.5"><div className="flex items-center gap-3"><Avatar name={call.name} /><div className="min-w-0"><p className="truncate font-bold text-slate-900">{call.name}</p><p className="truncate text-xs text-slate-500">{call.subtitle}</p></div></div></td>
    <td className="px-3 py-2.5 text-sky-600"><Icon className="h-4 w-4" aria-label={call.direction} /></td>
    <td className="whitespace-nowrap px-3 py-2.5 text-xs font-medium text-slate-700">{call.calledAt ? dateTime(call.calledAt) : "—"}</td>
    <td className="px-3 py-2.5">{call.outcome ? <span className={`rounded-md px-2.5 py-1 text-xs font-semibold ${outcomeClass(call.outcome)}`}>{call.outcome}</span> : <span className="text-slate-400">—</span>}</td>
    <td className="px-3 py-2.5 text-xs font-medium text-slate-700">{call.nextFollowUp ? dateTime(call.nextFollowUp) : "—"}</td>
    <td className="px-3 py-2.5"><div className="flex items-center gap-2"><span className={`grid h-7 w-7 place-items-center rounded-full text-[10px] font-extrabold ${tone(call.assignedTo)}`}>{initials(call.assignedTo)}</span><span className="text-xs font-semibold text-slate-700">{call.assignedTo.split(" ")[0]}</span></div></td>
  </tr>;
}

function FollowUpRow({ item }: { item: UpcomingFollowUp }) {
  return <li className="flex items-center gap-3">
    <span className={`w-[68px] shrink-0 text-xs font-medium ${item.isOverdue ? "text-red-600" : "text-slate-500"}`} title={item.isOverdue ? "Overdue" : undefined}>{clock(item.followUpAt)}<span className="block text-[10px] text-slate-400">{dayFormat.format(new Date(item.followUpAt))}</span></span>
    <div className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-slate-100 bg-white p-2.5 shadow-[0_1px_4px_rgba(15,23,42,0.05)]">
      <Avatar name={item.name} />
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-900">{item.name}</p><p className="truncate text-xs text-slate-500">{item.company}</p></div>
      <FollowUpActions leadId={item.leadId} assignmentId={item.assignmentId} phone={item.phone} email={item.email} />
    </div>
  </li>;
}
