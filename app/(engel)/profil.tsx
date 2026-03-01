import { useState, useEffect } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { Colors } from '@/constants/theme'
import { Ionicons } from '@expo/vector-icons'

export default function EngelProfilScreen() {
  const router = useRouter()
  const [profile, setProfile] = useState<any>(null)

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

  async function handleLogout() {
    await supabase.auth.signOut()
    router.replace('/')
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <Text style={s.title}>Mein Profil</Text>
      <View style={s.avatarWrap}>
        <View style={s.avatar}><Ionicons name="heart" size={36} color={Colors.gold} /></View>
        <Text style={s.name}>{profile?.first_name || ''} {profile?.last_name || ''}</Text>
        <Text style={s.email}>{profile?.email || ''}</Text>
      </View>
      <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
        <Ionicons name="log-out" size={18} color={Colors.red} />
        <Text style={s.logoutText}>Abmelden</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  content: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '700', color: Colors.ink, marginBottom: 24 },
  avatarWrap: { alignItems: 'center', marginBottom: 28 },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(201,150,60,0.1)', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  name: { fontSize: 20, fontWeight: '700', color: Colors.ink },
  email: { fontSize: 13, color: Colors.ink3, marginTop: 2 },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, borderRadius: 14, borderWidth: 1, borderColor: Colors.red },
  logoutText: { fontSize: 15, color: Colors.red, fontWeight: '600' },
})
