import { useState } from 'react'
import * as Location from 'expo-location'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { BodyText, Card, GhostButton, GoldButton, MutedText } from '../../components/ui'
import { API_BASE } from '../../constants/config'
import { Colors, Fonts } from '../../constants/theme'
import { enqueueAction } from '../../lib/offline-queue'
import { supabase } from '../../lib/supabase'

// ═══════════════════════════════════════════════════════════
// CHECK-IN / CHECK-OUT — EINMAL-GPS-Messung (kein Dauertracking).
// Fragt nur Vordergrund-Berechtigung an (niemals "Always"/Hintergrund).
// Bei Fehlschlag der Server-Anfrage: Offline-Queue statt Fehlerdialog.
// ═══════════════════════════════════════════════════════════

type EventType = 'check_in' | 'check_out'

interface GeoResult {
  distance_to_client_m: number | null
  within_radius: boolean | null
  radius_m: number
}

export default function CheckInScreen() {
  const router = useRouter()
  const { serviceRecordId } = useLocalSearchParams<{ serviceRecordId: string }>()
  const [loading, setLoading] = useState<EventType | null>(null)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ type: EventType; geo: GeoResult; offline: boolean } | null>(null)

  async function logEvent(eventType: EventType) {
    setError('')
    setResult(null)
    setLoading(eventType)

    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        setError('Standortzugriff wurde nicht erlaubt. Bitte in den Einstellungen aktivieren.')
        setLoading(null)
        return
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      })

      const payload = {
        service_record_id: serviceRecordId,
        event_type: eventType,
        gps_lat: position.coords.latitude,
        gps_lng: position.coords.longitude,
        accuracy_m: position.coords.accuracy ?? null,
      }

      const {
        data: { session },
      } = await supabase.auth.getSession()

      try {
        const res = await fetch(`${API_BASE}/api/native/geo-events`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token ?? ''}`,
          },
          body: JSON.stringify(payload),
        })

        if (!res.ok) throw new Error('request-failed')

        const json = await res.json()
        setResult({
          type: eventType,
          offline: false,
          geo: {
            distance_to_client_m: json.distance_to_client_m,
            within_radius: json.within_radius,
            radius_m: json.radius_m,
          },
        })
      } catch {
        // Netzwerkfehler → in Offline-Queue puffern, App nicht blockieren
        await enqueueAction('geo_event', payload)
        setResult({ type: eventType, offline: true, geo: { distance_to_client_m: null, within_radius: null, radius_m: 150 } })
      }
    } catch (err) {
      console.warn('Geo-Check-in Fehler:', err)
      setError('Standort konnte nicht ermittelt werden. Bitte GPS aktivieren und erneut versuchen.')
    } finally {
      setLoading(null)
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Einsatzort bestätigen</Text>
        <BodyText style={styles.intro}>
          Erfassen Sie einmalig Ihren Standort beim Beginn und Ende des Einsatzes. Es findet keine
          fortlaufende Standortverfolgung statt.
        </BodyText>

        <Card>
          <View style={styles.buttonRow}>
            <GoldButton onPress={() => logEvent('check_in')} loading={loading === 'check_in'} style={styles.btn}>
              Einsatz starten
            </GoldButton>
            <GhostButton onPress={() => logEvent('check_out')} style={styles.btn}>
              Einsatz beenden
            </GhostButton>
          </View>

          {error !== '' && <Text style={styles.error}>{error}</Text>}

          {result && (
            <View style={styles.resultBox}>
              {result.offline ? (
                <Text style={styles.offlineText}>
                  Kein Netz — {result.type === 'check_in' ? 'Check-in' : 'Check-out'} wurde lokal
                  gespeichert und wird automatisch synchronisiert, sobald wieder Internet verfügbar ist.
                </Text>
              ) : result.geo.within_radius === false ? (
                <Text style={styles.warnText}>
                  Achtung: Sie befinden sich außerhalb des erwarteten Einsatzortes (
                  {result.geo.distance_to_client_m} m entfernt). Der Standort wurde trotzdem erfasst und
                  wird vom Büro geprüft.
                </Text>
              ) : (
                <Text style={styles.okText}>
                  {result.type === 'check_in' ? 'Check-in' : 'Check-out'} erfolgreich erfasst
                  {result.geo.distance_to_client_m != null ? ` (${result.geo.distance_to_client_m} m vom Einsatzort)` : ''}.
                </Text>
              )}
            </View>
          )}
        </Card>

        <MutedText style={styles.footer}>
          Standortdaten werden nur ereignisbezogen (Check-in/Check-out) erfasst — keine
          Hintergrundverfolgung.
        </MutedText>

        <GhostButton onPress={() => router.back()} style={styles.closeBtn}>
          Schließen
        </GhostButton>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  scroll: { padding: 20, paddingTop: 28, gap: 16 },
  title: { color: Colors.ink, fontFamily: Fonts.bold, fontSize: 24 },
  intro: {},
  buttonRow: { gap: 10 },
  btn: { width: '100%' },
  error: { color: Colors.red, fontFamily: Fonts.regular, fontSize: 13, marginTop: 12 },
  resultBox: { marginTop: 14 },
  okText: { color: Colors.green, fontFamily: Fonts.medium, fontSize: 14, lineHeight: 20 },
  warnText: { color: Colors.gold2, fontFamily: Fonts.medium, fontSize: 14, lineHeight: 20 },
  offlineText: { color: Colors.ink2, fontFamily: Fonts.medium, fontSize: 14, lineHeight: 20 },
  footer: { textAlign: 'center' },
  closeBtn: { marginTop: 8 },
})
