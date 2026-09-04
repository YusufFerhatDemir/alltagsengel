/**
 * Onboarding — die Schrittfolgen je Ablaufart
 *
 * Die EINE Stelle, an der steht, aus welchen Schritten ein Ablauf besteht.
 * Datenbank (gesamt_schritte), Wizard-Oberflaeche, Erinnerungstexte und
 * Auswertung lesen alle hier — sonst behauptet der Fortschrittsbalken
 * „Schritt 3 von 5", waehrend die Erinnerung von vier Schritten spricht.
 *
 * ── WARUM DIE FOLGE IM CODE STEHT UND NICHT IN DER DATENBANK ───────────
 * Eine Schrittfolge ist Programmlogik: zu jedem Schritt gehoert eine Maske,
 * eine Pruefung und ein Text. Als Datenzeile waere sie ohne den passenden
 * Code wertlos und koennte sich unbemerkt von ihm entfernen. Was je PERSON
 * variiert — welcher Schritt erledigt ist, was fehlt — steht dagegen in
 * onboarding_progress.
 *
 * ── AENDERUNGEN AN EINER LAUFENDEN FOLGE ───────────────────────────────
 * Schritte duerfen ergaenzt werden; ihre `schluessel` NICHT umbenannt oder
 * wiederverwendet. In onboarding_progress.schritte_daten liegen die
 * Antworten laufender Ablaeufe unter genau diesen Schluesseln — ein
 * wiederverwendeter Schluessel ordnet alte Antworten dem neuen Schritt zu.
 * Der Test __tests__/onboarding/schritte.test.ts haelt die Schluessel fest.
 */

export const ONBOARDING_TYPEN = ['bewerber', 'kunde', 'angehoerige'] as const
export type OnboardingTyp = (typeof ONBOARDING_TYPEN)[number]

export function istOnboardingTyp(wert: unknown): wert is OnboardingTyp {
  return typeof wert === 'string' && (ONBOARDING_TYPEN as readonly string[]).includes(wert)
}

/** Status eines EINZELNEN Schritts in schritte_daten. */
export const SCHRITT_STATUS = ['offen', 'fertig', 'uebersprungen'] as const
export type SchrittStatus = (typeof SCHRITT_STATUS)[number]

export function istSchrittStatus(wert: unknown): wert is SchrittStatus {
  return typeof wert === 'string' && (SCHRITT_STATUS as readonly string[]).includes(wert)
}

export interface SchrittDefinition {
  /** Unveraenderlicher Schluessel — siehe Kopf. */
  schluessel: string
  /** Ueberschrift im Wizard. Kurz: eine Zeile auf dem Telefon. */
  titel: string
  /** Ein Satz darunter. Mehr Text liest auf dem Telefon niemand. */
  hinweis: string
  /**
   * Darf dieser Schritt uebersprungen werden?
   * Bewusst je Schritt und nicht global: Unterlagen nachreichen zu duerfen
   * ist der Unterschied zwischen „macht spaeter weiter" und „bricht ab".
   */
  ueberspringbar: boolean
  /**
   * Angaben, die dieser Schritt liefern soll. Fehlen sie beim Abschluss,
   * landen sie in onboarding_progress.fehlende_angaben und werden in der
   * Erinnerung namentlich genannt.
   */
  erwarteteAngaben: readonly string[]
}

/**
 * Bewerber-Ablauf.
 *
 * Endet BEWUSST vor der Einsatzfreigabe: die ist eine fachliche
 * Entscheidung der Verwaltung und wird nie durch das Ausfuellen eines
 * Formulars erteilt (siehe lib/personal/einsatzfreigabe.ts). Der Ablauf
 * hier sammelt nur, was fuer diese Entscheidung gebraucht wird.
 */
const BEWERBER_SCHRITTE: readonly SchrittDefinition[] = [
  {
    schluessel: 'kontakt',
    titel: 'Ihre Kontaktdaten',
    hinweis: 'Damit wir uns bei Ihnen melden können.',
    ueberspringbar: false,
    erwarteteAngaben: ['vorname', 'nachname', 'email', 'telefon'],
  },
  {
    schluessel: 'einsatzgebiet',
    titel: 'Wo möchten Sie arbeiten?',
    hinweis: 'Postleitzahl genügt — wir suchen Einsätze in Ihrer Nähe.',
    ueberspringbar: false,
    erwarteteAngaben: ['plz', 'mobilitaet'],
  },
  {
    schluessel: 'erfahrung',
    titel: 'Ihre Erfahrung',
    hinweis: 'Auch ohne Ausbildung möglich — erzählen Sie kurz von sich.',
    ueberspringbar: true,
    erwarteteAngaben: ['erfahrung', 'qualifikationen'],
  },
  {
    schluessel: 'verfuegbarkeit',
    titel: 'Wann haben Sie Zeit?',
    hinweis: 'Ungefähre Angaben reichen. Änderungen sind jederzeit möglich.',
    ueberspringbar: true,
    erwarteteAngaben: ['wochenstunden', 'zeitfenster'],
  },
  {
    schluessel: 'unterlagen',
    titel: 'Unterlagen',
    hinweis: 'Sie können alles auch später nachreichen.',
    ueberspringbar: true,
    erwarteteAngaben: ['fuehrungszeugnis', 'lebenslauf'],
  },
]

