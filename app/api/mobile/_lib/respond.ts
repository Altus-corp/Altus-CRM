// Shared response shape for every app/api/mobile/* route — same { ok, error? } convention
// already used by app/api/marketplace/leads/route.ts and app/api/leads/global-search/route.ts.
//
// CORS: these routes authenticate via a Bearer token (never cookies), so there's no session to
// leak by allowing any origin — unlike the cookie-based web routes, this is safe to open up.
// Native iOS/Android fetch isn't subject to CORS at all, but Expo's web target (and browser-based
// testing in general) is, so every route needs both these headers on its real responses and an
// OPTIONS handler to answer the browser's preflight request.
const CORS_HEADERS: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export function mobileJson<T extends Record<string, unknown>>(data: T, status = 200) {
  return Response.json({ ok: true, ...data }, { status, headers: { "Cache-Control": "no-store", ...CORS_HEADERS } });
}

export function mobileError(message: string, status = 400) {
  return Response.json({ ok: false, error: message }, { status, headers: { "Cache-Control": "no-store", ...CORS_HEADERS } });
}

/** Re-export as `OPTIONS` from every app/api/mobile/* route so the browser's CORS preflight gets
 * a real answer instead of a 405. */
export async function mobileOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
