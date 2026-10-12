import { Link } from "react-router-dom";
import { useForgotPassword, useResetPassword } from "./function";
import "./password-reset.css";

export function ForgotPasswordPage() {
  const form = useForgotPassword();
  return (
    <main className="password-reset-page">
      <section className="password-reset-card">
        <div className="reset-logo-wrap">
          <img className="lockup-light" src="/altus-lockup.webp" alt="Altus CRM" />
          <img className="lockup-dark" src="/altus-lockup-white.webp" alt="" aria-hidden="true" />
        </div>
        <p className="reset-eyebrow">Account recovery</p>
        <h2>Forgot your password?</h2>
        <p className="reset-sub">Enter your account email and we’ll send reset instructions.</p>
        {form.error && (
          <div className="reset-error" role="alert">
            {form.error}
          </div>
        )}
        {form.message && (
          <div className="reset-success" role="status">
            {form.message}
          </div>
        )}
        <form className="reset-form" onSubmit={form.submit} noValidate>
          <div className="reset-field">
            <label htmlFor="reset-email">Email address</label>
            <div className="reset-control">
              <input
                id="reset-email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                required
                value={form.email}
                onChange={(event) => form.setEmail(event.target.value)}
              />
            </div>
          </div>
          <button
            className="reset-submit-btn"
            type="submit"
            disabled={form.loading || Boolean(form.message)}
          >
            {form.loading ? "Sending…" : "Send reset link"}
          </button>
        </form>
        <p className="reset-back-link">
          <Link to="/login">← Back to sign in</Link>
        </p>
      </section>
    </main>
  );
}

export function ResetPasswordPage() {
  const form = useResetPassword();
  return (
    <main className="password-reset-page">
      <section className="password-reset-card">
        <div className="reset-logo-wrap">
          <img className="lockup-light" src="/altus-lockup.webp" alt="Altus CRM" />
          <img className="lockup-dark" src="/altus-lockup-white.webp" alt="" aria-hidden="true" />
        </div>
        <p className="reset-eyebrow">Account recovery</p>
        <h2>Set a new password</h2>
        <p className="reset-sub">Choose a new password for your Altus CRM account.</p>
        {form.error && (
          <div className="reset-error" role="alert">
            {form.error}
          </div>
        )}
        {form.message ? (
          <>
            <div className="reset-success" role="status">
              {form.message}
            </div>
            <p className="reset-back-link">
              <Link to="/login">← Return to sign in</Link>
            </p>
          </>
        ) : (
          <form className="reset-form" onSubmit={form.submit} noValidate>
            <div className="reset-field">
              <label htmlFor="new-password">New password</label>
              <div className="reset-control">
                <input
                  id="new-password"
                  type={form.showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  minLength={12}
                  required
                  placeholder="At least 12 characters"
                  value={form.password}
                  onChange={(event) => form.setPassword(event.target.value)}
                />
              </div>
            </div>
            <div className="reset-field">
              <label htmlFor="confirm-password">Confirm new password</label>
              <div className="reset-control">
                <input
                  id="confirm-password"
                  type={form.showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  minLength={12}
                  required
                  placeholder="Repeat your new password"
                  value={form.confirmation}
                  onChange={(event) => form.setConfirmation(event.target.value)}
                />
              </div>
            </div>
            <label className="reset-show-password">
              <input
                type="checkbox"
                checked={form.showPassword}
                onChange={(event) => form.setShowPassword(event.target.checked)}
              />
              <span>Show password</span>
            </label>
            <button className="reset-submit-btn" type="submit" disabled={form.loading}>
              {form.loading ? "Updating…" : "Reset password"}
            </button>
            <p className="reset-back-link">
              <Link to="/login">← Back to sign in</Link>
            </p>
          </form>
        )}
      </section>
    </main>
  );
}
