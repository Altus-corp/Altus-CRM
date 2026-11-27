import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Pill } from '@/components/pill';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api-client';
import { Radius, Spacing } from '@/constants/theme';
import type { CallLogRow } from '@/types/api';

// Mirrors the web CRM's Calls tab (CallLog in components/crm2/pages.tsx): a call-log history list
// (not "due to call") with KPI chips for totals/connected/talk time computed from the same payload.
function fmtMinutes(totalSeconds: number) {
  return Math.round(totalSeconds / 60);
}
function fmtWhen(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export default function CallsScreen() {
  const theme = useTheme();
  const [calls, setCalls] = useState<CallLogRow[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await api.get<{ calls: CallLogRow[] }>('/api/mobile/calls');
    if (!result.ok) { setError(result.error); return; }
    setError(null);
    setCalls(result.calls);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, see src/lib/auth-context.tsx
  useEffect(() => { void load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const connected = (calls ?? []).filter((c) => c.isConnected).length;
  const talkMinutes = fmtMinutes((calls ?? []).reduce((sum, c) => sum + c.durationSeconds, 0));

  if (calls === null && !error) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator color={theme.accent} />
      </ThemedView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.card }]} edges={['top']}>
      <ThemedView style={[styles.topBar, { borderBottomColor: theme.border, backgroundColor: theme.card }]} type="card">
        <ThemedText type="smallBold" themeColor="accent" style={styles.topBarTitle}>
          Calls
        </ThemedText>
      </ThemedView>
      {!!calls?.length && (
        <ThemedView style={[styles.kpiRow, { borderBottomColor: theme.border, backgroundColor: theme.card }]} type="card">
          <KpiChip label="Calls" value={calls.length} />
          <KpiChip label="Connected" value={connected} />
          <KpiChip label="Talk mins" value={talkMinutes} />
        </ThemedView>
      )}
      {error && (
        <ThemedText type="small" themeColor="accent" style={styles.error}>
          {error}
        </ThemedText>
      )}
      <FlatList
        data={calls ?? []}
        keyExtractor={(item) => item.id}
        style={{ backgroundColor: theme.background }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
        ListEmptyComponent={!error ? <ThemedText themeColor="textSecondary" style={styles.empty}>No calls in the last 60 days.</ThemedText> : undefined}
        renderItem={({ item }) => <CallRow item={item} />}
      />
    </SafeAreaView>
  );
}

function KpiChip({ label, value }: { label: string; value: number }) {
  const theme = useTheme();
  return (
    <ThemedView style={[styles.kpiChip, { backgroundColor: theme.backgroundElement }]}>
      <ThemedText type="smallBold">{value}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </ThemedView>
  );
}

function CallRow({ item }: { item: CallLogRow }) {
  const theme = useTheme();
  const minutes = fmtMinutes(item.durationSeconds);
  return (
    <View style={[styles.row, { borderBottomColor: theme.border }]}>
      <View style={styles.rowBody}>
        <ThemedText style={styles.rowTitle} numberOfLines={1}>
          {item.leadName}
        </ThemedText>
        {!!item.company && (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {item.company}
          </ThemedText>
        )}
        <View style={styles.pillRow}>
          <Pill tone={item.isConnected ? 'closing' : 'lost'} label={item.isConnected ? 'Connected' : 'Not connected'} />
          <Pill tone="slate" label={item.direction === 'incoming' ? 'Inbound' : 'Outbound'} />
        </View>
      </View>
      <View style={styles.rowMeta}>
        <ThemedText type="small" themeColor="faint">
          {fmtWhen(item.calledAt)}
        </ThemedText>
        {minutes > 0 && (
          <ThemedText type="small" themeColor="faint">
            {minutes}m
          </ThemedText>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderBottomWidth: StyleSheet.hairlineWidth },
  topBarTitle: { fontSize: 15, letterSpacing: 0.3 },
  kpiRow: { flexDirection: 'row', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderBottomWidth: StyleSheet.hairlineWidth },
  kpiChip: { flex: 1, borderRadius: Radius.small, paddingVertical: Spacing.one, paddingHorizontal: Spacing.two, alignItems: 'center' },
  error: { paddingHorizontal: Spacing.three, paddingTop: Spacing.two, fontWeight: '600' },
  empty: { padding: Spacing.five, textAlign: 'center' },
  row: { flexDirection: 'row', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderBottomWidth: StyleSheet.hairlineWidth, alignItems: 'center' },
  rowBody: { flex: 1, gap: 5 },
  rowTitle: { fontWeight: '700', fontSize: 14 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  rowMeta: { alignItems: 'flex-end', gap: 2 },
});
