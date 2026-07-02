import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import LeadForm from '../../components/LeadForm'
import { BodyText, Card, GhostButton, GoldButton } from '../../components/ui'
import { Colors, Fonts } from '../../constants/theme'
import { useAuth } from '../../lib/auth-context'
import { supabase } from '../../lib/supabase'

// ═══════════════════════════════════════════════════════════
// HOME — „Mit Herz für dich da"
// Drei Leistungen: Alltagsbegleitung · Pflege-Box · Krankenfahrt
// ═══════════════════════════════════════════════════════════

const ANGEBOTE = [
  {
    badge: 'Angebot 1 · Alltagsbegleitung',
    titel: 'Zertifizierte Alltagsbegleitung nach §45a SGB XI',
    text:
      'Einkaufshilfe, Arztbegleitung, gemeinsame Spaziergänge, Haushaltshilfe und psychosoziale Betreuung. ' +
      'Ab Pflegegrad 1 über den Entlastungsbetrag nach §45b SGB XI finanziert — 131 € pro Monat ' +
      '(1.572 € pro Jahr), direkt mit der Pflegekasse abgerechnet. Ihr Eigenanteil: 0 €.',
    kennzahl: '131 €',
    kennzahlSub: 'pro Monat · ab Pflegegrad 1',
  },
  {
    badge: 'Angebot 2 · Pflege-Box',
    titel: 'Pflegehilfsmittel kostenlos von der Pflegekasse',
    text:
      'Bei Pflegegrad 1–5 zahlt Ihre Pflegekasse nach §40 SGB XI bis zu 42 € pro Monat für ' +
      'Pflegehilfsmittel zum Verbrauch: Handschuhe, Desinfektion, Bettschutz, Masken, Schürzen. ' +
      'Ihr Eigenanteil: 0 € — wir kümmern uns um Antrag und monatliche Lieferung.',
    kennzahl: '0 €',
    kennzahlSub: 'Eigenanteil pro Monat',
  },
  {
    badge: 'Angebot 3 · Krankenfahrt',
    titel: 'Sicher zu Arzt, Therapie & Klinik',
    text:
      'Mit ärztlicher Verordnung übernimmt die Krankenkasse nach §60 SGB V die Kosten ' +
      '(gesetzliche Zuzahlung 10 %, mind. 5 €, höchstens 10 € pro Fahrt). ' +
      'Ohne Verordnung fahren wir Sie als Selbstzahler — transparent und zuverlässig.',
    kennzahl: '§60',
    kennzahlSub: 'SGB V · Kassenabrechnung',
  },
]

