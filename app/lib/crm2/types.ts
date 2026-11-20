import type { AppRole } from "@/app/lib/roles";
import type { BucketKey } from "./config";

export type Person = { id: string; name: string; roles: AppRole[]; managerId: string | null };
export type ProductDef = { id: string; code: string; name: string; stages: { id: string; name: string }[] };
export type ResolutionDef = { id: string; name: string; bucket: BucketKey };

/** One row per lead × product assignment — every view (table, kanban, cards, calendar, dashboards) reads these. */
export type LeadRow = {
  id: string; // lead_product_assignments.id
  leadId: string;
  no: string;
  name: string;
  first: string;
  last: string;
  company: string;
  phone: string;
  email: string;
  product: string; // product code
  productId: string | null;
  stage: string;
  stageId: string | null;
  resolution: string | null;
  resolutionId: string | null;
  bucket: BucketKey;
  owner: string | null; // assigned_to
  assignedAt: string | null;
  nextFollowUp: string | null;
  lastCalledAt: string | null;
  calls: number;
  connected: number;
  createdAt: string;
  source: string; // leads.lead_database
  ambassador: string | null; // leads.ambassador_imported_by
  isNew: boolean;
  focusedOn: string | null; // lead_product_assignments.focused_on — the day this lead is in the assignee's daily call list
  custom: Record<string, string>;
};
export type CallEv = { u: string; t: string; c: boolean; out: boolean; d: number; a: string | null };
export type MeetEv = { u: string; t: string; kind: string; leadId: string; upcoming: boolean };
export type SimpleEv = { u: string; t: string };
export type TargetSet = { demos?: number; references?: number; ambassadors?: number; callsPerDay?: number; leads?: number };
export type HygieneRule = { key: string; label: string; fromBucket: BucketKey; weight: number };

export type Workspace = {
  generatedAt: string;
  me: string;
  roles: AppRole[];
  displayName: string;
  scope: string[]; // sales users this viewer can see
  people: Person[];
  photos: Record<string, string>; // person id -> real profile photo URL (from WMS attendance), when available
  products: ProductDef[];
  resolutions: ResolutionDef[];
  rows: LeadRow[];
  /** Leads from Ambassadors this viewer is the relationship manager for (ambassador_relationship_managers), even when
   * the specific lead/product is currently assigned to someone else — used only by Ambassador Leads, not elsewhere. */
  ambassadorManagedRows: LeadRow[];
  calls: CallEv[];
  meetings: MeetEv[];
  references: SimpleEv[];
  ambAppointed: SimpleEv[];
  ambLeads: SimpleEv[];
  targets: Record<string, TargetSet>;
  hygiene: HygieneRule[];
  columns: { key: string; label: string; source: string; fieldType: string; options: string[] }[];
  warnings: string[];
};
