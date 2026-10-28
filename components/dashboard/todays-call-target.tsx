"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type TargetData = { assignedLeads: number; matchedCalls: number; connectedCalls: number; contactedLeads: number };

export function TodaysCallTarget({ assignedLeads }: { assignedLeads: number }) {
  const [data, setData] = useState<TargetData>({ assignedLeads, matchedCalls: 0, connectedCalls: 0, contactedLeads: 0 });
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    const load = () => fetch("/api/altus-contacts/focused-calls", { cache: "no-store" })
      .then((response) => response.json() as Promise<{ ok?: boolean; data?: TargetData }>)
      .then((result) => { if (active && result.ok && result.data) setData(result.data); })
      .catch(() => undefined)
      .finally(() => { if (active) setLoaded(true); });
    void load();
    const interval = window.setInterval(load, 60_000);
    return () => { active = false; window.clearInterval(interval); };
  }, []);
  const target = data.assignedLeads || assignedLeads;
  const percent = target ? Math.min(100, Math.round((data.contactedLeads / target) * 100)) : 0;
  return <section className="mb-2 rounded-[10px] border border-[#d93b43] bg-gradient-to-br from-[#c90000] to-[#a90000] p-2 shadow-[0_7px_16px_rgba(181,0,0,0.2)]" aria-label="Today's calling target"><p className="text-[9px] font-extrabold tracking-[-0.01em] text-white">Today&apos;s target</p><div className="mt-1.5 flex items-center gap-2"><div className="grid h-[48px] w-[48px] shrink-0 place-items-center rounded-full p-[5px]" style={{ background: `conic-gradient(#ff5160 0deg ${percent * 3.6}deg, #f4b0b4 ${percent * 3.6}deg 360deg)` }}><div className="grid h-full w-full place-items-center rounded-full bg-[#b60000] text-center"><span className="text-[10px] font-extrabold text-white">{percent}%</span></div></div><div><p className="text-[17px] font-extrabold leading-none text-white">{data.contactedLeads} / {target}</p><p className="mt-1 text-[9px] font-semibold leading-tight text-red-100">Focused leads<br />contacted today</p></div></div><div className="mt-1.5 flex justify-between text-[8px] font-semibold text-red-100"><span>{loaded ? `${data.matchedCalls} matched calls` : "Loading calls..."}</span><span>{data.connectedCalls} connected</span></div><Link href="/dashboard/leads?view=focused" className="mt-1.5 flex h-6 items-center justify-center rounded-[5px] border border-white/30 bg-white/10 text-[9px] font-extrabold text-white transition hover:bg-white/20">View Calling List <span className="ml-1">→</span></Link></section>;
}
