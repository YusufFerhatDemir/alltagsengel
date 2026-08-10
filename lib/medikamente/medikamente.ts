import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Medikament,
  MedikamentEingabe,
  MedikamentFilter,
  MedikamentKategorie,
  MedikamentStatus,
  EingabeFilter,
} from './types'

const GUELTIGE_KATEGORIEN: MedikamentKategorie[] = [
  'herz_kreislauf', 'schmerz', 'psychopharmaka', 'antibiotika', 'diabetes',
  'atemwege', 'magen_darm', 'hormone', 'blutgerinnung', 'sonstige',
]

const GUELTIGE_STATUS: MedikamentStatus[] = ['aktiv', 'pausiert', 'abgesetzt']

export function validiereKategorie(k: string): asserts k is MedikamentKategorie {
  if (!GUELTIGE_KATEGORIEN.includes(k as MedikamentKategorie)) {
    throw new Error(`Ungültige Kategorie: ${k}`)
  }
}

export function validiereStatus(s: string): asserts s is MedikamentStatus {
  if (!GUELTIGE_STATUS.includes(s as MedikamentStatus)) {
    throw new Error(`Ungültiger Status: ${s}`)
  }
}

export function validiereMedikament(data: Record<string, unknown>): void {
  if (!data.medikament_name || typeof data.medikament_name !== 'string' || data.medikament_name.trim().length === 0) {
    throw new Error('Medikamentenname ist ein Pflichtfeld.')
  }
  if (!data.dosierung || typeof data.dosierung !== 'string' || data.dosierung.trim().length === 0) {
    throw new Error('Dosierung ist ein Pflichtfeld.')
  }
  if (!data.client_id || typeof data.client_id !== 'string') {
    throw new Error('Klient muss zugeordnet sein.')
  }
  if (data.kategorie) validiereKategorie(data.kategorie as string)

  if (data.pzn && typeof data.pzn === 'string') {
    if (!/^\d{7,8}$/.test(data.pzn)) {
      throw new Error('PZN muss 7 oder 8 Ziffern haben.')
    }
  }

  const morgens = !!data.einnahme_morgens
  const mittags = !!data.einnahme_mittags
  const abends = !!data.einnahme_abends
  const nachts = !!data.einnahme_nachts
  if (!morgens && !mittags && !abends && !nachts) {
    throw new Error('Mindestens eine Einnahmezeit muss ausgewählt sein.')
  }

  if (data.beginn_datum && data.end_datum) {
    if (new Date(data.beginn_datum as string) > new Date(data.end_datum as string)) {
      throw new Error('Enddatum darf nicht vor dem Beginndatum liegen.')
    }
  }
}

export async function listeMedikamente(
  sb: SupabaseClient,
  orgId: string,
  filter: MedikamentFilter = {},
): Promise<Medikament[]> {
  let q = sb
    .from('medikamente')
    .select('*')
    .eq('organization_id', orgId)
    .order('medikament_name')

  if (filter.client_id) q = q.eq('client_id', filter.client_id)
  if (filter.status) q = q.eq('status', filter.status)
  if (filter.kategorie) q = q.eq('kategorie', filter.kategorie)
  if (filter.dauermedikation !== undefined) q = q.eq('dauermedikation', filter.dauermedikation)

  const { data, error } = await q
  if (error) throw new Error(`Medikamente laden: ${error.message}`)
  return (data ?? []) as Medikament[]
}

export async function holeMedikament(
  sb: SupabaseClient,
  orgId: string,
  id: string,
): Promise<Medikament | null> {
  const { data, error } = await sb
    .from('medikamente')
    .select('*')
    .eq('id', id)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (error) throw new Error(`Medikament laden: ${error.message}`)
  return data as Medikament | null
}

export async function erstelleMedikament(
  sb: SupabaseClient,
  orgId: string,
  userId: string,
  data: Record<string, unknown>,
): Promise<Medikament> {
  validiereMedikament(data)

  const row = {
    client_id: data.client_id,
    organization_id: orgId,
    medikament_name: (data.medikament_name as string).trim(),
    wirkstoff: (data.wirkstoff as string)?.trim() || null,
    pzn: (data.pzn as string)?.trim() || null,
    kategorie: data.kategorie || 'sonstige',
    darreichungsform: (data.darreichungsform as string)?.trim() || null,
    dosierung: (data.dosierung as string).trim(),
    einheit: (data.einheit as string) || 'mg',
    einnahme_morgens: !!data.einnahme_morgens,
    einnahme_mittags: !!data.einnahme_mittags,
    einnahme_abends: !!data.einnahme_abends,
    einnahme_nachts: !!data.einnahme_nachts,
    einnahme_hinweis: (data.einnahme_hinweis as string)?.trim() || null,
    verordnet_von: (data.verordnet_von as string)?.trim() || null,
    beginn_datum: data.beginn_datum || null,
    end_datum: data.end_datum || null,
    dauermedikation: data.dauermedikation !== false,
    status: 'aktiv',
    notizen: (data.notizen as string)?.trim() || null,
    created_by: userId,
  }

  const { data: created, error } = await sb
    .from('medikamente')
    .insert(row)
    .select()
    .single()
  if (error) throw new Error(`Medikament erstellen: ${error.message}`)
  return created as Medikament
}

