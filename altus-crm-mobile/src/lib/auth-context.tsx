import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { apiBaseUrl, supabase } from './supabase-client';

export type MobileUserInfo = { userId: string; email: string; displayName: string; roles: string[] };

type AuthState = {
  loading: boolean;
  user: MobileUserInfo | null;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<MobileUserInfo | null>(null);
  const mounted = useRef(true);

  const refreshMe = async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) { if (mounted.current) setUser(null); return; }
    try {
      const response = await fetch(`${apiBaseUrl}/api/mobile/me`, { headers: { Authorization: `Bearer ${token}` } });
      const json = (await response.json()) as { ok: boolean; user?: MobileUserInfo };
      if (mounted.current) setUser(json.ok && json.user ? json.user : null);
    } catch {
      if (mounted.current) setUser(null);
    }
  };

  useEffect(() => {
    mounted.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- session bootstrap on mount, see (tabs)/index.tsx
    refreshMe().finally(() => { if (mounted.current) setLoading(false); });

    const { data: subscription } = supabase.auth.onAuthStateChange(() => { void refreshMe(); });
    // Supabase's own recommendation for React Native: only auto-refresh the token while the app is
    // actually in the foreground, so a backgrounded app doesn't keep refreshing in the background.
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    });

    return () => {
      mounted.current = false;
      subscription.subscription.unsubscribe();
      appStateSubscription.remove();
    };
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/mobile/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const json = (await response.json()) as {
        ok: boolean; error?: string;
        session?: { accessToken: string; refreshToken: string };
        user?: MobileUserInfo;
      };
      if (!json.ok || !json.session || !json.user) return { ok: false, error: json.error ?? 'Could not sign in.' };

      const { error } = await supabase.auth.setSession({
        access_token: json.session.accessToken,
        refresh_token: json.session.refreshToken,
      });
      if (error) return { ok: false, error: error.message };
      setUser(json.user);
      return { ok: true };
    } catch {
      return { ok: false, error: 'Unable to reach the server. Check your connection.' };
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  return <AuthContext.Provider value={{ loading, user, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
