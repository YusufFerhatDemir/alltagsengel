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
 * Zwei ZUSAETZLICHE, gröbere Kennzeichen neben der Provenienz:
 * `metadata.is_test` (boolean) und `metadata.source`.
 *
 * WARUM DREI ANGABEN FUER EINE SACHE
 * Die Provenienz ist genau, aber sie hat sechs Werte — wer schnell
 * filtern oder in einer Auswertung eine Spalte braucht, greift sonst zum
 * Textvergleich. `is_test` beantwortet die eine Frage, die im Ernstfall
 * zaehlt, mit ja oder nein.
 *
 * SIE KOENNEN NICHT AUSEINANDERLAUFEN, weil beide AUS der Provenienz
 * abgeleitet werden und nirgends eigenstaendig gesetzt. Eine zweite,
 * unabhaengig gepflegte Wahrheit waere hier das Gefaehrlichste — genau
 * daran ist MIGRATION_LEDGER.md an fuenf Stellen falsch geworden.
 */
export const IST_TEST_SCHLUESSEL = 'is_test' as const
export const QUELLE_SCHLUESSEL = 'source' as const

/** Die groebere Einordnung hinter `metadata.source`. */
export const QUELLEN = ['real_user', 'synthetic_test', 'system'] as const
export type Quelle = (typeof QUELLEN)[number]

/**
 * Kennung, die der Trigger auf auth.users in `device_info.quelle`
 * hinterlaesst (Migration 20261018000002).
 */
export const AUTH_TRIGGER_QUELLE = 'db_trigger' as const

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

/**
 * Dieselben Ereignistypen als Liste — fuer Abfragen, die dieselbe Frage
 * in der DATENBANK stellen muessen.
 *
 * Warum das eine eigene Ausfuhr braucht: die Provenienz einer
 * Trigger-Zeile wird beim LESEN hergeleitet und steht nicht in der
 * Zeile. Ein Filter, der nur `metadata->>provenienz` prueft, findet
 * diese Zeilen also nicht — und zeigte dann in der Ansicht „echt", waere
 * aber unter „nur echte Nutzeraktivitaet" nicht dabei. Ein Filter, der
 * etwas anderes sagt als die Liste, ist schlimmer als kein Filter.
 */
export const ECHT_MOEGLICHE_EREIGNISSE: readonly string[] = Object.keys(ECHT_MOEGLICH)

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
 * Provenienz einer BESTEHENDEN Zeile, inklusive der Zeilen, die die
 * Datenbank selbst geschrieben hat.
 *
 * WARUM EINE TRIGGER-ZEILE ALS ECHTE ANMELDUNG GILT
 * Der Trigger public.security_audit_auth_anmeldung() feuert
 * ausschliesslich, wenn sich `auth.users.last_sign_in_at` auf einen
 * neuen, nicht leeren Wert aendert (Migration 20261018000002). Er kann
 * also gar nicht anders entstehen als durch eine tatsaechliche
 * Anmeldung — das ist die AUTHENTISCHSTE Quelle, die es dafuer gibt,
 * authentischer als die Anwendungsroute, die man umgehen koennte.
 *
 * Das ist kein Aufweichen der Fail-closed-Regel, sondern ihre richtige
 * Anwendung: hier LIEGT ein Beleg vor, er steht nur in `device_info`
 * statt in `metadata`. Die Zeilen tragen keine Provenienz, weil der
 * Trigger in SQL laeuft und die Ableitung im Anwendungscode sitzt; die
 * Tabelle ist unveraenderlich, nachtragen ginge ohnehin nicht.
 *
 * Was NICHT hergeleitet wird: Geraet, Browser, IP. Die Trigger-Zeile hat
 * sie nicht, und sie bleiben NULL. Geschaetzte Geraetedaten waeren
 * erfundene Daten ueber eine Person.
 */
export function provenienzFuerZeile(
  metadata: Record<string, unknown> | null | undefined,
  deviceInfo: Record<string, unknown> | null | undefined,
  eventType: string,
): Provenienz | null {
  const ausMetadaten = provenienzAus(metadata)
  if (ausMetadaten) return ausMetadaten

  if (deviceInfo?.quelle === AUTH_TRIGGER_QUELLE) {
    const moeglich = ECHT_MOEGLICH[eventType]
    if (moeglich) return moeglich
    // Andere Trigger-Ereignisse (Profil-, Rollenaenderung) sind echt
    // passiert, aber sie sind kein Anmeldeverhalten — dieselbe
    // Unterscheidung wie in leiteProvenienzAb().
    return 'SYNTHETIC_EVENT'
  }

  return null
}

/**
 * Ist diese Zeile ein Test? Fail-closed in die ANDERE Richtung als
 * `istEchteNutzeraktivitaet`: nur die beiden ausdruecklichen Testwerte
 * ergeben true.
 *
 * Ein unbelegtes `null` ist also weder „echte Nutzeraktivitaet" noch
 * „Test" — und das ist richtig so. Ueber eine Bestandszeile ohne
 * Kennzeichnung ist schlicht nichts bekannt, und beide Behauptungen
 * waeren erfunden.
 */
export function istTest(p: Provenienz | null): boolean {
  return p === 'TEST_ALERT' || p === 'ADMIN_TEST'
}

