import type { SupabaseClient } from '@supabase/supabase-js'
import type { OpsBenachrichtigungsPraeferenz, BenachrichtigungKategorie } from './types'

export async function listPraeferenzen(
  supabase: SupabaseClient,
  params: { organizationId: string; benutzerId: string },
): Promise<OpsBenachrichtigungsPraeferenz[]> {
  const { data, error } = await supabase
    .from('ops_benachrichtigungs_praeferenzen')
    .select('*')
    .eq('organization_id', params.organizationId)
    .eq('benutzer_id', params.benutzerId)
    .order('kategorie', { ascending: true })
  if (error) throw new Error(`Praeferenzen konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as OpsBenachrichtigungsPraeferenz[]
}

export async function upsertPraeferenz(
  supabase: SupabaseClient,
  params: {
    organizationId: string
    benutzerId: string
    kategorie: BenachrichtigungKategorie
    inApp?: boolean
    email?: boolean
    push?: boolean
    aktiv?: boolean
  },
): Promise<OpsBenachrichtigungsPraeferenz> {
  const { data, error } = await supabase
    .from('ops_benachrichtigungs_praeferenzen')
    .upsert(
      {
        organization_id: params.organizationId,
        benutzer_id: params.benutzerId,
        kategorie: params.kategorie,
        in_app: params.inApp ?? true,
        email: params.email ?? false,
        push: params.push ?? false,
        aktiv: params.aktiv ?? true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id,benutzer_id,kategorie' },
    )
    .select('*')
    .single()
  if (error || !data) throw new Error(`Praeferenz konnte nicht gespeichert werden: ${error?.message ?? 'unbekannt'}`)
  return data as OpsBenachrichtigungsPraeferenz
}
