import { Navigate } from "react-router-dom";
import { useAuth } from "./auth";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <p>Loading…</p>;
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}
