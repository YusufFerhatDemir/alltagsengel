import type { SupabaseClient } from '@supabase/supabase-js'
import type { OpsBenachrichtigung, OpsBenachrichtigungZaehler, ListBenachrichtigungenFilter } from './types'

export async function listBenachrichtigungen(
  supabase: SupabaseClient,
  filter: ListBenachrichtigungenFilter,
): Promise<OpsBenachrichtigung[]> {
  let query = supabase
    .from('ops_benachrichtigungen')
    .select('*')
    .eq('organization_id', filter.organizationId)
    .eq('empfaenger_id', filter.empfaengerId)
    .order('created_at', { ascending: false })

  if (filter.gelesen !== undefined) query = query.eq('gelesen', filter.gelesen)
  if (filter.kategorie) query = query.eq('kategorie', filter.kategorie)
  if (filter.limit) query = query.limit(filter.limit)

  const { data, error } = await query
  if (error) throw new Error(`Benachrichtigungen konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as OpsBenachrichtigung[]
}

export async function getZaehler(
  supabase: SupabaseClient,
  params: { organizationId: string; empfaengerId: string },
): Promise<OpsBenachrichtigungZaehler[]> {
  const { data, error } = await supabase
    .from('ops_benachrichtigungen_zaehler')
    .select('*')
    .eq('organization_id', params.organizationId)
    .eq('empfaenger_id', params.empfaengerId)
  if (error) throw new Error(`Benachrichtigungszaehler konnte nicht geladen werden: ${error.message}`)
  return (data ?? []) as OpsBenachrichtigungZaehler[]
}

export async function markBenachrichtigungenGelesen(
  supabase: SupabaseClient,
  params: { organizationId: string; ids: string[]; empfaengerId: string },
): Promise<void> {
  const { error } = await supabase
    .from('ops_benachrichtigungen')
    .update({ gelesen: true, gelesen_am: new Date().toISOString() })
    .eq('organization_id', params.organizationId)
    .eq('empfaenger_id', params.empfaengerId)
    .in('id', params.ids)
  if (error) throw new Error(`Benachrichtigungen konnten nicht als gelesen markiert werden: ${error.message}`)
}

export async function createBenachrichtigung(
  supabase: SupabaseClient,
  params: { organizationId: string; data: Omit<OpsBenachrichtigung, 'id' | 'organization_id' | 'created_at' | 'gelesen' | 'gelesen_am'> },
): Promise<OpsBenachrichtigung> {
  const { data, error } = await supabase
    .from('ops_benachrichtigungen')
    .insert({ ...params.data, organization_id: params.organizationId })
    .select('*')
    .single()
  if (error || !data) throw new Error(`Benachrichtigung konnte nicht erstellt werden: ${error?.message ?? 'unbekannt'}`)
  return data as OpsBenachrichtigung
}
