// ═══════════════════════════════════════════════════════════════
// Verlaufsdokumentation — pflege_verlauf
// CRUD, Sichtbarkeits-Validierung und Sperr-Logik. Ein gesperrter
// Eintrag stammt aus einer abgeschlossenen Dokumentationsperiode und
// ist unveränderlich (trg_locked_verlauf erzwingt dasselbe in der DB).
// ═══════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  assertErlaubt,
  VERLAUF_KATEGORIE_WERTE,
  VERLAUF_SICHTBARKEIT_WERTE,
  VERLAUF_TYP_WERTE,
  type PflegeVerlaufEintrag,
  type VerlaufKategorie,
  type VerlaufSichtbarkeit,
  type VerlaufTyp,
} from './types'

/** Eintragstypen, die immer als dringend gelten und nie nur „intern" bleiben sollen. */
export const KRITISCHE_TYPEN: VerlaufTyp[] = ['sturz', 'notfall']

/** Welche Sichtbarkeitsstufen darf eine Rolle beim Anlegen setzen? */
export function erlaubteSichtbarkeiten(rolle: string): VerlaufSichtbarkeit[] {
  if (['admin', 'superadmin'].includes(rolle)) return [...VERLAUF_SICHTBARKEIT_WERTE]
  // Engel dokumentieren fürs Team; die Freigabe an den Kunden ist eine
  // bewusste Admin-Entscheidung und läuft über die Nachbearbeitung.
  return ['intern', 'engel']
}

export function validateSichtbarkeit(sichtbarkeit: VerlaufSichtbarkeit | undefined, rolle: string): void {
  if (!sichtbarkeit) return
  assertErlaubt(sichtbarkeit, VERLAUF_SICHTBARKEIT_WERTE, 'sichtbarkeit')
  const erlaubt = erlaubteSichtbarkeiten(rolle)
  if (!erlaubt.includes(sichtbarkeit)) {
    throw new Error(`Sichtbarkeit "${sichtbarkeit}" darf mit der Rolle "${rolle}" nicht gesetzt werden.`)
  }
}

export interface CreateVerlaufParams {
  /**
   * Weglassen, wenn mit einem user-scoped Client geschrieben wird (Engel):
   * dann füllt der Spalten-Default current_org_id() die Organisation, und RLS
   * (engel_pflege_verlauf_insert) entscheidet über die Berechtigung.
   */
  organizationId?: string
  clientId: string
  eintragDatum?: string
  eintragTyp?: VerlaufTyp
  kategorie?: VerlaufKategorie
  titel?: string | null
  inhalt: string
  istDringend?: boolean
  serviceRecordId?: string | null
  massnahmeId?: string | null
  anamneseId?: string | null
  autorId: string
  autorName: string
  autorRolle: string
  sichtbarkeit?: VerlaufSichtbarkeit
}

export async function createVerlauf(supabase: SupabaseClient, params: CreateVerlaufParams): Promise<PflegeVerlaufEintrag> {
  if (!params.inhalt?.trim()) throw new Error('Inhalt ist ein Pflichtfeld.')
  assertErlaubt(params.eintragTyp, VERLAUF_TYP_WERTE, 'eintrag_typ')
  assertErlaubt(params.kategorie, VERLAUF_KATEGORIE_WERTE, 'kategorie')
  validateSichtbarkeit(params.sichtbarkeit, params.autorRolle)

  const typ = params.eintragTyp ?? 'verlauf'
  // Sturz und Notfall sind per Definition dringend — unabhängig vom Flag im Formular.
  const dringend = params.istDringend ?? false

  const { data, error } = await supabase
    .from('pflege_verlauf')
    .insert({
      ...(params.organizationId ? { organization_id: params.organizationId } : {}),
      client_id: params.clientId,
      eintrag_datum: params.eintragDatum ?? new Date().toISOString(),
      eintrag_typ: typ,
      kategorie: params.kategorie ?? 'allgemein',
      titel: params.titel ?? null,
      inhalt: params.inhalt.trim(),
      ist_dringend: KRITISCHE_TYPEN.includes(typ) ? true : dringend,
      service_record_id: params.serviceRecordId ?? null,
      massnahme_id: params.massnahmeId ?? null,
      anamnese_id: params.anamneseId ?? null,
      autor_id: params.autorId,
      autor_name: params.autorName,
      autor_rolle: params.autorRolle,
      sichtbarkeit: params.sichtbarkeit ?? 'intern',
    })
    .select('*')
    .single()
  if (error || !data) throw new Error(`Verlaufseintrag konnte nicht angelegt werden: ${error?.message ?? 'unbekannt'}`)
  return data as PflegeVerlaufEintrag
}

