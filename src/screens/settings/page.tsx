import { useSettings } from "./function";

export function SettingsPage() { const { user, logout } = useSettings(); return <div className="page"><h1>Settings</h1><p>Account settings for {user?.email ?? "the signed-in user"}.</p><button onClick={logout}>Sign out</button></div>; }
