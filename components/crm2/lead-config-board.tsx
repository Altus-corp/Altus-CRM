"use client";
// Control Panel · Lead Configuration / Columns / Products / Dropdowns — embeds the exact classic
// components from app/dashboard/lead-settings, which already manage their own actions/mutations.
import { useEffect, useState } from "react";
import { v2LeadColumns, v2LeadConfigDefaults, v2LeadDropdowns, v2LeadProducts } from "@/app/crm/actions";
import { ColumnsManagement } from "@/components/leads/columns-management";
import { DropdownManagement } from "@/components/leads/dropdown-management";
import { LeadConfiguration } from "@/components/leads/lead-configuration";
import { LeadDatabasePriority } from "@/components/leads/lead-database-priority";
import { QualifiedLeadDistribution } from "@/components/leads/qualified-lead-distribution";
import { RoundRobinWeeklyTargets } from "@/components/leads/round-robin-weekly-targets";
import { Icon } from "./ui";

function Refresh({ onClick }: { onClick: () => void }) {
  return <div style={{ display: "flex", justifyContent: "flex-end" }}><button className="btn" onClick={onClick} title="Reload — a save here doesn't appear until you refresh"><Icon n="refresh" s="s" /> Refresh</button></div>;
}
const Err = ({ text }: { text: string }) => <div className="soonbox"><div className="tile" style={{ padding: 28, textAlign: "center" }}><Icon n="info" s="l" /><span className="tv">Not available</span><span className="ts">{text}</span></div></div>;
const Loading = () => <div className="empty">Loading…</div>;

export function AdminLeadConfigPage() {
  const [data, setData] = useState<Awaited<ReturnType<typeof v2LeadConfigDefaults>> | null>(null);
  const [gen, setGen] = useState(0);
  useEffect(() => { let live = true; v2LeadConfigDefaults().then((d) => live && setData(d)); return () => { live = false; }; }, [gen]);
  if (!data) return <Loading />;
  return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    <Refresh onClick={() => setGen((g) => g + 1)} />
    {data.prioritiesReady ? <LeadDatabasePriority priorities={data.priorities} /> : <Err text="Round-robin priorities are unavailable. Run the lead database priorities migration first." />}
    {data.qualifiedRulesReady ? <QualifiedLeadDistribution members={data.members} rules={data.qualifiedRules} /> : <Err text="Qualified-lead distribution is unavailable. Run the qualified-lead ratio database migration first." />}
    {data.weeklyTargetsReady ? <RoundRobinWeeklyTargets members={data.members} products={data.products} targets={data.weeklyTargets} schedule={data.schedule} scheduleAvailable={data.scheduleReady} /> : <Err text="Round-robin weekly targets are unavailable. Run the round-robin weekly targets database migration first." />}
  </div>;
}

export function AdminColumnsPage() {
  const [data, setData] = useState<Awaited<ReturnType<typeof v2LeadColumns>> | null>(null);
  const [gen, setGen] = useState(0);
  useEffect(() => { let live = true; v2LeadColumns().then((d) => live && setData(d)); return () => { live = false; }; }, [gen]);
  if (!data) return <Loading />;
  if (!data.ready) return <Err text="Columns management is not available. Run the lead-table-columns database migration first." />;
  return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}><Refresh onClick={() => setGen((g) => g + 1)} /><ColumnsManagement columns={data.columns} /></div>;
}

export function AdminProductsPage() {
  const [data, setData] = useState<Awaited<ReturnType<typeof v2LeadProducts>> | null>(null);
  const [gen, setGen] = useState(0);
  useEffect(() => { let live = true; v2LeadProducts().then((d) => live && setData(d)); return () => { live = false; }; }, [gen]);
  if (!data) return <Loading />;
  if (!data.ready) return <Err text="Lead configuration is not available. Run the lead-engine database migration first." />;
  return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}><Refresh onClick={() => setGen((g) => g + 1)} /><LeadConfiguration products={data.products} stages={data.stages} resolutions={data.resolutions} /></div>;
}

export function AdminDropdownsPage() {
  const [data, setData] = useState<Awaited<ReturnType<typeof v2LeadDropdowns>> | null>(null);
  const [gen, setGen] = useState(0);
  useEffect(() => { let live = true; v2LeadDropdowns().then((d) => live && setData(d)); return () => { live = false; }; }, [gen]);
  if (!data) return <Loading />;
  if (!data.ready) return <Err text="Dropdown management is not set up yet. Run 20261026_create_stage_dropdowns.sql in the Supabase SQL Editor." />;
  return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}><Refresh onClick={() => setGen((g) => g + 1)} /><DropdownManagement products={data.products} stages={data.stages} dropdowns={data.dropdowns} /></div>;
}
