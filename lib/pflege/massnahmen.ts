import { UserFacingError } from '@/lib/api/user-facing-error'
// ═══════════════════════════════════════════════════════════════
// Einzelmaßnahmen eines Plans — pflege_massnahmen
// Schreibzugriff nur solange der zugehörige Plan nicht gesperrt ist.
// ═══════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { logPflegeAktivitaet } from './audit-log'
import {
  assertErlaubt,
  MASSNAHME_KATEGORIE_WERTE,
  MASSNAHME_PRIORITAET_WERTE,
  MASSNAHME_STATUS_WERTE,
  type MassnahmeKategorie,
  type MassnahmePrioritaet,
  type MassnahmeStatus,
  type PflegeMassnahme,
} from './types'
import { logger } from '@/lib/logger'
const log = logger.child('pflege-audit')

/** Wirft, wenn der Plan gesperrt ist — Maßnahmen erben die Sperre des Plans. */
async function assertPlanOffen(supabase: SupabaseClient, planId: string, organizationId: string): Promise<void> {
  const { data, error } = await supabase
    .from('pflege_massnahmenplaene')
    .select('id, gesperrt')
    .eq('id', planId)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (error) throw new Error(`Plan konnte nicht geprüft werden: ${error.message}`)
  if (!data) throw new UserFacingError('Maßnahmenplan nicht gefunden.')
  if (data.gesperrt) throw new UserFacingError('Gesperrter Maßnahmenplan — Maßnahmen können nicht geändert werden.')
}

export interface CreateMassnahmeParams {
  organizationId: string
  planId: string
  kategorie: MassnahmeKategorie
  titel: string
  beschreibung?: string | null
  ziel?: string | null
  haeufigkeit?: string | null
  verantwortlich?: string | null
  prioritaet?: MassnahmePrioritaet
  beginnDatum?: string | null
  endeDatum?: string | null
  sortierung?: number
  /**
   * Wiedervorlage-Intervall in Tagen (§ 114 SGB XI, Regelkreis).
   * Ohne Angabe gibt es keine automatische Wiedervorlage — eine erfundene
   * taeuschte eine Verabredung vor, die niemand getroffen hat. Siehe
   * `lib/pflege/evaluation.ts`.
   */
  evaluationIntervallTage?: number | null
  erstelltVon: string
}

/** Fehlercode einer PostgREST-Antwort, soweit vorhanden. */
function fehlerCode(error: unknown): string | undefined {
  return (error as { code?: string } | null)?.code
}

/**
 * Wirft, wenn das Evaluationsintervall unbrauchbar ist. Spiegelt
 * `pflege_massnahmen_evaluation_intervall_check`.
 */
function assertIntervall(tage: number | null | undefined): void {
  if (tage == null) return
  if (!Number.isInteger(tage) || tage < 1 || tage > 365) {
    throw new UserFacingError('Das Evaluationsintervall muss zwischen 1 und 365 Tagen liegen.')
  }
}

