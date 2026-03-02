import { useState, useEffect } from 'react'
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { Colors } from '@/constants/theme'
import { Ionicons } from '@expo/vector-icons'

const categories = [
  { key: 'all', icon: 'star', label: 'Alle' },
  { key: 'begleitung', icon: 'people', label: 'Begleitung' },
  { key: 'arzt', icon: 'medkit', label: 'Arztbesuch' },
  { key: 'einkauf', icon: 'bag', label: 'Einkauf' },
  { key: 'haushalt', icon: 'home', label: 'Haushalt' },
  { key: 'freizeit', icon: 'cafe', label: 'Freizeit' },
  { key: 'apotheke', icon: 'medical', label: 'Apotheke' },
  { key: 'spazieren', icon: 'walk', label: 'Spazieren' },
  { key: 'aktivitaeten', icon: 'fitness', label: 'Aktivitäten' },
] as const

const serviceMap: Record<string, string> = {
  begleitung: 'Begleitung', arzt: 'Arztbesuch', einkauf: 'Einkauf', haushalt: 'Haushalt',
  freizeit: 'Freizeit', apotheke: 'Apotheke', spazieren: 'Spazieren', aktivitaeten: 'Aktivitäten',
}

const demoAngels = [
  { id: 'demo-anna', name: 'Anna Müller', rating: 4.9, jobs: 127, services: ['Begleitung', 'Einkauf', 'Haushalt'], price: 32, online: true, is45b: true },
  { id: 'demo-thomas', name: 'Thomas Weber', rating: 4.8, jobs: 89, services: ['Arztbesuch', 'Begleitung', 'Spazieren'], price: 28, online: true, is45b: true },
  { id: 'demo-lisa', name: 'Lisa Schneider', rating: 4.7, jobs: 56, services: ['Freizeit', 'Haushalt', 'Apotheke'], price: 30, online: false, is45b: true },
]

