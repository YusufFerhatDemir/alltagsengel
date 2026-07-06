import { useRef, useState } from 'react'
import * as Location from 'expo-location'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Dimensions, Platform, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import SignaturePad, { type SignaturePadHandle } from '../../components/SignaturePad'
import { BodyText, Card, GhostButton, GoldButton, Input, Label, MutedText } from '../../components/ui'
import { API_BASE } from '../../constants/config'
import { Colors, Fonts } from '../../constants/theme'
import { enqueueAction } from '../../lib/offline-queue'
import { supabase } from '../../lib/supabase'

// ═══════════════════════════════════════════════════════════
// UNTERSCHRIFT — digitale Unterschrift Klient + Betreuungskraft,
// nacheinander erfasst (jeweils eigenes SignaturePad). Beim Speichern:
// Device-Info (Platform) + einmalige GPS-Position (kein Dauertracking)
// werden mitgesendet. Bei Netzwerkfehler: Offline-Queue.
// ═══════════════════════════════════════════════════════════

type SignerRole = 'client' | 'caregiver'

const PAD_WIDTH = Math.min(Dimensions.get('window').width - 40, 500)
const PAD_HEIGHT = 200

export default function UnterschriftScreen() {
  const router = useRouter()
  const { serviceRecordId } = useLocalSearchParams<{ serviceRecordId: string }>()

  const [step, setStep] = useState<SignerRole>('client')
  const [clientName, setClientName] = useState('')
  const [caregiverName, setCaregiverName] = useState('')
  const [saving, setSaving] = useState<SignerRole | null>(null)
  const [done, setDone] = useState<Record<SignerRole, boolean>>({ client: false, caregiver: false })
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const clientPadRef = useRef<SignaturePadHandle>(null)
  const caregiverPadRef = useRef<SignaturePadHandle>(null)

  async function saveSignature(role: SignerRole) {
    setError('')
    setInfo('')
    const name = role === 'client' ? clientName.trim() : caregiverName.trim()
    if (!name) {
      setError('Bitte zuerst den Namen eingeben.')
      return
    }

    const padRef = role === 'client' ? clientPadRef : caregiverPadRef
    if (padRef.current?.isEmpty()) {
      setError('Bitte zuerst unterschreiben.')
      return
    }

    setSaving(role)
    try {
      const base64 = await padRef.current?.capture()
      if (!base64) {
        setError('Unterschrift konnte nicht erfasst werden.')
        setSaving(null)
        return
      }

      // Einmalige GPS-Position — nur Vordergrund-Berechtigung, kein Dauertracking
      let gpsLat: number | null = null
      let gpsLng: number | null = null
      try {
        const { status } = await Location.requestForegroundPermissionsAsync()
        if (status === 'granted') {
          const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
          gpsLat = position.coords.latitude
          gpsLng = position.coords.longitude
        }
      } catch {
        // Standort optional bei Unterschrift — Fehler hier blockiert nicht
      }

      const payload = {
        service_record_id: serviceRecordId,
        signer_role: role,
        signer_name: name,
        signature_image: base64,
        device_info: { platform: Platform.OS, version: String(Platform.Version) },
        gps_lat: gpsLat,
        gps_lng: gpsLng,
      }

      const {
        data: { session },
      } = await supabase.auth.getSession()

      try {
        const res = await fetch(`${API_BASE}/api/native/signatures`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token ?? ''}`,
          },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error('request-failed')
        setInfo(`Unterschrift (${role === 'client' ? 'Klient' : 'Betreuungskraft'}) gespeichert.`)
      } catch {
        await enqueueAction('service_signature', payload)
        setInfo(
          `Kein Netz — Unterschrift (${role === 'client' ? 'Klient' : 'Betreuungskraft'}) wurde lokal gespeichert und wird automatisch synchronisiert.`
        )
      }

      setDone(prev => ({ ...prev, [role]: true }))
      if (role === 'client') setStep('caregiver')
    } catch (err) {
      console.warn('Unterschrift-Fehler:', err)
      setError('Unterschrift konnte nicht gespeichert werden. Bitte erneut versuchen.')
    } finally {
      setSaving(null)
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Unterschrift erfassen</Text>
        <BodyText style={styles.intro}>
          Zuerst unterschreibt der Klient, danach die Betreuungskraft — jeweils direkt auf diesem Gerät.
        </BodyText>

        <View style={styles.stepRow}>
          <Text style={[styles.stepLabel, step === 'client' && styles.stepLabelActive, done.client && styles.stepLabelDone]}>
            1. Klient {done.client ? '✓' : ''}
          </Text>
          <Text style={[styles.stepLabel, step === 'caregiver' && styles.stepLabelActive, done.caregiver && styles.stepLabelDone]}>
            2. Betreuungskraft {done.caregiver ? '✓' : ''}
          </Text>
        </View>

        {step === 'client' ? (
          <Card>
            <Label>Name des Klienten</Label>
            <Input placeholder="Vor- und Nachname" value={clientName} onChangeText={setClientName} style={styles.nameInput} />
            <Label>Unterschrift</Label>
            <SignaturePad ref={clientPadRef} width={PAD_WIDTH} height={PAD_HEIGHT} />
            <View style={styles.padActions}>
              <GhostButton onPress={() => clientPadRef.current?.clear()} style={styles.clearBtn}>
                Löschen
              </GhostButton>
              <GoldButton onPress={() => saveSignature('client')} loading={saving === 'client'} style={styles.saveBtn}>
                Speichern &amp; weiter
              </GoldButton>
            </View>
          </Card>
        ) : (
          <Card>
            <Label>Name der Betreuungskraft</Label>
            <Input placeholder="Vor- und Nachname" value={caregiverName} onChangeText={setCaregiverName} style={styles.nameInput} />
            <Label>Unterschrift</Label>
            <SignaturePad ref={caregiverPadRef} width={PAD_WIDTH} height={PAD_HEIGHT} />
            <View style={styles.padActions}>
              <GhostButton onPress={() => caregiverPadRef.current?.clear()} style={styles.clearBtn}>
                Löschen
              </GhostButton>
              <GoldButton onPress={() => saveSignature('caregiver')} loading={saving === 'caregiver'} style={styles.saveBtn}>
                Speichern
              </GoldButton>
            </View>
            <GhostButton onPress={() => setStep('client')} style={styles.backBtn}>
              Zurück zur Klienten-Unterschrift
            </GhostButton>
          </Card>
        )}

        {error !== '' && <Text style={styles.error}>{error}</Text>}
        {info !== '' && <Text style={styles.info}>{info}</Text>}

        {done.client && done.caregiver && (
          <MutedText style={styles.completeHint}>
            Beide Unterschriften wurden erfasst. Sie können diesen Bereich jetzt schließen.
          </MutedText>
        )}

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
  stepRow: { flexDirection: 'row', gap: 16 },
  stepLabel: { color: Colors.ink4, fontFamily: Fonts.semibold, fontSize: 13 },
  stepLabelActive: { color: Colors.goldBright },
  stepLabelDone: { color: Colors.green },
  nameInput: { marginBottom: 16 },
  padActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  clearBtn: { flex: 1 },
  saveBtn: { flex: 2 },
  backBtn: { marginTop: 12 },
  error: { color: Colors.red, fontFamily: Fonts.regular, fontSize: 13 },
  info: { color: Colors.green, fontFamily: Fonts.medium, fontSize: 13, lineHeight: 19 },
  completeHint: { textAlign: 'center' },
  closeBtn: { marginTop: 4 },
})
