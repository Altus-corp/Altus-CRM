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
import type { MyLeadRow } from '@/types/api';

export default function MyLeadsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [leads, setLeads] = useState<MyLeadRow[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await api.get<{ leads: MyLeadRow[] }>('/api/mobile/leads');
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
          Leads
        </ThemedText>
        {!!leads?.length && (
          <ThemedView style={[styles.countChip, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="small" themeColor="ink2" style={styles.countChipText}>
              {leads.length}
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
        data={leads ?? []}
        keyExtractor={(item) => item.assignmentId}
        style={{ backgroundColor: theme.background }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
        ListEmptyComponent={!error ? <ThemedText themeColor="textSecondary" style={styles.empty}>No leads assigned to you yet.</ThemedText> : undefined}
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
