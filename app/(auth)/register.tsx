import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { Colors } from '@/constants/theme'
import { Ionicons } from '@expo/vector-icons'

export default function RegisterScreen() {
  const router = useRouter()
  const { role = 'kunde' } = useLocalSearchParams<{ role: string }>()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [plz, setPlz] = useState('')
  const [stadt, setStadt] = useState('')
  const [pflegegrad, setPflegegrad] = useState(0)
  const [homeCare, setHomeCare] = useState(true)
  const [pflegehilfsmittel, setPflegehilfsmittel] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    setLoading(true)
    setError('')

    try {
      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { first_name: firstName, last_name: lastName, role },
        },
      })

      if (authError) {
        if (authError.message.includes('already registered')) {
          setError('Diese E-Mail ist bereits registriert.')
        } else if (authError.message.includes('valid email')) {
          setError('Bitte geben Sie eine gültige E-Mail-Adresse ein.')
        } else if (authError.message.includes('at least')) {
          setError('Das Passwort muss mindestens 6 Zeichen lang sein.')
        } else {
          setError(authError.message)
        }
        setLoading(false)
        return
      }

      if (data.user && data.session) {
        const profileData: Record<string, any> = {
          id: data.user.id, role, first_name: firstName, last_name: lastName, email,
        }
        if (plz || stadt) profileData.location = [plz, stadt].filter(Boolean).join(' ')
        await supabase.from('profiles').upsert(profileData)

        if (role === 'kunde') {
          await supabase.from('care_eligibility').upsert({
            user_id: data.user.id, pflegegrad, home_care: homeCare,
            insurance_type: 'unknown', pflegehilfsmittel_interest: pflegehilfsmittel,
          })
          router.replace('/(kunde)/home')
        } else {
          router.replace('/(engel)/home')
        }
        return
      }

      router.push('/(auth)/login')
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
          <Ionicons name="heart" size={32} color={Colors.gold} />
        </View>
        <Text style={s.title}>Konto erstellen</Text>
        <Text style={s.sub}>{role === 'kunde' ? 'Als Kunde registrieren' : 'Als Engel registrieren'}</Text>

        <View style={s.row}>
          <TextInput style={[s.input, s.halfInput]} placeholder="Vorname" placeholderTextColor={Colors.ink4} value={firstName} onChangeText={setFirstName} />
          <TextInput style={[s.input, s.halfInput]} placeholder="Nachname" placeholderTextColor={Colors.ink4} value={lastName} onChangeText={setLastName} />
        </View>
        <TextInput style={s.input} placeholder="E-Mail-Adresse" placeholderTextColor={Colors.ink4} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        <TextInput style={s.input} placeholder="Passwort (min. 6 Zeichen)" placeholderTextColor={Colors.ink4} value={password} onChangeText={setPassword} secureTextEntry />

        {role === 'kunde' && (
          <>
            <View style={s.row}>
              <TextInput style={[s.input, { width: 100 }]} placeholder="PLZ" placeholderTextColor={Colors.ink4} value={plz} onChangeText={t => setPlz(t.replace(/\D/g, '').slice(0, 5))} keyboardType="number-pad" maxLength={5} />
              <TextInput style={[s.input, { flex: 1 }]} placeholder="Stadt" placeholderTextColor={Colors.ink4} value={stadt} onChangeText={setStadt} />
            </View>

            <Text style={s.sectionTitle}>Pflegegrad</Text>
            <View style={s.toggleRow}>
              {[0, 1, 2, 3, 4, 5].map(g => (
                <TouchableOpacity key={g} style={[s.toggleBtn, pflegegrad === g && s.toggleActive]} onPress={() => setPflegegrad(g)}>
                  <Text style={[s.toggleText, pflegegrad === g && s.toggleTextActive]}>{g === 0 ? 'Kein' : `${g}`}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={s.switchRow}>
              <Text style={s.switchLabel}>Pflege zu Hause?</Text>
              <TouchableOpacity style={[s.switch, homeCare && s.switchOn]} onPress={() => setHomeCare(!homeCare)}>
                <View style={[s.switchKnob, homeCare && s.switchKnobOn]} />
              </TouchableOpacity>
            </View>

            {pflegegrad >= 1 && homeCare && (
              <View style={s.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.switchLabel}>Pflegehilfsmittel (bis 42 €/Monat)</Text>
                  <Text style={s.switchDesc}>Handschuhe, Desinfektion, Masken u.v.m.</Text>
                </View>
                <TouchableOpacity style={[s.switch, pflegehilfsmittel && s.switchOn]} onPress={() => setPflegehilfsmittel(!pflegehilfsmittel)}>
                  <View style={[s.switchKnob, pflegehilfsmittel && s.switchKnobOn]} />
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

        {error ? <Text style={s.error}>{error}</Text> : null}

        <TouchableOpacity style={s.btnGold} onPress={handleSubmit} disabled={loading}>
          {loading ? <ActivityIndicator color={Colors.coal} /> : <Text style={s.btnGoldText}>REGISTRIEREN</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push('/(auth)/login')}>
          <Text style={s.link}>Bereits ein Konto? <Text style={s.linkBold}>Anmelden</Text></Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: Colors.bg },
  container: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 40 },
  card: { backgroundColor: Colors.coal2, borderRadius: 20, padding: 24, borderWidth: 1, borderColor: Colors.coal3 },
  iconWrap: { alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '700', color: Colors.ink, textAlign: 'center', marginBottom: 4 },
  sub: { fontSize: 14, color: Colors.ink3, textAlign: 'center', marginBottom: 20 },
  row: { flexDirection: 'row', gap: 10 },
  input: { backgroundColor: Colors.coal3, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, color: Colors.ink, fontSize: 15, marginBottom: 12, borderWidth: 1, borderColor: Colors.coal4 },
  halfInput: { flex: 1 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: Colors.ink2, marginBottom: 8, marginTop: 4 },
  toggleRow: { flexDirection: 'row', gap: 6, marginBottom: 16 },
  toggleBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: Colors.coal4, alignItems: 'center' },
  toggleActive: { borderColor: Colors.gold, backgroundColor: 'rgba(201,150,60,0.15)' },
  toggleText: { color: Colors.ink3, fontSize: 13, fontWeight: '600' },
  toggleTextActive: { color: Colors.gold },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  switchLabel: { color: Colors.ink2, fontSize: 14, fontWeight: '500' },
  switchDesc: { color: Colors.ink4, fontSize: 12, marginTop: 2 },
  switch: { width: 48, height: 28, borderRadius: 14, backgroundColor: Colors.coal4, justifyContent: 'center', paddingHorizontal: 2 },
  switchOn: { backgroundColor: Colors.gold },
  switchKnob: { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.ink3 },
  switchKnobOn: { backgroundColor: Colors.coal, alignSelf: 'flex-end' },
  error: { color: Colors.red, fontSize: 13, marginBottom: 8, textAlign: 'center' },
  btnGold: { backgroundColor: Colors.gold, paddingVertical: 16, borderRadius: 14, alignItems: 'center', marginTop: 8, marginBottom: 16 },
  btnGoldText: { color: Colors.coal, fontSize: 15, fontWeight: '700', letterSpacing: 1 },
  link: { color: Colors.ink3, fontSize: 13, textAlign: 'center' },
  linkBold: { color: Colors.gold, fontWeight: '600' },
})
