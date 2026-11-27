import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Pill } from '@/components/pill';
import { useTheme } from '@/hooks/use-theme';
import { ago, fdate } from '@/lib/format';
import { BucketTone, Spacing } from '@/constants/theme';
import type { MyLeadRow } from '@/types/api';

// Ported from the web CRM's mobile card view (.mrow / leadCard() in components/crm2/leads.tsx):
// a left accent stripe for priority stage, bold name, muted company, Product + Resolution pills,
// and a trailing follow-up/last-called line. Shared by the Leads, Follow-ups, and Focused tabs.
export function LeadRow({ item, onPress }: { item: MyLeadRow; onPress: () => void }) {
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
  mrow: { flexDirection: 'row', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderBottomWidth: StyleSheet.hairlineWidth },
  stripe: { width: 3, borderRadius: 2 },
  mrowBody: { flex: 1, gap: 5 },
  mrowTitle: { fontWeight: '700', fontSize: 14 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  followUp: { marginTop: 1 },
});
