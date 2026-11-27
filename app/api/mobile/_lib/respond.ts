// Shared response shape for every app/api/mobile/* route — same { ok, error? } convention
// already used by app/api/marketplace/leads/route.ts and app/api/leads/global-search/route.ts.
export function mobileJson<T extends Record<string, unknown>>(data: T, status = 200) {
  return Response.json({ ok: true, ...data }, { status, headers: { "Cache-Control": "no-store" } });
}

export function mobileError(message: string, status = 400) {
  return Response.json({ ok: false, error: message }, { status, headers: { "Cache-Control": "no-store" } });
}
