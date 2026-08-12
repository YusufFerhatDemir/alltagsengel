import type { SupabaseClient } from '@supabase/supabase-js'
import { assertErlaubt, SCHULUNGSART_WERTE, type PersonalSchulung, type Schulungsart } from './types'

export interface CreateSchulungParams {
  organizationId: string
  caregiverId: string
  titel: string
  schulungsart: Schulungsart
  anbieter?: string | null
  beginn: string
  ende?: string | null
  dauerStunden?: number | null
  ort?: string | null
  zertifikatUrl?: string | null
  dokumentId?: string | null
  bestanden?: boolean | null
  naechsteAuffrischung?: string | null
  bemerkung?: string | null
  erstelltVon: string
}

export async function createSchulung(supabase: SupabaseClient, params: CreateSchulungParams): Promise<PersonalSchulung> {
  if (!params.titel?.trim()) throw new Error('Titel ist ein Pflichtfeld.')
  assertErlaubt(params.schulungsart, SCHULUNGSART_WERTE, 'schulungsart')

  const { data, error } = await supabase
    .from('personal_schulungen')
    .insert({
      organization_id: params.organizationId,
      caregiver_id: params.caregiverId,
      titel: params.titel.trim(),
      schulungsart: params.schulungsart,
      anbieter: params.anbieter ?? null,
      beginn: params.beginn,
      ende: params.ende ?? null,
      dauer_stunden: params.dauerStunden ?? null,
      ort: params.ort ?? null,
      zertifikat_url: params.zertifikatUrl ?? null,
      dokument_id: params.dokumentId ?? null,
      bestanden: params.bestanden ?? null,
      naechste_auffrischung: params.naechsteAuffrischung ?? null,
      bemerkung: params.bemerkung ?? null,
      erstellt_von: params.erstelltVon,
    })
    .select('*')
    .single()
  if (error || !data) throw new Error(`Schulung konnte nicht angelegt werden: ${error?.message ?? 'unbekannt'}`)
  return data as PersonalSchulung
}

export interface ListSchulungenFilter {
  organizationId: string
  caregiverId?: string
  schulungsart?: Schulungsart
}

export async function listSchulungen(supabase: SupabaseClient, filter: ListSchulungenFilter): Promise<PersonalSchulung[]> {
  let query = supabase
    .from('personal_schulungen')
    .select('*')
    .eq('organization_id', filter.organizationId)
    .order('beginn', { ascending: false })

  if (filter.caregiverId) query = query.eq('caregiver_id', filter.caregiverId)
  if (filter.schulungsart) query = query.eq('schulungsart', filter.schulungsart)

  const { data, error } = await query
  if (error) throw new Error(`Schulungen konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as PersonalSchulung[]
}

export interface UpdateSchulungParams {
  titel?: string
  schulungsart?: Schulungsart
  anbieter?: string | null
  beginn?: string
  ende?: string | null
  dauerStunden?: number | null
  ort?: string | null
  zertifikatUrl?: string | null
  dokumentId?: string | null
  bestanden?: boolean | null
  naechsteAuffrischung?: string | null
  bemerkung?: string | null
}

export async function updateSchulung(
  supabase: SupabaseClient,
  id: string,
  organizationId: string,
  patch: UpdateSchulungParams,
): Promise<PersonalSchulung> {
  assertErlaubt(patch.schulungsart, SCHULUNGSART_WERTE, 'schulungsart')

  const update: Record<string, unknown> = {}
  if (patch.titel !== undefined) update.titel = patch.titel
  if (patch.schulungsart !== undefined) update.schulungsart = patch.schulungsart
  if (patch.anbieter !== undefined) update.anbieter = patch.anbieter
  if (patch.beginn !== undefined) update.beginn = patch.beginn
  if (patch.ende !== undefined) update.ende = patch.ende
  if (patch.dauerStunden !== undefined) update.dauer_stunden = patch.dauerStunden
  if (patch.ort !== undefined) update.ort = patch.ort
  if (patch.zertifikatUrl !== undefined) update.zertifikat_url = patch.zertifikatUrl
  if (patch.dokumentId !== undefined) update.dokument_id = patch.dokumentId
  if (patch.bestanden !== undefined) update.bestanden = patch.bestanden
  if (patch.naechsteAuffrischung !== undefined) update.naechste_auffrischung = patch.naechsteAuffrischung
  if (patch.bemerkung !== undefined) update.bemerkung = patch.bemerkung

  if (Object.keys(update).length === 0) throw new Error('Keine Änderungen übergeben.')

  const { data, error } = await supabase
    .from('personal_schulungen')
    .update(update)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select('*')
    .single()
  if (error || !data) throw new Error(`Schulung konnte nicht aktualisiert werden: ${error?.message ?? 'unbekannt'}`)
  return data as PersonalSchulung
}

export async function deleteSchulung(supabase: SupabaseClient, id: string, organizationId: string): Promise<void> {
  const { error } = await supabase
    .from('personal_schulungen')
    .delete()
    .eq('id', id)
    .eq('organization_id', organizationId)
  if (error) throw new Error(`Schulung konnte nicht gelöscht werden: ${error.message}`)
}
