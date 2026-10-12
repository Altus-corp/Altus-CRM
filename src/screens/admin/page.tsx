import { useAdminScreen, type AdminScreenKey } from "./function";
import { hasCapability } from "../../shared/auth/permissions";
import { useAuth } from "../../shared/auth/auth";
import "./admin.css";

function label(value: string) { return value.replaceAll("_", " "); }
function display(value: unknown) { if (value === null || value === undefined || value === "") return "—"; if (typeof value === "boolean") return value ? "Yes" : "No"; return String(value); }

export function AdminPage({ screen }: { screen: AdminScreenKey }) {
  const view = useAdminScreen(screen);
  const { user } = useAuth();
  const canResetPasswords = hasCapability(user?.role, "users.reset_password");
  const metrics = Object.entries(view.data?.metrics || {});
  const rows = view.data?.rows || [];
  const rules = view.data?.rules || [];
  const columns = rows.length ? Object.keys(rows[0]) : [];
  const ruleColumns = rules.length ? Object.keys(rules[0]) : [];
  return <main className="admin-page">
    <div className="admin-heading"><div><p className="eyebrow">Altus CRM</p><h1>{view.title}</h1><p>{view.description}</p></div><span className="day-chip">{new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(new Date())}</span></div>
    {view.loading && <section className="admin-empty" aria-live="polite"><h2>Loading workspace</h2><p>Preparing the latest read-only data.</p></section>}
    {!view.loading && view.error && <section className="admin-empty" role="alert"><h2>Unable to load this workspace</h2><p>Try again when the data service is available.</p><button type="button" onClick={() => void view.reload()}>Retry</button></section>}
    {!view.loading && !view.error && <>
      {metrics.length > 0 && <section className="admin-metrics" aria-label="Summary"><>{metrics.map(([key, value]) => <article className="admin-metric" key={key}><span>{label(key)}</span><strong>{display(value)}</strong></article>)}</></section>}
      {view.data?.note && <p className="admin-note">{view.data.note}</p>}
      {view.resetTarget && <form className="admin-reset-form" onSubmit={(event) => void view.submitReset(event)}><h2>Change password</h2><p>Set a new password for {view.resetTarget.name}.</p><label>New password<input required minLength={12} type={view.showResetPassword ? "text" : "password"} value={view.resetPassword} onChange={(event) => view.setResetPassword(event.target.value)} /></label><label>Confirm new password<input required minLength={12} type={view.showResetPassword ? "text" : "password"} value={view.resetConfirmation} onChange={(event) => view.setResetConfirmation(event.target.value)} /></label>{view.resetPassword && view.resetPassword !== view.resetConfirmation && <span className="admin-reset-error">Passwords do not match.</span>}<label className="admin-reset-show"><input type="checkbox" checked={view.showResetPassword} onChange={(event) => view.setShowResetPassword(event.target.checked)} /> Show password</label><div><button type="submit" disabled={view.resetPassword.length < 12 || view.resetPassword !== view.resetConfirmation}>Change password</button><button type="button" onClick={view.cancelReset}>Cancel</button></div></form>}
      {rows.length > 0 ? <section className="admin-table-wrap"><table className="admin-table"><thead><tr>{columns.map((column) => <th key={column}>{label(column)}</th>)}{screen === "panel" && canResetPasswords && <th>Actions</th>}</tr></thead><tbody>{rows.map((row, index) => <tr key={String(row.id ?? row.source_id ?? index)}>{columns.map((column) => <td key={column}>{display(row[column])}</td>)}{screen === "panel" && canResetPasswords && <td>{row.role !== "Owner" && row.role !== "Super Admin" && row.active !== false && <button type="button" onClick={() => view.beginReset(String(row.id), String(row.name || "member"))}>Change password</button>}</td>}</tr>)}</tbody></table></section> : <section className="admin-empty"><span className="admin-empty-icon" aria-hidden="true">⌁</span><div><h2>No rows to display</h2><p>This workspace has no available records for the current dataset.</p></div></section>}
      {screen === "assignment" && <section className="admin-assignment-rules"><h2>Assignment rule rotation</h2>{rules.length > 0 ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr>{ruleColumns.map((column) => <th key={column}>{label(column)}</th>)}</tr></thead><tbody>{rules.map((row, index) => <tr key={String(row.source_id ?? index)}>{ruleColumns.map((column) => <td key={column}>{display(row[column])}</td>)}</tr>)}</tbody></table></div> : <p className="admin-note">No assignment rules are configured.</p>}</section>}
    </>}
  </main>;
}
