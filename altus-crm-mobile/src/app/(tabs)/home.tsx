import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api-client';
import { CardShadow, Radius, Spacing } from '@/constants/theme';
import type { CallLogRow, MyLeadRow } from '@/types/api';

// Mirrors the web CRM's Home dashboard KPI strip (KpiBar in components/crm2/CrmApp.tsx): tiles
// computed client-side from the same "my leads"/"my calls" payloads, no separate aggregate query.
// Tiles are informational only here — the web's tap-to-filter-and-jump behavior is out of scope
// for this phase.
function isToday(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

export default function HomeScreen() {
  const { user } = useAuth();
  const theme = useTheme();
  const [leads, setLeads] = useState<MyLeadRow[] | null>(null);
  const [calls, setCalls] = useState<CallLogRow[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [leadsResult, callsResult] = await Promise.all([
      api.get<{ leads: MyLeadRow[] }>('/api/mobile/leads?limit=100'),
      api.get<{ calls: CallLogRow[] }>('/api/mobile/calls'),
    ]);
    if (!leadsResult.ok) { setError(leadsResult.error); return; }
    setError(null);
    setLeads(leadsResult.leads);
    if (callsResult.ok) setCalls(callsResult.calls);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, see src/lib/auth-context.tsx
  useEffect(() => { void load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // new Date() via useMemo, not Date.now() inline — the React Compiler flags Date.now() as an
  // impure call during render; kept above the loading early-return so hook order stays stable.
  const now = useMemo(() => new Date().getTime(), []);

  if (leads === null && !error) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator color={theme.accent} />
      </ThemedView>
    );
  }

  const rows = leads ?? [];
  const closingNegotiation = rows.filter((r) => r.bucket === 'closing' || r.bucket === 'negotiation').length;
  const overdueFollowUps = rows.filter((r) => r.nextFollowUp && new Date(r.nextFollowUp).getTime() < now).length;
  const neverCalled = rows.filter((r) => !r.lastCalledAt).length;
  const callsToday = (calls ?? []).filter((c) => isToday(c.calledAt)).length;
  const connectedToday = (calls ?? []).filter((c) => c.isConnected && isToday(c.calledAt)).length;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}>
        <ThemedText type="title" style={styles.title}>
          {user?.displayName ? `Hi, ${user.displayName.split(' ')[0]}` : 'Home'}
        </ThemedText>
        {error && (
          <ThemedText type="small" themeColor="accent" style={styles.error}>
            {error}
          </ThemedText>
        )}
        <View style={styles.grid}>
          <Tile label="Closing + Negotiation" value={closingNegotiation} theme={theme} />
          <Tile label="Overdue follow-ups" value={overdueFollowUps} theme={theme} accent={overdueFollowUps > 0} />
          <Tile label="Never called" value={neverCalled} theme={theme} />
          <Tile label="Calls today" value={callsToday} theme={theme} />
          <Tile label="Connected today" value={connectedToday} theme={theme} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Tile({ label, value, theme, accent }: { label: string; value: number; theme: ReturnType<typeof useTheme>; accent?: boolean }) {
  return (
    <ThemedView style={[styles.tile, { backgroundColor: theme.card, borderColor: theme.border }, CardShadow]}>
      <ThemedText style={[styles.tileValue, accent && { color: theme.accent }]}>{value}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  error: { fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  tile: { width: '47%', borderWidth: 1, borderRadius: Radius.card, paddingHorizontal: Spacing.three, paddingVertical: Spacing.three, gap: 4 },
  tileValue: { fontSize: 26, fontWeight: '700' },
});
