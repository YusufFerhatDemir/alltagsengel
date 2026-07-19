import { useCallback, useEffect, useState } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { BodyText, Card, Chip, GhostButton, GoldButton, Input, Label, MutedText } from '../../components/ui'
import { Colors, Fonts } from '../../constants/theme'
import { useAuth } from '../../lib/auth-context'
import { supabase } from '../../lib/supabase'
import { useCaregiverRole } from '../../lib/use-caregiver-role'

// ═══════════════════════════════════════════════════════════
// NOTIZEN — Rollenübergreifendes Notizsystem (care_notes).
// Die Betreuungskraft sieht alle NICHT-internen Notizen ihrer
// zugewiesenen Klienten (auch von Büro/Kunde — RLS filtert
// is_internal=true serverseitig weg) und erstellt eigene
// Notizen mit Kategorie + Dringend-Markierung (author_role='engel').
// ═══════════════════════════════════════════════════════════

interface ClientOption {
  id: string
  name: string
}

interface CareNote {
  id: string
  author_role: string
  author_name: string
  category: string
  content: string
  is_urgent: boolean
  created_at: string
}

const CATEGORIES: { key: string; label: string }[] = [
  { key: 'allgemein', label: 'Allgemein' },
  { key: 'gesundheit', label: 'Gesundheit' },
  { key: 'verhalten', label: 'Verhalten' },
  { key: 'medikamente', label: 'Medikamente' },
  { key: 'vorfall', label: 'Vorfall' },
  { key: 'uebergabe', label: 'Übergabe' },
  { key: 'wunsch', label: 'Wunsch' },
  { key: 'beschwerde', label: 'Beschwerde' },
]

const ROLE_LABELS: Record<string, string> = {
  engel: 'Engel',
  kunde: 'Kunde',
  buero: 'Büro',
  pdl: 'PDL',
  admin: 'Büro',
}

function categoryLabel(key: string): string {
  return CATEGORIES.find(c => c.key === key)?.label ?? key
}

