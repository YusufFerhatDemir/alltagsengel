// ═══════════════════════════════════════════════════════════════
// Anamnese — pflege_anamnesen
// CRUD + Sperr-Logik. Eine gesperrte Anamnese ist unveränderlich;
// die DB (trg_locked_anamnese) erzwingt dasselbe auf Tabellenebene.
// ═══════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { heuteBerlin } from '@/lib/utils/timezone'
import { logPflegeAktivitaet } from './audit-log'
import {
  ANAMNESE_TYP_WERTE,
  assertErlaubt,
  STURZRISIKO_WERTE,
  type AnamneseStatus,
  type AnamneseTyp,
  type PflegeAnamnese,
  type Sturzrisiko,
} from './types'

/** Alle Fachfelder der Anamnese (ohne Metadaten) — camelCase → Spaltenname. */
const FELD_MAP: Record<string, string> = {
  koerperlicherZustand: 'koerperlicher_zustand',
  mobilitaet: 'mobilitaet',
  sturzrisiko: 'sturzrisiko',
  schmerzen: 'schmerzen',
  ernaehrungszustand: 'ernaehrungszustand',
  schluckbeschwerden: 'schluckbeschwerden',
  inkontinenz: 'inkontinenz',
  hautbild: 'hautbild',
  orientierung: 'orientierung',
  kommunikationsfaehigkeit: 'kommunikationsfaehigkeit',
  stimmungslage: 'stimmungslage',
  verhaltensauffaelligkeiten: 'verhaltensauffaelligkeiten',
  nachtruhe: 'nachtruhe',
  sozialeKontakte: 'soziale_kontakte',
  tagesstruktur: 'tagesstruktur',
  hobbysInteressen: 'hobbys_interessen',
  religioesKulturell: 'religioes_kulturell',
  koerperpflege: 'koerperpflege',
  anAuskleiden: 'an_auskleiden',
  essenTrinken: 'essen_trinken',
  hauswirtschaft: 'hauswirtschaft',
  zusammenfassung: 'zusammenfassung',
  besonderheiten: 'besonderheiten',
  empfehlungen: 'empfehlungen',
}

export type AnamneseFelder = Partial<Record<keyof typeof FELD_MAP, string | boolean | null>>

function mapFelder(felder: AnamneseFelder): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, spalte] of Object.entries(FELD_MAP)) {
    const wert = (felder as Record<string, unknown>)[key]
    if (wert !== undefined) out[spalte] = wert
  }
  if (out.sturzrisiko !== undefined) {
    assertErlaubt(out.sturzrisiko as Sturzrisiko, STURZRISIKO_WERTE, 'sturzrisiko')
  }
  return out
}

export interface CreateAnamneseParams extends AnamneseFelder {
  organizationId: string
  clientId: string
  anamneseDatum?: string
  anamneseTyp?: AnamneseTyp
  erhobenVon: string
  erhobenRolle?: string | null
  erstelltVon: string
}

export async function createAnamnese(supabase: SupabaseClient, params: CreateAnamneseParams): Promise<PflegeAnamnese> {
  assertErlaubt(params.anamneseTyp, ANAMNESE_TYP_WERTE, 'anamnese_typ')

  const { data, error } = await supabase
    .from('pflege_anamnesen')
    .insert({
      organization_id: params.organizationId,
      client_id: params.clientId,
      anamnese_datum: params.anamneseDatum ?? heuteBerlin(),
      anamnese_typ: params.anamneseTyp ?? 'erstanamnese',
      erhoben_von: params.erhobenVon,
      erhoben_rolle: params.erhobenRolle ?? null,
      erstellt_von: params.erstelltVon,
      ...mapFelder(params),
    })
    .select('*')
    .single()
  if (error || !data) throw new Error(`Anamnese konnte nicht angelegt werden: ${error?.message ?? 'unbekannt'}`)

  await logPflegeAktivitaet(supabase, {
    organizationId: (data as PflegeAnamnese).organization_id,
    entitaetTyp: 'anamnese',
    entitaetId: (data as PflegeAnamnese).id,
    aktion: 'erstellt',
    nachher: data,
    akteurId: params.erstelltVon,
  }).catch((err) => console.error('[pflege-audit] Anamnese-Log fehlgeschlagen:', err))

  return data as PflegeAnamnese
}

export interface ListAnamnesenFilter {
  organizationId: string
  clientId?: string
  anamneseTyp?: AnamneseTyp
  status?: AnamneseStatus
}

