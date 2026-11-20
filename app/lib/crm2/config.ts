// Altus CRM v2 — static configuration shared by server and client.
import type { AppRole } from "@/app/lib/roles";

export type Tone = "slate" | "lav" | "sky" | "peach" | "butter" | "mint" | "rose" | "sage" | "aqua";
export const TONES: Record<Tone, { name: string; bg: string; bd: string; ink: string; mk: string; means: string }> = {
  slate: { name: "Slate", bg: "#EEF1F5", bd: "#D5DBE4", ink: "#3E4A5C", mk: "#8592A6", means: "Totals · neutral counts" },
  lav: { name: "Lavender", bg: "#F1EDFB", bd: "#DCD3F4", ink: "#4B3A8F", mk: "#7E6BC9", means: "New · not yet called · not read" },
  sky: { name: "Sky", bg: "#E8F2FB", bd: "#CDE1F4", ink: "#1F4F7A", mk: "#4F93D2", means: "Approach · in progress · meetings & demos" },
  peach: { name: "Peach", bg: "#FDEEE4", bd: "#F7D6C0", ink: "#8A4317", mk: "#E08A4F", means: "Follow-up · pending · call back" },
  butter: { name: "Butter", bg: "#FCF5D9", bd: "#F1E3A6", ink: "#6E5604", mk: "#C9A227", means: "Negotiation · ageing · needs attention" },
  mint: { name: "Mint", bg: "#E4F4EC", bd: "#C4E6D4", ink: "#1D6146", mk: "#3FA77A", means: "Closing · won · connected · done" },
  rose: { name: "Rose", bg: "#FBE8EC", bd: "#F3CCD5", ink: "#8E2A40", mk: "#D9677E", means: "Lost · DND · overdue · deficit" },
  sage: { name: "Sage", bg: "#EDF3E5", bd: "#D6E4C3", ink: "#47602B", mk: "#7FA35A", means: "Targets · surplus · revenue · commission" },
  aqua: { name: "Aqua", bg: "#E2F4F4", bd: "#C2E5E6", ink: "#145E61", mk: "#2FA4A9", means: "AI insights · data hygiene" },
};

export type BucketKey = "closing" | "negotiation" | "followup" | "approach" | "new" | "lost";
export const BUCKETS: { key: BucketKey; label: string; tone: Tone; weight: number }[] = [
  { key: "closing", label: "Closing", tone: "mint", weight: 100 },
  { key: "negotiation", label: "Negotiation", tone: "butter", weight: 75 },
  { key: "followup", label: "Follow-up", tone: "peach", weight: 50 },
  { key: "approach", label: "Approach", tone: "sky", weight: 25 },
  { key: "new", label: "New / Not called", tone: "lav", weight: 10 },
  { key: "lost", label: "Lost / DND", tone: "rose", weight: 0 },
];
export const BUCKET = Object.fromEntries(BUCKETS.map((b) => [b.key, b])) as Record<BucketKey, (typeof BUCKETS)[number]>;

/** Default resolution → bucket map. Admin can override in Control Panel → Stage Buckets (table crm_resolution_buckets). */
export const DEFAULT_RESOLUTION_BUCKETS: Record<string, BucketKey> = {
  "verbal yes": "closing", "agreement sent": "closing", "agreement signed/ waived": "closing", "agreement signed / waived": "closing", "agreement signed": "closing", "proposal signed": "closing", delivered: "closing", "already done": "closing",
  negotiation: "negotiation", "negotiation/ queries": "negotiation", "negotiation / queries": "negotiation", "proposal sent": "negotiation", "proposal drafted": "negotiation",
  "follow up": "followup", "call back": "followup", "call for next": "followup", "i will get back": "followup", "demo given": "followup", "meeting scheduled": "followup", "invite again": "followup", tentative: "followup", registered: "followup",
  ringing: "approach", busy: "approach", "no busy": "approach", escalated: "approach", "did not attend": "approach",
  "not interested": "lost", lost: "lost", dnd: "lost", "wrong number": "lost", "junk lead": "lost", "meeting cancelled": "lost", abandoned: "lost", cancelled: "lost", "old, graduate": "lost",
};

export const PERIODS = [
  { key: "1", label: "Today", days: 1 }, { key: "3", label: "3 days", days: 3 }, { key: "7", label: "7 days", days: 7 },
  { key: "10", label: "10 days", days: 10 }, { key: "15", label: "15 days", days: 15 }, { key: "22", label: "22 days", days: 22 },
  { key: "30", label: "30 days", days: 30 }, { key: "range", label: "Date range", days: 45 },
] as const;

