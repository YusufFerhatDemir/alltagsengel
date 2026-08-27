import { UserFacingError } from '@/lib/api/user-facing-error'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { PersonalUrlaubskonto, UrlaubsUebersicht } from './types'
import { assertCaregiverInOrg } from './organization-guard'

// Live-Schema personal_urlaubskonto (27.08.2026):
//   CHECK personal_urlaubskonto_jahr_check (jahr >= 2020 AND jahr <= 2099)
//   anspruch/genommen/geplant/uebertrag: numeric(5,1) NOT NULL DEFAULT 0
//   UNIQUE (organization_id, caregiver_id, jahr)
//
// Bisher ging jeder Wert ungeprueft an die Datenbank: `jahr: 1999` kam als
// 23514 zurueck, `anspruchTage: 1e9` als numeric-Ueberlauf 22003, und beides
// verkuerzte der Sanitizer zu „Interner Serverfehler". Negative Tage und
// NaN kamen sogar durch — `resturlaub` ist eine generierte Spalte ohne
// CHECK, ein Konto mit -5 genommenen Tagen ist also speicherbar und
// verfaelscht danach jede Restanspruchs-Rechnung in bucheGenommeneTage().
const JAHR_MIN = 2020
const JAHR_MAX = 2099
/** numeric(5,1): vier Vorkommastellen. */
const TAGE_MAX = 9999.9

function assertJahr(jahr: unknown): void {
  if (typeof jahr !== 'number' || !Number.isInteger(jahr)) {
    throw new UserFacingError('Jahr muss eine ganze Zahl sein.', 400)
  }
  if (jahr < JAHR_MIN || jahr > JAHR_MAX) {
    throw new UserFacingError(`Jahr muss zwischen ${JAHR_MIN} und ${JAHR_MAX} liegen.`, 400)
  }
}

function assertTage(wert: unknown, feldname: string): void {
  if (typeof wert !== 'number' || !Number.isFinite(wert)) {
    throw new UserFacingError(`${feldname} muss eine Zahl sein.`, 400)
  }
  if (wert < 0) {
    throw new UserFacingError(`${feldname} darf nicht negativ sein.`, 400)
  }
  if (wert > TAGE_MAX) {
    throw new UserFacingError(`${feldname} ist unplausibel hoch (max. ${TAGE_MAX}).`, 400)
  }
}

export interface CreateUrlaubskontoParams {
  organizationId: string
  caregiverId: string
  jahr: number
  anspruchTage: number
  uebertragVorjahr?: number
  bemerkung?: string | null
}

export async function createUrlaubskonto(supabase: SupabaseClient, params: CreateUrlaubskontoParams): Promise<PersonalUrlaubskonto> {
  assertJahr(params.jahr)
  assertTage(params.anspruchTage, 'Urlaubsanspruch')
  if (params.uebertragVorjahr !== undefined && params.uebertragVorjahr !== null) {
    assertTage(params.uebertragVorjahr, 'Übertrag aus dem Vorjahr')
  }

  // Mandanten-Fence VOR dem Schreiben (lib/personal/organization-guard.ts).
  // Fuer diese Tabelle ist er doppelt scharf: personal_urlaubsuebersicht
  // joint `caregivers` ohne Mandanten-Bedingung, ein Konto auf einen fremden
  // Mitarbeiter haette dessen Klarnamen in die eigene Urlaubsuebersicht
  // geholt — samt der Zahl seiner offenen Urlaubsantraege.
  await assertCaregiverInOrg(supabase, params.caregiverId, params.organizationId)

  const { data, error } = await supabase
    .from('personal_urlaubskonto')
    .insert({
      organization_id: params.organizationId,
      caregiver_id: params.caregiverId,
      jahr: params.jahr,
      anspruch_tage: params.anspruchTage,
      uebertrag_vorjahr: params.uebertragVorjahr ?? 0,
      bemerkung: params.bemerkung ?? null,
    })
    .select('*')
    .single()
  if (error || !data) throw new Error(`Urlaubskonto konnte nicht angelegt werden: ${error?.message ?? 'unbekannt'}`)
  return data as PersonalUrlaubskonto
}

export interface ListUrlaubskontoFilter {
  organizationId: string
  caregiverId?: string
  jahr?: number
}

export async function listUrlaubskonten(supabase: SupabaseClient, filter: ListUrlaubskontoFilter): Promise<PersonalUrlaubskonto[]> {
  let query = supabase
    .from('personal_urlaubskonto')
    .select('*')
    .eq('organization_id', filter.organizationId)
    .order('jahr', { ascending: false })

  if (filter.caregiverId) query = query.eq('caregiver_id', filter.caregiverId)
  if (filter.jahr) query = query.eq('jahr', filter.jahr)

  const { data, error } = await query
  if (error) throw new Error(`Urlaubskonten konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as PersonalUrlaubskonto[]
}

export interface UpdateUrlaubskontoParams {
  anspruchTage?: number
  genommenTage?: number
  geplantTage?: number
  uebertragVorjahr?: number
  bemerkung?: string | null
}

export async function updateUrlaubskonto(
  supabase: SupabaseClient,
  id: string,
  organizationId: string,
  patch: UpdateUrlaubskontoParams,
): Promise<PersonalUrlaubskonto> {
  if (patch.anspruchTage !== undefined) assertTage(patch.anspruchTage, 'Urlaubsanspruch')
  if (patch.genommenTage !== undefined) assertTage(patch.genommenTage, 'Genommene Tage')
  if (patch.geplantTage !== undefined) assertTage(patch.geplantTage, 'Geplante Tage')
  if (patch.uebertragVorjahr !== undefined) assertTage(patch.uebertragVorjahr, 'Übertrag aus dem Vorjahr')

  const update: Record<string, unknown> = {}
  if (patch.anspruchTage !== undefined) update.anspruch_tage = patch.anspruchTage
  if (patch.genommenTage !== undefined) update.genommen_tage = patch.genommenTage
  if (patch.geplantTage !== undefined) update.geplant_tage = patch.geplantTage
  if (patch.uebertragVorjahr !== undefined) update.uebertrag_vorjahr = patch.uebertragVorjahr
  if (patch.bemerkung !== undefined) update.bemerkung = patch.bemerkung

  if (Object.keys(update).length === 0) throw new UserFacingError('Keine Änderungen übergeben.')

  const { data, error } = await supabase
    .from('personal_urlaubskonto')
    .update(update)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select('*')
    .single()
  if (error || !data) throw new Error(`Urlaubskonto konnte nicht aktualisiert werden: ${error?.message ?? 'unbekannt'}`)
  return data as PersonalUrlaubskonto
}

export async function listUrlaubsUebersicht(
  supabase: SupabaseClient,
  organizationId: string,
  jahr?: number,
): Promise<UrlaubsUebersicht[]> {
  let query = supabase
    .from('personal_urlaubsuebersicht')
    .select('*')
    .eq('organization_id', organizationId)
    .order('caregiver_name', { ascending: true })

  if (jahr) query = query.eq('jahr', jahr)

  const { data, error } = await query
  if (error) throw new Error(`Urlaubsübersicht konnte nicht geladen werden: ${error.message}`)
  return (data ?? []) as UrlaubsUebersicht[]
}
