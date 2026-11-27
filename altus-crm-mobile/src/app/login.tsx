import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { CardShadow, Radius, Spacing } from '@/constants/theme';

export default function LoginScreen() {
  const { login } = useAuth();
  const theme = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password) return setError('Enter your email and password.');
    setBusy(true);
    setError(null);
    const result = await login(email.trim(), password);
    setBusy(false);
    if (!result.ok) setError(result.error ?? 'Could not sign in.');
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ThemedView style={styles.container} type="background">
        <ThemedView style={[styles.mark, { backgroundColor: theme.accent }]}>
          <ThemedText style={styles.markText}>A</ThemedText>
        </ThemedView>
        <ThemedText type="title" themeColor="accent" style={styles.title}>
          Altus CRM
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
          Sign in with your CRM account
        </ThemedText>

        <ThemedView style={[styles.card, { borderColor: theme.border, backgroundColor: theme.card }, CardShadow]}>
          <ThemedView style={[styles.field, { borderColor: theme.border }]} type="card">
            <ThemedText type="small" themeColor="faint" style={styles.fieldLabel}>
              EMAIL
            </ThemedText>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@altuscorp.in"
              placeholderTextColor={theme.faint}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              style={[styles.input, { color: theme.text }]}
            />
          </ThemedView>
          <ThemedView style={[styles.field, { borderColor: theme.border }]} type="card">
            <ThemedText type="small" themeColor="faint" style={styles.fieldLabel}>
              PASSWORD
            </ThemedText>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={theme.faint}
              secureTextEntry
              autoComplete="password"
              style={[styles.input, { color: theme.text }]}
            />
          </ThemedView>
        </ThemedView>

        {error && (
          <ThemedText type="small" style={[styles.error, { color: theme.accent }]}>
            {error}
          </ThemedText>
        )}

        <Pressable
          onPress={submit}
          disabled={busy}
          style={[styles.button, { backgroundColor: theme.accent }, busy && styles.buttonDisabled]}>
          {busy ? <ActivityIndicator color="#ffffff" /> : <ThemedText style={styles.buttonText}>Sign in</ThemedText>}
        </Pressable>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: Spacing.four },
  mark: { width: 44, height: 44, borderRadius: Radius.small, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.three },
  markText: { color: '#ffffff', fontWeight: '700', fontSize: 20 },
  title: { fontSize: 26, lineHeight: 32, fontWeight: '700', letterSpacing: 0.3 },
  subtitle: { marginTop: Spacing.one, marginBottom: Spacing.four },
  card: { borderWidth: 1, borderRadius: Radius.card, overflow: 'hidden' },
  field: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderBottomWidth: StyleSheet.hairlineWidth },
  fieldLabel: { fontWeight: '700', letterSpacing: 0.6, marginBottom: 3, fontSize: 10 },
  input: { fontSize: 15, fontWeight: '700', padding: 0 },
  error: { marginTop: Spacing.three, fontWeight: '600' },
  button: {
    borderRadius: Radius.small,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.four,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#ffffff', fontWeight: '700', fontSize: 15 },
});