export async function createMassnahme(supabase: SupabaseClient, params: CreateMassnahmeParams): Promise<PflegeMassnahme> {
  if (!params.titel?.trim()) throw new UserFacingError('Titel ist ein Pflichtfeld.')
  assertErlaubt(params.kategorie, MASSNAHME_KATEGORIE_WERTE, 'kategorie')
  assertErlaubt(params.prioritaet, MASSNAHME_PRIORITAET_WERTE, 'prioritaet')
  if (params.endeDatum && params.beginnDatum && params.endeDatum < params.beginnDatum) {
    throw new UserFacingError('Enddatum darf nicht vor dem Beginn liegen.')
  }
  assertIntervall(params.evaluationIntervallTage)
  await assertPlanOffen(supabase, params.planId, params.organizationId)

  const zeile: Record<string, unknown> = {
    organization_id: params.organizationId,
    plan_id: params.planId,
    kategorie: params.kategorie,
    titel: params.titel.trim(),
    beschreibung: params.beschreibung ?? null,
    ziel: params.ziel ?? null,
    haeufigkeit: params.haeufigkeit ?? null,
    verantwortlich: params.verantwortlich ?? null,
    prioritaet: params.prioritaet ?? 'normal',
    beginn_datum: params.beginnDatum ?? null,
    ende_datum: params.endeDatum ?? null,
    sortierung: params.sortierung ?? 0,
    erstellt_von: params.erstelltVon,
  }

  // `evaluation_intervall_tage` kommt aus Migration 20260829185500. Kennt
  // die Datenbank die Spalte noch nicht, antwortet sie mit 42703, und der
  // zweite Versuch laeuft ohne sie — dieselbe Bauart wie in
  // lib/personal/arbeitszeiten.ts. Ohne diesen Rueckfall waere das Anlegen
  // JEDER Massnahme kaputt, sobald der Code vor der Migration ausgeliefert
  // wird, und das ist die Reihenfolge, in der hier ausgeliefert wird.
  let antwort = await supabase
    .from('pflege_massnahmen')
    .insert({ ...zeile, evaluation_intervall_tage: params.evaluationIntervallTage ?? null })
    .select('*')
    .single()
  if (fehlerCode(antwort.error) === '42703') {
    antwort = await supabase.from('pflege_massnahmen').insert(zeile).select('*').single()
  }

  const { data, error } = antwort
  if (error || !data) throw new Error(`Maßnahme konnte nicht angelegt werden: ${error?.message ?? 'unbekannt'}`)

  await logPflegeAktivitaet(supabase, {
    organizationId: (data as PflegeMassnahme).organization_id,
    entitaetTyp: 'massnahme',
    entitaetId: (data as PflegeMassnahme).id,
    aktion: 'erstellt',
    nachher: data,
    akteurId: params.erstelltVon,
  }).catch((err) => log.errorWithException('Maßnahme-Log fehlgeschlagen', err))

  return data as PflegeMassnahme
}

export interface ListMassnahmenFilter {
  organizationId: string
  planId?: string
  kategorie?: MassnahmeKategorie
  status?: MassnahmeStatus
}