/**
 * Kunden-Ablauf.
 *
 * Fragt KEINE Zahlungsdaten ab. Die Abrechnung entscheidet sich erst,
 * wenn Pflegegrad und Kostentraeger feststehen; ein Bankfeld an dieser
 * Stelle wuerde eine Verbindlichkeit suggerieren, die es nicht gibt.
 */
const KUNDE_SCHRITTE: readonly SchrittDefinition[] = [
  {
    schluessel: 'kontakt',
    titel: 'Wen dürfen wir ansprechen?',
    hinweis: 'Ihre Kontaktdaten — oder die einer angehörigen Person.',
    ueberspringbar: false,
    erwarteteAngaben: ['vorname', 'nachname', 'telefon'],
  },
  {
    schluessel: 'adresse',
    titel: 'Wo findet die Begleitung statt?',
    hinweis: 'Adresse der pflegebedürftigen Person.',
    ueberspringbar: false,
    erwarteteAngaben: ['strasse', 'plz', 'ort'],
  },
  {
    schluessel: 'pflegegrad',
    titel: 'Liegt ein Pflegegrad vor?',
    hinweis: 'Falls noch keiner da ist, helfen wir beim Antrag.',
    ueberspringbar: true,
    erwarteteAngaben: ['pflegegrad', 'pflegekasse'],
  },
  {
    schluessel: 'bedarf',
    titel: 'Womit können wir helfen?',
    hinweis: 'Mehrfachauswahl — Sie können das jederzeit ändern.',
    ueberspringbar: false,
    erwarteteAngaben: ['leistungsarten', 'wunschzeiten'],
  },
  {
    schluessel: 'kennenlernen',
    titel: 'Kennenlerntermin',
    hinweis: 'Unverbindlich und kostenfrei.',
    ueberspringbar: true,
    erwarteteAngaben: ['terminwunsch'],
  },
]

/**
 * Angehoerigen-Ablauf.
 *
 * Kurz gehalten: angehoerige Personen kommen zu einem BESTEHENDEN
 * Betreuungsverhaeltnis dazu. Der Zugang selbst wird nicht hier erteilt,
 * sondern ueber angehoerigen_zugaenge — dieser Ablauf sammelt nur die
 * Angaben, die die Freigabe braucht.
 */
const ANGEHOERIGE_SCHRITTE: readonly SchrittDefinition[] = [
  {
    schluessel: 'kontakt',
    titel: 'Ihre Kontaktdaten',
    hinweis: 'Damit wir Sie erreichen können.',
    ueberspringbar: false,
    erwarteteAngaben: ['vorname', 'nachname', 'telefon'],
  },
  {
    schluessel: 'bezug',
    titel: 'In welchem Verhältnis stehen Sie?',
    hinweis: 'Angehörig, betreuend oder bevollmächtigt.',
    ueberspringbar: false,
    erwarteteAngaben: ['beziehungsart', 'betroffene_person'],
  },
  {
    schluessel: 'umfang',
    titel: 'Was möchten Sie einsehen?',
    hinweis: 'Sie bestimmen, welche Informationen Sie erreichen.',
    ueberspringbar: false,
    erwarteteAngaben: ['einsicht_umfang'],
  },
]

export const SCHRITTFOLGEN: Record<OnboardingTyp, readonly SchrittDefinition[]> = {
  bewerber: BEWERBER_SCHRITTE,
  kunde: KUNDE_SCHRITTE,
  angehoerige: ANGEHOERIGE_SCHRITTE,
}

export class UnbekannterOnboardingTypError extends Error {
  constructor(typ: string) {
    super(
      `Unbekannte Ablaufart "${typ}". Erlaubt: ${ONBOARDING_TYPEN.join(', ')}. `
      + `Es wird bewusst keine Folge geraten — ein falscher Ablauf fragt die falschen Angaben ab.`
    )
    this.name = 'UnbekannterOnboardingTypError'
  }
}

/** Die Schrittfolge einer Ablaufart. Fail-closed bei unbekannter Art. */
export function schrittfolge(typ: string): readonly SchrittDefinition[] {
  if (!istOnboardingTyp(typ)) throw new UnbekannterOnboardingTypError(typ)
  return SCHRITTFOLGEN[typ]
}

/** Anzahl Schritte — der Wert fuer onboarding_progress.gesamt_schritte. */
export function gesamtSchritte(typ: string): number {
  return schrittfolge(typ).length
}

/**
 * Definition eines Schritts ueber seine 1-basierte Nummer.
 * Fail-closed: eine Nummer ausserhalb der Folge wirft, statt undefined
 * zurueckzugeben — sonst rendert der Wizard eine leere Maske.
 */
export function schrittNummer(typ: string, nummer: number): SchrittDefinition {
  const folge = schrittfolge(typ)
  const schritt = folge[nummer - 1]
  if (!schritt) {
    throw new RangeError(
      `Schritt ${nummer} gibt es im Ablauf "${typ}" nicht (1–${folge.length}).`
    )
  }
  return schritt
}
