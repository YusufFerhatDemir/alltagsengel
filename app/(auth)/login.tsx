import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { Colors } from '@/constants/theme'
import { Ionicons } from '@expo/vector-icons'

export default function LoginScreen() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [demoLoading, setDemoLoading] = useState('')

  async function loginAndRedirect(loginEmail: string, loginPassword: string) {
    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: loginPassword,
    })

    if (authError) {
      if (authError.message === 'Email not confirmed') {
        setError('Bitte bestätigen Sie zuerst Ihre E-Mail-Adresse.')
      } else if (authError.message === 'Invalid login credentials') {
        setError('E-Mail oder Passwort ist falsch.')
      } else {
        setError(authError.message)
      }
      return
    }

    if (data.user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .single()

      if (profile?.role === 'admin') {
        router.replace('/(kunde)/home')
      } else if (profile?.role === 'engel') {
        router.replace('/(engel)/home')
      } else {
        router.replace('/(kunde)/home')
      }
    }
  }

  async function demoLogin(role: 'admin' | 'engel' | 'kunde') {
    setDemoLoading(role)
    setError('')
    const creds = {
      admin: { email: 'admin@alltagsengel.de', password: 'Admin2026!' },
      engel: { email: 'anna@example.com', password: 'password123' },
      kunde: { email: 'maria@example.com', password: 'password123' },
    }
    try {
      await loginAndRedirect(creds[role].email, creds[role].password)
    } catch {
      setError('Netzwerkfehler. Bitte versuchen Sie es erneut.')
    } finally {
      setDemoLoading('')
    }
  }

  async function handleSubmit() {
    setLoading(true)
    setError('')
    try {
      await loginAndRedirect(email, password)
    } catch {
      setError('Netzwerkfehler. Bitte versuchen Sie es erneut.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
      <View style={s.card}>
        <View style={s.iconWrap}>
          <Ionicons name="heart" size={40} color={Colors.gold} />
        </View>
        <Text style={s.title}>Willkommen zurück</Text>
        <Text style={s.sub}>Melden Sie sich an</Text>

        <TextInput
          style={s.input}
          placeholder="E-Mail-Adresse"
          placeholderTextColor={Colors.ink4}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <TextInput
          style={s.input}
          placeholder="Passwort"
          placeholderTextColor={Colors.ink4}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        {error ? <Text style={s.error}>{error}</Text> : null}

        <TouchableOpacity onPress={() => router.push('/(auth)/forgot-password')}>
          <Text style={s.forgot}>Passwort vergessen?</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.btnGold} onPress={handleSubmit} disabled={loading || !!demoLoading}>
          {loading ? <ActivityIndicator color={Colors.coal} /> : <Text style={s.btnGoldText}>ANMELDEN</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push('/choose')}>
          <Text style={s.link}>Noch kein Konto? <Text style={s.linkBold}>Registrieren</Text></Text>
        </TouchableOpacity>

        <View style={s.demoDivider}>
          <Text style={s.demoLabel}>DEMO ZUGANG</Text>
        </View>
        <View style={s.demoRow}>
          {(['admin', 'engel', 'kunde'] as const).map(role => (
            <TouchableOpacity
              key={role}
              style={s.demoBtn}
              onPress={() => demoLogin(role)}
              disabled={!!demoLoading || loading}
            >
              {demoLoading === role ? (
                <ActivityIndicator size="small" color={Colors.gold} />
              ) : (
                <Text style={s.demoBtnText}>{role.charAt(0).toUpperCase() + role.slice(1)}</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: Colors.bg },
  container: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 40 },
  card: { backgroundColor: Colors.coal2, borderRadius: 20, padding: 24, borderWidth: 1, borderColor: Colors.coal3 },
  iconWrap: { alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '700', color: Colors.ink, textAlign: 'center', marginBottom: 4 },
  sub: { fontSize: 14, color: Colors.ink3, textAlign: 'center', marginBottom: 24 },
  input: { backgroundColor: Colors.coal3, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, color: Colors.ink, fontSize: 15, marginBottom: 12, borderWidth: 1, borderColor: Colors.coal4 },
  error: { color: Colors.red, fontSize: 13, marginBottom: 8, textAlign: 'center' },
  forgot: { color: Colors.gold, fontSize: 13, textAlign: 'right', marginBottom: 16 },
  btnGold: { backgroundColor: Colors.gold, paddingVertical: 16, borderRadius: 14, alignItems: 'center', marginBottom: 16 },
  btnGoldText: { color: Colors.coal, fontSize: 15, fontWeight: '700', letterSpacing: 1 },
  link: { color: Colors.ink3, fontSize: 13, textAlign: 'center' },
  linkBold: { color: Colors.gold, fontWeight: '600' },
  demoDivider: { borderTopWidth: 1, borderTopColor: Colors.coal4, marginTop: 20, paddingTop: 16, alignItems: 'center' },
  demoLabel: { fontSize: 11, color: Colors.ink4, letterSpacing: 1, marginBottom: 12 },
  demoRow: { flexDirection: 'row', gap: 8 },
  demoBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: Colors.gold, alignItems: 'center' },
  demoBtnText: { color: Colors.gold, fontSize: 13, fontWeight: '600' },
})
