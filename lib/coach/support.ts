// ═══════════════════════════════════════════════════════════════
// PflegeCoach — Anwenderbetreuung: die veröffentlichte Antwortzusage
//
// WOZU DIESES MODUL
// Anlage 2 DiPAV, Themenfeld III Nr. 8 verlangt eine kostenlose,
// deutschsprachige Anwenderbetreuung, die auf Anfragen "spätestens innerhalb
// von 24 Stunden" zurückmeldet. Der BfArM-Leitfaden v1.3 Kap. 3.6.2 legt das
// aus: geschuldet ist eine zugeschnittene RÜCKMELDUNG, nicht die fertige
// Antwort; ein Format ist nicht vorgeschrieben. Ausnahmen für Wochenenden
// oder Feiertage sieht die Frist NICHT vor.
//
// WAS HIER NICHT PASSIERT
// Dieses Modul schreibt keine Zusage. Eine veröffentlichte Reaktionszeit ist
// eine bindende Erklärung gegenüber Nutzern und setzt eine Personal- und
// Bereitschaftsentscheidung voraus — die trifft die Geschäftsführung, nicht
// die Technik. Eine Zusage zu veröffentlichen, die betrieblich nicht
// hinterlegt ist, wäre schlechter als keine.
//
// DIE REGEL: FAIL-CLOSED
// `SUPPORT_ZUSAGE` ist `null`, solange die Entscheidung nicht getroffen und
// hier eingetragen ist. Ohne Eintrag zeigt die Oberfläche einen Text OHNE
// Frist. Erst ein vollständiger, geprüfter Eintrag erzeugt überhaupt einen
// Fristsatz — und `pruefeSupportZusage()` lässt einen unvollständigen Eintrag
// nicht durch.
//
// WARUM ALS KONSTANTE UND NICHT ALS ENV-SCHALTER
// Die Zusage ist kein Betriebszustand, sondern ein Beschluss mit Datum,
// Urheber und Fundstelle. Sie gehört versioniert ins Repository, wo sie
// zusammen mit dem Text geprüft und wieder aufgefunden werden kann — nicht in
// eine Umgebungsvariable, die niemand im Nachhinein datieren kann.
//
// VORGEFUNDENER ZUSTAND 19.08.2026
// Auf /pflegecoach/anfrage stand "Wir melden uns in der Regel innerhalb von
// zwei Werktagen". Das war eine veröffentlichte Zusage ohne hinterlegten
// Beschluss — und zugleich mit der 24-Stunden-Frist unvereinbar, weil
// "Werktage" Wochenenden ausnehmen, die Frist der Anlage 2 aber nicht. Der
// Satz ist entfernt; die Stelle liest jetzt aus diesem Register.
// ═══════════════════════════════════════════════════════════════

import { COACH_SUPPORT_EMAIL } from './version'

/** Frist der Anlage 2 DiPAV in Stunden. Nicht verhandelbar, nicht auslegungsfähig. */
export const SUPPORT_FRIST_STUNDEN = 24

export const SUPPORT_FRIST_QUELLE =
  'Anlage 2 DiPAV, Themenfeld III Nr. 8 (zu § 6 Abs. 5); Auslegung: '
  + 'BfArM-DiPA-Leitfaden v1.3 Kap. 3.6.2'

export type SupportKanal = 'email' | 'formular' | 'telefon'

export const SUPPORT_KANAL_LABELS: Record<SupportKanal, string> = {
  email: 'E-Mail',
  formular: 'Kontaktformular',
  telefon: 'Telefon',
}

/**
 * Der Beschluss über die Anwenderbetreuung.
 *
 * Jedes Feld ist eine Entscheidung, die getroffen sein muss, bevor ein Satz
 * darüber veröffentlicht werden darf.
 */
export interface SupportZusage {
  /** Zugesagte Rückmeldefrist in Stunden. Darf SUPPORT_FRIST_STUNDEN nicht überschreiten. */
  fristStunden: number
  /** Über welche Wege Anfragen entgegengenommen werden. Mindestens einer. */
  kanaele: SupportKanal[]
  /**
   * Läuft die Frist auch an Wochenenden und Feiertagen?
   * Anlage 2 kennt keine Ausnahme — eine Zusage "nur werktags" erfüllt sie nicht.
   */
  abdeckungOhneAusnahme: boolean
  /** Ist eine Vertretung für Urlaub und Krankheit geregelt? */
  vertretungGeregelt: boolean
  /** Ist die Betreuung für Nutzer kostenlos? Anlage 2 verlangt "kostenlos". */
  kostenlos: boolean
  /** Ist sie deutschsprachig? Anlage 2 verlangt "deutschsprachig". */
  deutschsprachig: boolean
  /** Wer die Entscheidung getroffen hat — Rolle, kein persönlicher Name. */
  entschiedenVon: string
  /** Datum der Entscheidung, JJJJ-MM-TT. */
  entschiedenAm: string
  /** Wo der Beschluss nachzulesen ist (Datei, Protokoll, Beschlussnummer). */
  fundstelle: string
}

/**
 * FAIL-CLOSED — es ist keine Antwortzusage beschlossen.
 *
 * Zum Eintragen: das Objekt hier ausfüllen. `pruefeSupportZusage()` muss
 * fehlerfrei durchlaufen, sonst bleibt die Zusage unveröffentlicht — der
 * Test in support.test.ts erzwingt das.
 */
export const SUPPORT_ZUSAGE: SupportZusage | null = null

/**
 * Was zu entscheiden ist, damit AK-VS-02 geschlossen werden kann.
 * Bewusst hier und nicht nur in einem Dokument: die Liste steht neben der
 * Stelle, an der das Ergebnis eingetragen wird.
 */