export async function listAnamnesen(supabase: SupabaseClient, filter: ListAnamnesenFilter): Promise<PflegeAnamnese[]> {
  let query = supabase
    .from('pflege_anamnesen')
    .select('*')
    .eq('organization_id', filter.organizationId)
    .order('anamnese_datum', { ascending: false })

  if (filter.clientId) query = query.eq('client_id', filter.clientId)
  if (filter.anamneseTyp) query = query.eq('anamnese_typ', filter.anamneseTyp)
  if (filter.status) query = query.eq('status', filter.status)

  const { data, error } = await query
  if (error) throw new Error(`Anamnesen konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as PflegeAnamnese[]
}

export async function getAnamnese(supabase: SupabaseClient, id: string, organizationId: string): Promise<PflegeAnamnese | null> {
  const { data, error } = await supabase
    .from('pflege_anamnesen')
    .select('*')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (error) throw new Error(`Anamnese konnte nicht geladen werden: ${error.message}`)
  return data as PflegeAnamnese | null
}

export interface UpdateAnamneseParams extends AnamneseFelder {
  anamneseDatum?: string
  anamneseTyp?: AnamneseTyp
  erhobenRolle?: string | null
  status?: AnamneseStatus
}

export async function updateAnamnese(
  supabase: SupabaseClient,
  id: string,
  organizationId: string,
  patch: UpdateAnamneseParams
): Promise<PflegeAnamnese> {
  const existing = await getAnamnese(supabase, id, organizationId)
  if (!existing) throw new Error('Anamnese nicht gefunden.')
  if (existing.gesperrt) {
    throw new Error('Gesperrte Anamnese kann nicht bearbeitet werden.')
  }
  assertErlaubt(patch.anamneseTyp, ANAMNESE_TYP_WERTE, 'anamnese_typ')

  const update: Record<string, unknown> = mapFelder(patch)
  if (patch.anamneseDatum !== undefined) update.anamnese_datum = patch.anamneseDatum
  if (patch.anamneseTyp !== undefined) update.anamnese_typ = patch.anamneseTyp
  if (patch.erhobenRolle !== undefined) update.erhoben_rolle = patch.erhobenRolle
  if (patch.status !== undefined) {
    if (patch.status === 'gesperrt') {
      throw new Error('Sperren erfolgt über /api/pflege/anamnesen/[id]/sperren.')
    }
    update.status = patch.status
    if (patch.status === 'abgeschlossen') update.abgeschlossen_am = new Date().toISOString()
  }

  const { data, error } = await supabase
    .from('pflege_anamnesen')
    .update(update)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select('*')
    .single()
  if (error || !data) throw new Error(`Anamnese konnte nicht aktualisiert werden: ${error?.message ?? 'unbekannt'}`)

  await logPflegeAktivitaet(supabase, {
    organizationId,
    entitaetTyp: 'anamnese',
    entitaetId: id,
    aktion: 'aktualisiert',
    vorher: existing,
    nachher: data,
  }).catch((err) => console.error('[pflege-audit] Anamnese-Log fehlgeschlagen:', err))

  return data as PflegeAnamnese
}

/**
 * Sperrt eine Anamnese endgültig (status='gesperrt', gesperrt=true).
 * Nur abgeschlossene Anamnesen dürfen gesperrt werden — ein Entwurf
 * würde sonst unvollständig eingefroren.
 */
export async function sperreAnamnese(
  supabase: SupabaseClient,
  id: string,
  organizationId: string
): Promise<PflegeAnamnese> {
  const existing = await getAnamnese(supabase, id, organizationId)
  if (!existing) throw new Error('Anamnese nicht gefunden.')
  if (existing.gesperrt) throw new Error('Anamnese ist bereits gesperrt.')
  if (existing.status !== 'abgeschlossen') {
    throw new Error('Nur abgeschlossene Anamnesen können gesperrt werden.')
  }

  const { data, error } = await supabase
    .from('pflege_anamnesen')
    .update({ gesperrt: true, status: 'gesperrt' })
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select('*')
    .single()
  if (error || !data) throw new Error(`Anamnese konnte nicht gesperrt werden: ${error?.message ?? 'unbekannt'}`)

  await logPflegeAktivitaet(supabase, {
    organizationId,
    entitaetTyp: 'anamnese',
    entitaetId: id,
    aktion: 'gesperrt',
    vorher: existing,
    nachher: data,
  }).catch((err) => console.error('[pflege-audit] Anamnese-Log fehlgeschlagen:', err))

  return data as PflegeAnamnese
}

/** Hebt die Sperre wieder auf — die Anamnese fällt zurück auf 'abgeschlossen'. */
export async function entsperreAnamnese(
  supabase: SupabaseClient,
  id: string,
  organizationId: string
): Promise<PflegeAnamnese> {
  const existing = await getAnamnese(supabase, id, organizationId)
  if (!existing) throw new Error('Anamnese nicht gefunden.')
  if (!existing.gesperrt) throw new Error('Anamnese ist nicht gesperrt.')

  // trg_locked_anamnese greift nur, wenn gesperrt VOR und NACH dem Update true ist —
  // das Zurücksetzen auf false passiert also bewusst in genau einem Statement.
  const { data, error } = await supabase
    .from('pflege_anamnesen')
    .update({ gesperrt: false, status: 'abgeschlossen' })
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select('*')
    .single()
  if (error || !data) throw new Error(`Anamnese konnte nicht entsperrt werden: ${error?.message ?? 'unbekannt'}`)

  await logPflegeAktivitaet(supabase, {
    organizationId,
    entitaetTyp: 'anamnese',
    entitaetId: id,
    aktion: 'entsperrt',
    vorher: existing,
    nachher: data,
  }).catch((err) => console.error('[pflege-audit] Anamnese-Log fehlgeschlagen:', err))

  return data as PflegeAnamnese
}

/** Jüngste Anamnese eines Kunden — Basis für Diagnosen-/Planungsansichten. */
export async function getAktuelleAnamnese(
  supabase: SupabaseClient,
  clientId: string,
  organizationId: string
): Promise<PflegeAnamnese | null> {
  const { data, error } = await supabase
    .from('pflege_anamnesen')
    .select('*')
    .eq('client_id', clientId)
    .eq('organization_id', organizationId)
    .order('anamnese_datum', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`Anamnese konnte nicht geladen werden: ${error.message}`)
  return data as PflegeAnamnese | null
}
