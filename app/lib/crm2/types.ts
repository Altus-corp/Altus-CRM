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
  /** Only meaningful when product === "AMBASSADOR": whether this Ambassador lead already has a CRM login
   * (lead_product_assignments.ambassador_user_id, set once Create Ambassador Account matches them by phone). */
  ambassadorHasAccount: boolean;
  extraContacts: number; // lead_contacts rows for this lead (secondary contacts beyond the lead's own Primary contact)
  /** One synthetic row per secondary contact — same product/stage/resolution/owner/etc. as this row, only
   * name/phone/email differ. Rendered as child rows under this lead in the table when expanded. */
  extraRows: LeadRow[];
  custom: Record<string, string>;
};
export type CallEv = { u: string; t: string; c: boolean; out: boolean; d: number; a: string | null };
/** `sentAt` is when the Zoom/Meet invite was created (the link-send date) — `t` (start time) is when the call itself
 * happens, and still drives "done vs upcoming" for the demos/meetings count already in use elsewhere. */
export type MeetEv = { u: string; t: string; sentAt: string; kind: string; leadId: string; upcoming: boolean };
export type SimpleEv = { u: string; t: string; leadId?: string; name?: string };
export type TargetSet = { demos?: number; references?: number; ambassadors?: number; callsPerDay?: number; leads?: number; meetings?: number; focusedCalls?: number; products?: Record<string, number> };
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
  /** `computedFrom` means the classic CRM derives this field from other fields (e.g. Full Name from first +
   * last) and never stores a value for it directly — editing it is a no-op there, so v2 must not offer to either. */
  columns: { key: string; label: string; source: string; fieldType: string; options: string[]; computedFrom: string[] }[];
  warnings: string[];
};
