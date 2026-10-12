import { useChangePassword } from "./function";
import "./change-password.css";

export function ChangePasswordPage() {
  const form = useChangePassword();
  return (
    <main className="change-password-page">
      <section>
        <p className="eyebrow">Account security</p>
        <h1>Change your password</h1>
        <p className="subtitle">Set a new password before continuing to Altus CRM.</p>
        {form.error && <div className="form-error" role="alert">{form.error}</div>}
        <form onSubmit={form.submit}>
          <label className="form-field">
            <span>New password</span>
            <input
              required
              minLength={12}
              type={form.show ? "text" : "password"}
              value={form.password}
              onChange={(event) => form.setPassword(event.target.value)}
              autoComplete="new-password"
            />
          </label>
          <label className="form-field">
            <span>Confirm new password</span>
            <input
              required
              minLength={12}
              type={form.show ? "text" : "password"}
              value={form.confirmation}
              onChange={(event) => form.setConfirmation(event.target.value)}
              autoComplete="new-password"
            />
          </label>
          <label className="show-password-label">
            <input
              type="checkbox"
              checked={form.show}
              onChange={(event) => form.setShow(event.target.checked)}
            />
            <span>Show password</span>
          </label>
          <button type="submit" disabled={form.saving}>
            {form.saving ? "Saving…" : "Change password"}
          </button>
        </form>
      </section>
    </main>
  );
}
