// ═══════════════════════════════════════════════════════════════════
// Bezug Buchung → Einsatz
// ═══════════════════════════════════════════════════════════════════
//
// EINE Stelle beantwortet die Frage „welcher Einsatz gehoert zu dieser
// Buchung?" — und zwar in beiden Welten:
//
//   MIT `assignments.booking_id`  (Migration 20261025000000)
//     Der Bezug steht in einer Spalte, auf die kein Fachprozess schreibt.
//
//   OHNE die Spalte
//     Rueckfall auf die Notiz, die lib/bookings/einsatz-kette.ts beim
//     Anlegen hinterlaesst: „Automatisch aus Buchung <uuid> erzeugt."
//
// WARUM BEIDE WEGE
// Die Migration wird von Hand im SQL-Editor angewendet (der Dienst-
// schluessel scheitert an DDL, 42501). Zwischen dem Deploy dieses Codes
// und dem Anwenden der Migration liegt also ein Fenster, in dem die
// Spalte fehlt. Ein Code, der sie voraussetzt, wuerde in diesem Fenster
// den Storno reihenweise mit 42703 abbrechen — die Stornierung waere
// genau so lange kaputt, wie niemand im SQL-Editor war.
//
// Umgekehrt darf der Notiz-Weg nicht bleiben: `notes` ist ein Feld, das
// die Einsatzliste bearbeitet. Wer die Notiz ergaenzt, kappt den Bezug.
// Deshalb ist die Spalte die fuehrende Antwort und die Notiz nur der
// Rueckfall — nicht andersherum.
//
// ── WAS HIER NICHT PASSIERT ──────────────────────────────────────
// Kein Zwischenspeichern der Schema-Erkennung ueber Prozessgrenzen.
// Ein Wert, der „Spalte fehlt" einmal festhaelt, ueberlebt das Anwenden
// der Migration und macht sie wirkungslos, bis jemand neu deployt. Die
// Erkennung kostet im Fehlerfall eine zusaetzliche Abfrage; das ist der
// richtige Preis dafuer, dass die Migration ohne Deploy wirkt.

import { logger } from '@/lib/logger'

const log = logger.child('bookings:assignment-bezug')

/**
 * PostgREST-Codes, die „diese Spalte kennt das Schema nicht" bedeuten.
 *
 *   42703 — undefined_column (PostgreSQL)
 *   PGRST204 — PostgREST findet die Spalte nicht im Schema-Cache
 *
 * Beide heissen: die Migration steht noch nicht. Jeder ANDERE Fehler ist
 * ein echter Fehler und darf NICHT in den Rueckfall fuehren — sonst
 * verdeckt der Rueckfall eine Stoerung und liefert „kein Einsatz".
 */
const SPALTE_FEHLT_CODES = new Set(['42703', 'PGRST204'])

export function istSpalteFehltFehler(fehler: { code?: string | null; message?: string | null } | null): boolean {
  if (!fehler) return false
  if (fehler.code && SPALTE_FEHLT_CODES.has(fehler.code)) return true
  // Der Meldungstext als zweite Spur: PostgREST liefert den Code nicht in
  // jeder Fassung mit.
  const text = (fehler.message ?? '').toLowerCase()
  return text.includes('booking_id') && (text.includes('does not exist') || text.includes('schema cache'))
}

/** Notiz, die einsatz-kette.ts beim Anlegen schreibt. */
export function einsatzNotizFuerBuchung(bookingId: string): string {
  return `Automatisch aus Buchung ${bookingId} erzeugt.`
}

/** Minimale Form eines Einsatzes, wie der Storno ihn braucht. */
export interface EinsatzBezug {
  id: string
  status: string | null
}

/**
 * Ergebnis der Suche. `wegFehlt` unterscheidet „keiner da" von „nicht
 * nachsehen koennen" — der Aufrufer darf aus einem Fehler keinen
 * fehlenden Einsatz machen.
 */
export type EinsatzSuche =
  | { ok: true; einsatz: EinsatzBezug | null; ueberSpalte: boolean }
  | { ok: false; fehler: { code?: string | null; message?: string | null } }

/** Was PostgREST auf diese beiden Abfragen zurueckgibt. */
interface AbfrageErgebnis {
  data: EinsatzBezug[] | null
  error: { code?: string | null; message?: string | null } | null
}

/**
 * Die beiden Abfragen als Thunks — NICHT der Client.
 *
 * DREI ANLAEUFE, BIS DIESE FORM STAND:
 *   1. Eine Schnittstelle, die `eq()` schon auf `from()` anbot, passte auf
 *      den Doppelgaenger im Test, aber nicht auf den echten Client
 *      (TS2345): dort kann `from()` nur `select()`.
 *   2. Ein REKURSIVER Filtertyp (`eq()` liefert wieder denselben Typ) traf
 *      auf die tief verschachtelten Generics des Query-Builders — TS2589,
 *      „excessively deep".
 *   3. Auch die auf zwei Ebenen begrenzte Fassung ohne Rekursion blieb bei
 *      TS2589: schon der VERGLEICH des echten Clients mit einem
 *      nachgebauten Ketten-Typ ist das Problem, nicht dessen Tiefe.
 *
 * Deshalb wird der Client hier gar nicht mehr beschrieben. Der Aufrufer
 * baut seine beiden Abfragen selbst — dort ist er voll typisiert — und
 * reicht sie als Funktionen herein. Diese Datei entscheidet nur noch, WAS
 * aus den Ergebnissen folgt, und das ist ohnehin ihre eigentliche Aufgabe.
 *
 * `ueberNotiz` wird nur aufgerufen, wenn die Spalte fehlt; im Regelfall
 * kostet der Rueckfall also nichts.
 */
export interface EinsatzAbfragen {
  /** Ueber `assignments.booking_id` (Migration 20261025000000). */
  ueberSpalte: () => PromiseLike<AbfrageErgebnis>
  /** Rueckfall ueber die Notiz „Automatisch aus Buchung <uuid> erzeugt." */
  ueberNotiz: () => PromiseLike<AbfrageErgebnis>
}

/**
 * Sucht den Einsatz zu einer Buchung — erst ueber die Spalte, sonst ueber
 * die Notiz.
 *
 * `ueberSpalte` sagt dem Aufrufer, welcher Weg gegriffen hat. Das gehoert
 * ins Protokoll: solange dort der Notiz-Weg steht, ist die Migration
 * nicht angewendet, und ein ueberschriebenes Notizfeld kann den Bezug
 * weiterhin kappen.
 */
export async function findeEinsatzZuBuchung(abfragen: EinsatzAbfragen): Promise<EinsatzSuche> {
  const ueberSpalte = await abfragen.ueberSpalte()

  if (!ueberSpalte.error) {
    return { ok: true, einsatz: ueberSpalte.data?.[0] ?? null, ueberSpalte: true }
  }

  if (!istSpalteFehltFehler(ueberSpalte.error)) {
    // Echter Fehler — NICHT in den Rueckfall. Sonst wuerde eine Stoerung
    // als „kein Einsatz" durchgereicht, und der Storno liesse den Einsatz
    // stehen.
    return { ok: false, fehler: ueberSpalte.error }
  }

  log.warn(
    'assignments.booking_id fehlt — Rueckfall auf den Notiz-Bezug. '
    + 'Migration 20261025000000 ist noch nicht angewendet.',
  )

  const ueberNotiz = await abfragen.ueberNotiz()

  if (ueberNotiz.error) {
    return { ok: false, fehler: ueberNotiz.error }
  }
  return { ok: true, einsatz: ueberNotiz.data?.[0] ?? null, ueberSpalte: false }
}
