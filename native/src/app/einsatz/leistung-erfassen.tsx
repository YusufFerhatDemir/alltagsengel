import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'expo-router'
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { BodyText, Card, Chip, GhostButton, GoldButton, Input, Label, MutedText } from '../../components/ui'
import { Colors, Fonts } from '../../constants/theme'
import { supabase } from '../../lib/supabase'
import { useCaregiverRole } from '../../lib/use-caregiver-role'
import { heuteBerlin } from '@/lib/utils/timezone';

// ═══════════════════════════════════════════════════════════
// LEISTUNGSERFASSUNG — Betreuungskraft erfasst einen Einsatz
// direkt in der App: Klient, Leistungsart, Budget-Topf, Zeiten.
// Stundensatz kommt aus service_pricing (eine Preis-Quelle),
// Betrag wird automatisch berechnet. Insert als status='draft'
// (RLS: service_records_caregiver_insert erlaubt nur draft).
// duration_minutes ist eine GENERIERTE DB-Spalte — wird NICHT
// mitgeschickt, nur lokal für die Anzeige berechnet.
// ═══════════════════════════════════════════════════════════

interface ClientOption {
  id: string
  name: string
}

interface PricingRow {
  service_type: string
  budget_type: string
  hourly_rate: number
  min_hours: number
  billing_unit: string
}

const SERVICE_TYPES: { key: string; label: string }[] = [
  { key: 'alltagsbegleitung', label: 'Alltagsbegleitung' },
  { key: 'betreuung_45a', label: 'Betreuung §45a' },
  { key: 'hauswirtschaft', label: 'Hauswirtschaft' },
  { key: 'einkaufsservice', label: 'Einkaufsservice' },
  { key: 'begleitservice', label: 'Begleitservice' },
]

const BUDGET_POTS: { key: string; label: string; hint: string }[] = [
  { key: 'entlastung', label: 'Entlastungsbetrag', hint: 'Entlastungsbetrag §45b — 131 €/Monat, ab Pflegegrad 1' },
  { key: 'verhinderung', label: 'Verhinderungspflege', hint: 'Verhinderungspflege §39 — gemeinsamer Jahresbetrag, ab Pflegegrad 2' },
  { key: 'carryover', label: 'Übertrag Vorjahr', hint: 'Nicht genutzter Entlastungsbetrag aus dem Vorjahr (bis 30.06. nutzbar)' },
  { key: 'private', label: 'Privat', hint: 'Privatzahler — Rechnung direkt an den Klienten' },
]

// Fallback-Stundensatz, falls für die Kombination kein Preissatz
// in service_pricing hinterlegt ist (z. B. Übertrag Vorjahr)
// Zentralisiert in lib/pricing/b2c-constants.ts — hier inline,
// weil native App keinen @/-Alias hat
const FALLBACK_HOURLY_RATE = 35

// Minuten zwischen zwei "HH:MM"-Zeiten (über Mitternacht hinweg robust)
function diffMinutes(start: string, end: string): number {
  if (!/^\d{1,2}:\d{2}$/.test(start) || !/^\d{1,2}:\d{2}$/.test(end)) return 0
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  let mins = eh * 60 + em - (sh * 60 + sm)
  if (mins < 0) mins += 24 * 60
  return mins
}

function formatEuro(n: number): string {
  return `${n.toFixed(2).replace('.', ',')} €`
}

