import { useCallback, useEffect, useState } from "react";
import { api } from "../../shared/api/client";
import { useAuth } from "../../shared/auth/auth";
import { canManageRole, hasCapability } from "../../shared/auth/permissions";

export type Member = { id: string; name: string; email: string; role: string; active: boolean };
export type MasterValue = { id: string; master_type: string; code: string | null; label: string; colour: string | null; active: boolean; is_connected: boolean; is_no_answer: boolean; is_ringing: boolean; is_dnd: boolean; is_follow_up: boolean; is_final: boolean };
export type Employee = Member & { serial?: string; cell?: string; products?: string[]; backup_user_id?: string; lead_transfer_allowed?: boolean; colour?: string };
export type Target = { id: string; user_id: string; target_date?: string; weekday?: number; non_keynote_target: number; keynote_target: number; total_target: number; day_override?: number | null; week_override?: number | null; quarter_override?: number | null; absent: boolean };
export type WorkspaceSetting = { setting_key: string; value: unknown; active: boolean };
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
  const [members, setMembers] = useState<Member[]>([]); const [employees, setEmployees] = useState<Employee[]>([]); const [masters, setMasters] = useState<MasterValue[]>([]); const [targets, setTargets] = useState<Target[]>([]); const [workspaceSettings, setWorkspaceSettings] = useState<WorkspaceSetting[]>([]); const [loading, setLoading] = useState(false); const [error, setError] = useState(""); const [form, setForm] = useState(emptyForm); const [formOpen, setFormOpen] = useState(false); const [showPassword, setShowPassword] = useState(false); const [issuedPassword, setIssuedPassword] = useState("");
  const [masterDraft, setMasterDraft] = useState({ master_type: "resolution", label: "", is_connected: false, is_no_answer: false, is_ringing: false, is_dnd: false, is_follow_up: false, is_final: false });
  const [productDraft, setProductDraft] = useState("");
  const [employeeDraft, setEmployeeDraft] = useState({ user_id: "", serial: "", cell: "", products: "", backup_user_id: "", role: "Sales", lead_transfer_allowed: false, colour: "", active: true });
  const [replacementByMember, setReplacementByMember] = useState<Record<string, string>>({});
  const [targetDraft, setTargetDraft] = useState({ user_id: "", target_date: "", weekday: 1, non_keynote_target: 0, keynote_target: 0, total_target: 0, day_override: "", week_override: "", quarter_override: "", absent: false });
  const [settingDraft, setSettingDraft] = useState({ setting_key: "back_to_back_no_answer_threshold", value: "" });
  const loadMembers = useCallback(async () => { if (!canManage) return; setLoading(true); setError(""); try { const response = await api<{ users: Member[] }>("/api/users"); setMembers(response.users); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load members."); } finally { setLoading(false); } }, [canManage]);
  useEffect(() => { void loadMembers(); }, [loadMembers]);
  const loadMasters = useCallback(async () => { if (!canManage) return; try { const response = await api<{ values: MasterValue[] }>("/api/masters"); setMasters(response.values); } catch { setError("Unable to load masters."); } }, [canManage]);
  const loadPhaseOne = useCallback(async () => { if (!canManage) return; try { const [employeeResponse, targetResponse, settingResponse] = await Promise.all([api<{ employees: Employee[] }>("/api/employees"), api<{ targets: Target[] }>("/api/targets"), api<{ settings: WorkspaceSetting[] }>("/api/workspace-settings")]); setEmployees(employeeResponse.employees); setTargets(targetResponse.targets); setWorkspaceSettings(settingResponse.settings); } catch { setError("Unable to load workspace masters."); } }, [canManage]);
  useEffect(() => { void loadMasters(); void loadPhaseOne(); }, [loadMasters, loadPhaseOne]);
  function updateForm(key: keyof typeof emptyForm, value: string) { setForm((current) => ({ ...current, [key]: value })); }
  function openForm() { setForm({ ...emptyForm, role: createRoles[0] || "Sales" }); setIssuedPassword(""); setFormOpen(true); }
  function closeForm() { setFormOpen(false); setShowPassword(false); }
  async function createMember(event: React.FormEvent) { event.preventDefault(); setError(""); try { await api("/api/users", { method: "POST", body: JSON.stringify({ name: form.name, email: form.email, role: form.role, temporary_password: form.password }) }); setIssuedPassword(form.password); setForm({ ...emptyForm, role: createRoles[0] || "Sales" }); setFormOpen(false); await loadMembers(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to create member."); } }
  async function deactivateMember(member: Member) { if (!window.confirm(`Deactivate ${member.name}?`)) return; setError(""); try { await api(`/api/users/${encodeURIComponent(member.id)}/deactivate`, { method: "POST" }); await loadMembers(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to deactivate member."); } }
  async function offboardMember(member: Member) { if (!window.confirm(`Offboard ${member.name}? This will reassign their leads and remove access.`)) return; setError(""); try { await api(`/api/employees/${encodeURIComponent(member.id)}/offboard`, { method: "POST", body: JSON.stringify({ replacement_user_id: replacementByMember[member.id] || null }) }); await loadMembers(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to offboard member."); } }
  async function resetMember(member: Member) { const password = generatedPassword(); if (!window.confirm(`Reset the temporary password for ${member.name}?`)) return; setError(""); try { await api(`/api/users/${encodeURIComponent(member.id)}/reset-password`, { method: "POST", body: JSON.stringify({ temporary_password: password }) }); setIssuedPassword(password); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to reset password."); } }
  async function copyIssuedPassword() { if (issuedPassword) await navigator.clipboard?.writeText(issuedPassword); }
  async function saveMaster(master: Partial<MasterValue>) { setError(""); try { await api(master.id ? `/api/masters/${encodeURIComponent(master.id)}` : "/api/masters", { method: "POST", body: JSON.stringify(master) }); await loadMasters(); } catch { setError("Unable to save master value."); } }
  async function saveSetting(setting_key: string, value: unknown) { setError(""); try { await api("/api/workspace-settings", { method: "POST", body: JSON.stringify({ setting_key, value }) }); await loadPhaseOne(); } catch { setError("Unable to save workspace setting."); } }
  async function saveTarget(target: Partial<Target>) { setError(""); try { await api(target.id ? `/api/targets/${encodeURIComponent(target.id)}` : "/api/targets", { method: "POST", body: JSON.stringify(target) }); await loadPhaseOne(); } catch { setError("Unable to save target."); } }
  async function saveEmployee(employee: Partial<Employee>) { setError(""); try { await api("/api/employees", { method: "POST", body: JSON.stringify(employee) }); await loadPhaseOne(); } catch { setError("Unable to save employee."); } }
  async function createMaster(event: React.FormEvent) { event.preventDefault(); await saveMaster(masterDraft); setMasterDraft({ master_type: "resolution", label: "", is_connected: false, is_no_answer: false, is_ringing: false, is_dnd: false, is_follow_up: false, is_final: false }); }
  async function createProduct(event: React.FormEvent) { event.preventDefault(); const label = productDraft.trim(); if (!label) return; await saveMaster({ master_type: "product", label, code: label }); setProductDraft(""); }
  async function createEmployee(event: React.FormEvent) { event.preventDefault(); await saveEmployee({ ...employeeDraft, products: employeeDraft.products.split(",").map((value) => value.trim()).filter(Boolean) }); }
  async function createTarget(event: React.FormEvent) { event.preventDefault(); await saveTarget({ ...targetDraft, day_override: targetDraft.day_override === "" ? null : Number(targetDraft.day_override), week_override: targetDraft.week_override === "" ? null : Number(targetDraft.week_override), quarter_override: targetDraft.quarter_override === "" ? null : Number(targetDraft.quarter_override) }); }
  async function createSetting(event: React.FormEvent) { event.preventDefault(); let value: unknown = settingDraft.value; try { value = JSON.parse(settingDraft.value); } catch {} await saveSetting(settingDraft.setting_key, value); }
  async function toggleMaster(master: MasterValue) { await saveMaster({ ...master, active: !master.active }); }
  const products = masters.filter((master) => master.master_type === "product");
  return { ...auth, canManage, canResetPasswords, createRoles, members, employees, masters, products, targets, workspaceSettings, replacementByMember, loading, error, form, formOpen, showPassword, issuedPassword, masterDraft, productDraft, employeeDraft, targetDraft, settingDraft, updateForm, setMasterDraft, setProductDraft, setEmployeeDraft, setTargetDraft, setSettingDraft, setReplacementByMember, openForm, closeForm, setShowPassword, createMember, deactivateMember, offboardMember, resetMember, copyIssuedPassword, loadMembers, saveMaster, saveSetting, saveTarget, saveEmployee, createMaster, createProduct, createEmployee, createTarget, createSetting, toggleMaster };
}
