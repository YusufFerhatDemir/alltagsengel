/**
 * KIM-Adapter — die Schnittstelle, gegen die ein künftiger Provider gebaut wird.
 *
 * WAS DIESES MODUL IST
 * Eine Schnittstellendefinition mit drei Operationen (senden, empfangen,
 * Status) und einer Registrierung. Kein Provider ist angebunden, und dieses
 * Modul bindet auch keinen an. Es legt fest, WIE ein Provider angebunden wird,
 * damit der Anschluss später eine Datei ist und keine Umbauaktion.
 *
 * WAS ES NICHT IST
 * Kein KIM-Client. Kein Konnektor-Protokoll. Keine Envelope-Struktur, kein
 * Kartenzugriff, kein Zustellquittungsformat. All das steht in der gematik-
 * Spezifikation (Technische Anlage 5), die nicht vorliegt. Aus dem Gedächtnis
 * rekonstruierte Protokolldetails wären hier am gefährlichsten: sie würden
 * gegen ein echtes Gesundheitsnetz sprechen.
 *
 * DER STANDARD-ADAPTER IST FAIL-CLOSED
 * `NULL_ADAPTER` wirft bei jeder Operation. Ist kein Provider registriert, ist
 * das der Adapter, den man bekommt — es gibt keinen Zustand, in dem ein
 * unbeabsichtigter Versand möglich ist.
 *
 * ZWEI UNABHÄNGIGE SPERREN
 *   1. KIM_AKTIV (Env-Gate)     — behauptet, dass Zulassung, Provider und
 *                                 Konnektor vorliegen.
 *   2. Registrierter Adapter     — behauptet, dass jemand den Provider
 *                                 tatsächlich implementiert hat.
 * Beide müssen zutreffen. Ein offenes Gate ohne Adapter sendet nichts, ein
 * registrierter Adapter bei geschlossenem Gate ebenfalls nicht.
 *
 * SO WIRD SPÄTER ANGEBUNDEN
 *   import { registriereKimAdapter } from '@/lib/kim/adapter'
 *   registriereKimAdapter({
 *     name: 'provider-xy',
 *     senden:    async (a) => { ... },
 *     empfangen: async (a) => { ... },
 *     status:    async (a) => { ... },
 *   })
 * Aufgerufen einmalig beim Serverstart (z. B. in instrumentation.ts).
 */

import { ExternGesperrtError, istFreigegeben, pruefeFreigabe } from '../abrechnung/externe-freigaben'
import { kimVersandImplementiert } from './versand'
import { logger } from '@/lib/logger'
const log = logger.child('kim/adapter')

// ── Datentypen der Schnittstelle ────────────────────────────────

export interface KimSendeAuftrag {
  /** Zeile aus kim_nachrichten. */
  nachrichtId: string
  organizationId: string
  /** Absenderpostfach aus kim_konfiguration. */
  absenderPostfach: string
  empfaengerAdresse: string
  betreff: string
  /**
   * Anhänge als Rohbytes. Was daraus im Envelope wird, entscheidet der
   * Adapter — dieses Modul kennt kein KIM-Nachrichtenformat.
   */
  anhaenge: Array<{ dateiname: string; inhalt: Buffer; mimeTyp?: string }>
  /** Fachlicher Ursprung, z. B. { typ: 'sgb_v_lauf', id: '…' }. */
  bezug?: { typ: string; id: string } | null
}

export interface KimSendeErgebnis {
  /** Kennung des Providers für diese Sendung — Grundlage jeder Nachfrage. */
  providerNachrichtId: string
  /** Zeitpunkt der Annahme durch den Provider (ISO). */
  angenommenAm: string
  /** Rohantwort des Providers, für die Fehlersuche. Ohne Zugangsdaten. */
  protokoll?: string
}

export interface KimEmpfangsAuftrag {
  organizationId: string
  postfach: string
  /** Nur Nachrichten ab diesem Zeitpunkt (ISO). */
  seit?: string
  maxAnzahl?: number
}

export interface KimEingang {
  providerNachrichtId: string
  absenderAdresse: string
  betreff: string
  empfangenAm: string
  anhaenge: Array<{ dateiname: string; inhalt: Buffer; mimeTyp?: string }>
}

