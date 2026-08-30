// ═══════════════════════════════════════════════════════════════════════════
// FREIGABERIEGEL FUER DEN WERBEVERSAND
//
// Ohne diesen Riegel gaebe es genau einen Handgriff zwischen einem
// Trockenlauf und einer Mail an jeden Empfaenger im Segment. Massenpost ist
// der einzige Vorgang im System, der sich weder zuruecknehmen noch
// korrigieren laesst: die Mail ist beim Empfaenger, sobald der Versanddienst
// sie angenommen hat.
//
// ── DREI TORE, DIE ALLE OFFEN SEIN MUESSEN ────────────────────────────────
//  1. `MARKETINGVERSAND_FREIGEGEBEN` steht auf dem exakten Wert '1'.
//  2. Der Lauf ist eine PRODUKTION (oder die Ausnahme ist gesetzt).
//  3. Die Kampagne selbst traegt eine Freigabe durch einen Menschen, die
//     sich auf die beim Trockenlauf gesehene Empfaengerzahl bezieht
//     (email_campaigns.freigegeben_am / freigegeben_fuer_anzahl).
//
// Tor 1 und 2 stehen hier, Tor 3 in lib/marketing/versand.ts. Sie sind
// getrennt, weil sie verschiedene Fragen beantworten: „darf diese
// Installation ueberhaupt Werbung verschicken" und „ist DIESE Kampagne von
// einem Menschen freigegeben".
//
// ── WARUM NICHT DIE VORHANDENEN VERSAND-SCHALTER ───────────────────────────
// lib/config/versand-flags.ts fuehrt RECHNUNGSVERSAND_AUTOMATISCH und
// MAHNVERSAND_AUTOMATISCH und sagt im Kopf ausdruecklich: „Mehr gibt es
// nicht, und mehr soll es nicht geben." Das ist richtig — jene beiden
// Schalter steuern TRANSAKTIONSPOST, die einen Vertrag erfuellt. Werbung
// steht auf einer voellig anderen Rechtsgrundlage (§ 7 Abs. 2 Nr. 2 UWG
// statt Art. 6 Abs. 1 lit. b DSGVO). Beides an denselben Schalter zu
// haengen hiesse: wer den Rechnungsversand scharf schaltet, schaltet
// unbemerkt die Werbung mit scharf.
//
// Die SEMANTIK ist absichtlich identisch — exakter Wert '1', keine
// Trimmung, Umgebungstrennung, sprechender Grund — und `istProduktionslauf`
// stammt aus derselben Quelle. Wer eine der beiden Seiten aendert, sollte
// die andere ansehen.
// ═══════════════════════════════════════════════════════════════════════════

import { istProduktionslauf, type EnvQuelle } from '@/lib/env/pruefung'

/** Der Schalter. */
export const MARKETING_FLAG = 'MARKETINGVERSAND_FREIGEGEBEN' as const

/**
 * Ausnahme zur Umgebungstrennung — dieselbe Variable wie beim
 * Rechnungsversand, damit es nicht zwei Ausnahmen zu ueberwachen gibt.
 */
export const NICHT_PRODUKTION_ERLAUBT = 'VERSAND_NICHT_PRODUKTION_ERLAUBT' as const

/** Der einzige Wert, der einschaltet. */
export const AN_WERT = '1'

export type FreigabeBefund =
  | 'aus_fehlt'
  | 'aus_explizit'
  | 'aus_ungueltig'
  | 'aus_umgebung'
  | 'an'

export interface FreigabeStand {
  /** Darf diese Installation Werbepost an echte Empfaenger senden? */
  aktiv: boolean
  befund: FreigabeBefund
  /** Ein Satz Klartext für Oberfläche und Protokoll. */
  grund: string
  produktion: boolean
}

/**
 * Liest den Schalter. Rein — keine Nebenwirkung, keine Datenbank.
 *
 * Der ROHWERT wird nie nach aussen gegeben. Der Grund wandert in
 * Betriebsantworten und Protokolle; dort hat auch ein harmloser
 * Konfigurationswert nichts verloren, dessen Herkunft niemand kennt.
 */
export function leseMarketingFreigabe(quelle: EnvQuelle = process.env): FreigabeStand {
  const produktion = istProduktionslauf(quelle)
  const roh = quelle[MARKETING_FLAG]
  const gesetzt = typeof roh === 'string' && roh !== ''

  if (!gesetzt) {
    return {
      aktiv: false,
      befund: 'aus_fehlt',
      produktion,
      grund:
        `Werbeversand ist aus: ${MARKETING_FLAG} ist nicht gesetzt. Trockenlauf, Vorschau und ` +
        `Testversand an interne Adressen funktionieren trotzdem.`,
    }
  }

  if (roh === '0') {
    return {
      aktiv: false,
      befund: 'aus_explizit',
      produktion,
      grund: `Werbeversand ist aus: ${MARKETING_FLAG} steht auf '0'.`,
    }
  }

  if (roh !== AN_WERT) {
    return {
      aktiv: false,
      befund: 'aus_ungueltig',
      produktion,
      grund:
        `Werbeversand ist aus: ${MARKETING_FLAG} trägt einen Wert, der weder '1' noch '0' ist. ` +
        `Nur der exakte Wert '1' schaltet ein — auch Leerraum um die Ziffer zählt als ungültig.`,
    }
  }

  const ausnahme = quelle[NICHT_PRODUKTION_ERLAUBT] === AN_WERT
  if (!produktion && !ausnahme) {
    return {
      aktiv: false,
      befund: 'aus_umgebung',
      produktion,
      grund:
        `Werbeversand ist aus: ${MARKETING_FLAG} steht zwar auf '1', dieser Lauf ist aber keine ` +
        `Produktion (Preview, Entwicklung oder Build). Eine für „All Environments" gesetzte ` +
        `Variable gilt sonst auch in jedem Branch-Preview — und würde dort echte Werbung an ` +
        `echte Empfänger schicken, gegen dieselbe Produktionsdatenbank. Für einen begleiteten ` +
        `Test zusätzlich ${NICHT_PRODUKTION_ERLAUBT}=1 setzen.`,
    }
  }

  return {
    aktiv: true,
    befund: 'an',
    produktion,
    grund:
      ausnahme && !produktion
        ? `Werbeversand ist SCHARF — außerhalb der Produktion, freigegeben über ${NICHT_PRODUKTION_ERLAUBT}=1.`
        : 'Werbeversand ist SCHARF.',
  }
}

/**
 * Adressen, die auch ohne Freigabe angeschrieben werden duerfen.
 *
 * Der Testversand geht ausschliesslich an eigene Adressen. Ohne diese
 * Einschraenkung waere „Testversand" der Weg, mit dem sich der ganze
 * Riegel umgehen liesse: eine Kampagne „testweise" an eine Kundenadresse
 * ist keine Probe, sondern ein Versand.
 */
export const TESTVERSAND_DOMAENEN = ['alltagsengel.care'] as const

export function istTestversandZiel(email: string): boolean {
  const adresse = String(email ?? '').trim().toLowerCase()
  const domaene = adresse.split('@')[1]
  if (!domaene) return false
  return TESTVERSAND_DOMAENEN.some((d) => domaene === d || domaene.endsWith(`.${d}`))
}
