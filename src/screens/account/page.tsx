import { useAccount } from "./function";

export function AccountPage() {
  const account = useAccount();
  return <div className="page"><h1>Account</h1><p>Read-only account details.</p><dl><dt>Name</dt><dd>{account.user?.name}</dd><dt>Email</dt><dd>{account.user?.email}</dd><dt>Role</dt><dd>{account.role}</dd></dl><button onClick={() => void account.signOut()}>Sign out</button></div>;
}
