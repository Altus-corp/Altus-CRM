// Hand-written mirrors of app/api/mobile/* response shapes — intentionally decoupled from the web
// app's Workspace/LeadRow types, which carry far more than a phone screen needs.
export type BucketKey = 'closing' | 'negotiation' | 'followup' | 'approach' | 'new' | 'lost';

export type MyLeadRow = {
  assignmentId: string;
  leadId: string;
  name: string;
  company: string;
  phone: string;
  email: string;
  product: string;
  stage: string | null;
  resolution: string | null;
  bucket: BucketKey;
  nextFollowUp: string | null;
  lastCalledAt: string | null;
};

export type MobileLeadDetail = MyLeadRow & {
  custom: Record<string, string>;
  leadNumber: string;
  availableResolutions: { id: string; name: string }[];
};

export type ActivityItem = {
  id: string;
  activityType: string;
  note: string | null;
  createdAt: string;
  followUpAt: string | null;
  metadata: Record<string, unknown> | null;
};

export type BantField = 'b' | 'a' | 'n' | 't';
export const BANT_FIELD_LABELS: Record<BantField, string> = { b: 'Budget', a: 'Authority', n: 'Need', t: 'Timeline' };
export const BANT_OPTIONS: Record<BantField, string[]> = {
  b: ['Assumed', 'Confirmed', 'High', 'Not Known'],
  a: ['Assumed', 'Confirmed', 'Not Known'],
  n: ['Assumed', 'Confirmed', 'Not Known'],
  t: ['Assumed', 'Confirmed', 'Not Known'],
};
export const bantCustomKey = (field: BantField) => `bant_${field}`;
// Mirrors app/lib/bant.ts's BANT_TONE/bantToneStyle — duplicated deliberately, see components/bant-field.tsx.
export const BANT_TONE: Record<string, 'yellow' | 'grey' | 'green'> = {
  Assumed: 'yellow',
  'Not Known': 'grey',
  Confirmed: 'green',
  High: 'green',
};
