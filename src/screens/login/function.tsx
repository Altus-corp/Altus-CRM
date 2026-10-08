import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../shared/auth/auth";

export function useLoginForm() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(""); setLoading(true);
    try { await login(email, password); navigate("/leads"); }
    catch (error) { setError(error instanceof Error ? error.message : "Sign-in failed."); }
    finally { setLoading(false); }
  }
  return { email, password, error, loading, showPassword, setEmail, setPassword, setShowPassword, submit };
}
