/**
 * § 302 SGB V — Leistungsnachweis-Service (Erfassung + Vollständigkeitsprüfung)
 *
 * Erfasst Einzelleistungen der häuslichen Krankenpflege (§ 37 SGB V) in
 * `service_records` (billing_type = '§37') und prüft sie auf Vollständigkeit,
 * bevor sie in einen Abrechnungslauf einfliessen (siehe ./positionen.ts und
 * ./abrechnungslauf.ts).
 *
 * KEIN Leistungserbringergruppenschlüssel/keine Abrechnungspositionsnummer
 * hier — diese Schlüssel stehen erst mit der Technischen Anlage 1 fest (s.
 * generator.ts). `sgb_v_leistungsart` ist die bereits im Projekt etablierte,
 * fachliche Kategorisierung (aus `verordnung_leistungen.leistungsart`), kein
 * amtlicher Code.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logBillingAction } from '../../billing/core/audit'
import { HKP_VERORDNUNG_TYPE, gueltigBis, pruefePosition, type HkpVerordnung } from './positionen'
import { istStorniert, nachweisRang } from '@/lib/leistungsnachweis/status-sync'

/** Bereits im Schema etablierte SGB-V-Leistungsarten (verordnung_leistungen.leistungsart-CHECK). */
export const SGB_V_LEISTUNGSARTEN = [
  'behandlungspflege', 'medikamentengabe', 'injektionen', 'wundversorgung',
  'kompressionsstruempfe', 'blutzuckermessung', 'katheter', 'stomaversorgung',
] as const
export type SgbVLeistungsart = (typeof SGB_V_LEISTUNGSARTEN)[number]

export type HkpErfassungsProblem =
  | 'keine_verordnung' | 'verordnung_nicht_genehmigt'
  | 'ausserhalb_zeitraum' | 'nicht_abgeschlossen' | 'kein_betrag' | 'unbekannte_leistungsart'
  | 'storniert'

export const HKP_ERFASSUNGS_PROBLEM_TEXT: Record<HkpErfassungsProblem, string> = {
  keine_verordnung: 'Keiner gültigen HKP-Verordnung (§ 37 SGB V) zugeordnet.',
  verordnung_nicht_genehmigt: 'Die zugeordnete Verordnung ist nicht genehmigt.',
  ausserhalb_zeitraum: 'Leistungsdatum liegt ausserhalb des Verordnungszeitraums.',
  nicht_abgeschlossen: 'Leistungsnachweis ist nicht abgeschlossen/unterschrieben (proof_status).',
  kein_betrag: 'Kein Betrag erfasst.',
  unbekannte_leistungsart: `Leistungsart ist keine der bekannten § 37-Kategorien (${SGB_V_LEISTUNGSARTEN.join(', ')}).`,
  storniert: 'Leistungsnachweis ist storniert und wird nicht abgerechnet.',
}

export interface HkpLeistungserfassung {
  clientId: string
  verordnungId: string
  caregiverId: string
  date: string
  startTime: string
  endTime: string
  durationMinutes?: number | null
  leistungsart: SgbVLeistungsart
  amount: number
  notes?: string | null
}

export interface HkpVollstaendigkeitsErgebnis {
  id: string
  ok: boolean
  probleme: HkpErfassungsProblem[]
}

/** Erfasst eine Einzelleistung. Bleibt im Entwurfsstatus, bis sie abgeschlossen wird. */
export async function erfasseHkpLeistung(
  supabase: SupabaseClient,
  organizationId: string,
  eingabe: HkpLeistungserfassung,
  actorId: string,
): Promise<string> {
  if (!SGB_V_LEISTUNGSARTEN.includes(eingabe.leistungsart)) {
    throw new Error(HKP_ERFASSUNGS_PROBLEM_TEXT.unbekannte_leistungsart)
  }
  if (!(eingabe.amount > 0)) {
    throw new Error(HKP_ERFASSUNGS_PROBLEM_TEXT.kein_betrag)
  }

  const { data: klient } = await supabase
    .from('clients')
    .select('id')
    .eq('id', eingabe.clientId)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (!klient) throw new Error('Klient nicht gefunden oder gehört zu einer anderen Organisation.')

  const { data: verordnung } = await supabase
    .from('verordnungen')
    .select('id, client_id, verordnung_type')
    .eq('id', eingabe.verordnungId)
    .eq('client_id', eingabe.clientId)
    .eq('verordnung_type', HKP_VERORDNUNG_TYPE)
    .is('deleted_at', null)
    .maybeSingle()
  if (!verordnung) {
    throw new Error(HKP_ERFASSUNGS_PROBLEM_TEXT.keine_verordnung)
  }

  // duration_minutes wird NICHT mitgeschickt: die Spalte ist auf
  // service_records live eine GENERATED-Spalte (aus start_time/end_time
  // berechnet). Ein mitgelieferter Wert lässt den INSERT mit 428C9
  // scheitern — bestätigt in docs/PILOT_E2E_BERICHT.md und bereits in
  // app/api/leistungsnachweis/crud/route.ts entsprechend behandelt.
  const { data: row, error } = await supabase
    .from('service_records')
    .insert({
      client_id: eingabe.clientId,
      caregiver_id: eingabe.caregiverId,
      verordnung_id: eingabe.verordnungId,
      date: eingabe.date,
      start_time: eingabe.startTime,
      end_time: eingabe.endTime,
      service_type: eingabe.leistungsart,
      budget_type: 'private',
      billing_type: '§37',
      billing_status: 'OFFEN',
      amount: eingabe.amount,
      caregiver_initials: '',
      notes: eingabe.notes ?? null,
      proof_status: 'ENTWURF',
      organization_id: organizationId,
    })
    .select('id')
    .single()

  if (error || !row) throw new Error(`Leistungsnachweis konnte nicht erfasst werden: ${error?.message}`)

  await logBillingAction(supabase, {
    entityType: 'verordnung',
    organizationId,
    entityId: row.id,
    action: 'sgb_v_leistungsnachweis_erfasst',
    newState: { verordnung_id: eingabe.verordnungId, leistungsart: eingabe.leistungsart, datum: eingabe.date },
    actorId,
  })

  return row.id
}

