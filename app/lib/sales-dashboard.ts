export type DashboardSummary = { callsMade: number; incoming: number; outgoing: number; connected: number; followUps: number; notReachable: number };

export type RecentCall = {
  id: string;
  name: string;
  subtitle: string;
  direction: "incoming" | "outgoing";
  calledAt: string | null;
  outcome: string | null;
  nextFollowUp: string | null;
  assignedTo: string;
};

export type UpcomingFollowUp = {
  assignmentId: string;
  leadId: string;
  name: string;
  company: string;
  phone: string | null;
  email: string | null;
  followUpAt: string;
  isOverdue: boolean;
};

export type SalesDashboardData = {
  summary: DashboardSummary;
  callsAvailable: boolean;
  callsMessage: string | null;
  recentCalls: RecentCall[];
  upcomingFollowUps: UpcomingFollowUp[];
  updatedAt: string;
};

export type FollowUpItem = {
  assignmentId: string;
  leadId: string;
  name: string;
  company: string;
  phone: string | null;
  email: string | null;
  product: string;
  stage: string | null;
  resolution: string | null;
  followUpAt: string;
};

export type TeamMember = {
  userId: string;
  name: string;
  calls: number;
  incoming: number;
  outgoing: number;
  connected: number;
  followUps: number;
  assigned: number;
  leadsCalled: number;
  connectRate: number;
};

export type CallSummaryData = {
  monthLabel: string;
  calls: number;
  connected: number;
  assignedLeads: number;
  message: string | null;
  updatedAt: string;
};

export type CallReportData = {
  date: string;
  month: string;
  totals: { calls: number; incoming: number; outgoing: number; connected: number; followUps: number; assigned: number; leadsCalled: number };
  members: TeamMember[];
  monthDays: Record<string, number>;
  message: string | null;
  updatedAt: string;
};
