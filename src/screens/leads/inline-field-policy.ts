export type TableConfiguredField = { key: string; type: string };
export const BUILT_IN_TABLE_COLUMN_KEYS = ["calling_resolution"] as const;

const MANAGED_FIELD_ALIASES: Record<string, string> = {
  leadAcquiredDate: "lead_acquisition_date", businessCategory: "business_category", natureOfBusiness: "nature_of_business",
  inviteSentByIntroducer: "invite_sent_by_introducer", inviteDateSent: "invite_date_sent", introducerCallDone: "introducer_call_done", introducerCallDate: "introducer_call_date", introducerFeedback: "introducer_feedback", introducerName: "introducer_name", employeeName: "employee_name", associationNetworkName: "association_network_name", chapterName: "chapter_name",
  lastCalledOn: "last_called_on", callingResolution: "calling_resolution", nextCallOn: "next_call_on", callingRemarks: "calling_remarks", introVideoSent: "intro_video_sent", emailSent: "email_sent", whatsappMessageSent: "whatsapp_message_sent", extraNotes: "extra_notes",
};
const LEGACY_ADMIN_FIELD_ALIASES: Record<string, string> = {
  lead_no: "lead_no", lead_type: "lead_type", name: "name", first_name: "first_name", last_name: "last_name", company: "company", company_name: "company", call_no: "phone", cell_no: "phone", phone: "phone", email: "email", email_id: "email", designation: "designation", permission: "permission", stage: "stage", owner: "owner",
};

export function canonicalManagedFieldKey(key: string): string {
  return MANAGED_FIELD_ALIASES[key] || key;
}

export function legacyLeadColumnForAdminField(key: string): string | null {
  return LEGACY_ADMIN_FIELD_ALIASES[key] || null;
}

/** Keep a persisted column layout valid when its available fields change. */
export function keepAllowedColumnOrder(keys: readonly string[], allowedKeys: ReadonlySet<string>): string[] {
  const seen = new Set<string>();
  return keys.filter((key) => allowedKeys.has(key) && !seen.has(key) && (seen.add(key), true));
}

type DisplayColumn = { key: string; displayKey?: string };

/** Admin labels replace matching legacy columns; duplicate aliases render once. */
export function mergeCoreAndConfiguredTableColumns<T extends DisplayColumn>(core: readonly T[], configured: readonly T[]): T[] {
  const displayKey = (field: T) => field.displayKey || field.key;
  const seenConfigured = new Set<string>();
  const uniqueConfigured = configured.filter((field) => !seenConfigured.has(displayKey(field)) && (seenConfigured.add(displayKey(field)), true));
  const configuredDisplayKeys = new Set(uniqueConfigured.map(displayKey));
  return [...core.filter((field) => !configuredDisplayKeys.has(displayKey(field))), ...uniqueConfigured];
}

/**
 * Reconcile a saved layout without turning a deliberate hide into a re-show.
 * `knownKeys` records which columns existed when that layout was last saved.
 */
export function reconcileColumnLayout(visibleKeys: readonly string[], knownKeys: readonly string[], allowedKeys: ReadonlySet<string>, configuredKeys: readonly string[]) {
  const visible = keepAllowedColumnOrder(visibleKeys, allowedKeys);
  const known = [...new Set(knownKeys)];
  const knownSet = new Set(known);
  const appended = configuredKeys.filter((key) => allowedKeys.has(key) && !knownSet.has(key) && !visible.includes(key));
  return { visible: [...visible, ...appended], known: [...new Set([...known, ...allowedKeys])] };
}

export function isInlineTableSelectField<T extends TableConfiguredField>(field: T | undefined): field is T {
  return field?.type === "dropdown" || field?.type === "boolean";
}

export type LeadProductOption = { code: string; label: string };
export type CallResolutionOption = { value: string; label: string };

/** Match Proposed Solution exactly after trimming and case normalization, by product code or label. */
export function resolutionProductCodesForProposedSolution(proposedSolution: unknown, products: readonly LeadProductOption[]): string[] {
  const requested = String(proposedSolution || "").split(/[,;|]/).map((value) => value.trim().toLowerCase()).filter(Boolean);
  return [...new Set(requested.flatMap((value) => products.filter((product) => product.code.trim().toLowerCase() === value || product.label.trim().toLowerCase() === value).map((product) => product.code)))];
}

/** A Calling Resolution select contains only its Proposed Solution product(s)' active fetched options. */
export function callResolutionOptionsForProposedSolution(proposedSolution: unknown, products: readonly LeadProductOption[], resolutionsByProductCode: Readonly<Record<string, readonly CallResolutionOption[]>>): CallResolutionOption[] {
  const options = resolutionProductCodesForProposedSolution(proposedSolution, products).flatMap((code) => resolutionsByProductCode[code] || []);
  return [...new Map(options.map((option) => [option.value, option])).values()];
}

export function isVisibleManagedTableField(key: string, managedKeys: ReadonlySet<string>, activeKeys: ReadonlySet<string>): boolean {
  return !managedKeys.has(key) || activeKeys.has(key);
}

export function rollbackInlineLeadUpdate<TData, TDetail>(previousData: TData, previousDetail: TDetail): { data: TData; detail: TDetail } {
  return { data: previousData, detail: previousDetail };
}
