// ═══════════════════════════════════════════════════════════════════
// Abrechnung — der Unterschriftsbeleg als eigene Frage
// ═══════════════════════════════════════════════════════════════════
//
// BEFUND (Track 12, B2): Die Unterschriftspflicht wurde bisher
// ausschliesslich auf der SCHREIBENDEN Seite durchgesetzt.
// `assertKlientenUnterschrift` (lib/leistungsnachweis/nachweis-regeln.ts)
// verhindert, dass /api/leistungsnachweis/crud den proof_status auf
// 'UNTERSCHRIEBEN' setzt, ohne dass eine Unterschrift mitkommt. Das ist
// richtig — und es deckt genau einen Weg ab.
//
// Live liegt daneben ein zweiter Weg, der diese Route nicht benutzt:
//
//   * `authenticated` hat live UPDATE auf `public.service_records`
//     (has_table_privilege = true, keine Spalteneinschraenkung), und
//   * die Policy `sr_engel_own` ist FOR ALL, PERMISSIVE, mit
//     USING/CHECK = `caregiver_id IN (SELECT eigene_caregiver_ids()) OR is_admin()`.
//
// Permissive Policies werden ODER-verknuepft. Die daneben liegende, eng
// gefasste Policy `service_records_caregiver_update`
// (USING `… AND status = ANY (ARRAY['draft','incomplete'])`) hat deshalb
// keine einschraenkende Wirkung mehr — `sr_engel_own` laesst denselben
// Schreibvorgang in JEDEM Status durch.
//
// Eine Pflegekraft kann damit per PostgREST direkt auf ihrer eigenen Zeile
//
//     PATCH /rest/v1/service_records?id=eq.<eigene Zeile>
//     { "proof_status": "UNTERSCHRIEBEN" }
//
// setzen. Was dann passiert:
//
//   1. `sync_service_record_status` (BEFORE) hebt `status` auf 'signed' —
//      der Nachweis gilt als abrechenbar.
//   2. `compute_signature_hash` (BEFORE) laeuft NICHT: die Funktion
//      verlangt `proof_status = 'UNTERSCHRIEBEN' AND client_signed_at IS NOT NULL`.
//      Ohne client_signed_at bleibt `signature_hash` NULL und `is_locked` FALSE.
//   3. `create_invoice_draft_atomic` zaehlt einen Nachweis nur dann als
//      unsigniert, wenn
//
//          proof_status IS DISTINCT FROM 'UNTERSCHRIEBEN' AND signature_hash IS NULL
//
//      — also eine ODER-Annahme: proof_status ALLEIN genuegt. Der Nachweis
//      passiert die MISSING_SIGNATURE-Sperre.
//
// Ergebnis: ein Nachweis, den nie jemand unterschrieben hat, ist
// abrechenbar. Und weil `is_locked` FALSE geblieben ist, bleibt er
// anschliessend sogar veraenderbar.
//
// Die Kette schliesst sich ueber POST /api/billing/auto-invoice: dessen
// Auth laesst ausdruecklich auch eine Pflegekraft mit Native-Bearer-Token
// zu und schreibt danach mit dem Dienstschluessel. Ein einzelnes
// Pflegekraft-Konto kann so vom Nachweis bis zur fertigen Rechnung
// durchlaufen, ohne dass ein Kunde je unterschrieben hat.
//
// ── Was diese Datei tut ─────────────────────────────────────────────────
// Sie stellt die Frage auf der LESENDEN Seite noch einmal, und strenger:
// nicht "steht da UNTERSCHRIEBEN", sondern "gibt es einen Beleg". Der
// Statuswert ist eine Behauptung ueber die Unterschrift; Beleg sind der
// Signatur-Hash mit Zeitstempel, das hinterlegte Unterschriftsbild oder
// eine Zeile in `service_signatures`.
//
// ── Abgrenzung zu `hatUnterschrift` ─────────────────────────────────────
// `lib/leistungsnachweis/status-sync.ts::hatUnterschrift` bleibt bewusst
// unveraendert und bleibt milder: sie beantwortet eine BERICHTS-Frage
// ("muss hier noch jemand an eine Unterschrift erinnert werden?"), und dort
// ist ein gesetzter proof_status die richtige Antwort — wer den Status
// gesetzt hat, will keine Erinnerung mehr. Hier geht es um Geld. Zwei
// Fragen, zwei Antworten; sie absichtlich zu vermischen waere der Fehler.
// ═══════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { UserFacingError } from '@/lib/api/user-facing-error'

