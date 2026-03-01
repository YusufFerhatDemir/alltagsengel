import { View, Text, StyleSheet } from 'react-native'
import { Colors } from '@/constants/theme'
import { Ionicons } from '@expo/vector-icons'

export default function ChatScreen() {
  return (
    <View style={s.container}>
      <Text style={s.title}>Nachrichten</Text>
      <View style={s.empty}>
        <Ionicons name="chatbubbles-outline" size={48} color={Colors.ink4} />
        <Text style={s.emptyText}>Noch keine Nachrichten</Text>
        <Text style={s.emptySub}>Nach einer Buchung können Sie hier mit Ihrem Engel chatten.</Text>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, paddingTop: 60, paddingHorizontal: 20 },
  title: { fontSize: 22, fontWeight: '700', color: Colors.ink, marginBottom: 32 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 120 },
  emptyText: { fontSize: 16, fontWeight: '600', color: Colors.ink2, marginTop: 16 },
  emptySub: { fontSize: 13, color: Colors.ink4, textAlign: 'center', marginTop: 8, maxWidth: 240 },
})
