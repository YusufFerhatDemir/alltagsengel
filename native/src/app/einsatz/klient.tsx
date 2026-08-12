import { useEffect, useState } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Card, GhostButton, GoldButton, MutedText, SectionTitle } from '../../components/ui'
import { Colors, Fonts } from '../../constants/theme'
import { supabase } from '../../lib/supabase'
import { useCaregiverRole } from '../../lib/use-caregiver-role'

// ═══════════════════════════════════════════════════════════
// KLIENTENANSICHT — alle einsatzrelevanten Daten des Klienten
// für die Betreuungskraft: Stammdaten, Pflegegrad, Gesundheit
// (Allergien, Medikamente, Mobilität), Notfallkontakt,
// Angehörige, Hausarzt. RLS (clients_caregiver_read) stellt
// sicher, dass nur zugewiesene Klienten lesbar sind.
// ═══════════════════════════════════════════════════════════

interface ClientDetail {
  id: string
  first_name: string
  last_name: string
  date_of_birth: string | null
  address: string | null
  zip_code: string | null
  city: string | null
  phone: string | null
  care_level: number | null
  pflegekasse_name: string | null
  insurance_name: string | null
  // Gesundheit (neu — Eylem-Audit)
  allergies: string | null
  medications: string | null
  mobility_status: string | null
  dietary_restrictions: string | null
  medical_conditions: string | null
  // Notfall + Angehörige (neu)
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  emergency_contact_relationship: string | null
  next_of_kin_name: string | null
  next_of_kin_phone: string | null
  next_of_kin_email: string | null
  next_of_kin_relationship: string | null
  // Hausarzt (neu)
  hausarzt_name: string | null
  hausarzt_phone: string | null
}

const MOBILITY_LABELS: Record<string, string> = {
  mobil: 'Mobil',
  eingeschraenkt: 'Eingeschränkt mobil',
  rollstuhl: 'Rollstuhl',
  bettlaegerig: 'Bettlägerig',
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value?.trim() ? value : '—'}</Text>
    </View>
  )
}

function formatDate(value: string | null): string | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })
}

