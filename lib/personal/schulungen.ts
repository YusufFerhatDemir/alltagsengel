import { UserFacingError } from '@/lib/api/user-facing-error'
import type { SupabaseClient } from '@supabase/supabase-js'
import { assertErlaubt, SCHULUNGSART_WERTE, type PersonalSchulung, type Schulungsart } from './types'

export interface CreateSchulungParams {
  organizationId: string
  caregiverId: string
  titel: string
  schulungsart: Schulungsart
  anbieter?: string | null
  beginn: string
  ende?: string | null
  dauerStunden?: number | null
  ort?: string | null
  zertifikatUrl?: string | null
  dokumentId?: string | null
  bestanden?: boolean | null
  naechsteAuffrischung?: string | null
  bemerkung?: string | null
  erstelltVon: string
}

export async function createSchulung(supabase: SupabaseClient, params: CreateSchulungParams): Promise<PersonalSchulung> {
  if (!params.titel?.trim()) throw new UserFacingError('Titel ist ein Pflichtfeld.')
  assertErlaubt(params.schulungsart, SCHULUNGSART_WERTE, 'schulungsart')

  const { data, error } = await supabase
    .from('personal_schulungen')
    .insert({
      organization_id: params.organizationId,
      caregiver_id: params.caregiverId,
      titel: params.titel.trim(),
      schulungsart: params.schulungsart,
      anbieter: params.anbieter ?? null,
      beginn: params.beginn,
      ende: params.ende ?? null,
      dauer_stunden: params.dauerStunden ?? null,
      ort: params.ort ?? null,
      zertifikat_url: params.zertifikatUrl ?? null,
      dokument_id: params.dokumentId ?? null,
      bestanden: params.bestanden ?? null,
      naechste_auffrischung: params.naechsteAuffrischung ?? null,
      bemerkung: params.bemerkung ?? null,
      erstellt_von: params.erstelltVon,
    })
    .select('*')
    .single()
  if (error || !data) throw new Error(`Schulung konnte nicht angelegt werden: ${error?.message ?? 'unbekannt'}`)
  return data as PersonalSchulung
}

export interface ListSchulungenFilter {
  organizationId: string
  caregiverId?: string
  schulungsart?: Schulungsart
}

export async function listSchulungen(supabase: SupabaseClient, filter: ListSchulungenFilter): Promise<PersonalSchulung[]> {
  let query = supabase
    .from('personal_schulungen')
    .select('*')
    .eq('organization_id', filter.organizationId)
    .order('beginn', { ascending: false })

  if (filter.caregiverId) query = query.eq('caregiver_id', filter.caregiverId)
  if (filter.schulungsart) query = query.eq('schulungsart', filter.schulungsart)

  const { data, error } = await query
  if (error) throw new Error(`Schulungen konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as PersonalSchulung[]
}

export interface UpdateSchulungParams {
  titel?: string
  schulungsart?: Schulungsart
  anbieter?: string | null
  beginn?: string
  ende?: string | null
  dauerStunden?: number | null
  ort?: string | null
  zertifikatUrl?: string | null
  dokumentId?: string | null
  bestanden?: boolean | null
  naechsteAuffrischung?: string | null
  bemerkung?: string | null
}

/**
 * Eine mit `bestanden = true` abgeschlossene Schulung ist ein Nachweis, kein
 * Planungseintrag mehr: Titel, Art, Zeitraum und Zertifikat belegen, was die
 * Betreuungskraft absolviert hat, und genau darauf schaut eine Pruefung.
 * Aenderbar bleibt, was die Zukunft betrifft — `naechsteAuffrischung` und
 * `bemerkung`.
 *
 * Ein Nachweis wird auch nicht heimlich entwertet: `bestanden` laesst sich
 * nicht von true zurueckdrehen. Eine falsch erfasste Schulung wird geloescht
 * und neu angelegt, damit die Korrektur sichtbar bleibt.
 */
const SCHULUNG_NACHWEISFELDER: Array<keyof UpdateSchulungParams> = [
  'titel', 'schulungsart', 'anbieter', 'beginn', 'ende',
  'dauerStunden', 'ort', 'zertifikatUrl', 'dokumentId', 'bestanden',
]

export async function updateSchulung(
  supabase: SupabaseClient,
  id: string,
  organizationId: string,
  patch: UpdateSchulungParams,
): Promise<PersonalSchulung> {
  assertErlaubt(patch.schulungsart, SCHULUNGSART_WERTE, 'schulungsart')

  const { data: bestand, error: ladeFehler } = await supabase
    .from('personal_schulungen')
    .select('bestanden')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (ladeFehler) throw new Error(`Schulung konnte nicht geladen werden: ${ladeFehler.message}`)
  if (!bestand) throw new UserFacingError('Schulung nicht gefunden.', 404)

  if (bestand.bestanden === true) {
    const beruehrt = SCHULUNG_NACHWEISFELDER.filter(feld => patch[feld] !== undefined)
    if (beruehrt.length > 0) {
      throw new UserFacingError(
        'Eine bestandene Schulung ist ein Nachweis und kann nicht mehr geändert werden. Nur nächste Auffrischung und Bemerkung bleiben pflegbar.',
        409,
      )
    }
  }

  const update: Record<string, unknown> = {}
  if (patch.titel !== undefined) update.titel = patch.titel
  if (patch.schulungsart !== undefined) update.schulungsart = patch.schulungsart
  if (patch.anbieter !== undefined) update.anbieter = patch.anbieter
  if (patch.beginn !== undefined) update.beginn = patch.beginn
  if (patch.ende !== undefined) update.ende = patch.ende
  if (patch.dauerStunden !== undefined) update.dauer_stunden = patch.dauerStunden
  if (patch.ort !== undefined) update.ort = patch.ort
  if (patch.zertifikatUrl !== undefined) update.zertifikat_url = patch.zertifikatUrl
  if (patch.dokumentId !== undefined) update.dokument_id = patch.dokumentId
  if (patch.bestanden !== undefined) update.bestanden = patch.bestanden
  if (patch.naechsteAuffrischung !== undefined) update.naechste_auffrischung = patch.naechsteAuffrischung
  if (patch.bemerkung !== undefined) update.bemerkung = patch.bemerkung

  if (Object.keys(update).length === 0) throw new UserFacingError('Keine Änderungen übergeben.')

  const { data, error } = await supabase
    .from('personal_schulungen')
    .update(update)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select('*')
    .single()
  if (error || !data) throw new Error(`Schulung konnte nicht aktualisiert werden: ${error?.message ?? 'unbekannt'}`)
  return data as PersonalSchulung
}

export async function deleteSchulung(supabase: SupabaseClient, id: string, organizationId: string): Promise<void> {
  const { error } = await supabase
    .from('personal_schulungen')
    .delete()
    .eq('id', id)
    .eq('organization_id', organizationId)
  if (error) throw new Error(`Schulung konnte nicht gelöscht werden: ${error.message}`)
}
