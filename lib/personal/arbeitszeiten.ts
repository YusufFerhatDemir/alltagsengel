import type { SupabaseClient } from '@supabase/supabase-js'
import {
  assertErlaubt, assertPlausibleZeiten,
  ARBEITSZEIT_QUELLE_WERTE, ARBEITSZEIT_STATUS_WERTE,
  type PersonalArbeitszeit, type ArbeitszeitKonto,
  type ArbeitszeitQuelle, type ArbeitszeitStatus,
} from './types'

export interface CreateArbeitszeitParams {
  organizationId: string
  caregiverId: string
  datum: string
  startZeit: string
  endZeit: string
  pauseMinuten?: number
  istMinuten: number
  sollMinuten?: number | null
  dienstplanEintragId?: string | null
  serviceRecordId?: string | null
  quelle?: ArbeitszeitQuelle
  bemerkung?: string | null
}

export async function createArbeitszeit(supabase: SupabaseClient, params: CreateArbeitszeitParams): Promise<PersonalArbeitszeit> {
  assertErlaubt(params.quelle, ARBEITSZEIT_QUELLE_WERTE, 'quelle')
  assertPlausibleZeiten({ istMinuten: params.istMinuten, pauseMinuten: params.pauseMinuten })

  const { data, error } = await supabase
    .from('personal_arbeitszeiten')
    .insert({
      organization_id: params.organizationId,
      caregiver_id: params.caregiverId,
      datum: params.datum,
      start_zeit: params.startZeit,
      end_zeit: params.endZeit,
      pause_minuten: params.pauseMinuten ?? 0,
      ist_minuten: params.istMinuten,
      soll_minuten: params.sollMinuten ?? null,
      dienstplan_eintrag_id: params.dienstplanEintragId ?? null,
      service_record_id: params.serviceRecordId ?? null,
      quelle: params.quelle ?? 'manuell',
      bemerkung: params.bemerkung ?? null,
    })
    .select('*')
    .single()
  if (error || !data) throw new Error(`Arbeitszeit konnte nicht angelegt werden: ${error?.message ?? 'unbekannt'}`)
  return data as PersonalArbeitszeit
}

export interface ListArbeitszeitenFilter {
  organizationId: string
  caregiverId?: string
  datumVon?: string
  datumBis?: string
  status?: ArbeitszeitStatus
  nurGesperrt?: boolean
}

export async function listArbeitszeiten(supabase: SupabaseClient, filter: ListArbeitszeitenFilter): Promise<PersonalArbeitszeit[]> {
  let query = supabase
    .from('personal_arbeitszeiten')
    .select('*')
    .eq('organization_id', filter.organizationId)
    .order('datum', { ascending: false })
    .order('start_zeit', { ascending: true })

  if (filter.caregiverId) query = query.eq('caregiver_id', filter.caregiverId)
  if (filter.datumVon) query = query.gte('datum', filter.datumVon)
  if (filter.datumBis) query = query.lte('datum', filter.datumBis)
  if (filter.status) query = query.eq('status', filter.status)
  if (filter.nurGesperrt) query = query.eq('gesperrt', true)

  const { data, error } = await query
  if (error) throw new Error(`Arbeitszeiten konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as PersonalArbeitszeit[]
}

export interface UpdateArbeitszeitParams {
  startZeit?: string
  endZeit?: string
  pauseMinuten?: number
  istMinuten?: number
  sollMinuten?: number | null
  status?: ArbeitszeitStatus
  bestaetigtVon?: string | null
  bestaetigtAm?: string | null
  gesperrt?: boolean
  bemerkung?: string | null
}

export async function updateArbeitszeit(
  supabase: SupabaseClient,
  id: string,
  organizationId: string,
  patch: UpdateArbeitszeitParams,
): Promise<PersonalArbeitszeit> {
  assertErlaubt(patch.status, ARBEITSZEIT_STATUS_WERTE, 'status')
  assertPlausibleZeiten({ istMinuten: patch.istMinuten, pauseMinuten: patch.pauseMinuten })

  const update: Record<string, unknown> = {}
  if (patch.startZeit !== undefined) update.start_zeit = patch.startZeit
  if (patch.endZeit !== undefined) update.end_zeit = patch.endZeit
  if (patch.pauseMinuten !== undefined) update.pause_minuten = patch.pauseMinuten
  if (patch.istMinuten !== undefined) update.ist_minuten = patch.istMinuten
  if (patch.sollMinuten !== undefined) update.soll_minuten = patch.sollMinuten
  if (patch.status !== undefined) update.status = patch.status
  if (patch.bestaetigtVon !== undefined) update.bestaetigt_von = patch.bestaetigtVon
  if (patch.bestaetigtAm !== undefined) update.bestaetigt_am = patch.bestaetigtAm
  if (patch.gesperrt !== undefined) update.gesperrt = patch.gesperrt
  if (patch.bemerkung !== undefined) update.bemerkung = patch.bemerkung

  if (Object.keys(update).length === 0) throw new Error('Keine Änderungen übergeben.')

  const { data, error } = await supabase
    .from('personal_arbeitszeiten')
    .update(update)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select('*')
    .single()
  if (error || !data) {
    const msg = error?.message ?? 'unbekannt'
    if (msg.includes('Gesperrte Arbeitszeit')) throw new Error('Gesperrte Arbeitszeit kann nicht bearbeitet werden.')
    throw new Error(`Arbeitszeit konnte nicht aktualisiert werden: ${msg}`)
  }
  return data as PersonalArbeitszeit
}

export async function listArbeitszeitKonto(
  supabase: SupabaseClient,
  organizationId: string,
  caregiverId?: string,
  jahr?: number,
  monat?: number,
): Promise<ArbeitszeitKonto[]> {
  let query = supabase
    .from('personal_arbeitszeitkonto')
    .select('*')
    .eq('organization_id', organizationId)
    .order('jahr', { ascending: false })
    .order('monat', { ascending: false })

  if (caregiverId) query = query.eq('caregiver_id', caregiverId)
  if (jahr) query = query.eq('jahr', jahr)
  if (monat) query = query.eq('monat', monat)

  const { data, error } = await query
  if (error) throw new Error(`Arbeitszeitkonto konnte nicht geladen werden: ${error.message}`)
  return (data ?? []) as ArbeitszeitKonto[]
}
