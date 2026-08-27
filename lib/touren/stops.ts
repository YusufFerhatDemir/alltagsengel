// ═══════════════════════════════════════════════════════════════════
// TOURENPLANUNG — Regeln am einzelnen Stop
// ═══════════════════════════════════════════════════════════════════
// Ein tour_stop ist nur die Anordnung; die abrechnungs- und
// kalenderrelevante Wahrheit steht im verknuepften `assignment`. Beide
// duerfen deshalb nie auseinanderlaufen — genau das konnten sie bisher:
//
//  · Zeiten: PATCH schrieb erst den Stop und danach die Zeiten auf das
//    assignment. Schlug dieser zweite Schreibvorgang aus einem anderen
//    Grund als DOPPELBELEGUNG fehl (Netz, RLS, Constraint), wurde der
//    Fehler verschluckt. Danach stand in der Tour 10:00–11:00 und im
//    Einsatz weiterhin 08:00–09:00 — der Kalender, der Ueberlappungs-
//    Trigger und der Leistungsnachweis hielten sich an die alte Zeit.
//
//  · Status: der DB-Trigger `tour_stop_sync_assignment` spiegelt nur die
//    VORWAERTS-Kette (UNTERWEGS/BEIM_KLIENTEN/ABGESCHLOSSEN). Fuer
//    'GEPLANT' und 'AUSGEFALLEN' liefert er NULL und laesst den
//    Einsatzstatus stehen. Ein Stop, der von AUSGEFALLEN zurueck auf
//    GEPLANT gesetzt wurde, stand danach wieder in der Tour, waehrend
//    sein Einsatz STORNIERT blieb: er belegte keine Zeit mehr, tauchte in
//    der Engel-App nicht auf und wurde nie abgerechnet.
//
// Diese Datei haelt die Regeln an EINER Stelle, damit die Route sie nicht
// nachbaut und Tests sie ohne HTTP pruefen koennen.
// ═══════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { UserFacingError } from '@/lib/api/user-facing-error'
// Dieselbe Zeitregel wie im Dienstplan: Format HH:MM(:SS), Nachteinsatz
// ueber Mitternacht erlaubt, Null-Einsatz (Beginn = Ende) nicht. Bewusst
// wiederverwendet statt nachgebaut — zwei Zeitregeln waeren genau die
// Sorte Drift, die zwischen Dienstplan und Tour niemand bemerkt.
import { assertZeitfenster, schichtZeitZuMinuten } from '@/lib/personal/dienstplan'

/** Werteset des CHECK-Constraints auf tour_stops.status. */
export const STOP_STATUS = [
  'GEPLANT', 'UNTERWEGS', 'BEIM_KLIENTEN', 'ABGESCHLOSSEN', 'AUSGEFALLEN',
] as const
export type StopStatus = (typeof STOP_STATUS)[number]

/**
 * Tour-Zustaende, in denen Stops noch angelegt oder geaendert werden
 * duerfen — Erlaubnisliste, keine Sperrliste: ein spaeter ergaenzter
 * Tourstatus ist dann erst einmal geschlossen und nicht versehentlich offen.
 */
export const TOUR_OFFEN = ['GEPLANT', 'FREIGEGEBEN', 'UNTERWEGS'] as const

export function assertTourOffen(tourStatus: string | null | undefined, was: string): void {
  if (!(TOUR_OFFEN as readonly string[]).includes(String(tourStatus ?? ''))) {
    throw new UserFacingError(
      `Die Tour ist ${tourStatus ?? 'ohne Status'} — ${was} ist nur bei offenen Touren möglich `
      + `(${TOUR_OFFEN.join(', ')}).`,
      409,
    )
  }
}

/** Werteset des CHECK-Constraints auf tours.status. */
export const TOUR_STATUS = [
  'GEPLANT', 'FREIGEGEBEN', 'UNTERWEGS', 'ABGESCHLOSSEN', 'STORNIERT',
] as const

