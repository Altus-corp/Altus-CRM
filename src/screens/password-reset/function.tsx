import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../shared/api/client";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function useForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(""); setMessage("");
    const normalized = email.trim().toLowerCase();
    if (!EMAIL_RE.test(normalized)) { setError("Enter a valid email address."); return; }
    setLoading(true);
    try { const result = await api<{ message: string }>("/api/password-reset/request", { method: "POST", body: JSON.stringify({ email: normalized }) }); setMessage(result.message); }
    catch { setError("We could not process that request right now. Please try again."); }
    finally { setLoading(false); }
  }
  return { email, error, message, loading, setEmail, submit };
}

export function useResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(""); setMessage("");
    if (!token) { setError("This password reset link is missing its token."); return; }
    if (password.length < 12) { setError("Password must be at least 12 characters."); return; }
    if (password !== confirmation) { setError("Passwords do not match."); return; }
    setLoading(true);
    try { const result = await api<{ message: string }>("/api/password-reset/complete", { method: "POST", body: JSON.stringify({ token, new_password: password, confirm_password: confirmation }) }); setMessage(result.message); setPassword(""); setConfirmation(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "This password reset link is invalid or expired."); }
    finally { setLoading(false); }
  }
  return { token, password, confirmation, showPassword, error, message, loading, setPassword, setConfirmation, setShowPassword, submit };
}
