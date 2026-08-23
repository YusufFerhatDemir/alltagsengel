// ═══════════════════════════════════════════════════════════════════════
// Register der wiederherstellbaren Vorgaenge
// ═══════════════════════════════════════════════════════════════════════
//
// WARUM ES DIESES REGISTER GIBT
// notification_delivery_log speichert keinen Nachrichteninhalt. Eine
// gescheiterte Zustellung kann deshalb nicht "nochmal abgeschickt"
// werden — sie muss aus den fachlichen Daten NEU GEBAUT werden. Wer das
// kann, weiss nur das jeweilige Fachmodul.
//
// Das Register ist die Verbindung zwischen beidem: die Protokollzeile
// traegt `vorgang_art` (ein Bezeichner-Slug) und `vorgang_ref` (die
// fachliche ID); hier steht, welche Funktion daraus wieder eine
// Nachricht macht.
//
// EIN VORGANG, EIN KANAL
// Ein Wiederhersteller versendet GENAU EINEN Kanal. Der Grund: nach
// einem Buchungsereignis gehen In-App, E-Mail und Push getrennt raus.
// Scheitert nur die E-Mail, darf die Wiederholung nicht die In-App-
// Nachricht ein zweites Mal ins Postfach legen. Deshalb wird je (Art,
// Kanal) registriert und nicht je Art.
//
// KEINE EIGENE PROTOKOLLIERUNG IM WIEDERHERSTELLER
// Die Protokollzeile schreibt `sendeIdempotent()` drumherum. Ein
// Wiederhersteller, der seinem Versandaufruf zusaetzlich einen
// ZustellKontext mitgibt, wuerde pro Versuch zwei Zeilen erzeugen und
// damit die Versuchszaehlung verdoppeln.
// ═══════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'
import type { ZustellKanal } from '@/lib/notifications/delivery-log'
import type { SendeErgebnis } from '@/lib/notifications/retry'

const log = logger.child('zustellung-wiederherstellung')

export interface WiederherstellungKontext {
  /** service_role-Client. Der Lauf hat keine Nutzersitzung. */
  admin: SupabaseClient
  /** Mandantengrenze — JEDE Abfrage im Wiederhersteller muss darauf filtern. */
  organizationId: string
  /** Fachlicher Datensatz, z. B. bookings.id. */
  vorgangRef: string
  /** profiles.id des Empfaengers, sofern protokolliert. */
  empfaengerId: string | null
  /** Adresse/Rufnummer/User-ID genau so, wie sie protokolliert wurde. */
  recipient: string
  channel: ZustellKanal
  correlationId: string
}

export type Wiederhersteller = (kontext: WiederherstellungKontext) => Promise<SendeErgebnis>

interface Eintrag {
  art: string
  kanaele: ReadonlySet<ZustellKanal>
  hersteller: Wiederhersteller
}

const REGISTER = new Map<string, Eintrag>()

const SLUG_RE = /^[a-z][a-z0-9-]{2,39}$/

/**
 * Traegt einen Vorgang ein. Wird beim Laden von
 * lib/notifications/vorgaenge/index.ts ausgefuehrt.
 *
 * Doppelte Registrierung derselben Art ueberschreibt bewusst NICHT,
 * sondern warnt: zwei Module, die denselben Slug beanspruchen, sind ein
 * Fehler und keine Konfiguration.
 */
export function registriereVorgang(
  art: string,
  kanaele: readonly ZustellKanal[],
  hersteller: Wiederhersteller
): void {
  if (!SLUG_RE.test(art)) {
    throw new Error(
      `Vorgangsart "${art}" ist kein gueltiger Bezeichner — erlaubt ist ^[a-z][a-z0-9-]{2,39}$ ` +
        '(so steht der CHECK auch an notification_delivery_log.vorgang_art).'
    )
  }
  if (REGISTER.has(art)) {
    log.warn('Vorgangsart doppelt registriert — die erste Registrierung bleibt', { art })
    return
  }
  REGISTER.set(art, { art, kanaele: new Set(kanaele), hersteller })
}

/**
 * Liefert den Wiederhersteller fuer (Art, Kanal) oder null.
 *
 * null heisst fuer den Wiederholungslauf: dieser Vorgang ist auf diesem
 * Kanal nicht wiederherstellbar. Er landet dann im Dead Letter statt
 * ewig als "offen" mitgezaehlt zu werden.
 */
export function holeWiederhersteller(
  art: string | null | undefined,
  channel: ZustellKanal
): Wiederhersteller | null {
  if (!art) return null
  const eintrag = REGISTER.get(art)
  if (!eintrag) return null
  if (!eintrag.kanaele.has(channel)) return null
  return eintrag.hersteller
}

/** Betriebsansicht: welche Vorgangsarten kennt dieser Prozess? */
export function registrierteVorgaenge(): Array<{ art: string; kanaele: ZustellKanal[] }> {
  return Array.from(REGISTER.values()).map(e => ({
    art: e.art,
    kanaele: Array.from(e.kanaele),
  }))
}

/** Nur fuer Tests. */
export function _leereRegister(): void {
  REGISTER.clear()
}
