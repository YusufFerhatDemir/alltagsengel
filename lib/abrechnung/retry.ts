/**
 * Wiederholversuche für den Versand an die Datenannahmestelle.
 *
 * WARUM DAS NICHT NUR "DREIMAL PROBIEREN" IST
 * Ein SFTP-Versand ist nicht idempotent, sobald die Auftragsdatei oben liegt:
 * viele Annahmestellen starten die Verarbeitung genau dann, wenn die
 * Auftragsdatei eintrifft. Ein blinder zweiter Versuch nach einem Abbruch in
 * dieser Phase kann eine zweite Verarbeitung derselben Abrechnung auslösen —
 * bei der Kasse eine doppelte Forderung.
 *
 * Deshalb entscheidet nicht nur die Fehlerart, sondern auch, WIE WEIT der
 * Versuch gekommen ist:
 *
 *   verbindung    → Wiederholung unbedenklich, es liegt nichts drüben
 *   nutzdaten     → Wiederholung unbedenklich; die Nutzdatendatei wird unter
 *                   demselben Namen überschrieben und ohne Auftragsdatei
 *                   nimmt die Annahmestelle sie nicht in Verarbeitung
 *   auftragsdatei → KEINE automatische Wiederholung. Der Upload kann teilweise
 *                   angekommen sein; ob die Gegenstelle bereits angefangen hat,
 *                   ist von hier aus nicht feststellbar
 *   verifikation  → KEINE automatische Wiederholung. Beide Dateien liegen
 *                   vollständig drüben, nur die Grössenprüfung schlug fehl
 *
 * Was nicht automatisch wiederholt wird, verschwindet nicht: es geht in die
 * Dead-Letter-Queue und damit auf den Tisch eines Menschen.
 *
 * UNBEKANNTE FEHLER GELTEN ALS NICHT WIEDERHOLBAR
 * Die Liste der transienten Fehler ist eine Positivliste. Ein Fehler, der
 * darin nicht vorkommt, wird nicht wiederholt. Das ist die konservative
 * Richtung: eine unnötige Dead-Letter-Zeile kostet einen Blick, eine
 * unnötige Wiederholung kann eine Forderung verdoppeln.
 */

/** Wie weit ein Übertragungsversuch gekommen ist. */
export type TransportPhase =
  | 'verbindung'
  | 'nutzdaten'
  | 'auftragsdatei'
  | 'verifikation'
  | 'fertig'

/** Nach diesen Phasen ist eine Wiederholung nachweislich folgenlos. */
export const RETRY_SICHERE_PHASEN: readonly TransportPhase[] = ['verbindung', 'nutzdaten']

/** Mehr Versuche helfen bei keinem der bekannten Fehlerbilder. */
export const MAX_VERSUCHE = 3

/** Wartezeit vor dem 2. Versuch; verdoppelt sich danach (1 s, 2 s, 4 s …). */
export const BASIS_WARTEZEIT_MS = 1_000

/** Obergrenze, damit ein Serverless-Aufruf nicht am Timeout stirbt. */
export const MAX_WARTEZEIT_MS = 8_000

/**
 * Fehlerbilder, die von selbst wieder verschwinden: Netz, Last, Timeouts.
 *
 * Bewusst NICHT enthalten:
 *   · ENOTFOUND / getaddrinfo — falscher Hostname, das wird beim dritten Mal
 *     nicht richtiger
 *   · Authentifizierungsfehler — falscher oder nicht registrierter Key
 *   · Permission denied / No such file — Verzeichnisrechte, Konfiguration
 * Alle drei sind Konfigurationsfehler und gehören vor einen Menschen, nicht in
 * eine Warteschleife.
 */
