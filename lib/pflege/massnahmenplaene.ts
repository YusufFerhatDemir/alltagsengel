// ═══════════════════════════════════════════════════════════════
// Maßnahmen-/Versorgungsplan — pflege_massnahmenplaene
// CRUD, Statusmaschine, Versionierung (Nachfolger erbt Maßnahmen),
// Freigabe (entwurf → aktiv) und Sperre.
// ═══════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import {
import { heuteBerlin } from '@/lib/utils/timezone';
  assertErlaubt,
  PLAN_TYP_WERTE,
  type PflegeMassnahme,
  type PflegeMassnahmenplan,
  type PlanStatus,
  type PlanTyp,
} from './types'

// Erlaubte Status-Übergänge (analog lib/akten/vertraege.ts)
const ERLAUBTE_UEBERGAENGE: Record<PlanStatus, PlanStatus[]> = {
  entwurf: ['aktiv', 'gesperrt'],
  aktiv: ['abgelaufen', 'ersetzt', 'gesperrt'],
  abgelaufen: ['ersetzt', 'gesperrt'],
  gesperrt: [],
  ersetzt: [],
}

export function validatePlanUebergang(von: PlanStatus, nach: PlanStatus): void {
  if (von === nach) return
  if (!ERLAUBTE_UEBERGAENGE[von]?.includes(nach)) {
    throw new Error(`Statuswechsel von "${von}" zu "${nach}" ist nicht erlaubt.`)
  }
}

export interface CreatePlanParams {
  organizationId: string
  clientId: string
  titel: string
  planTyp?: PlanTyp
  gueltigVon?: string
  gueltigBis?: string | null
  betreuungsziele?: string | null
  pflegeziele?: string | null
  vorgaengerId?: string | null
  version?: number
  erstelltVon: string
}

export async function createPlan(supabase: SupabaseClient, params: CreatePlanParams): Promise<PflegeMassnahmenplan> {
  if (!params.titel?.trim()) throw new Error('Titel ist ein Pflichtfeld.')
  assertErlaubt(params.planTyp, PLAN_TYP_WERTE, 'plan_typ')
  if (params.gueltigBis && params.gueltigVon && params.gueltigBis < params.gueltigVon) {
    throw new Error('"Gültig bis" darf nicht vor "Gültig von" liegen.')
  }

  const { data, error } = await supabase
    .from('pflege_massnahmenplaene')
    .insert({
      organization_id: params.organizationId,
      client_id: params.clientId,
      titel: params.titel.trim(),
      plan_typ: params.planTyp ?? 'versorgungsplan',
      gueltig_von: params.gueltigVon ?? heuteBerlin(),
      gueltig_bis: params.gueltigBis ?? null,
      version: params.version ?? 1,
      betreuungsziele: params.betreuungsziele ?? null,
      pflegeziele: params.pflegeziele ?? null,
      vorgaenger_id: params.vorgaengerId ?? null,
      erstellt_von: params.erstelltVon,
    })
    .select('*')
    .single()
  if (error || !data) throw new Error(`Maßnahmenplan konnte nicht angelegt werden: ${error?.message ?? 'unbekannt'}`)
  return data as PflegeMassnahmenplan
}

export interface ListPlaeneFilter {
  organizationId: string
  clientId?: string
  status?: PlanStatus
  planTyp?: PlanTyp
}