/** Die groebere Einordnung. `null` ⇒ keine Aussage moeglich. */
export function quelleFuer(p: Provenienz | null): Quelle | null {
  if (p === null) return null
  if (istTest(p)) return 'synthetic_test'
  if (istEchteNutzeraktivitaet(p)) return 'real_user'
  return 'system'
}

/**
 * Die drei Kennzeichen als Metadaten-Block — EIN Aufruf, damit sie nie
 * einzeln und damit nie widerspruechlich gesetzt werden.
 */
export function kennzeichen(p: Provenienz): Record<string, unknown> {
  return {
    [PROVENIENZ_SCHLUESSEL]: p,
    [IST_TEST_SCHLUESSEL]: istTest(p),
    [QUELLE_SCHLUESSEL]: quelleFuer(p),
  }
}

/**
 * Ereignistypen, die ausdruecklich einen Test bezeichnen. Sie sind
 * IMMER nicht-echt, unabhaengig davon, wie sie geschrieben wurden — der
 * Ereignistyp selbst ist hier schon die Aussage.
 */
export const TEST_EREIGNISSE: readonly string[] = ['test_alert', 'admin_test']

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
/**
 * PostgREST-Ausdruck fuer den Herkunftsfilter.
 *
 * Beide Zweige muessen die Menge VOLLSTAENDIG teilen — jede Zeile faellt
 * in genau einen. Der Lauf gegen die Produktion ist der Massstab:
 * echt + nicht_echt muss die Gesamtzahl ergeben.
 *
 * ── WARUM HIER NICHTS NEGIERT WIRD ─────────────────────────────────────
 * Der erste Anlauf schrieb `not.and(quelle.eq.db_trigger, …)`. Gemessen
 * fielen daraufhin VIER Zeilen durch beide Zweige: die
 * login_success-Zeilen der Anmelderoute von vor der Kennzeichnung. Sie
 * haben keine Provenienz UND kein `device_info.quelle`. In SQL ergibt
 * `NULL = 'db_trigger'` weder wahr noch falsch, sondern NULL — und
 * `NOT NULL` ist wieder NULL, also nicht wahr. Die Zeile faellt aus dem
 * Filter, ohne dass irgendwo ein Fehler entsteht.
 *
 * Deshalb wird `nicht_echt` POSITIV aufgezaehlt statt negiert. Jeder der
 * vier Faelle nennt seine Bedingung selbst, und `is.null` trifft auch
 * eine Zeile, deren device_info gar kein `quelle` enthaelt.
 */
/**
 * Die drei Provenienzen, die ein AUSDRUECKLICHES Testereignis
 * kennzeichnen — genau die, fuer die `istTest()` true liefert.
 *
 * Bewusst NICHT dasselbe wie „nicht echt": darin steckt auch
 * SYNTHETIC_EVENT (maschinell, aber kein Test) und alles Unbelegte. Wer
 * fragt „was war ein Test?", meint diese Liste — und bekaeme sonst
 * Zeilen zu sehen, ueber die schlicht nichts bekannt ist.
 */
export const TEST_PROVENIENZEN: readonly Provenienz[] = ['TEST_ALERT', 'ADMIN_TEST']

export function herkunftFilterAusdruck(art: 'echt' | 'nicht_echt' | 'test'): string {
  const echt = ECHTE_PROVENIENZEN.join(',')
  const nichtEcht = PROVENIENZEN.filter(p => !ECHTE_PROVENIENZEN.includes(p)).join(',')
  const anmeldungen = ECHT_MOEGLICHE_EREIGNISSE.join(',')
  const quelle = 'device_info->>quelle'
  const prov = 'metadata->>provenienz'

  // Nur ausdrueckliche Testereignisse. Anders als die beiden anderen
  // Zweige teilt dieser die Menge NICHT — er ist eine echte Teilmenge
  // von 'nicht_echt'. Das ist Absicht und steht so auch in der
  // Oberflaeche: „Test" ist eine Auswahl, kein Gegenstueck zu „Real".
  if (art === 'test') {
    return `${prov}.in.(${TEST_PROVENIENZEN.join(',')})`
  }

  if (art === 'echt') {
    return `${prov}.in.(${echt}),`
      + `and(${quelle}.eq.${AUTH_TRIGGER_QUELLE},event_type.in.(${anmeldungen}))`
  }

  return [
    // 1) ausdruecklich nicht echt
    `${prov}.in.(${nichtEcht})`,
    // 2) keine Provenienz und kein Quellvermerk
    `and(${prov}.is.null,${quelle}.is.null)`,
    // 3) keine Provenienz, Quellvermerk aber nicht der Auth-Trigger
    `and(${prov}.is.null,${quelle}.neq.${AUTH_TRIGGER_QUELLE})`,
    // 4) Trigger-Zeile, die keine Anmeldung ist
    `and(${prov}.is.null,${quelle}.eq.${AUTH_TRIGGER_QUELLE},`
      + `event_type.not.in.(${anmeldungen}))`,
  ].join(',')
}

export function betreffZusatz(p: Provenienz | null): string {
  if (p === 'TEST_ALERT') return ' [TESTALARM]'
  if (p === 'ADMIN_TEST') return ' [VERWALTUNGSTEST]'
  if (p === 'SYNTHETIC_EVENT') return ' [SYNTHETISCH]'
  if (p === null) return ' [HERKUNFT UNBELEGT]'
  return ''
}