export const OFFENE_ENTSCHEIDUNGEN: string[] = [
  'Über welche Kanäle Anfragen entgegengenommen werden (E-Mail genügt, Telefon ist nicht vorgeschrieben)',
  'Abdeckung an Wochenenden und Feiertagen — die 24-Stunden-Frist kennt keine Ausnahme',
  'Vertretungsregelung für Urlaub und Krankheit',
  'Wer die Rückmeldung fachlich verantwortet',
  'Wo die Zusage veröffentlicht wird (Produktseite, Anfrageseite, Anlage-2-Erklärung)',
]

/**
 * Prüft einen Beschluss auf Vollständigkeit und DiPAV-Tauglichkeit.
 *
 * @returns Liste der Mängel. Leer = die Zusage darf veröffentlicht werden.
 */
export function pruefeSupportZusage(zusage: SupportZusage | null): string[] {
  if (!zusage) {
    return ['Keine Antwortzusage beschlossen — es wird keine Frist veröffentlicht.']
  }

  const maengel: string[] = []

  if (!Number.isFinite(zusage.fristStunden) || zusage.fristStunden <= 0) {
    maengel.push('Frist fehlt oder ist nicht positiv.')
  } else if (zusage.fristStunden > SUPPORT_FRIST_STUNDEN) {
    maengel.push(
      `Zugesagte Frist (${zusage.fristStunden} h) überschreitet die Anforderung `
      + `von ${SUPPORT_FRIST_STUNDEN} h. Quelle: ${SUPPORT_FRIST_QUELLE}.`,
    )
  }

  if (!zusage.kanaele || zusage.kanaele.length === 0) {
    maengel.push('Kein Kanal benannt, über den Anfragen entgegengenommen werden.')
  }

  if (!zusage.abdeckungOhneAusnahme) {
    maengel.push(
      'Die Zusage nimmt Wochenenden oder Feiertage aus. Die Frist der Anlage 2 kennt '
      + 'keine Ausnahme — eine Zusage "innerhalb von x Werktagen" erfüllt sie nicht.',
    )
  }

  if (!zusage.vertretungGeregelt) {
    maengel.push('Keine Vertretungsregelung für Urlaub und Krankheit hinterlegt.')
  }

  if (!zusage.kostenlos) {
    maengel.push('Anlage 2 verlangt eine für Nutzer kostenlose Anwenderbetreuung.')
  }

  if (!zusage.deutschsprachig) {
    maengel.push('Anlage 2 verlangt eine deutschsprachige Anwenderbetreuung.')
  }

  if (!zusage.entschiedenVon?.trim()) {
    maengel.push('Ohne Urheber ist die Entscheidung später nicht zurechenbar.')
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(zusage.entschiedenAm ?? '')) {
    maengel.push('Entscheidungsdatum fehlt oder hat nicht das Format JJJJ-MM-TT.')
  }

  if (!zusage.fundstelle?.trim()) {
    maengel.push('Ohne Fundstelle ist der Beschluss nicht auffindbar — eine Zusage ohne Beleg ist eine Behauptung.')
  }

  return maengel
}

/** Ist eine veröffentlichungsfähige Zusage hinterlegt? */
export function zusageVeroeffentlichungsfaehig(zusage: SupportZusage | null = SUPPORT_ZUSAGE): boolean {
  return pruefeSupportZusage(zusage).length === 0
}

/** Text ohne jede Frist — der Zustand, solange nichts beschlossen ist. */
export const SUPPORT_OHNE_ZUSAGE_TEXT =
  `Ihre Anfrage ist bei uns eingegangen. Eine Bestätigung haben wir an Ihre E-Mail-Adresse `
  + `geschickt. Sie erreichen uns jederzeit unter ${COACH_SUPPORT_EMAIL}.`

/**
 * Der Satz, der Nutzern angezeigt wird.
 *
 * Enthält nur dann eine Frist, wenn eine geprüfte Zusage hinterlegt ist.
 * Andernfalls der neutrale Text — ohne Zeitangabe, ohne "in der Regel",
 * ohne "zeitnah".
 */
export function supportAntwortHinweis(zusage: SupportZusage | null = SUPPORT_ZUSAGE): string {
  if (!zusageVeroeffentlichungsfaehig(zusage) || !zusage) return SUPPORT_OHNE_ZUSAGE_TEXT

  const kanaele = zusage.kanaele.map(k => SUPPORT_KANAL_LABELS[k]).join(' und ')
  return (
    `Ihre Anfrage ist bei uns eingegangen. Wir melden uns innerhalb von `
    + `${zusage.fristStunden} Stunden bei Ihnen — auch an Wochenenden und Feiertagen. `
    + `Sie erreichen uns über ${kanaele}, für Sie kostenlos und auf Deutsch.`
  )
}

export interface SupportStatus {
  hinterlegt: boolean
  veroeffentlichungsfaehig: boolean
  fristStunden: number | null
  anforderungStunden: number
  quelle: string
  maengel: string[]
  offeneEntscheidungen: string[]
  angezeigterText: string
}

/** Zustand für Betriebsansicht, Katalogprüfung und Bericht. */
export function supportStatus(zusage: SupportZusage | null = SUPPORT_ZUSAGE): SupportStatus {
  const maengel = pruefeSupportZusage(zusage)
  return {
    hinterlegt: zusage !== null,
    veroeffentlichungsfaehig: maengel.length === 0,
    fristStunden: zusage?.fristStunden ?? null,
    anforderungStunden: SUPPORT_FRIST_STUNDEN,
    quelle: SUPPORT_FRIST_QUELLE,
    maengel,
    offeneEntscheidungen: zusage === null ? OFFENE_ENTSCHEIDUNGEN : [],
    angezeigterText: supportAntwortHinweis(zusage),
  }
}
