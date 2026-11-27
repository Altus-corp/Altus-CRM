// Small date helpers mirroring the web CRM's fdate()/ago() (components/crm2/ui.tsx), kept minimal
// since the mobile list only needs a short "FU <date>" / "<n>d ago" line, not the full formatter set.
export function fdate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function ago(iso: string | null): string {
  if (!iso) return 'Never called';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return '1d ago';
  return `${days}d ago`;
}
