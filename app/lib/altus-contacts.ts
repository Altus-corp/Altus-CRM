type ApiEnvelope<T> = { ok: boolean; data?: T; error?: string; next_cursor?: string | null; next_before?: string | null };

export class AltusContactsError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

function contactsSettings() {
  const baseUrl = process.env.ALTUS_CONTACTS_API_BASE_URL?.replace(/\/$/, "");
  const apiKey = process.env.ALTUS_CONTACTS_API_KEY;
  if (!baseUrl || !apiKey) throw new AltusContactsError("Altus Contacts is not configured on this server.", 503);
  return { baseUrl, apiKey };
}

export async function altusContactsRequest<T>(path: string, init: RequestInit = {}) {
  const { baseUrl, apiKey } = contactsSettings();
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      cache: "no-store",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", ...init.headers },
    });
  } catch {
    throw new AltusContactsError("Altus Contacts is temporarily unavailable. Please try again.", 503);
  }

  const body = await response.json().catch(() => null) as ApiEnvelope<T> | null;
  if (!response.ok || !body?.ok) throw new AltusContactsError(body?.error || "Altus Contacts could not complete this request.", response.status || 502);
  return body;
}

export function altusContactsErrorResponse(error: unknown) {
  if (error instanceof AltusContactsError) return Response.json({ ok: false, error: error.message }, { status: error.status });
  return Response.json({ ok: false, error: "Unable to contact Altus Contacts." }, { status: 500 });
}
