/**
 * DiPA / PflegeCoach — Rechtstexte: Fassung, Pflichtinhalte, Namens-Policy
 * ═══════════════════════════════════════════════════════════════════════
 *
 * `lib/coach/rechtstexte.ts` hatte keinen Test. Die Datei enthält
 * ausschliesslich Konstanten und sieht deshalb harmlos aus — sie ist es
 * nicht, aus einem Grund, der im Dateikopf selbst steht:
 *
 *   Bei JEDER Bestellung wird die geltende Fassung in
 *   `coach_bestellungen.widerrufsbelehrung_version` festgehalten
 *   (app/api/coach/checkout/route.ts). Ändert jemand den TEXT, ohne die
 *   VERSION zu erhöhen, tragen die Bestellungen davor und danach dieselbe
 *   Fassungsnummer über zwei verschiedenen Belehrungen. Welche im
 *   Streitfall galt, ist dann nicht mehr feststellbar — und genau das
 *   sollte die Versionierung verhindern.
 *
 * Deshalb ist die erste Prüfung hier ein PRÜFWERT über den Wortlaut,
 * festgenagelt an der Version. Wer den Text ändert, bekommt einen roten
 * Test und muss die Version anfassen. Das ist die einzige Bauart, die
 * diesen Fehler überhaupt fangen kann: Ein Test, der nur „enthält das Wort
 * vierzehn" prüft, bleibt bei jeder Umformulierung grün.
 *
 * DIE ZWEITE HÄLFTE prüft Pflichtinhalte gegen das gesetzliche Muster
 * (Anlage 1 und 2 zu Art. 246a § 1 Abs. 2 EGBGB, § 355 BGB) — Frist,
 * Fristbeginn, Erklärungsweg, Rückzahlungsfrist, Zahlungsmittel,
 * Entgeltfreiheit, Muster-Formular. Und den einen Punkt, der über das
 * Muster hinausgeht: die Selbstverpflichtung, KEINEN Wertersatz zu
 * verlangen, obwohl § 357 Abs. 8 BGB ihn unter Voraussetzungen erlauben
 * würde. Fiele dieser Satz still heraus, verlöre der Nutzer eine Zusage,
 * ohne dass es jemandem auffiele.
 *
 * KEINE RECHTSPRÜFUNG: Diese Suite prüft, dass die Bausteine des
 * gesetzlichen Musters vorhanden und stabil sind. Sie ersetzt nicht das
 * anwaltliche Gegenlesen, das der Dateikopf ausdrücklich als ausstehend
 * bezeichnet (AK-VS-04 im Anforderungskatalog, Zuständigkeit: Kanzlei).
 * Ein grüner Lauf ist keine juristische Freigabe.
 */

import { describe, it, expect } from 'vitest'
import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  AGB, AGB_VERSION,
  MUSTER_WIDERRUFSFORMULAR,
  RECHTSTEXTE_STAND,
  WIDERRUFSBELEHRUNG, WIDERRUFSBELEHRUNG_VERSION,
  WIDERRUF_ANSCHRIFT,
} from '@/lib/coach/rechtstexte'
import { COACH_SUPPORT_EMAIL } from '@/lib/coach/version'

const belehrungText = WIDERRUFSBELEHRUNG
  .flatMap(a => [a.titel, ...a.absaetze]).join('\n')
const agbText = AGB
  .flatMap(a => [a.nummer, a.titel, ...a.absaetze]).join('\n')

/**
 * Die Namen, die laut Namens-Policy nie kundengerichtet auftauchen —
 * dieselbe Liste wie in __tests__/billing/rechnung-versand.test.ts und
 * __tests__/notifications/resend-integration.test.ts.
 *
 * Bewusst diese ausgeschriebene Liste und KEINE Heuristik auf
 * „Grossbuchstabe Wort, Grossbuchstabe Wort": ein solches Muster findet
 * in diesen Texten 46 Treffer, davon null echte — „Amtsgerichts Frankfurt",
 * „Europäische Kommission", „Payments Europe", „Neue Mainzer". Eine
 * Ausnahmeliste mit 46 Einträgen prüft nichts mehr, sie verwaltet nur noch
 * sich selbst, und der 47. Eintrag wird ungelesen hinzugefügt.
 */
const NIE_KUNDENGERICHTET = ['Yusuf', 'Cilcioglu', 'Abdullah']

function pruefwert(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16)
}

