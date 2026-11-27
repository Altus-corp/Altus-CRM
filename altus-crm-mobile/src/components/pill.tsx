import { StyleSheet, View } from 'react-native';
import { ThemedText } from './themed-text';
import { BucketTone, Radius } from '@/constants/theme';
import type { BucketKey } from '@/types/api';

// Ported from the web CRM's .pill — a small dot + tone-colored bordered badge.
// "slate" is the neutral tone the web app uses for non-bucket badges like Product.
const SLATE = { bg: '#EEF1F5', border: '#D5DBE4', ink: '#3E4A5C', mark: '#8592A6' };
export type ToneKey = BucketKey | 'slate';
const TONE: Record<ToneKey, { bg: string; border: string; ink: string; mark: string }> = { ...BucketTone, slate: SLATE };

export function Pill({ tone, label }: { tone: ToneKey; label: string }) {
  const t = TONE[tone];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg, borderColor: t.border }]}>
      <View style={[styles.dot, { backgroundColor: t.mark }]} />
      <ThemedText style={[styles.label, { color: t.ink }]} numberOfLines={1}>
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: Radius.pill,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: { fontSize: 11, fontWeight: '700' },
});