export default function KlientScreen() {
  const router = useRouter()
  const { clientId } = useLocalSearchParams<{ clientId: string }>()
  const { loading: roleLoading, allowed } = useCaregiverRole()

  const [client, setClient] = useState<ClientDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!clientId) {
        setNotFound(true)
        setLoading(false)
        return
      }
      const { data, error } = await supabase.from('clients').select('*').eq('id', clientId).single()
      if (cancelled) return
      if (error || !data) {
        setNotFound(true)
      } else {
        setClient(data as ClientDetail)
      }
      setLoading(false)
    }
    if (allowed) load()
    return () => {
      cancelled = true
    }
  }, [allowed, clientId])

  if (roleLoading || (allowed && loading)) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.gold} />
        </View>
      </SafeAreaView>
    )
  }

  if (!allowed || notFound || !client) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <MutedText style={styles.gateHint}>
            {!allowed
              ? 'Dieser Bereich ist Betreuungskräften von Alltagsengel vorbehalten.'
              : 'Klient nicht gefunden oder nicht zugewiesen.'}
          </MutedText>
          <GhostButton onPress={() => router.back()} style={styles.closeBtn}>
            Schließen
          </GhostButton>
        </View>
      </SafeAreaView>
    )
  }

  const fullName = [client.first_name, client.last_name].filter(Boolean).join(' ')
  const addressLine =
    [client.address, [client.zip_code, client.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || null
  const hasHealthAlert = !!client.allergies?.trim() || !!client.medications?.trim()

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>{fullName}</Text>
        <Text style={styles.subtitle}>
          {client.care_level ? `Pflegegrad ${client.care_level}` : 'Kein Pflegegrad'}
          {client.mobility_status ? ` · ${MOBILITY_LABELS[client.mobility_status] ?? client.mobility_status}` : ''}
        </Text>

        {/* Wichtige Gesundheits-Hinweise prominent */}
        {hasHealthAlert && (
          <Card style={styles.alertCard}>
            <Text style={styles.alertTitle}>Wichtige Hinweise</Text>
            {!!client.allergies?.trim() && (
              <View style={styles.alertBlock}>
                <Text style={styles.alertLabel}>Allergien</Text>
                <Text style={styles.alertValue}>{client.allergies}</Text>
              </View>
            )}
            {!!client.medications?.trim() && (
              <View style={styles.alertBlock}>
                <Text style={styles.alertLabel}>Medikamente</Text>
                <Text style={styles.alertValue}>{client.medications}</Text>
              </View>
            )}
          </Card>
        )}

        {/* Stammdaten */}
        <Card>
          <SectionTitle>Stammdaten</SectionTitle>
          <InfoRow label="Geburtsdatum" value={formatDate(client.date_of_birth)} />
          <InfoRow label="Adresse" value={addressLine} />
          <InfoRow label="Telefon" value={client.phone} />
          <InfoRow label="Pflegekasse" value={client.pflegekasse_name || client.insurance_name} />
        </Card>

        {/* Gesundheit */}
        <Card>
          <SectionTitle>Gesundheit</SectionTitle>
          <InfoRow label="Allergien" value={client.allergies} />
          <InfoRow label="Medikamente" value={client.medications} />
          <InfoRow
            label="Mobilität"
            value={client.mobility_status ? MOBILITY_LABELS[client.mobility_status] ?? client.mobility_status : null}
          />
          <InfoRow label="Ernährung" value={client.dietary_restrictions} />
          <InfoRow label="Erkrankungen" value={client.medical_conditions} />
        </Card>

        {/* Notfallkontakt */}
        <Card>
          <SectionTitle>Notfallkontakt</SectionTitle>
          <InfoRow label="Name" value={client.emergency_contact_name} />
          <InfoRow label="Telefon" value={client.emergency_contact_phone} />
          <InfoRow label="Beziehung" value={client.emergency_contact_relationship} />
        </Card>

        {/* Angehörige */}
        <Card>
          <SectionTitle>Angehörige</SectionTitle>
          <InfoRow label="Name" value={client.next_of_kin_name} />
          <InfoRow label="Telefon" value={client.next_of_kin_phone} />
          <InfoRow label="E-Mail" value={client.next_of_kin_email} />
          <InfoRow label="Beziehung" value={client.next_of_kin_relationship} />
        </Card>

        {/* Hausarzt */}
        <Card>
          <SectionTitle>Hausarzt</SectionTitle>
          <InfoRow label="Name" value={client.hausarzt_name} />
          <InfoRow label="Telefon" value={client.hausarzt_phone} />
        </Card>

        <GoldButton
          onPress={() => router.push({ pathname: '/einsatz/notizen', params: { clientId: client.id } })}
        >
          Notizen zu diesem Klienten
        </GoldButton>

        <GhostButton onPress={() => router.back()} style={styles.closeBtn}>
          Schließen
        </GhostButton>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  scroll: { padding: 20, paddingTop: 28, paddingBottom: 40, gap: 14 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 },
  title: { color: Colors.ink, fontFamily: Fonts.bold, fontSize: 24 },
  subtitle: { color: Colors.ink3, fontFamily: Fonts.medium, fontSize: 14, marginTop: -6 },
  gateHint: { textAlign: 'center' },
  alertCard: { borderColor: 'rgba(208, 75, 59, 0.5)', backgroundColor: Colors.redPale },
  alertTitle: {
    color: Colors.red,
    fontFamily: Fonts.bold,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  alertBlock: { marginBottom: 10 },
  alertLabel: { color: Colors.ink2, fontFamily: Fonts.bold, fontSize: 13, marginBottom: 2 },
  alertValue: { color: Colors.ink, fontFamily: Fonts.regular, fontSize: 15, lineHeight: 21 },
  infoRow: { marginBottom: 10 },
  infoLabel: {
    color: Colors.ink4,
    fontFamily: Fonts.bold,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 2,
  },
  infoValue: { color: Colors.ink, fontFamily: Fonts.regular, fontSize: 15, lineHeight: 21 },
  closeBtn: { marginTop: 4 },
})