const TRANSIENTE_MUSTER: RegExp[] = [
  /\bETIMEDOUT\b/i,
  /\bECONNRESET\b/i,
  /\bECONNREFUSED\b/i,
  /\bEHOSTUNREACH\b/i,
  /\bENETUNREACH\b/i,
  /\bENETDOWN\b/i,
  /\bEPIPE\b/i,
  /\bEAI_AGAIN\b/i,
  /timed?\s*out/i,
  /timeout while waiting/i,
  /socket hang up/i,
  /connection (lost|closed|reset|aborted)/i,
  /handshake/i,
  /temporarily unavailable/i,
  /try again later/i,
  /server (is )?(busy|overloaded)/i,
  /too many connections/i,
]

/** Fehlerbilder, die ausdrücklich NICHT wiederholt werden — auch nicht, wenn
 *  der Text zufällig ein transientes Muster enthält. */
const DAUERHAFTE_MUSTER: RegExp[] = [
  /all configured authentication methods failed/i,
  /permission denied/i,
  /\bENOTFOUND\b/i,
  /getaddrinfo/i,
  /no such file or directory/i,
  /\bEACCES\b/i,
  /quota exceeded/i,
  /authentication failure/i,
  /host key verification failed/i,
]

/**
 * Ist der Fehler voraussichtlich vorübergehend?
 *
 * Dauerhafte Muster schlagen transiente: "Permission denied after timeout"
 * bleibt ein Rechteproblem.
 */
export function istTransienterFehler(meldung: string | null | undefined): boolean {
  if (!meldung) return false
  if (DAUERHAFTE_MUSTER.some(m => m.test(meldung))) return false
  return TRANSIENTE_MUSTER.some(m => m.test(meldung))
}

export interface RetryBewertung {
  erlaubt: boolean
  /** Klartext für Protokoll und Dead-Letter-Eintrag. */
  grund: string
}

/**
 * Darf dieser gescheiterte Versuch automatisch wiederholt werden?
 *
 * Beide Bedingungen müssen erfüllt sein: sichere Phase UND transienter Fehler.
 */
export function retryErlaubt(
  phase: TransportPhase,
  fehlermeldung: string | null | undefined,
): RetryBewertung {
  if (!RETRY_SICHERE_PHASEN.includes(phase)) {
    return {
      erlaubt: false,
      grund: `Abbruch in Phase "${phase}" — eine automatische Wiederholung könnte bei der `
        + 'Annahmestelle eine zweite Verarbeitung derselben Abrechnung auslösen. '
        + 'Muss von Hand geprüft werden.',
    }
  }
  if (!istTransienterFehler(fehlermeldung)) {
    return {
      erlaubt: false,
      grund: 'Fehlerbild ist nicht als vorübergehend bekannt — vermutlich Konfiguration '
        + '(Zugang, Hostname, Rechte). Eine Wiederholung würde identisch scheitern.',
    }
  }
  return { erlaubt: true, grund: 'Vorübergehender Netzfehler vor der Auftragsdatei' }
}

/** Wartezeit vor Versuch Nummer `versuch` (1-basiert; vor dem 1. wird nicht gewartet). */
export function wartezeitMs(versuch: number): number {
  if (versuch <= 1) return 0
  return Math.min(BASIS_WARTEZEIT_MS * 2 ** (versuch - 2), MAX_WARTEZEIT_MS)
}

export interface VersuchProtokoll {
  versuch: number
  erfolg: boolean
  phase: TransportPhase
  fehler: string | null
  wartezeitMs: number
  dauerMs: number
  /** Warum nach diesem Versuch abgebrochen wurde (null = weiter oder fertig). */
  abbruchgrund: string | null
}

export interface WiederholungsErgebnis<T> {
  ergebnis: T
  erfolg: boolean
  versuche: number
  /** Ein Eintrag je Versuch — der Nachweis, was probiert wurde. */
  protokoll: VersuchProtokoll[]
  /** Gesetzt, wenn aufgegeben wurde: der Grund für den Dead-Letter-Eintrag. */
  aufgegeben: { grund: 'versuche_erschoepft' | 'nicht_wiederholbar'; text: string } | null
}

