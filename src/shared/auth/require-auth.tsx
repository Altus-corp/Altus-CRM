import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./auth";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (user?.must_change_password && location.pathname !== "/change-password") return <Navigate to="/change-password" replace />;
  if (loading) return <p>Loading…</p>;
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}
