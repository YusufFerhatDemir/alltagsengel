import type { SupabaseClient } from '@supabase/supabase-js'
import type { OpsNachricht, OpsNachrichtEmpfaenger, OpsPosteingang, ListPosteingangFilter } from './types'

export async function listPosteingang(
  supabase: SupabaseClient,
  filter: ListPosteingangFilter,
): Promise<OpsPosteingang[]> {
  const { data, error } = await supabase
    .from('ops_posteingang')
    .select('*')
    .eq('empfaenger_id', filter.empfaengerId)
    .eq('organization_id', filter.organizationId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Posteingang konnte nicht geladen werden: ${error.message}`)
  return (data ?? []) as OpsPosteingang[]
}

export async function getNachricht(
  supabase: SupabaseClient,
  params: { organizationId: string; id: string; userId?: string },
): Promise<{ nachricht: OpsNachricht; empfaenger: OpsNachrichtEmpfaenger[] } | null> {
  const { data: nachricht, error: nErr } = await supabase
    .from('ops_nachrichten')
    .select('*')
    .eq('organization_id', params.organizationId)
    .eq('id', params.id)
    .maybeSingle()
  if (nErr) throw new Error(`Nachricht konnte nicht geladen werden: ${nErr.message}`)
  if (!nachricht) return null

  const { data: empfaenger, error: eErr } = await supabase
    .from('ops_nachrichten_empfaenger')
    .select('*')
    .eq('organization_id', params.organizationId)
    .eq('nachricht_id', params.id)
  if (eErr) throw new Error(`Nachricht-Empfaenger konnten nicht geladen werden: ${eErr.message}`)

  if (params.userId) {
    const isSender = (nachricht as any).absender_id === params.userId
    const isRecipient = (empfaenger ?? []).some((e: any) => e.empfaenger_id === params.userId)
    if (!isSender && !isRecipient) return null
  }

  return { nachricht: nachricht as OpsNachricht, empfaenger: (empfaenger ?? []) as OpsNachrichtEmpfaenger[] }
}

export async function createNachricht(
  supabase: SupabaseClient,
  params: {
    organizationId: string
    data: Omit<OpsNachricht, 'id' | 'organization_id' | 'created_at' | 'eltern_id'>
    empfaengerIds: string[]
  },
): Promise<OpsNachricht> {
  const { data: nachricht, error: nErr } = await supabase
    .from('ops_nachrichten')
    .insert({ ...params.data, organization_id: params.organizationId })
    .select('*')
    .single()
  if (nErr || !nachricht) throw new Error(`Nachricht konnte nicht erstellt werden: ${nErr?.message ?? 'unbekannt'}`)

  if (params.empfaengerIds.length > 0) {
    const empfaengerRows = params.empfaengerIds.map((empfaengerId) => ({
      organization_id: params.organizationId,
      nachricht_id: nachricht.id,
      empfaenger_id: empfaengerId,
    }))
    const { error: eErr } = await supabase.from('ops_nachrichten_empfaenger').insert(empfaengerRows)
    if (eErr) throw new Error(`Nachricht-Empfaenger konnten nicht erstellt werden: ${eErr.message}`)
  }

  return nachricht as OpsNachricht
}

export async function createAntwort(
  supabase: SupabaseClient,
  params: {
    organizationId: string
    elternId: string
    data: Omit<OpsNachricht, 'id' | 'organization_id' | 'created_at' | 'eltern_id'>
    empfaengerIds: string[]
  },
): Promise<OpsNachricht> {
  const { data: parent, error: pErr } = await supabase
    .from('ops_nachrichten')
    .select('id')
    .eq('id', params.elternId)
    .eq('organization_id', params.organizationId)
    .maybeSingle()
  if (pErr || !parent) throw new Error('Eltern-Nachricht nicht gefunden oder gehoert nicht zur Organisation.')

  const { data: nachricht, error: nErr } = await supabase
    .from('ops_nachrichten')
    .insert({ ...params.data, organization_id: params.organizationId, eltern_id: params.elternId })
    .select('*')
    .single()
  if (nErr || !nachricht) throw new Error(`Antwort konnte nicht erstellt werden: ${nErr?.message ?? 'unbekannt'}`)

  if (params.empfaengerIds.length > 0) {
    const empfaengerRows = params.empfaengerIds.map((empfaengerId) => ({
      organization_id: params.organizationId,
      nachricht_id: nachricht.id,
      empfaenger_id: empfaengerId,
    }))
    const { error: eErr } = await supabase.from('ops_nachrichten_empfaenger').insert(empfaengerRows)
    if (eErr) throw new Error(`Antwort-Empfaenger konnten nicht erstellt werden: ${eErr.message}`)
  }

  return nachricht as OpsNachricht
}

export async function markGelesen(
  supabase: SupabaseClient,
  params: { organizationId: string; nachrichtId: string; empfaengerId: string },
): Promise<void> {
  const { error } = await supabase
    .from('ops_nachrichten_empfaenger')
    .update({ gelesen: true, gelesen_am: new Date().toISOString() })
    .eq('organization_id', params.organizationId)
    .eq('nachricht_id', params.nachrichtId)
    .eq('empfaenger_id', params.empfaengerId)
  if (error) throw new Error(`Nachricht konnte nicht als gelesen markiert werden: ${error.message}`)
}
