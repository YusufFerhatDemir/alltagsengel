import { useMemo, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import LeadForm from '../../components/LeadForm'
import { BodyText, Card, Chip, Label, MutedText } from '../../components/ui'
import { MONATSBETRAG } from '../../constants/config'
import { Colors, Fonts } from '../../constants/theme'

// ═══════════════════════════════════════════════════════════
// BUDGETRECHNER — Entlastungsbetrag §45b SGB XI
// Logik identisch mit components/BudgetRechner.tsx (Web):
// 131 €/Monat, Restbudget, Übertrag (verfällt 30.06.),
// Umwandlungsanspruch §45a Abs. 4 (bis 40 % der Sachleistung).
// ═══════════════════════════════════════════════════════════

const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
const MONATE_KURZ = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']
const SACHLEISTUNG: Record<number, number> = { 2: 796, 3: 1497, 4: 1859, 5: 2299 }

function euro(n: number): string {
  return n.toLocaleString('de-DE', { maximumFractionDigits: 0 }) + ' €'
}

export default function BudgetrechnerScreen() {
  const now = new Date()
  const jahr = now.getFullYear()
  const aktuellerMonat = now.getMonth()

  const [pflegegrad, setPflegegrad] = useState(2)
  const [seitMonat, setSeitMonat] = useState(-1) // -1 = Vorjahr oder früher
  const [nutzung, setNutzung] = useState<'nichts' | 'teilweise' | 'voll'>('nichts')

  const ergebnis = useMemo(() => {
    const startMonat = seitMonat === -1 ? 0 : seitMonat
    const monate = Math.max(0, aktuellerMonat - startMonat + 1)
    const angespart = monate * MONATSBETRAG

    const genutztProMonat = nutzung === 'voll' ? MONATSBETRAG : nutzung === 'teilweise' ? Math.round(MONATSBETRAG / 2) : 0
    const genutzt = monate * genutztProMonat
    const verfuegbar = angespart - genutzt

    const restMonate = 11 - aktuellerMonat
    const nochKommend = restMonate * MONATSBETRAG
    const jahresPotenzial = verfuegbar + nochKommend

    const uebertragAktiv = seitMonat === -1 && (now.getMonth() < 6 || (now.getMonth() === 5 && now.getDate() <= 30))
    const uebertragMax = 12 * MONATSBETRAG

    const umwandlung = pflegegrad >= 2 ? Math.round(SACHLEISTUNG[pflegegrad] * 0.4) : 0

    return { monate, angespart, genutzt, verfuegbar, nochKommend, jahresPotenzial, uebertragAktiv, uebertragMax, umwandlung, startMonat }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pflegegrad, seitMonat, nutzung, aktuellerMonat])

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Budgetrechner</Text>
        <BodyText style={styles.intro}>
          131 € stehen Ihnen jeden Monat zu (§45b SGB XI) — rund 60 % davon bleiben deutschlandweit
          ungenutzt. Berechnen Sie in 10 Sekunden Ihr Restbudget.
        </BodyText>

        <Card>
          {/* Pflegegrad */}
          <Label>Ihr Pflegegrad</Label>
          <View style={styles.chipRow}>
            {[1, 2, 3, 4, 5].map(pg => (
              <Chip key={pg} active={pflegegrad === pg} onPress={() => setPflegegrad(pg)} style={styles.pgChip}>
                PG {pg}
              </Chip>
            ))}
          </View>

          {/* Anerkannt seit */}
          <Label>Pflegegrad anerkannt seit</Label>
          <View style={styles.chipRow}>
            <Chip active={seitMonat === -1} onPress={() => setSeitMonat(-1)}>
              {jahr - 1} oder früher
            </Chip>
            {MONATE.slice(0, aktuellerMonat + 1).map((m, i) => (
              <Chip key={m} active={seitMonat === i} onPress={() => setSeitMonat(i)}>
                {MONATE_KURZ[i]} {jahr}
              </Chip>
            ))}
          </View>

          {/* Nutzung */}
          <Label>Wie viel nutzen Sie davon bisher?</Label>
          <View style={styles.chipRow}>
            <Chip active={nutzung === 'nichts'} onPress={() => setNutzung('nichts')}>Gar nichts</Chip>
            <Chip active={nutzung === 'teilweise'} onPress={() => setNutzung('teilweise')}>Etwa die Hälfte</Chip>
            <Chip active={nutzung === 'voll'} onPress={() => setNutzung('voll')}>Alles (131 €/Monat)</Chip>
          </View>

          {/* Ergebnis */}
          <View style={styles.resultBox}>
            <Text style={styles.resultLabel}>Ihr ungenutztes Budget in {jahr} — Stand heute</Text>
            <Text style={styles.resultValue}>{euro(ergebnis.verfuegbar)}</Text>
            <Text style={styles.resultDetail}>
              {ergebnis.monate} {ergebnis.monate === 1 ? 'Monat' : 'Monate'} × 131 € = {euro(ergebnis.angespart)}
              {ergebnis.genutzt > 0 ? ` − ${euro(ergebnis.genutzt)} bereits genutzt` : ''}
            </Text>
          </View>

          {/* Monats-Visualisierung */}
          <View style={styles.monthGrid}>
            {MONATE_KURZ.map((m, i) => {
              const angesparter = i >= ergebnis.startMonat && i <= aktuellerMonat
              const zukunft = i > aktuellerMonat
              return (
                <View key={m} style={styles.monthCol}>
                  <View
                    style={[
                      styles.monthBar,
                      angesparter && styles.monthBarActive,
                      zukunft && styles.monthBarFuture,
                      angesparter && nutzung === 'voll' && styles.monthBarUsed,
                    ]}
                  />
                  <Text style={styles.monthLbl}>{m}</Text>
                </View>
              )
            })}
          </View>
          <MutedText style={styles.monthLegend}>
            ■ angespart · ▢ kommt noch: {euro(ergebnis.nochKommend)}
          </MutedText>

          {/* Zusatz-Infos */}
          <View style={styles.infoStack}>
            <View style={styles.infoRow}>
              <Text style={styles.infoRowLabel}>Möglich bis Jahresende {jahr}</Text>
              <Text style={styles.infoRowValue}>{euro(ergebnis.jahresPotenzial)}</Text>
            </View>

            {seitMonat === -1 && (
              ergebnis.uebertragAktiv ? (
                <View style={styles.uebertragBox}>
                  <Text style={styles.uebertragText}>
                    Übertrag aus {jahr - 1}: Nicht genutzte Beträge aus dem Vorjahr (bis zu{' '}
                    {euro(ergebnis.uebertragMax)}) können Sie noch bis zum 30.06.{jahr} einsetzen —
                    danach verfallen sie.
                  </Text>
                </View>
              ) : (
                <View style={styles.infoRow}>
                  <Text style={styles.infoNote}>
                    Ein Übertrag aus {jahr - 1} ist zum 30.06.{jahr} verfallen. Damit das {jahr} nicht
                    wieder passiert: Budget jetzt nutzen.
                  </Text>
                </View>
              )
            )}

            {ergebnis.umwandlung > 0 && (
              <View style={styles.tippBox}>
                <Text style={styles.tippText}>
                  <Text style={styles.tippStrong}>Extra-Tipp (PG {pflegegrad}): </Text>
                  Über den Umwandlungsanspruch (§45a Abs. 4 SGB XI) können Sie zusätzlich bis zu{' '}
                  <Text style={styles.tippStrong}>{euro(ergebnis.umwandlung)}/Monat</Text> aus Ihrer
                  Pflegesachleistung für Alltagsbegleitung einsetzen — wenn Sie keinen oder nicht den
                  vollen Pflegedienst nutzen. Wir prüfen das kostenlos für Sie.
                </Text>
              </View>
            )}
          </View>

          <MutedText style={styles.disclaimer}>
            Unverbindliche Modellrechnung (Stand {jahr}, Entlastungsbetrag 131 €/Monat nach §45b SGB
            XI). Maßgeblich ist die Auskunft Ihrer Pflegekasse — wir übernehmen die Klärung gern für Sie.
          </MutedText>
        </Card>

        <View style={styles.leadSection}>
          <LeadForm defaultService="Alltagsbegleitung" source="ios-app-budgetrechner" />
        </View>
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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  pgChip: { minWidth: 56 },
  resultBox: {
    backgroundColor: 'rgba(201,150,60,0.1)',
    borderColor: Colors.goldBorder,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 22,
    paddingHorizontal: 18,
    alignItems: 'center',
    marginBottom: 18,
  },
  resultLabel: { color: Colors.ink2, fontFamily: Fonts.regular, fontSize: 13, marginBottom: 4 },
  resultValue: { color: Colors.goldBright, fontFamily: Fonts.bold, fontSize: 42, lineHeight: 48 },
  resultDetail: { color: Colors.ink3, fontFamily: Fonts.regular, fontSize: 13, marginTop: 6, textAlign: 'center' },
  monthGrid: { flexDirection: 'row', gap: 4, marginBottom: 8 },
  monthCol: { flex: 1, alignItems: 'center' },
  monthBar: {
    alignSelf: 'stretch',
    height: 34,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  monthBarActive: { backgroundColor: Colors.gold },
  monthBarFuture: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.goldBorder,
  },
  monthBarUsed: { opacity: 0.35 },
  monthLbl: { color: Colors.ink4, fontFamily: Fonts.regular, fontSize: 8, marginTop: 3 },
  monthLegend: { textAlign: 'center', marginBottom: 18 },
  infoStack: { gap: 10 },
  infoRow: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  infoRowLabel: { color: Colors.ink2, fontFamily: Fonts.regular, fontSize: 13, flex: 1 },
  infoRowValue: { color: Colors.ink, fontFamily: Fonts.bold, fontSize: 16 },
  infoNote: { color: Colors.ink3, fontFamily: Fonts.regular, fontSize: 13, lineHeight: 19, flex: 1 },
  uebertragBox: {
    backgroundColor: 'rgba(45,106,79,0.12)',
    borderColor: 'rgba(45,106,79,0.3)',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  uebertragText: { color: '#7DBE9C', fontFamily: Fonts.regular, fontSize: 13, lineHeight: 19 },
  tippBox: {
    backgroundColor: Colors.goldFaint,
    borderColor: 'rgba(201,150,60,0.2)',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  tippText: { color: Colors.ink2, fontFamily: Fonts.regular, fontSize: 13, lineHeight: 19 },
  tippStrong: { color: Colors.goldBright, fontFamily: Fonts.bold },
  disclaimer: { marginTop: 16 },
  leadSection: { marginTop: 16 },
})
