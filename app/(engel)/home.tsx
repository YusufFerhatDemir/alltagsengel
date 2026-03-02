import { useState, useEffect } from 'react'
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { Colors } from '@/constants/theme'
import { Ionicons } from '@expo/vector-icons'

export default function EngelHomeScreen() {
  const router = useRouter()
  const [isOnline, setIsOnline] = useState(true)
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<any>(null)
  const [angel, setAngel] = useState<any>(null)
  const [pendingBookings, setPendingBookings] = useState<any[]>([])
  const [upcomingBookings, setUpcomingBookings] = useState<any[]>([])
  const [monthEarnings, setMonthEarnings] = useState(0)

  useEffect(() => {
    async function loadData() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setLoading(false); return }
        const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
        const { data: a } = await supabase.from('angels').select('*').eq('id', user.id).single()
        setProfile(p)
        setAngel(a)
        if (a) setIsOnline(a.is_online)

        const { data: pending } = await supabase.from('bookings').select('*, customer:profiles!bookings_customer_id_fkey(first_name, last_name)')
          .eq('angel_id', user.id).eq('status', 'pending').order('created_at', { ascending: false })
        setPendingBookings(pending || [])

        const { data: upcoming } = await supabase.from('bookings').select('*, customer:profiles!bookings_customer_id_fkey(first_name, last_name)')
          .eq('angel_id', user.id).eq('status', 'accepted').order('date', { ascending: true })
        setUpcomingBookings(upcoming || [])

        const now = new Date()
        const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
        const { data: completed } = await supabase.from('bookings').select('total_amount')
          .eq('angel_id', user.id).eq('status', 'completed').gte('date', monthStart)
        setMonthEarnings((completed || []).reduce((sum, b) => sum + (b.total_amount || 0), 0))
      } catch (err) {
        console.error('Load error:', err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  async function toggleOnline() {
    const next = !isOnline
    setIsOnline(next)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) await supabase.from('angels').update({ is_online: next }).eq('id', user.id)
  }

  async function handleBooking(id: string, action: 'accepted' | 'declined') {
    await supabase.from('bookings').update({ status: action }).eq('id', id)
    setPendingBookings(prev => prev.filter(b => b.id !== id))
  }

  const name = profile ? `${profile.first_name} ${profile.last_name}` : '...'

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View style={s.topRow}>
          <View style={s.logoRow}>
            <Ionicons name="heart" size={22} color={Colors.gold} />
            <Text style={s.wordmark}>ENGEL</Text>
          </View>
          <TouchableOpacity style={s.onlineToggle} onPress={toggleOnline}>
            <View style={[s.dot, isOnline ? s.dotOn : s.dotOff]} />
            <Text style={s.onlineLabel}>{isOnline ? 'Online' : 'Offline'}</Text>
          </TouchableOpacity>
        </View>
        <Text style={s.greet}>Willkommen zurück</Text>
        <Text style={s.name}>{name}</Text>
        <View style={s.stats}>
          <View style={s.stat}><Text style={s.statVal}>{monthEarnings.toFixed(0)}€</Text><Text style={s.statLbl}>Diesen Monat</Text></View>
          <View style={s.stat}><Text style={s.statVal}>{angel?.total_jobs || 0}</Text><Text style={s.statLbl}>Einsätze</Text></View>
          <View style={s.stat}><Text style={s.statVal}>{angel?.rating?.toFixed(1) || '5.0'}</Text><Text style={s.statLbl}>Bewertung</Text></View>
        </View>
      </View>

      <ScrollView style={s.body} showsVerticalScrollIndicator={false}>
        <Text style={s.sectionLabel}>Neue Anfragen</Text>
        {pendingBookings.length === 0 ? (
          <Text style={s.emptyText}>Keine neuen Anfragen</Text>
        ) : pendingBookings.map(b => (
          <View key={b.id} style={s.reqCard}>
            <View style={s.reqBadge}><Text style={s.reqBadgeText}>NEU</Text></View>
            <View style={s.reqTop}>
              <View style={s.reqAv}><Ionicons name="person" size={18} color={Colors.gold} /></View>
              <View><Text style={s.reqName}>{b.customer?.first_name} {b.customer?.last_name}</Text><Text style={s.reqType}>{b.service}</Text></View>
            </View>
            <View style={s.reqGrid}>
              <View style={s.reqInfo}><Text style={s.reqInfoLbl}>Datum</Text><Text style={s.reqInfoVal}>{new Date(b.date).toLocaleDateString('de-DE')}</Text></View>
              <View style={s.reqInfo}><Text style={s.reqInfoLbl}>Uhrzeit</Text><Text style={s.reqInfoVal}>{b.time?.slice(0, 5)}</Text></View>
              <View style={s.reqInfo}><Text style={s.reqInfoLbl}>Dauer</Text><Text style={s.reqInfoVal}>{b.duration_hours} Std.</Text></View>
              <View style={s.reqInfo}><Text style={s.reqInfoLbl}>Vergütung</Text><Text style={s.reqInfoVal}>{b.total_amount?.toFixed(2)}€</Text></View>
            </View>
            <View style={s.reqBtns}>
              <TouchableOpacity style={s.declineBtn} onPress={() => handleBooking(b.id, 'declined')}><Text style={s.declineText}>Ablehnen</Text></TouchableOpacity>
              <TouchableOpacity style={s.acceptBtn} onPress={() => handleBooking(b.id, 'accepted')}><Text style={s.acceptText}>Annehmen</Text></TouchableOpacity>
            </View>
          </View>
        ))}

        <Text style={[s.sectionLabel, { marginTop: 22 }]}>Kommende Einsätze</Text>
        {upcomingBookings.length === 0 ? (
          <Text style={s.emptyText}>Keine kommenden Einsätze</Text>
        ) : upcomingBookings.map(b => (
          <View key={b.id} style={s.upcomingItem}>
            <View style={s.upAv}><Ionicons name="person" size={18} color={Colors.gold} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.upName}>{b.customer?.first_name} {b.customer?.last_name}</Text>
              <Text style={s.upSub}>{b.service} · {new Date(b.date).toLocaleDateString('de-DE')}, {b.time?.slice(0, 5)}</Text>
            </View>
            <View><Text style={s.upPrice}>{b.total_amount?.toFixed(2)}€</Text><Text style={s.upStatus}>Bestätigt</Text></View>
          </View>
        ))}
        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { backgroundColor: Colors.coal2, paddingHorizontal: 20, paddingTop: 60, paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: Colors.coal3 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wordmark: { fontSize: 16, fontWeight: '700', color: Colors.gold, letterSpacing: 2 },
  onlineToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.coal3, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotOn: { backgroundColor: Colors.green },
  dotOff: { backgroundColor: Colors.ink4 },
  onlineLabel: { fontSize: 13, color: Colors.ink2, fontWeight: '500' },
  greet: { fontSize: 13, color: Colors.ink3 },
  name: { fontSize: 22, fontWeight: '700', color: Colors.ink, marginBottom: 14 },
  stats: { flexDirection: 'row', gap: 0 },
  stat: { flex: 1, alignItems: 'center', paddingVertical: 10, backgroundColor: Colors.coal3, borderRadius: 10, marginHorizontal: 3 },
  statVal: { fontSize: 18, fontWeight: '700', color: Colors.gold },
  statLbl: { fontSize: 10, color: Colors.ink4, marginTop: 2 },
  body: { flex: 1, paddingHorizontal: 16 },
  sectionLabel: { fontSize: 16, fontWeight: '700', color: Colors.ink, marginTop: 18, marginBottom: 10 },
  emptyText: { textAlign: 'center', padding: 20, color: Colors.ink4, fontSize: 14 },
  reqCard: { backgroundColor: Colors.coal2, borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: Colors.gold },
  reqBadge: { position: 'absolute', top: 12, right: 12, backgroundColor: Colors.gold, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  reqBadgeText: { fontSize: 10, fontWeight: '700', color: Colors.coal },
  reqTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  reqAv: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(201,150,60,0.1)', justifyContent: 'center', alignItems: 'center' },
  reqName: { fontSize: 15, fontWeight: '600', color: Colors.ink },
  reqType: { fontSize: 12, color: Colors.ink3 },
  reqGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  reqInfo: { width: '47%', backgroundColor: Colors.coal3, borderRadius: 8, padding: 10 },
  reqInfoLbl: { fontSize: 10, color: Colors.ink4 },
  reqInfoVal: { fontSize: 14, fontWeight: '600', color: Colors.ink, marginTop: 2 },
  reqBtns: { flexDirection: 'row', gap: 10 },
  declineBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: Colors.red, alignItems: 'center' },
  declineText: { color: Colors.red, fontWeight: '600', fontSize: 14 },
  acceptBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: Colors.green, alignItems: 'center' },
  acceptText: { color: Colors.coal, fontWeight: '600', fontSize: 14 },
  upcomingItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.coal2, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: Colors.coal3 },
  upAv: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(201,150,60,0.1)', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  upName: { fontSize: 14, fontWeight: '600', color: Colors.ink },
  upSub: { fontSize: 12, color: Colors.ink3, marginTop: 2 },
  upPrice: { fontSize: 15, fontWeight: '700', color: Colors.gold, textAlign: 'right' },
  upStatus: { fontSize: 11, color: Colors.green, textAlign: 'right', marginTop: 2 },
})
