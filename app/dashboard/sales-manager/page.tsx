import Link from "next/link";
import { getSalesManagerReport } from "@/app/lib/sales-manager-report";
import { ActivityResolutionOverview } from "@/components/dashboard/activity-resolution-overview";

export const instant = false;

type SalesManagerSearchParams = { from?: string; to?: string; team?: string };

export async function SalesManagerDashboard({ searchParams = Promise.resolve({}) }: { searchParams?: Promise<SalesManagerSearchParams> } = {}) {
  const report = await getSalesManagerReport(await searchParams);
  const { totals, callsUnavailable } = report;
  const callValue = (value: number) => callsUnavailable ? "Unavailable" : value.toLocaleString("en-IN");
  const connectRate = totals.calls ? Math.round(totals.connected * 100 / totals.calls) : 0;

  return <section className="mx-auto max-w-[1500px] space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Sales overview</h1><p className="mt-1 text-sm text-slate-500">Your own call performance and lead progress, together with sales users in your assigned teams.</p></div><Link href="/dashboard/sales-team" className="text-sm font-bold text-red-700 hover:underline">View My Team</Link></header>
    <ActivityResolutionOverview mode="manager" />
    <form className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-100 bg-white p-4">
      <label className="text-xs font-bold text-slate-600">Team<select name="team" defaultValue={report.selectedTeam} className="mt-1 block h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="">All my teams</option>{report.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
      <label className="text-xs font-bold text-slate-600">From<input type="date" name="from" required defaultValue={report.from} max={report.today} className="mt-1 block h-10 rounded-lg border border-slate-200 px-3 text-sm" /></label>
      <label className="text-xs font-bold text-slate-600">To<input type="date" name="to" required defaultValue={report.to} max={report.today} className="mt-1 block h-10 rounded-lg border border-slate-200 px-3 text-sm" /></label>
      <button className="h-10 rounded-lg bg-[#d90000] px-4 text-sm font-bold text-white hover:bg-red-700">View report</button>
      <Link href={`/dashboard/sales-manager?from=${report.today}&to=${report.today}${report.selectedTeam ? `&team=${report.selectedTeam}` : ""}`} className="px-2 py-2 text-sm font-bold text-red-700">Today</Link>
    </form>
    <p className="text-xs text-slate-500">Calls: {report.from} to {report.to}, India time. Lead progress shows current assignments. Each salesperson is counted once across teams.</p>
    {callsUnavailable ? <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Call history could not be loaded. Call figures are unavailable; lead progress is still shown.</p> : report.syncFailed && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Showing saved CRM call history. Live call refresh was unavailable for one or more team members.</p>}
    {!report.members.length ? <p className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Your report has no active sales users yet. Ask an admin to configure your team if needed.</p> : <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Team calls" value={callValue(totals.calls)} detail={callsUnavailable ? "CRM call history unavailable" : `${totals.incoming} incoming · ${totals.outgoing} outgoing`} />
        <Metric label="Connected calls" value={callValue(totals.connected)} detail={callsUnavailable ? "Connect rate unavailable" : `${connectRate}% connect rate`} />
        <Metric label="Current assigned leads" value={totals.leads.toLocaleString("en-IN")} detail={`${totals.work} product assignments · ${report.members.length} sales users`} />
        <Metric label="Open product work" value={totals.open.toLocaleString("en-IN")} detail={`${totals.closed} closed · ${totals.ambassadors} Ambassadors`} />
        <Metric label="Follow-ups due in selected period" value={totals.followUps.toLocaleString("en-IN")} detail="Current open work with a scheduled follow-up" />
        <Metric label="Overdue follow-ups now" value={totals.overdue.toLocaleString("en-IN")} detail="Open work whose scheduled follow-up has passed" />
      </div>
      <section className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="p-5"><h2 className="text-lg font-bold text-slate-900">Performance by salesperson</h2><p className="mt-1 text-xs text-slate-500">Calls include CRM lead calls only. Coverage is the share of a user’s currently assigned leads called in the selected period.</p></div>
        <div className="overflow-x-auto"><table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-bold text-slate-500"><tr>{["Salesperson", "Calls", "Connected", "Connect rate", "Unique leads called", "Current leads", "Lead coverage", "Open / closed work", "Follow-ups due", "Overdue now", "Ambassadors"].map((label) => <th key={label} scope="col" className="whitespace-nowrap px-4 py-3">{label}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">{report.members.map((member) => <tr key={member.id}>
            <th scope="row" className="px-4 py-4 font-bold text-slate-800">{member.name}{member.isManager && <span className="mt-1 block text-xs font-medium text-red-600">You · Sales Manager</span>}{member.suspended && <span className="mt-1 block text-xs font-medium text-red-600">Suspended</span>}</th>
            <td className="px-4 py-4">{callValue(member.calls)}{!callsUnavailable && <span className="block whitespace-nowrap text-xs text-slate-400">{member.incoming} in · {member.outgoing} out</span>}</td>
            <td className="px-4 py-4">{callValue(member.connected)}</td><td className="px-4 py-4">{callsUnavailable ? "—" : `${member.connectRate}%`}</td>
            <td className="px-4 py-4">{callValue(member.leadsCalled)}</td><td className="px-4 py-4">{member.assignedLeads}</td>
            <td className="min-w-36 px-4 py-4">{callsUnavailable ? "—" : <><span className="text-xs">{member.covered} / {member.assignedLeads} ({member.coverage}%)</span><progress aria-label={`Lead coverage for ${member.name}`} value={member.coverage} max={100} className="mt-1 block h-2 w-full accent-red-600" /></>}</td>
            <td className="px-4 py-4">{member.open} / {member.closed}</td><td className="px-4 py-4">{member.followUps}</td><td className="px-4 py-4 font-bold text-red-700">{member.overdue}</td><td className="px-4 py-4">{member.ambassadors}</td>
          </tr>)}</tbody>
        </table>{!report.members.length && <p className="p-8 text-center text-sm text-slate-500">No sales users belong to the selected team yet.</p>}</div>
      </section>
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm"><h2 className="text-lg font-bold text-slate-900">Lead progress by product and stage</h2><p className="mt-1 text-xs text-slate-500">Current product assignments, including closed work.</p><div className="mt-4 space-y-3">{report.stages.map((stage) => <div key={JSON.stringify([stage.product, stage.stage])}><div className="mb-1 flex justify-between gap-3 text-sm"><span className="font-semibold text-slate-700">{stage.product} · {stage.stage}</span><span className="font-bold text-slate-900">{stage.count}</span></div><progress aria-label={`${stage.product}, ${stage.stage}`} value={stage.count} max={Math.max(1, totals.work)} className="block h-2 w-full accent-red-600" /></div>)}{!report.stages.length && <p className="text-sm text-slate-500">No assigned lead work yet.</p>}</div></section>
        <section className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm"><h2 className="text-lg font-bold text-slate-900">Current activity resolutions</h2><p className="mt-1 text-xs text-slate-500">Latest outcome for each product assignment.</p><dl className="mt-4 divide-y divide-slate-100">{report.resolutions.map((resolution) => <div key={resolution.name} className="flex justify-between gap-3 py-3 text-sm"><dt className="font-semibold text-slate-700">{resolution.name}</dt><dd className="font-bold text-slate-900">{resolution.count}</dd></div>)}</dl>{!report.resolutions.length && <p className="mt-4 text-sm text-slate-500">No resolutions to show yet.</p>}</section>
      </div>
    </>}
  </section>;
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm"><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-2 text-2xl font-extrabold text-slate-900">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div>;
}

export default function SalesManagerPage({ searchParams }: { searchParams: Promise<SalesManagerSearchParams> }) {
  return <SalesManagerDashboard searchParams={searchParams} />;
}