export type ModuleDef = { id: string; label: string; icon: string; soon?: boolean; ext?: string; roles?: AppRole[] };
export const MODULES: ModuleDef[] = [
  { id: "dashboards", label: "Dashboards", icon: "dash" },
  { id: "marketing", label: "Marketing", icon: "megaphone", soon: true },
  { id: "sales", label: "Sales", icon: "trend" },
  { id: "ambassadors", label: "Ambassadors", icon: "users" },
  { id: "lms", label: "LMS", icon: "cap", soon: true },
  { id: "billing", label: "Billing", icon: "receipt", ext: process.env.NEXT_PUBLIC_OS_BILLING_URL || "https://os.altuscorp.in/billing" },
  { id: "incentives", label: "Incentives", icon: "gift", soon: true },
  { id: "marketing-kpi", label: "Marketing KPI", icon: "target", soon: true },
  { id: "sales-kpi", label: "Sales KPI", icon: "gauge", soon: true },
  { id: "admin", label: "Admin Panel", icon: "shield", roles: ["admin"] },
  { id: "control", label: "Control Panel", icon: "sliders", roles: ["admin"] },
];

export type DashDef = { id: string; label: string; icon: string; tone: Tone; roles: AppRole[] };
const ALL: AppRole[] = ["admin", "sales_manager", "sales_executive", "consultant", "ambassador", "marketing_manager", "marketing_executive"];
const MGMT: AppRole[] = ["admin", "sales_manager"];
const SALES: AppRole[] = ["admin", "sales_manager", "sales_executive", "consultant"];
export const DASHES: DashDef[] = [
  { id: "my-day", label: "My Day", icon: "home", tone: "slate", roles: ["sales_executive", "sales_manager", "consultant"] },
  { id: "my-ambassador", label: "My Ambassador Desk", icon: "home", tone: "slate", roles: ["ambassador"] },
  { id: "hot", label: "Focus Now · Hot Pipeline", icon: "fire", tone: "mint", roles: [...SALES, "ambassador"] },
  { id: "ai", label: "AI Insights", icon: "spark", tone: "aqua", roles: ALL },
  { id: "calling", label: "Calling Report", icon: "phone", tone: "sky", roles: SALES },
  { id: "ageing", label: "Lead Ageing", icon: "clock", tone: "butter", roles: SALES },
  { id: "follow-ups", label: "Follow-ups", icon: "cal", tone: "peach", roles: SALES },
  { id: "ranking", label: "Sales Ranking", icon: "trophy", tone: "sage", roles: SALES },
  { id: "targets", label: "Targets · Surplus / Deficit", icon: "target", tone: "rose", roles: [...SALES, "ambassador"] },
  { id: "ambassador-inflow", label: "Ambassador Lead Inflow", icon: "users", tone: "lav", roles: [...MGMT, "marketing_manager"] },
  { id: "assignments", label: "Leads Assigned per Sales Person", icon: "layers", tone: "lav", roles: [...MGMT, "marketing_manager"] },
  { id: "hygiene", label: "Data Hygiene", icon: "db", tone: "aqua", roles: [...SALES, "marketing_manager"] },
  { id: "resolution", label: "Activity Resolution", icon: "list", tone: "slate", roles: SALES },
  { id: "funnel", label: "Conversion Funnel", icon: "funnel", tone: "sky", roles: [...MGMT, "marketing_manager"] },
  { id: "sources", label: "Lead Sources", icon: "megaphone", tone: "sage", roles: [...MGMT, "marketing_manager", "marketing_executive"] },
  { id: "speed", label: "Speed to Lead", icon: "clock", tone: "butter", roles: MGMT },
  { id: "best-time", label: "Best Time to Call", icon: "phone", tone: "sky", roles: SALES },
  { id: "meetings", label: "Meetings & Demos", icon: "video", tone: "sky", roles: [...SALES, "ambassador"] },
  { id: "ambassador-performance", label: "Ambassador Performance", icon: "trophy", tone: "sage", roles: MGMT },
  { id: "lost", label: "Lost & DND Reasons", icon: "ban", tone: "rose", roles: [...MGMT, "marketing_manager"] },
];
export const DEFAULT_DASH: Partial<Record<AppRole, string>> = { admin: "hot", sales_manager: "hot", sales_executive: "my-day", consultant: "my-day", ambassador: "my-ambassador", marketing_manager: "sources", marketing_executive: "sources" };
export const primaryRole = (roles: AppRole[]): AppRole => (["admin", "sales_manager", "sales_executive", "consultant", "marketing_manager", "marketing_executive", "ambassador"] as AppRole[]).find((r) => roles.includes(r)) ?? roles[0];
export const dashesFor = (roles: AppRole[]) => DASHES.filter((d) => d.roles.some((r) => roles.includes(r)));
export const modulesFor = (roles: AppRole[]) => MODULES.filter((m) => !m.roles || m.roles.some((r) => roles.includes(r))).filter((m) => !(roles.length === 1 && roles[0] === "ambassador" && !["dashboards", "sales", "ambassadors"].includes(m.id)));

export const DEFAULT_TARGETS = { sales: { demos: 3, references: 15, ambassadors: 3, callsPerDay: 60 }, ambassador: { demos: 3, leads: 10 } };
