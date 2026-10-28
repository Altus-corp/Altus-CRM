"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { FollowUpActions } from "@/components/dashboard/follow-up-actions";
import type { FollowUpItem } from "@/app/lib/sales-dashboard";

type Filter = "all" | "overdue" | "today" | "week" | "later";

const dayKeyFormat = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Kolkata" });
const timeFormat = new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
const dayLabelFormat = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
const weekdayFormat = new Intl.DateTimeFormat("en-IN", { weekday: "short", timeZone: "Asia/Kolkata" });
const avatarTones = ["bg-sky-100 text-sky-700", "bg-rose-100 text-rose-700", "bg-violet-100 text-violet-700", "bg-amber-100 text-amber-700", "bg-emerald-100 text-emerald-700"];

const dayKey = (ms: number) => dayKeyFormat.format(new Date(ms));
const dayNumber = (key: string) => { const [year, month, day] = key.split("-").map(Number); return Date.UTC(year, month - 1, day) / 86_400_000; };
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
const tone = (name: string) => avatarTones[[...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % avatarTones.length];
const clock = (ms: number) => timeFormat.format(new Date(ms)).toUpperCase();

function bucketOf(time: number, now: number): Exclude<Filter, "all"> {
  if (time < now) return "overdue";
  const diff = dayNumber(dayKey(time)) - dayNumber(dayKey(now));
  if (diff === 0) return "today";
  return diff <= 7 ? "week" : "later";
}

export function UpcomingFollowUps({ items }: { items: FollowUpItem[] }) {
  const [now, setNow] = useState(() => Date.now());
  const [filter, setFilter] = useState<Filter>("all");
  const [product, setProduct] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const entries = useMemo(() => items.map((item) => ({ item, time: new Date(item.followUpAt).getTime() })).sort((a, b) => a.time - b.time), [items]);
  const products = useMemo(() => [...new Set(items.map((item) => item.product))].sort(), [items]);
  const search = query.trim().toLowerCase();
  const matching = entries.filter(({ item }) => (!product || item.product === product) && (!search || [item.name, item.company, item.phone, item.email].some((value) => value?.toLowerCase().includes(search))));

  const counts = { overdue: 0, today: 0, week: 0, later: 0 };
  for (const { time } of matching) counts[bucketOf(time, now)] += 1;
  const visible = matching.filter(({ time }) => filter === "all" || bucketOf(time, now) === filter);

  const todayNumber = dayNumber(dayKey(now));
  const days = Array.from({ length: 7 }, (_, index) => {
    const ms = now + index * 86_400_000;
    const key = dayKey(ms);
    return { key, label: index === 0 ? "Today" : weekdayFormat.format(new Date(ms)), count: matching.filter(({ time }) => time >= now && dayKey(time) === key).length };
  });
  const peak = Math.max(1, ...days.map((day) => day.count));

  const groups: { key: string; label: string; rows: typeof visible }[] = [];
  for (const entry of visible) {
    const key = entry.time < now ? "overdue" : dayKey(entry.time);
    let group = groups.find((candidate) => candidate.key === key);
    if (!group) {
      const diff = key === "overdue" ? 0 : dayNumber(key) - todayNumber;
      const date = dayLabelFormat.format(new Date(entry.time));
      group = { key, label: key === "overdue" ? "Overdue" : diff === 0 ? `Today · ${date}` : diff === 1 ? `Tomorrow · ${date}` : date, rows: [] };
      groups.push(group);
    }
    group.rows.push(entry);
  }

  const stats: { id: Exclude<Filter, "all">; label: string; value: number; tint: string }[] = [
    { id: "overdue", label: "Overdue", value: counts.overdue, tint: "text-red-600 bg-red-50" },
    { id: "today", label: "Later today", value: counts.today, tint: "text-violet-600 bg-violet-50" },
    { id: "week", label: "Next 7 days", value: counts.week, tint: "text-sky-600 bg-sky-50" },
    { id: "later", label: "Later", value: counts.later, tint: "text-slate-600 bg-slate-100" },
  ];
  const tileClass = (active: boolean) => `rounded-xl border p-3 text-left transition ${active ? "border-red-300 bg-red-50/60" : "border-slate-200 bg-slate-50 hover:border-slate-300"}`;

  return <div className="mx-auto max-w-5xl space-y-4">
    <header className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-[10px] font-extrabold tracking-[0.12em] text-red-600">FOLLOW-UPS</p><h1 className="mt-0.5 text-xl font-extrabold tracking-[-0.03em] text-slate-900">Upcoming Follow-ups</h1><p className="mt-1 text-xs text-slate-500">Every pending follow-up on your assigned leads, soonest first.</p></div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="relative"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, company, phone" aria-label="Search follow-ups" className="h-9 w-full rounded-lg border border-slate-200 pl-8 pr-3 text-sm outline-none focus:border-red-400 sm:w-60" /></label>
          <select value={product} onChange={(event) => setProduct(event.target.value)} aria-label="Filter by product" className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-700 outline-none focus:border-red-400"><option value="">All products</option>{products.map((code) => <option key={code} value={code}>{code}</option>)}</select>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <button type="button" onClick={() => setFilter("all")} aria-pressed={filter === "all"} className={tileClass(filter === "all")}><p className="text-xl font-extrabold leading-none text-slate-900">{matching.length}</p><p className="mt-1 text-xs font-medium text-slate-500">All pending</p></button>
        {stats.map((stat) => <button key={stat.id} type="button" onClick={() => setFilter(filter === stat.id ? "all" : stat.id)} aria-pressed={filter === stat.id} className={tileClass(filter === stat.id)}><p className={`inline-block rounded-md px-2 py-0.5 text-xl font-extrabold leading-none ${stat.tint}`}>{stat.value}</p><p className="mt-1.5 text-xs font-medium text-slate-500">{stat.label}</p></button>)}
      </div>

      <div className="mt-4" aria-label="Follow-ups over the next seven days">
        <p className="text-xs font-bold text-slate-700">Workload · next 7 days</p>
        <div className="mt-2 grid grid-cols-7 gap-2">{days.map((day) => <div key={day.key} className="text-center"><div className="flex h-16 items-end justify-center rounded-lg bg-slate-50"><div className="w-full max-w-8 rounded-t bg-sky-400" style={{ height: `${Math.max(day.count ? 8 : 0, (day.count / peak) * 100)}%` }} title={`${day.count} follow-up${day.count === 1 ? "" : "s"}`} /></div><p className="mt-1 text-[11px] font-bold text-slate-800">{day.count}</p><p className="text-[10px] font-semibold text-slate-500">{day.label}</p></div>)}</div>
      </div>
    </header>

    {!groups.length ? <p className="rounded-2xl bg-white p-8 text-center text-sm font-semibold text-slate-400 shadow-sm">{items.length ? "No follow-ups match these filters." : "No follow-ups scheduled on your leads."}</p>
      : groups.map((group) => <section key={group.key} className="rounded-2xl bg-white p-4 shadow-sm" aria-label={group.label}>
        <h2 className={`text-sm font-extrabold ${group.key === "overdue" ? "text-red-600" : "text-slate-900"}`}>{group.label} <span className="ml-1 text-xs font-semibold text-slate-400">{group.rows.length}</span></h2>
        <ul className="mt-3 space-y-2.5">{group.rows.map(({ item, time }) => <li key={item.assignmentId} className="flex flex-col gap-2 rounded-xl border border-slate-100 p-2.5 shadow-[0_1px_4px_rgba(15,23,42,0.05)] sm:flex-row sm:items-center sm:gap-3">
          <span className={`w-[78px] shrink-0 text-xs font-bold ${time < now ? "text-red-600" : "text-slate-600"}`}>{clock(time)}{time < now && <span className="block text-[10px] font-semibold">{dayLabelFormat.format(new Date(time))}</span>}</span>
          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-extrabold ${tone(item.name)}`}>{initials(item.name)}</span>
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-900">{item.name}</p><p className="truncate text-xs text-slate-500">{item.company}{item.phone ? ` · ${item.phone}` : ""}</p></div>
          <div className="flex flex-wrap items-center gap-1.5"><span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700">{item.product}</span>{item.stage && <span className="rounded-md bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">{item.stage}</span>}{item.resolution && <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">{item.resolution}</span>}</div>
          <FollowUpActions leadId={item.leadId} assignmentId={item.assignmentId} phone={item.phone} email={item.email} />
        </li>)}</ul>
      </section>)}
  </div>;
}
