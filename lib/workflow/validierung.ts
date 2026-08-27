// ═══════════════════════════════════════════════════════════════
// Workflow-Engine — Eingabepruefung und Zustandsmaschine
//
// Warum eigenes Modul: die Listen-Funktionen der Engine nahmen `limit`,
// `offset` und `status` bisher ungeprueft entgegen. Die Routen reichen
// diese Werte direkt aus der Query-String durch — `status` sogar als
// blosser TypeScript-Cast (`as WfQueueStatus`), der zur Laufzeit nichts
// prueft. Ein `?limit=abc` wurde damit zu `Number("abc")` = NaN und ein
// `?status=beliebig` zu einem Filter auf einen Wert, den es nicht gibt.
//
// Die Zustandsmaschine steht hier und nicht in `warteschlange.ts`, weil
// Retry und Abbruch dieselben Endzustaende respektieren muessen und die
// Tests beide gegen dieselbe Quelle pruefen sollen.
// ═══════════════════════════════════════════════════════════════

import { UserFacingError } from '@/lib/api/user-facing-error'
import {
  WF_QUEUE_STATUS_WERTE,
  type WfQueueStatus,
} from './types'

/**
 * Obergrenze fuer Listenabfragen.
 *
 * Ohne Deckel bestimmt der Aufrufer, wie viele Zeilen die Engine aus der
 * Datenbank zieht; `?limit=1000000` auf `wf_audit_log` ist eine ganze
 * Mandantenhistorie in einer Antwort.
 */
export const MAX_LIMIT = 200

/** Voreinstellung, wenn kein `limit` mitgegeben wurde. */
export const STANDARD_LIMIT = 50

/**
 * Prueft `limit` und deckelt es auf {@link MAX_LIMIT}.
 *
 * `undefined` bleibt `undefined` — die aufrufende Funktion entscheidet
 * dann selbst, ob sie einen Standardwert setzt oder ohne Limit abfragt.
 */
export function pruefeLimit(limit: number | undefined): number | undefined {
  if (limit === undefined || limit === null) return undefined
  if (!Number.isFinite(limit)) {
    throw new UserFacingError('Der Parameter "limit" muss eine Zahl sein.')
  }
  const ganz = Math.floor(limit)
  if (ganz < 1) {
    throw new UserFacingError('Der Parameter "limit" muss mindestens 1 sein.')
  }
  return Math.min(ganz, MAX_LIMIT)
}

/** Prueft `offset` — negative Werte kehren den `range()`-Aufruf um. */
export function pruefeOffset(offset: number | undefined): number | undefined {
  if (offset === undefined || offset === null) return undefined
  if (!Number.isFinite(offset)) {
    throw new UserFacingError('Der Parameter "offset" muss eine Zahl sein.')
  }
  const ganz = Math.floor(offset)
  if (ganz < 0) {
    throw new UserFacingError('Der Parameter "offset" darf nicht negativ sein.')
  }
  return ganz
}

/**
 * Prueft einen Enum-Wert gegen die erlaubte Liste.
 *
 * Bewusst mit Feldnamen in der Meldung: ein stillschweigend ignorierter
 * Filter liefert eine plausibel aussehende, aber falsche Liste.
 */
export function pruefeEnum<T extends string>(
  wert: string | undefined | null,
  erlaubt: readonly T[],
  feld: string,
): T | undefined {
  if (wert === undefined || wert === null || wert === '') return undefined
  if (!erlaubt.includes(wert as T)) {
    throw new UserFacingError(
      `Ungueltiger Wert fuer "${feld}": "${wert}". Erlaubt sind: ${erlaubt.join(', ')}.`,
    )
  }
  return wert as T
}

/** Prueft einen Warteschlangen-Status. */
export function pruefeQueueStatus(wert: string | undefined | null): WfQueueStatus | undefined {
  return pruefeEnum(wert, WF_QUEUE_STATUS_WERTE, 'status')
}

// ── Zustandsmaschine wf_warteschlange ────────────────────────────
//
// Die Datenbank claimt Eintraege bereits per CAS (Migration
// 20260824010000, FIX 3): `UPDATE ... WHERE status='wartend'`. Dieser
// Schutz greift aber nur gegen zwei gleichzeitige *Worker*. Er greift
// NICHT, wenn ein Administrator einen bereits erledigten Eintrag von
// Hand auf `wartend` zuruecksetzt — danach ist der Zustand aus Sicht
// des Workers voellig legitim, und die Aktion laeuft ein zweites Mal.
//
// Das ist kein theoretisches Risiko: `wf_execute_queue_item` schreibt
// per `status_aendern`/`feld_aktualisieren` auf `invoices`, `payments`
// und `dunning_entries` und erzeugt Benachrichtigungen, Aufgaben und
// Eskalationen. Eine doppelte Ausfuehrung ist eine doppelte Mahnung.

/**
 * Zustaende, aus denen ein Eintrag erneut eingereiht werden darf.
 *
 * - `wartend` — noch nicht ausgefuehrt; ein Retry ueberspringt hier
 *   bewusst den Backoff (`naechster_versuch`), was der eigentliche
 *   Zweck des Knopfes ist.
 * - `fehlgeschlagen` — von Hand abgebrochen, soll doch laufen.
 * - `dead_letter` — die Automatik hat aufgegeben.
 *
 * Nicht enthalten und damit gesperrt:
 * - `erledigt` — Endzustand. Die Aktion ist ausgefuehrt; ein Retry
 *   fuehrt sie ein zweites Mal aus.
 * - `in_bearbeitung` — ein Worker haelt den Eintrag gerade. Ein
 *   Ruecksetzen auf `wartend` erlaubt einem zweiten Worker, ihn
 *   parallel zu claimen.
 */
export const WIEDERHOLBARE_QUEUE_STATUS: readonly WfQueueStatus[] = [
  'wartend',
  'fehlgeschlagen',
  'dead_letter',
]

/**
 * Zustaende, aus denen ein Eintrag abgebrochen werden darf.
 *
 * `erledigt` ist gesperrt, weil ein Abbruch die Historie faelschen
 * wuerde — die Aktion hat stattgefunden. `in_bearbeitung` ist gesperrt,
 * weil der laufende Worker den Status danach ohnehin ueberschreibt und
 * der Abbruch nur scheinbar wirkt. `fehlgeschlagen` ist gesperrt, weil
 * der Eintrag bereits abgebrochen ist.
 */
export const ABBRECHBARE_QUEUE_STATUS: readonly WfQueueStatus[] = [
  'wartend',
  'dead_letter',
]

/** Menschenlesbare Begruendung, warum ein Zustand gesperrt ist. */
export function queueSperrgrund(
  status: WfQueueStatus,
  vorgang: 'wiederholen' | 'abbrechen',
): string {
  if (status === 'erledigt') {
    return vorgang === 'wiederholen'
      ? 'Der Eintrag wurde bereits erfolgreich ausgefuehrt und kann nicht wiederholt werden — die Aktion wuerde ein zweites Mal ausgefuehrt.'
      : 'Der Eintrag wurde bereits erfolgreich ausgefuehrt und kann nicht mehr abgebrochen werden.'
  }
  if (status === 'in_bearbeitung') {
    return 'Der Eintrag wird gerade verarbeitet. Bitte den laufenden Versuch abwarten.'
  }
  if (status === 'fehlgeschlagen' && vorgang === 'abbrechen') {
    return 'Der Eintrag wurde bereits abgebrochen.'
  }
  return `Der Eintrag kann im Status "${status}" nicht ${vorgang === 'wiederholen' ? 'wiederholt' : 'abgebrochen'} werden.`
}
