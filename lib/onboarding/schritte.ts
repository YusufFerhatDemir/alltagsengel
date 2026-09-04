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

/**
 * Wozu ein Schritt da ist.
 *
 * Nicht jeder Schritt sammelt Angaben: der erste begruesst, der vorletzte
 * laesst pruefen, der letzte schickt ab. Ohne diese Unterscheidung
 * muesste ein Begruessungsschritt so tun, als erwarte er Eingaben — und
 * der Test „jeder Schritt erwartet etwas" waere nur noch durch eine
 * erfundene Angabe zu erfuellen.
 */
export const SCHRITT_ARTEN = ['hinweis', 'formular', 'pruefung'] as const
export type SchrittArt = (typeof SCHRITT_ARTEN)[number]

export interface SchrittDefinition {
  /** hinweis = nur Text, formular = sammelt Angaben, pruefung = ansehen/absenden. */
  art: SchrittArt
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
  /**
   * Angaben, die NUR unter einer Bedingung erwartet werden.
   *
   * Der Fall, für den es das gibt: „Für wen suchen Sie Unterstützung?" —
   * bei „für mich selbst" ist die Frage nach dem Namen der
   * pflegebedürftigen Person sinnlos, bei „für meine Mutter" ist sie
   * unverzichtbar. Beide Angaben fest zu erwarten, hielte die Hälfte der
   * Menschen an einer Frage auf, die sie nicht beantworten können.
   *
   * BEWUSST DEKLARATIV und nicht als Funktion: eine Bedingung als
   * Datenstruktur lässt sich lesen, prüfen und später auch außerhalb von
   * TypeScript auswerten. Eine Funktion im Katalog wäre nur zur Laufzeit
   * verständlich.
   */
  bedingteAngaben?: readonly {
    /** Feld im SELBEN Schritt … */
    feld: string
    /** … hat einen dieser Werte … */
    werte: readonly string[]
    /** … dann werden diese Angaben zusätzlich erwartet. */
    dannErwartet: readonly string[]
  }[]
}

/**
 * Die Angaben, die dieser Schritt bei DIESEM Antwortstand erwartet —
 * feste plus die durch eine Bedingung ausgelösten.
 *
 * Die eine Stelle, an der Bedingungen ausgewertet werden. Wizard,
 * Fortschritt und Zusammenfassung rufen alle hier auf; rechnete jede
 * Seite selbst, hielte die Oberfläche jemanden auf, den der Service
 * längst für vollständig hält (oder umgekehrt).
 */
