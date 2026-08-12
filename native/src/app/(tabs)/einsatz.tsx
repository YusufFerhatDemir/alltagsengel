import { useCallback, useState } from 'react'
import { useFocusEffect, useRouter } from 'expo-router'
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import SyncStatusBadge from '../../components/SyncStatusBadge'
import { Card, GhostButton, GoldButton, MutedText } from '../../components/ui'
import { Colors, Fonts } from '../../constants/theme'
import { useAuth } from '../../lib/auth-context'
import { supabase } from '../../lib/supabase'
import { useCaregiverRole } from '../../lib/use-caregiver-role'

// ═══════════════════════════════════════════════════════════
// EINSATZ — Startpunkt für Betreuungskraft-Features
// (Monatsabschluss-Assistent: Leistungsnachweis-Foto, Unterschrift,
// Geo-Check-in/out). Rollen-Gate: nur 'betreuungskraft'/'admin'/
// 'superadmin' sehen Inhalte — sonst Hinweistext (kein Redirect-Loop,
// da der Tab selbst statisch bleibt).
// ═══════════════════════════════════════════════════════════

interface OpenRecord {
  id: string
  date: string
  status: string
  client_id: string | null
  client_name: string
}

export default function EinsatzScreen() {
  const router = useRouter()
  const { session, loading: authLoading } = useAuth()
  const { loading: roleLoading, allowed, caregiverId } = useCaregiverRole()
  const [records, setRecords] = useState<OpenRecord[]>([])
  const [loadingRecords, setLoadingRecords] = useState(false)

  const loadRecords = useCallback(async () => {
    if (!caregiverId) return
    setLoadingRecords(true)
    const { data } = await supabase
      .from('service_records')
      .select('id, date, status, client_id, client:clients(first_name, last_name)')
      .eq('caregiver_id', caregiverId)
      .in('status', ['draft', 'incomplete', 'complete'])
      .order('date', { ascending: false })
      .limit(20)

    setRecords(
      (data || []).map((r: any) => ({
        id: r.id,
        date: r.date,
        status: r.status,
        client_id: r.client_id ?? null,
        client_name: [r.client?.first_name, r.client?.last_name].filter(Boolean).join(' ') || 'Unbekannt',
      }))
    )
    setLoadingRecords(false)
  }, [caregiverId])

  useFocusEffect(
    useCallback(() => {
      if (allowed && caregiverId) loadRecords()
    }, [allowed, caregiverId, loadRecords])
  )

  if (authLoading || roleLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.gold} />
        </View>
      </SafeAreaView>
    )
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.centered}>
          <Text style={styles.title}>Einsatz</Text>
          <MutedText style={styles.hint}>
            Bitte melden Sie sich mit Ihrem Betreuungskraft-Konto an, um diesen Bereich zu nutzen.
          </MutedText>
          <GoldButton onPress={() => router.push('/auth/login')} style={styles.loginBtn}>
            Anmelden
          </GoldButton>
        </View>
      </SafeAreaView>
    )
  }

  if (!allowed) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.centered}>
          <Text style={styles.title}>Einsatz</Text>
          <MutedText style={styles.hint}>
            Dieser Bereich ist Betreuungskräften von Alltagsengel vorbehalten. Falls Sie im Einsatz
            tätig sind und diese Meldung sehen, wenden Sie sich bitte an Alltagsengel.
          </MutedText>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Einsatz</Text>
        <SyncStatusBadge />

        <MutedText style={styles.intro}>
          Offene Leistungsnachweise — Foto, Unterschrift und Standort direkt am Einsatzort erfassen.
        </MutedText>

        {/* Schnellaktionen: neue Leistung + Notizen */}
        <View style={styles.quickRow}>
          <GoldButton onPress={() => router.push('/einsatz/leistung-erfassen')} style={styles.quickBtn}>
            Leistung erfassen
          </GoldButton>
          <GhostButton onPress={() => router.push('/einsatz/notizen')} style={styles.quickBtn}>
            Notizen
          </GhostButton>
        </View>

        {loadingRecords ? (
          <ActivityIndicator color={Colors.gold} style={styles.loadingSpinner} />
        ) : records.length === 0 ? (
          <Card>
            <MutedText>Keine offenen Einsätze gefunden.</MutedText>
          </Card>
        ) : (
          records.map(r => (
            <Card key={r.id} style={styles.recordCard}>
              <Text style={styles.recordClient}>{r.client_name}</Text>
              <Text style={styles.recordDate}>
                {new Date(r.date).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })} · Status: {r.status}
              </Text>
              <View style={styles.actionRow}>
                <GhostButton
                  onPress={() => router.push({ pathname: '/einsatz/zeiterfassung', params: { serviceRecordId: r.id } })}
                  style={styles.actionBtn}
                >
                  Timer
                </GhostButton>
                <GhostButton
                  onPress={() => router.push({ pathname: '/einsatz/check-in', params: { serviceRecordId: r.id } })}
                  style={styles.actionBtn}
                >
                  Check-in/out
                </GhostButton>
                <GhostButton
                  onPress={() =>
                    router.push({ pathname: '/einsatz/leistungsnachweis-scan', params: { serviceRecordId: r.id } })
                  }
                  style={styles.actionBtn}
                >
                  Foto
                </GhostButton>
                <GhostButton
                  onPress={() => router.push({ pathname: '/einsatz/unterschrift', params: { serviceRecordId: r.id } })}
                  style={styles.actionBtn}
                >
                  Unterschrift
                </GhostButton>
                {r.client_id && (
                  <GhostButton
                    onPress={() => router.push({ pathname: '/einsatz/klient', params: { clientId: r.client_id } })}
                    style={styles.actionBtn}
                  >
                    Klienten-Info
                  </GhostButton>
                )}
              </View>
            </Card>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  scroll: { padding: 16, paddingBottom: 40, gap: 14 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 },
  title: { color: Colors.ink, fontFamily: Fonts.bold, fontSize: 26, marginTop: 8, marginBottom: 4 },
  hint: { textAlign: 'center' },
  loginBtn: { marginTop: 12, minWidth: 200 },
  intro: { marginBottom: 4 },
  quickRow: { flexDirection: 'row', gap: 10 },
  quickBtn: { flex: 1 },
  loadingSpinner: { marginTop: 20 },
  recordCard: { gap: 6 },
  recordClient: { color: Colors.ink, fontFamily: Fonts.semibold, fontSize: 16 },
  recordDate: { color: Colors.ink3, fontFamily: Fonts.regular, fontSize: 12 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  actionBtn: { flex: 1, minWidth: 100, paddingVertical: 10 },
})
