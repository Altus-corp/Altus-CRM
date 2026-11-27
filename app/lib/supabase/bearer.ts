import "server-only";
import { createClient } from "@supabase/supabase-js";

/** A plain (non-cookie, non-SSR) Supabase client — used only to verify a mobile client's own
 * Bearer token (auth.getClaims/getUser(token)) and to run signInWithPassword server-side during
 * mobile login. Never holds or persists a session itself. */
export function createBearerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
