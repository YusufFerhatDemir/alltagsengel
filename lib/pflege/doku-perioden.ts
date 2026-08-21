import { UserFacingError } from '@/lib/api/user-facing-error'
// ═══════════════════════════════════════════════════════════════
// Monatsabschlüsse der Pflegedokumentation — pflege_doku_perioden
// Abschließen setzt pflege_verlauf.gesperrt für den Monat auf true,
// Wiedereröffnen nimmt die Sperre zurück.
// ═══════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import type { PeriodenStatus, PflegeDokuPeriode } from './types'

export function validateJahrMonat(jahr: number, monat: number): void {
  if (!Number.isInteger(jahr) || jahr < 2020 || jahr > 2099) {
    throw new UserFacingError('Jahr muss zwischen 2020 und 2099 liegen.')
  }
  if (!Number.isInteger(monat) || monat < 1 || monat > 12) {
    throw new UserFacingError('Monat muss zwischen 1 und 12 liegen.')
  }
}

/** ISO-Zeitgrenzen eines Monats — [von, bis) für die Verlaufs-Sperre. */
export function monatsGrenzen(jahr: number, monat: number): { von: string; bis: string } {
  validateJahrMonat(jahr, monat)
  const von = new Date(Date.UTC(jahr, monat - 1, 1)).toISOString()
  const bis = new Date(Date.UTC(monat === 12 ? jahr + 1 : jahr, monat === 12 ? 0 : monat, 1)).toISOString()
  return { von, bis }
}

export interface CreatePeriodeParams {
  organizationId: string
  clientId: string
  jahr: number
  monat: number
}

export async function createPeriode(supabase: SupabaseClient, params: CreatePeriodeParams): Promise<PflegeDokuPeriode> {
  validateJahrMonat(params.jahr, params.monat)

  const { data, error } = await supabase
    .from('pflege_doku_perioden')
    .insert({
      organization_id: params.organizationId,
      client_id: params.clientId,
      jahr: params.jahr,
      monat: params.monat,
    })
    .select('*')
    .single()
  if (error || !data) {
    if (error?.code === '23505') throw new UserFacingError('Für diesen Kunden und Monat existiert bereits eine Periode.')
    throw new Error(`Periode konnte nicht angelegt werden: ${error?.message ?? 'unbekannt'}`)
  }
  return data as PflegeDokuPeriode
}

export interface ListPeriodenFilter {
  organizationId: string
  clientId?: string
  jahr?: number
  status?: PeriodenStatus
}

export async function listPerioden(supabase: SupabaseClient, filter: ListPeriodenFilter): Promise<PflegeDokuPeriode[]> {
  let query = supabase
    .from('pflege_doku_perioden')
    .select('*')
    .eq('organization_id', filter.organizationId)
    .order('jahr', { ascending: false })
    .order('monat', { ascending: false })

  if (filter.clientId) query = query.eq('client_id', filter.clientId)
  if (filter.jahr) query = query.eq('jahr', filter.jahr)
  if (filter.status) query = query.eq('status', filter.status)

  const { data, error } = await query
  if (error) throw new Error(`Perioden konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as PflegeDokuPeriode[]
}

export async function getPeriode(supabase: SupabaseClient, id: string, organizationId: string): Promise<PflegeDokuPeriode | null> {
  const { data, error } = await supabase
    .from('pflege_doku_perioden')
    .select('*')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (error) throw new Error(`Periode konnte nicht geladen werden: ${error.message}`)
  return data as PflegeDokuPeriode | null
}

/**
 * Setzt pflege_verlauf.gesperrt für alle Einträge eines Kunden im Monat.
 * Beim Sperren greift trg_locked_verlauf nicht, weil gesperrt vorher false ist;
 * beim Entsperren ebensowenig, weil NEW.gesperrt false wird.
 */
export async function setzeVerlaufSperre(
  supabase: SupabaseClient,
  params: { organizationId: string; clientId: string; jahr: number; monat: number; gesperrt: boolean; actorId: string }
): Promise<number> {
  const { von, bis } = monatsGrenzen(params.jahr, params.monat)

  const { data, error } = await supabase
    .from('pflege_verlauf')
    .update(params.gesperrt
      ? { gesperrt: true, gesperrt_am: new Date().toISOString(), gesperrt_von: params.actorId }
      : { gesperrt: false, gesperrt_am: null, gesperrt_von: null })
    .eq('organization_id', params.organizationId)
    .eq('client_id', params.clientId)
    .eq('gesperrt', !params.gesperrt)
    .gte('eintrag_datum', von)
    .lt('eintrag_datum', bis)
    .select('id')
  if (error) throw new Error(`Verlaufssperre konnte nicht gesetzt werden: ${error.message}`)
  return (data ?? []).length
}

export interface AbschliessenParams {
  actorId: string
  freigabeBemerkung?: string | null
}

export async function abschliessenPeriode(
  supabase: SupabaseClient,
  id: string,
  organizationId: string,
  params: AbschliessenParams
): Promise<{ periode: PflegeDokuPeriode; gesperrteEintraege: number }> {
  const existing = await getPeriode(supabase, id, organizationId)
  if (!existing) throw new UserFacingError('Periode nicht gefunden.')
  if (existing.status === 'abgeschlossen') throw new UserFacingError('Periode ist bereits abgeschlossen.')

  const gesperrteEintraege = await setzeVerlaufSperre(supabase, {
    organizationId,
    clientId: existing.client_id,
    jahr: existing.jahr,
    monat: existing.monat,
    gesperrt: true,
    actorId: params.actorId,
  })

  const { data, error } = await supabase
    .from('pflege_doku_perioden')
    .update({
      status: 'abgeschlossen',
      abgeschlossen_am: new Date().toISOString(),
      abgeschlossen_von: params.actorId,
      freigabe_bemerkung: params.freigabeBemerkung ?? null,
    })
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select('*')
    .single()
  if (error || !data) throw new Error(`Periode konnte nicht abgeschlossen werden: ${error?.message ?? 'unbekannt'}`)

  return { periode: data as PflegeDokuPeriode, gesperrteEintraege }
}

export interface WiedereroeffnenParams {
  actorId: string
  grund: string
}

export async function wiedereroeffnenPeriode(
  supabase: SupabaseClient,
  id: string,
  organizationId: string,
  params: WiedereroeffnenParams
): Promise<{ periode: PflegeDokuPeriode; entsperrteEintraege: number }> {
  if (!params.grund?.trim()) throw new UserFacingError('Ein Grund für die Wiedereröffnung ist erforderlich.')

  const existing = await getPeriode(supabase, id, organizationId)
  if (!existing) throw new UserFacingError('Periode nicht gefunden.')
  if (existing.status !== 'abgeschlossen') throw new UserFacingError('Nur abgeschlossene Perioden können wiedereröffnet werden.')

  const entsperrteEintraege = await setzeVerlaufSperre(supabase, {
    organizationId,
    clientId: existing.client_id,
    jahr: existing.jahr,
    monat: existing.monat,
    gesperrt: false,
    actorId: params.actorId,
  })

  const { data, error } = await supabase
    .from('pflege_doku_perioden')
    .update({
      status: 'wiedereroeffnet',
      wiedereroeffnet_am: new Date().toISOString(),
      wiedereroeffnet_von: params.actorId,
      wiedereroeffnung_grund: params.grund.trim(),
    })
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select('*')
    .single()
  if (error || !data) throw new Error(`Periode konnte nicht wiedereröffnet werden: ${error?.message ?? 'unbekannt'}`)

  return { periode: data as PflegeDokuPeriode, entsperrteEintraege }
}
