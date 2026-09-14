// ═══════════════════════════════════════════════════════════════════════
// Rechnungslauf — laesst sich jede Leistungsart einem Tarif zuordnen?
// ═══════════════════════════════════════════════════════════════════════
//
// BEFUND (Block 45, 14.09.2026)
//
// `create_invoice_draft_atomic` loest den Tarif ueber
//
//     LOWER(bt.leistungsart) = public.tarif_leistungsart(sr.service_type)
//
// auf. Gibt `tarif_leistungsart()` NULL zurueck — die Leistung hat keinen
// Tarif-Schluessel —, findet die Abfrage nichts und die RPC antwortet mit
//
//     RAISE EXCEPTION 'MISSING_VALID_TARIFF: …'
//
// Das ist ein WURF im Schleifenkoerper. Die ganze Transaktion faellt
// zurueck: die Rechnung, alle bereits geschriebenen Positionen, alles.
// EIN Nachweis ueber Koerperpflege laesst damit die vollstaendige
// Monatsrechnung dieses Klienten scheitern — und die Meldung nennt nur
// den einen Nachweis, auf den die Schleife zuerst gestossen ist.
//
// Der Sammelrechnungslauf prueft das vorher (`pruefeGruppe`, Code
// LEISTUNGSART_UNBEKANNT) und ueberspringt die Gruppe sauber. Die
// Einzelrechnung (/api/billing/invoices/create) und der automatische Lauf
// (/api/billing/auto-invoice) gehen dieselbe Strecke OHNE diese Pruefung —
// sie rufen `createInvoiceDraft()` direkt. Dieselbe Form wie in Block 44:
// die Regel stand in den Aufrufern, nicht am Engpass.
//
// Live am 14.09.2026 gemessen: 2 von 30 Nachweisen tragen eine Leistungsart
// ohne Tarif-Schluessel ('Grosse Koerperpflege', 'Medikamentengabe'), beide
// bei EINEM Klienten im Monat 2026-07. Dessen dritter Nachweis waere
// abrechenbar — die Rechnung entsteht trotzdem nicht.
//
// ── WAS DIESE PRUEFUNG AUSDRUECKLICH NICHT TUT ────────────────────────
// Sie fragt NUR, ob es einen Schluessel gibt. Sie prueft NICHT, ob dazu
// ein gueltiger, verifizierter Tarif im Bestand liegt — dafuer bildet die
// RPC ein Kostentraeger-/Bundesland-Scoring, und eine Nachbildung davon
// wuerde abrechenbare Faelle faelschlich aussortieren. Ueber-Sperren ist
// hier der schlimmere Fehler, nicht Unter-Sperren; dieselbe Regel steht
// ueber `pruefeGruppe` im Sammelrechnungslauf.
//
// Die Zuordnung selbst ist keine Nachbildung: `tarifLeistungsart()` in
// lib/billing/leistungsarten.ts und `public.tarif_leistungsart()` tragen
// dieselbe Tabelle, und ein Test haelt beide gegeneinander.
// ═══════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { UserFacingError } from '@/lib/api/user-facing-error'
import { tarifLeistungsart, bekannteLeistungsarten } from '@/lib/billing/leistungsarten'

export interface ZuordnungsFelder {
  id?: string | null
  date?: string | null
  service_type?: string | null
  proof_status?: string | null
  billing_status?: string | null
}

/**
 * Spalten, ohne die sich die Zuordnung nicht beurteilen laesst.
 *
 * Die beiden Status-Spalten stehen mit drin, weil der STORNIERT-Ausschluss
 * hier in TypeScript passiert und nicht im Filter — Begruendung bei
 * `giltAlsStorniert()`.
 */
export const ZUORDNUNG_SPALTEN = 'id, date, service_type, proof_status, billing_status'

/**
 * Zaehlt dieser Nachweis fuer den Rechnungslauf als storniert?
 *
 * Bildet `COALESCE(proof_status, '') <> 'STORNIERT'` aus der RPC nach —
 * NULL ist dort ausdruecklich NICHT storniert.
 *
 * Warum in TypeScript und nicht als Filter: PostgREST braucht dafuer
 * `.or('proof_status.is.null,proof_status.neq.STORNIERT')`, weil ein
 * blosses `.neq()` jede Zeile mit NULL herausfiltern wuerde — und beide
 * Spalten sind nullbar. Die ODER-Schreibweise ist an dieser Stelle die
 * schwerer lesbare und die schwerer pruefbare: als Bedingung im Code
 * steht die NULL-Bedeutung da, wo ein Test sie greifen kann.
 */