export default function KundeHomeScreen() {
  const router = useRouter()
  const [profile, setProfile] = useState<any>(null)
  const [activeCategory, setActiveCategory] = useState('all')
  const [searchRadius, setSearchRadius] = useState(10)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
        setProfile(p)
      }
    }
    load()
  }, [])

  const firstName = profile?.first_name || 'Benutzer'

  const filtered = demoAngels.filter(a => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      if (!a.name.toLowerCase().includes(q) && !a.services.join(' ').toLowerCase().includes(q)) return false
    }
    if (activeCategory !== 'all') {
      if (!a.services.some(s => s.toLowerCase().includes(serviceMap[activeCategory]?.toLowerCase() || activeCategory))) return false
    }
    return true
  })

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View style={s.headerRow}>
          <View>
            <Text style={s.greet}>Willkommen zurück</Text>
            <Text style={s.name}>Hallo, {firstName}</Text>
            <View style={s.locRow}>
              <Ionicons name="location" size={14} color={Colors.gold} />
              <Text style={s.locText}>{profile?.location || 'Frankfurt am Main'} · {searchRadius} km</Text>
            </View>
          </View>
          <TouchableOpacity style={s.avatar} onPress={() => router.push('/(kunde)/profil')}>
            <Ionicons name="person" size={22} color={Colors.gold} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={s.body} showsVerticalScrollIndicator={false}>
        <View style={s.searchBar}>
          <Ionicons name="search" size={16} color={Colors.ink4} />
          <TextInput style={s.searchInput} placeholder="Engel suchen..." placeholderTextColor={Colors.ink4} value={searchQuery} onChangeText={setSearchQuery} />
          {searchQuery ? <TouchableOpacity onPress={() => setSearchQuery('')}><Text style={s.searchClear}>✕</Text></TouchableOpacity> : null}
        </View>

        <View style={s.radiusRow}>
          <View style={s.radiusLabel}><Ionicons name="location" size={13} color={Colors.ink3} /><Text style={s.radiusText}>Suchradius</Text></View>
          <View style={s.radiusChips}>
            {[5, 10, 25, 50].map(r => (
              <TouchableOpacity key={r} style={[s.radiusChip, searchRadius === r && s.radiusChipActive]} onPress={() => setSearchRadius(r)}>
                <Text style={[s.radiusChipText, searchRadius === r && s.radiusChipTextActive]}>{r} km</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.catScroll} contentContainerStyle={s.catRow}>
          {categories.map(cat => (
            <TouchableOpacity key={cat.key} style={[s.catItem, activeCategory === cat.key && s.catItemActive]} onPress={() => setActiveCategory(cat.key)}>
              <Ionicons name={cat.icon as any} size={22} color={activeCategory === cat.key ? Colors.gold : Colors.ink4} />
              <Text style={[s.catLabel, activeCategory === cat.key && s.catLabelActive]}>{cat.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={s.banner}>
          <View style={s.bannerRow}>
            <Ionicons name="card" size={22} color={Colors.gold} />
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text style={s.bannerTitle}>§45b Entlastungsbetrag</Text>
              <Text style={s.bannerSub}>Bis zu 131€/Monat über Ihre Pflegekasse.</Text>
            </View>
          </View>
        </View>

        <Text style={s.sectionTitle}>
          {activeCategory === 'all' ? 'Top Engel' : categories.find(c => c.key === activeCategory)?.label || 'Engel'}
        </Text>

        {filtered.map(angel => (
          <TouchableOpacity key={angel.id} style={s.engelCard} activeOpacity={0.7}>
            <View style={[s.engelAvatar, angel.online && s.engelAvatarOnline]}>
              <Ionicons name="heart" size={24} color={Colors.gold} />
              <View style={[s.onlineDot, angel.online ? s.dotOnline : s.dotOffline]} />
            </View>
            <View style={s.engelInfo}>
              <View style={s.engelRow1}>
                <Text style={s.engelName}>{angel.name}</Text>
                <View style={s.ratingRow}><Ionicons name="star" size={13} color={Colors.gold} /><Text style={s.ratingText}>{angel.rating}</Text></View>
              </View>
              <Text style={s.engelCert}>✓ Zertifiziert · {angel.jobs} Einsätze</Text>
              <View style={s.tagRow}>
                {angel.services.slice(0, 3).map(t => <View key={t} style={s.tag}><Text style={s.tagText}>{t}</Text></View>)}
              </View>
              <View style={s.priceRow}>
                <Text style={s.price}>{angel.price}€ <Text style={s.priceUnit}>/Std.</Text></Text>
                {angel.is45b && <View style={s.badge45b}><Ionicons name="card" size={11} color={Colors.gold} /><Text style={s.badge45bText}>§45b</Text></View>}
              </View>
            </View>
          </TouchableOpacity>
        ))}

        {filtered.length === 0 && (
          <Text style={s.empty}>Keine Engel für diese Kategorie gefunden.</Text>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { backgroundColor: Colors.coal2, paddingHorizontal: 20, paddingTop: 60, paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: Colors.coal3 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  greet: { fontSize: 13, color: Colors.ink3, marginBottom: 2 },
  name: { fontSize: 22, fontWeight: '700', color: Colors.ink, marginBottom: 4 },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  locText: { fontSize: 12, color: Colors.ink3 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(201,150,60,0.1)', justifyContent: 'center', alignItems: 'center' },
  body: { flex: 1, paddingHorizontal: 16 },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.coal2, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginTop: 16, borderWidth: 1, borderColor: Colors.coal3 },
  searchInput: { flex: 1, marginLeft: 8, color: Colors.ink, fontSize: 14 },
  searchClear: { color: Colors.ink4, fontSize: 16, padding: 4 },
  radiusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 },
  radiusLabel: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  radiusText: { fontSize: 12, color: Colors.ink3 },
  radiusChips: { flexDirection: 'row', gap: 6 },
  radiusChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: Colors.coal4 },
  radiusChipActive: { borderColor: Colors.gold, backgroundColor: 'rgba(201,150,60,0.12)' },
  radiusChipText: { fontSize: 12, color: Colors.ink4 },
  radiusChipTextActive: { color: Colors.gold },
  catScroll: { marginTop: 16 },
  catRow: { gap: 12, paddingRight: 16 },
  catItem: { alignItems: 'center', width: 64, paddingVertical: 10, borderRadius: 12, backgroundColor: Colors.coal2 },
  catItemActive: { backgroundColor: 'rgba(201,150,60,0.12)', borderWidth: 1, borderColor: Colors.gold },
  catLabel: { fontSize: 10, color: Colors.ink4, marginTop: 4 },
  catLabelActive: { color: Colors.gold },
  banner: { backgroundColor: Colors.coal2, borderRadius: 14, padding: 16, marginTop: 18, borderWidth: 1, borderColor: Colors.coal3 },
  bannerRow: { flexDirection: 'row', alignItems: 'center' },
  bannerTitle: { fontSize: 14, fontWeight: '600', color: Colors.ink, marginBottom: 2 },
  bannerSub: { fontSize: 12, color: Colors.ink3 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.ink, marginTop: 20, marginBottom: 12 },
  engelCard: { flexDirection: 'row', backgroundColor: Colors.coal2, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: Colors.coal3 },
  engelAvatar: { width: 56, height: 56, borderRadius: 16, backgroundColor: 'rgba(201,150,60,0.1)', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  engelAvatarOnline: { borderWidth: 1.5, borderColor: Colors.green },
  onlineDot: { position: 'absolute', bottom: 2, right: 2, width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: Colors.coal2 },
  dotOnline: { backgroundColor: Colors.green },
  dotOffline: { backgroundColor: Colors.ink4 },
  engelInfo: { flex: 1 },
  engelRow1: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 },
  engelName: { fontSize: 15, fontWeight: '600', color: Colors.ink },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ratingText: { fontSize: 13, fontWeight: '600', color: Colors.gold },
  engelCert: { fontSize: 11, color: Colors.ink3, marginBottom: 6 },
  tagRow: { flexDirection: 'row', gap: 5, marginBottom: 6 },
  tag: { backgroundColor: Colors.coal3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  tagText: { fontSize: 10, color: Colors.ink2 },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  price: { fontSize: 16, fontWeight: '700', color: Colors.gold },
  priceUnit: { fontSize: 12, fontWeight: '400', color: Colors.ink4 },
  badge45b: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(201,150,60,0.12)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badge45bText: { fontSize: 11, color: Colors.gold, fontWeight: '600' },
  empty: { textAlign: 'center', padding: 32, color: Colors.ink4, fontSize: 14 },
})
