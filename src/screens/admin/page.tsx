import { useAdminScreen, type AdminScreenKey } from "./function";
import { hasCapability, usePermission } from "../../shared/auth/permissions";
import { useAuth } from "../../shared/auth/auth";
import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import "./admin.css";
import { DropdownManagement } from "./dropdown-management";
import { IntegrationManager } from "./integration-manager";
import { LeadFieldManager } from "./lead-field-manager";
import { ProductStageManager } from "./product-stage-manager";
import { AssignmentRuleManager } from "./assignment-rule-manager";
import { UserManagement } from "./user-management";
import { RoleHierarchyManager } from "./role-hierarchy-manager";

function label(value: string) { return value.replaceAll("_", " "); }
type AdminRow = Record<string, string | number | boolean | null>;
function dateLabel(value: unknown) { const date = value ? new Date(String(value)) : null; return date && !Number.isNaN(date.valueOf()) ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date) : "No due date"; }

function AdminPageHeader({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return <div className="admin-heading"><div><p className="eyebrow">Altus CRM</p><h1>{title}</h1><p>{description}</p></div>{children && <div className="admin-heading-actions">{children}</div>}</div>;
}

function AdminEmptyState({ title, message, retry }: { title: string; message: string; retry?: () => void }) {
  return <section className="admin-empty" role={retry ? "alert" : undefined} aria-live={retry ? undefined : "polite"}><span className="admin-empty-icon" aria-hidden="true">⌁</span><div><h2>{title}</h2><p>{message}</p></div>{retry && <button type="button" onClick={retry}>Retry</button>}</section>;
}

const ADMIN_EMPTY_COPY: Partial<Record<AdminScreenKey, { title: string; message: string }>> = {
  panel: { title: "No workspace members", message: "Add a person to begin managing workspace access." },
  "user-management": { title: "No workspace members", message: "Add a person to begin managing workspace access." },
  templates: { title: "No templates available", message: "Communication templates will appear here when they are configured." },
  "import-export": { title: "No import history available", message: "Use bulk lead upload when you are ready to import a validated file." },
  audit: { title: "No audit activity yet", message: "Recorded workspace changes will appear here." },
  "database-status": { title: "No additional records", message: "Connection status is shown in the workspace summary above." },
};

function AdminDashboard({ view }: { view: ReturnType<typeof useAdminScreen> }) {
  const metrics = Object.entries(view.data?.metrics || {});
  const followups = view.data?.rows || [];
  const shortcuts = [["Admin Panel", "/admin/panel", "Workspace settings and catalog"], ["User Management", "/admin/users", "People, roles, and access"], ["Assignment", "/admin/assignment", "Owner pools and rules"], ["Dropdown Management", "/admin/dropdowns", "Field option configuration"], ["Integrations", "/admin/integrations", "Connected lead sources"], ["Audit Log", "/admin/audit", "Recent workspace history"], ["Import / Export", "/admin/import-export", "Bulk lead upload"]] as const;
  return <main className="admin-page admin-dashboard-page">
    <AdminPageHeader title={view.title} description={view.description}><span className="day-chip">{new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric" }).format(new Date())}</span></AdminPageHeader>
    {view.loading && <AdminEmptyState title="Loading dashboard" message="Preparing the latest workspace snapshot." />}
    {!view.loading && view.error && <AdminEmptyState title="Unable to load the dashboard" message="Try again when the data service is available." retry={() => void view.reload()} />}
    {!view.loading && !view.error && <div className="admin-dashboard-content">
      <section className="admin-dashboard-overview" aria-labelledby="dashboard-overview-heading"><div className="admin-section-heading"><div><h2 id="dashboard-overview-heading">Workspace snapshot</h2><p>Current pipeline and follow-up activity, refreshed when this page opens.</p></div><Link className="admin-dashboard-link" to="/leads">View leads</Link></div><div className="admin-dashboard-metrics" aria-label="Dashboard summary">{metrics.map(([key, value]) => <article className={`admin-dashboard-metric ${key === "overdue_followups" ? "is-attention" : ""}`} key={key}><span>{label(key)}</span><strong>{display(value)}</strong></article>)}</div></section>
      <section className="admin-dashboard-followups" aria-labelledby="dashboard-followups-heading"><div className="admin-section-heading"><div><h2 id="dashboard-followups-heading">Next follow-ups</h2><p>Open follow-ups ordered by their due date.</p></div><Link className="admin-dashboard-link" to="/leads?view=calling_queue">Open calling sheet</Link></div>{followups.length ? <div className="admin-dashboard-followup-list">{followups.map((followup) => <article key={String(followup.id)}><div><strong>{dateLabel(followup.due_at)}</strong><span>Lead reference: {display(followup.lead_id)}</span></div><span className="admin-dashboard-status">{display(followup.status)}</span></article>)}</div> : <p className="admin-dashboard-empty">No open follow-ups are scheduled.</p>}</section>
      <section className="admin-dashboard-shortcuts" aria-labelledby="dashboard-shortcuts-heading"><div className="admin-section-heading"><div><h2 id="dashboard-shortcuts-heading">Admin workspace</h2><p>Jump directly to a management area.</p></div></div><div>{shortcuts.map(([name, to, description]) => <Link key={to} to={to}><strong>{name}</strong><span>{description}</span></Link>)}</div></section>
    </div>}
  </main>;
}
function display(value: unknown) { if (value === null || value === undefined || value === "") return "—"; if (typeof value === "boolean") return value ? "Yes" : "No"; return String(value); }

function auditTime(value: unknown) {
  const date = value ? new Date(String(value)) : null;
  return date && !Number.isNaN(date.valueOf()) ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date) : "Unknown time";
}

function AuditActivity({ rows }: { rows: AdminRow[] }) {
  return <section className="admin-audit-card" aria-labelledby="audit-activity-heading">
    <div className="admin-section-heading"><div><h2 id="audit-activity-heading">Recent changes</h2><p>Shows who made the change, when it happened, and the value before and after the update.</p></div><span className="admin-form-hint">Latest {rows.length} entries</span></div>
    {rows.length ? <div className="admin-audit-list">{rows.map((row, index) => <article key={String(row.id ?? index)}>
      <div className="admin-audit-actor"><strong>{display(row.user_name)}</strong><span>{auditTime(row.occurred_at)} · {display(row.user_change_count)} total activities</span></div>
      <div className="admin-audit-change"><strong>{label(String(row.action || "activity"))}</strong><span>{row.field ? `${label(String(row.field))}: ` : ""}<em>{display(row.old_value)}</em> → <b>{display(row.new_value)}</b></span></div>
      <span className="admin-audit-record">{label(String(row.entity_type || "record"))} · {display(row.entity_id)}</span>
    </article>)}</div> : <p className="admin-information-empty">No audit activity has been recorded yet.</p>}
  </section>;
}

function AdminInformation({ screen, view }: { screen: "templates" | "audit" | "process-flow" | "database-status"; view: ReturnType<typeof useAdminScreen> }) {
  const rows = view.data?.rows || [];
  const metrics = Object.entries(view.data?.metrics || {});
  const columns = rows.length ? Object.keys(rows[0]) : [];
  const copy = {
    templates: { eyebrow: "Workspace library", section: "Available templates", detail: "Read-only communication templates currently configured for this workspace.", empty: "No templates are available yet." },
    audit: { eyebrow: "Workspace history", section: "Recent activity", detail: "Append-only activity shown newest first.", empty: "No audit activity has been recorded yet." },
    "process-flow": { eyebrow: "Workspace guide", section: "Lifecycle steps", detail: "The current workspace lifecycle from acquisition through sale.", empty: "No process steps are available." },
    "database-status": { eyebrow: "System health", section: "Connection details", detail: "Only safe connectivity metadata is displayed here.", empty: "No additional connection details are available." },
  }[screen];
  return <main className="admin-page admin-information-page">
    <AdminPageHeader title={view.title} description={view.description}><span className="day-chip">{copy.eyebrow}</span></AdminPageHeader>
    {view.loading && <AdminEmptyState title="Loading workspace information" message="Preparing the latest read-only information." />}
    {!view.loading && view.error && <AdminEmptyState title="Unable to load workspace information" message="Try again when the data service is available." retry={() => void view.reload()} />}
    {!view.loading && !view.error && <div className="admin-information-content">
      {metrics.length > 0 && <section className="admin-information-metrics" aria-label="Workspace summary">{metrics.map(([key, value]) => <article key={key}><span>{label(key)}</span><strong>{display(value)}</strong></article>)}</section>}
      {view.data?.note && <p className="admin-note">{view.data.note}</p>}
      {screen === "audit" ? <AuditActivity rows={rows} /> : screen === "process-flow" ? <section className="admin-process-flow" aria-labelledby="process-flow-heading"><div className="admin-section-heading"><div><h2 id="process-flow-heading">{copy.section}</h2><p>{copy.detail}</p></div></div>{rows.length ? <ol>{rows.map((row, index) => <li key={String(row.step ?? index)}><span>{display(row.step)}</span><strong>{display(row.name)}</strong></li>)}</ol> : <p className="admin-information-empty">{copy.empty}</p>}</section> : <section className="admin-information-card" aria-labelledby="information-records-heading"><div className="admin-section-heading"><div><h2 id="information-records-heading">{copy.section}</h2><p>{copy.detail}</p></div>{rows.length > 0 && <span className="admin-form-hint">{rows.length} {rows.length === 1 ? "record" : "records"}</span>}</div>{rows.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr>{columns.map((column) => <th key={column}>{label(column)}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={String(row.id ?? row.source_id ?? index)}>{columns.map((column) => <td key={column}>{display(row[column])}</td>)}</tr>)}</tbody></table></div> : <p className="admin-information-empty">{copy.empty}</p>}</section>}
    </div>}
  </main>;
}

function AdminPanelOverview({ view }: { view: ReturnType<typeof useAdminScreen> }) {
  const members = view.data?.rows || [];
  const activeMembers = members.filter((member) => member.active !== false).length;
  const sections = [
    ["People & access", `${activeMembers} active of ${members.length} members`, "Create people, define roles and departments, and manage individual access."],
    ["Catalog & workflow", `${view.products.filter((product) => product.active).length} active products`, "Maintain products, product stages, and product-specific calling outcomes."],
    ["Lead configuration", "Fields and dropdown-backed values", "Control which additional fields appear in lead details and imports."],
  ] as const;
  return <section className="admin-panel-overview" aria-labelledby="admin-panel-overview-heading"><div className="admin-section-heading"><div><h2 id="admin-panel-overview-heading">Workspace configuration</h2><p>Manage the people, reference data, and lead setup that shape daily CRM work.</p></div><span className="admin-form-hint">Changes apply to the whole workspace</span></div><div>{sections.map(([title, count, description]) => <article key={title}><strong>{title}</strong><span>{count}</span><p>{description}</p></article>)}</div></section>;
}

function MemberAccessDialog({ view, canAssignAdminRole }: { view: ReturnType<typeof useAdminScreen>; canAssignAdminRole: boolean }) {
  if (!view.accessTarget) return null;
  return <div className="admin-modal-backdrop"><div className="admin-access-form" role="dialog" aria-modal="true" aria-labelledby="access-dialog-title">
    <div className="admin-modal-heading"><div><h2 id="access-dialog-title">{view.accessTarget.name}</h2><p>Member details and individual access</p></div><button className="admin-modal-close" type="button" onClick={view.cancelAccess} aria-label="Close">×</button></div>
    <dl className="admin-member-details"><div><dt>ID</dt><dd>{view.accessTarget.id}</dd></div><div><dt>Email</dt><dd>{view.accessTarget.email || "—"}</dd></div><div><dt>Role</dt><dd>{view.accessTarget.role || "—"}</dd></div><div><dt>Access level</dt><dd>{view.accessTarget.accessLevel || "—"}</dd></div><div><dt>Department</dt><dd>{view.accessTarget.department || "—"}</dd></div></dl>
    <form className="admin-member-role-editor" onSubmit={(event) => void view.submitMemberRole(event)}><h3>Assigned role</h3><p>Change the member’s job role and matching access level.</p><label>Role<select aria-label="Assigned role" required value={view.assignedMemberRoleId} onChange={(event) => view.setAssignedMemberRoleId(event.target.value)}><option value="">Select role</option>{view.roles.filter((role) => canAssignAdminRole || role.access_role !== "Admin").map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label><div className="admin-modal-actions"><button className="admin-create-submit" type="submit" disabled={view.accessBusy || !view.assignedMemberRoleId}>{view.accessBusy ? "Saving…" : "Save role"}</button></div></form>
    <form className="admin-access-editor" onSubmit={(event) => void view.submitAccess(event)}><h3>Additional access</h3><div className="admin-access-grid">{view.accessOptions.map((capability) => <label key={capability}><input type="checkbox" checked={view.accessOverrides.includes(capability)} onChange={() => view.toggleAccess(capability)} /> {label(capability)}</label>)}</div><div className="admin-modal-actions"><button className="admin-create-submit" type="submit" disabled={view.accessBusy}>{view.accessBusy ? "Saving…" : "Save access"}</button></div></form>
    <form className="admin-inline-password" onSubmit={(event) => void view.submitAccessPassword(event)}><h3>Change password</h3><div className="admin-password-grid"><label>New password<input required minLength={12} type="text" value={view.accessPassword} onChange={(event) => view.setAccessPassword(event.target.value)} /></label><label>Confirm password<input required minLength={12} type="text" value={view.accessPasswordConfirmation} onChange={(event) => view.setAccessPasswordConfirmation(event.target.value)} /></label></div><button className="admin-create-submit" type="submit" disabled={view.accessBusy || view.accessPassword.length < 12 || view.accessPassword !== view.accessPasswordConfirmation}>Change password</button></form>
    <div className="admin-account-actions"><h3>Account status</h3><p>Removing a person deactivates access and preserves their history.</p><button type="button" onClick={() => void view.removeAccount(false)} disabled={view.accountBusy}>Deactivate account</button><button type="button" onClick={() => void view.removeAccount(true)} disabled={view.accountBusy}>Offboard account</button></div>{view.accessError && <span className="admin-reset-error" role="alert">{view.accessError}</span>}
  </div></div>;
}

export function AdminPage({ screen }: { screen: AdminScreenKey }) {
  if (screen === "dropdown-management") return <main className="admin-page"><AdminPageHeader title="Dropdown Management" description="Configure dropdown definitions and managed options." /><DropdownManagement /></main>;
  if (screen === "integrations") return <main className="admin-page"><AdminPageHeader title="Integrations" description="Connect website forms and external platforms to receive leads automatically." /><IntegrationManager /></main>;
  if (screen === "role-hierarchy") return <main className="admin-page"><AdminPageHeader title="Role Hierarchy" description="Define reporting relationships between roles before applying manager-level data visibility." /><RoleHierarchyManager /></main>;
  const view = useAdminScreen(screen);
  const { user } = useAuth();
  const canResetPasswords = hasCapability(user?.role, "users.reset_password");
  const canAddPerson = hasCapability(user?.role, "users.manage");
  const canManageAssignment = usePermission("leads.assign");
  const canManageAccess = canAddPerson;
  if (screen === "dashboard") return <AdminDashboard view={view} />;
  if (screen === "user-management" && canAddPerson) return <main className="admin-page"><AdminPageHeader title={view.title} description={view.description} /><UserManagement /></main>;
  if (screen === "assignment" && canManageAssignment) return <main className="admin-page"><AdminPageHeader title={view.title} description={view.description}><span className="day-chip">{new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(new Date())}</span></AdminPageHeader><AssignmentRuleManager /></main>;
  if (screen === "templates" || screen === "audit" || screen === "process-flow" || screen === "database-status") return <AdminInformation screen={screen} view={view} />;
  const roleOptions = (view.roles.length ? view.roles.filter((role) => user?.role === "Owner" || role.access_role !== "Admin").map((role) => role.name) : (user?.role === "Owner" ? ["Sales", "Viewer", "Admin"] : ["Sales", "Viewer"]));
  const accessRoleOptions = user?.role === "Owner" ? ["Sales", "Viewer", "Admin"] : ["Sales", "Viewer"];
  const metrics = Object.entries(view.data?.metrics || {});
  const rows = view.data?.rows || [];
  const columns = rows.length ? Object.keys(rows[0]) : [];
  function openMemberDetails(row: AdminRow) { if (screen === "panel" && canManageAccess && row.role !== "Owner" && row.role !== "Super Admin" && row.active !== false) void view.beginAccess(String(row.id), { name: String(row.name || "member"), email: String(row.email || ""), role: String(row.role || ""), accessLevel: String(row.access_level || row.role || ""), department: String(row.department || ""), memberRoleId: String(row.member_role_id || "") }); }
  return <main className={screen === "panel" ? "admin-page admin-panel-page" : "admin-page"}>
    <AdminPageHeader title={view.title} description={view.description}><span className="day-chip">{new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(new Date())}</span></AdminPageHeader>
    {screen === "panel" && <AdminPanelOverview view={view} />}
    {view.loading && <AdminEmptyState title="Loading workspace" message="Preparing the latest read-only data." />}
    {!view.loading && view.error && <AdminEmptyState title="Unable to load this workspace" message="Try again when the data service is available." retry={() => void view.reload()} />}
    {!view.loading && !view.error && <>
      {metrics.length > 0 && <section className="admin-metrics" aria-label="Summary"><>{metrics.map(([key, value]) => <article className="admin-metric" key={key}><span>{label(key)}</span><strong>{display(value)}</strong></article>)}</></section>}
      {view.data?.note && <p className="admin-note">{view.data.note}</p>}
      {screen === "panel" && canAddPerson && <section className="admin-products" aria-labelledby="products-heading"><div className="admin-section-heading"><div><h2 id="products-heading">Product catalog</h2><p>Add a product once. It is immediately available when creating a lead.</p></div><span className="admin-form-hint">{view.products.filter((product) => product.active).length} active</span></div><form className="admin-product-form" onSubmit={(event) => void view.submitProduct(event)}><label>Product name<input required value={view.newProduct} onChange={(event) => view.setNewProduct(event.target.value)} placeholder="e.g. Productivity Shastra" /></label><button className="admin-create-submit" type="submit" disabled={view.createBusy}>{view.createBusy ? "Adding…" : "Add product"}</button></form>{view.productError && <p className="admin-reset-error" role="alert">{view.productError}</p>}<div className="admin-product-list">{view.products.map((product) => <div key={product.id}><span>{product.label}</span><small>{product.active ? "Active" : "Disabled"}</small><button type="button" onClick={() => void view.toggleProduct(product)}>{product.active ? "Disable" : "Enable"}</button></div>)}{view.products.length === 0 && <p>No products yet. Add the first one above.</p>}</div></section>}
      {screen === "panel" && canAddPerson && <ProductStageManager />}
      {screen === "panel" && hasCapability(user?.role, "workspace.manage") && <LeadFieldManager />}
      {screen === "import-export" && hasCapability(user?.role, "leads.import") && <section className="admin-import-export" aria-labelledby="bulk-lead-upload-heading"><h2 id="bulk-lead-upload-heading">Bulk lead upload</h2><p>Upload CSV or XLSX leads, preview validation results, and apply the import.</p><a className="admin-create-submit" href="/leads?import=1">Open bulk lead upload</a></section>}
      {screen === "panel" && canAddPerson && <section className="admin-departments" aria-labelledby="departments-heading"><div className="admin-section-heading"><div><h2 id="departments-heading">Departments &amp; roles</h2><p>Saved options available when adding a person.</p></div><span className="admin-form-hint">{view.departments.length} departments · {roleOptions.length} roles</span></div>{view.departmentError ? <p className="admin-reset-error" role="alert">{view.departmentError}</p> : <div className="admin-reference-selects"><select className="admin-department-select" aria-label="Departments"><option value="">Select a department</option>{view.departments.map((department) => <option key={department.id} value={department.name}>{department.name}</option>)}</select><select className="admin-department-select" aria-label="Roles"><option value="">Select a role</option>{roleOptions.map((role) => <option key={role} value={role}>{role}</option>)}</select></div>}</section>}
      {view.resetTarget && <form className="admin-reset-form" onSubmit={(event) => void view.submitReset(event)}><h2>Change password</h2><p>Set a new password for {view.resetTarget.name}.</p><label>New password<input required minLength={12} type={view.showResetPassword ? "text" : "password"} value={view.resetPassword} onChange={(event) => view.setResetPassword(event.target.value)} /></label><label>Confirm new password<input required minLength={12} type={view.showResetPassword ? "text" : "password"} value={view.resetConfirmation} onChange={(event) => view.setResetConfirmation(event.target.value)} /></label>{view.resetPassword && view.resetPassword !== view.resetConfirmation && <span className="admin-reset-error">Passwords do not match.</span>}<label className="admin-reset-show"><input type="checkbox" checked={view.showResetPassword} onChange={(event) => view.setShowResetPassword(event.target.checked)} /> Show password</label><div><button type="submit" disabled={view.resetPassword.length < 12 || view.resetPassword !== view.resetConfirmation}>Change password</button><button type="button" onClick={view.cancelReset}>Cancel</button></div></form>}
      {view.accessTarget && <MemberAccessDialog view={view} canAssignAdminRole={user?.role === "Owner"} />}
      {screen === "panel" && canAddPerson && <section className="admin-member-create"><div className="admin-member-actions"><button className="admin-add-person-trigger" type="button" onClick={() => view.showCreateForm ? view.setShowCreateForm(false) : view.openCreateForm("person")}>{view.showCreateForm && view.createMode === "person" ? "Close" : "＋ Add person"}</button><button className="admin-add-secondary" type="button" onClick={() => view.openCreateForm("role")}>＋ Add role</button><button className="admin-add-secondary" type="button" onClick={() => view.openCreateForm("department")}>＋ Add department</button></div>{view.showCreateForm && view.createMode === "person" && <form className="admin-member-form" onSubmit={(event) => void view.submitPerson(event)}><div className="admin-member-form-heading"><div><h2>Add person</h2><p>Choose a saved department and role. The person must change the temporary password after first sign-in.</p></div><span className="admin-form-hint">All fields marked * are required</span></div><div className="admin-member-grid"><label>ID *<input autoFocus={view.createFocus === "person"} required pattern="[A-Za-z0-9][A-Za-z0-9_-]{0,63}" title="Use letters, numbers, hyphens, or underscores." value={view.newPerson.user_id} onChange={(event) => view.setNewPerson({ ...view.newPerson, user_id: event.target.value })} /></label><label>Name *<input required value={view.newPerson.name} onChange={(event) => view.setNewPerson({ ...view.newPerson, name: event.target.value })} /></label><label>Email *<input required type="email" value={view.newPerson.email} onChange={(event) => view.setNewPerson({ ...view.newPerson, email: event.target.value })} /></label><label className={view.createFocus === "department" ? "admin-field-focus" : ""}>Department *<select autoFocus={view.createFocus === "department"} required value={view.newPerson.department} onChange={(event) => view.setNewPerson({ ...view.newPerson, department: event.target.value })}><option value="">Select department</option>{view.departments.map((department) => <option key={department.id} value={department.name}>{department.name}</option>)}</select></label><label className={view.createFocus === "role" ? "admin-field-focus" : ""}>Role *<select autoFocus={view.createFocus === "role"} aria-label="Role" required value={view.newPerson.role} onChange={(event) => view.setNewPerson({ ...view.newPerson, role: event.target.value })}>{roleOptions.map((role) => <option key={role} value={role}>{role}</option>)}</select></label><label>Temporary password *<input required minLength={12} type={view.showCreatePassword ? "text" : "password"} value={view.newPerson.temporary_password} onChange={(event) => view.setNewPerson({ ...view.newPerson, temporary_password: event.target.value })} /><span className="admin-password-toggle"><input type="checkbox" checked={!view.showCreatePassword} onChange={(event) => view.setShowCreatePassword(!event.target.checked)} /> Hide password</span></label></div>{view.createError && <span className="admin-reset-error" role="alert">{view.createError}</span>}<button className="admin-create-submit" type="submit" disabled={view.createBusy}>{view.createBusy ? "Adding…" : "Create person"}</button></form>}{view.showCreateForm && view.createMode === "role" && <form className="admin-member-option-form" onSubmit={(event) => void view.submitRole(event)}><h2>Add role</h2><p>Create a named role and choose its access level.</p><label>Role name *<input required value={view.newRole.name} onChange={(event) => view.setNewRole({ ...view.newRole, name: event.target.value })} placeholder="e.g. Team Lead" /></label><label>Access level *<select value={view.newRole.access_role} onChange={(event) => view.setNewRole({ ...view.newRole, access_role: event.target.value as "Sales" | "Viewer" | "Admin" })}>{accessRoleOptions.map((role) => <option key={role} value={role}>{role}</option>)}</select></label>{view.createError && <span className="admin-reset-error" role="alert">{view.createError}</span>}<button className="admin-create-submit" type="submit" disabled={view.createBusy}>{view.createBusy ? "Adding…" : "Save role"}</button></form>}{view.showCreateForm && view.createMode === "department" && <form className="admin-member-option-form" onSubmit={(event) => void view.submitDepartment(event)}><h2>Add department</h2><p>Save a department for future people.</p><label>Department name *<input required value={view.newDepartment} onChange={(event) => view.setNewDepartment(event.target.value)} placeholder="e.g. Marketing" /></label>{view.createError && <span className="admin-reset-error" role="alert">{view.createError}</span>}<button className="admin-create-submit" type="submit" disabled={view.createBusy}>{view.createBusy ? "Adding…" : "Save department"}</button></form>}</section>}
      {rows.length > 0 ? <section className="admin-data-card" aria-label="Workspace records"><div className="admin-data-card-heading"><div><h2>Workspace records</h2><p>Latest available records for this area.</p></div><span>{rows.length} {rows.length === 1 ? "record" : "records"}</span></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr>{columns.map((column) => <th key={column}>{label(column)}</th>)}{screen === "panel" && (canResetPasswords || canManageAccess) && <th>Actions</th>}</tr></thead><tbody>{rows.map((row, index) => <tr key={String(row.id ?? row.source_id ?? index)} className={screen === "panel" && canManageAccess && row.active !== false ? "admin-member-row" : ""} onClick={() => openMemberDetails(row)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openMemberDetails(row); } }} tabIndex={screen === "panel" && canManageAccess && row.active !== false ? 0 : undefined}>{columns.map((column) => <td key={column}>{display(row[column])}</td>)}{screen === "panel" && (canResetPasswords || canManageAccess) && <td>{row.role !== "Owner" && row.role !== "Super Admin" && row.active !== false && <>{canManageAccess && <button type="button" onClick={(event) => { event.stopPropagation(); void view.beginAccess(String(row.id), { name: String(row.name || "member"), email: String(row.email || ""), role: String(row.role || ""), accessLevel: String(row.access_level || row.role || ""), department: String(row.department || "") }); }}>Add access level</button>}{canResetPasswords && <button type="button" onClick={(event) => { event.stopPropagation(); view.beginReset(String(row.id), String(row.name || "member")); }}>Change password</button>}</>}</td>}</tr>)}</tbody></table></div></section> : <AdminEmptyState {...(ADMIN_EMPTY_COPY[screen] || { title: "No records to display", message: "This workspace has no available records for the current dataset." })} />}
      {screen === "assignment" && canManageAssignment && <AssignmentRuleManager />}
    </>}
  </main>;
}
