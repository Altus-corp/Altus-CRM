"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, PhoneCall, Target } from "lucide-react";
import type { CallReportData, TeamMember } from "@/app/lib/sales-dashboard";

const REFRESH_MS = 60_000;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const avatarTones = ["bg-rose-100 text-rose-700", "bg-sky-100 text-sky-700", "bg-violet-100 text-violet-700", "bg-amber-100 text-amber-700", "bg-emerald-100 text-emerald-700"];

const pad = (value: number) => String(value).padStart(2, "0");
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
const tone = (name: string) => avatarTones[[...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % avatarTones.length];
const monthTitle = (month: string) => new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));
const dateTitle = (date: string) => new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
const shiftMonth = (month: string, by: number) => { const [year, number] = month.split("-").map(Number); const next = new Date(Date.UTC(year, number - 1 + by, 1)); return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}`; };

type Loaded = { key: string; data?: CallReportData; error?: string };

export function CallReport({ todayKey }: { todayKey: string }) {
  const [date, setDate] = useState(todayKey);
  const [month, setMonth] = useState(todayKey.slice(0, 7));
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [tick, setTick] = useState(0);
  const key = `${date}|${month}|${tick}`;

  useEffect(() => {
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") setTick((value) => value + 1); }, REFRESH_MS);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let active = true;
    fetch(`/api/admin/call-report?date=${date}&month=${month}`, { cache: "no-store" })
      .then(async (response) => ({ response, result: await response.json() as { ok?: boolean; data?: CallReportData; error?: string } }))
      .then(({ response, result }) => {
        if (!active) return;
        if (!response.ok || !result.ok || !result.data) throw new Error(result.error || "Unable to load the call report.");
        setLoaded({ key, data: result.data });
      })
      .catch((error) => { if (active) setLoaded({ key, error: error instanceof Error ? error.message : "Unable to load the call report." }); });
    return () => { active = false; };
  }, [date, month, key]);

  // Keep showing the previous report while a new one loads, so the page does not flash empty.
  const [lastData, setLastData] = useState<CallReportData | null>(null);
  if (loaded?.data && loaded.data !== lastData) setLastData(loaded.data);
  const data = loaded?.data ?? lastData;
  const loading = !loaded || loaded.key !== key;
  const isToday = date === todayKey;

  function pickDate(next: string) { setDate(next); setMonth(next.slice(0, 7)); }

  return <div className="mx-auto max-w-7xl space-y-4">
    <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <Link href="/dashboard" aria-label="Back to dashboard" className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"><ArrowLeft className="h-4 w-4" /></Link>
        <div><p className="text-[10px] font-extrabold tracking-[0.12em] text-red-600">CALL REPORT</p><h1 className="text-xl font-extrabold tracking-[-0.03em] text-slate-900">{isToday ? "Today's call report" : "Call report"}</h1><p className="text-xs font-medium text-slate-500">{dateTitle(date)}</p></div>
      </div>
      {!isToday && <button type="button" onClick={() => pickDate(todayKey)} className="h-9 rounded-lg border border-red-200 px-3 text-xs font-bold text-red-600 hover:bg-red-50">Back to today</button>}
    </header>

    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <Calendar month={month} date={date} todayKey={todayKey} monthDays={data?.month === month ? data.monthDays : {}} onMonth={setMonth} onPick={pickDate} />

      <div className={`space-y-4 transition-opacity ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
        {loaded?.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-700" role="alert">{loaded.error}</p>}
        {data?.message && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">{data.message}</p>}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Tile icon={<Target className="h-5 w-5" />} tint="bg-sky-100 text-sky-600" label="Focused leads assigned" value={data?.totals.assigned} detail={data ? `${data.totals.leadsCalled} of them called` : undefined} />
          <Tile icon={<PhoneCall className="h-5 w-5" />} tint="bg-red-100 text-red-600" label="Total calls" value={data?.totals.calls} detail={data ? `${data.totals.incoming} incoming · ${data.totals.outgoing} outgoing` : undefined} />
          <Tile icon={<CheckCircle2 className="h-5 w-5" />} tint="bg-emerald-100 text-emerald-600" label="Connected" value={data?.totals.connected} detail={data?.totals.calls ? `${Math.round((data.totals.connected / data.totals.calls) * 100)}% connect rate` : undefined} />
          <Tile icon={<CalendarClock className="h-5 w-5" />} tint="bg-violet-100 text-violet-600" label="Follow-ups due" value={data?.totals.followUps} detail={isToday ? "scheduled for today" : "scheduled for this date"} />
        </div>

        <section className="rounded-2xl bg-white p-4 shadow-sm" aria-label="Calls by salesperson">
          <h2 className="text-sm font-extrabold text-slate-900">Calls by salesperson</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead><tr className="bg-slate-50 text-xs font-semibold text-slate-500"><th className="rounded-l-lg px-3 py-2">#</th><th className="px-3 py-2">Salesperson</th><th className="px-3 py-2">Focused leads</th><th className="px-3 py-2">Calls</th><th className="px-3 py-2">Connected</th><th className="px-3 py-2">Follow-ups</th><th className="rounded-r-lg px-3 py-2">Connect rate</th></tr></thead>
              <tbody>{data?.members.map((member, index) => <MemberRow key={member.userId} member={member} rank={index + 1} />)}</tbody>
            </table>
            {!data && !loaded?.error && <p className="px-3 py-6 text-center text-xs font-semibold text-slate-400">Loading call report…</p>}
            {data && !data.members.length && <p className="px-3 py-6 text-center text-xs font-semibold text-slate-400">No active salespeople found.</p>}
            {data && data.members.length > 0 && !data.totals.calls && <p className="px-3 py-4 text-center text-xs font-semibold text-slate-400">No calls to leads were recorded on this date.</p>}
          </div>
        </section>
      </div>
    </div>
  </div>;
}

function Calendar({ month, date, todayKey, monthDays, onMonth, onPick }: { month: string; date: string; todayKey: string; monthDays: Record<string, number>; onMonth: (month: string) => void; onPick: (date: string) => void }) {
  const [year, number] = month.split("-").map(Number);
  const offset = (new Date(Date.UTC(year, number - 1, 1)).getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, number, 0)).getUTCDate();
  const cells = [...Array.from({ length: offset }, () => 0), ...Array.from({ length: daysInMonth }, (_, index) => index + 1)];
  const atCurrentMonth = month >= todayKey.slice(0, 7);
  const peak = Math.max(1, ...Object.values(monthDays));

  return <section className="h-fit rounded-2xl bg-white p-4 shadow-sm" aria-label="Pick a date">
    <div className="flex items-center justify-between">
      <button type="button" onClick={() => onMonth(shiftMonth(month, -1))} aria-label="Previous month" className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"><ChevronLeft className="h-4 w-4" /></button>
      <p className="text-sm font-extrabold text-slate-900">{monthTitle(month)}</p>
      <button type="button" onClick={() => onMonth(shiftMonth(month, 1))} disabled={atCurrentMonth} aria-label="Next month" className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
    </div>
    <div className="mt-3 grid grid-cols-7 gap-1 text-center">
      {WEEKDAYS.map((day) => <span key={day} className="py-1 text-[10px] font-bold text-slate-400">{day}</span>)}
      {cells.map((day, index) => {
        if (!day) return <span key={`blank-${index}`} />;
        const key = `${month}-${pad(day)}`;
        const count = monthDays[String(day)] ?? 0;
        const selected = key === date;
        const future = key > todayKey;
        return <button key={key} type="button" disabled={future} onClick={() => onPick(key)} aria-pressed={selected} aria-label={`${key}${count ? `, ${count} calls` : ""}`}
          className={`flex aspect-square flex-col items-center justify-center rounded-lg text-xs font-bold transition ${selected ? "bg-red-600 text-white" : future ? "text-slate-300" : "text-slate-700 hover:bg-red-50"} ${key === todayKey && !selected ? "ring-1 ring-red-400" : ""}`}
          style={!selected && count ? { backgroundColor: `rgba(239, 68, 68, ${0.08 + (count / peak) * 0.28})` } : undefined}>
          {day}{count > 0 && <span className={`text-[9px] font-semibold ${selected ? "text-red-100" : "text-red-600"}`}>{count}</span>}
        </button>;
      })}
    </div>
    <p className="mt-3 text-[11px] font-medium text-slate-500">Numbers show calls to leads per day. Pick any past date to see its report.</p>
  </section>;
}

