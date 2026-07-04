/**
 * Velora — Registrierung
 * ----------------------
 * Kontoerstellung mit Vorname, E-Mail & Passwort inkl. Basis-Validierung und
 * Einwilligungshinweis (Gesundheits-/Pflegedaten, Art. 9 DSGVO).
 */

import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { Button, Logo, Screen, Text, TextField } from '@/components';
import { BRAND } from '@/constants/brand';
import { isValidEmail, MIN_PASSWORD_LENGTH } from '@/lib/validation';
import { useTheme } from '@/theme/ThemeProvider';

export default function RegisterScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { signUp, pending } = useAuth();

  const [vorname, setVorname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleRegister() {
    setError(null);
    if (vorname.trim().length < 2) {
      setError('Bitte gib deinen Vornamen ein.');
      return;
    }
    if (!isValidEmail(email)) {
      setError('Bitte gib eine gültige E-Mail-Adresse ein.');
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Das Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen haben.`);
      return;
    }
    try {
      await signUp({ vorname, email: email.trim(), password });
      router.replace('/(tabs)');
    } catch {
      setError('Registrierung fehlgeschlagen. Bitte versuche es erneut.');
    }
  }

  return (
    <Screen scroll>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <Logo layout="horizontal" size={40} />
        </View>

        <Text variant="title" style={styles.title}>
          Konto erstellen
        </Text>
        <Text variant="body" color="textMuted" style={styles.subtitle}>
          In wenigen Schritten startklar – für dich und deine Angehörigen.
        </Text>

        <TextField
          label="Vorname"
          icon="person-outline"
          placeholder="Wie dürfen wir dich nennen?"
          autoCapitalize="words"
          autoComplete="given-name"
          value={vorname}
          onChangeText={setVorname}
        />
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
          placeholder={`Mindestens ${MIN_PASSWORD_LENGTH} Zeichen`}
          secureTextEntry
          autoComplete="new-password"
          value={password}
          onChangeText={setPassword}
        />

        {error ? (
          <Text variant="caption" color="danger" style={styles.error}>
            {error}
          </Text>
        ) : null}

        <Text variant="caption" color="textMuted" style={styles.consent}>
          Mit der Registrierung stimmst du der Verarbeitung deiner Daten gemäß der
          Datenschutzerklärung zu. Gesundheits- und Pflegedaten werden nach Art. 9 DSGVO besonders
          geschützt. Betreiber: {BRAND.legal.operator}.
        </Text>

        <Button
          label="Konto erstellen"
          onPress={handleRegister}
          loading={pending}
          icon="sparkles-outline"
        />

        <View style={[styles.footer, { borderTopColor: theme.colors.border }]}>
          <Text variant="body" color="textMuted">
            Schon registriert?{' '}
          </Text>
          <Link href="/(auth)/login" replace>
            <Text variant="label" color="primary">
              Anmelden
            </Text>
          </Link>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', marginTop: 16, marginBottom: 24 },
  title: { marginBottom: 6 },
  subtitle: { marginBottom: 24 },
  error: { marginBottom: 12 },
  consent: { marginBottom: 20, lineHeight: 18 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
    paddingTop: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
