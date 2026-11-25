// BANT (Budget / Authority / Need / Timeline) — shared constants between the server action
// (app/dashboard/leads/actions.ts) and the UI (classic + v2), kept out of the "use server" actions file
// since that file may only export async functions.
export const BANT_FIELD_LABELS = { b: "Budget", a: "Authority", n: "Need", t: "Timeline" } as const;
export type BantField = keyof typeof BANT_FIELD_LABELS;
export const BANT_OPTIONS: Record<BantField, string[]> = {
  b: ["Assumed", "Confirmed", "High", "Not Known"],
  a: ["Decision Maker", "Assumed", "Confirmed", "Not Known"],
  n: ["Assumed", "Confirmed", "Not Known"],
  t: ["Assumed", "Confirmed", "Not Known"],
};

export function bantCustomKey(field: BantField) {
  return `bant_${field}`;
}

// Fixed tone per value rather than a hash, since each sub-field has a small, known option set.
export const BANT_TONE: Record<string, "yellow" | "grey" | "green"> = {
  Assumed: "yellow",
  "Not Known": "grey",
  Confirmed: "green",
  High: "green",
  "Decision Maker": "green",
};

export function bantToneStyle(value: string): { background: string; color: string } | undefined {
  const tone = BANT_TONE[value];
  return tone === "yellow" ? { background: "#FCF5D9", color: "#6E5604" }
    : tone === "green" ? { background: "#DCFCE7", color: "#065F46" }
    : tone === "grey" ? { background: "#F1F1F1", color: "#475569" }
    : undefined;
}