export interface WiederholungsOptionen<T> {
  /** Wie das Ergebnis eines Aufrufs zu bewerten ist. */
  bewerte: (ergebnis: T) => { erfolg: boolean; phase: TransportPhase; fehler: string | null }
  maxVersuche?: number
  /** Wird vor jedem Wartevorgang aufgerufen — für Protokollzeilen. */
  aufWiederholung?: (protokoll: VersuchProtokoll) => void | Promise<void>
  /** Einspeisbar, damit Tests nicht wirklich warten. */
  warte?: (ms: number) => Promise<void>
}

const echtWarten = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

/**
 * Führt `aktion` aus und wiederholt sie bei vorübergehenden Fehlern.
 *
 * Wirft nicht bei fachlichem Misserfolg: das Ergebnis des letzten Versuchs
 * kommt mitsamt Protokoll zurück, damit der Aufrufer eine Dead-Letter-Zeile
 * mit vollständiger Vorgeschichte schreiben kann. Wirft eine Ausnahme der
 * Aktion selbst durch — ein Programmierfehler soll nicht dreimal passieren.
 */
export async function mitWiederholung<T>(
  aktion: (versuch: number) => Promise<T>,
  optionen: WiederholungsOptionen<T>,
): Promise<WiederholungsErgebnis<T>> {
  const maxVersuche = Math.max(1, optionen.maxVersuche ?? MAX_VERSUCHE)
  const warte = optionen.warte ?? echtWarten
  const protokoll: VersuchProtokoll[] = []

  let letztes!: T

  for (let versuch = 1; versuch <= maxVersuche; versuch++) {
    const pause = versuch === 1 ? 0 : wartezeitMs(versuch)
    if (pause > 0) await warte(pause)

    const start = Date.now()
    letztes = await aktion(versuch)
    const bewertung = optionen.bewerte(letztes)

    const zeile: VersuchProtokoll = {
      versuch,
      erfolg: bewertung.erfolg,
      phase: bewertung.phase,
      fehler: bewertung.fehler,
      wartezeitMs: pause,
      dauerMs: Date.now() - start,
      abbruchgrund: null,
    }

    if (bewertung.erfolg) {
      protokoll.push(zeile)
      await optionen.aufWiederholung?.(zeile)
      return { ergebnis: letztes, erfolg: true, versuche: versuch, protokoll, aufgegeben: null }
    }

    const bewertetErneut = retryErlaubt(bewertung.phase, bewertung.fehler)

    if (!bewertetErneut.erlaubt) {
      zeile.abbruchgrund = bewertetErneut.grund
      protokoll.push(zeile)
      await optionen.aufWiederholung?.(zeile)
      return {
        ergebnis: letztes,
        erfolg: false,
        versuche: versuch,
        protokoll,
        aufgegeben: { grund: 'nicht_wiederholbar', text: bewertetErneut.grund },
      }
    }

    if (versuch === maxVersuche) {
      zeile.abbruchgrund = `${maxVersuche} Versuche erschöpft — letzter Fehler: ${bewertung.fehler ?? 'unbekannt'}`
      protokoll.push(zeile)
      await optionen.aufWiederholung?.(zeile)
      return {
        ergebnis: letztes,
        erfolg: false,
        versuche: versuch,
        protokoll,
        aufgegeben: { grund: 'versuche_erschoepft', text: zeile.abbruchgrund },
      }
    }

    zeile.abbruchgrund = null
    protokoll.push(zeile)
    await optionen.aufWiederholung?.(zeile)
  }

  // Unerreichbar: die Schleife kehrt in jedem Zweig zurück.
  return {
    ergebnis: letztes,
    erfolg: false,
    versuche: maxVersuche,
    protokoll,
    aufgegeben: { grund: 'versuche_erschoepft', text: 'Versuche erschöpft' },
  }
}