export async function aktualisiereMedikament(
  sb: SupabaseClient,
  orgId: string,
  id: string,
  updates: Record<string, unknown>,
): Promise<Medikament> {
  if (updates.kategorie) validiereKategorie(updates.kategorie as string)

  const allowed = [
    'medikament_name', 'wirkstoff', 'pzn', 'kategorie', 'darreichungsform',
    'dosierung', 'einheit', 'einnahme_morgens', 'einnahme_mittags',
    'einnahme_abends', 'einnahme_nachts', 'einnahme_hinweis',
    'verordnet_von', 'beginn_datum', 'end_datum', 'dauermedikation',
    'notizen',
  ]
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of allowed) {
    if (k in updates) row[k] = updates[k]
  }

  const { data, error } = await sb
    .from('medikamente')
    .update(row)
    .eq('id', id)
    .eq('organization_id', orgId)
    .select()
    .single()
  if (error) throw new Error(`Medikament aktualisieren: ${error.message}`)
  return data as Medikament
}

export async function setzeMedikamentStatus(
  sb: SupabaseClient,
  orgId: string,
  id: string,
  status: MedikamentStatus,
  grund?: string,
): Promise<Medikament> {
  validiereStatus(status)
  const row: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  }
  if (status === 'abgesetzt') {
    row.abgesetzt_am = new Date().toISOString()
    row.abgesetzt_grund = grund || null
  }
  const { data, error } = await sb
    .from('medikamente')
    .update(row)
    .eq('id', id)
    .eq('organization_id', orgId)
    .select()
    .single()
  if (error) throw new Error(`Status setzen: ${error.message}`)
  return data as Medikament
}

// ── Medikamenteneingabe (Verabreichungs-Log) ──────────────────────

export async function listeEingaben(
  sb: SupabaseClient,
  orgId: string,
  filter: EingabeFilter,
): Promise<MedikamentEingabe[]> {
  let q = sb
    .from('medikament_eingaben')
    .select('*')
    .eq('organization_id', orgId)
    .eq('client_id', filter.client_id)
    .order('geplant_um', { ascending: false })

  if (filter.medikament_id) q = q.eq('medikament_id', filter.medikament_id)
  if (filter.datum_von) q = q.gte('geplant_um', filter.datum_von)
  if (filter.datum_bis) q = q.lte('geplant_um', filter.datum_bis)
  if (filter.status) q = q.eq('status', filter.status)

  const { data, error } = await q
  if (error) throw new Error(`Eingaben laden: ${error.message}`)
  return (data ?? []) as MedikamentEingabe[]
}

export async function erfasseEingabe(
  sb: SupabaseClient,
  orgId: string,
  userId: string,
  eingabe: {
    medikament_id: string
    client_id: string
    einnahme_zeit: string
    geplant_um: string
    status: string
    verweigert_grund?: string
    notizen?: string
  },
): Promise<MedikamentEingabe> {
  const row = {
    medikament_id: eingabe.medikament_id,
    client_id: eingabe.client_id,
    organization_id: orgId,
    einnahme_zeit: eingabe.einnahme_zeit,
    geplant_um: eingabe.geplant_um,
    gegeben_um: ['gegeben'].includes(eingabe.status) ? new Date().toISOString() : null,
    gegeben_von: userId,
    status: eingabe.status,
    verweigert_grund: eingabe.verweigert_grund || null,
    notizen: eingabe.notizen || null,
  }

  const { data, error } = await sb
    .from('medikament_eingaben')
    .insert(row)
    .select()
    .single()
  if (error) throw new Error(`Eingabe erfassen: ${error.message}`)
  return data as MedikamentEingabe
}

export function einnahmeZeiten(m: Medikament): string[] {
  const zeiten: string[] = []
  if (m.einnahme_morgens) zeiten.push('morgens')
  if (m.einnahme_mittags) zeiten.push('mittags')
  if (m.einnahme_abends) zeiten.push('abends')
  if (m.einnahme_nachts) zeiten.push('nachts')
  return zeiten
}

export function istAbgelaufen(m: Medikament): boolean {
  if (m.dauermedikation) return false
  if (!m.end_datum) return false
  return new Date(m.end_datum) < new Date()
}
