import { useAccount } from "./function";
import "./account.css";
import { Link } from "react-router-dom";

export function AccountPage() {
  const account = useAccount();
  const name = account.user?.name || "Account user";
  const email = account.user?.email || "Not available";
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <section className="account-page" aria-labelledby="account-page-title">
      <header className="account-page-heading">
        <p>Account</p>
        <h1 id="account-page-title">Your profile</h1>
        <span>View your account details and current access role.</span>
      </header>

      <article className="account-profile-card">
        <div className="account-profile-summary">
          <div className="account-profile-avatar" aria-hidden="true">{initials || "AU"}</div>
          <div>
            <h2>{name}</h2>
            <p>{email}</p>
            <span className="account-profile-role">{account.role}</span>
          </div>
        </div>

        <dl className="account-details-list">
          <div><dt>Name</dt><dd>{name}</dd></div>
          <div><dt>Email address</dt><dd>{email}</dd></div>
          <div><dt>Role</dt><dd>{account.role}</dd></div>
        </dl>

        <footer className="account-profile-footer">
          <div><strong>Session</strong><span>Sign out of this device when you are finished.</span></div>
          <div className="account-profile-actions">
            <Link to="/change-password">Change password</Link>
            <button type="button" onClick={() => void account.signOut()}>Sign out</button>
          </div>
        </footer>
      </article>
    </section>
  );
}