export interface KimStatusAnfrage {
  organizationId: string
  providerNachrichtId: string
}

export type KimZustellStatus =
  | 'angenommen'    // Provider hat die Nachricht entgegengenommen
  | 'unterwegs'
  | 'zugestellt'    // Zustellbestätigung liegt vor
  | 'fehlgeschlagen'
  | 'unbekannt'

export interface KimStatusErgebnis {
  providerNachrichtId: string
  status: KimZustellStatus
  zeitpunkt: string | null
  fehlerCode?: string | null
  fehlerText?: string | null
}

/**
 * Was ein Provider-Adapter können muss.
 *
 * Bewusst schmal: drei Operationen, keine Konfigurationsmethoden. Alles, was
 * ein Adapter über Postfach, Karte und Zugang wissen muss, liest er aus den
 * bestehenden Tabellen (kim_konfiguration, kim_karten) — die Schnittstelle
 * bleibt dadurch unabhängig davon, wie ein Provider sich authentifiziert.
 */
export interface KimAdapter {
  /** Kurzname des Providers, erscheint in Protokoll und Fehlermeldungen. */
  name: string
  senden(auftrag: KimSendeAuftrag): Promise<KimSendeErgebnis>
  empfangen(auftrag: KimEmpfangsAuftrag): Promise<KimEingang[]>
  status(anfrage: KimStatusAnfrage): Promise<KimStatusErgebnis>
}

// ── Fail-closed-Standardadapter ─────────────────────────────────

export class KimAdapterFehltError extends Error {
  readonly code = 'KIM_ADAPTER_FEHLT'

  constructor(operation: string) {
    super(
      `KIM-Adapter fehlt: "${operation}" kann nicht ausgeführt werden, weil kein `
      + 'Provider registriert ist. Es wurde keine Verbindung zur Telematikinfrastruktur '
      + 'aufgebaut und nichts versendet. Anbindung: registriereKimAdapter() in '
      + 'lib/kim/adapter.ts — setzt gematik-Zulassung, KIM-Provider-Vertrag, '
      + 'Konnektor-Anbindung und Technische Anlage 5 voraus.',
    )
    this.name = 'KimAdapterFehltError'
  }
}

/**
 * Der Adapter, den man bekommt, wenn keiner registriert ist.
 *
 * Wirft bedingungslos — auch bei `status()`, das auf den ersten Blick harmlos
 * wirkt: eine erfundene Statusantwort ("zugestellt") wäre die gefährlichste
 * Auskunft dieses Moduls.
 */
export const NULL_ADAPTER: KimAdapter = {
  name: 'kein-provider',
  async senden() { throw new KimAdapterFehltError('senden') },
  async empfangen() { throw new KimAdapterFehltError('empfangen') },
  async status() { throw new KimAdapterFehltError('status') },
}

// ── Registrierung ───────────────────────────────────────────────

let registrierterAdapter: KimAdapter | null = null

/**
 * Registriert den Provider-Adapter. Einmalig beim Serverstart aufrufen.
 *
 * Ein zweiter Aufruf ersetzt den vorherigen Adapter und ist erlaubt (Tests,
 * Provider-Wechsel), wird aber protokolliert — ein unbemerkter Wechsel des
 * Versandwegs wäre schwer zu erklären.
 */
export function registriereKimAdapter(adapter: KimAdapter): void {
  if (!adapter?.name || typeof adapter.senden !== 'function'
      || typeof adapter.empfangen !== 'function' || typeof adapter.status !== 'function') {
    throw new Error('Ungültiger KIM-Adapter: name, senden, empfangen und status sind Pflicht')
  }
  if (registrierterAdapter && registrierterAdapter.name !== adapter.name) {
    log.warn(`Adapter gewechselt: "${registrierterAdapter.name}" → "${adapter.name}"`)
  }
  registrierterAdapter = adapter
}

/** Nur für Tests: Registrierung zurücksetzen. */
export function setzeKimAdapterZurueck(): void {
  registrierterAdapter = null
}