/**
 * Zulaessige Statuswechsel einer Tour — Erlaubnisliste je Ausgangszustand.
 *
 * ABGESCHLOSSEN ist ein Endzustand: an den Stops haengen die
 * Leistungsnachweise, ein Zurueckdrehen wuerde sie in einer Tour
 * wiederfinden lassen, die noch laeuft. STORNIERT laesst sich nur nach
 * GEPLANT aufloesen — dabei muessen die mitstornierten Einsaetze
 * reaktiviert werden, sonst ist die Tour wieder da und kein einziger
 * Einsatz dahinter.
 */
const TOUR_UEBERGAENGE: Record<string, readonly string[]> = {
  GEPLANT: ['FREIGEGEBEN', 'UNTERWEGS', 'ABGESCHLOSSEN', 'STORNIERT'],
  FREIGEGEBEN: ['GEPLANT', 'UNTERWEGS', 'ABGESCHLOSSEN', 'STORNIERT'],
  UNTERWEGS: ['GEPLANT', 'FREIGEGEBEN', 'ABGESCHLOSSEN', 'STORNIERT'],
  ABGESCHLOSSEN: [],
  STORNIERT: ['GEPLANT'],
}

export function assertTourUebergang(alt: string | null | undefined, neu: string): void {
  if (!(TOUR_STATUS as readonly string[]).includes(neu)) {
    throw new UserFacingError(`Ungültiger Status. Erlaubt: ${TOUR_STATUS.join(', ')}.`)
  }
  const vorher = String(alt ?? 'GEPLANT')
  if (vorher === neu) return
  const erlaubt = TOUR_UEBERGAENGE[vorher] ?? []
  if (erlaubt.includes(neu)) return
  if (vorher === 'ABGESCHLOSSEN') {
    throw new UserFacingError(
      'Die Tour ist abgeschlossen — an ihren Stops hängen die Leistungsnachweise. '
      + 'Sie lässt sich nicht wieder öffnen.',
      409,
    )
  }
  throw new UserFacingError(
    `Statuswechsel von ${vorher} nach ${neu} ist nicht vorgesehen`
    + (erlaubt.length > 0 ? ` (erlaubt: ${erlaubt.join(', ')}).` : '.'),
    409,
  )
}

/** Rang der Vorwaerts-Kette; AUSGEFALLEN steht bewusst daneben. */
const KETTE: Record<string, number> = {
  GEPLANT: 0,
  UNTERWEGS: 1,
  BEIM_KLIENTEN: 2,
  ABGESCHLOSSEN: 3,
}

/**
 * Ist der Statuswechsel eines Stops zulaessig?
 *
 * - vorwaerts in der Kette: immer (auch mit Sprung)
 * - zurueck auf GEPLANT: erlaubt, der Einsatz wird dabei mit zurueckgesetzt
 * - alles → AUSGEFALLEN: erlaubt, solange nicht schon abgeschlossen
 * - AUSGEFALLEN → GEPLANT: erlaubt (Reaktivierung)
 * - AUSGEFALLEN → UNTERWEGS/BEIM_KLIENTEN/ABGESCHLOSSEN: abgelehnt, weil
 *   der stornierte Einsatz dann uebersprungen wuerde — erst reaktivieren
 * - ABGESCHLOSSEN → irgendetwas: abgelehnt. Am abgeschlossenen Stop haengt
 *   der Leistungsnachweis; ein Rueckschritt wuerde ihn von seinem Einsatz
 *   loesen, ohne ihn zu stornieren.
 */