export interface ListVerlaufFilter {
  /** Weglassen bei user-scoped Clients — dann grenzt RLS die Sicht ein. */
  organizationId?: string
  clientId?: string
  eintragTyp?: VerlaufTyp
  kategorie?: VerlaufKategorie
  sichtbarkeit?: VerlaufSichtbarkeit
  vonDatum?: string
  bisDatum?: string
  nurDringende?: boolean
  limit?: number
}

export async function listVerlauf(supabase: SupabaseClient, filter: ListVerlaufFilter): Promise<PflegeVerlaufEintrag[]> {
  let query = supabase
    .from('pflege_verlauf')
    .select('*')
    .order('eintrag_datum', { ascending: false })

  if (filter.organizationId) query = query.eq('organization_id', filter.organizationId)
  if (filter.clientId) query = query.eq('client_id', filter.clientId)
  if (filter.eintragTyp) query = query.eq('eintrag_typ', filter.eintragTyp)
  if (filter.kategorie) query = query.eq('kategorie', filter.kategorie)
  if (filter.sichtbarkeit) query = query.eq('sichtbarkeit', filter.sichtbarkeit)
  if (filter.vonDatum) query = query.gte('eintrag_datum', filter.vonDatum)
  if (filter.bisDatum) query = query.lte('eintrag_datum', filter.bisDatum)
  if (filter.nurDringende) query = query.eq('ist_dringend', true)
  if (filter.limit) query = query.limit(filter.limit)

  const { data, error } = await query
  if (error) throw new Error(`Verlaufseinträge konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as PflegeVerlaufEintrag[]
}

export async function getVerlauf(supabase: SupabaseClient, id: string, organizationId: string): Promise<PflegeVerlaufEintrag | null> {
  const { data, error } = await supabase
    .from('pflege_verlauf')
    .select('*')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (error) throw new Error(`Verlaufseintrag konnte nicht geladen werden: ${error.message}`)
  return data as PflegeVerlaufEintrag | null
}

export interface UpdateVerlaufParams {
  eintragTyp?: VerlaufTyp
  kategorie?: VerlaufKategorie
  titel?: string | null
  inhalt?: string
  istDringend?: boolean
  sichtbarkeit?: VerlaufSichtbarkeit
  massnahmeId?: string | null
}

export async function updateVerlauf(
  supabase: SupabaseClient,
  id: string,
  organizationId: string,
  patch: UpdateVerlaufParams,
  actorRolle: string
): Promise<PflegeVerlaufEintrag> {
  const existing = await getVerlauf(supabase, id, organizationId)
  if (!existing) throw new Error('Verlaufseintrag nicht gefunden.')
  if (existing.gesperrt) {
    throw new Error('Gesperrter Verlaufseintrag kann nicht bearbeitet werden. Erst Dokumentationsperiode wiedereröffnen.')
  }

  assertErlaubt(patch.eintragTyp, VERLAUF_TYP_WERTE, 'eintrag_typ')
  assertErlaubt(patch.kategorie, VERLAUF_KATEGORIE_WERTE, 'kategorie')
  validateSichtbarkeit(patch.sichtbarkeit, actorRolle)

  const update: Record<string, unknown> = {}
  if (patch.eintragTyp !== undefined) update.eintrag_typ = patch.eintragTyp
  if (patch.kategorie !== undefined) update.kategorie = patch.kategorie
  if (patch.titel !== undefined) update.titel = patch.titel
  if (patch.inhalt !== undefined) {
    if (!patch.inhalt.trim()) throw new Error('Inhalt darf nicht leer sein.')
    update.inhalt = patch.inhalt.trim()
  }
  if (patch.istDringend !== undefined) update.ist_dringend = patch.istDringend
  if (patch.sichtbarkeit !== undefined) update.sichtbarkeit = patch.sichtbarkeit
  if (patch.massnahmeId !== undefined) update.massnahme_id = patch.massnahmeId

  if (Object.keys(update).length === 0) throw new Error('Keine Änderungen übergeben.')

  const { data, error } = await supabase
    .from('pflege_verlauf')
    .update(update)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select('*')
    .single()
  if (error || !data) throw new Error(`Verlaufseintrag konnte nicht aktualisiert werden: ${error?.message ?? 'unbekannt'}`)
  return data as PflegeVerlaufEintrag
}

/** Gruppiert Einträge nach Kalendertag — Basis für die chronologische Verlaufsansicht. */
export function gruppiereNachTag(eintraege: PflegeVerlaufEintrag[]): Array<{ tag: string; eintraege: PflegeVerlaufEintrag[] }> {
  const gruppen = new Map<string, PflegeVerlaufEintrag[]>()
  for (const e of eintraege) {
    const tag = e.eintrag_datum.slice(0, 10)
    const liste = gruppen.get(tag)
    if (liste) liste.push(e)
    else gruppen.set(tag, [e])
  }
  return [...gruppen.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([tag, liste]) => ({ tag, eintraege: liste }))
}