export async function listMassnahmen(supabase: SupabaseClient, filter: ListMassnahmenFilter): Promise<PflegeMassnahme[]> {
  let query = supabase
    .from('pflege_massnahmen')
    .select('*')
    .eq('organization_id', filter.organizationId)
    .order('sortierung', { ascending: true })
    .order('created_at', { ascending: true })

  if (filter.planId) query = query.eq('plan_id', filter.planId)
  if (filter.kategorie) query = query.eq('kategorie', filter.kategorie)
  if (filter.status) query = query.eq('status', filter.status)

  const { data, error } = await query
  if (error) throw new Error(`Maßnahmen konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as PflegeMassnahme[]
}

export async function getMassnahme(supabase: SupabaseClient, id: string, organizationId: string): Promise<PflegeMassnahme | null> {
  const { data, error } = await supabase
    .from('pflege_massnahmen')
    .select('*')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (error) throw new Error(`Maßnahme konnte nicht geladen werden: ${error.message}`)
  return data as PflegeMassnahme | null
}

export interface UpdateMassnahmeParams {
  kategorie?: MassnahmeKategorie
  titel?: string
  beschreibung?: string | null
  ziel?: string | null
  haeufigkeit?: string | null
  verantwortlich?: string | null
  prioritaet?: MassnahmePrioritaet
  status?: MassnahmeStatus
  beginnDatum?: string | null
  endeDatum?: string | null
  ergebnis?: string | null
  sortierung?: number
  /** Siehe `CreateMassnahmeParams.evaluationIntervallTage`. */
  evaluationIntervallTage?: number | null
}

export async function updateMassnahme(
  supabase: SupabaseClient,
  id: string,
  organizationId: string,
  patch: UpdateMassnahmeParams
): Promise<PflegeMassnahme> {
  const existing = await getMassnahme(supabase, id, organizationId)
  if (!existing) throw new UserFacingError('Maßnahme nicht gefunden.')
  await assertPlanOffen(supabase, existing.plan_id, organizationId)

  assertErlaubt(patch.kategorie, MASSNAHME_KATEGORIE_WERTE, 'kategorie')
  assertErlaubt(patch.prioritaet, MASSNAHME_PRIORITAET_WERTE, 'prioritaet')
  assertErlaubt(patch.status, MASSNAHME_STATUS_WERTE, 'status')

  const beginn = patch.beginnDatum !== undefined ? patch.beginnDatum : existing.beginn_datum
  const ende = patch.endeDatum !== undefined ? patch.endeDatum : existing.ende_datum
  if (beginn && ende && ende < beginn) throw new UserFacingError('Enddatum darf nicht vor dem Beginn liegen.')

  const update: Record<string, unknown> = {}
  if (patch.kategorie !== undefined) update.kategorie = patch.kategorie
  if (patch.titel !== undefined) {
    if (!patch.titel.trim()) throw new UserFacingError('Titel darf nicht leer sein.')
    update.titel = patch.titel.trim()
  }
  if (patch.beschreibung !== undefined) update.beschreibung = patch.beschreibung
  if (patch.ziel !== undefined) update.ziel = patch.ziel
  if (patch.haeufigkeit !== undefined) update.haeufigkeit = patch.haeufigkeit
  if (patch.verantwortlich !== undefined) update.verantwortlich = patch.verantwortlich
  if (patch.prioritaet !== undefined) update.prioritaet = patch.prioritaet
  if (patch.status !== undefined) update.status = patch.status
  if (patch.beginnDatum !== undefined) update.beginn_datum = patch.beginnDatum
  if (patch.endeDatum !== undefined) update.ende_datum = patch.endeDatum
  if (patch.ergebnis !== undefined) update.ergebnis = patch.ergebnis
  if (patch.sortierung !== undefined) update.sortierung = patch.sortierung
  if (patch.evaluationIntervallTage !== undefined) {
    assertIntervall(patch.evaluationIntervallTage)
    update.evaluation_intervall_tage = patch.evaluationIntervallTage
  }

  if (Object.keys(update).length === 0) throw new UserFacingError('Keine Änderungen übergeben.')

  const schreibe = (werte: Record<string, unknown>) => supabase
    .from('pflege_massnahmen')
    .update(werte)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select('*')
    .single()

  // 42703-Rueckfall wie in createMassnahme — aber nur, wenn das Intervall
  // ueberhaupt im Patch stand. Ein Patch ohne dieses Feld darf sich nicht
  // stillschweigend wiederholen; er waere sonst zweimal ausgefuehrt, wenn
  // ein 42703 aus einem ANDEREN Grund kaeme.
  let antwort = await schreibe(update)
  if (fehlerCode(antwort.error) === '42703' && update.evaluation_intervall_tage !== undefined) {
    const { evaluation_intervall_tage: _weg, ...ohne } = update
    if (Object.keys(ohne).length === 0) {
      throw new UserFacingError(
        'Das Evaluationsintervall ist in dieser Datenbank noch nicht eingerichtet.',
        503,
      )
    }
    antwort = await schreibe(ohne)
  }

  const { data, error } = antwort
  if (error || !data) throw new Error(`Maßnahme konnte nicht aktualisiert werden: ${error?.message ?? 'unbekannt'}`)

  await logPflegeAktivitaet(supabase, {
    organizationId,
    entitaetTyp: 'massnahme',
    entitaetId: id,
    aktion: 'aktualisiert',
    vorher: existing,
    nachher: data,
  }).catch((err) => log.errorWithException('Maßnahme-Log fehlgeschlagen', err))

  return data as PflegeMassnahme
}