export async function listeHkpLeistungsnachweise(
  supabase: SupabaseClient,
  organizationId: string,
  filter: { von?: string; bis?: string; verordnungId?: string } = {},
) {
  let query = supabase
    .from('service_records')
    .select('id, client_id, verordnung_id, date, duration_minutes, service_type, amount, proof_status, billing_status')
    .eq('organization_id', organizationId)
    .eq('billing_type', '§37')
    .order('date', { ascending: false })

  if (filter.von) query = query.gte('date', filter.von)
  if (filter.bis) query = query.lte('date', filter.bis)
  if (filter.verordnungId) query = query.eq('verordnung_id', filter.verordnungId)

  const { data, error } = await query
  if (error) throw new Error(`Leistungsnachweise konnten nicht geladen werden: ${error.message}`)
  return data || []
}

/**
 * Vollständigkeitsprüfung für einen Zeitraum: kombiniert die
 * Abrechenbarkeitsregeln aus ./positionen.ts (Verordnung/Kostenträger/
 * Versichertennummer) mit dem Erfassungsstatus (proof_status), der dort
 * bewusst nicht geprüft wird — pruefePosition() kennt keine Signaturen.
 */
export async function pruefeVollstaendigkeit(
  supabase: SupabaseClient,
  organizationId: string,
  von: string,
  bis: string,
): Promise<HkpVollstaendigkeitsErgebnis[]> {
  const { data: leistungen, error: leistungenFehler } = await supabase
    .from('service_records')
    .select('id, client_id, verordnung_id, date, amount, proof_status, billing_status, status')
    .eq('organization_id', organizationId)
    .eq('billing_type', '§37')
    .gte('date', von)
    .lte('date', bis)

  if (leistungenFehler) throw new Error(`Leistungen konnten nicht geladen werden: ${leistungenFehler.message}`)
  if (!leistungen || leistungen.length === 0) return []

  const verordnungIds = [...new Set(leistungen.map(l => l.verordnung_id).filter(Boolean))]
  const { data: verordnungen, error: verordnungenFehler } = await supabase
    .from('verordnungen')
    .select('id, client_id, verordnung_type, genehmigung_status, gueltig_von, gueltig_bis, genehmigung_bis, verordnung_nummer, genehmigung_aktenzeichen, kostentraeger_ik_nummer, kostentraeger_name')
    .in('id', verordnungIds.length > 0 ? verordnungIds : ['00000000-0000-0000-0000-000000000000'])

  // Ohne diese Pruefung wird jeder Abfrageausfall zur leeren Zuordnung — und
  // damit traegt jede Leistung das Problem 'keine_verordnung'. Die Liste
  // saehe aus wie ein Datenproblem im Bestand, obwohl nur die Abfrage
  // gescheitert ist.
  if (verordnungenFehler) {
    throw new Error(`Verordnungen konnten nicht geladen werden: ${verordnungenFehler.message}`)
  }

  const vById = new Map((verordnungen || []).map((v: HkpVerordnung) => [v.id, v]))

  return leistungen.map(l => {
    const probleme: HkpErfassungsProblem[] = []
    const verordnung = l.verordnung_id ? vById.get(l.verordnung_id) : undefined

    if (!verordnung) {
      probleme.push('keine_verordnung')
    } else {
      if (verordnung.genehmigung_status !== 'genehmigt') probleme.push('verordnung_nicht_genehmigt')
      const von2 = verordnung.gueltig_von
      const bisGrenze = gueltigBis(verordnung)
      if ((von2 && l.date < von2) || (bisGrenze && l.date > bisGrenze)) probleme.push('ausserhalb_zeitraum')
    }

    // Der Nachweisstand steht in ZWEI Spalten und der Sync laeuft nur in
    // eine Richtung (proof_status -> status, siehe status-sync.ts). Wer
    // allein proof_status liest, haelt jeden Nachweis, den der
    // Verwaltungsweg oder die Rechnungs-RPC angefasst hat, fuer einen
    // Entwurf: live am 28.08.2026 waren das 28 von 30 Nachweisen, 15 davon
    // bereits abgerechnet. Massgeblich ist der hoehere der beiden Staende.
    if (istStorniert(l)) {
      probleme.push('storniert')
    } else if (nachweisRang(l) < 2) {
      probleme.push('nicht_abgeschlossen')
    }
    if (!l.amount || Number(l.amount) <= 0) probleme.push('kein_betrag')

    return { id: l.id, ok: probleme.length === 0, probleme }
  })
}

// Re-Export für Aufrufer, die nur die reine Prüf-Funktion brauchen.
export { pruefePosition }
