"use client";

import { useState, useTransition } from "react";
import { Copy, Database, KeyRound, Pause, Play, X } from "lucide-react";
import { createMarketplaceLeadsApiKey, setMarketplaceLeadsApiKeyStatus } from "@/app/dashboard/crm-market-place/actions";

type Service = "database_leads" | "reference_leads" | "qualified_leads" | "leads";
type Access = { read?: boolean; write?: boolean };
type ApiKey = { id: string; name: string; key_prefix: string; key_last4: string; subscriptions: Partial<Record<Service, Access>>; is_active: boolean; created_at: string; last_used_at: string | null };

const services: { id: Service; label: string; description: string }[] = [
  { id: "database_leads", label: "Database Leads", description: "General lead database" },
  { id: "reference_leads", label: "Reference Leads", description: "Referral and reference leads" },
  { id: "qualified_leads", label: "Qualified Leads", description: "Qualified inbound leads" },
  { id: "leads", label: "Leads", description: "Standard CRM leads" },
];

const formattedDate = (value: string | null) => value ? new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(value)) : "Never";

export function LeadsManagementApi({ apiKeys, databaseReady }: { apiKeys: ApiKey[]; databaseReady: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [subscriptions, setSubscriptions] = useState<Partial<Record<Service, Access>>>({});
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const updateAccess = (service: Service, mode: keyof Access, checked: boolean) => setSubscriptions((current) => ({ ...current, [service]: { ...current[service], [mode]: checked } }));
  const createKey = () => startTransition(async () => {
    const result = await createMarketplaceLeadsApiKey({ name, subscriptions });
    if (!result.ok) { setMessage(result.message); return; }
    setCreatedKey(result.apiKey);
    setMessage("");
    setName("");
    setSubscriptions({});
  });
  const toggleKey = (key: ApiKey) => startTransition(async () => {
    const result = await setMarketplaceLeadsApiKeyStatus(key.id, !key.is_active);
    setMessage(result.message);
  });
  const copy = async (value: string) => { await navigator.clipboard.writeText(value); setMessage("Copied to clipboard."); };

  return <>
    <button type="button" onClick={() => setIsOpen(true)} className="group w-full max-w-md rounded-2xl border border-red-100 bg-white p-5 text-left shadow-[0_5px_18px_rgba(42,55,80,0.05)] transition hover:-translate-y-0.5 hover:border-red-300 hover:shadow-[0_12px_24px_rgba(217,0,0,0.1)]">
      <span className="grid h-11 w-11 place-items-center rounded-xl bg-red-50 text-red-600"><Database className="h-5 w-5" /></span>
      <h2 className="mt-4 text-base font-extrabold text-slate-900">Leads Management</h2>
      <p className="mt-1 text-xs leading-5 text-slate-500">Create scoped API keys for external systems to securely read or submit CRM leads.</p>
      <span className="mt-4 inline-flex items-center gap-1 text-xs font-extrabold text-red-600">Manage API access <span aria-hidden="true">→</span></span>
    </button>

    {isOpen && <div className="fixed inset-0 z-[100] overflow-y-auto bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-label="Leads Management API"><div className="mx-auto my-6 w-full max-w-5xl rounded-2xl bg-[#f7f8fb] shadow-2xl"><header className="flex items-start justify-between border-b border-slate-200 bg-white px-5 py-4"><div><p className="text-[10px] font-extrabold tracking-[0.12em] text-red-600">CRM MARKET PLACE</p><h2 className="mt-1 text-xl font-extrabold text-slate-900">Leads Management API</h2><p className="mt-1 text-xs text-slate-500">Give external systems only the lead-database access they need.</p></div><button type="button" onClick={() => setIsOpen(false)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close"><X className="h-5 w-5" /></button></header>
      <div className="grid gap-4 p-5 lg:grid-cols-[390px_1fr]">
        <section className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-red-600" /><h3 className="text-sm font-extrabold text-slate-900">Generate API key</h3></div>{!databaseReady && <p role="alert" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">Run the CRM Market Place API database migration before creating keys.</p>}<label className="mt-4 block text-xs font-bold text-slate-700">API name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} placeholder="Example: Partner website" className="mt-1.5 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-red-400" /></label><p className="mt-4 text-xs font-bold text-slate-700">Subscribe services</p><div className="mt-2 overflow-hidden rounded-lg border border-slate-200">{services.map((service) => <div key={service.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-slate-100 px-3 py-2.5 last:border-0"><span><span className="block text-xs font-bold text-slate-700">{service.label}</span><span className="text-[10px] text-slate-400">{service.description}</span></span>{(["read", "write"] as const).map((mode) => <label key={mode} className="flex cursor-pointer items-center gap-1 text-[10px] font-bold text-slate-600"><input type="checkbox" checked={Boolean(subscriptions[service.id]?.[mode])} onChange={(event) => updateAccess(service.id, mode, event.target.checked)} className="h-3.5 w-3.5 accent-red-600" />{mode === "read" ? "Read" : "Write"}</label>)}</div>)}</div><button type="button" disabled={isPending || !databaseReady || !name.trim()} onClick={createKey} className="mt-4 h-9 w-full rounded-lg bg-[#d90000] px-4 text-xs font-extrabold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-300">{isPending ? "Generating…" : "Generate key"}</button></section>
        <section className="min-w-0"><div className="rounded-xl border border-slate-200 bg-white p-4"><h3 className="text-sm font-extrabold text-slate-900">Integration endpoint</h3><p className="mt-1 text-xs text-slate-500">Use the key as <code className="rounded bg-slate-100 px-1">Authorization: Bearer YOUR_KEY</code> or <code className="rounded bg-slate-100 px-1">x-api-key</code>.</p><code className="mt-3 block overflow-x-auto rounded-lg bg-slate-950 px-3 py-2 text-xs text-emerald-300">POST /api/marketplace/leads</code><p className="mt-3 text-xs leading-5 text-slate-500">POST requires <code>service</code>, <code>first_name</code>, and <code>product_code</code>. Optional fields: <code>last_name</code>, <code>email</code>, <code>phone</code>, <code>stage_name</code>, <code>external_id</code>, and <code>custom_data</code>. GET reads only the selected <code>service</code>.</p></div>
          <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="border-b border-slate-200 px-4 py-3"><h3 className="text-sm font-extrabold text-slate-900">API keys</h3><p className="mt-0.5 text-[10px] text-slate-500">Full secrets are shown once, immediately after they are generated.</p></div><div className="overflow-x-auto"><table className="min-w-[620px] w-full text-left text-xs"><thead className="bg-slate-50 text-[10px] font-extrabold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-2.5">Name</th><th className="px-4 py-2.5">Key</th><th className="px-4 py-2.5">Access</th><th className="px-4 py-2.5">Last used</th><th className="px-4 py-2.5"></th></tr></thead><tbody>{apiKeys.map((key) => <tr key={key.id} className="border-t border-slate-100"><td className="px-4 py-3 font-bold text-slate-800"><span>{key.name}</span><span className={`ml-2 rounded-full px-1.5 py-0.5 text-[9px] ${key.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{key.is_active ? "Active" : "Paused"}</span></td><td className="px-4 py-3 font-mono text-slate-600">{key.key_prefix}••••{key.key_last4}</td><td className="max-w-[210px] px-4 py-3 text-[10px] font-semibold text-slate-600">{services.flatMap((service) => { const access = key.subscriptions[service.id]; return access ? [`${service.label}: ${[access.read && "R", access.write && "W"].filter(Boolean).join("/")}`] : []; }).join(" · ")}</td><td className="px-4 py-3 text-slate-500">{formattedDate(key.last_used_at)}</td><td className="px-4 py-3"><button type="button" disabled={isPending} onClick={() => toggleKey(key)} className="inline-flex h-7 items-center gap-1 rounded border border-slate-200 px-2 text-[10px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">{key.is_active ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}{key.is_active ? "Pause" : "Enable"}</button></td></tr>)}{!apiKeys.length && <tr><td colSpan={5} className="px-4 py-10 text-center text-sm font-semibold text-slate-400">No API keys have been created.</td></tr>}</tbody></table></div></div>
        </section>
      </div>{message && <p role="status" className="mx-5 mb-5 rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">{message}</p>}
    </div></div>}
    {createdKey && <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/55 p-4" role="dialog" aria-modal="true" aria-label="Your new API key"><div className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl"><p className="text-[10px] font-extrabold tracking-[0.12em] text-red-600">SAVE THIS NOW</p><h2 className="mt-1 text-xl font-extrabold text-slate-900">Your API key</h2><p className="mt-2 text-sm text-slate-500">For security, this full key will not be displayed again after you close this window.</p><div className="mt-4 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3"><code className="min-w-0 flex-1 break-all text-xs font-semibold text-slate-800">{createdKey}</code><button type="button" onClick={() => copy(createdKey)} className="grid h-8 w-8 shrink-0 place-items-center rounded border border-slate-200 bg-white text-slate-600 hover:text-red-600" aria-label="Copy API key"><Copy className="h-4 w-4" /></button></div><button type="button" onClick={() => setCreatedKey(null)} className="mt-5 h-9 w-full rounded-lg bg-[#d90000] text-xs font-extrabold text-white hover:bg-red-700">I have saved this key</button></div></div>}
  </>;
}
