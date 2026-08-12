import { useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import BundeslandStatus from '../../components/BundeslandStatus'
import LeadForm from '../../components/LeadForm'
import { BodyText, Card, GoldButton, Input, MutedText } from '../../components/ui'
import { Colors, Fonts } from '../../constants/theme'
import { pruefePlz, type Zone } from '../../lib/plz'

// ═══════════════════════════════════════════════════════════
// EINZUGSGEBIET — PLZ-Check: Frankfurt + 30 km Umkreis
// PLZ-Logik identisch mit der Web-App (lib/plz.ts).
// ═══════════════════════════════════════════════════════════

const KERNGEBIET = [
  'Frankfurt am Main — alle Stadtteile inkl. Höchst',
  'Offenbach und Kreis Offenbach (Neu-Isenburg, Dreieich, Langen, Dietzenbach, Rodgau)',
  'Hanau, Maintal und Bruchköbel',
  'Bad Homburg, Oberursel und der Hochtaunuskreis',
  'Main-Taunus-Kreis: Eschborn, Hofheim, Kelkheim, Bad Soden',
  'Rüsselsheim, Kelsterbach, Mörfelden-Walldorf und Groß-Gerau',
  'Darmstadt und Bad Vilbel / Wetterau (Süd)',
]

export default function EinzugsgebietScreen() {
  const [plz, setPlz] = useState('')
  const [ergebnis, setErgebnis] = useState<{ zone: Zone; region: string } | null>(null)

  function checken() {
    if (!/^[0-9]{5}$/.test(plz)) return
    setErgebnis(pruefePlz(plz))
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Einzugsgebiet</Text>
        <BodyText style={styles.intro}>
          Frankfurt am Main und 30 km Umkreis — geben Sie Ihre Postleitzahl ein und sehen Sie sofort,
          ob wir zu Ihnen kommen.
        </BodyText>

        <Card>
          <View style={styles.checkRow}>
            <Input
              placeholder="Ihre PLZ, z. B. 60313"
              value={plz}
              onChangeText={v => {
                setPlz(v.replace(/\D/g, '').slice(0, 5))
                setErgebnis(null)
              }}
              keyboardType="number-pad"
              maxLength={5}
              style={styles.plzInput}
            />
            <GoldButton onPress={checken} disabled={plz.length !== 5} style={styles.checkBtn}>
              Prüfen
            </GoldButton>
          </View>

          {ergebnis?.zone === 'kern' && (
            <View style={styles.resultKern}>
              <Text style={styles.resultKernTitle}>✓ Ja, wir sind bei Ihnen verfügbar! ({ergebnis.region})</Text>
              <Text style={styles.resultText}>
                Rufen Sie uns an oder senden Sie unten eine Anfrage — wir melden uns umgehend.
              </Text>
            </View>
          )}
          {ergebnis?.zone === 'rand' && (
            <View style={styles.resultRand}>
              <Text style={styles.resultRandTitle}>Randgebiet ({ergebnis.region}) — fragen Sie uns an!</Text>
              <Text style={styles.resultText}>
                Sie liegen knapp außerhalb unseres Kerngebiets. Oft können wir trotzdem helfen —
                nutzen Sie einfach das Formular unten.
              </Text>
            </View>
          )}
          {ergebnis !== null && ergebnis.zone === null && (
            <View style={styles.resultAusserhalb}>
              <Text style={styles.resultAusserhalbTitle}>Leider noch nicht in Ihrem Gebiet.</Text>
              <Text style={styles.resultText}>
                Wir wachsen schnell — hinterlassen Sie unten Ihre Kontaktdaten, wir melden uns, sobald
                wir Ihre Region erreichen.
              </Text>
            </View>
          )}

          {/* Bundesland-Freischaltung: Kasse, Privat oder Vormerkung.
              Quelle ist state_settings über /api/expansion/status — die
              Anzeige folgt automatisch jeder Freischaltung im Admin. */}
          {ergebnis !== null && <BundeslandStatus plz={plz} />}

          <MutedText style={styles.mapNote}>
            Kerngebiet: Frankfurt am Main (PLZ 60313) + 30 km Umkreis
          </MutedText>
        </Card>

        <Card style={styles.section}>
          <Text style={styles.h3}>Unser Kerngebiet im Überblick</Text>
          <BodyText style={styles.kernIntro}>
            Von unserem Standort in der Frankfurter Innenstadt (Neue Mainzer Straße 66-68, 60311)
            erreichen wir das gesamte Rhein-Main-Gebiet:
          </BodyText>
          {KERNGEBIET.map(ort => (
            <View key={ort} style={styles.ortRow}>
              <Text style={styles.ortBullet}>•</Text>
              <BodyText style={styles.ortText}>{ort}</BodyText>
            </View>
          ))}
        </Card>

        <Card style={styles.section}>
          <Text style={styles.h3}>Ihre Region war nicht dabei?</Text>
          <BodyText style={styles.leadIntro}>
            Wir wachsen schnell. Hinterlassen Sie Ihre Nummer — wir prüfen kostenlos, ob wir Sie schon
            versorgen können, und melden uns umgehend zurück.
          </BodyText>
        </Card>
        <View style={styles.leadSection}>
          <LeadForm defaultService="Alltagsbegleitung" source="ios-app-einzugsgebiet" />
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
  checkRow: { flexDirection: 'row', gap: 10 },
  plzInput: { flex: 1, letterSpacing: 2 },
  checkBtn: { paddingHorizontal: 18 },
  resultKern: {
    backgroundColor: 'rgba(45,106,79,0.15)',
    borderColor: Colors.greenBorder,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginTop: 10,
  },
  resultKernTitle: { color: '#7DBE9C', fontFamily: Fonts.bold, fontSize: 14 },
  resultRand: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: 'rgba(201,150,60,0.25)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginTop: 10,
  },
  resultRandTitle: { color: Colors.goldBright, fontFamily: Fonts.bold, fontSize: 14 },
  resultAusserhalb: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: Colors.inputBorder,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginTop: 10,
  },
  resultAusserhalbTitle: { color: Colors.ink, fontFamily: Fonts.bold, fontSize: 14 },
  resultText: { color: Colors.ink2, fontFamily: Fonts.regular, fontSize: 13, lineHeight: 19, marginTop: 4 },
  mapNote: { textAlign: 'center', marginTop: 14 },
  section: { marginTop: 16 },
  h3: { color: Colors.ink, fontFamily: Fonts.bold, fontSize: 17, marginBottom: 8 },
  kernIntro: { marginBottom: 12 },
  ortRow: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  ortBullet: { color: Colors.gold, fontSize: 15, lineHeight: 22 },
  ortText: { flex: 1 },
  leadIntro: { marginBottom: 0 },
  leadSection: { marginTop: 16 },
})
