import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { Colors } from '@/constants/theme'
import { Ionicons } from '@expo/vector-icons'

export default function ChooseScreen() {
  const router = useRouter()

  return (
    <View style={s.container}>
      <View style={s.logoWrap}>
        <Ionicons name="heart" size={48} color={Colors.gold} />
      </View>
      <Text style={s.title}>Wie möchten Sie{'\n'}Alltagsengel nutzen?</Text>
      <Text style={s.sub}>Wählen Sie Ihre Rolle, um{'\n'}die passende Erfahrung zu erhalten.</Text>

      <TouchableOpacity style={s.roleCard} onPress={() => router.push({ pathname: '/(auth)/register', params: { role: 'kunde' } })}>
        <View style={s.roleIcon}>
          <Ionicons name="search" size={28} color={Colors.gold} />
        </View>
        <View style={s.roleText}>
          <Text style={s.roleTitle}>Ich suche Hilfe</Text>
          <Text style={s.roleDesc}>Finden Sie zertifizierte Alltagsbegleiter in Ihrer Nähe. Versichert & §45b-fähig.</Text>
        </View>
        <Text style={s.roleArr}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity style={s.roleCard} onPress={() => router.push({ pathname: '/(auth)/register', params: { role: 'engel' } })}>
        <View style={s.roleIcon}>
          <Ionicons name="heart" size={28} color={Colors.gold} />
        </View>
        <View style={s.roleText}>
          <Text style={s.roleTitle}>Ich bin ein Engel</Text>
          <Text style={s.roleDesc}>Zertifiziert · Selbständig · Bundesweit Aufträge. Versicherungsschutz über Alltagsengel.</Text>
        </View>
        <Text style={s.roleArr}>›</Text>
      </TouchableOpacity>

      <Text style={s.legal}>
        Mit Nutzung stimmen Sie den AGB & Datenschutzerklärung zu.
      </Text>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, paddingHorizontal: 24, justifyContent: 'center' },
  logoWrap: { alignItems: 'center', marginBottom: 28 },
  title: { fontSize: 24, fontWeight: '700', color: Colors.ink, textAlign: 'center', lineHeight: 32, marginBottom: 8 },
  sub: { fontSize: 14, color: Colors.ink3, textAlign: 'center', lineHeight: 20, marginBottom: 32 },
  roleCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.coal2, borderRadius: 16, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: Colors.coal3 },
  roleIcon: { width: 52, height: 52, borderRadius: 14, backgroundColor: 'rgba(201,150,60,0.1)', justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  roleText: { flex: 1 },
  roleTitle: { fontSize: 16, fontWeight: '600', color: Colors.ink, marginBottom: 4 },
  roleDesc: { fontSize: 12, color: Colors.ink3, lineHeight: 17 },
  roleArr: { fontSize: 28, color: Colors.gold, marginLeft: 8 },
  legal: { fontSize: 11, color: Colors.ink4, textAlign: 'center', marginTop: 24 },
})