export default function LeistungErfassenScreen() {
  const router = useRouter()
  const { loading: roleLoading, allowed, caregiverId } = useCaregiverRole()

  const [clients, setClients] = useState<ClientOption[]>([])
  const [pricing, setPricing] = useState<PricingRow[]>([])
  const [loadingData, setLoadingData] = useState(true)

  const [clientId, setClientId] = useState('')
  const [serviceType, setServiceType] = useState('alltagsbegleitung')
  const [budgetType, setBudgetType] = useState('entlastung')
  const [date, setDate] = useState(() => heuteBerlin())
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [initials, setInitials] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [savedRecordId, setSavedRecordId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      // Klienten: RLS (clients_caregiver_read) liefert nur zugewiesene Klienten
      const [clientRes, pricingRes, cgRes] = await Promise.all([
        supabase.from('clients').select('id, first_name, last_name').order('last_name'),
        supabase
          .from('service_pricing')
          .select('service_type, budget_type, hourly_rate, min_hours, billing_unit')
          .eq('is_active', true),
        caregiverId
          ? supabase.from('caregivers').select('initials').eq('id', caregiverId).single()
          : Promise.resolve({ data: null } as any),
      ])
      if (cancelled) return
      setClients(
        (clientRes.data || []).map((c: any) => ({
          id: c.id,
          name: [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unbekannt',
        }))
      )
      setPricing((pricingRes.data || []) as PricingRow[])
      if (cgRes?.data?.initials) setInitials((prev: string) => prev || cgRes.data.initials)
      setLoadingData(false)
    }
    if (allowed) load()
    return () => {
      cancelled = true
    }
  }, [allowed, caregiverId])

  const duration = useMemo(() => diffMinutes(startTime, endTime), [startTime, endTime])

  const priceRow = useMemo(
    () => pricing.find(p => p.service_type === serviceType && p.budget_type === budgetType) ?? null,
    [pricing, serviceType, budgetType]
  )

  // Stundensatz: aus service_pricing — sonst Standardsatz 35 €
  const hourlyRate = priceRow ? priceRow.hourly_rate : FALLBACK_HOURLY_RATE
  const usingFallbackRate = !priceRow

  const amount = useMemo(() => {
    if (duration <= 0) return null
    const hours = Math.max(duration / 60, priceRow?.min_hours ?? 0)
    return Math.round(hours * hourlyRate * 100) / 100
  }, [priceRow, duration, hourlyRate])

  const minHoursApplied = !!priceRow && duration > 0 && duration / 60 < priceRow.min_hours

  const activePot = BUDGET_POTS.find(p => p.key === budgetType)

  async function save() {
    setError('')
    if (!caregiverId) {
      setError('Betreuungskraft-Profil nicht gefunden. Bitte an Alltagsengel wenden.')
      return
    }
    if (!clientId) {
      setError('Bitte einen Klienten auswählen.')
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError('Bitte das Datum im Format JJJJ-MM-TT eingeben.')
      return
    }
    if (duration <= 0) {
      setError('Bitte gültige Start- und Endzeit eingeben (Format HH:MM).')
      return
    }
    if (!initials.trim()) {
      setError('Bitte Ihr Handzeichen (Initialen) eingeben.')
      return
    }

    setSaving(true)
    try {
      const { data, error: insErr } = await supabase
        .from('service_records')
        .insert({
          client_id: clientId,
          caregiver_id: caregiverId,
          date,
          start_time: startTime,
          end_time: endTime,
          // duration_minutes: GENERIERTE Spalte — nie mitschicken
          service_type: serviceType,
          budget_type: budgetType,
          amount,
          caregiver_initials: initials.trim(),
          status: 'draft',
        })
        .select('id')
        .single()

      if (insErr || !data) {
        console.warn('Leistung-Insert Fehler:', insErr)
        setError('Speichern fehlgeschlagen. Bitte Netzverbindung prüfen und erneut versuchen.')
        setSaving(false)
        return
      }
      setSavedRecordId(data.id)
    } catch (err) {
      console.warn('Leistung-Insert Fehler:', err)
      setError('Speichern fehlgeschlagen. Bitte erneut versuchen.')
    } finally {
      setSaving(false)
    }
  }

  if (roleLoading || (allowed && loadingData)) {
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

  // Erfolgs-Ansicht nach dem Speichern
  if (savedRecordId) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.title}>Leistung gespeichert</Text>
          <Card>
            <Text style={styles.okText}>
              Der Einsatz wurde als Entwurf gespeichert und erscheint jetzt in Ihrer Einsatzliste.
            </Text>
            <MutedText style={styles.okHint}>
              Nächste Schritte: Zeiterfassung starten oder direkt Unterschriften einholen.
            </MutedText>
            <GoldButton
              onPress={() =>
                router.replace({ pathname: '/einsatz/zeiterfassung', params: { serviceRecordId: savedRecordId } })
              }
              style={styles.nextBtn}
            >
              Zeiterfassung starten
            </GoldButton>
            <GhostButton onPress={() => router.back()} style={styles.nextBtn}>
              Fertig
            </GhostButton>
          </Card>
        </ScrollView>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Leistung erfassen</Text>
        <BodyText style={styles.intro}>
          Erfassen Sie Ihren Einsatz direkt vor Ort. Der Nachweis wird als Entwurf gespeichert und vom
          Büro geprüft.
        </BodyText>

        {/* Klient */}
        <Card>
          <Label>Klient</Label>
          {clients.length === 0 ? (
            <MutedText>
              Keine zugewiesenen Klienten gefunden. Bitte wenden Sie sich an Alltagsengel.
            </MutedText>
          ) : (
            <View style={styles.chipWrap}>
              {clients.map(c => (
                <Chip key={c.id} active={clientId === c.id} onPress={() => setClientId(c.id)}>
                  {c.name}
                </Chip>
              ))}
            </View>
          )}
        </Card>

        {/* Leistungsart */}
        <Card>
          <Label>Leistungsart</Label>
          <View style={styles.chipWrap}>
            {SERVICE_TYPES.map(s => (
              <Chip key={s.key} active={serviceType === s.key} onPress={() => setServiceType(s.key)}>
                {s.label}
              </Chip>
            ))}
          </View>
        </Card>

        {/* Budget-Topf */}
        <Card>
          <Label>Budget-Topf</Label>
          <View style={styles.chipWrap}>
            {BUDGET_POTS.map(p => (
              <Chip key={p.key} active={budgetType === p.key} onPress={() => setBudgetType(p.key)}>
                {p.label}
              </Chip>
            ))}
          </View>
          {activePot && (
            <View style={styles.potBox}>
              <Text style={styles.potText}>Abrechnung über: {activePot.hint}</Text>
            </View>
          )}
        </Card>

        {/* Datum + Zeiten */}
        <Card>
          <Label>Datum (JJJJ-MM-TT)</Label>
          <Input value={date} onChangeText={setDate} placeholder="2026-07-19" style={styles.field} />
          <View style={styles.timeRow}>
            <View style={styles.timeCol}>
              <Label>Beginn (HH:MM)</Label>
              <Input value={startTime} onChangeText={setStartTime} placeholder="14:00" keyboardType="numbers-and-punctuation" />
            </View>
            <View style={styles.timeCol}>
              <Label>Ende (HH:MM)</Label>
              <Input value={endTime} onChangeText={setEndTime} placeholder="16:00" keyboardType="numbers-and-punctuation" />
            </View>
          </View>
          {duration > 0 && (
            <Text style={styles.durationText}>
              Dauer: {Math.floor(duration / 60)} Std. {duration % 60} Min.
            </Text>
          )}
        </Card>

        {/* Preis + Betrag */}
        <Card>
          <Label>Abrechnung</Label>
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Stundensatz</Text>
            <Text style={styles.priceValue}>{formatEuro(hourlyRate)}</Text>
          </View>
          {usingFallbackRate && (
            <MutedText style={styles.minHint}>
              Für diese Kombination ist kein Preissatz hinterlegt — es gilt der Standardsatz von{' '}
              {formatEuro(FALLBACK_HOURLY_RATE)}/Std. Das Büro prüft den Betrag bei der Freigabe.
            </MutedText>
          )}
          {minHoursApplied && priceRow && (
            <MutedText style={styles.minHint}>
              Mindestabrechnung: {priceRow.min_hours} Std. — der Betrag wird entsprechend berechnet.
            </MutedText>
          )}
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Gesamtbetrag</Text>
            <Text style={styles.amountValue}>{amount != null ? formatEuro(amount) : '—'}</Text>
          </View>
          {activePot && (
            <MutedText style={styles.minHint}>Wird gebucht auf: {activePot.label}</MutedText>
          )}
        </Card>

        {/* Handzeichen */}
        <Card>
          <Label>Handzeichen (Initialen)</Label>
          <Input value={initials} onChangeText={setInitials} placeholder="z. B. MM" autoCapitalize="characters" maxLength={5} />
        </Card>

        {error !== '' && <Text style={styles.error}>{error}</Text>}

        <GoldButton onPress={save} loading={saving}>
          Als Entwurf speichern
        </GoldButton>
        <GhostButton onPress={() => router.back()} style={styles.closeBtn}>
          Abbrechen
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
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  potBox: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.goldBorder,
    backgroundColor: Colors.goldFaint,
    padding: 12,
  },
  potText: { color: Colors.goldBright, fontFamily: Fonts.medium, fontSize: 13, lineHeight: 19 },
  field: { marginBottom: 14 },
  timeRow: { flexDirection: 'row', gap: 12 },
  timeCol: { flex: 1 },
  durationText: { color: Colors.ink2, fontFamily: Fonts.semibold, fontSize: 14, marginTop: 12 },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  priceLabel: { color: Colors.ink3, fontFamily: Fonts.medium, fontSize: 14 },
  priceValue: { color: Colors.ink, fontFamily: Fonts.semibold, fontSize: 15 },
  amountValue: { color: Colors.goldBright, fontFamily: Fonts.bold, fontSize: 20 },
  minHint: { marginBottom: 8 },
  error: { color: Colors.red, fontFamily: Fonts.regular, fontSize: 13 },
  okText: { color: Colors.green, fontFamily: Fonts.medium, fontSize: 15, lineHeight: 21 },
  okHint: { marginTop: 8 },
  nextBtn: { marginTop: 12 },
  closeBtn: { marginTop: 4 },
})
