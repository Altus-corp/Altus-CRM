"use client";
// Admin Panel · Teams — a kanban board (column per manager, drag a card to reassign) over the exact same
// crm_teams / crm_team_members data and saveTeam/deleteTeam actions the classic /dashboard/team page uses.
import { useEffect, useState } from "react";
import { ROLE_LABELS, type AppRole } from "@/app/lib/roles";
import { primaryRole } from "@/app/lib/crm2/config";
import { v2ListTeams, v2MoveTeamMember } from "@/app/crm/actions";
import { TeamForm, type Team, type TeamPerson } from "@/app/dashboard/team/team-form";
import { useCrm } from "./context";
import { Avatar, Icon, Pill, Win, useToast } from "./ui";

type Data = Awaited<ReturnType<typeof v2ListTeams>>;

export function AdminTeamsPage() {
  const toast = useToast(); const { ws } = useCrm();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(""); const [gen, setGen] = useState(0);
  const [editing, setEditing] = useState<"new" | Team | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  useEffect(() => { let live = true; v2ListTeams().then((d) => live && setData(d)).catch((e) => live && setError(e instanceof Error ? e.message : "Unable to load teams.")); return () => { live = false; }; }, [gen]);

  if (error) return <div className="soonbox"><div className="tile" style={{ padding: 28, textAlign: "center" }}><Icon n="info" s="l" /><span className="tv">Could not load Teams</span><span className="ts">{error}</span></div></div>;
  if (!data) return <div className="empty">Loading…</div>;
  if (!data.teamsReady) return <div className="soonbox"><div className="tile" style={{ padding: 28, textAlign: "center" }}><Icon n="info" s="l" /><span className="tv">Teams aren&apos;t set up yet</span><span className="ts">Apply the crm_teams / crm_team_members migration in Supabase, then reload this page.</span></div></div>;

  const peopleById = new Map(data.people.map((p) => [p.id, p]));
  const memberToTeam = new Map<string, string>();
  data.teams.forEach((t) => t.memberIds.forEach((id) => memberToTeam.set(id, t.id)));
  const reportsCount = new Map<string, number>();
  data.teams.forEach((t) => reportsCount.set(t.managerId, (reportsCount.get(t.managerId) ?? 0) + t.memberIds.length));
  const noManager = data.people.filter((p) => !memberToTeam.has(p.id) && !p.suspended);

  const move = async (personId: string, toTeamId: string | null) => {
    const fromTeamId = memberToTeam.get(personId) ?? null;
    if (fromTeamId === toTeamId) return;
    const r = await v2MoveTeamMember(personId, fromTeamId, toTeamId);
    toast(r.message); if (r.ok) setGen((g) => g + 1);
  };

  const teamPeople: TeamPerson[] = data.people.map((p) => ({ id: p.id, name: p.name, roles: p.roles, suspended: p.suspended }));
  const card = (personId: string) => {
    const p = peopleById.get(personId); if (!p) return null;
    const role = primaryRole(p.roles as AppRole[]);
    const reports = reportsCount.get(p.id) ?? 0;
    return <div key={p.id} className="kcard" draggable onDragStart={(e) => { e.dataTransfer.setData("text/id", p.id); setDragId(p.id); }} onDragEnd={() => setDragId(null)}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Avatar name={p.name} photo={ws.photos[p.id]} /><b style={{ flex: 1 }}>{p.name}</b>{reports > 0 && <Pill tone="lav">{reports} reports</Pill>}</div>
      <Pill tone={role === "sales_manager" ? "sky" : role === "admin" ? "rose" : "slate"}>{p.roles.length ? ROLE_LABELS[role] : "No role"}</Pill>
    </div>;
  };
  const drop = (toTeamId: string | null) => (e: { preventDefault: () => void; dataTransfer: { getData: (k: string) => string } }) => { e.preventDefault(); const id = e.dataTransfer.getData("text/id") || dragId; if (id) move(id, toTeamId); };

  return <div style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0, flex: 1 }}>
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
      <button className="btn" onClick={() => setGen((g) => g + 1)} title="Reload"><Icon n="refresh" s="s" /> Refresh</button>
      <button className="btn red" onClick={() => setEditing("new")}><Icon n="plus" s="s" /> New team</button>
    </div>
    <div className="kan">
      <div className="kcol" style={{ borderTopColor: "var(--faint)" }}>
        <div className="kcol-h"><Pill tone="slate">No manager</Pill><span style={{ marginLeft: "auto", color: "var(--muted)" }}>{noManager.length}</span></div>
        <div className="kcol-b" onDragOver={(e) => e.preventDefault()} onDrop={drop(null)}>
          {noManager.map((p) => card(p.id))}
          {!noManager.length && <div style={{ textAlign: "center", color: "var(--faint)", fontSize: 11, padding: 10 }}>Drop here to unassign</div>}
        </div>
      </div>
      {data.teams.map((t) => { const manager = peopleById.get(t.managerId);
        return <div key={t.id} className="kcol">
          <div className="kcol-h" style={{ cursor: "pointer" }} onClick={() => setEditing({ id: t.id, name: t.name, managerId: t.managerId, memberIds: t.memberIds })} title="Edit team">
            <Avatar name={manager?.name ?? "?"} photo={ws.photos[t.managerId]} /><b>{manager?.name ?? "Unknown"}</b><span style={{ marginLeft: "auto", color: "var(--muted)" }}>{t.memberIds.length}</span>
          </div>
          <div className="ts" style={{ padding: "0 10px", color: "var(--muted)" }}>{t.name}</div>
          <div className="kcol-b" onDragOver={(e) => e.preventDefault()} onDrop={drop(t.id)}>
            {t.memberIds.map((id) => card(id))}
            {!t.memberIds.length && <div style={{ textAlign: "center", color: "var(--faint)", fontSize: 11, padding: 10 }}>Drop a card here</div>}
          </div>
        </div>; })}
    </div>
    {editing && <Win small title={editing === "new" ? "Create team" : `Edit ${editing.name}`} onClose={() => { setEditing(null); setGen((g) => g + 1); }}>
      <div className="win-b" style={{ padding: 16 }}><TeamForm people={teamPeople} team={editing === "new" ? undefined : editing} /></div>
    </Win>}
  </div>;
}
