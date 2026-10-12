import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../../shared/auth/auth";
import { useLoginForm } from "./function";
import "./login.css";

const CHIPS = ["Leads", "Marketing", "Reports", "Quotes", "Accounts", "Tasks"];

function MailIcon() { return <svg className="login-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 6.5h16v11H4z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="m5 8 7 5 7-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function LockIcon() { return <svg className="login-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.7"/><path d="M8 10V7.5a4 4 0 0 1 8 0V10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>; }
function EyeIcon({ off = false }: { off?: boolean }) { return <svg className={off ? "eye-icon eye-off" : "eye-icon"} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3.5 12s3.2-5 8.5-5 8.5 5 8.5 5-3.2 5-8.5 5-8.5-5-8.5-5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><circle cx="12" cy="12" r="2" stroke="currentColor" strokeWidth="1.7"/>{off && <path d="m4 4 16 16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>}</svg>; }
function HelpIcon() { return <svg className="help-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.7"/><path d="M9.8 9.2a2.3 2.3 0 1 1 3.8 1.7c-1 .8-1.6 1.1-1.6 2.3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/><path d="M12 16.5h.01" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>; }

function Illustration() {
  return <svg className="login-illustration" viewBox="0 0 420 140" fill="none" aria-hidden="true" focusable="false">
    <rect x="1" y="1" width="418" height="138" rx="16" className="viz-card" />
    <rect x="22" y="22" width="86" height="9" rx="4.5" className="viz-title" />
    <rect x="22" y="39" width="52" height="9" rx="4.5" className="viz-subtitle" />
    <rect x="22" y="96" width="18" height="22" rx="4" className="viz-bar bar-1" />
    <rect x="48" y="84" width="18" height="34" rx="4" className="viz-bar bar-2" />
    <rect x="74" y="72" width="18" height="46" rx="4" className="viz-bar bar-3" />
    <rect x="100" y="56" width="18" height="62" rx="4" className="viz-bar bar-4" />
    <rect x="126" y="42" width="18" height="76" rx="4" className="viz-bar bar-5" />
    <path d="M170 108l36-16 32 8 34-32 34 10 38-34 42-14" className="viz-line" />
    <circle cx="386" cy="30" r="4.5" className="viz-dot" />
    <rect x="170" y="22" width="76" height="26" rx="13" className="viz-pill" />
    <rect x="182" y="32" width="52" height="7" rx="3.5" className="viz-pill-text" />
  </svg>;
}

export function LoginPage() {
  const { user } = useAuth();
  const { email, password, error, loading, showPassword, setEmail, setPassword, setShowPassword, submit } = useLoginForm();
  if (user) return <Navigate to="/leads" replace />;
  return <main className="login-wrap">
    <section className="login-brand" aria-label="Altus CRM overview">
      <div className="login-brand-inner">
        <img className="brand-logo" src="/altus-lockup-white.webp" alt="Altus CRM" />
        <div className="brand-mid">
          <h1>Everything your sales team needs, <em>in one place</em></h1>
          <p className="brand-lede">A clear, connected workspace for your customer relationships, campaigns, reports and daily work.</p>
          <ul className="login-chips">{CHIPS.map((chip) => <li key={chip}>{chip}</li>)}</ul>
        </div>
        <Illustration />
      </div>
      <p className="brand-foot">© {new Date().getFullYear()} Altus CRM</p>
    </section>
    <section className="login-panel">
      <div className="login-form-wrap">
        <div className="form-logo"><img className="lockup-light" src="/altus-lockup.webp" alt="Altus CRM" /><img className="lockup-dark" src="/altus-lockup-white.webp" alt="" aria-hidden="true" /></div>
        <p className="login-eyebrow">Welcome back</p>
        <h2>Sign in to your account</h2>
        <p className="login-sub">Use the email address on your account.</p>
        <div className="login-error" role="alert" aria-live="polite">{error}</div>
        <form onSubmit={submit} noValidate>
          <div className="login-field"><label htmlFor="email">Email</label><div className="login-control"><MailIcon /><input id="email" name="email" type="email" autoComplete="username" placeholder="you@company.com" required value={email} onChange={(event) => setEmail(event.target.value)} /></div></div>
          <div className="login-field"><label htmlFor="password">Password</label><div className="login-control"><LockIcon /><input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="••••••••" required value={password} onChange={(event) => setPassword(event.target.value)} /><button className={`password-toggle${showPassword ? " on" : ""}`} type="button" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword((value) => !value)}><EyeIcon /><EyeIcon off /></button></div></div>
          <button className="login-submit" type="submit" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</button>
        </form>
        <p className="login-help"><HelpIcon /><span><Link className="login-forgot-link" to="/forgot-password">Forgot your password?</Link><br /><span>We’ll send a secure reset link to your account email.</span></span></p>
        <p className="login-foot">© {new Date().getFullYear()} Altus CRM</p>
      </div>
    </section>
  </main>;
}
