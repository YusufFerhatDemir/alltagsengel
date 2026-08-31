// ═══════════════════════════════════════════════════════════════════════════
// BEFRISTUNG DER KONTOÜBERWACHUNG — eine Überwachung ohne Ende ist
// Dauerüberwachung
//
// ── DER BEFUND VOM 31.08.2026 ──────────────────────────────────────────────
// `security_watchlist` kennt `aktiv` (boolean) und sonst nichts, was einen
// Zeitraum beschreibt. Ein einmal gesetzter Eintrag ueberwacht die
// Anmeldungen, Geraete und IP-Adressen einer namentlich bekannten Person
// so lange, bis jemand daran denkt, ihn abzuschalten. Live steht genau ein
// Eintrag, gesetzt am 30.08.2026, ohne Ende.
//
// Das ist keine Kleinigkeit der Bedienung, sondern der Unterschied
// zwischen einer anlassbezogenen Massnahme und einer dauerhaften
// Beobachtung eines Beschaeftigten. Art. 5 Abs. 1 lit. e DSGVO
// (Speicherbegrenzung) und § 26 BDSG verlangen den Anlass UND seine
// zeitliche Begrenzung; das BAG misst verdeckte oder unbefristete
// Kontrolle regelmaessig an der Verhaeltnismaessigkeit.
//
// ── WARUM DIE FRIST HIER UND NICHT IN DER DATENBANK STEHT ──────────────────
// Eine Spalte `befristet_bis` waere die saubere Loesung. Sie braucht eine
// Migration, und DDL ist auf dieser Datenbank ueber den Dienstschluessel
// gesperrt (42501). Die Frist waere damit auf unbestimmte Zeit NICHT
// vorhanden — also genau das, was hier abgestellt werden soll.
//
// `created_at` gibt es. Aus ihm laesst sich die Frist ohne jede
// Schemaaenderung ableiten, und die Wirkung ist dieselbe: nach Ablauf
// zaehlt der Eintrag nicht mehr, und niemand muss daran denken.
// Die Migration 20261024000000 legt die richtigen Spalten nach; bis dahin
// gilt diese Regel, und danach gilt sie weiter als Obergrenze.
//
// ── DIE RICHTUNG DES FAIL-CLOSED IST HIER EINE ANDERE ──────────────────────
// Im uebrigen Sicherheitsmodul heisst fail-closed: im Zweifel MEHR melden.
// Hier ist es umgekehrt, und das ist kein Widerspruch: das Risiko dieser
// Funktion ist nicht die verpasste Meldung, sondern die unbemerkt
// weiterlaufende Beobachtung eines Menschen. Ein unlesbares oder
// unplausibles Datum laesst den Eintrag deshalb ABLAUFEN, nicht
// weiterlaufen.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Hoechstdauer einer Kontoueberwachung in Tagen.
 *
 * 90 Tage, weil das die uebliche Obergrenze fuer eine anlassbezogene
 * Massnahme ist und ein Quartal ueberspannt — lang genug, um einen
 * Verdacht zu klaeren, kurz genug, dass niemand sie vergisst. Wer laenger
 * beobachten muss, verlaengert ausdruecklich und begruendet erneut. Genau
 * dieser bewusste Akt ist der Zweck der Frist.
 */
export const HOECHSTDAUER_TAGE = 90

/**
 * Ab wann vor Ablauf gewarnt wird. Ohne Vorwarnung endet eine laufende
 * Massnahme mitten in der Klaerung, und die Verlaengerung wird zur Hast.
 */
export const WARNUNG_AB_TAGEN = 14

export interface Befristung {
  /** Ende der Frist, ISO. Das FRUEHERE aus `befristet_bis` und `created_at` + HOECHSTDAUER_TAGE. */
  laeuftAbAm: string
  /** Verbleibende volle Tage. Negativ, wenn die Frist vorbei ist. */
  restTage: number
  /** Frist vorbei — der Eintrag zaehlt NICHT mehr. */
  abgelaufen: boolean
  /** Frist laeuft, endet aber bald. */
  laeuftBaldAb: boolean
  /**
   * Woher das Ende stammt. `angeordnet` heisst: die Spalte `befristet_bis`
   * ist gesetzt und liegt frueher als die Hoechstdauer — jemand hat also
   * ausdruecklich kuerzer angeordnet. Die Oberflaeche soll das sagen
   * koennen, sonst sieht eine verkuerzte Massnahme aus wie die Regel.
   */
  quelle: 'hoechstdauer' | 'angeordnet' | 'unbestimmbar'
  /** Ein Satz fuer die Oberflaeche. Nie beschoenigend. */
  hinweis: string
}

