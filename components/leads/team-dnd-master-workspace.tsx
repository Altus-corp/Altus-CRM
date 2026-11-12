"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { DndMasterTable, type DndRow } from "./dnd-master-table";
import type { LeadColumn } from "./leads-table";

type TeamMember = { id: string; name: string };
type Filter = { key: string; label: string };
type Preferences = { order: string[]; widths: Record<string, number>; frozen: string[]; hidden: string[]; layoutVersion?: number };

export function TeamDndMasterWorkspace({
  rows,
  columns,
  assignedNames,
  preferences,
  teamMembers,
  selectedMemberId,
  filters,
  activeFilter,
  filterCounts,
}: {
  rows: DndRow[];
  columns: LeadColumn[];
  assignedNames: Record<string, string>;
  preferences: Preferences;
  teamMembers: TeamMember[];
  selectedMemberId: string | null;
  filters: Filter[];
  activeFilter: string;
  filterCounts: Record<string, number>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedMember = teamMembers.find((member) => member.id === selectedMemberId) ?? null;
  const updateRoute = (memberId: string, filter = activeFilter) => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("page");
    if (memberId) next.set("member", memberId);
    else next.delete("member");
    if (filter === "all") next.delete("type");
    else next.set("type", filter);
    router.push(`/dashboard/team-dnd-master?${next.toString()}`);
  };

  return <section className="mx-auto max-w-[1500px]">
    <header className="border border-slate-200 bg-white px-4 py-3">
      <p className="text-[10px] font-extrabold tracking-[0.12em] text-red-600">LEADS</p>
      <h1 className="mt-0.5 text-[22px] font-extrabold tracking-[-0.04em] text-slate-900">{selectedMember ? `${selectedMember.name}'s Do Not Call` : "Team Do Not Call"}</h1>
      <p className="mt-1 text-xs text-slate-500">{selectedMember ? "Viewing this team member's Do Not Call records. Lead details are view-only." : "Choose a team member to review their Do Not Call records."}</p>

      <label className="mt-3 flex max-w-sm flex-col gap-1 text-[10px] font-extrabold uppercase tracking-wide text-slate-500">
        Sales person
        <select aria-label="Choose a team member" value={selectedMemberId ?? ""} onChange={(event) => updateRoute(event.target.value)} className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold normal-case tracking-normal text-slate-700 outline-none focus:border-red-500">
          <option value="">Choose team member</option>
          {teamMembers.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
        </select>
      </label>

      {selectedMember && <div className="mt-3 flex flex-wrap gap-2">{filters.map((filter) => <button key={filter.key} type="button" onClick={() => updateRoute(selectedMember.id, filter.key)} className={`h-8 rounded border px-3 text-[11px] font-extrabold ${activeFilter === filter.key ? "border-[#d90000] bg-[#d90000] text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{filter.label} <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[9px] ${activeFilter === filter.key ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"}`}>{filterCounts[filter.key] ?? 0}</span></button>)}</div>}
    </header>

    {selectedMember ? <DndMasterTable rows={rows} columns={columns} assignedNames={assignedNames} preferences={preferences} emptyLabel="No Do Not Call records for this team member." readOnly /> : <div className="mt-3 rounded-lg border border-dashed border-slate-300 bg-white px-4 py-12 text-center"><p className="text-sm font-extrabold text-slate-700">Choose a team member</p><p className="mt-1 text-xs text-slate-500">Their DND, Not Interested, Lost, I Will Get Back, and Wrong Number records will appear here.</p></div>}
  </section>;
}
