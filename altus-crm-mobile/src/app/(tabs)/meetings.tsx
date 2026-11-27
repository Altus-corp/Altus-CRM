import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Pill } from '@/components/pill';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api-client';
import { Spacing } from '@/constants/theme';
import type { MeetingRow } from '@/types/api';

// Ambassador-only tab, mirroring the web CRM's Meetings nav entry (dashboards/meetings): Zoom and
// Google Meet events this ambassador is hosting, newest-first within the last 7 days to next 30.
function fmtWhen(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export default function MeetingsScreen() {
  const theme = useTheme();
  const [meetings, setMeetings] = useState<MeetingRow[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await api.get<{ meetings: MeetingRow[] }>('/api/mobile/meetings');
    if (!result.ok) { setError(result.error); return; }
    setError(null);
    setMeetings(result.meetings);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, see src/lib/auth-context.tsx
  useEffect(() => { void load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (meetings === null && !error) {
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
          Meetings
        </ThemedText>
      </ThemedView>
      {error && (
        <ThemedText type="small" themeColor="accent" style={styles.error}>
          {error}
        </ThemedText>
      )}
      <FlatList
        data={meetings ?? []}
        keyExtractor={(item) => item.id}
        style={{ backgroundColor: theme.background }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
        ListEmptyComponent={!error ? <ThemedText themeColor="textSecondary" style={styles.empty}>No meetings scheduled.</ThemedText> : undefined}
        renderItem={({ item }) => <MeetingRowView item={item} />}
      />
    </SafeAreaView>
  );
}

function MeetingRowView({ item }: { item: MeetingRow }) {
  const theme = useTheme();
  return (
    <View style={[styles.row, { borderBottomColor: theme.border }]}>
      <View style={styles.rowBody}>
        <ThemedText style={styles.rowTitle} numberOfLines={1}>
          {item.leadName}
        </ThemedText>
        <View style={styles.pillRow}>
          <Pill tone="slate" label={item.kind} />
          <Pill tone={item.upcoming ? 'closing' : 'lost'} label={item.upcoming ? 'Upcoming' : 'Past'} />
        </View>
      </View>
      <ThemedText type="small" themeColor="faint">
        {fmtWhen(item.startTime)}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderBottomWidth: StyleSheet.hairlineWidth },
  topBarTitle: { fontSize: 15, letterSpacing: 0.3 },
  error: { paddingHorizontal: Spacing.three, paddingTop: Spacing.two, fontWeight: '600' },
  empty: { padding: Spacing.five, textAlign: 'center' },
  row: { flexDirection: 'row', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderBottomWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'space-between' },
  rowBody: { flex: 1, gap: 5 },
  rowTitle: { fontWeight: '700', fontSize: 14 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
});
