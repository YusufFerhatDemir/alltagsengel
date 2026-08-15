import type { SupabaseClient } from '@supabase/supabase-js'
import type { OpsAktivitaetslog, AktivitaetEntitaetTyp, AktivitaetAktion, ListAktivitaetslogFilter } from './types'

export async function listAktivitaetslog(
  supabase: SupabaseClient,
  filter: ListAktivitaetslogFilter,
): Promise<OpsAktivitaetslog[]> {
  let query = supabase
    .from('ops_aktivitaetslog')
    .select('*')
    .eq('organization_id', filter.organizationId)
    .order('erstellt_am', { ascending: false })

  if (filter.entitaetTyp) query = query.eq('entitaet_typ', filter.entitaetTyp)
  if (filter.entitaetId) query = query.eq('entitaet_id', filter.entitaetId)
  if (filter.limit) query = query.limit(filter.limit)
  if (filter.offset) query = query.range(filter.offset, filter.offset + (filter.limit ?? 50) - 1)

  const { data, error } = await query
  if (error) throw new Error(`Aktivitaetslog konnte nicht geladen werden: ${error.message}`)
  return (data ?? []) as OpsAktivitaetslog[]
}

export async function logAktivitaet(
  supabase: SupabaseClient,
  params: {
    organizationId: string
    entitaetTyp: AktivitaetEntitaetTyp
    entitaetId: string
    aktion: AktivitaetAktion
    vorher?: object | null
    nachher?: object | null
    akteurId?: string | null
    ipAdresse?: string | null
  },
): Promise<OpsAktivitaetslog> {
  const { data, error } = await supabase
    .from('ops_aktivitaetslog')
    .insert({
      organization_id: params.organizationId,
      entitaet_typ: params.entitaetTyp,
      entitaet_id: params.entitaetId,
      aktion: params.aktion,
      vorher: params.vorher ?? null,
      nachher: params.nachher ?? null,
      akteur_id: params.akteurId ?? null,
      ip_adresse: params.ipAdresse ?? null,
    })
    .select('*')
    .single()
  if (error || !data) throw new Error(`Aktivitaet konnte nicht protokolliert werden: ${error?.message ?? 'unbekannt'}`)
  return data as OpsAktivitaetslog
}
