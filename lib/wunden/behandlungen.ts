// ═══════════════════════════════════════════════════════════════
// Wundversorgung / Verbandwechsel-Protokoll — wound_treatments
// ═══════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import type { WoundMaterial, WoundTreatment } from './types'

function normalisiereMaterialien(materialien: unknown): WoundMaterial[] {
  if (materialien === undefined || materialien === null) return []
  if (!Array.isArray(materialien)) throw new Error('materialien muss eine Liste sein.')
  return materialien.map((m, i) => {
    const name = typeof m?.name === 'string' ? m.name.trim() : ''
    if (!name) throw new Error(`Material ${i + 1}: name ist Pflichtfeld.`)
    const menge = typeof m?.menge === 'string' && m.menge.trim() ? m.menge.trim() : undefined
    return menge ? { name, menge } : { name }
  })
}

export interface CreateTreatmentParams {
  organizationId: string
  woundId: string
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
  if (!params.massnahme?.trim()) throw new Error('Maßnahme ist ein Pflichtfeld.')

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
