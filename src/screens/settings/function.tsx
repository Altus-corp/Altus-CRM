import { useCallback, useEffect, useState } from "react";
import { api } from "../../shared/api/client";
import { useAuth } from "../../shared/auth/auth";
import { canManageRole, hasCapability } from "../../shared/auth/permissions";

export type Member = { id: string; name: string; email: string; role: string; active: boolean };
const emptyForm = { name: "", email: "", role: "Sales", password: "" };

function generatedPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const values = new Uint32Array(20); crypto.getRandomValues(values);
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join("");
}

export function useSettings() {
  const auth = useAuth();
  const canManage = hasCapability(auth.user?.role, "users.manage"); const canResetPasswords = hasCapability(auth.user?.role, "users.reset_password");
  const createRoles = ["Sales", "Viewer", "Admin"].filter((role) => canManageRole(auth.user?.role, role));
  const [members, setMembers] = useState<Member[]>([]); const [loading, setLoading] = useState(false); const [error, setError] = useState(""); const [form, setForm] = useState(emptyForm); const [formOpen, setFormOpen] = useState(false); const [showPassword, setShowPassword] = useState(false); const [issuedPassword, setIssuedPassword] = useState("");
  const loadMembers = useCallback(async () => { if (!canManage) return; setLoading(true); setError(""); try { const response = await api<{ users: Member[] }>("/api/users"); setMembers(response.users); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load members."); } finally { setLoading(false); } }, [canManage]);
  useEffect(() => { void loadMembers(); }, [loadMembers]);
  function updateForm(key: keyof typeof emptyForm, value: string) { setForm((current) => ({ ...current, [key]: value })); }
  function openForm() { setForm({ ...emptyForm, role: createRoles[0] || "Sales" }); setIssuedPassword(""); setFormOpen(true); }
  function closeForm() { setFormOpen(false); setShowPassword(false); }
  async function createMember(event: React.FormEvent) { event.preventDefault(); setError(""); try { await api("/api/users", { method: "POST", body: JSON.stringify({ name: form.name, email: form.email, role: form.role, temporary_password: form.password }) }); setIssuedPassword(form.password); setForm({ ...emptyForm, role: createRoles[0] || "Sales" }); setFormOpen(false); await loadMembers(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to create member."); } }
  async function deactivateMember(member: Member) { if (!window.confirm(`Deactivate ${member.name}?`)) return; setError(""); try { await api(`/api/users/${encodeURIComponent(member.id)}/deactivate`, { method: "POST" }); await loadMembers(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to deactivate member."); } }
  async function offboardMember(member: Member) { if (!window.confirm(`Offboard ${member.name}? This will remove access and mark the member offboarded.`)) return; setError(""); try { await api(`/api/users/${encodeURIComponent(member.id)}/offboard`, { method: "POST" }); await loadMembers(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to offboard member."); } }
  async function resetMember(member: Member) { const password = generatedPassword(); if (!window.confirm(`Reset the temporary password for ${member.name}?`)) return; setError(""); try { await api(`/api/users/${encodeURIComponent(member.id)}/reset-password`, { method: "POST", body: JSON.stringify({ temporary_password: password }) }); setIssuedPassword(password); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to reset password."); } }
  async function copyIssuedPassword() { if (issuedPassword) await navigator.clipboard?.writeText(issuedPassword); }
  return { ...auth, canManage, canResetPasswords, createRoles, members, loading, error, form, formOpen, showPassword, issuedPassword, updateForm, openForm, closeForm, setShowPassword, createMember, deactivateMember, offboardMember, resetMember, copyIssuedPassword, loadMembers };
}
