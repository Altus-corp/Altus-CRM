"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { LeadsTable, type LeadColumn, type LeadRow } from "./leads-table";

type TeamMember = { id: string; name: string };

type Preferences = {
  order: string[];
  widths: Record<string, number>;
  frozen: string[];
  hidden: string[];
  layoutVersion?: number;
};

export function TeamLeadsWorkspace({
  columns,
  leads,
  focusedLeadIds,
  assignedNames,
  preferences,
  teamMembers,
  selectedMemberId,
  view,
}: {
  columns: LeadColumn[];
  leads: LeadRow[];
  focusedLeadIds: string[];
  assignedNames: Record<string, string>;
  preferences: Preferences;
  teamMembers: TeamMember[];
  selectedMemberId: string | null;
  view: "focused" | "master";
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedMember = teamMembers.find((member) => member.id === selectedMemberId) ?? null;
  const focusedIds = new Set(focusedLeadIds);
  const displayedLeads = view === "focused" ? leads.filter((lead) => focusedIds.has(lead.assignment_id)) : leads;

  const updateRoute = (memberId: string, nextView = view) => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("page");
    next.set("view", nextView);
    if (memberId) next.set("member", memberId);
    else next.delete("member");
    router.push(`/dashboard/team-leads?${next.toString()}`);
  };

  return (
    <section className="mx-auto max-w-7xl" aria-label="Team leads">
      <header className="border border-slate-200 bg-white px-4 py-3">
        <p className="text-[10px] font-extrabold tracking-[0.12em] text-red-600">LEADS</p>
        <h1 className="mt-0.5 text-[19px] font-extrabold tracking-[-0.04em] text-slate-900">
          {selectedMember ? `${selectedMember.name}'s ${view === "focused" ? "Focused Leads" : "Lead Master"}` : "Team Leads"}
        </h1>
        <p className="mt-1 text-xs text-slate-500">
          {selectedMember ? "Viewing this team member's leads. Task details are view-only." : "Choose one of your team members to view their leads."}
        </p>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex min-w-64 flex-col gap-1 text-[10px] font-extrabold uppercase tracking-wide text-slate-500">
            Sales person
            <select
              aria-label="Choose a team member"
              value={selectedMemberId ?? ""}
              onChange={(event) => updateRoute(event.target.value)}
              className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold normal-case tracking-normal text-slate-700 outline-none focus:border-red-500"
            >
              <option value="">Choose team member</option>
              {teamMembers.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
            </select>
          </label>
          {selectedMember && (
            <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={() => updateRoute(selectedMember.id, "focused")} className={`rounded border px-3 py-2 text-left ${view === "focused" ? "border-red-200 border-b-2 border-b-red-600 bg-red-50/60" : "border-slate-200 bg-slate-50 hover:border-slate-300"}`}>
                <p className="text-xs font-extrabold text-slate-800">Focused Leads</p>
                <p className="mt-0.5 text-[10px] text-slate-500">Assigned today</p>
              </button>
              <button type="button" onClick={() => updateRoute(selectedMember.id, "master")} className={`rounded border px-3 py-2 text-left ${view === "master" ? "border-red-200 border-b-2 border-b-red-600 bg-red-50/60" : "border-slate-200 bg-slate-50 hover:border-slate-300"}`}>
                <p className="text-xs font-extrabold text-slate-800">Lead Master</p>
                <p className="mt-0.5 text-[10px] text-slate-500">All active leads</p>
              </button>
            </div>
          )}
        </div>
      </header>

      {selectedMember ? (
        <div className="mt-3">
          <LeadsTable
            columns={columns}
            leads={displayedLeads}
            assignedNames={assignedNames}
            preferences={preferences}
            readOnly
            showHeader={false}
          />
        </div>
      ) : (
        <div className="mt-3 rounded-lg border border-dashed border-slate-300 bg-white px-4 py-12 text-center">
          <p className="text-sm font-extrabold text-slate-700">Choose a team member</p>
          <p className="mt-1 text-xs text-slate-500">Their Focused Leads and Lead Master will appear here.</p>
        </div>
      )}
    </section>
  );
}
