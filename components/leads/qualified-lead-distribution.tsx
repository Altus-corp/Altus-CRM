"use client";

import { useMemo, useState, useTransition } from "react";
import { updateQualifiedLeadDistribution } from "@/app/dashboard/lead-settings/actions";

type Member = { id: string; name: string; roles: string[] };
type Rule = { user_id: string; weight: number; position: number };

export function QualifiedLeadDistribution({ members, rules }: { members: Member[]; rules: Rule[] }) {
  const initial = useMemo(() => new Map(rules.map((rule) => [rule.user_id, rule.weight])), [rules]);
  const [weights, setWeights] = useState(initial);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  const selected = members.filter((member) => (weights.get(member.id) ?? 0) > 0);
  const total = selected.reduce((sum, member) => sum + (weights.get(member.id) ?? 0), 0);

  function changeWeight(userId: string, raw: number) {
    setWeights((current) => {
      const next = new Map(current);
      next.set(userId, Math.max(0, Math.min(1000, Number.isFinite(raw) ? Math.floor(raw) : 0)));
      return next;
    });
  }

  function save() {
    startTransition(async () => {
      try {
        await updateQualifiedLeadDistribution(selected.map((member, index) => ({ userId: member.id, weight: weights.get(member.id) ?? 0, position: index + 1 })));
        setMessage("Qualified-lead ratio saved. The running distribution position was kept.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Unable to save the qualified-lead ratio.");
      }
    });
  }

  return (
    <section className="mt-4 rounded-[16px] border border-slate-100 bg-white p-4 shadow-[0_8px_24px_rgba(42,55,80,0.06)]">
      <div className="flex flex-col justify-between gap-3 border-b border-slate-100 pb-3 sm:flex-row sm:items-center">
        <div>
          <p className="text-[10px] font-extrabold tracking-[0.12em] text-red-600">QUALIFIED LEADS</p>
          <h2 className="mt-0.5 text-[18px] font-extrabold tracking-[-0.035em] text-slate-900">Automatic distribution ratio</h2>
          <p className="mt-1 text-[11px] text-slate-500">New qualified leads are assigned immediately in this ratio. The sequence continues permanently and never resets each day.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-extrabold text-red-700">Ratio total: {total || "Not set"}</span>
          <button type="button" onClick={save} disabled={pending || !selected.length} className="h-8 rounded bg-[#d90000] px-3 text-[10px] font-extrabold text-white hover:bg-red-700 disabled:bg-slate-300">
            {pending ? "Saving..." : "Save ratio"}
          </button>
        </div>
      </div>
      {message && <p role="status" className={`mt-3 rounded-md border px-3 py-2 text-[11px] font-bold ${message.includes("saved") ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>{message}</p>}
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {members.map((member) => {
          const weight = weights.get(member.id) ?? 0;
          return <label key={member.id} className={`flex items-center gap-3 rounded-lg border p-3 ${weight ? "border-red-200 bg-red-50/40" : "border-slate-200 bg-slate-50"}`}>
            <input type="checkbox" checked={weight > 0} onChange={(event) => changeWeight(member.id, event.target.checked ? Math.max(1, weight) : 0)} className="h-4 w-4 accent-red-600" />
            <span className="min-w-0 flex-1"><span className="block truncate text-xs font-extrabold text-slate-800">{member.name}</span><span className="block truncate text-[10px] text-slate-500">{member.roles.map((role) => role.replaceAll("_", " ")).join(", ")}</span></span>
            <input aria-label={`${member.name} qualified lead ratio`} type="number" min="0" max="1000" value={weight} onChange={(event) => changeWeight(member.id, Number(event.target.value))} className="h-8 w-14 rounded border border-slate-200 bg-white px-1 text-center text-xs font-extrabold text-slate-700 outline-none focus:border-red-400" />
          </label>;
        })}
      </div>
      {!members.length && <p className="mt-3 rounded-lg bg-slate-50 p-4 text-xs font-semibold text-slate-500">Add an active Sales Executive, Sales Manager, or Consultant before configuring the qualified-lead ratio.</p>}
    </section>
  );
}