function Tile({ icon, tint, label, value, detail }: { icon: React.ReactNode; tint: string; label: string; value: number | undefined; detail?: string }) {
  return <div className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm"><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${tint}`}>{icon}</span><div><p className="text-xs font-semibold text-slate-500">{label}</p><p className="text-3xl font-extrabold leading-tight text-slate-900">{value ?? "…"}</p>{detail && <p className="text-[11px] font-medium text-slate-500">{detail}</p>}</div></div>;
}

function MemberRow({ member, rank }: { member: TeamMember; rank: number }) {
  return <tr className="border-b border-slate-100 last:border-0">
    <td className="px-3 py-3 text-xs font-semibold text-slate-500">{rank}</td>
    <td className="px-3 py-3"><div className="flex items-center gap-3"><span className={`grid h-9 w-9 place-items-center rounded-full text-xs font-extrabold ${tone(member.name)}`}>{initials(member.name)}</span><span className="font-bold text-slate-900">{member.name}</span></div></td>
    <td className="px-3 py-3 font-semibold text-slate-800" title="Leads assigned that day, and how many of them were called">{member.leadsCalled} <span className="text-slate-400">/</span> {member.assigned}<span className="ml-1.5 text-[11px] font-medium text-slate-400">called / assigned</span></td>
    <td className="px-3 py-3 font-semibold text-slate-800">{member.calls}<span className="ml-1.5 text-[11px] font-medium text-slate-400">{member.incoming} in · {member.outgoing} out</span></td>
    <td className="px-3 py-3 font-semibold text-slate-800">{member.connected}</td>
    <td className="px-3 py-3 font-semibold text-slate-800">{member.followUps}</td>
    <td className="px-3 py-3"><div className="flex items-center gap-3"><div className="h-2.5 w-24 overflow-hidden rounded-full bg-red-100" role="progressbar" aria-valuenow={member.connectRate} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-red-400" style={{ width: `${member.connectRate}%` }} /></div><span className="text-xs font-bold text-slate-600">{member.connectRate}%</span></div></td>
  </tr>;
}
