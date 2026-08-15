import type { SupabaseClient } from '@supabase/supabase-js'
import {
  assertErlaubt,
  WIEDERVORLAGE_ENTITAET_TYP_WERTE,
  WIEDERVORLAGE_STATUS_WERTE,
  type OpsWiedervorlage,
  type OpsWiedervorlageFaellig,
  type ListWiedervorlagenFilter,
} from './types'

export async function listWiedervorlagen(
  supabase: SupabaseClient,
  filter: ListWiedervorlagenFilter,
): Promise<OpsWiedervorlageFaellig[]> {
  let query = supabase
    .from('ops_wiedervorlagen_faellig')
    .select('*')
    .eq('organization_id', filter.organizationId)
    .order('faellig_am', { ascending: true })

  if (filter.status) query = query.eq('status', filter.status)
  if (filter.empfaengerId) query = query.eq('empfaenger_id', filter.empfaengerId)

  const { data, error } = await query
  if (error) throw new Error(`Wiedervorlagen konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as OpsWiedervorlageFaellig[]
}

export async function listFaelligeWiedervorlagen(
  supabase: SupabaseClient,
  params: { organizationId: string },
): Promise<OpsWiedervorlageFaellig[]> {
  const { data, error } = await supabase
    .from('ops_wiedervorlagen_faellig')
    .select('*')
    .eq('organization_id', params.organizationId)
    .eq('status', 'aktiv')
    .in('dringlichkeit', ['ueberfaellig', 'heute', 'morgen'])
    .order('faellig_am', { ascending: true })
  if (error) throw new Error(`Faellige Wiedervorlagen konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as OpsWiedervorlageFaellig[]
}

export async function createWiedervorlage(
  supabase: SupabaseClient,
  params: { organizationId: string; data: Omit<OpsWiedervorlage, 'id' | 'organization_id' | 'created_at' | 'erledigt_am' | 'erledigt_von'> },
): Promise<OpsWiedervorlage> {
  if (!params.data.titel?.trim()) throw new Error('Titel ist ein Pflichtfeld.')
  if (!params.data.entitaet_typ) throw new Error('Entitaet-Typ ist ein Pflichtfeld.')
  if (!params.data.entitaet_id) throw new Error('Entitaet-ID ist ein Pflichtfeld.')
  if (!params.data.faellig_am) throw new Error('Faelligkeitsdatum ist ein Pflichtfeld.')
  if (!params.data.empfaenger_id) throw new Error('Empfaenger ist ein Pflichtfeld.')
  if (!params.data.erstellt_von) throw new Error('Ersteller ist ein Pflichtfeld.')
  assertErlaubt(params.data.entitaet_typ, WIEDERVORLAGE_ENTITAET_TYP_WERTE, 'entitaet_typ')
  const { data, error } = await supabase
    .from('ops_wiedervorlagen')
    .insert({ ...params.data, titel: params.data.titel.trim(), organization_id: params.organizationId })
    .select('*')
    .single()
  if (error || !data) throw new Error(`Wiedervorlage konnte nicht erstellt werden: ${error?.message ?? 'unbekannt'}`)
  return data as OpsWiedervorlage
}

export async function updateWiedervorlage(
  supabase: SupabaseClient,
  params: { organizationId: string; id: string; data: Partial<Pick<OpsWiedervorlage, 'titel' | 'beschreibung' | 'faellig_am' | 'status' | 'erledigt_am' | 'erledigt_von'>> },
): Promise<OpsWiedervorlage> {
  if (params.data.titel !== undefined && !params.data.titel?.trim()) {
    throw new Error('Titel darf nicht leer sein.')
  }
  assertErlaubt(params.data.status, WIEDERVORLAGE_STATUS_WERTE, 'status')
  const { data, error } = await supabase
    .from('ops_wiedervorlagen')
    .update(params.data.titel !== undefined ? { ...params.data, titel: params.data.titel.trim() } : params.data)
    .eq('id', params.id)
    .eq('organization_id', params.organizationId)
    .select('*')
    .single()
  if (error || !data) throw new Error(`Wiedervorlage konnte nicht aktualisiert werden: ${error?.message ?? 'unbekannt'}`)
  return data as OpsWiedervorlage
}