export function assertStopUebergang(alt: string | null | undefined, neu: string): void {
  if (!(STOP_STATUS as readonly string[]).includes(neu)) {
    throw new UserFacingError(`Ungültiger Stop-Status "${neu}". Erlaubt: ${STOP_STATUS.join(', ')}.`)
  }
  const vorher = String(alt ?? 'GEPLANT')
  if (vorher === neu) return

  if (vorher === 'ABGESCHLOSSEN') {
    throw new UserFacingError(
      'Der Stop ist bereits abgeschlossen — an ihm hängt der Leistungsnachweis. '
      + 'Ein Zurücksetzen würde den Nachweis von seinem Einsatz lösen; bitte stattdessen '
      + 'den Leistungsnachweis stornieren.',
      409,
    )
  }

  if (vorher === 'AUSGEFALLEN' && neu !== 'GEPLANT') {
    throw new UserFacingError(
      'Der Stop ist ausgefallen und sein Einsatz storniert. Er muss zuerst wieder auf '
      + 'GEPLANT gesetzt werden — dabei wird der Einsatz reaktiviert.',
      409,
    )
  }

  if (neu === 'AUSGEFALLEN' || neu === 'GEPLANT') return
  if (KETTE[vorher] !== undefined && KETTE[neu] > KETTE[vorher]) return

  throw new UserFacingError(`Statuswechsel von ${vorher} nach ${neu} ist nicht vorgesehen.`, 409)
}

/**
 * Einsatzstatus, der zu einem Stop-Status gehoert.
 *
 * Deckungsgleich mit dem DB-Trigger `tour_stop_sync_assignment` — ergaenzt
 * um die beiden Faelle, die der Trigger auf NULL abbildet und damit
 * ungespiegelt laesst.
 */
export function assignmentStatusFuerStop(stopStatus: string): string | null {
  switch (stopStatus) {
    case 'GEPLANT': return 'GEPLANT'
    case 'UNTERWEGS': return 'UNTERWEGS'
    case 'BEIM_KLIENTEN': return 'GESTARTET'
    case 'ABGESCHLOSSEN': return 'BEENDET'
    case 'AUSGEFALLEN': return 'STORNIERT'
    default: return null
  }
}

/**
 * Zeiten eines Stops pruefen — im ZUSAMMENGEFUEHRTEN Stand (Bestand +
 * Aenderung), nicht nur die uebergebenen Felder.
 *
 * Beide Zeiten muessen zusammen gesetzt sein: `assignments.start_time` und
 * `end_time` sind NOT NULL, ein halb befuellter Stop laesst sich also gar
 * nicht auf seinen Einsatz zurueckschreiben.
 */
export function assertStopZeiten(
  ankunft: string | null | undefined,
  ende: string | null | undefined,
): void {
  const hatAnkunft = typeof ankunft === 'string' && ankunft.trim() !== ''
  const hatEnde = typeof ende === 'string' && ende.trim() !== ''
  if (!hatAnkunft && !hatEnde) return
  if (!hatAnkunft || !hatEnde) {
    throw new UserFacingError('Stop: Ankunft und Ende müssen zusammen gesetzt werden.')
  }
  assertZeitfenster(ankunft, ende, null, 'Stop')
}

/** Dauer eines Stops in Minuten (Nachteinsatz eingerechnet), null wenn unbekannt. */
export function stopDauerMinuten(
  ankunft: string | null | undefined,
  ende: string | null | undefined,
): number | null {
  const s = schichtZeitZuMinuten(ankunft)
  const e = schichtZeitZuMinuten(ende)
  if (s === null || e === null) return null
  if (e === s) return 0
  return e > s ? e - s : e - s + 1440
}

export interface ReihenfolgeBefund {
  ok: boolean
  fehler: string | null
}

/**
 * Prueft eine neue Stop-Reihenfolge gegen den Bestand.
 *
 * Bisher wurde nur `laenge === anzahl` und „jede ID kommt vor" geprueft.
 * Eine Liste mit einer DOPPELTEN ID (`[A, A]` bei den Stops A und B) kam
 * damit durch: A bekam nacheinander beide Positionen, B blieb auf seiner
 * alten — die Tour hatte danach zwei Stops auf derselben Position oder,
 * wegen der DEFERRABLE-Unique, eine Position im 1000er-Bereich, die kein
 * Mensch mehr sortiert bekommt.
 */