/** Der aktuell registrierte Adapter — oder der fail-closed Standardadapter. */
export function holeKimAdapter(): KimAdapter {
  return registrierterAdapter ?? NULL_ADAPTER
}

// ── Gate + Adapter in einem Schritt ─────────────────────────────

export interface KimKanalStatus {
  /** Env-Gate KIM_AKTIV. */
  freigegeben: boolean
  /** Ist ein echter Provider registriert? */
  adapterRegistriert: boolean
  adapterName: string
  /** Ist der Versandpfad in lib/kim/versand.ts implementiert? */
  versandImplementiert: boolean
  /** true nur, wenn alle drei zutreffen. */
  versandMoeglich: boolean
  blocker: string[]
}

/** Für Oberfläche und Readiness: warum ist der Kanal zu? */
export function kimKanalStatus(): KimKanalStatus {
  const freigegeben = istFreigegeben('kim_aktiv')
  const adapter = holeKimAdapter()
  const adapterRegistriert = adapter !== NULL_ADAPTER
  const versandImplementiert = kimVersandImplementiert()

  const blocker: string[] = []
  if (!versandImplementiert) {
    blocker.push('KIM-Client-Protokoll (Technische Anlage 5) liegt nicht vor — lib/kim/versand.ts ist gesperrt')
  }
  if (!adapterRegistriert) {
    blocker.push('Kein Provider-Adapter registriert — registriereKimAdapter() in lib/kim/adapter.ts')
  }
  if (!freigegeben) {
    blocker.push('Feature-Gate KIM_AKTIV steht auf false')
  }

  return {
    freigegeben,
    adapterRegistriert,
    adapterName: adapter.name,
    versandImplementiert,
    versandMoeglich: freigegeben && adapterRegistriert && versandImplementiert,
    blocker,
  }
}

/**
 * Liefert den Adapter, wenn ALLE Sperren offen sind.
 *
 * Der einzige Weg, an einen sendefähigen Adapter zu kommen. Wer
 * `holeKimAdapter()` direkt nimmt, umgeht das Gate — und bekommt bei fehlendem
 * Provider trotzdem den NULL_ADAPTER, der wirft.
 *
 * @throws ExternGesperrtError | KimAdapterFehltError
 */
export function holeAktivenKimAdapter(kontext?: string): KimAdapter {
  pruefeFreigabe('kim_aktiv', kontext)

  const adapter = holeKimAdapter()
  if (adapter === NULL_ADAPTER) {
    throw new KimAdapterFehltError(kontext ?? 'Versand')
  }
  if (!kimVersandImplementiert()) {
    throw new KimAdapterFehltError(
      `${kontext ?? 'Versand'} — Provider "${adapter.name}" ist registriert, `
      + 'aber der KIM-Versandpfad ist weiterhin gesperrt (lib/kim/versand.ts)',
    )
  }
  return adapter
}

/**
 * Führt eine Adapter-Operation aus und übersetzt jede Sperre in ein Ergebnis
 * statt in eine Ausnahme.
 *
 * Für API-Routen gedacht: eine geschlossene Sperre ist der erwartete Zustand
 * und soll als erklärter 409 herauskommen, nicht als 500.
 */
export async function versucheKimOperation<T>(
  operation: string,
  arbeit: (adapter: KimAdapter) => Promise<T>,
): Promise<
  | { ok: true; ergebnis: T; adapterName: string }
  | { ok: false; grund: string; code: 'EXTERN_GESPERRT' | 'KIM_ADAPTER_FEHLT' | 'FEHLER' }
> {
  let adapter: KimAdapter
  try {
    adapter = holeAktivenKimAdapter(operation)
  } catch (err) {
    if (err instanceof ExternGesperrtError) {
      return { ok: false, grund: err.message, code: 'EXTERN_GESPERRT' }
    }
    if (err instanceof KimAdapterFehltError) {
      return { ok: false, grund: err.message, code: 'KIM_ADAPTER_FEHLT' }
    }
    throw err
  }

  try {
    return { ok: true, ergebnis: await arbeit(adapter), adapterName: adapter.name }
  } catch (err) {
    return { ok: false, grund: (err as Error).message, code: 'FEHLER' }
  }
}
