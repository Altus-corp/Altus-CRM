import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "../api/client";

export type User = { id: string; name: string; email: string; role: string; role_label?: string; capability_overrides?: string[]; must_change_password?: boolean };
type AuthContextValue = { user: User | null; loading: boolean; login: (email: string, password: string) => Promise<void>; logout: () => Promise<void>; updateUser: (updates: Partial<User>) => void };
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api<{ user: User }>("/api/me").then((r) => setUser(r.user)).catch(() => {}).finally(() => setLoading(false)); }, []);
  const value: AuthContextValue = {
    user, loading,
    login: async (email, password) => { const r = await api<{ user: User }>("/api/login", { method: "POST", body: JSON.stringify({ email, password }) }); setUser(r.user); },
    logout: async () => { try { await api("/api/logout", { method: "POST" }); } finally { setUser(null); } },
    updateUser: (updates) => setUser((current) => current ? { ...current, ...updates } : current),
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error("AuthProvider is missing."); return value; }
