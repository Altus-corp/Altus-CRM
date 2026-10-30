import Link from "next/link";
import { requireUser } from "@/app/lib/auth";
import { createClient } from "@/app/lib/supabase/server";

export async function AmbassadorDashboard() {
  const { userId, displayName } = await requireUser();
  const supabase = await createClient();
  const [total, recent] = await Promise.all([
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("ambassador_imported_by", userId),
    supabase.from("leads").select("id, first_name, last_name, email, phone, created_at").eq("ambassador_imported_by", userId).order("created_at", { ascending: false }).limit(5),
  ]);
  if (total.error || recent.error) return <p role="alert" className="rounded-xl bg-amber-50 p-5 text-sm text-amber-800">Your dashboard could not be loaded. Ask an admin to check the Ambassador workspace migration.</p>;
  return <section className="mx-auto max-w-6xl space-y-5">
    <header><h1 className="text-2xl font-extrabold text-slate-900">Ambassador dashboard</h1><p className="mt-1 text-sm text-slate-500">Welcome, {displayName}. Import and manage your leads here.</p></header>
    <div className="grid gap-4 sm:grid-cols-2"><div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm"><p className="text-sm font-semibold text-slate-500">Your imported leads</p><p className="mt-2 text-3xl font-extrabold text-slate-900">{total.count ?? 0}</p></div><div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm"><h2 className="font-bold text-slate-900">Add your leads</h2><p className="mt-1 text-sm text-slate-500">Upload Excel or CSV from the Leads page. Leads are assigned to you and excluded from round robin.</p><Link href="/dashboard/leads" className="mt-3 inline-block rounded-lg bg-[#d90000] px-4 py-2 text-sm font-bold text-white">Open Leads</Link></div></div>
    <section className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm"><h2 className="p-5 text-lg font-bold text-slate-900">Recently imported leads</h2><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr>{["Name", "Phone", "Email", "Imported on"].map((label) => <th key={label} scope="col" className="px-5 py-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{recent.data.map((lead) => <tr key={lead.id}><td className="px-5 py-3 font-bold text-slate-800">{[lead.first_name, lead.last_name].filter(Boolean).join(" ")}</td><td className="px-5 py-3 text-slate-600">{lead.phone || "—"}</td><td className="px-5 py-3 text-slate-600">{lead.email || "—"}</td><td className="px-5 py-3 text-slate-600">{new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium" }).format(new Date(lead.created_at))}</td></tr>)}</tbody></table>{!recent.data.length && <p className="p-8 text-center text-sm text-slate-500">No leads imported yet. Open Leads to upload your first file.</p>}</div></section>
  </section>;
}
