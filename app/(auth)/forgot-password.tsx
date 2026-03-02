import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { Colors } from '@/constants/theme'
import { Ionicons } from '@expo/vector-icons'

export default function ForgotPasswordScreen() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleReset() {
    setLoading(true)
    setError('')
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email)
    if (resetError) {
      setError(resetError.message)
    } else {
      setSent(true)
    }
    setLoading(false)
  }

  return (
    <View style={s.container}>
      <View style={s.card}>
        <View style={s.iconWrap}>
          <Ionicons name="lock-open" size={36} color={Colors.gold} />
        </View>
        <Text style={s.title}>Passwort zurücksetzen</Text>
        <Text style={s.sub}>Geben Sie Ihre E-Mail ein. Sie erhalten einen Link zum Zurücksetzen.</Text>

        {sent ? (
          <View style={s.successBox}>
            <Text style={s.successText}>E-Mail gesendet! Prüfen Sie Ihren Posteingang.</Text>
          </View>
        ) : (
          <>
            <TextInput style={s.input} placeholder="E-Mail-Adresse" placeholderTextColor={Colors.ink4} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
            {error ? <Text style={s.error}>{error}</Text> : null}
            <TouchableOpacity style={s.btnGold} onPress={handleReset} disabled={loading}>
              {loading ? <ActivityIndicator color={Colors.coal} /> : <Text style={s.btnGoldText}>LINK SENDEN</Text>}
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity onPress={() => router.back()}>
          <Text style={s.link}>Zurück zur Anmeldung</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, justifyContent: 'center', paddingHorizontal: 24 },
  card: { backgroundColor: Colors.coal2, borderRadius: 20, padding: 24, borderWidth: 1, borderColor: Colors.coal3 },
  iconWrap: { alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '700', color: Colors.ink, textAlign: 'center', marginBottom: 4 },
  sub: { fontSize: 14, color: Colors.ink3, textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  input: { backgroundColor: Colors.coal3, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, color: Colors.ink, fontSize: 15, marginBottom: 12, borderWidth: 1, borderColor: Colors.coal4 },
  error: { color: Colors.red, fontSize: 13, marginBottom: 8, textAlign: 'center' },
  successBox: { backgroundColor: 'rgba(92,184,130,0.15)', borderRadius: 12, padding: 16, marginBottom: 16 },
  successText: { color: Colors.green, fontSize: 14, textAlign: 'center' },
  btnGold: { backgroundColor: Colors.gold, paddingVertical: 16, borderRadius: 14, alignItems: 'center', marginBottom: 16 },
  btnGoldText: { color: Colors.coal, fontSize: 15, fontWeight: '700', letterSpacing: 1 },
  link: { color: Colors.gold, fontSize: 13, textAlign: 'center' },
})
