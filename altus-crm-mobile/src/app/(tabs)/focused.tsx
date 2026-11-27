import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { LeadRow } from '@/components/lead-row';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api-client';
import { Radius, Spacing } from '@/constants/theme';
import type { BucketKey, MyLeadRow } from '@/types/api';

// Ambassador-only tab, mirroring the web CRM's "Focused" nav entry (sales/focus-leads): the same
// "my leads" set narrowed to the buckets that need attention right now.
const FOCUS_BUCKETS: BucketKey[] = ['closing', 'negotiation', 'followup'];

export default function FocusedScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [leads, setLeads] = useState<MyLeadRow[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await api.get<{ leads: MyLeadRow[] }>('/api/mobile/leads?limit=100');
    if (!result.ok) { setError(result.error); return; }
    setError(null);
    setLeads(result.leads);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, see src/lib/auth-context.tsx
  useEffect(() => { void load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const focused = (leads ?? []).filter((lead) => FOCUS_BUCKETS.includes(lead.bucket));

  if (leads === null && !error) {
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
          Focused
        </ThemedText>
        {!!focused.length && (
          <ThemedView style={[styles.countChip, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="small" themeColor="ink2" style={styles.countChipText}>
              {focused.length}
            </ThemedText>
          </ThemedView>
        )}
      </ThemedView>
      {error && (
        <ThemedText type="small" themeColor="accent" style={styles.error}>
          {error}
        </ThemedText>
      )}
      <FlatList
        data={focused}
        keyExtractor={(item) => item.assignmentId}
        style={{ backgroundColor: theme.background }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
        ListEmptyComponent={!error ? <ThemedText themeColor="textSecondary" style={styles.empty}>Nothing needs attention right now.</ThemedText> : undefined}
        renderItem={({ item }) => <LeadRow item={item} onPress={() => router.push(`/lead/${item.assignmentId}`)} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderBottomWidth: StyleSheet.hairlineWidth },
  topBarTitle: { fontSize: 15, letterSpacing: 0.3 },
  countChip: { paddingHorizontal: Spacing.two, paddingVertical: 2, borderRadius: Radius.pill },
  countChipText: { fontWeight: '700' },
  error: { paddingHorizontal: Spacing.three, paddingTop: Spacing.two, fontWeight: '600' },
  empty: { padding: Spacing.five, textAlign: 'center' },
});
