// ═══════════════════════════════════════════════════════════════════════
// Provenienz — kommt dieses Ereignis von einem Menschen oder aus einem Skript?
// ═══════════════════════════════════════════════════════════════════════
//
// DER VORFALL, DER DIESES MODUL ERZWUNGEN HAT (31.08.2026)
// Am 31.08. um 06:01 stand in der Spur eine Zeile `security_action` zum
// Konto Rukiye Karakaya, und daraufhin ging eine Mail „Sicherheitshinweis:
// Sicherheitskritische Aktion — Rukiye Karakaya" raus. Beides las sich wie
// echte Kontoaktivitaet. Es war ein Funktionstest, von Hand ausgeloest.
// Dass es einer war, stand NUR im Fliesstext eines Metadatenfeldes
// (`hinweis`) — also an einer Stelle, die keine Abfrage auswertet, kein
// Filter kennt und keine Mail hervorhebt. Wer die Zeile las, musste den
// Hinweis zufaellig bemerken.
//
// Daraus wurde geschlossen, das Konto sei um 06:01 angemeldet gewesen.
// Das war falsch: es gab an diesem Tag ueberhaupt keine Anmeldung. Der
// Fehler lag nicht bei dem, der es las — er lag daran, dass „echt" und
// „nachgestellt" technisch nicht unterscheidbar waren.
//
// ── DIE REGEL ────────────────────────────────────────────────────────────
//
// Jede Zeile der Sicherheitsspur traegt ab jetzt eine PROVENIENZ. Sie ist
// eine eigene, auswertbare Angabe, kein Fliesstext. Und sie wird
// ABGELEITET, nicht uebernommen: ein Aufrufer kann sie nicht behaupten.
// Wer aus einem Skript schreibt, kann sich nicht als echte Anmeldung
// ausgeben, weil ihm schlicht der HTTP-Aufruf fehlt, an dem eine echte
// Anmeldung erkennbar ist.
//
// FAIL-CLOSED: Was sich nicht als echte Nutzeraktivitaet NACHWEISEN laesst,
// gilt als synthetisch. Nicht umgekehrt. Der teure Fehler ist, etwas
// Nachgestelltes fuer echt zu halten — die Gegenrichtung kostet nur eine
// zusaetzliche Nachfrage.
//
// ── WARUM DER SCHLUESSEL `provenienz` HEISST UND NICHT `herkunft` ────────
// `metadata.herkunft` ist BELEGT: der Nachzuegler-Lauf schreibt dort seit
// jeher `auth.users.last_sign_in_at` — also die Quelltabelle, aus der er
// ein Ereignis nachgetragen hat. Ein zweiter Sinn auf demselben Schluessel
// haette beide Aussagen unbrauchbar gemacht, und die alten Zeilen sind
// unveraenderlich; sie liessen sich nicht umschreiben.
//
// ── WARUM IN metadata UND NICHT IN EINER EIGENEN SPALTE ─────────────────
// Eine eigene Spalte waere sauberer. Sie braucht aber eine Migration, und
// DDL ist auf dieser Datenbank ueber den Dienstschluessel gesperrt
// (42501, siehe scripts/verify-ddl-rechte-live.mjs) — das Feld waere auf
// unbestimmte Zeit leer geblieben. `metadata` ist jsonb, PostgREST filtert
// darauf (`metadata->>provenienz`), und der Wert steht ab dem ersten
// Schreibvorgang zur Verfuegung. Wird die Spalte spaeter angelegt, ist der
// Bestand bereits befuellt und liesse sich uebernehmen.
// ═══════════════════════════════════════════════════════════════════════

/**
 * Die sechs Provenienzen. Die ersten drei sind echte Nutzeraktivitaet,
 * die letzten drei sind es ausdruecklich NICHT.
 */
export const PROVENIENZEN = [
  // ── echt: ein Mensch hat gehandelt, belegt durch einen HTTP-Aufruf ──
  /** Anmeldung eines Menschen. */
  'REAL_USER_LOGIN',
  /** Start der App oder der Weboberflaeche durch einen Menschen. */
  'APP_START',
  /** Bestehende Sitzung erneuert — kein neuer Anmeldevorgang. */
  'SESSION_REFRESH',

  // ── nicht echt ──────────────────────────────────────────────────────
  /** Absichtlich ausgeloester Testalarm (npm run security:testalarm). */
  'TEST_ALERT',
  /** Verwaltungshandlung zu Pruefzwecken, nicht im Wirkbetrieb. */
  'ADMIN_TEST',
  /**
   * Nachgetragen oder maschinell erzeugt: Nachzuegler-Lauf, Import,
   * Datenbank-Trigger, Cron. Ein Mensch mag dahinterstehen — belegt ist
   * es an dieser Zeile nicht.
   */
  'SYNTHETIC_EVENT',
] as const

export type Provenienz = (typeof PROVENIENZEN)[number]

/** Der Metadatenschluessel. Bewusst NICHT `herkunft` — siehe Kopf. */
export const PROVENIENZ_SCHLUESSEL = 'provenienz' as const

/**
 * Genau die drei, die echte Nutzeraktivitaet belegen. Diese Liste ist die
 * eigentliche Sicherheitsgrenze des Moduls — sie waechst nicht nebenbei.
 */
export const ECHTE_PROVENIENZEN: readonly Provenienz[] = [
  'REAL_USER_LOGIN', 'APP_START', 'SESSION_REFRESH',
]

