export default function LeadsLoading() {
  return <section className="mx-auto max-w-[1500px] animate-pulse" aria-label="Loading leads">
    <div className="border border-slate-200 bg-white px-4 py-3"><div className="h-3 w-14 rounded bg-red-100" /><div className="mt-2 h-7 w-36 rounded bg-slate-200" /><div className="mt-3 grid gap-2 sm:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-20 rounded border border-slate-100 bg-slate-50" />)}</div></div>
    <div className="mt-3 overflow-hidden border border-slate-200 bg-white"><div className="flex gap-5 border-b border-slate-200 px-4 py-3">{Array.from({ length: 7 }, (_, index) => <div key={index} className="h-3 w-20 rounded bg-slate-200" />)}</div>{Array.from({ length: 8 }, (_, row) => <div key={row} className="flex h-12 items-center gap-5 border-b border-slate-100 px-4">{Array.from({ length: 7 }, (_, column) => <div key={column} className="h-3 w-20 rounded bg-slate-100" />)}</div>)}</div>
  </section>;
}
