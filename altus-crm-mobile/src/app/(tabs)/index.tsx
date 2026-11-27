import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api-client';
import { Spacing } from '@/constants/theme';
import type { MyLeadRow } from '@/types/api';

const BUCKET_LABEL: Record<MyLeadRow['bucket'], string> = {
  closing: 'Closing',
  negotiation: 'Negotiation',
  followup: 'Follow-up',
  approach: 'Approach',
  new: 'New',
  lost: 'Lost',
};
const BUCKET_COLOR: Record<MyLeadRow['bucket'], string> = {
  closing: '#1D6146',
  negotiation: '#6E5604',
  followup: '#8A4317',
  approach: '#1F4F7A',
  new: '#4B3A8F',
  lost: '#8E2A40',
};

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

  // Fetch-on-mount: eslint-config-expo's React Compiler rule flags any effect whose call graph
  // eventually calls setState, even indirectly through an async callback — there's no effect-free
  // way to express "load this screen's data once it mounts."
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (leads === null && !error) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ThemedView style={styles.container}>
        <ThemedText type="title" style={styles.title}>
          My Leads
        </ThemedText>
        {error && <ThemedText style={styles.error}>{error}</ThemedText>}
        <FlatList
          data={leads ?? []}
          keyExtractor={(item) => item.assignmentId}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={!error ? <ThemedText themeColor="textSecondary">No leads assigned to you yet.</ThemedText> : undefined}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/lead/${item.assignmentId}`)}
              style={[styles.row, { borderColor: theme.backgroundElement }]}>
              <ThemedText type="smallBold">{item.name || 'Unnamed lead'}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {[item.company, item.product].filter(Boolean).join(' · ') || '—'}
              </ThemedText>
              <ThemedView style={[styles.badge, { backgroundColor: BUCKET_COLOR[item.bucket] + '22' }]}>
                <ThemedText type="small" style={{ color: BUCKET_COLOR[item.bucket] }}>
                  {BUCKET_LABEL[item.bucket]}
                </ThemedText>
              </ThemedView>
            </Pressable>
          )}
        />
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { flex: 1, paddingHorizontal: Spacing.three, paddingTop: Spacing.three, gap: Spacing.two },
  title: { fontSize: 28, lineHeight: 34, marginBottom: Spacing.two },
  error: { color: '#D9303C', marginBottom: Spacing.two },
  row: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.one,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: Spacing.one,
    marginTop: Spacing.one,
  },
});
