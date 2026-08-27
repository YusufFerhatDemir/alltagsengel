// ═══════════════════════════════════════════════════════════════
// Wundversorgung / Verbandwechsel-Protokoll — wound_treatments
// ═══════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { UserFacingError } from '@/lib/api/user-facing-error'
import { assertZeitstempelNichtInZukunft, type WoundMaterial, type WoundTreatment, type WundStatus } from './types'

function normalisiereMaterialien(materialien: unknown): WoundMaterial[] {
  if (materialien === undefined || materialien === null) return []
  if (!Array.isArray(materialien)) throw new UserFacingError('materialien muss eine Liste sein.')
  return materialien.map((m, i) => {
    const name = typeof m?.name === 'string' ? m.name.trim() : ''
    if (!name) throw new UserFacingError(`Material ${i + 1}: name ist Pflichtfeld.`)
    const menge = typeof m?.menge === 'string' && m.menge.trim() ? m.menge.trim() : undefined
    return menge ? { name, menge } : { name }
  })
}

/** Wirft, wenn die Wunde bereits abgeheilt ist — Verbandwechsel wird dann nicht mehr protokolliert. */
function assertWundeBeschreibbar(wundStatus: WundStatus): void {
  if (wundStatus === 'abgeheilt') {
    throw new UserFacingError(
      'Wunde ist als abgeheilt markiert. Für einen neuen Verbandwechsel muss der Status zuerst geändert werden.',
      409,
    )
  }
}

export interface CreateTreatmentParams {
  organizationId: string
  woundId: string
  /** Aktueller Status der Wunde — steuert die Sperr-Logik für abgeheilte Wunden. */
  wundStatus: WundStatus
  durchgefuehrtVon: string
  durchgefuehrtAm?: string | null
  massnahme: string
  wundreinigung?: string | null
  materialien?: WoundMaterial[]
  schmerzmittelGegeben?: boolean
  besonderheiten?: string | null
  naechsterVwAm?: string | null
}

export async function createTreatment(supabase: SupabaseClient, params: CreateTreatmentParams): Promise<WoundTreatment> {
  assertWundeBeschreibbar(params.wundStatus)
  if (!params.massnahme?.trim()) throw new UserFacingError('Maßnahme ist ein Pflichtfeld.')
  assertZeitstempelNichtInZukunft(params.durchgefuehrtAm, 'Durchführungszeitpunkt')

  const { data, error } = await supabase
    .from('wound_treatments')
    .insert({
      organization_id: params.organizationId,
      wound_id: params.woundId,
      durchgefuehrt_am: params.durchgefuehrtAm ?? new Date().toISOString(),
      durchgefuehrt_von: params.durchgefuehrtVon,
      massnahme: params.massnahme.trim(),
      wundreinigung: params.wundreinigung ?? null,
      materialien: normalisiereMaterialien(params.materialien),
      schmerzmittel_gegeben: params.schmerzmittelGegeben ?? false,
      besonderheiten: params.besonderheiten ?? null,
      naechster_vw_am: params.naechsterVwAm ?? null,
    })
    .select('*')
    .single()
  if (error || !data) throw new Error(`Verbandwechsel konnte nicht protokolliert werden: ${error?.message ?? 'unbekannt'}`)
  return data as WoundTreatment
}

export async function listTreatments(
  supabase: SupabaseClient,
  woundId: string,
  organizationId: string
): Promise<WoundTreatment[]> {
  const { data, error } = await supabase
    .from('wound_treatments')
    .select('*')
    .eq('wound_id', woundId)
    .eq('organization_id', organizationId)
    .order('durchgefuehrt_am', { ascending: false })
  if (error) throw new Error(`Verbandwechsel konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as WoundTreatment[]
}

/**
 * Nächster geplanter Verbandwechsel: Es gilt die Planung des JÜNGSTEN
 * Protokolleintrags mit Termin (ältere Planungen sind überholt). null = keiner geplant.
 */
export function naechsterVwTermin(treatments: Pick<WoundTreatment, 'durchgefuehrt_am' | 'naechster_vw_am'>[]): string | null {
  const mitTermin = [...treatments]
    .filter(t => t.naechster_vw_am !== null)
    .sort((a, b) => b.durchgefuehrt_am.localeCompare(a.durchgefuehrt_am))
  return mitTermin[0]?.naechster_vw_am ?? null
}
