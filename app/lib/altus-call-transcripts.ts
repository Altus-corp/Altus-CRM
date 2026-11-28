import "server-only";

export type AltusCall = { id?: string | number; user?: string } & Record<string, unknown>;

export function normalizePhone(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : "";
}

export function callHasPhone(call: AltusCall, phone: string) {
  const contact = call.contact && typeof call.contact === "object" ? call.contact as Record<string, unknown> : {};
  return [call.number, call.phone, call.to, call.from, call.caller, call.callee, call.destination, call.source, contact.number, contact.phone, contact.mobile]
    .map(normalizePhone).some((value) => value === phone);
}

function transcriptValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(transcriptValue).filter(Boolean).join("\n");
  if (value && typeof value === "object") {
    const item = value as Record<string, unknown>;
    return [item.text, item.content, item.transcript, item.transcription, item.value, item.segments].map(transcriptValue).filter(Boolean).join("\n");
  }
  return "";
}

export function extractAltusTranscript(call: AltusCall) {
  const recording = call.recording && typeof call.recording === "object" ? call.recording as Record<string, unknown> : {};
  return [call.transcript, call.transcription, call.transcript_text, call.call_transcript, call.segments, recording.transcript, recording.transcription]
    .map(transcriptValue).find(Boolean)?.slice(0, 100_000) ?? "";
}

/** Altus Contacts' `/calls/{id}` response includes its own AI call intelligence (summary, key points,
 * action items, sentiment, disposition, language) alongside the transcript — this reads it the same
 * defensive way as extractAltusTranscript, since only is_summary/summary_status confirm it's ready. */
export type AltusSummary = { summary: string; keyPoints: string[]; actionItems: string[]; sentiment: string | null; disposition: string | null; language: string | null };
export function extractAltusSummary(call: AltusCall): AltusSummary {
  const strList = (value: unknown): string[] => (Array.isArray(value) ? value.map((v) => String(v).trim()).filter(Boolean) : []);
  const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);
  return {
    summary: str(call.summary) ?? "",
    keyPoints: strList(call.key_points),
    actionItems: strList(call.action_items),
    sentiment: str(call.sentiment),
    disposition: str(call.disposition),
    language: str(call.language),
  };
}
