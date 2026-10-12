import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../shared/api/client";
import { useAuth } from "../../shared/auth/auth";

export function useChangePassword() {
  const { user, updateUser } = useAuth(); const navigate = useNavigate();
  const [password, setPassword] = useState(""); const [confirmation, setConfirmation] = useState(""); const [show, setShow] = useState(false); const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); setError(""); if (password.length < 12) { setError("Password must be at least 12 characters."); return; } if (password !== confirmation) { setError("Passwords do not match."); return; } setSaving(true); try { await api("/api/change-password", { method: "POST", body: JSON.stringify({ new_password: password, confirm_password: confirmation }) }); updateUser({ must_change_password: false }); navigate("/leads", { replace: true }); } catch { setError("Unable to change password."); } finally { setSaving(false); } }
  return { user, password, confirmation, show, error, saving, setPassword, setConfirmation, setShow, submit };
}
