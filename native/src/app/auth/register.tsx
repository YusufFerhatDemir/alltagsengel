import { useRouter } from 'expo-router'
import { useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { BodyText, Card, GhostButton, GoldButton, Input, MutedText } from '../../components/ui'
import { Colors, Fonts } from '../../constants/theme'
import { registerForPushNotifications } from '../../lib/notifications'
import { supabase } from '../../lib/supabase'

// ═══════════════════════════════════════════════════════════
// REGISTRIERUNG — Supabase Auth (gleiche Instanz wie die Web-App)
// Rolle: kunde (Engel-Registrierung läuft über die Web-App).
// ═══════════════════════════════════════════════════════════

export default function RegisterScreen() {
  const router = useRouter()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const valid =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    /\S+@\S+\.\S+/.test(email) &&
    password.length >= 8

  async function register() {
    if (!valid) return
    setLoading(true)
    setError('')

    const { data, error: authError } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          role: 'kunde',
        },
      },
    })

    setLoading(false)
    if (authError) {
      setError(
        authError.message.includes('already registered')
          ? 'Diese E-Mail-Adresse ist bereits registriert. Bitte melden Sie sich an.'
          : 'Registrierung fehlgeschlagen. Bitte versuchen Sie es erneut.'
      )
      return
    }

    if (data.session) {
      // Direkt eingeloggt (E-Mail-Bestätigung deaktiviert)
      registerForPushNotifications().catch(() => {})
      router.back()
    } else {
      // E-Mail-Bestätigung erforderlich
      setDone(true)
    }
  }

  if (done) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.doneWrap}>
          <Card style={styles.doneCard}>
            <Text style={styles.doneIcon}>✉️</Text>
            <Text style={styles.doneTitle}>Fast geschafft!</Text>
            <BodyText style={styles.doneText}>
              Wir haben Ihnen eine Bestätigungs-E-Mail geschickt. Bitte klicken Sie auf den Link in
              der E-Mail und melden Sie sich danach hier an.
            </BodyText>
            <GoldButton onPress={() => router.replace('/auth/login')} style={styles.doneBtn}>
              Zur Anmeldung
            </GoldButton>
          </Card>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.brand}>ALLTAGSENGEL</Text>
          <Text style={styles.title}>Kostenlos registrieren</Text>
          <BodyText style={styles.intro}>
            In 2 Minuten startklar — keine Vorauszahlung, keine Bindung, jederzeit kündbar.
          </BodyText>

          <View style={styles.fields}>
            <View style={styles.nameRow}>
              <Input
                placeholder="Vorname"
                value={firstName}
                onChangeText={setFirstName}
                autoComplete="given-name"
                style={styles.nameInput}
              />
              <Input
                placeholder="Nachname"
                value={lastName}
                onChangeText={setLastName}
                autoComplete="family-name"
                style={styles.nameInput}
              />
            </View>
            <Input
              placeholder="E-Mail-Adresse"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
            <Input
              placeholder="Passwort (mind. 8 Zeichen)"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="new-password"
            />
          </View>

          {error !== '' && <Text style={styles.error}>{error}</Text>}

          <GoldButton onPress={register} disabled={!valid} loading={loading} style={styles.submit}>
            Jetzt kostenlos registrieren
          </GoldButton>

          <View style={styles.divider} />

          <GhostButton onPress={() => router.replace('/auth/login')}>
            Ich habe bereits ein Konto
          </GhostButton>

          <MutedText style={styles.footer}>
            Mit der Registrierung akzeptieren Sie unsere AGB und Datenschutzerklärung
            (alltagsengel.care). Sie möchten als Engel arbeiten? Registrieren Sie sich auf
            alltagsengel.care/engel-werden.
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
  nameRow: { flexDirection: 'row', gap: 12 },
  nameInput: { flex: 1 },
  error: { color: Colors.red, fontFamily: Fonts.regular, fontSize: 13, marginTop: 10 },
  submit: { marginTop: 18 },
  divider: { height: 1, backgroundColor: Colors.cardBorder, marginVertical: 22 },
  footer: { textAlign: 'center', marginTop: 16 },
  doneWrap: { flex: 1, justifyContent: 'center', padding: 24 },
  doneCard: { alignItems: 'center', paddingVertical: 32 },
  doneIcon: { fontSize: 44, marginBottom: 12 },
  doneTitle: { color: Colors.ink, fontFamily: Fonts.bold, fontSize: 22, marginBottom: 10 },
  doneText: { textAlign: 'center', marginBottom: 20 },
  doneBtn: { alignSelf: 'stretch' },
})
