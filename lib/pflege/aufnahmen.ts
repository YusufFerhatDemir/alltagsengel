// ═══════════════════════════════════════════════════════════════
// Kundenaufnahme — pflege_aufnahmen
// CRUD + Statusmaschine. Beim Abschluss werden die Aufnahme-Felder
// auf clients gespiegelt (aufnahmedatum/aufgenommen_von/aufnahmestatus).
// ═══════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { heuteBerlin } from '@/lib/utils/timezone'
import {
  assertErlaubt,
  AUFNAHME_ORT_WERTE,
  AUFNAHME_STATUS_WERTE,
  DRINGLICHKEIT_WERTE,
  type AufnahmeOrt,
  type AufnahmeStatus,
  type Dringlichkeit,
  type PflegeAufnahme,
} from './types'

// Erlaubte Status-Übergänge (analog lib/akten/vertraege.ts)
const ERLAUBTE_UEBERGAENGE: Record<AufnahmeStatus, AufnahmeStatus[]> = {
  entwurf: ['in_bearbeitung', 'abgeschlossen', 'storniert'],
  in_bearbeitung: ['abgeschlossen', 'entwurf', 'storniert'],
  abgeschlossen: [],
  storniert: [],
}

export function validateAufnahmeUebergang(von: AufnahmeStatus, nach: AufnahmeStatus): void {
  if (von === nach) return
  if (!ERLAUBTE_UEBERGAENGE[von]?.includes(nach)) {
    throw new Error(`Statuswechsel von "${von}" zu "${nach}" ist nicht erlaubt.`)
  }
}

export interface CreateAufnahmeParams {
  organizationId: string
  clientId: string
  aufnahmedatum?: string
  aufgenommenVon: string
  aufnahmeOrt?: AufnahmeOrt
  pflegegradBeiAufnahme?: number | null
  vorherigeVersorgung?: string | null
  grundDerAnfrage?: string | null
  dringlichkeit?: Dringlichkeit
  wohnsituationDetails?: string | null
  stockwerk?: string | null
  aufzugVorhanden?: boolean | null
  barrierefrei?: boolean | null
  schluesselregelung?: string | null
  betreuungsbedarf?: string | null
  gewuenschteZeiten?: string | null
  gewuenschteHaeufigkeit?: string | null
  besondereAnforderungen?: string | null
  erstelltVon: string
}

export async function createAufnahme(supabase: SupabaseClient, params: CreateAufnahmeParams): Promise<PflegeAufnahme> {
  assertErlaubt(params.aufnahmeOrt, AUFNAHME_ORT_WERTE, 'aufnahme_ort')
  assertErlaubt(params.dringlichkeit, DRINGLICHKEIT_WERTE, 'dringlichkeit')
  if (params.pflegegradBeiAufnahme != null && (params.pflegegradBeiAufnahme < 0 || params.pflegegradBeiAufnahme > 5)) {
    throw new Error('Pflegegrad muss zwischen 0 und 5 liegen.')
  }

  const { data, error } = await supabase
    .from('pflege_aufnahmen')
    .insert({
      organization_id: params.organizationId,
      client_id: params.clientId,
      aufnahmedatum: params.aufnahmedatum ?? heuteBerlin(),
      aufgenommen_von: params.aufgenommenVon,
      aufnahme_ort: params.aufnahmeOrt ?? 'wohnung',
      pflegegrad_bei_aufnahme: params.pflegegradBeiAufnahme ?? null,
      vorherige_versorgung: params.vorherigeVersorgung ?? null,
      grund_der_anfrage: params.grundDerAnfrage ?? null,
      dringlichkeit: params.dringlichkeit ?? 'normal',
      wohnsituation_details: params.wohnsituationDetails ?? null,
      stockwerk: params.stockwerk ?? null,
      aufzug_vorhanden: params.aufzugVorhanden ?? null,
      barrierefrei: params.barrierefrei ?? null,
      schluesselregelung: params.schluesselregelung ?? null,
      betreuungsbedarf: params.betreuungsbedarf ?? null,
      gewuenschte_zeiten: params.gewuenschteZeiten ?? null,
      gewuenschte_haeufigkeit: params.gewuenschteHaeufigkeit ?? null,
      besondere_anforderungen: params.besondereAnforderungen ?? null,
      erstellt_von: params.erstelltVon,
    })
    .select('*')
    .single()
  if (error || !data) throw new Error(`Aufnahme konnte nicht angelegt werden: ${error?.message ?? 'unbekannt'}`)
  return data as PflegeAufnahme
}

export interface ListAufnahmenFilter {
  organizationId: string
  clientId?: string
  status?: AufnahmeStatus
  dringlichkeit?: Dringlichkeit
}