export function giltAlsStorniert(n: ZuordnungsFelder): boolean {
  return (n.proof_status ?? '') === 'STORNIERT'
    || (n.billing_status ?? '') === 'STORNIERT'
}

/** Nachweise, deren Leistungsart keinen Tarif-Schluessel hat. */
export function ohneTarifSchluessel<T extends ZuordnungsFelder>(
  nachweise: readonly T[],
): T[] {
  return nachweise.filter(
    n => !giltAlsStorniert(n) && tarifLeistungsart(n.service_type) === null,
  )
}

function bezeichne(n: ZuordnungsFelder): string {
  const teile = [n.id ?? 'ohne ID']
  if (n.date) teile.push(`vom ${n.date}`)
  teile.push(`„${n.service_type ?? '(leer)'}"`)
  return teile.join(' ')
}

/**
 * Wirft UserFacingError(422), wenn eine Leistungsart keinem Tarif-Schluessel
 * zuzuordnen ist.
 *
 * Nennt ALLE betroffenen Nachweise und ALLE betroffenen Leistungsarten. Die
 * RPC nennt nur den ersten Treffer — wer danach den einen Nachweis korrigiert
 * und den Lauf wiederholt, laeuft in den naechsten.
 */
export function assertZuordenbareLeistungsarten(
  nachweise: readonly ZuordnungsFelder[],
): void {
  const offen = ohneTarifSchluessel(nachweise)
  if (offen.length === 0) return

  const arten = [...new Set(offen.map(n => n.service_type || '(leer)'))]
  const namen = offen.slice(0, 20).map(bezeichne).join(', ')
  const rest = offen.length > 20 ? ` (und ${offen.length - 20} weitere)` : ''

  throw new UserFacingError(
    `${offen.length} Leistungsnachweis(e) tragen eine Leistungsart ohne Tarif-Schlüssel `
    + `(${arten.map(a => `„${a}"`).join(', ')}). Diese Leistungen sind über billing_tariffs `
    + 'nicht abrechenbar; die Rechnung würde beim Erstellen vollständig scheitern und '
    + 'auch die übrigen Positionen dieses Zeitraums mitnehmen. '
    + `Betroffen: ${namen}${rest}. `
    + `Zuordenbar sind: ${bekannteLeistungsarten().join(', ')}.`,
    422,
  )
}

/**
 * Laedt genau die Nachweise, die der Rechnungslauf einsammeln wuerde, und
 * wirft, wenn einer davon keiner Tarifart zuzuordnen ist.
 *
 * Die Auswahl bildet die WHERE-Klausel von `create_invoice_draft_atomic`
 * nach — einschliesslich der beiden STORNIERT-Ausschluesse. Ohne sie
 * wuerde ein STORNIERTER Nachweis mit unbekannter Leistungsart eine
 * Rechnung sperren, die die RPC anstandslos erstellt haette: genau das
 * Ueber-Sperren, das hier der schwerere Fehler waere.
 *
 * Der STORNIERT-Ausschluss steht in `giltAlsStorniert()` und nicht im
 * Filter — dort ist die NULL-Bedeutung der RPC pruefbar abgebildet.
 *
 * Fail-closed: ein Lesefehler laesst die Rechnung NICHT entstehen. Der
 * Guard sitzt vor der RPC, es ist also noch nichts angelegt.
 */
export async function assertTarifZuordnung(
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
    .select(ZUORDNUNG_SPALTEN)
    .eq('client_id', clientId)
    .eq('organization_id', organizationId)
    .eq('budget_type', budgetType)
    .in('status', ['signed', 'complete'])
    .gte('date', periodStart)
    .lte('date', periodEnd)

  if (error) {
    throw new UserFacingError(
      'Die Leistungsnachweise dieses Zeitraums konnten nicht gelesen werden; ohne sie '
      + 'lässt sich die Tarifzuordnung nicht prüfen. Es wurde keine Rechnung erstellt.',
      503,
    )
  }

  assertZuordenbareLeistungsarten((data ?? []) as ZuordnungsFelder[])
}
