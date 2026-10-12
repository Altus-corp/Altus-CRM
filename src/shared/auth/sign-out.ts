export async function signOut(logout: () => Promise<void>, navigate: (to: string, options?: { replace?: boolean }) => void) {
  try { await logout(); } catch {}
  navigate("/login", { replace: true });
}