export function pruefeReihenfolge(neu: unknown, vorhandeneIds: string[]): ReihenfolgeBefund {
  if (!Array.isArray(neu) || neu.some(id => typeof id !== 'string')) {
    return { ok: false, fehler: 'reihenfolge muss eine Liste von Stop-IDs sein.' }
  }
  const ids = neu as string[]
  const einmalig = new Set(ids)
  if (einmalig.size !== ids.length) {
    return { ok: false, fehler: 'reihenfolge enthält eine Stop-ID doppelt.' }
  }
  const bestand = new Set(vorhandeneIds)
  const fremd = ids.filter(id => !bestand.has(id))
  if (fremd.length > 0) {
    return { ok: false, fehler: `reihenfolge enthält Stops, die nicht zu dieser Tour gehören: ${fremd.join(', ')}.` }
  }
  if (ids.length !== bestand.size) {
    return { ok: false, fehler: 'reihenfolge muss exakt alle Stop-IDs der Tour enthalten.' }
  }
  return { ok: true, fehler: null }
}

/**
 * Positionen zweiphasig neu vergeben (erst in den 1000er-Bereich, dann auf
 * die Zielposition) — die Unique-Constraint (tour_id, position) ist zwar
 * DEFERRABLE, greift in PostgREST aber pro Statement.
 *
 * NEU: jeder Schreibvorgang wird geprueft. Vorher liefen beide Schleifen
 * ohne Fehlerauswertung; brach die zweite Phase ab, blieben die Stops
 * dauerhaft auf den Ausweichpositionen 1001, 1002, … stehen — die Tour war
 * danach nicht mehr sortierbar und niemand erfuhr davon.
 */
export async function schreibeReihenfolge(
  admin: SupabaseClient,
  tourId: string,
  ids: string[],
): Promise<{ ok: true } | { ok: false; fehler: string }> {
  for (let i = 0; i < ids.length; i++) {
    const { error } = await admin
      .from('tour_stops')
      .update({ position: 1000 + i })
      .eq('id', ids[i])
      .eq('tour_id', tourId)
    if (error) {
      return { ok: false, fehler: `Reihenfolge konnte nicht gesetzt werden: ${error.message}` }
    }
  }
  for (let i = 0; i < ids.length; i++) {
    const { error } = await admin
      .from('tour_stops')
      .update({ position: i + 1 })
      .eq('id', ids[i])
      .eq('tour_id', tourId)
    if (error) {
      return {
        ok: false,
        fehler:
          `Reihenfolge konnte nicht abgeschlossen werden: ${error.message}. `
          + 'Die Stops stehen bis zur nächsten erfolgreichen Sortierung auf Ausweichpositionen.',
      }
    }
  }
  return { ok: true }
}

export interface AssignmentSyncErgebnis {
  ok: boolean
  /** true bei Terminkonflikt — die Route antwortet damit 409 statt 500. */
  doppelbelegung: boolean
  fehler: string | null
}

/**
 * Zeiten und/oder Status auf den verknuepften Einsatz schreiben.
 *
 * Wird VOR dem Schreiben am Stop aufgerufen: scheitert der Einsatz (etwa am
 * Doppelbelegungs-Trigger), bleibt der Stop unveraendert. Die frueher
 * noetige Ruecknahme der Stop-Zeiten entfaellt damit — und mit ihr der Fall,
 * dass die Ruecknahme selbst scheitert und niemand es merkt.
 */
export async function schreibeAufAssignment(
  admin: SupabaseClient,
  assignmentId: string,
  werte: { start_time?: string; end_time?: string; status?: string },
): Promise<AssignmentSyncErgebnis> {
  if (Object.keys(werte).length === 0) return { ok: true, doppelbelegung: false, fehler: null }

  const { error } = await admin
    .from('assignments')
    .update(werte)
    .eq('id', assignmentId)

  if (!error) return { ok: true, doppelbelegung: false, fehler: null }

  const doppelbelegung = error.message.includes('DOPPELBELEGUNG') || error.code === '23505'
  return {
    ok: false,
    doppelbelegung,
    fehler: doppelbelegung
      ? `Der Einsatz kollidiert mit einem anderen Termin des Mitarbeiters: ${error.message}`
      : `Der Stop wurde NICHT geändert — der zugehörige Einsatz ließ sich nicht mitschreiben: ${error.message}`,
  }
}
