import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../shared/api/client";

export type AdminScreenKey = "dashboard" | "call-history" | "analytics" | "assignment" | "panel" | "templates" | "import-export" | "integrations" | "audit" | "process-flow" | "reports" | "database-status" | "dropdown-management";
type AdminValue = string | number | boolean | null;
type AdminRow = Record<string, AdminValue>;
type AdminResponse = { screen: AdminScreenKey; metrics?: AdminRow; rows?: AdminRow[]; rules?: AdminRow[]; note?: string };
type MemberRole = { id: string; name: string; access_role: "Sales" | "Viewer" | "Admin" };
type Department = { id: string; name: string };
type Product = { id: string; master_type: "product"; code: string | null; label: string; active: boolean };
export type ProductStage = { id: string; product_id: string; label: string; sort_order: number; active: boolean };

export const ADMIN_SCREEN_COPY: Record<AdminScreenKey, { title: string; description: string }> = {
  dashboard: { title: "Today's Floor", description: "A live view of targets, calling activity, follow-ups, and the next work to do." },
  "call-history": { title: "Call history", description: "Review the imported call activity and its recorded outcomes." },
  analytics: { title: "Analytics", description: "See call volume and resolution mix for the workspace." },
  assignment: { title: "Assignment", description: "Review the current owner pool, unassigned work, and assignment rules." },
  panel: { title: "Admin Panel", description: "Manage the workspace members and review their access status." },
  templates: { title: "Templates", description: "Review the available communication templates and their channels." },
  "import-export": { title: "Import / Export", description: "Review the data movement workspace and its current availability." },
  integrations: { title: "Integrations", description: "Review connected integration names and enabled status." },
  audit: { title: "Audit Log", description: "Review append-only activity history for imported records." },
  "process-flow": { title: "Process Flow", description: "A compact map of the workspace lifecycle from acquisition to sale." },
  reports: { title: "Reports", description: "Review the main pipeline totals for the workspace." },
  "database-status": { title: "Database Status", description: "Check whether the application server can reach the configured PostgreSQL database." },
  "dropdown-management": { title: "Dropdown Management", description: "Configure managed dropdown labels, values, ordering, visibility, and active state." },
};

