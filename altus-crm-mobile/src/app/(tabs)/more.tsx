import { Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Avatar } from '@/components/avatar';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { CardShadow, Radius, Spacing } from '@/constants/theme';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  sales_executive: 'Sales Executive',
  sales_manager: 'Sales Manager',
  consultant: 'Consultant',
  marketing_manager: 'Marketing Manager',
  marketing_executive: 'Marketing Executive',
  ambassador: 'Ambassador',
};

export default function MoreScreen() {
  const { user, logout } = useAuth();
  const theme = useTheme();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <ThemedView style={styles.container}>
        <ThemedText type="title" style={styles.title}>
          More
        </ThemedText>

        <ThemedView style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }, CardShadow]}>
          <ThemedView style={styles.person} type="card">
            <Avatar name={user?.displayName ?? '—'} size={48} />
            <ThemedView style={styles.personText} type="card">
              <ThemedText type="smallBold">{user?.displayName ?? '—'}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {user?.email ?? ''}
              </ThemedText>
            </ThemedView>
          </ThemedView>
          {!!user?.roles?.length && (
            <ThemedView style={[styles.rolesRow, { borderTopColor: theme.border }]} type="card">
              {user.roles.map((role) => (
                <ThemedView key={role} style={[styles.roleChip, { backgroundColor: theme.backgroundElement }]}>
                  <ThemedText type="small" themeColor="ink2">
                    {ROLE_LABELS[role] ?? role}
                  </ThemedText>
                </ThemedView>
              ))}
            </ThemedView>
          )}
        </ThemedView>

        <Pressable onPress={() => void logout()} style={[styles.button, { borderColor: theme.accent }]}>
          <ThemedText themeColor="accent" style={styles.buttonText}>
            Sign out
          </ThemedText>
        </Pressable>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, paddingHorizontal: Spacing.three, paddingTop: Spacing.two },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700', marginBottom: Spacing.three },
  card: { borderWidth: 1, borderRadius: Radius.card, overflow: 'hidden' },
  person: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.three },
  personText: { gap: 2, flexShrink: 1 },
  rolesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one, padding: Spacing.three, borderTopWidth: StyleSheet.hairlineWidth },
  roleChip: { paddingHorizontal: Spacing.two, paddingVertical: 4, borderRadius: Radius.small },
  button: {
    marginTop: Spacing.four,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: Radius.small,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  buttonText: { fontWeight: '700' },
});
