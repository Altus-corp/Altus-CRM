import { displayProductCode } from "@/app/lib/product-display";

export type PerformancePerson = { id: string; name: string; suspended: boolean; isManager?: boolean };
export type PerformanceCall = { user_id: string; lead_id: string | null; direction: string; is_connected: boolean; duration_seconds: number | null; called_at: string };
export type PerformanceAssignment = {
  id: string; lead_id: string; assigned_to: string; is_closed: boolean; is_ambassador: boolean;
  next_follow_up_at: string | null;
  product: { code: string } | null; stage: { name: string } | null; resolution: { name: string } | null;
};

export function summarizeTeamPerformance(people: PerformancePerson[], calls: PerformanceCall[], assignments: PerformanceAssignment[], now: number, start: number, end: number) {
  const members = people.map((person) => {
    const mine = calls.filter((call) => call.user_id === person.id);
    const work = assignments.filter((assignment) => assignment.assigned_to === person.id);
    const ownedLeads = new Set(work.map((assignment) => assignment.lead_id));
    const calledLeads = new Set(mine.map((call) => call.lead_id).filter((id): id is string => Boolean(id)));
    const covered = [...ownedLeads].filter((id) => calledLeads.has(id)).length;
    const connected = mine.filter((call) => call.is_connected).length;
    const open = work.filter((assignment) => !assignment.is_closed);
    const due = (assignment: PerformanceAssignment) => assignment.next_follow_up_at ? Date.parse(assignment.next_follow_up_at) : NaN;
    return {
      ...person, calls: mine.length, incoming: mine.filter((call) => call.direction === "incoming").length,
      outgoing: mine.filter((call) => call.direction === "outgoing").length, connected,
      connectRate: mine.length ? Math.round(connected * 100 / mine.length) : 0,
      leadsCalled: calledLeads.size, assignedLeads: ownedLeads.size, work: work.length, open: open.length,
      closed: work.filter((assignment) => assignment.is_closed).length,
      ambassadors: work.filter((assignment) => assignment.is_ambassador).length,
      followUps: open.filter((assignment) => due(assignment) >= start && due(assignment) < end).length,
      overdue: open.filter((assignment) => due(assignment) < now).length,
      covered, coverage: ownedLeads.size ? Math.round(covered * 100 / ownedLeads.size) : 0,
    };
  }).sort((a, b) => b.calls - a.calls || a.name.localeCompare(b.name));
  const sum = (key: "calls" | "connected" | "incoming" | "outgoing" | "open" | "closed" | "ambassadors" | "followUps" | "overdue") => members.reduce((total, member) => total + member[key], 0);
  const stages = new Map<string, { product: string; stage: string; count: number }>();
  const resolutions = new Map<string, number>();
  for (const assignment of assignments) {
    const product = displayProductCode(assignment.product?.code, "Unknown product");
    const stage = assignment.stage?.name ?? "No stage";
    const key = JSON.stringify([product, stage]);
    const group = stages.get(key) ?? { product, stage, count: 0 };
    group.count += 1;
    stages.set(key, group);
    const resolution = assignment.resolution?.name ?? "No resolution";
    resolutions.set(resolution, (resolutions.get(resolution) ?? 0) + 1);
  }
  return {
    members,
    totals: { calls: sum("calls"), connected: sum("connected"), incoming: sum("incoming"), outgoing: sum("outgoing"), open: sum("open"), closed: sum("closed"), ambassadors: sum("ambassadors"), followUps: sum("followUps"), overdue: sum("overdue"), leads: new Set(assignments.map((assignment) => assignment.lead_id)).size, work: assignments.length },
    stages: [...stages.values()].sort((a, b) => a.product.localeCompare(b.product) || b.count - a.count),
    resolutions: [...resolutions].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
  };
}