export default function NotizenScreen() {
  const router = useRouter()
  const { clientId: paramClientId } = useLocalSearchParams<{ clientId?: string }>()
  const { session } = useAuth()
  const { loading: roleLoading, allowed, caregiverId } = useCaregiverRole()

  const [clients, setClients] = useState<ClientOption[]>([])
  const [loadingClients, setLoadingClients] = useState(true)
  const [clientId, setClientId] = useState<string>(paramClientId ?? '')

  const [notes, setNotes] = useState<CareNote[]>([])
  const [loadingNotes, setLoadingNotes] = useState(false)

  const [authorName, setAuthorName] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [category, setCategory] = useState('allgemein')
  const [content, setContent] = useState('')
  const [isUrgent, setIsUrgent] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  // Zugewiesene Klienten + eigener Name (für author_name)
  useEffect(() => {
    let cancelled = false
    async function load() {
      const [clientRes, cgRes] = await Promise.all([
        supabase.from('clients').select('id, first_name, last_name').order('last_name'),
        caregiverId
          ? supabase.from('caregivers').select('first_name, last_name').eq('id', caregiverId).single()
          : Promise.resolve({ data: null } as any),
      ])
      if (cancelled) return
      const list = (clientRes.data || []).map((c: any) => ({
        id: c.id,
        name: [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unbekannt',
      }))
      setClients(list)
      if (!paramClientId && list.length === 1) setClientId(list[0].id)
      if (cgRes?.data) {
        setAuthorName([cgRes.data.first_name, cgRes.data.last_name].filter(Boolean).join(' '))
      }
      setLoadingClients(false)
    }
    if (allowed) load()
    return () => {
      cancelled = true
    }
  }, [allowed, caregiverId, paramClientId])

  const loadNotes = useCallback(async () => {
    if (!clientId) return
    setLoadingNotes(true)
    // RLS filtert: eigene Notizen + nicht-interne Notizen zugewiesener Klienten
    const { data } = await supabase
      .from('care_notes')
      .select('id, author_role, author_name, category, content, is_urgent, created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(100)
    setNotes((data || []) as CareNote[])
    setLoadingNotes(false)
  }, [clientId])

  useEffect(() => {
    loadNotes()
  }, [loadNotes])

  async function saveNote() {
    setError('')
    setInfo('')
    if (!session) return
    if (!clientId) {
      setError('Bitte zuerst einen Klienten auswählen.')
      return
    }
    if (!content.trim()) {
      setError('Bitte einen Notiz-Text eingeben.')
      return
    }

    setSaving(true)
    try {
      const { error: insErr } = await supabase.from('care_notes').insert({
        client_id: clientId,
        author_id: session.user.id,
        author_role: 'engel',
        author_name: authorName || 'Betreuungskraft',
        category,
        content: content.trim(),
        is_urgent: isUrgent,
      })

      if (insErr) {
        console.warn('Notiz-Insert Fehler:', insErr)
        setError('Notiz konnte nicht gespeichert werden. Bitte Netzverbindung prüfen und erneut versuchen.')
        setSaving(false)
        return
      }

      setContent('')
      setIsUrgent(false)
      setCategory('allgemein')
      setShowForm(false)
      setInfo('Notiz gespeichert.')
      loadNotes()
    } catch (err) {
      console.warn('Notiz-Fehler:', err)
      setError('Notiz konnte nicht gespeichert werden. Bitte erneut versuchen.')
    } finally {
      setSaving(false)
    }
  }

  if (roleLoading || (allowed && loadingClients)) {
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

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Notizen</Text>
        <BodyText style={styles.intro}>
          Übergabe-Notizen zum Klienten — sichtbar für Betreuungskräfte, Büro und Klient (keine internen
          Vermerke).
        </BodyText>

        {/* Klienten-Auswahl */}
        <Card>
          <Label>Klient</Label>
          {clients.length === 0 ? (
            <MutedText>Keine zugewiesenen Klienten gefunden.</MutedText>
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

        {/* Neue Notiz */}
        {clientId !== '' &&
          (showForm ? (
            <Card>
              <Text style={styles.cardTitle}>Neue Notiz</Text>
              <Label>Kategorie</Label>
              <View style={styles.chipWrap}>
                {CATEGORIES.map(c => (
                  <Chip key={c.key} active={category === c.key} onPress={() => setCategory(c.key)}>
                    {c.label}
                  </Chip>
                ))}
              </View>
              <View style={styles.contentBlock}>
                <Label>Notiz</Label>
                <Input
                  value={content}
                  onChangeText={setContent}
                  placeholder="Was sollen Büro und Kolleg:innen wissen?"
                  multiline
                  numberOfLines={4}
                  style={styles.contentInput}
                />
              </View>
              <Chip active={isUrgent} onPress={() => setIsUrgent(u => !u)} style={styles.urgentChip}>
                {isUrgent ? '⚑ Dringend — Büro wird informiert' : 'Als dringend markieren'}
              </Chip>
              <View style={styles.formActions}>
                <GhostButton onPress={() => setShowForm(false)} style={styles.halfBtn}>
                  Abbrechen
                </GhostButton>
                <GoldButton onPress={saveNote} loading={saving} style={styles.halfBtn}>
                  Speichern
                </GoldButton>
              </View>
            </Card>
          ) : (
            <GoldButton onPress={() => setShowForm(true)}>Neue Notiz schreiben</GoldButton>
          ))}

        {error !== '' && <Text style={styles.error}>{error}</Text>}
        {info !== '' && <Text style={styles.info}>{info}</Text>}

        {/* Notiz-Liste */}
        {clientId !== '' &&
          (loadingNotes ? (
            <ActivityIndicator color={Colors.gold} style={styles.spinner} />
          ) : notes.length === 0 ? (
            <Card>
              <MutedText>Noch keine Notizen zu diesem Klienten.</MutedText>
            </Card>
          ) : (
            notes.map(n => (
              <Card key={n.id} style={[styles.noteCard, n.is_urgent && styles.noteCardUrgent]}>
                <View style={styles.noteHeader}>
                  <Text style={styles.noteCategory}>{categoryLabel(n.category)}</Text>
                  {n.is_urgent && <Text style={styles.urgentBadge}>DRINGEND</Text>}
                </View>
                <Text style={styles.noteContent}>{n.content}</Text>
                <Text style={styles.noteMeta}>
                  {ROLE_LABELS[n.author_role] ?? n.author_role}
                  {n.author_name ? ` · ${n.author_name}` : ''} ·{' '}
                  {new Date(n.created_at).toLocaleString('de-DE', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}{' '}
                  Uhr
                </Text>
              </Card>
            ))
          ))}

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
  intro: {},
  gateHint: { textAlign: 'center' },
  cardTitle: { color: Colors.ink, fontFamily: Fonts.semibold, fontSize: 16, marginBottom: 10 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  contentBlock: { marginTop: 14 },
  contentInput: { minHeight: 100, textAlignVertical: 'top' },
  urgentChip: { marginTop: 12 },
  formActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  halfBtn: { flex: 1 },
  error: { color: Colors.red, fontFamily: Fonts.regular, fontSize: 13 },
  info: { color: Colors.green, fontFamily: Fonts.medium, fontSize: 13 },
  spinner: { marginTop: 12 },
  noteCard: { gap: 8 },
  noteCardUrgent: { borderColor: 'rgba(208, 75, 59, 0.5)', backgroundColor: Colors.redPale },
  noteHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  noteCategory: {
    color: Colors.goldBright,
    fontFamily: Fonts.bold,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  urgentBadge: { color: Colors.red, fontFamily: Fonts.bold, fontSize: 11, letterSpacing: 1 },
  noteContent: { color: Colors.ink, fontFamily: Fonts.regular, fontSize: 15, lineHeight: 22 },
  noteMeta: { color: Colors.ink4, fontFamily: Fonts.regular, fontSize: 12 },
  closeBtn: { marginTop: 6 },
})