export interface BelegFelder {
  id?: string | null
  date?: string | null
  proof_status?: string | null
  /** Vom DB-Trigger `compute_signature_hash` gesetzt — nur mit client_signed_at. */
  signature_hash?: string | null
  /** Zeitpunkt der Unterschrift; ohne ihn bildet der Trigger keinen Hash. */
  client_signed_at?: string | null
  /** Unterschriftsbild/-text direkt am Nachweis. */
  client_signature?: string | null
  /**
   * Anzahl Zeilen in `service_signatures` mit signer_role='client' —
   * der Weg der Native-App, die das Bild getrennt ablegt.
   */
  digitale_signaturen?: number | null
}

function nichtLeer(wert: unknown): boolean {
  if (wert === null || wert === undefined) return false
  const s = String(wert).trim()
  // `client_signature` ist live `text`; ein serialisiertes `false` und ein
  // leerer String sind keine Unterschriften.
  return s !== '' && s.toLowerCase() !== 'false' && s.toLowerCase() !== 'null'
}

/**
 * Liegt fuer diesen Nachweis ein BELEG der Unterschrift vor?
 *
 * `proof_status` allein zaehlt bewusst NICHT — genau diese Gleichsetzung
 * ist der Befund. Fail-closed: fehlende Felder heissen "kein Beleg".
 */
export function unterschriftBelegt(rec: BelegFelder | null | undefined): boolean {
  if (!rec) return false

  // 1. Der vom Trigger gebildete Hash — aber nur zusammen mit dem
  //    Zeitstempel, aus dem er gebildet wurde. Ein Hash ohne
  //    client_signed_at kann aus diesem Trigger nicht stammen.
  if (nichtLeer(rec.signature_hash) && nichtLeer(rec.client_signed_at)) return true

  // 2. Das hinterlegte Unterschriftsbild bzw. der Unterschriftstext.
  if (nichtLeer(rec.client_signature)) return true

  // 3. Die getrennt abgelegte digitale Unterschrift der Native-App.
  if ((rec.digitale_signaturen ?? 0) > 0) return true

  return false
}

/** Alle Nachweise ohne Beleg — die Liste, die eine Meldung braucht. */
export function ohneBeleg<T extends BelegFelder>(nachweise: readonly T[]): T[] {
  return nachweise.filter(rec => !unterschriftBelegt(rec))
}

/**
 * Ein Nachweis, der als unterschrieben GILT, ohne dass ein Beleg vorliegt.
 *
 * Das ist der eigentliche Angriffsbefund und nicht dasselbe wie
 * `!unterschriftBelegt`: ein Nachweis im Entwurf ist ebenfalls unbelegt,
 * aber unauffaellig — er ist eben noch nicht fertig. Auffaellig ist die
 * Kombination "gilt als unterschrieben" UND "kein Beleg".
 */
export function belegLuecke(rec: BelegFelder | null | undefined): boolean {
  if (!rec) return false
  const p = String(rec.proof_status ?? '').trim()
  if (p !== 'UNTERSCHRIEBEN' && p !== 'ABGERECHNET') return false
  return !unterschriftBelegt(rec)
}

function bezeichne(rec: BelegFelder): string {
  const teile = [rec.id ?? 'ohne ID']
  if (rec.date) teile.push(`vom ${rec.date}`)
  return teile.join(' ')
}

