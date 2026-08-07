// ═══════════════════════════════════════════════════════════
// BUNDESLAND-STATUS — Freischaltung + Warteliste (Native)
// ═══════════════════════════════════════════════════════════
// Zeigt für eine Postleitzahl, was in ihrem Bundesland möglich ist:
// Kassenabrechnung, Privatleistung oder Vormerkung. Die Antwort
// kommt aus /api/expansion/status — dieselbe Quelle wie im Web.
//
// Wird ein Bundesland im Admin freigeschaltet, ändert sich diese
// Anzeige beim nächsten Öffnen. Kein App-Update nötig.
// ═══════════════════════════════════════════════════════════

import { useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { BodyText, GoldButton, Input, MutedText } from './ui'
import { Colors, Fonts } from '../constants/theme'
import {
  FALLBACK_LAGE,
  ladeBundeslandLage,
  wartelisteEintragen,
  type BundeslandLage,
} from '../lib/expansion'

interface Props {
  /** 5-stellige PLZ. Leer/ungültig → nichts anzeigen. */
  plz: string
}

export default function BundeslandStatus({ plz }: Props) {
  const [lage, setLage] = useState<BundeslandLage>(FALLBACK_LAGE)
  const [laedt, setLaedt] = useState(false)
  const [email, setEmail] = useState('')
  const [sendet, setSendet] = useState(false)
  const [meldung, setMeldung] = useState<string | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)

  const gueltig = /^[0-9]{5}$/.test(plz)

  useEffect(() => {
    let abgebrochen = false
    if (!gueltig) {
      setLage(FALLBACK_LAGE)
      setMeldung(null)
      return
    }
    setLaedt(true)
    setMeldung(null)
    setFehler(null)
    ladeBundeslandLage(plz).then(ergebnis => {
      if (abgebrochen) return
      setLage(ergebnis)
      setLaedt(false)
    })
    return () => { abgebrochen = true }
  }, [plz, gueltig])

  if (!gueltig) return null

  if (laedt) {
    return (
      <View style={styles.box}>
        <ActivityIndicator color={Colors.gold} />
      </View>
    )
  }

  async function eintragen() {
    setFehler(null)
    setSendet(true)
    const ergebnis = await wartelisteEintragen({
      plz,
      bundesland: lage.bundesland,
      email: email.trim(),
      interesse: 'kasse',
    })
    setSendet(false)
    if (ergebnis.ok) {
      setMeldung('Eingetragen. Wir melden uns, sobald die Abrechnung freigeschaltet ist.')
    } else {
      setFehler(ergebnis.error ?? 'Eintragung fehlgeschlagen.')
    }
  }

  // ── Kassenabrechnung freigeschaltet ──
  if (lage.kassenabrechnung) {
    return (
      <View style={[styles.box, styles.boxGruen]}>
        <Text style={styles.titelGruen}>
          ✓ Abrechnung über die Pflegekasse möglich
          {lage.bundeslandName ? ` — ${lage.bundeslandName}` : ''}
        </Text>
        <BodyText style={styles.text}>
          Ihre Entlastungsleistungen nach §45b SGB XI können wir direkt mit Ihrer Pflegekasse
          abrechnen.
        </BodyText>
      </View>
    )
  }

  // ── Noch nicht freigeschaltet ──
  return (
    <View style={styles.box}>
      <Text style={styles.titel}>
        {lage.bundeslandName
          ? `${lage.bundeslandName} — Pflegekassenabrechnung`
          : 'Pflegekassenabrechnung'}
      </Text>
      <BodyText style={styles.text}>{lage.hinweis}</BodyText>

      {lage.privatleistungen ? (
        <BodyText style={styles.text}>
          Als Privatleistung sind wir in Ihrer Region bereits für Sie da.
        </BodyText>
      ) : (
        <BodyText style={styles.text}>
          In Ihrer Region nehmen wir derzeit Vormerkungen entgegen.
        </BodyText>
      )}

      {lage.goLive ? (
        <MutedText style={styles.klein}>Geplanter Start: {formatDatum(lage.goLive)}</MutedText>
      ) : null}

      {(lage.ansprechpartner.email || lage.ansprechpartner.telefon) ? (
        <MutedText style={styles.klein}>
          Ansprechpartner: {lage.ansprechpartner.name || 'Alltagsengel'}
          {lage.ansprechpartner.telefon ? ` · ${lage.ansprechpartner.telefon}` : ''}
          {lage.ansprechpartner.email ? ` · ${lage.ansprechpartner.email}` : ''}
        </MutedText>
      ) : null}

      {lage.warteliste && !meldung ? (
        <View style={styles.wartelisteBlock}>
          <MutedText style={styles.klein}>
            Tragen Sie sich ein — wir benachrichtigen Sie bei der Freischaltung.
          </MutedText>
          <Input
            placeholder="ihre@email.de"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            style={styles.input}
          />
          <GoldButton onPress={eintragen} disabled={sendet || !email.includes('@')}>
            {sendet ? 'Wird gesendet…' : 'Benachrichtigen'}
          </GoldButton>
          {fehler ? <Text style={styles.fehler}>{fehler}</Text> : null}
        </View>
      ) : null}

      {meldung ? <Text style={styles.erfolg}>✓ {meldung}</Text> : null}
    </View>
  )
}

function formatDatum(iso: string): string {
  try {
    const [j, m, t] = iso.split('-')
    return `${t}.${m}.${j}`
  } catch {
    return iso
  }
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: Colors.goldFaint,
    borderWidth: 1,
    borderColor: Colors.goldBorder,
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
    gap: 6,
  },
  boxGruen: {
    backgroundColor: Colors.greenPale,
    borderColor: Colors.greenBorder,
  },
  titel: {
    fontFamily: Fonts.bold,
    fontSize: 15,
    color: Colors.gold,
  },
  titelGruen: {
    fontFamily: Fonts.bold,
    fontSize: 15,
    color: Colors.green,
  },
  text: {
    fontSize: 14,
    lineHeight: 21,
  },
  klein: {
    fontSize: 12,
    marginTop: 2,
  },
  wartelisteBlock: {
    marginTop: 10,
    gap: 8,
  },
  input: {
    marginTop: 2,
  },
  fehler: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    color: Colors.red,
  },
  erfolg: {
    fontFamily: Fonts.bold,
    fontSize: 13,
    color: Colors.green,
    marginTop: 8,
  },
})
