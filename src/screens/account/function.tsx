import { useNavigate } from "react-router-dom";
import { useAuth } from "../../shared/auth/auth";
import { displayRole } from "../../shared/auth/permissions";
import { signOut } from "../../shared/auth/sign-out";

export function useAccount() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return { user, role: user?.role_label || displayRole(user?.role), signOut: () => signOut(logout, navigate) };
}
