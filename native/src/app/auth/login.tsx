import { useRouter } from 'expo-router'
import { useState } from 'react'
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { BodyText, GhostButton, GoldButton, Input, MutedText } from '../../components/ui'
import { API_BASE } from '../../constants/config'
import { Colors, Fonts } from '../../constants/theme'
import { registerForPushNotifications } from '../../lib/notifications'
import { supabase } from '../../lib/supabase'

// ═══════════════════════════════════════════════════════════
// LOGIN — Supabase Auth (gleiche Instanz wie die Web-App)
// ═══════════════════════════════════════════════════════════

export default function LoginScreen() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const valid = /\S+@\S+\.\S+/.test(email) && password.length > 0

  async function login() {
    if (!valid) return
    setLoading(true)
    setError('')

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })

    setLoading(false)
    if (authError) {
      setError(
        authError.message === 'Invalid login credentials'
          ? 'E-Mail oder Passwort ist falsch.'
          : 'Anmeldung fehlgeschlagen. Bitte versuchen Sie es erneut.'
      )
      return
    }

    // Push-Registrierung nach erfolgreichem Login (Fehler unkritisch)
    registerForPushNotifications().catch(() => {})
    router.back()
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.brand}>ALLTAGSENGEL</Text>
          <Text style={styles.title}>Anmelden</Text>
          <BodyText style={styles.intro}>
            Melden Sie sich mit Ihrem Alltagsengel-Konto an — dasselbe Konto wie auf
            alltagsengel.care.
          </BodyText>

          <View style={styles.fields}>
            <Input
              placeholder="E-Mail-Adresse"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
            <View>
              <Input
                placeholder="Passwort"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoComplete="current-password"
                style={styles.passwordInput}
              />
              <Pressable
                onPress={() => setShowPassword(v => !v)}
                style={styles.showToggle}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
              >
                <Text style={styles.showToggleText}>{showPassword ? '🙈' : '👁'}</Text>
              </Pressable>
            </View>
          </View>

          {error !== '' && <Text style={styles.error}>{error}</Text>}

          <GoldButton onPress={login} disabled={!valid} loading={loading} style={styles.submit}>
            Anmelden
          </GoldButton>

          <Pressable
            onPress={() => Linking.openURL(`${API_BASE}/auth/forgot-password`)}
            style={styles.forgot}
          >
            <Text style={styles.forgotText}>Passwort vergessen?</Text>
          </Pressable>

          <View style={styles.divider} />

          <GhostButton onPress={() => router.replace('/auth/register')}>
            Noch kein Konto? Jetzt registrieren
          </GhostButton>

          <MutedText style={styles.footer}>
            Mit der Anmeldung akzeptieren Sie unsere AGB und Datenschutzerklärung
            (alltagsengel.care).
          </MutedText>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  flex: { flex: 1 },
  scroll: { padding: 24, paddingTop: 32 },
  brand: {
    color: Colors.gold,
    fontFamily: Fonts.serifBold,
    fontSize: 22,
    letterSpacing: 3,
    textAlign: 'center',
    marginBottom: 24,
  },
  title: { color: Colors.ink, fontFamily: Fonts.bold, fontSize: 26, marginBottom: 8 },
  intro: { marginBottom: 24 },
  fields: { gap: 12 },
  passwordInput: { paddingRight: 48 },
  showToggle: {
    position: 'absolute',
    right: 14,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  showToggleText: { fontSize: 18 },
  error: { color: Colors.red, fontFamily: Fonts.regular, fontSize: 13, marginTop: 10 },
  submit: { marginTop: 18 },
  forgot: { alignItems: 'center', marginTop: 16 },
  forgotText: { color: Colors.gold2, fontFamily: Fonts.regular, fontSize: 13 },
  divider: { height: 1, backgroundColor: Colors.cardBorder, marginVertical: 22 },
  footer: { textAlign: 'center', marginTop: 16 },
})
