"use client";

import { updateLeadDatabasePriority } from "@/app/dashboard/lead-settings/actions";

type DatabasePriority = { database_key: "reference_leads" | "qualified_leads" | "leads" | "database_leads"; label: string; priority: number };

export function LeadDatabasePriority({ priorities }: { priorities: DatabasePriority[] }) {
  return <section className="mb-4 rounded-[16px] border border-slate-100 bg-white p-4 shadow-[0_8px_24px_rgba(42,55,80,0.06)]">
    <div className="flex flex-col justify-between gap-2 border-b border-slate-100 pb-3 sm:flex-row sm:items-center"><div><p className="text-[10px] font-extrabold tracking-[0.12em] text-red-600">ROUND ROBIN</p><h2 className="mt-0.5 text-[18px] font-extrabold tracking-[-0.035em] text-slate-900">Lead database priority</h2><p className="mt-0.5 text-xs text-slate-500">Priority 1 is considered first, then 2, 3, and 4 whenever round-robin assignment runs.</p></div><span className="rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-extrabold text-red-700">Assignment order</span></div>
    <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{[...priorities].sort((a, b) => a.priority - b.priority).map((item) => <form key={item.database_key} action={updateLeadDatabasePriority} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5"><input type="hidden" name="databaseKey" value={item.database_key} /><div><p className="text-sm font-extrabold text-slate-800">{item.label}</p><p className="mt-0.5 text-[10px] text-slate-500">Round-robin queue</p></div><label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500">Priority<select name="priority" defaultValue={item.priority} onChange={(event) => event.currentTarget.form?.requestSubmit()} className="h-8 rounded-md border border-slate-200 bg-white px-2 text-sm font-extrabold text-red-600 outline-none focus:border-red-400"><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option></select></label></form>)}</div>
  </section>;
}
