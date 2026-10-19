import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../shared/api/client";

type RoleHierarchy = {
  id: string;
  name: string;
  access_role: "Sales" | "Viewer" | "Admin";
  hierarchy_parent_id: string | null;
  hierarchy_parent_name: string | null;
  hierarchy_rank: number;
  member_count: number;
};

type Draft = { hierarchy_parent_id: string; hierarchy_rank: number };

export function RoleHierarchyManager() {
  const [roles, setRoles] = useState<RoleHierarchy[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const result = await api<{ roles: RoleHierarchy[] }>("/api/member-roles/hierarchy");
      const items = result.roles || [];
      setRoles(items);
      setDrafts(Object.fromEntries(items.map((role) => [role.id, { hierarchy_parent_id: role.hierarchy_parent_id || "", hierarchy_rank: role.hierarchy_rank || 0 }])));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load role hierarchy."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  const topLevel = useMemo(() => roles.filter((role) => !role.hierarchy_parent_id), [roles]);

  function updateDraft(id: string, update: Partial<Draft>) { setDrafts((current) => ({ ...current, [id]: { ...(current[id] || { hierarchy_parent_id: "", hierarchy_rank: 0 }), ...update } })); setNotice(""); }
  async function save(role: RoleHierarchy) {
    const draft = drafts[role.id] || { hierarchy_parent_id: "", hierarchy_rank: 0 };
    setSaving(role.id); setError(""); setNotice("");
    try {
      await api(`/api/member-roles/${encodeURIComponent(role.id)}/hierarchy`, { method: "POST", body: JSON.stringify(draft) });
      setNotice(`${role.name} hierarchy saved.`);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save role hierarchy."); }
    finally { setSaving(null); }
  }

  return <section className="role-hierarchy-page" aria-labelledby="role-hierarchy-heading">
    <div className="role-hierarchy-intro"><div><p className="eyebrow">Access structure</p><h2 id="role-hierarchy-heading">Role hierarchy</h2><p>Set who each role reports to. User access is inherited from their assigned role; this structure is the foundation for manager and team visibility.</p></div><button type="button" onClick={() => void load()} disabled={loading}>Refresh</button></div>
    <section className="role-hierarchy-rules" aria-label="Hierarchy rules"><strong>How it works</strong><span>Admin roles stay at the top.</span><span>Sales Manager can sit above Team Leaders.</span><span>Team Leaders can sit above Sales Executives.</span></section>
    {error && <p className="admin-reset-error" role="alert">{error}</p>}
    {notice && <p className="role-hierarchy-notice" role="status">{notice}</p>}
    {loading ? <p className="admin-information-empty">Loading roles…</p> : <div className="role-hierarchy-list">{roles.map((role) => {
      const draft = drafts[role.id] || { hierarchy_parent_id: "", hierarchy_rank: 0 };
      const isAdmin = role.access_role === "Admin";
      return <article key={role.id} className={isAdmin ? "role-hierarchy-card is-admin" : "role-hierarchy-card"}>
        <div className="role-hierarchy-card-title"><div><strong>{role.name}</strong><span>{role.access_role} access · {role.member_count} assigned {role.member_count === 1 ? "user" : "users"}</span></div>{isAdmin && <small>Top level</small>}</div>
        <label>Reports to<select value={draft.hierarchy_parent_id} disabled={isAdmin} onChange={(event) => updateDraft(role.id, { hierarchy_parent_id: event.target.value })}><option value="">No parent — top level</option>{roles.filter((candidate) => candidate.id !== role.id).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select></label>
        <label>Hierarchy level<input type="number" min="0" max="100" value={draft.hierarchy_rank} disabled={isAdmin} onChange={(event) => updateDraft(role.id, { hierarchy_rank: Number(event.target.value) || 0 })} /><small>Higher number appears higher in the organisation.</small></label>
        <button type="button" className="admin-create-submit" disabled={saving === role.id || isAdmin} onClick={() => void save(role)}>{saving === role.id ? "Saving…" : "Save hierarchy"}</button>
      </article>;
    })}</div>}
    {!loading && roles.length === 0 && <p className="admin-information-empty">Create roles in User Management before arranging the hierarchy.</p>}
    {!loading && topLevel.length > 1 && <p className="role-hierarchy-hint">{topLevel.length} roles are currently top-level. Assign a parent role where a reporting relationship is required.</p>}
  </section>;
}