const TAG_MS = 86_400_000

/**
 * Berechnet die Befristung eines Eintrags.
 *
 * `heute` kommt von aussen — dieselbe Regel wie bei den Segmenten: eine
 * Funktion, die die Uhr liest, ist nicht pruefbar, und „laeuft in drei
 * Tagen ab" waere gegen die Systemzeit nicht testbar.
 */
export function befristungFuer(
  createdAt: string | null | undefined,
  heute: Date,
  befristetBis?: string | null,
): Befristung {
  const start = createdAt ? Date.parse(createdAt) : NaN

  const unbestimmbar = (satz: string): Befristung => ({
    laeuftAbAm: '',
    restTage: 0,
    abgelaufen: true,
    laeuftBaldAb: false,
    quelle: 'unbestimmbar',
    hinweis: satz,
  })

  if (!Number.isFinite(start)) {
    // Kein brauchbares Anlagedatum. Siehe Kopf: hier laeuft der Eintrag
    // ab, statt unbefristet weiterzulaufen.
    return unbestimmbar(
      'Ohne belegtes Anlagedatum lässt sich keine Frist bestimmen — die Überwachung '
      + 'gilt als abgelaufen und muss ausdrücklich neu angeordnet werden.',
    )
  }

  // ── `befristet_bis` (Migration 20261024000000) ──────────────────────
  // Die Spalte darf das Ende nur VORZIEHEN, nie hinausschieben. Sonst
  // koennte ein Eintrag in der Datenbank die 90-Tage-Regel des
  // Anwendungscodes aushebeln — und die Frist waere wieder verhandelbar.
  //
  // Ein GESETZTER, aber unlesbarer Wert laesst den Eintrag ablaufen.
  // Dieselbe Richtung wie oben: im Zweifel endet die Beobachtung.
  const hoechstEnde = start + HOECHSTDAUER_TAGE * TAG_MS
  let ende = hoechstEnde
  let quelle: Befristung['quelle'] = 'hoechstdauer'

  if (befristetBis !== null && befristetBis !== undefined && befristetBis !== '') {
    const angeordnet = Date.parse(befristetBis)
    if (!Number.isFinite(angeordnet)) {
      return unbestimmbar(
        'Das angeordnete Fristende ist nicht lesbar — die Überwachung gilt als '
        + 'abgelaufen und muss ausdrücklich neu angeordnet werden.',
      )
    }
    if (angeordnet < ende) { ende = angeordnet; quelle = 'angeordnet' }
  }

  const restTage = Math.floor((ende - heute.getTime()) / TAG_MS)
  const abgelaufen = heute.getTime() >= ende
  const laeuftBaldAb = !abgelaufen && restTage <= WARNUNG_AB_TAGEN
  const laeuftAbAm = new Date(ende).toISOString()

  return {
    laeuftAbAm,
    restTage,
    abgelaufen,
    laeuftBaldAb,
    quelle,
    hinweis: abgelaufen
      ? `Frist am ${laeuftAbAm.slice(0, 10)} abgelaufen — die Überwachung wirkt nicht mehr. `
        + 'Für eine Fortsetzung ist eine neue, begründete Anordnung nötig.'
      : laeuftBaldAb
        ? `Läuft am ${laeuftAbAm.slice(0, 10)} ab (noch ${restTage} Tage). `
          + 'Danach endet die Überwachung von selbst.'
        : `Befristet bis ${laeuftAbAm.slice(0, 10)} (noch ${restTage} Tage).`,
  }
}

/** Kurzform fuer die Entscheidungswege. */
export function istAbgelaufen(
  createdAt: string | null | undefined,
  heute: Date,
  befristetBis?: string | null,
): boolean {
  return befristungFuer(createdAt, heute, befristetBis).abgelaufen
}