// ═══════════════════════════════════════════════════════════════════
// Fassungen — festgenagelt am Wortlaut
// ═══════════════════════════════════════════════════════════════════
/**
 * Prüfwerte des Wortlauts zur jeweils geltenden Fassung.
 *
 * ÄNDERT SICH EIN TEXT, WIRD DIESER TEST ROT. Das ist die Absicht. Der
 * richtige Weg ist dann: Version in `rechtstexte.ts` erhöhen, hier den
 * neuen Eintrag ergänzen — und den alten STEHEN LASSEN. Bestellungen, die
 * unter der alten Fassung zustande kamen, verweisen weiter auf sie; ihr
 * Prüfwert ist der einzige Beleg dafür, welcher Wortlaut das war.
 */
const BELEHRUNG_PRUEFWERTE: Record<string, string> = {
  '1.0': '9cd52423da11c120',
}
const AGB_PRUEFWERTE: Record<string, string> = {
  '1.0': '7c4af586948c7fe0',
}
const FORMULAR_PRUEFWERTE: Record<string, string> = {
  '1.0': '5f204e4eeeacf415',
}

describe('Fassungen', () => {
  it('der Wortlaut der Widerrufsbelehrung passt zur ausgewiesenen Fassung', () => {
    expect(
      pruefwert(belehrungText),
      `Der Text der Widerrufsbelehrung hat sich geändert, die Fassung steht `
      + `weiterhin auf ${WIDERRUFSBELEHRUNG_VERSION}. Jede Bestellung friert diese `
      + 'Nummer ein — zwei verschiedene Belehrungen unter derselben Nummer sind im '
      + 'Streitfall nicht mehr auseinanderzuhalten. Version erhöhen und den neuen '
      + 'Prüfwert ergänzen, den alten stehen lassen.',
    ).toBe(BELEHRUNG_PRUEFWERTE[WIDERRUFSBELEHRUNG_VERSION])
  })

  it('der Wortlaut des Muster-Widerrufsformulars passt zur Fassung', () => {
    expect(pruefwert(MUSTER_WIDERRUFSFORMULAR)).toBe(FORMULAR_PRUEFWERTE[WIDERRUFSBELEHRUNG_VERSION])
  })

  it('der Wortlaut der AGB passt zur ausgewiesenen Fassung', () => {
    expect(pruefwert(agbText)).toBe(AGB_PRUEFWERTE[AGB_VERSION])
  })

  it('zu jeder eingetragenen Fassung gibt es einen Prüfwert und umgekehrt', () => {
    // Karteileichen wären hier besonders tückisch: ein Prüfwert ohne
    // Fassung sagt nichts, eine Fassung ohne Prüfwert prüft nichts.
    expect(Object.keys(BELEHRUNG_PRUEFWERTE)).toContain(WIDERRUFSBELEHRUNG_VERSION)
    expect(Object.keys(FORMULAR_PRUEFWERTE)).toContain(WIDERRUFSBELEHRUNG_VERSION)
    expect(Object.keys(AGB_PRUEFWERTE)).toContain(AGB_VERSION)
  })

  it('Fassungs- und Standangaben haben ein festes Format', () => {
    expect(WIDERRUFSBELEHRUNG_VERSION).toMatch(/^\d+\.\d+$/)
    expect(AGB_VERSION).toMatch(/^\d+\.\d+$/)
    expect(RECHTSTEXTE_STAND).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('der Checkout friert genau DIESE Konstante ein', () => {
    // Schliesst den Kreis: Was die Seite anzeigt und was die Bestellung
    // festhält, muss dieselbe Quelle sein. Ein zweiter Literal-String im
    // Handler wäre der stille Bruch, den die Versionierung nicht sieht.
    const route = readFileSync(
      join(__dirname, '..', '..', 'app', 'api', 'coach', 'checkout', 'route.ts'), 'utf8',
    )
    expect(route).toMatch(/widerrufsbelehrung_version:\s*WIDERRUFSBELEHRUNG_VERSION/)
    expect(route).toContain("from '@/lib/coach/rechtstexte'")
  })
})

// ═══════════════════════════════════════════════════════════════════
describe('Pflichtinhalte der Widerrufsbelehrung', () => {
  it('nennt Frist und Fristbeginn', () => {
    expect(belehrungText).toContain('binnen vierzehn Tagen ohne Angabe von Gründen')
    expect(belehrungText).toContain('vierzehn Tage ab dem Tag des Vertragsschlusses')
  })

  it('nennt den Erklärungsweg und dass das Formular nicht vorgeschrieben ist', () => {
    expect(belehrungText).toContain('eindeutigen Erklärung')
    expect(belehrungText).toContain('nicht vorgeschrieben')
  })

  it('nennt die Absendetheorie zur Fristwahrung', () => {
    // Ohne diesen Satz trüge der Verbraucher das Übermittlungsrisiko.
    expect(belehrungText).toContain('vor Ablauf der Widerrufsfrist absenden')
  })

  it('regelt Rückzahlungsfrist, Zahlungsmittel und Entgeltfreiheit', () => {
    expect(belehrungText).toContain('binnen vierzehn Tagen')
    expect(belehrungText).toContain('dasselbe Zahlungsmittel')
    expect(belehrungText).toMatch(/in keinem Fall werden Ihnen wegen dieser Rückzahlung Entgelte berechnet/)
  })

  it('verzichtet ausdrücklich auf Wertersatz', () => {
    // Geht über das gesetzliche Muster hinaus: § 357 Abs. 8 BGB liesse
    // Wertersatz unter Voraussetzungen zu. Fiele der Satz still heraus,
    // verlöre der Nutzer eine Zusage, ohne dass es auffiele.
    expect(belehrungText).toContain('keinen Wertersatz')
    expect(belehrungText).toContain('vollständig zurück')
  })

  it('weist auf den Widerruf im eigenen Konto hin', () => {
    // Art. 7 Abs. 3 DSGVO-Gedanke, hier vertraglich: der Widerruf muss so
    // einfach sein wie der Abschluss. Der Weg existiert (POST /api/coach/abo)
    // und muss auch in der Belehrung stehen, sonst findet ihn niemand.
    expect(belehrungText).toMatch(/in Ihrem Konto/)
    expect(belehrungText).toContain('sofort')
  })
})

// ═══════════════════════════════════════════════════════════════════
describe('Muster-Widerrufsformular (Anlage 2 zu Art. 246a § 1 Abs. 2 EGBGB)', () => {
  it('enthält die Bausteine des Musters', () => {
    for (const baustein of [
      'Hiermit widerrufe(n) ich/wir',
      'Name des/der Verbraucher(s)',
      'Anschrift des/der Verbraucher(s)',
      'Unterschrift des/der Verbraucher(s)',
      'Unzutreffendes streichen',
    ]) {
      expect(MUSTER_WIDERRUFSFORMULAR).toContain(baustein)
    }
  })

  it('nennt denselben Empfänger wie die Belehrung', () => {
    // Zwei Anschriften in einem Dokument sind schlimmer als eine falsche:
    // der Verbraucher weiss nicht, welche gilt.
    for (const teil of [
      WIDERRUF_ANSCHRIFT.name, WIDERRUF_ANSCHRIFT.zusatz,
      WIDERRUF_ANSCHRIFT.strasse, WIDERRUF_ANSCHRIFT.ort, WIDERRUF_ANSCHRIFT.email,
    ]) {
      expect(MUSTER_WIDERRUFSFORMULAR).toContain(teil)
      expect(belehrungText).toContain(teil)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════
describe('Anschrift und Namensführung', () => {
  it('die Anschrift stimmt mit dem Impressum überein', () => {
    // Eine abweichende Widerrufsanschrift macht die Belehrung angreifbar.
    const impressum = readFileSync(
      join(__dirname, '..', '..', 'app', 'impressum', 'page.tsx'), 'utf8',
    )
    expect(impressum).toContain(WIDERRUF_ANSCHRIFT.strasse)
    expect(impressum).toContain('60311 Frankfurt am Main')
    expect(WIDERRUF_ANSCHRIFT.ort).toBe('60311 Frankfurt am Main')
    expect(WIDERRUF_ANSCHRIFT.name).toBe('Alltagsengel UG (haftungsbeschränkt)')
  })

  it('die E-Mail stammt aus der zentralen Konstante', () => {
    expect(WIDERRUF_ANSCHRIFT.email).toBe(COACH_SUPPORT_EMAIL)
  })

  it('kein persönlicher Name in den Rechtstexten', () => {
    // Namens-Policy: kundengerichtet tritt ausschliesslich „Alltagsengel"
    // auf, persönliche Namen nur in Impressum und Datenschutzerklärung.
    // In Rechtstexten wiegt das doppelt — sie werden mit der Bestellung
    // dauerhaft festgehalten und sind später nicht mehr korrigierbar,
    // ohne die Fassung zu wechseln.
    const alles = [belehrungText, agbText, MUSTER_WIDERRUFSFORMULAR].join('\n')
    for (const name of NIE_KUNDENGERICHTET) {
      expect(alles, `„${name}" steht in einem Rechtstext.`).not.toContain(name)
    }
  })

  it('als Vertragspartnerin tritt die Gesellschaft auf, nicht eine Person', () => {
    // Gegenprobe zur Zeile darüber: sie wäre auch dann grün, wenn in den
    // Texten überhaupt kein Anbieter genannt wäre.
    expect(agbText).toContain('Alltagsengel UG (haftungsbeschränkt)')
    expect(agbText).toMatch(/Anbieterin ist die Alltagsengel UG/)
  })
})
