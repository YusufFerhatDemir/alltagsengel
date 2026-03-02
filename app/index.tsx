import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { Colors } from '@/constants/theme'
import { Ionicons } from '@expo/vector-icons'

export default function SplashScreen() {
  const router = useRouter()

  return (
    <View style={s.container}>
      <View style={s.glow} />

      <View style={s.inner}>
        <View style={s.iconWrap}>
          <Ionicons name="heart" size={64} color={Colors.gold} />
        </View>
        <Text style={s.word}>ALLTAGSENGEL</Text>
        <Text style={s.tag}>Mit Herz für dich da</Text>
        <Text style={s.sub}>Premium Alltagsbegleitung</Text>

        <View style={s.divider} />

        <TouchableOpacity style={s.btnGold} onPress={() => router.push('/choose')}>
          <Text style={s.btnGoldText}>JETZT STARTEN</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.btnGhost} onPress={() => router.push('/(auth)/login')}>
          <Text style={s.btnGhostText}>Ich habe bereits ein Konto</Text>
        </TouchableOpacity>
      </View>

      <View style={s.trust}>
        <View style={s.trustRow}>
          <View style={s.trustItem}>
            <Text style={s.trustVal}>100%</Text>
            <Text style={s.trustLbl}>Versichert</Text>
          </View>
          <View style={s.trustSep} />
          <View style={s.trustItem}>
            <Text style={s.trustVal}>§45b</Text>
            <Text style={s.trustLbl}>Integriert</Text>
          </View>
          <View style={s.trustSep} />
          <View style={s.trustItem}>
            <Text style={s.trustVal}>24/7</Text>
            <Text style={s.trustLbl}>Verfügbar</Text>
          </View>
        </View>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, justifyContent: 'center', alignItems: 'center' },
  glow: { position: 'absolute', top: '30%', width: 300, height: 300, borderRadius: 150, backgroundColor: 'rgba(201,150,60,0.08)' },
  inner: { alignItems: 'center', paddingHorizontal: 32 },
  iconWrap: { width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(201,150,60,0.1)', justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  word: { fontSize: 32, fontWeight: '700', color: Colors.ink, letterSpacing: 4, marginBottom: 8 },
  tag: { fontSize: 16, color: Colors.gold, marginBottom: 4 },
  sub: { fontSize: 13, color: Colors.ink3, marginBottom: 24 },
  divider: { width: 40, height: 2, backgroundColor: Colors.gold, marginBottom: 32, borderRadius: 1 },
  btnGold: { width: '100%', backgroundColor: Colors.gold, paddingVertical: 16, borderRadius: 14, alignItems: 'center', marginBottom: 12 },
  btnGoldText: { color: Colors.coal, fontSize: 15, fontWeight: '700', letterSpacing: 1 },
  btnGhost: { width: '100%', borderWidth: 1, borderColor: Colors.gold, paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  btnGhostText: { color: Colors.gold, fontSize: 14, fontWeight: '500' },
  trust: { position: 'absolute', bottom: 50, left: 0, right: 0 },
  trustRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 20 },
  trustItem: { alignItems: 'center' },
  trustVal: { fontSize: 18, fontWeight: '700', color: Colors.gold },
  trustLbl: { fontSize: 11, color: Colors.ink3, marginTop: 2 },
  trustSep: { width: 1, height: 28, backgroundColor: Colors.coal4 },
})
