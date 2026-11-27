// expo-sqlite's localStorage shim provides the localStorage Supabase uses to persist sessions on
// device — this is the current (not expo-secure-store) Expo-recommended setup for @supabase/supabase-js
// on React Native. See https://docs.expo.dev/guides/using-supabase.md.
import 'expo-sqlite/localStorage/install';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY — set them in .env.');
}

// Expo Router server-renders the web target (app.json's web.output: "server") on Node, where this
// module is also evaluated but there is no real `localStorage` global at all. Only pass one when
// it actually exists; otherwise let supabase-js fall back to its own built-in in-memory storage for
// that render pass — the client re-hydrates with the real one once it mounts in the browser.
const webStorage = typeof localStorage === 'undefined' ? undefined : localStorage;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    ...(webStorage ? { storage: webStorage } : {}),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? '';
