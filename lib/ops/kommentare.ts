import type { SupabaseClient } from '@supabase/supabase-js'
import type { OpsAufgabeKommentar } from './types'

export async function listKommentare(
  supabase: SupabaseClient,
  params: { organizationId: string; aufgabeId: string; includeIntern?: boolean },
): Promise<OpsAufgabeKommentar[]> {
  let query = supabase
    .from('ops_aufgaben_kommentare')
    .select('*')
    .eq('organization_id', params.organizationId)
    .eq('aufgabe_id', params.aufgabeId)
    .order('created_at', { ascending: true })

  if (!params.includeIntern) query = query.eq('ist_intern', false)

  const { data, error } = await query
  if (error) throw new Error(`Kommentare konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as OpsAufgabeKommentar[]
}

export async function createKommentar(
  supabase: SupabaseClient,
  params: { organizationId: string; aufgabeId: string; inhalt: string; autorId: string; istIntern?: boolean },
): Promise<OpsAufgabeKommentar> {
  if (!params.inhalt?.trim()) throw new Error('Kommentarinhalt ist ein Pflichtfeld.')
  if (!params.autorId?.trim()) throw new Error('Autor ist ein Pflichtfeld.')
  const { data, error } = await supabase
    .from('ops_aufgaben_kommentare')
    .insert({
      organization_id: params.organizationId,
      aufgabe_id: params.aufgabeId,
      inhalt: params.inhalt.trim(),
      autor_id: params.autorId,
      ist_intern: params.istIntern ?? false,
    })
    .select('*')
    .single()
  if (error || !data) throw new Error(`Kommentar konnte nicht erstellt werden: ${error?.message ?? 'unbekannt'}`)
  return data as OpsAufgabeKommentar
}