/**
 * Wirft UserFacingError(422), wenn ein Nachweis ohne Unterschriftsbeleg in
 * die Abrechnung laufen wuerde.
 *
 * Aufzurufen VOR der Rechnungserstellung.
 *
 * NACHTRAG 31.08.2026: Migration 20261017000000 IST angewendet — der
 * Trigger `trg_a_unterschrift_beleg` weist einen Wechsel auf
 * 'UNTERSCHRIEBEN'/'ABGERECHNET' ohne Beleg heute in der Datenbank ab,
 * mit dem Dienstschluessel und an jeder Route vorbei (gemessen:
 * `npm run verify:unterschrift`, Station U4). Diese Pruefung hier ist
 * damit nicht mehr die einzige, sondern die erste von zweien — sie
 * antwortet frueher und mit einer verstaendlichen Meldung, die Datenbank
 * antwortet unumgehbar.
 */
export function assertNachweiseBelegt(nachweise: readonly BelegFelder[]): void {
  const luecken = nachweise.filter(belegLuecke)
  if (luecken.length === 0) return

  const namen = luecken.slice(0, 20).map(bezeichne).join(', ')
  const rest = luecken.length > 20 ? ` (und ${luecken.length - 20} weitere)` : ''

  throw new UserFacingError(
    `${luecken.length} Leistungsnachweis(e) gelten als unterschrieben, tragen aber keinen `
    + 'Unterschriftsbeleg (weder Signatur-Hash mit Zeitstempel noch Unterschriftsbild noch '
    + 'digitale Unterschrift). Ohne Beleg wird keine Rechnung erstellt — der Nachweis wäre '
    + 'gegenüber Kunde und Pflegekasse nicht belegbar. '
    + `Betroffen: ${namen}${rest}.`,
    422,
  )
}

// ---------------------------------------------------------------------------
// Datenbank-Seite
// ---------------------------------------------------------------------------

/**
 * Spalten, ohne die sich der Beleg nicht beurteilen laesst.
 *
 * `proof_status` gehoert dazu, weil erst die Kombination aus Anspruch und
 * fehlendem Beleg die Luecke ausmacht — ein Entwurf ohne Unterschrift ist
 * kein Befund.
 */
export const BELEG_SPALTEN =
  'id, date, proof_status, signature_hash, client_signed_at, client_signature'

/**
 * Laedt genau die Nachweise, die der Rechnungslauf fuer diesen Zeitraum
 * einsammeln wuerde, und wirft, wenn einer davon als unterschrieben gilt,
 * ohne es belegen zu koennen.
 *
 * Die Auswahl bildet die WHERE-Klausel von `create_invoice_draft_atomic`
 * nach: gleicher Zeitraum, gleicher budget_type, status IN ('signed',
 * 'complete'), weder proof_status noch billing_status auf 'STORNIERT'.
 * Weicht sie ab, prueft dieser Guard eine andere Menge als die, die
 * abgerechnet wird — dann ist er wertlos, auch wenn er gruen meldet.
 *
 * Fail-closed: ein Lesefehler laesst die Rechnung NICHT entstehen. Der
 * Guard sitzt vor der RPC, es ist also noch nichts angelegt, was ein
 * Abbruch zuruecklassen koennte.
 */
export async function assertBelegteNachweise(
  supabase: SupabaseClient,
  params: {
    clientId: string
    organizationId: string
    periodMonth: string
    budgetType: string
  },
): Promise<void> {
  const { clientId, organizationId, periodMonth, budgetType } = params

  const [jahr, monat] = periodMonth.split('-').map(Number)
  const periodStart = `${periodMonth}-01`
  const letzterTag = new Date(jahr, monat, 0).getDate()
  const periodEnd = `${periodMonth}-${String(letzterTag).padStart(2, '0')}`

  const { data, error } = await supabase
    .from('service_records')
    .select(BELEG_SPALTEN)
    .eq('client_id', clientId)
    .eq('organization_id', organizationId)
    .eq('budget_type', budgetType)
    .in('status', ['signed', 'complete'])
    .gte('date', periodStart)
    .lte('date', periodEnd)

  if (error) {
    throw new UserFacingError(
      'Die Leistungsnachweise dieses Zeitraums konnten nicht gelesen werden; ohne sie '
      + 'lässt sich der Unterschriftsbeleg nicht prüfen. Es wurde keine Rechnung erstellt.',
      503,
    )
  }

  assertNachweiseBelegt((data ?? []) as BelegFelder[])
}