export async function listPlaene(supabase: SupabaseClient, filter: ListPlaeneFilter): Promise<PflegeMassnahmenplan[]> {
  let query = supabase
    .from('pflege_massnahmenplaene')
    .select('*')
    .eq('organization_id', filter.organizationId)
    .order('gueltig_von', { ascending: false })
    .order('version', { ascending: false })

  if (filter.clientId) query = query.eq('client_id', filter.clientId)
  if (filter.status) query = query.eq('status', filter.status)
  if (filter.planTyp) query = query.eq('plan_typ', filter.planTyp)

  const { data, error } = await query
  if (error) throw new Error(`Maßnahmenpläne konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as PflegeMassnahmenplan[]
}

export async function getPlan(supabase: SupabaseClient, id: string, organizationId: string): Promise<PflegeMassnahmenplan | null> {
  const { data, error } = await supabase
    .from('pflege_massnahmenplaene')
    .select('*')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (error) throw new Error(`Maßnahmenplan konnte nicht geladen werden: ${error.message}`)
  return data as PflegeMassnahmenplan | null
}

/** Der eine aktive Plan eines Kunden (Engel-/Kundensicht). */
export async function getAktivenPlan(
  supabase: SupabaseClient,
  clientId: string,
  organizationId: string
): Promise<PflegeMassnahmenplan | null> {
  const { data, error } = await supabase
    .from('pflege_massnahmenplaene')
    .select('*')
    .eq('client_id', clientId)
    .eq('organization_id', organizationId)
    .eq('status', 'aktiv')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`Aktiver Maßnahmenplan konnte nicht geladen werden: ${error.message}`)
  return data as PflegeMassnahmenplan | null
}

export interface UpdatePlanParams {
  titel?: string
  planTyp?: PlanTyp
  gueltigVon?: string
  gueltigBis?: string | null
  status?: PlanStatus
  betreuungsziele?: string | null
  pflegeziele?: string | null
}

export async function updatePlan(
  supabase: SupabaseClient,
  id: string,
  organizationId: string,
  patch: UpdatePlanParams
): Promise<PflegeMassnahmenplan> {
  const existing = await getPlan(supabase, id, organizationId)
  if (!existing) throw new Error('Maßnahmenplan nicht gefunden.')
  if (existing.gesperrt) throw new Error('Gesperrter Maßnahmenplan kann nicht bearbeitet werden.')
  assertErlaubt(patch.planTyp, PLAN_TYP_WERTE, 'plan_typ')
  if (patch.status) validatePlanUebergang(existing.status, patch.status)

  const von = patch.gueltigVon ?? existing.gueltig_von
  const bis = patch.gueltigBis !== undefined ? patch.gueltigBis : existing.gueltig_bis
  if (bis && von && bis < von) throw new Error('"Gültig bis" darf nicht vor "Gültig von" liegen.')

  const update: Record<string, unknown> = {}
  if (patch.titel !== undefined) {
    if (!patch.titel.trim()) throw new Error('Titel darf nicht leer sein.')
    update.titel = patch.titel.trim()
  }
  if (patch.planTyp !== undefined) update.plan_typ = patch.planTyp
  if (patch.gueltigVon !== undefined) update.gueltig_von = patch.gueltigVon
  if (patch.gueltigBis !== undefined) update.gueltig_bis = patch.gueltigBis
  if (patch.status !== undefined) update.status = patch.status
  if (patch.betreuungsziele !== undefined) update.betreuungsziele = patch.betreuungsziele
  if (patch.pflegeziele !== undefined) update.pflegeziele = patch.pflegeziele

  if (Object.keys(update).length === 0) throw new Error('Keine Änderungen übergeben.')

  const { data, error } = await supabase
    .from('pflege_massnahmenplaene')
    .update(update)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select('*')
    .single()
  if (error || !data) throw new Error(`Maßnahmenplan konnte nicht aktualisiert werden: ${error?.message ?? 'unbekannt'}`)
  return data as PflegeMassnahmenplan
}

/**
 * Freigabe: Entwurf → aktiv. Ein bereits aktiver Plan desselben Kunden
 * wird dabei auf 'ersetzt' gesetzt, damit immer genau ein Plan aktiv ist.
 */
export async function freigebenPlan(
  supabase: SupabaseClient,
  id: string,
  organizationId: string,
  freigegebenVon: string
): Promise<PflegeMassnahmenplan> {
  const existing = await getPlan(supabase, id, organizationId)
  if (!existing) throw new Error('Maßnahmenplan nicht gefunden.')
  if (existing.gesperrt) throw new Error('Gesperrter Maßnahmenplan kann nicht freigegeben werden.')
  validatePlanUebergang(existing.status, 'aktiv')

  const { count, error: countError } = await supabase
    .from('pflege_massnahmen')
    .select('id', { count: 'exact', head: true })
    .eq('plan_id', id)
    .eq('organization_id', organizationId)
  if (countError) throw new Error(`Maßnahmen konnten nicht geprüft werden: ${countError.message}`)
  if (!count) throw new Error('Ein Plan ohne Maßnahmen kann nicht freigegeben werden.')

  // Vorherigen aktiven Plan ablösen
  const { error: ersetztError } = await supabase
    .from('pflege_massnahmenplaene')
    .update({ status: 'ersetzt' })
    .eq('client_id', existing.client_id)
    .eq('organization_id', organizationId)
    .eq('status', 'aktiv')
    .neq('id', id)
  if (ersetztError) throw new Error(`Vorheriger Plan konnte nicht abgelöst werden: ${ersetztError.message}`)

  const { data, error } = await supabase
    .from('pflege_massnahmenplaene')
    .update({
      status: 'aktiv',
      freigegeben_von: freigegebenVon,
      freigegeben_am: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select('*')
    .single()
  if (error || !data) throw new Error(`Maßnahmenplan konnte nicht freigegeben werden: ${error?.message ?? 'unbekannt'}`)
  return data as PflegeMassnahmenplan
}

export async function sperrePlan(
  supabase: SupabaseClient,
  id: string,
  organizationId: string
): Promise<PflegeMassnahmenplan> {
  const existing = await getPlan(supabase, id, organizationId)
  if (!existing) throw new Error('Maßnahmenplan nicht gefunden.')
  if (existing.gesperrt) throw new Error('Maßnahmenplan ist bereits gesperrt.')

  const { data, error } = await supabase
    .from('pflege_massnahmenplaene')
    .update({ gesperrt: true, status: 'gesperrt' })
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select('*')
    .single()
  if (error || !data) throw new Error(`Maßnahmenplan konnte nicht gesperrt werden: ${error?.message ?? 'unbekannt'}`)
  return data as PflegeMassnahmenplan
}

/** Hebt die Sperre auf — der Plan fällt in den Entwurfsstatus zurück. */
export async function entsperrePlan(
  supabase: SupabaseClient,
  id: string,
  organizationId: string
): Promise<PflegeMassnahmenplan> {
  const existing = await getPlan(supabase, id, organizationId)
  if (!existing) throw new Error('Maßnahmenplan nicht gefunden.')
  if (!existing.gesperrt) throw new Error('Maßnahmenplan ist nicht gesperrt.')

  // trg_locked_plan blockiert nur Updates, bei denen gesperrt vorher UND
  // nachher true ist — das Entsperren läuft daher in einem Statement.
  const { data, error } = await supabase
    .from('pflege_massnahmenplaene')
    .update({ gesperrt: false, status: 'entwurf' })
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select('*')
    .single()
  if (error || !data) throw new Error(`Maßnahmenplan konnte nicht entsperrt werden: ${error?.message ?? 'unbekannt'}`)
  return data as PflegeMassnahmenplan
}

/**
 * Neue Version eines Plans: legt einen Entwurf mit version+1 an,
 * verkettet ihn über vorgaenger_id und kopiert alle Maßnahmen.
 * Der Vorgänger bleibt aktiv, bis die neue Version freigegeben wird.
 */
export async function neueVersion(
  supabase: SupabaseClient,
  vorgaengerId: string,
  organizationId: string,
  erstelltVon: string,
  patch?: { titel?: string; gueltigVon?: string; gueltigBis?: string | null }
): Promise<PflegeMassnahmenplan> {
  const vorgaenger = await getPlan(supabase, vorgaengerId, organizationId)
  if (!vorgaenger) throw new Error('Vorgänger-Plan nicht gefunden.')
  if (vorgaenger.status === 'ersetzt') {
    throw new Error('Ein bereits ersetzter Plan kann nicht erneut versioniert werden.')
  }

  const neu = await createPlan(supabase, {
    organizationId,
    clientId: vorgaenger.client_id,
    titel: patch?.titel ?? vorgaenger.titel,
    planTyp: vorgaenger.plan_typ,
    gueltigVon: patch?.gueltigVon ?? heuteBerlin(),
    gueltigBis: patch?.gueltigBis !== undefined ? patch.gueltigBis : vorgaenger.gueltig_bis,
    betreuungsziele: vorgaenger.betreuungsziele,
    pflegeziele: vorgaenger.pflegeziele,
    vorgaengerId: vorgaenger.id,
    version: vorgaenger.version + 1,
    erstelltVon,
  })

  const { data: massnahmen, error: leseFehler } = await supabase
    .from('pflege_massnahmen')
    .select('*')
    .eq('plan_id', vorgaenger.id)
    .eq('organization_id', organizationId)
    .order('sortierung', { ascending: true })
  if (leseFehler) throw new Error(`Maßnahmen konnten nicht übernommen werden: ${leseFehler.message}`)

  const zuKopieren = (massnahmen ?? []) as PflegeMassnahme[]
  if (zuKopieren.length > 0) {
    const { error: kopierFehler } = await supabase
      .from('pflege_massnahmen')
      .insert(zuKopieren.map(m => ({
        organization_id: organizationId,
        plan_id: neu.id,
        kategorie: m.kategorie,
        titel: m.titel,
        beschreibung: m.beschreibung,
        ziel: m.ziel,
        haeufigkeit: m.haeufigkeit,
        verantwortlich: m.verantwortlich,
        prioritaet: m.prioritaet,
        status: 'geplant',
        beginn_datum: m.beginn_datum,
        ende_datum: m.ende_datum,
        sortierung: m.sortierung,
        erstellt_von: erstelltVon,
      })))
    if (kopierFehler) throw new Error(`Maßnahmen konnten nicht kopiert werden: ${kopierFehler.message}`)
  }

  return neu
}