export function useAdminScreen(screen: AdminScreenKey) {
  const [data, setData] = useState<AdminResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [resetTarget, setResetTarget] = useState<{ id: string; name: string } | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirmation, setResetConfirmation] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [newPerson, setNewPerson] = useState({ user_id: "", name: "", email: "", department: "", role: "Sales", temporary_password: "" });
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showCreatePassword, setShowCreatePassword] = useState(true);
  const [createFocus, setCreateFocus] = useState<"person" | "role" | "department">("person");
  const [createMode, setCreateMode] = useState<"person" | "role" | "department">("person");
  const [roles, setRoles] = useState<MemberRole[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productStages, setProductStages] = useState<Record<string, ProductStage[]>>({});
  const [newRole, setNewRole] = useState({ name: "", access_role: "Sales" as MemberRole["access_role"] });
  const [newDepartment, setNewDepartment] = useState("");
  const [newProduct, setNewProduct] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState("");
  const [departmentError, setDepartmentError] = useState("");
  const [productError, setProductError] = useState("");
  const [accessTarget, setAccessTarget] = useState<{ id: string; name: string; email: string; role: string; accessLevel: string; department: string } | null>(null);
  const [accessOptions, setAccessOptions] = useState<string[]>([]);
  const [accessOverrides, setAccessOverrides] = useState<string[]>([]);
  const [accessError, setAccessError] = useState("");
  const [accessBusy, setAccessBusy] = useState(false);
  const [accountBusy, setAccountBusy] = useState(false);
  const [accessPassword, setAccessPassword] = useState("");
  const [accessPasswordConfirmation, setAccessPasswordConfirmation] = useState("");
  const copy = useMemo(() => ADMIN_SCREEN_COPY[screen], [screen]);
  const loadDepartments = useCallback(async () => {
    try {
      const result = await api<{ departments: Department[] }>("/api/departments");
      setDepartments(result.departments || []);
      setDepartmentError("");
    } catch (cause) {
      setDepartments([]);
      setDepartmentError(cause instanceof Error ? cause.message : "Unable to load departments.");
    }
  }, []);
  const loadProductStages = useCallback(async (productId: string) => { const result = await api<{ stages: ProductStage[] }>(`/api/products/${encodeURIComponent(productId)}/stages`); setProductStages((current) => ({ ...current, [productId]: result.stages || [] })); }, []);
  const loadProducts = useCallback(async () => {
    try {
      const result = await api<{ values: Product[] }>("/api/masters?type=product");
      setProducts(result.values || []);
      setProductError("");
    } catch (cause) {
      setProducts([]);
      setProductError(cause instanceof Error ? cause.message : "Unable to load products.");
    }
  }, []);
  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try {
      const nextData = await api<AdminResponse>(`/api/admin/${screen}`);
      setData(nextData);
      if (screen === "panel") {
        const [roleResult] = await Promise.allSettled([api<{ roles: MemberRole[] }>("/api/member-roles")]);
        setRoles(roleResult.status === "fulfilled" ? roleResult.value.roles : []);
        await Promise.all([loadDepartments(), loadProducts()]);
      }
    } catch {
      setData(null);
      setError(true);
    } finally { setLoading(false); }
  }, [loadDepartments, loadProducts, screen]);
  useEffect(() => { void load(); }, [load]);
  function beginReset(memberId: string, memberName: string) { setResetTarget({ id: memberId, name: memberName }); setResetPassword(""); setResetConfirmation(""); setShowResetPassword(false); setError(false); }
  function cancelReset() { setResetTarget(null); setResetPassword(""); setResetConfirmation(""); setShowResetPassword(false); }
  async function submitReset(event: React.FormEvent) {
    event.preventDefault();
    if (!resetTarget || resetPassword.length < 12 || resetPassword !== resetConfirmation) return;
    setError(false);
    try { await api(`/api/users/${encodeURIComponent(resetTarget.id)}/reset-password`, { method: "POST", body: JSON.stringify({ temporary_password: resetPassword }) }); cancelReset(); }
    catch { setError(true); }
  }
  async function submitPerson(event: React.FormEvent) {
    event.preventDefault(); setCreateError(""); setCreateBusy(true);
    try {
      await api("/api/users", { method: "POST", body: JSON.stringify({ ...newPerson, department: newPerson.department || null }) });
      setNewPerson({ user_id: "", name: "", email: "", department: "", role: "Sales", temporary_password: "" });
      setShowCreatePassword(true);
      setCreateFocus("person"); setCreateMode("person");
      setShowCreateForm(false);
      await load();
    } catch (cause) { setCreateError(cause instanceof Error ? cause.message : "Unable to add person."); }
    finally { setCreateBusy(false); }
  }
  async function submitRole(event: React.FormEvent) { event.preventDefault(); setCreateError(""); setCreateBusy(true); try { await api("/api/member-roles", { method: "POST", body: JSON.stringify(newRole) }); setNewRole({ name: "", access_role: "Sales" }); await load(); setCreateMode("person"); setShowCreateForm(false); } catch (cause) { setCreateError(cause instanceof Error ? cause.message : "Unable to add role."); } finally { setCreateBusy(false); } }
  async function submitDepartment(event: React.FormEvent) { event.preventDefault(); setCreateError(""); setCreateBusy(true); try { const created = await api<Department>("/api/departments", { method: "POST", body: JSON.stringify({ name: newDepartment }) }); setNewDepartment(""); await loadDepartments(); setCreateMode("person"); setShowCreateForm(false); if (!created?.id) setCreateError("Department was not created."); } catch (cause) { setCreateError(cause instanceof Error ? cause.message : "Unable to add department."); } finally { setCreateBusy(false); } }
  async function submitProduct(event: React.FormEvent) { event.preventDefault(); const label = newProduct.trim(); if (!label) return; setProductError(""); setCreateBusy(true); try { await api("/api/masters", { method: "POST", body: JSON.stringify({ master_type: "product", code: label, label }) }); setNewProduct(""); await loadProducts(); } catch (cause) { setProductError(cause instanceof Error ? cause.message : "Unable to add product."); } finally { setCreateBusy(false); } }
  async function toggleProduct(product: Product) { setProductError(""); try { await api(`/api/masters/${encodeURIComponent(product.id)}`, { method: "POST", body: JSON.stringify({ ...product, active: !product.active }) }); await loadProducts(); } catch (cause) { setProductError(cause instanceof Error ? cause.message : "Unable to update product."); } }
  async function addProductStage(productId: string, label: string) { const value = label.trim(); if (!value) return false; try { await api(`/api/products/${encodeURIComponent(productId)}/stages`, { method: "POST", body: JSON.stringify({ label: value }) }); await loadProductStages(productId); return true; } catch (cause) { setProductError(cause instanceof Error ? cause.message : "Unable to add product stage."); return false; } }
  function openCreateForm(mode: "person" | "role" | "department") { setCreateFocus(mode); setCreateMode(mode); setCreateError(""); setShowCreateForm(true); }
  async function beginAccess(memberId: string, details: { name: string; email: string; role: string; accessLevel: string; department: string }) { setAccessError(""); setAccessTarget({ id: memberId, ...details }); setAccessPassword(""); setAccessPasswordConfirmation(""); try { const result = await api<{ capabilities: string[]; overrides: string[] }>(`/api/users/${encodeURIComponent(memberId)}/access`); setAccessOptions(result.capabilities); setAccessOverrides(result.overrides); } catch (cause) { setAccessError(cause instanceof Error ? cause.message : "Unable to load access levels."); } }
  function cancelAccess() { setAccessTarget(null); setAccessOptions([]); setAccessOverrides([]); setAccessError(""); setAccessPassword(""); setAccessPasswordConfirmation(""); }
  function toggleAccess(capability: string) { setAccessOverrides((current) => current.includes(capability) ? current.filter((item) => item !== capability) : [...current, capability]); }
  async function submitAccess(event: React.FormEvent) { event.preventDefault(); if (!accessTarget) return; setAccessBusy(true); setAccessError(""); try { await api(`/api/users/${encodeURIComponent(accessTarget.id)}/access`, { method: "POST", body: JSON.stringify({ capabilities: accessOverrides }) }); await load(); cancelAccess(); } catch (cause) { setAccessError(cause instanceof Error ? cause.message : "Unable to update access levels."); } finally { setAccessBusy(false); } }
  async function submitAccessPassword(event: React.FormEvent) { event.preventDefault(); if (!accessTarget || accessPassword.length < 12 || accessPassword !== accessPasswordConfirmation) return; setAccessBusy(true); setAccessError(""); try { await api(`/api/users/${encodeURIComponent(accessTarget.id)}/reset-password`, { method: "POST", body: JSON.stringify({ temporary_password: accessPassword }) }); await load(); cancelAccess(); } catch (cause) { setAccessError(cause instanceof Error ? cause.message : "Unable to change password."); } finally { setAccessBusy(false); } }
  async function removeAccount(offboard: boolean) { if (!accessTarget || !window.confirm(`${offboard ? "Offboard" : "Deactivate"} ${accessTarget.name}?`)) return; setAccountBusy(true); setAccessError(""); try { await api(`/api/users/${encodeURIComponent(accessTarget.id)}/${offboard ? "offboard" : "deactivate"}`, { method: "POST", body: JSON.stringify({}) }); cancelAccess(); await load(); } catch (cause) { setAccessError(cause instanceof Error ? cause.message : "Unable to remove account."); } finally { setAccountBusy(false); } }
  return { ...copy, data, loading, error, reload: load, resetTarget, resetPassword, resetConfirmation, showResetPassword, beginReset, cancelReset, setResetPassword, setResetConfirmation, setShowResetPassword, submitReset, newPerson, setNewPerson, showCreateForm, setShowCreateForm, openCreateForm, createFocus, createMode, showCreatePassword, setShowCreatePassword, createBusy, createError, submitPerson, submitRole, submitDepartment, submitProduct, toggleProduct, addProductStage, loadProductStages, productStages, roles, departments, products, departmentError, productError, newRole, setNewRole, newDepartment, setNewDepartment, newProduct, setNewProduct, accessTarget, accessOptions, accessOverrides, accessError, accessBusy, beginAccess, cancelAccess, toggleAccess, submitAccess, accessPassword, setAccessPassword, accessPasswordConfirmation, setAccessPasswordConfirmation, submitAccessPassword, accountBusy, removeAccount };
}