export const BEZEICHNUNG_PROVENIENZ: Record<Provenienz, string> = {
  REAL_USER_LOGIN: 'Echte Anmeldung eines Nutzers',
  APP_START: 'Echter App-/Seitenstart eines Nutzers',
  SESSION_REFRESH: 'Echte Sitzungserneuerung',
  TEST_ALERT: 'TESTALARM — kein Vorfall, kein Nutzerverhalten',
  ADMIN_TEST: 'VERWALTUNGSTEST — kein Vorfall, kein Nutzerverhalten',
  SYNTHETIC_EVENT: 'SYNTHETISCH — nachgetragen oder maschinell erzeugt',
}

export function istProvenienz(wert: unknown): wert is Provenienz {
  return typeof wert === 'string' && (PROVENIENZEN as readonly string[]).includes(wert)
}

/**
 * DIE Frage, an der alles haengt: darf diese Zeile als reale Aktivitaet
 * eines Menschen behandelt und gemeldet werden?
 *
 * FAIL-CLOSED. Eine unbekannte, fehlende oder nicht lesbare Provenienz
 * ergibt `false`. Das trifft auch die Bestandszeilen von vor dem
 * 31.08.2026 — die tragen gar keine, und ueber sie ist folglich nichts
 * belegt. „Nicht belegt" als „echt" zu lesen waere genau der Fehler, der
 * dieses Modul ausgeloest hat.
 */
export function istEchteNutzeraktivitaet(wert: unknown): boolean {
  return istProvenienz(wert) && (ECHTE_PROVENIENZEN as readonly string[]).includes(wert)
}

/** Liest die Provenienz aus einer Metadaten-Ablage. */
export function provenienzAus(
  metadata: Record<string, unknown> | null | undefined,
): Provenienz | null {
  const wert = metadata?.[PROVENIENZ_SCHLUESSEL]
  return istProvenienz(wert) ? wert : null
}

/**
 * Ereignistypen, die ausdruecklich einen Test bezeichnen. Sie sind
 * IMMER nicht-echt, unabhaengig davon, wie sie geschrieben wurden — der
 * Ereignistyp selbst ist hier schon die Aussage.
 */
export const TEST_EREIGNISSE: readonly string[] = ['test_alert', 'admin_test']

/**
 * Ereignistypen, die eine echte Anmeldung/Sitzung eines Menschen
 * BESCHREIBEN. Nur bei ihnen kann ein echter HTTP-Aufruf ueberhaupt zu
 * einer echten Provenienz fuehren; alles andere ist inhaltlich keine
 * Anmeldung.
 */
const ECHT_MOEGLICH: Record<string, Provenienz> = {
  login_success: 'REAL_USER_LOGIN',
  app_start: 'APP_START',
  session_start: 'SESSION_REFRESH',
  session_refresh: 'SESSION_REFRESH',
}

export interface ProvenienzLage {
  /** true, wenn ein echter HTTP-Aufruf eines Clients vorliegt. */
  ausEchtemAufruf: boolean
  /** Vom Aufrufer AUSDRUECKLICH als Test erklaert. Kann nur herabstufen. */
  alsTestErklaert?: Provenienz | null
}

/**
 * Leitet die Provenienz ab. Der Aufrufer kann sie NICHT setzen — er kann
 * nur zwei Dinge beisteuern, und beide sind ueberpruefbar bzw. nur
 * herabstufend:
 *
 *   • ob ein echter HTTP-Aufruf vorliegt (das entscheidet der
 *     Schreibweg, nicht der Aufrufer — siehe lib/security/audit.ts),
 *   • eine ausdrueckliche Testerklaerung, die IMMER gewinnt.
 *
 * Die Testerklaerung kann nur herabstufen, nie hochstufen: wer sein
 * Ereignis als Test kennzeichnet, bekommt einen Test — auch mit echtem
 * Aufruf im Ruecken. Umgekehrt macht kein Wert daraus eine echte
 * Anmeldung.
 */
export function leiteProvenienzAb(eventType: string, lage: ProvenienzLage): Provenienz {
  // 1. Der Ereignistyp selbst kann schon ein Test sein.
  if (TEST_EREIGNISSE.includes(eventType)) {
    return eventType === 'admin_test' ? 'ADMIN_TEST' : 'TEST_ALERT'
  }

  // 2. Ausdrueckliche Testerklaerung — gewinnt immer, stuft nur herab.
  const erklaert = lage.alsTestErklaert
  if (erklaert && !ECHTE_PROVENIENZEN.includes(erklaert)) return erklaert

  // 3. Echt ist nur, was inhaltlich eine Anmeldung/Sitzung IST und aus
  //    einem echten Aufruf stammt. Beides muss zutreffen.
  const moeglich = ECHT_MOEGLICH[eventType]
  if (moeglich && lage.ausEchtemAufruf) return moeglich

  // 4. Alles Uebrige. Auch eine echte Rechteaenderung landet hier — sie
  //    IST kein Anmeldeverhalten, und genau das soll die Angabe sagen.
  return 'SYNTHETIC_EVENT'
}

/**
 * Kurzer Zusatz fuer die Betreffzeile. Eine nicht-echte Meldung muss
 * schon im Postfach als solche erkennbar sein — sonst wiederholt sich
 * der 06:01-Fall im naechsten Postfach.
 */
export function betreffZusatz(p: Provenienz | null): string {
  if (p === 'TEST_ALERT') return ' [TESTALARM]'
  if (p === 'ADMIN_TEST') return ' [VERWALTUNGSTEST]'
  if (p === 'SYNTHETIC_EVENT') return ' [SYNTHETISCH]'
  if (p === null) return ' [HERKUNFT UNBELEGT]'
  return ''
}
