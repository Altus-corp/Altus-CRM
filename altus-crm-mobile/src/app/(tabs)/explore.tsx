import { Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/lib/auth-context';
import { Spacing } from '@/constants/theme';

export default function ProfileScreen() {
  const { user, logout } = useAuth();

  return (
    <SafeAreaView style={styles.safe}>
      <ThemedView style={styles.container}>
        <ThemedText type="title" style={styles.title}>
          Profile
        </ThemedText>
        <ThemedText type="smallBold">{user?.displayName ?? '—'}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {user?.email ?? ''}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {(user?.roles ?? []).join(', ')}
        </ThemedText>

        <Pressable onPress={() => void logout()} style={styles.button}>
          <ThemedText style={styles.buttonText}>Sign out</ThemedText>
        </Pressable>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, paddingHorizontal: Spacing.three, paddingTop: Spacing.three, gap: Spacing.one },
  title: { fontSize: 28, lineHeight: 34, marginBottom: Spacing.three },
  button: {
    marginTop: Spacing.four,
    alignSelf: 'flex-start',
    backgroundColor: '#D9303C',
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  buttonText: { color: '#ffffff', fontWeight: '700' },
});
