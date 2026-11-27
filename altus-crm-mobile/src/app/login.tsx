import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { Spacing } from '@/constants/theme';

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
    <SafeAreaView style={styles.safe}>
      <ThemedView style={styles.container}>
        <ThemedText type="title" style={styles.title}>
          Altus CRM
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
          Sign in with your CRM account
        </ThemedText>

        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          style={[styles.input, { color: theme.text, borderColor: theme.backgroundElement }]}
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor={theme.textSecondary}
          secureTextEntry
          autoComplete="password"
          style={[styles.input, { color: theme.text, borderColor: theme.backgroundElement }]}
        />

        {error && (
          <ThemedText type="small" style={styles.error}>
            {error}
          </ThemedText>
        )}

        <Pressable onPress={submit} disabled={busy} style={[styles.button, busy && styles.buttonDisabled]}>
          {busy ? <ActivityIndicator color="#ffffff" /> : <ThemedText style={styles.buttonText}>Sign in</ThemedText>}
        </Pressable>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: Spacing.four, gap: Spacing.three },
  title: { fontSize: 32, lineHeight: 38 },
  subtitle: { marginBottom: Spacing.three },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  error: { color: '#D9303C' },
  button: {
    backgroundColor: '#D9303C',
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#ffffff', fontWeight: '700', fontSize: 16 },
});
