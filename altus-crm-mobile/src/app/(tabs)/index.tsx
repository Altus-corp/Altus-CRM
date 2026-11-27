import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Pill } from '@/components/pill';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api-client';
import { ago, fdate } from '@/lib/format';
import { BucketTone, Radius, Spacing } from '@/constants/theme';
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
          My Leads
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

// Ported from the web CRM's mobile card view (.mrow / leadCard() in components/crm2/leads.tsx):
// a left accent stripe for priority stage, bold name, muted company, Product + Resolution pills,
// and a trailing follow-up/last-called line.
function LeadRow({ item, onPress }: { item: MyLeadRow; onPress: () => void }) {
  const theme = useTheme();
  const tone = BucketTone[item.bucket];
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.mrow,
        { backgroundColor: pressed ? theme.backgroundElement : theme.card, borderBottomColor: theme.border },
      ]}>
      <View style={[styles.stripe, { backgroundColor: tone.mark }]} />
      <View style={styles.mrowBody}>
        <ThemedText style={styles.mrowTitle} numberOfLines={1}>
          {item.name || 'Unnamed lead'}
        </ThemedText>
        {!!item.company && (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {item.company}
          </ThemedText>
        )}
        <View style={styles.pillRow}>
          <Pill tone="slate" label={item.product} />
          {!!item.resolution && <Pill tone={item.bucket} label={item.resolution} />}
        </View>
        <ThemedText type="small" themeColor="faint" style={styles.followUp}>
          {item.nextFollowUp ? `FU ${fdate(item.nextFollowUp)}` : ago(item.lastCalledAt)}
        </ThemedText>
      </View>
    </Pressable>
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
  mrow: { flexDirection: 'row', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderBottomWidth: StyleSheet.hairlineWidth },
  stripe: { width: 3, borderRadius: 2 },
  mrowBody: { flex: 1, gap: 5 },
  mrowTitle: { fontWeight: '700', fontSize: 14 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  followUp: { marginTop: 1 },
});