export function erwarteteAngabenFuer(
  schritt: SchrittDefinition,
  daten: Record<string, unknown> | undefined,
): string[] {
  const angaben = [...schritt.erwarteteAngaben]
  for (const bedingung of schritt.bedingteAngaben ?? []) {
    const wert = String(daten?.[bedingung.feld] ?? '')
    if (bedingung.werte.includes(wert)) {
      for (const a of bedingung.dannErwartet) {
        if (!angaben.includes(a)) angaben.push(a)
      }
    }
  }
  return angaben
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
    art: 'hinweis',
    schluessel: 'willkommen',
    titel: 'Schön, dass Sie da sind',
    hinweis: 'In wenigen Minuten sind Sie durch. Sie können jederzeit pausieren.',
    ueberspringbar: false,
    erwarteteAngaben: [],
  },
  {
    art: 'formular',
    schluessel: 'kontakt',
    titel: 'Ihre persönlichen Angaben',
    hinweis: 'Damit wir Sie erreichen können.',
    ueberspringbar: false,
    erwarteteAngaben: ['vorname', 'nachname', 'geburtsdatum', 'telefon', 'email'],
  },
  {
    art: 'formular',
    schluessel: 'einsatzgebiet',
    titel: 'Wo möchten Sie arbeiten?',
    hinweis: 'Wir suchen Einsätze in Ihrer Nähe.',
    ueberspringbar: false,
    erwarteteAngaben: ['plz', 'stadt', 'radius_km'],
  },
  {
    art: 'formular',
    schluessel: 'erfahrung',
    titel: 'Ihre Erfahrung',
    hinweis: 'Auch ohne Ausbildung möglich — dieser Schritt ist freiwillig.',
    ueberspringbar: true,
    erwarteteAngaben: ['ausbildung', 'jahre_erfahrung', 'taetigkeiten'],
  },
  {
    art: 'formular',
    schluessel: 'fuehrerschein',
    titel: 'Führerschein und Fahrzeug',
    hinweis: 'Beides ist keine Voraussetzung — viele Einsätze sind gut erreichbar.',
    ueberspringbar: false,
    // Nur der Führerschein wird erwartet. „Nein" ist eine vollständige
    // Antwort; ein Fahrzeug wird dann gar nicht erst gefragt.
    erwarteteAngaben: ['fuehrerschein'],
  },
  {
    art: 'formular',
    schluessel: 'sprachen',
    titel: 'Welche Sprachen sprechen Sie?',
    hinweis: 'Weitere Sprachen sind bei uns ausdrücklich willkommen.',
    ueberspringbar: false,
    erwarteteAngaben: ['deutsch_niveau'],
  },
  {
    art: 'formular',
    schluessel: 'verfuegbarkeit',
    titel: 'Wann haben Sie Zeit?',
    hinweis: 'Ungefähre Angaben reichen — Änderungen sind jederzeit möglich.',
    ueberspringbar: false,
    erwarteteAngaben: ['wochentage', 'zeitfenster'],
  },
  {
    art: 'formular',
    schluessel: 'stundenumfang',
    titel: 'Wie viel möchten Sie arbeiten?',
    hinweis: 'Auch das lässt sich später anpassen.',
    ueberspringbar: false,
    erwarteteAngaben: ['umfang'],
  },
  {
    art: 'formular',
    schluessel: 'fuehrungszeugnis',
    titel: 'Erweitertes Führungszeugnis',
    hinweis: 'Für die Arbeit mit pflegebedürftigen Menschen vorgeschrieben.',
    ueberspringbar: false,
    // Erwartet wird die AUSKUNFT, nicht das Dokument: „beantrage ich noch"
    // ist eine gültige Antwort und darf niemanden aufhalten.
    erwarteteAngaben: ['fuehrungszeugnis_status'],
  },
  {
    art: 'formular',
    schluessel: 'unterlagen',
    titel: 'Unterlagen',
    hinweis: 'Sie können alles auch später nachreichen.',
    ueberspringbar: true,
    erwarteteAngaben: ['lebenslauf'],
  },
  {
    art: 'pruefung',
    schluessel: 'zusammenfassung',
    titel: 'Bitte prüfen Sie Ihre Angaben',
    hinweis: 'Sie können jeden Punkt noch ändern.',
    ueberspringbar: false,
    erwarteteAngaben: [],
  },
  {
    art: 'pruefung',
    schluessel: 'absenden',
    titel: 'Bewerbung absenden',
    hinweis: 'Danach melden wir uns bei Ihnen.',
    ueberspringbar: false,
    erwarteteAngaben: [],
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
    art: 'formular',
    schluessel: 'fuer_wen',
    titel: 'Für wen suchen Sie Unterstützung?',
    hinweis: 'Damit wir wissen, mit wem wir sprechen.',
    ueberspringbar: false,
    erwarteteAngaben: ['fuer_wen'],
    // Wer für eine andere Person anfragt, wird zusätzlich nach ihr
    // gefragt. Bei „für mich selbst" entfallen diese Felder ganz — sie
    // wären dann eine Frage nach der eigenen Person in dritter Person.
    bedingteAngaben: [{
      feld: 'fuer_wen',
      werte: ['angehoeriger', 'andere'],
      dannErwartet: ['person_vorname', 'person_nachname', 'beziehung'],
    }],
  },
  {
    art: 'formular',
    schluessel: 'adresse',
    titel: 'Wo findet die Begleitung statt?',
    hinweis: 'Die Adresse der Person, die Unterstützung bekommt.',
    ueberspringbar: false,
    erwarteteAngaben: ['plz', 'ort', 'strasse'],
  },
  {
    art: 'formular',
    schluessel: 'bedarf',
    titel: 'Womit können wir helfen?',
    hinweis: 'Mehrfachauswahl — Sie können das jederzeit ändern.',
    ueberspringbar: false,
    erwarteteAngaben: ['leistungsarten'],
  },
  {
    art: 'formular',
    schluessel: 'pflegegrad',
    titel: 'Liegt ein Pflegegrad vor?',
    hinweis: 'Falls noch keiner da ist, helfen wir beim Antrag.',
    ueberspringbar: false,
    // „Weiß ich nicht" ist eine gueltige Antwort — siehe Schritt-Komponente.
    erwarteteAngaben: ['pflegegrad'],
  },
  {
    art: 'formular',
    schluessel: 'finanzierung',
    titel: 'Wie soll die Unterstützung bezahlt werden?',
    hinweis: 'Wir erklären Ihnen die Möglichkeiten — nichts ist verbindlich.',
    ueberspringbar: false,
    erwarteteAngaben: ['finanzierungsweg'],
  },
  {
    art: 'formular',
    schluessel: 'zeiten',
    titel: 'Wann soll jemand kommen?',
    hinweis: 'Ungefähre Angaben reichen für den Anfang.',
    ueberspringbar: false,
    erwarteteAngaben: ['wochentage', 'tageszeit', 'haeufigkeit'],
  },
  {
    art: 'formular',
    schluessel: 'besonderheiten',
    titel: 'Gibt es etwas, das wir wissen sollten?',
    hinweis: 'Freiwillig — hilft uns bei der Auswahl der passenden Person.',
    ueberspringbar: true,
    erwarteteAngaben: ['besonderheiten'],
  },
  {
    art: 'formular',
    schluessel: 'unterlagen',
    titel: 'Unterlagen',
    hinweis: 'Alles freiwillig und jederzeit nachreichbar.',
    ueberspringbar: true,
    erwarteteAngaben: ['pflegegradbescheid'],
  },
  {
    art: 'pruefung',
    schluessel: 'zusammenfassung',
    titel: 'Bitte prüfen Sie Ihre Angaben',
    hinweis: 'Sie können jeden Punkt noch ändern.',
    ueberspringbar: false,
    erwarteteAngaben: [],
  },
  {
    art: 'pruefung',
    schluessel: 'abschluss',
    titel: 'Anfrage absenden',
    hinweis: 'Unverbindlich und kostenfrei.',
    ueberspringbar: false,
    erwarteteAngaben: [],
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
    art: 'formular',
    schluessel: 'kontakt',
    titel: 'Ihre Kontaktdaten',
    hinweis: 'Damit wir Sie erreichen können.',
    ueberspringbar: false,
    erwarteteAngaben: ['vorname', 'nachname', 'telefon'],
  },
  {
    art: 'formular',
    schluessel: 'bezug',
    titel: 'Zu wem gehören Sie?',
    hinweis: 'Die Person, die bereits von uns betreut wird.',
    ueberspringbar: false,
    erwarteteAngaben: ['person_vorname', 'person_nachname', 'beziehungsart'],
    // Wer als bevollmächtigt oder betreuend auftritt, muss das belegen
    // können — bei „angehoerig" verlangt niemand eine Urkunde.
    bedingteAngaben: [{
      feld: 'beziehungsart',
      werte: ['betreuer', 'bevollmaechtigter'],
      dannErwartet: ['nachweis_art'],
    }],
  },
  {
    art: 'formular',
    schluessel: 'umfang',
    titel: 'Was möchten Sie einsehen?',
    hinweis: 'Sie bestimmen, welche Informationen Sie erreichen.',
    ueberspringbar: false,
    erwarteteAngaben: ['einsicht_umfang'],
  },
  {
    art: 'formular',
    schluessel: 'unterlagen',
    titel: 'Nachweis hochladen',
    hinweis: 'Nur nötig bei Betreuung oder Vollmacht — sonst überspringen.',
    ueberspringbar: true,
    erwarteteAngaben: ['vollmacht'],
  },
  {
    art: 'pruefung',
    schluessel: 'zusammenfassung',
    titel: 'Bitte prüfen Sie Ihre Angaben',
    hinweis: 'Sie können jeden Punkt noch ändern.',
    ueberspringbar: false,
    erwarteteAngaben: [],
  },
  {
    art: 'pruefung',
    schluessel: 'abschluss',
    titel: 'Zugang beantragen',
    hinweis: 'Die Freigabe erteilt die betreute Person oder unsere Verwaltung.',
    ueberspringbar: false,
    erwarteteAngaben: [],
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