export async function listAufnahmen(supabase: SupabaseClient, filter: ListAufnahmenFilter): Promise<PflegeAufnahme[]> {
  let query = supabase
    .from('pflege_aufnahmen')
    .select('*')
    .eq('organization_id', filter.organizationId)
    .order('aufnahmedatum', { ascending: false })

  if (filter.clientId) query = query.eq('client_id', filter.clientId)
  if (filter.status) query = query.eq('status', filter.status)
  if (filter.dringlichkeit) query = query.eq('dringlichkeit', filter.dringlichkeit)

  const { data, error } = await query
  if (error) throw new Error(`Aufnahmen konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as PflegeAufnahme[]
}

export async function getAufnahme(supabase: SupabaseClient, id: string, organizationId: string): Promise<PflegeAufnahme | null> {
  const { data, error } = await supabase
    .from('pflege_aufnahmen')
    .select('*')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (error) throw new Error(`Aufnahme konnte nicht geladen werden: ${error.message}`)
  return data as PflegeAufnahme | null
}

export interface UpdateAufnahmeParams {
  status?: AufnahmeStatus
  aufnahmedatum?: string
  aufnahmeOrt?: AufnahmeOrt
  pflegegradBeiAufnahme?: number | null
  vorherigeVersorgung?: string | null
  grundDerAnfrage?: string | null
  dringlichkeit?: Dringlichkeit
  wohnsituationDetails?: string | null
  stockwerk?: string | null
  aufzugVorhanden?: boolean | null
  barrierefrei?: boolean | null
  schluesselregelung?: string | null
  betreuungsbedarf?: string | null
  gewuenschteZeiten?: string | null
  gewuenschteHaeufigkeit?: string | null
  besondereAnforderungen?: string | null
  empfehlung?: string | null
  abschlussBemerkung?: string | null
}

export async function updateAufnahme(
  supabase: SupabaseClient,
  id: string,
  organizationId: string,
  patch: UpdateAufnahmeParams,
  actorId: string
): Promise<PflegeAufnahme> {
  const existing = await getAufnahme(supabase, id, organizationId)
  if (!existing) throw new Error('Aufnahme nicht gefunden.')
  if (existing.status === 'abgeschlossen' || existing.status === 'storniert') {
    throw new Error(`Aufnahme im Status "${existing.status}" kann nicht mehr bearbeitet werden.`)
  }

  assertErlaubt(patch.status, AUFNAHME_STATUS_WERTE, 'status')
  assertErlaubt(patch.aufnahmeOrt, AUFNAHME_ORT_WERTE, 'aufnahme_ort')
  assertErlaubt(patch.dringlichkeit, DRINGLICHKEIT_WERTE, 'dringlichkeit')
  if (patch.status) validateAufnahmeUebergang(existing.status, patch.status)

  const update: Record<string, unknown> = {}
  if (patch.status !== undefined) update.status = patch.status
  if (patch.aufnahmedatum !== undefined) update.aufnahmedatum = patch.aufnahmedatum
  if (patch.aufnahmeOrt !== undefined) update.aufnahme_ort = patch.aufnahmeOrt
  if (patch.pflegegradBeiAufnahme !== undefined) update.pflegegrad_bei_aufnahme = patch.pflegegradBeiAufnahme
  if (patch.vorherigeVersorgung !== undefined) update.vorherige_versorgung = patch.vorherigeVersorgung
  if (patch.grundDerAnfrage !== undefined) update.grund_der_anfrage = patch.grundDerAnfrage
  if (patch.dringlichkeit !== undefined) update.dringlichkeit = patch.dringlichkeit
  if (patch.wohnsituationDetails !== undefined) update.wohnsituation_details = patch.wohnsituationDetails
  if (patch.stockwerk !== undefined) update.stockwerk = patch.stockwerk
  if (patch.aufzugVorhanden !== undefined) update.aufzug_vorhanden = patch.aufzugVorhanden
  if (patch.barrierefrei !== undefined) update.barrierefrei = patch.barrierefrei
  if (patch.schluesselregelung !== undefined) update.schluesselregelung = patch.schluesselregelung
  if (patch.betreuungsbedarf !== undefined) update.betreuungsbedarf = patch.betreuungsbedarf
  if (patch.gewuenschteZeiten !== undefined) update.gewuenschte_zeiten = patch.gewuenschteZeiten
  if (patch.gewuenschteHaeufigkeit !== undefined) update.gewuenschte_haeufigkeit = patch.gewuenschteHaeufigkeit
  if (patch.besondereAnforderungen !== undefined) update.besondere_anforderungen = patch.besondereAnforderungen
  if (patch.empfehlung !== undefined) update.empfehlung = patch.empfehlung
  if (patch.abschlussBemerkung !== undefined) update.abschluss_bemerkung = patch.abschlussBemerkung

  // Abschluss protokollieren
  if (patch.status === 'abgeschlossen') {
    update.abgeschlossen_am = new Date().toISOString()
    update.abgeschlossen_von = actorId
  }

  const { data, error } = await supabase
    .from('pflege_aufnahmen')
    .update(update)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select('*')
    .single()
  if (error || !data) throw new Error(`Aufnahme konnte nicht aktualisiert werden: ${error?.message ?? 'unbekannt'}`)

  if (patch.status === 'abgeschlossen') {
    await spiegeleAufnahmeAufClient(supabase, data as PflegeAufnahme, organizationId)
  }

  return data as PflegeAufnahme
}

/**
 * Überträgt die Aufnahme-Kerndaten in die clients-Stammdaten, sobald die
 * Aufnahme abgeschlossen ist — damit Übersicht und Kundenakte denselben
 * Stand zeigen (clients.aufnahmestatus = 'vollstaendig').
 */
export async function spiegeleAufnahmeAufClient(
  supabase: SupabaseClient,
  aufnahme: PflegeAufnahme,
  organizationId: string
): Promise<void> {
  const { error } = await supabase
    .from('clients')
    .update({
      aufnahmedatum: aufnahme.aufnahmedatum,
      aufgenommen_von: aufnahme.aufgenommen_von,
      aufnahmestatus: 'vollstaendig',
      betreuungsbedarf_beschreibung: aufnahme.betreuungsbedarf,
    })
    .eq('id', aufnahme.client_id)
    .eq('organization_id', organizationId)
  if (error) throw new Error(`Stammdaten konnten nicht aktualisiert werden: ${error.message}`)
}
