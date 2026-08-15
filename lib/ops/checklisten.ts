import type { SupabaseClient } from '@supabase/supabase-js'
import type { OpsAufgabeCheckliste } from './types'

export async function listChecklisten(
  supabase: SupabaseClient,
  params: { organizationId: string; aufgabeId: string },
): Promise<OpsAufgabeCheckliste[]> {
  const { data, error } = await supabase
    .from('ops_aufgaben_checklisten')
    .select('*')
    .eq('organization_id', params.organizationId)
    .eq('aufgabe_id', params.aufgabeId)
    .order('position', { ascending: true })
  if (error) throw new Error(`Checkliste konnte nicht geladen werden: ${error.message}`)
  return (data ?? []) as OpsAufgabeCheckliste[]
}

export async function createChecklistenItem(
  supabase: SupabaseClient,
  params: { organizationId: string; aufgabeId: string; titel: string; position: number },
): Promise<OpsAufgabeCheckliste> {
  if (!params.titel?.trim()) throw new Error('Titel ist ein Pflichtfeld.')
  const { data, error } = await supabase
    .from('ops_aufgaben_checklisten')
    .insert({
      organization_id: params.organizationId,
      aufgabe_id: params.aufgabeId,
      titel: params.titel.trim(),
      position: params.position ?? 0,
    })
    .select('*')
    .single()
  if (error || !data) throw new Error(`Checklistenpunkt konnte nicht erstellt werden: ${error?.message ?? 'unbekannt'}`)
  return data as OpsAufgabeCheckliste
}

export async function updateChecklistenItem(
  supabase: SupabaseClient,
  params: { organizationId: string; id: string; data: Partial<Pick<OpsAufgabeCheckliste, 'titel' | 'position' | 'erledigt' | 'erledigt_von' | 'erledigt_am'>> },
): Promise<OpsAufgabeCheckliste> {
  if (params.data.titel !== undefined && !params.data.titel?.trim()) {
    throw new Error('Titel darf nicht leer sein.')
  }
  const { data, error } = await supabase
    .from('ops_aufgaben_checklisten')
    .update(params.data.titel !== undefined ? { ...params.data, titel: params.data.titel.trim() } : params.data)
    .eq('id', params.id)
    .eq('organization_id', params.organizationId)
    .select('*')
    .single()
  if (error || !data) throw new Error(`Checklistenpunkt konnte nicht aktualisiert werden: ${error?.message ?? 'unbekannt'}`)
  return data as OpsAufgabeCheckliste
}

export async function deleteChecklistenItem(
  supabase: SupabaseClient,
  params: { organizationId: string; id: string },
): Promise<void> {
  const { error } = await supabase
    .from('ops_aufgaben_checklisten')
    .delete()
    .eq('id', params.id)
    .eq('organization_id', params.organizationId)
  if (error) throw new Error(`Checklistenpunkt konnte nicht geloescht werden: ${error.message}`)
}
