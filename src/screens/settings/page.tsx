import { Navigate } from "react-router-dom";
import { useSettings } from "./function";
import { usePermission } from "../../shared/auth/permissions";
import "./settings.css";

export function SettingsPage() {
  const screen = useSettings(); const canView = usePermission("settings.view");
  if (!canView) return <Navigate to="/leads" replace />;
  return <div className="page settings-page"><h1>Settings</h1><p>Account settings for {screen.user?.email ?? "the signed-in user"}.</p><button onClick={screen.logout}>Sign out</button>
    {screen.canManage && <section className="members-section"><div className="members-head"><div><h2>Members</h2><p>Manage non-owner member access.</p></div><button type="button" onClick={screen.openForm}>Add member</button></div>
      {screen.error && <p className="members-error" role="alert">{screen.error}</p>}
      {screen.issuedPassword && <div className="temporary-password" role="status"><strong>Temporary password</strong><code>{screen.issuedPassword}</code><button type="button" onClick={() => void screen.copyIssuedPassword()}>Copy</button><span>Share it securely. It is shown only once here.</span></div>}
      {screen.formOpen && <form className="member-form" onSubmit={(event) => void screen.createMember(event)}><h3>Add member</h3><label>Full name<input required value={screen.form.name} onChange={(event) => screen.updateForm("name", event.target.value)} /></label><label>Email<input required type="email" value={screen.form.email} onChange={(event) => screen.updateForm("email", event.target.value)} /></label><label>Role<select value={screen.form.role} onChange={(event) => screen.updateForm("role", event.target.value)}>{screen.createRoles.map((role) => <option key={role}>{role}</option>)}</select></label><label>Temporary password<div className="password-field"><input required minLength={12} type={screen.showPassword ? "text" : "password"} value={screen.form.password} onChange={(event) => screen.updateForm("password", event.target.value)} /><button type="button" onClick={() => screen.setShowPassword((value) => !value)}>{screen.showPassword ? "Hide" : "Show"}</button><button type="button" onClick={() => screen.updateForm("password", crypto.randomUUID() + "Aa1!")}>Generate</button></div></label><div className="member-form-actions"><button type="submit">Create member</button><button type="button" onClick={screen.closeForm}>Cancel</button></div></form>}
      {screen.loading ? <p>Loading members…</p> : <table className="members-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>{screen.members.map((member) => <tr key={member.id}><td>{member.name}</td><td>{member.email}</td><td>{member.role === "Super Admin" ? "Owner" : member.role}</td><td>{member.active ? "Active" : "Inactive"}</td><td>{member.role !== "Owner" && member.role !== "Super Admin" && member.active && <>{screen.canResetPasswords && <button type="button" onClick={() => void screen.resetMember(member)}>Reset password</button>}<button type="button" onClick={() => void screen.deactivateMember(member)}>Deactivate</button><button type="button" onClick={() => void screen.offboardMember(member)}>Offboard</button></>}</td></tr>)}</tbody></table>}
    </section>}
  </div>;
}
