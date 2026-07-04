/**
 * Velora — Login
 * --------------
 * Anmeldung mit E-Mail & Passwort. Nach erfolgreicher Anmeldung ersetzt die
 * Navigation den Auth-Stack durch die Tab-Navigation.
 */

import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { Button, Logo, Screen, Text, TextField } from '@/components';
import { useTheme } from '@/theme/ThemeProvider';
import { isValidEmail } from '@/lib/validation';

export default function LoginScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { signIn, pending } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleLogin() {
    setError(null);
    if (!isValidEmail(email)) {
      setError('Bitte gib eine gültige E-Mail-Adresse ein.');
      return;
    }
    if (password.length < 6) {
      setError('Das Passwort muss mindestens 6 Zeichen haben.');
      return;
    }
    try {
      await signIn(email.trim(), password);
      router.replace('/(tabs)');
    } catch {
      setError('Anmeldung fehlgeschlagen. Bitte versuche es erneut.');
    }
  }

  return (
    <Screen scroll>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <Logo layout="vertical" size={64} withSlogan />
        </View>

        <Text variant="title" style={styles.title}>
          Willkommen zurück
        </Text>
        <Text variant="body" color="textMuted" style={styles.subtitle}>
          Melde dich an, um Begleitung zu organisieren und in Verbindung zu bleiben.
        </Text>

        <TextField
          label="E-Mail"
          icon="mail-outline"
          placeholder="name@beispiel.de"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          value={email}
          onChangeText={setEmail}
        />
        <TextField
          label="Passwort"
          icon="lock-closed-outline"
          placeholder="••••••••"
          secureTextEntry
          autoComplete="password"
          value={password}
          onChangeText={setPassword}
        />

        {error ? (
          <Text variant="caption" color="danger" style={styles.error}>
            {error}
          </Text>
        ) : null}

        <View style={styles.forgot}>
          <Text variant="caption" color="primary">
            Passwort vergessen?
          </Text>
        </View>

        <Button label="Anmelden" onPress={handleLogin} loading={pending} icon="log-in-outline" />

        <View style={[styles.footer, { borderTopColor: theme.colors.border }]}>
          <Text variant="body" color="textMuted">
            Noch kein Konto?{' '}
          </Text>
          <Link href="/(auth)/register" replace>
            <Text variant="label" color="primary">
              Jetzt registrieren
            </Text>
          </Link>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', marginTop: 24, marginBottom: 28 },
  title: { marginBottom: 6 },
  subtitle: { marginBottom: 28 },
  error: { marginBottom: 12 },
  forgot: { alignItems: 'flex-end', marginBottom: 20 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 28,
    paddingTop: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
