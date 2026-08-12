import { useCallback, useEffect, useRef, useState } from 'react'
import * as Location from 'expo-location'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { BodyText, Card, Chip, GhostButton, GoldButton, MutedText } from '../../components/ui'
import { API_BASE } from '../../constants/config'
import { Colors, Fonts } from '../../constants/theme'
import { enqueueAction } from '../../lib/offline-queue'
import { supabase } from '../../lib/supabase'
import { useCaregiverRole } from '../../lib/use-caregiver-role'

// ═══════════════════════════════════════════════════════════
// ZEITERFASSUNG — Live-Timer für den Einsatz.
// Start → GPS-Check-in (geo_events, Zeitstempel serverseitig),
// Pause/Weiter für Unterbrechungen, Stopp → GPS-Check-out +
// start_time/end_time werden in den service_record geschrieben.
// duration_minutes ist eine GENERIERTE DB-Spalte (aus start/end)
// und wird deshalb NICHT direkt geschrieben; die Netto-Zeit
// (abzüglich Pausen) wird zusätzlich in notes protokolliert.
// GPS: EINMAL-Messung je Ereignis, kein Dauertracking.
// ═══════════════════════════════════════════════════════════

type TimerState = 'idle' | 'running' | 'paused' | 'stopped'

interface RecordOption {
  id: string
  label: string
  notes: string | null
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function toHHMM(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`
}

export default function ZeiterfassungScreen() {
  const router = useRouter()
  const { serviceRecordId: paramRecordId } = useLocalSearchParams<{ serviceRecordId?: string }>()
  const { loading: roleLoading, allowed, caregiverId } = useCaregiverRole()

  const [records, setRecords] = useState<RecordOption[]>([])
  const [loadingRecords, setLoadingRecords] = useState(true)
  const [recordId, setRecordId] = useState<string>(paramRecordId ?? '')

  const [timerState, setTimerState] = useState<TimerState>('idle')
  const [elapsedMs, setElapsedMs] = useState(0)
  const [gpsInfo, setGpsInfo] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedSummary, setSavedSummary] = useState<{ start: string; end: string; net: number; gross: number } | null>(null)

  // Refs statt State für Zeitpunkte — der Interval-Tick braucht keine Re-Renders dieser Werte
  const startedAtRef = useRef<Date | null>(null)
  const pausedMsRef = useRef(0)
  const pauseStartedRef = useRef<Date | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Offene Einsätze der Betreuungskraft laden (falls kein Record vorgegeben)
  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!caregiverId) {
        setLoadingRecords(false)
        return
      }
      const { data } = await supabase
        .from('service_records')
        .select('id, date, notes, client:clients(first_name, last_name)')
        .eq('caregiver_id', caregiverId)
        .in('status', ['draft', 'incomplete'])
        .order('date', { ascending: false })
        .limit(20)
      if (cancelled) return
      setRecords(
        (data || []).map((r: any) => ({
          id: r.id,
          notes: r.notes ?? null,
          label: `${[r.client?.first_name, r.client?.last_name].filter(Boolean).join(' ') || 'Unbekannt'} · ${new Date(r.date).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })}`,
        }))
      )
      setLoadingRecords(false)
    }
    if (allowed) load()
    return () => {
      cancelled = true
    }
  }, [allowed, caregiverId])

  // Timer-Tick — läuft nur im Zustand 'running'
  useEffect(() => {
    if (timerState === 'running') {
      intervalRef.current = setInterval(() => {
        if (startedAtRef.current) {
          setElapsedMs(Date.now() - startedAtRef.current.getTime() - pausedMsRef.current)
        }
      }, 1000)
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [timerState])

  // GPS-Ereignis (Check-in/out) — gleicher Flow wie check-in.tsx:
  // API-Route schreibt geo_events inkl. Zeitstempel, bei Netzfehler Offline-Queue.
  const logGeoEvent = useCallback(
    async (eventType: 'check_in' | 'check_out') => {
      if (!recordId) return
      try {
        const { status } = await Location.requestForegroundPermissionsAsync()
        if (status !== 'granted') {
          setGpsInfo('Standortzugriff nicht erlaubt — Zeit wird ohne GPS-Nachweis erfasst.')
          return
        }
        const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        const payload = {
          service_record_id: recordId,
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
          setGpsInfo(
            eventType === 'check_in'
              ? 'GPS-Check-in mit Zeitstempel gespeichert.'
              : 'GPS-Check-out mit Zeitstempel gespeichert.'
          )
        } catch {
          await enqueueAction('geo_event', payload)
          setGpsInfo('Kein Netz — GPS-Zeitstempel lokal gespeichert, wird automatisch synchronisiert.')
        }
      } catch {
        setGpsInfo('Standort konnte nicht ermittelt werden — Zeit wird ohne GPS-Nachweis erfasst.')
      }
    },
    [recordId]
  )

  function startTimer() {
    setError('')
    if (!recordId) {
      setError('Bitte zuerst einen Einsatz auswählen.')
      return
    }
    startedAtRef.current = new Date()
    pausedMsRef.current = 0
    pauseStartedRef.current = null
    setElapsedMs(0)
    setTimerState('running')
    logGeoEvent('check_in')
  }

  function pauseTimer() {
    pauseStartedRef.current = new Date()
    setTimerState('paused')
  }

  function resumeTimer() {
    if (pauseStartedRef.current) {
      pausedMsRef.current += Date.now() - pauseStartedRef.current.getTime()
      pauseStartedRef.current = null
    }
    setTimerState('running')
  }

  async function stopTimer() {
    setError('')
    const startedAt = startedAtRef.current
    if (!startedAt) return

    // Laufende Pause bis zum Stopp mitzählen
    if (pauseStartedRef.current) {
      pausedMsRef.current += Date.now() - pauseStartedRef.current.getTime()
      pauseStartedRef.current = null
    }

    const endedAt = new Date()
    const grossMinutes = Math.max(1, Math.round((endedAt.getTime() - startedAt.getTime()) / 60000))
    const pauseMinutes = Math.round(pausedMsRef.current / 60000)
    const netMinutes = Math.max(1, grossMinutes - pauseMinutes)
    const startHHMM = toHHMM(startedAt)
    const endHHMM = toHHMM(endedAt)

    setSaving(true)
    try {
      // Bestehende Notizen holen, um das Pausen-Protokoll anzuhängen (nicht überschreiben)
      const existing = records.find(r => r.id === recordId)
      let currentNotes = existing?.notes ?? null
      if (currentNotes === undefined || existing === undefined) {
        const { data } = await supabase.from('service_records').select('notes').eq('id', recordId).single()
        currentNotes = data?.notes ?? null
      }

      const timeLog = `[Zeiterfassung] ${startHHMM}–${endHHMM} Uhr, Pause ${pauseMinutes} Min., Netto ${netMinutes} Min.`
      const newNotes = currentNotes ? `${currentNotes}\n${timeLog}` : timeLog

      // duration_minutes wird von der DB aus start_time/end_time generiert — nicht mitschicken
      const { error: updErr } = await supabase
        .from('service_records')
        .update({ start_time: startHHMM, end_time: endHHMM, notes: newNotes })
        .eq('id', recordId)

      if (updErr) {
        console.warn('Zeiterfassung-Update Fehler:', updErr)
        setError('Zeiten konnten nicht gespeichert werden. Bitte Netzverbindung prüfen und erneut versuchen.')
        setSaving(false)
        return
      }

      setTimerState('stopped')
      setSavedSummary({ start: startHHMM, end: endHHMM, net: netMinutes, gross: grossMinutes })
      logGeoEvent('check_out')
    } catch (err) {
      console.warn('Zeiterfassung-Fehler:', err)
      setError('Zeiten konnten nicht gespeichert werden. Bitte erneut versuchen.')
    } finally {
      setSaving(false)
    }
  }

  if (roleLoading || (allowed && loadingRecords)) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.gold} />
        </View>
      </SafeAreaView>
    )
  }

  if (!allowed) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <MutedText style={styles.gateHint}>
            Dieser Bereich ist Betreuungskräften von Alltagsengel vorbehalten.
          </MutedText>
          <GhostButton onPress={() => router.back()} style={styles.closeBtn}>
            Schließen
          </GhostButton>
        </View>
      </SafeAreaView>
    )
  }

  const selectedLabel = records.find(r => r.id === recordId)?.label

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Zeiterfassung</Text>
        <BodyText style={styles.intro}>
          Starten Sie den Timer beim Beginn des Einsatzes. Beim Start und Stopp wird zusätzlich einmalig
          Ihr Standort als Nachweis erfasst — kein Dauertracking.
        </BodyText>

        {/* Einsatz-Auswahl (nur solange der Timer nicht läuft) */}
        {timerState === 'idle' && (
          <Card>
            <Text style={styles.cardTitle}>Einsatz auswählen</Text>
            {records.length === 0 && !paramRecordId ? (
              <MutedText>
                Kein offener Einsatz gefunden. Bitte zuerst unter „Leistung erfassen" einen Einsatz
                anlegen.
              </MutedText>
            ) : (
              <View style={styles.chipWrap}>
                {records.map(r => (
                  <Chip key={r.id} active={recordId === r.id} onPress={() => setRecordId(r.id)}>
                    {r.label}
                  </Chip>
                ))}
              </View>
            )}
          </Card>
        )}

        {/* Timer */}
        <Card style={styles.timerCard}>
          {selectedLabel && <MutedText style={styles.timerRecord}>{selectedLabel}</MutedText>}
          <Text style={styles.timerText}>{formatElapsed(elapsedMs)}</Text>
          <Text style={styles.timerStateText}>
            {timerState === 'idle' && 'Bereit'}
            {timerState === 'running' && 'Einsatz läuft'}
            {timerState === 'paused' && 'Pause'}
            {timerState === 'stopped' && 'Beendet'}
          </Text>

          {timerState === 'idle' && (
            <GoldButton onPress={startTimer} style={styles.timerBtn}>
              Einsatz starten
            </GoldButton>
          )}
          {timerState === 'running' && (
            <View style={styles.btnRow}>
              <GhostButton onPress={pauseTimer} style={styles.halfBtn}>
                Pause
              </GhostButton>
              <GoldButton onPress={stopTimer} loading={saving} style={styles.halfBtn}>
                Beenden
              </GoldButton>
            </View>
          )}
          {timerState === 'paused' && (
            <View style={styles.btnRow}>
              <GoldButton onPress={resumeTimer} style={styles.halfBtn}>
                Weiter
              </GoldButton>
              <GhostButton onPress={stopTimer} style={styles.halfBtn}>
                Beenden
              </GhostButton>
            </View>
          )}
        </Card>

        {gpsInfo !== '' && <MutedText style={styles.gpsInfo}>{gpsInfo}</MutedText>}
        {error !== '' && <Text style={styles.error}>{error}</Text>}

        {savedSummary && (
          <Card>
            <Text style={styles.okText}>Zeiten gespeichert</Text>
            <View style={styles.sumRow}>
              <Text style={styles.sumLabel}>Beginn</Text>
              <Text style={styles.sumValue}>{savedSummary.start} Uhr</Text>
            </View>
            <View style={styles.sumRow}>
              <Text style={styles.sumLabel}>Ende</Text>
              <Text style={styles.sumValue}>{savedSummary.end} Uhr</Text>
            </View>
            <View style={styles.sumRow}>
              <Text style={styles.sumLabel}>Dauer (brutto)</Text>
              <Text style={styles.sumValue}>{savedSummary.gross} Min.</Text>
            </View>
            <View style={styles.sumRow}>
              <Text style={styles.sumLabel}>Arbeitszeit (netto)</Text>
              <Text style={styles.sumValue}>{savedSummary.net} Min.</Text>
            </View>
            <GoldButton
              onPress={() =>
                router.replace({ pathname: '/einsatz/unterschrift', params: { serviceRecordId: recordId } })
              }
              style={styles.timerBtn}
            >
              Weiter zur Unterschrift
            </GoldButton>
          </Card>
        )}

        <MutedText style={styles.footer}>
          Standortdaten werden nur ereignisbezogen (Start/Stopp) erfasst — keine Hintergrundverfolgung.
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
  scroll: { padding: 20, paddingTop: 28, paddingBottom: 40, gap: 16 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 },
  title: { color: Colors.ink, fontFamily: Fonts.bold, fontSize: 24 },
  intro: {},
  gateHint: { textAlign: 'center' },
  cardTitle: { color: Colors.ink, fontFamily: Fonts.semibold, fontSize: 16, marginBottom: 10 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timerCard: { alignItems: 'center', paddingVertical: 28 },
  timerRecord: { marginBottom: 6, textAlign: 'center' },
  timerText: { color: Colors.goldBright, fontFamily: Fonts.bold, fontSize: 48, fontVariant: ['tabular-nums'] },
  timerStateText: { color: Colors.ink3, fontFamily: Fonts.semibold, fontSize: 13, marginTop: 4, marginBottom: 18, textTransform: 'uppercase', letterSpacing: 1 },
  timerBtn: { width: '100%', marginTop: 10 },
  btnRow: { flexDirection: 'row', gap: 10, width: '100%' },
  halfBtn: { flex: 1 },
  gpsInfo: { textAlign: 'center' },
  error: { color: Colors.red, fontFamily: Fonts.regular, fontSize: 13 },
  okText: { color: Colors.green, fontFamily: Fonts.semibold, fontSize: 16, marginBottom: 10 },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  sumLabel: { color: Colors.ink3, fontFamily: Fonts.medium, fontSize: 14 },
  sumValue: { color: Colors.ink, fontFamily: Fonts.semibold, fontSize: 14 },
  footer: { textAlign: 'center' },
  closeBtn: { marginTop: 4 },
})