/**
 * Das Fristende einer NEUEN Anordnung — heute plus Hoechstdauer.
 *
 * WARUM DAS EINE EIGENE FUNKTION IST
 * Bis zum 01.09.2026 leitete sich die Frist ausschliesslich aus
 * `created_at` ab. Das hatte eine Folge, die niemand beabsichtigt hatte:
 * ein abgelaufener Eintrag liess sich nicht wieder anordnen. Das
 * Einschalten schrieb `aktiv = true`, `created_at` blieb das alte Datum,
 * der Eintrag war im selben Moment wieder abgelaufen — und die
 * Oberflaeche meldete trotzdem „Alarm ist aktiv". Eine Frist, aus der es
 * keinen Rueckweg gibt, ist keine Befristung, sondern ein Einwegventil.
 *
 * Der Rueckweg ist ausdruecklich: eine neue Anordnung braucht die volle
 * Begruendung mit allen vier Pflichtangaben, wird als
 * `watchlist_change` protokolliert und startet die Frist neu.
 */
export function neuesFristende(heute: Date): string {
  return new Date(heute.getTime() + HOECHSTDAUER_TAGE * TAG_MS).toISOString()
}

// ───────────────────────────────────────────────────────────────────────────
// Die vier Angaben, die eine personenbezogene Sondermassnahme braucht
// ───────────────────────────────────────────────────────────────────────────

/**
 * Zweck, Rechtsgrundlage, Zeitraum, Transparenz — die vier Punkte, ohne
 * die eine Ueberwachung nicht angeordnet werden darf.
 *
 * WARUM ALS TEXTMARKEN UND NICHT ALS SPALTEN
 * Aus demselben Grund wie die Frist: die Spalten braeuchten eine
 * Migration. Bis dahin muessen die Angaben IM BEGRUENDUNGSTEXT stehen,
 * und zwar auffindbar — sonst steht dort ein Fliesstext, in dem sich
 * hinterher niemand auf eine Rechtsgrundlage berufen kann.
 *
 * Die Marken sind bewusst kurz und deutsch; die Oberflaeche gibt eine
 * Vorlage aus, sodass niemand sie auswendig kennen muss.
 */
export const PFLICHTANGABEN = [
  { marke: 'Zweck:', name: 'Zweck', hilfe: 'Der konkrete Anlass — was genau soll geklärt werden?' },
  { marke: 'Rechtsgrundlage:', name: 'Rechtsgrundlage', hilfe: 'Worauf stützt sich die Maßnahme? (z. B. Art. 6 Abs. 1 lit. f DSGVO, § 26 BDSG)' },
  { marke: 'Zeitraum:', name: 'Zeitraum', hilfe: 'Für wie lange ist sie vorgesehen?' },
  { marke: 'Transparenz:', name: 'Transparenz', hilfe: 'Ob und wann die betroffene Person informiert wurde.' },
] as const

/** Die Vorlage, die die Oberflaeche in das leere Feld schreibt. */
export const BEGRUENDUNG_VORLAGE = PFLICHTANGABEN
  .map(p => `${p.marke} `)
  .join('\n')

export interface AngabenBefund {
  ok: boolean
  /** Welche Marken fehlen oder stehen ohne Inhalt da. */
  fehlend: string[]
  meldung: string
}

/**
 * Prueft, ob alle vier Angaben vorhanden UND befuellt sind.
 *
 * Eine Marke ohne Inhalt („Zweck:" und dann nichts) zaehlt als fehlend —
 * sonst liesse sich die Pflicht durch Einfuegen der Vorlage erfuellen,
 * ohne etwas zu sagen. Das waere schlimmer als gar keine Pflicht, weil
 * es wie eine Dokumentation aussieht.
 */
export function pruefeAngaben(grund: string): AngabenBefund {
  const text = grund ?? ''
  const fehlend: string[] = []

  for (const p of PFLICHTANGABEN) {
    const stelle = text.toLowerCase().indexOf(p.marke.toLowerCase())
    if (stelle === -1) { fehlend.push(p.name); continue }

    // Inhalt ist alles bis zur naechsten Marke oder bis zum Zeilenende.
    const nach = text.slice(stelle + p.marke.length)
    const bisZeilenende = nach.split('\n')[0]
    if (bisZeilenende.trim().length < 3) fehlend.push(p.name)
  }

  return {
    ok: fehlend.length === 0,
    fehlend,
    meldung: fehlend.length === 0
      ? 'Alle vier Pflichtangaben sind vorhanden.'
      : `Es fehlen: ${fehlend.join(', ')}. Eine personenbezogene Sondermaßnahme braucht `
        + 'Zweck, Rechtsgrundlage, Zeitraum und eine Angabe zur Transparenz — '
        + 'eine Begründung ohne diese vier Punkte ist im Streitfall keine.',
  }
}
