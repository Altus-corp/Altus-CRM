export default function ProductWorkspaceLoading() {
  return <section className="mx-auto max-w-[1500px] animate-pulse" aria-live="polite" aria-busy="true" aria-label="Loading product workspace">
    <header className="flex items-center justify-between border border-slate-200 bg-white px-4 py-3"><div><div className="h-3 w-14 rounded bg-red-100" /><div className="mt-2 h-7 w-56 rounded bg-slate-200" /><div className="mt-2 h-3 w-80 rounded bg-slate-100" /></div><div className="h-9 w-36 rounded bg-slate-100" /></header>
    <div className="mt-3 grid gap-3 md:grid-cols-3">{Array.from({ length: 3 }, (_, index) => <article key={index} className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="h-12 bg-slate-50 px-3 py-3"><div className="h-3 w-24 rounded bg-slate-200" /></div><div className="space-y-2 p-3">{Array.from({ length: 5 }, (_, row) => <div key={row} className="h-16 rounded-lg border border-slate-100 bg-white" />)}</div></article>)}</div>
    <p className="mt-3 text-center text-[11px] font-semibold text-slate-400">Loading product workspace…</p>
  </section>;
}
