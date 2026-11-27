import { StyleSheet, View } from 'react-native';
import { ThemedText } from './themed-text';

// Same rotating tone set + hashing scheme as the web CRM's Avatar (components/crm2/ui.tsx).
const TONES = [
  { bg: '#F1EDFB', ink: '#4B3A8F' }, // lav
  { bg: '#E8F2FB', ink: '#1F4F7A' }, // sky
  { bg: '#FDEEE4', ink: '#8A4317' }, // peach
  { bg: '#E4F4EC', ink: '#1D6146' }, // mint
  { bg: '#FBE8EC', ink: '#8E2A40' }, // rose
  { bg: '#FCF5D9', ink: '#6E5604' }, // butter
  { bg: '#E2F4F4', ink: '#145E61' }, // aqua
  { bg: '#EDF3E5', ink: '#47602B' }, // sage
];

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  let hash = 0;
  for (const ch of name) hash = (hash * 7 + ch.charCodeAt(0)) % 997;
  const tone = TONES[hash % TONES.length];
  const initials = name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: tone.bg }]}>
      <ThemedText style={{ color: tone.ink, fontWeight: '700', fontSize: size * 0.38 }}>{initials || '—'}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
});
