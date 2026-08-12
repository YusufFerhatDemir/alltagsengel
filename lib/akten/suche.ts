// ═══════════════════════════════════════════════════════════════
// Globale Dokumentensuche — Kunde/Mitarbeiter/Typ/Status/Zeitraum/Tags
// ═══════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AktenDokument, DokumentKategorie, DokumentStatus, DokumentTyp } from './types'

export interface AktenSucheParams {
  organizationId: string
  suchtext?: string
  clientId?: string
  caregiverId?: string
  dokumentTyp?: DokumentTyp
  kategorie?: DokumentKategorie
  status?: DokumentStatus
  tags?: string[]
  von?: string
  bis?: string
  limit?: number
}

export interface AktenSucheTreffer extends AktenDokument {
  client_name?: string | null
  caregiver_name?: string | null
}

export async function sucheDokumente(supabase: SupabaseClient, params: AktenSucheParams): Promise<AktenSucheTreffer[]> {
  let query = supabase
    .from('akten_dokumente')
    .select('*, clients(first_name, last_name), caregivers(first_name, last_name)')
    .eq('organization_id', params.organizationId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(params.limit ?? 100)

  if (params.clientId) query = query.eq('client_id', params.clientId)
  if (params.caregiverId) query = query.eq('caregiver_id', params.caregiverId)
  if (params.dokumentTyp) query = query.eq('dokument_typ', params.dokumentTyp)
  if (params.kategorie) query = query.eq('kategorie', params.kategorie)
  if (params.status) query = query.eq('status', params.status)
  if (params.tags && params.tags.length > 0) query = query.contains('tags', params.tags)
  if (params.von) query = query.gte('created_at', params.von)
  if (params.bis) query = query.lte('created_at', params.bis)
  if (params.suchtext) {
    const q = params.suchtext.replace(/[%,]/g, '')
    query = query.or(`titel.ilike.%${q}%,dateiname.ilike.%${q}%,interne_bemerkung.ilike.%${q}%`)
  }

  const { data, error } = await query
  if (error) throw new Error(`Suche fehlgeschlagen: ${error.message}`)

  return (data ?? []).map((row: any) => ({
    ...row,
    client_name: row.clients ? `${row.clients.first_name} ${row.clients.last_name}` : null,
    caregiver_name: row.caregivers ? `${row.caregivers.first_name} ${row.caregivers.last_name}` : null,
    clients: undefined,
    caregivers: undefined,
  })) as AktenSucheTreffer[]
}
