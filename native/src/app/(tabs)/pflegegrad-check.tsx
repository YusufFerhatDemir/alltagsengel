import { useMemo, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import LeadForm from '../../components/LeadForm'
import { BodyText, Card, Chip, GhostButton, GoldButton, MutedText } from '../../components/ui'
import { Colors, Fonts } from '../../constants/theme'

// ═══════════════════════════════════════════════════════════
// PFLEGEGRAD-CHECK — Selbsteinschätzung nach NBA-Systematik
// Logik identisch mit components/PflegegradCheck.tsx (Web):
// 6 Module, offizielle Gewichtung, M2/M3 höherer Wert zählt.
// Schwellen: 12,5 / 27 / 47,5 / 70 / 90 Punkte → PG 1–5.
// ═══════════════════════════════════════════════════════════

const ANTWORTEN_HILFE = ['Selbstständig', 'Mit etwas Hilfe', 'Mit viel Hilfe', 'Nur mit voller Hilfe']
const ANTWORTEN_OFT = ['Nie', 'Selten', 'Häufig', '(Fast) täglich']

interface Modul {
  titel: string
  icon: string
  intro: string
  antworten: string[]
  fragen: string[]
}

const MODULE: Modul[] = [
  {
    titel: 'Mobilität',
    icon: '🚶',
    intro: 'Wie selbstständig bewegt sich die Person?',
    antworten: ANTWORTEN_HILFE,
    fragen: [
      'Innerhalb der Wohnung von Raum zu Raum gehen',
      'Aufstehen aus Bett oder Sessel und Umsetzen',
      'Treppensteigen',
    ],
  },
  {
    titel: 'Geistige Fähigkeiten',
    icon: '🧠',
    intro: 'Wie gut gelingen Orientierung und Verständigung?',
    antworten: ['Ohne Probleme', 'Leicht eingeschränkt', 'Stark eingeschränkt', 'Kaum / gar nicht möglich'],
    fragen: [
      'Zeitliche und örtliche Orientierung (Tag, Datum, Ort)',
      'Gespräche führen und Bedürfnisse mitteilen',
      'Erinnern an wichtige Ereignisse und Absprachen',
    ],
  },
  {
    titel: 'Verhalten & Unruhe',
    icon: '🌙',
    intro: 'Wie oft treten diese Situationen auf?',
    antworten: ANTWORTEN_OFT,
    fragen: [
      'Nächtliche Unruhe oder umgekehrter Tag-Nacht-Rhythmus',
      'Ängste, Niedergeschlagenheit oder Reizbarkeit',
      'Abwehr von Hilfe oder Pflege',
    ],
  },
  {
    titel: 'Selbstversorgung',
    icon: '🛁',
    intro: 'Wie selbstständig gelingt die tägliche Versorgung?',
    antworten: ANTWORTEN_HILFE,
    fragen: [
      'Waschen und Duschen',
      'An- und Auskleiden',
      'Essen und Trinken',
      'Toilettengang',
    ],
  },
  {
    titel: 'Umgang mit Krankheit & Therapie',
    icon: '💊',
    intro: 'Wie viel Unterstützung ist medizinisch nötig?',
    antworten: ANTWORTEN_OFT,
    fragen: [
      'Hilfe bei Medikamenten-Einnahme',
      'Begleitung zu Arztbesuchen oder Therapien',
      'Hilfe bei Messungen, Verbänden oder Injektionen',
    ],
  },
  {
    titel: 'Alltag & soziale Kontakte',
    icon: '☕',
    intro: 'Wie selbstständig wird der Alltag gestaltet?',
    antworten: ANTWORTEN_HILFE,
    fragen: [
      'Den Tagesablauf selbst planen und gestalten',
      'Sich selbst beschäftigen (Hobbys, Lesen, Fernsehen)',
      'Kontakte zu Familie und Freunden pflegen',
    ],
  },
]

const GEWICHTE = [10, 15, 15, 40, 20, 15]
const PFLEGEGELD: Record<number, number> = { 2: 347, 3: 599, 4: 800, 5: 990 }

function berechnePunkte(antworten: number[][]): number {
  const modulWerte = MODULE.map((m, i) => {
    const werte = antworten[i]
    const max = m.fragen.length * 3
    return werte.reduce((s, v) => s + v, 0) / max
  })
  const kognitionVerhalten = Math.max(modulWerte[1], modulWerte[2])
  const score =
    modulWerte[0] * GEWICHTE[0] +
    kognitionVerhalten * 15 +
    modulWerte[3] * GEWICHTE[3] +
    modulWerte[4] * GEWICHTE[4] +
    modulWerte[5] * GEWICHTE[5]
  return Math.round(score * 10) / 10
}

function punkteZuPflegegrad(punkte: number): number {
  if (punkte >= 90) return 5
  if (punkte >= 70) return 4
  if (punkte >= 47.5) return 3
  if (punkte >= 27) return 2
  if (punkte >= 12.5) return 1
  return 0
}

export default function PflegegradCheckScreen() {
  const [schritt, setSchritt] = useState(0) // 0..5 Module, 6 = Ergebnis
  const [antworten, setAntworten] = useState<number[][]>(MODULE.map(m => m.fragen.map(() => -1)))

  const modulKomplett = schritt < 6 && antworten[schritt].every(v => v >= 0)
  const punkte = useMemo(() => berechnePunkte(antworten.map(a => a.map(v => Math.max(0, v)))), [antworten])
  const pg = punkteZuPflegegrad(punkte)

  function setAntwort(frage: number, wert: number) {
    setAntworten(prev => prev.map((a, i) => (i === schritt ? a.map((v, j) => (j === frage ? wert : v)) : a)))
  }

  function neuStarten() {
    setSchritt(0)
    setAntworten(MODULE.map(m => m.fragen.map(() => -1)))
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Pflegegrad-Check</Text>
        <BodyText style={styles.intro}>
          Kostenlose Ersteinschätzung in 2 Minuten — nach der Systematik des offiziellen
          Begutachtungsverfahrens (6 Module). Sofortiges Ergebnis mit Leistungsübersicht.
        </BodyText>

        {schritt === 6 ? (
          <Card>
            <Text style={styles.resultLabel}>Ihre unverbindliche Ersteinschätzung</Text>
            {pg > 0 ? (
              <>
                <Text style={styles.resultPg}>Pflegegrad {pg}</Text>
                <Text style={styles.resultPunkte}>≈ {punkte.toFixed(1).replace('.', ',')} von 100 Punkten</Text>
              </>
            ) : (
              <>
                <Text style={styles.resultKeinPg}>Voraussichtlich noch kein Pflegegrad</Text>
                <Text style={styles.resultPunkte}>
                  ≈ {punkte.toFixed(1).replace('.', ',')} von 100 Punkten (ab 12,5 beginnt Pflegegrad 1)
                </Text>
              </>
            )}

            {pg > 0 && (
              <View style={styles.leistungen}>
                <View style={[styles.leistungRow, styles.leistungGold]}>
                  <Text style={styles.leistungLabel}>Entlastungsbetrag (§45b) — z. B. für Alltagsengel</Text>
                  <Text style={styles.leistungGoldVal}>131 €/Monat</Text>
                </View>
                {pg >= 2 && (
                  <View style={styles.leistungRow}>
                    <Text style={styles.leistungLabel}>Pflegegeld bei häuslicher Pflege</Text>
                    <Text style={styles.leistungVal}>{PFLEGEGELD[pg]} €/Monat</Text>
                  </View>
                )}
                <View style={styles.leistungRow}>
                  <Text style={styles.leistungLabel}>Pflegehilfsmittel (§40) — z. B. unsere Pflege-Box</Text>
                  <Text style={styles.leistungVal}>42 €/Monat</Text>
                </View>
              </View>
            )}

            <MutedText style={styles.resultHinweis}>
              Dies ist eine Orientierung auf Basis Ihrer Angaben — den Pflegegrad legt der Medizinische
              Dienst nach einer Begutachtung fest.{' '}
              {pg === 0
                ? 'Auch wenn es knapp ist: Ein Antrag lohnt sich oft, wir beraten Sie gern.'
                : 'Wir helfen Ihnen kostenlos beim Antrag und bei der Vorbereitung auf die Begutachtung.'}
            </MutedText>

            <View style={styles.resultLead}>
              <LeadForm defaultService="Allgemein" source="ios-app-pflegegrad-check" />
            </View>

            <GhostButton onPress={neuStarten} style={styles.restart}>Check neu starten</GhostButton>
          </Card>
        ) : (
          <Card>
            {/* Fortschritt */}
            <View style={styles.progress}>
              {MODULE.map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.progressSeg,
                    i < schritt && styles.progressDone,
                    i === schritt && styles.progressCurrent,
                  ]}
                />
              ))}
            </View>
            <Text style={styles.schrittLabel}>Schritt {schritt + 1} von 6</Text>
            <Text style={styles.modulTitel}>
              {MODULE[schritt].icon} {MODULE[schritt].titel}
            </Text>
            <Text style={styles.modulIntro}>{MODULE[schritt].intro}</Text>

            <View style={styles.fragen}>
              {MODULE[schritt].fragen.map((frage, fi) => (
                <View key={frage}>
                  <Text style={styles.frage}>{frage}</Text>
                  <View style={styles.antwortGrid}>
                    {MODULE[schritt].antworten.map((a, ai) => (
                      <Chip
                        key={a}
                        active={antworten[schritt][fi] === ai}
                        onPress={() => setAntwort(fi, ai)}
                        style={styles.antwortChip}
                      >
                        {a}
                      </Chip>
                    ))}
                  </View>
                </View>
              ))}
            </View>

            <View style={styles.navRow}>
              {schritt > 0 && (
                <GhostButton onPress={() => setSchritt(s => s - 1)} style={styles.backBtn}>
                  Zurück
                </GhostButton>
              )}
              <GoldButton
                onPress={() => modulKomplett && setSchritt(s => s + 1)}
                disabled={!modulKomplett}
                style={styles.nextBtn}
              >
                {schritt === 5 ? 'Ergebnis anzeigen' : 'Weiter'}
              </GoldButton>
            </View>
            {!modulKomplett && (
              <MutedText style={styles.hinweis}>Bitte beantworten Sie alle Fragen dieses Schritts.</MutedText>
            )}
          </Card>
        )}

        <Card style={styles.wissenswert}>
          <Text style={styles.wissenswertTitel}>Gut zu wissen</Text>
          <BodyText>
            • Schon ab Pflegegrad 1: 131 €/Monat Entlastungsbetrag — z. B. für Alltagsbegleitung durch
            Alltagsengel{'\n'}• Der Antrag bei der Pflegekasse ist formlos und kostenlos{'\n'}• Leistungen
            gelten ab dem Monat der Antragstellung — früh stellen lohnt sich{'\n'}• Bei Ablehnung ist ein
            Widerspruch innerhalb eines Monats möglich
          </BodyText>
        </Card>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  scroll: { padding: 16, paddingBottom: 40 },
  title: {
    color: Colors.ink,
    fontFamily: Fonts.bold,
    fontSize: 26,
    marginTop: 8,
    marginBottom: 8,
  },
  intro: { marginBottom: 18 },
  progress: { flexDirection: 'row', gap: 4, marginBottom: 18 },
  progressSeg: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.08)' },
  progressDone: { backgroundColor: Colors.gold },
  progressCurrent: { backgroundColor: 'rgba(201,150,60,0.5)' },
  schrittLabel: {
    color: Colors.ink3,
    fontFamily: Fonts.bold,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  modulTitel: { color: Colors.ink, fontFamily: Fonts.bold, fontSize: 20, marginBottom: 2 },
  modulIntro: { color: Colors.ink3, fontFamily: Fonts.regular, fontSize: 13, marginBottom: 18 },
  fragen: { gap: 16 },
  frage: { color: Colors.ink2, fontFamily: Fonts.regular, fontSize: 14, lineHeight: 20, marginBottom: 8 },
  antwortGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  antwortChip: { flexBasis: '48%', flexGrow: 1 },
  navRow: { flexDirection: 'row', gap: 10, marginTop: 22 },
  backBtn: { flex: 1 },
  nextBtn: { flex: 2 },
  hinweis: { textAlign: 'center', marginTop: 8 },
  resultLabel: {
    color: Colors.ink3,
    fontFamily: Fonts.regular,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 6,
  },
  resultPg: {
    color: Colors.goldBright,
    fontFamily: Fonts.bold,
    fontSize: 40,
    textAlign: 'center',
  },
  resultKeinPg: {
    color: Colors.ink,
    fontFamily: Fonts.bold,
    fontSize: 24,
    textAlign: 'center',
  },
  resultPunkte: {
    color: Colors.ink2,
    fontFamily: Fonts.regular,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 18,
  },
  leistungen: { gap: 10, marginBottom: 18 },
  leistungRow: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  leistungGold: {
    backgroundColor: 'rgba(201,150,60,0.1)',
    borderColor: 'rgba(201,150,60,0.3)',
    borderWidth: 1,
  },
  leistungLabel: { color: Colors.ink2, fontFamily: Fonts.regular, fontSize: 13, flex: 1 },
  leistungVal: { color: Colors.ink, fontFamily: Fonts.bold, fontSize: 15 },
  leistungGoldVal: { color: Colors.goldBright, fontFamily: Fonts.bold, fontSize: 15 },
  resultHinweis: { marginBottom: 18 },
  resultLead: { marginHorizontal: -20, marginBottom: 4 },
  restart: { marginTop: 14 },
  wissenswert: { marginTop: 16 },
  wissenswertTitel: { color: Colors.ink, fontFamily: Fonts.bold, fontSize: 17, marginBottom: 8 },
})