export default function HomeScreen() {
  const router = useRouter()
  const { session } = useAuth()

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.hero}>
          <Image
            source={require('../../../assets/images/splash-icon.png')}
            style={styles.logo}
            contentFit="contain"
          />
          <Text style={styles.brand}>ALLTAGSENGEL</Text>
          <Text style={styles.tagline}>Alltagsbegleitung · Pflege-Box · Krankenfahrt</Text>
          <Text style={styles.region}>Frankfurt · Rhein-Main · über die App</Text>
          <View style={styles.divider} />
          {session ? (
            <View style={styles.heroButtons}>
              <BodyText style={styles.loggedIn}>Angemeldet als {session.user.email}</BodyText>
              <GhostButton onPress={() => supabase.auth.signOut()}>Abmelden</GhostButton>
            </View>
          ) : (
            <View style={styles.heroButtons}>
              <GoldButton onPress={() => router.push('/auth/register')}>JETZT STARTEN</GoldButton>
              <GhostButton onPress={() => router.push('/auth/login')}>
                Ich habe bereits ein Konto
              </GhostButton>
            </View>
          )}
        </View>

        {/* Trust-Zeile */}
        <View style={styles.trustRow}>
          <View style={styles.trustItem}>
            <Text style={styles.trustVal}>0 €</Text>
            <Text style={styles.trustLbl}>Eigenanteil</Text>
          </View>
          <View style={styles.trustSep} />
          <View style={styles.trustItem}>
            <Text style={styles.trustVal}>§40</Text>
            <Text style={styles.trustLbl}>SGB XI</Text>
          </View>
          <View style={styles.trustSep} />
          <View style={styles.trustItem}>
            <Text style={styles.trustVal}>Rhein-Main</Text>
            <Text style={styles.trustLbl}>Region</Text>
          </View>
        </View>

        {/* Angebote */}
        {ANGEBOTE.map(a => (
          <Card key={a.badge} style={styles.section}>
            <Text style={styles.badge}>{a.badge}</Text>
            <Text style={styles.h2}>{a.titel}</Text>
            <BodyText>{a.text}</BodyText>
            <View style={styles.kennzahlBox}>
              <Text style={styles.kennzahl}>{a.kennzahl}</Text>
              <Text style={styles.kennzahlSub}>{a.kennzahlSub}</Text>
            </View>
          </Card>
        ))}

        {/* Schnellzugriff */}
        <Card style={styles.section}>
          <Text style={styles.badge}>Schnell geprüft</Text>
          <Text style={styles.h2}>Ihre Ansprüche in 2 Minuten</Text>
          <View style={styles.quickButtons}>
            <GoldButton onPress={() => router.push('/budgetrechner')}>
              Restbudget berechnen (131 €/Monat)
            </GoldButton>
            <GhostButton onPress={() => router.push('/pflegegrad-check')}>
              Pflegegrad-Check starten
            </GhostButton>
            <GhostButton onPress={() => router.push('/einzugsgebiet')}>
              PLZ-Check: Sind wir bei Ihnen?
            </GhostButton>
          </View>
        </Card>

        {/* Beratung */}
        <View style={styles.section}>
          <LeadForm source="ios-app-home" />
        </View>

        {/* Soziales Engagement */}
        <Card style={styles.section}>
          <Text style={styles.badge}>Soziales Engagement</Text>
          <Text style={styles.h2}>Mit jeder Buchung helfen wir</Text>
          <BodyText>
            Von jeder Buchung fließt 1 € direkt in unsere Hilfskasse für Kinder und Familien in Not
            — ohne Umwege, ohne Verwaltungskosten.
          </BodyText>
        </Card>

        <Text style={styles.footer}>© 2026 Alltagsengel UG (haftungsbeschränkt) — Frankfurt am Main</Text>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  scroll: { padding: 16, paddingBottom: 40 },
  hero: { alignItems: 'center', paddingTop: 24, paddingBottom: 8 },
  logo: { width: 130, height: 130 },
  brand: {
    color: Colors.goldBright,
    fontFamily: Fonts.serifBold,
    fontSize: 34,
    letterSpacing: 4,
    marginTop: 10,
  },
  tagline: {
    color: Colors.ink2,
    fontFamily: Fonts.medium,
    fontSize: 14,
    marginTop: 6,
  },
  region: {
    color: Colors.ink4,
    fontFamily: Fonts.regular,
    fontSize: 13,
    marginTop: 2,
  },
  divider: {
    width: 60,
    height: 2,
    backgroundColor: Colors.gold,
    borderRadius: 1,
    marginVertical: 18,
  },
  heroButtons: { alignSelf: 'stretch', gap: 10 },
  loggedIn: { textAlign: 'center' },
  trustRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 18,
    marginVertical: 22,
  },
  trustItem: { alignItems: 'center' },
  trustVal: { color: Colors.goldBright, fontFamily: Fonts.bold, fontSize: 17 },
  trustLbl: { color: Colors.ink4, fontFamily: Fonts.regular, fontSize: 11 },
  trustSep: { width: 1, height: 26, backgroundColor: Colors.cardBorder },
  section: { marginBottom: 16 },
  badge: {
    color: Colors.gold,
    fontFamily: Fonts.semibold,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  h2: {
    color: Colors.ink,
    fontFamily: Fonts.bold,
    fontSize: 20,
    lineHeight: 27,
    marginBottom: 10,
  },
  kennzahlBox: {
    backgroundColor: Colors.goldLight,
    borderColor: Colors.goldBorder,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginTop: 14,
  },
  kennzahl: { color: Colors.goldBright, fontFamily: Fonts.bold, fontSize: 32 },
  kennzahlSub: { color: Colors.ink3, fontFamily: Fonts.regular, fontSize: 12, marginTop: 2 },
  quickButtons: { gap: 10, marginTop: 6 },
  footer: {
    color: Colors.ink4,
    fontFamily: Fonts.regular,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 10,
  },
})
