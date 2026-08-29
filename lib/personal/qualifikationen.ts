import { UserFacingError } from '@/lib/api/user-facing-error'
import type { SupabaseClient } from '@supabase/supabase-js'
import { assertErlaubt, type CaregiverQualifikation } from './types'
import { assertCaregiverInOrg } from './organization-guard'

/**
 * Werte, die `caregiver_qualifications.qualification_type` live akzeptiert
 * (CHECK caregiver_qualifications_qualification_type_check, am 27.08.2026
 * aus pg_constraint gelesen). Die Spalte ist NOT NULL.
 *
 * Ohne diese Liste ging jeder abweichende Wert ungeprueft an die Datenbank
 * und kam als 23514 zurueck — vom Sanitizer zu „Interner Serverfehler"
 * verkuerzt. Die Oberflaeche schickt die Auswahl aus einem Formular, dessen
 * Startwert die leere Zeichenkette ist: wer den Typ nicht auswaehlt, loeste
 * genau diesen 500er aus, und das Formular blieb ohne Meldung stehen.
 */
export const QUALIFIKATIONSTYP_WERTE = [
  'fuehrungszeugnis',
  'erste_hilfe',
  'hygiene',
  'datenschutz',
  'brandschutz',
  'pflichtunterweisung',
  'fortbildung',
  'sonstige',
] as const
export type Qualifikationstyp = (typeof QUALIFIKATIONSTYP_WERTE)[number]

/** Live-CHECK caregiver_qualifications_status_check. */
export const QUALIFIKATION_STATUS_WERTE = ['valid', 'expiring', 'expired', 'pending'] as const
export type QualifikationStatus = (typeof QUALIFIKATION_STATUS_WERTE)[number]

const DATUM_RE = /^\d{4}-\d{2}-\d{2}$/

/** Prueft ein optionales Datumsfeld auf das Format JJJJ-MM-TT. */
function assertDatum(wert: string | null | undefined, feldname: string): void {
  if (wert == null || wert === '') return
  if (typeof wert !== 'string' || !DATUM_RE.test(wert.trim())) {
    throw new UserFacingError(`${feldname} muss im Format JJJJ-MM-TT sein.`, 400)
  }
}

export interface CreateQualifikationParams {
  organizationId: string
  caregiverId: string
  title: string
  qualificationType: string
  issuedDate?: string | null
  validUntil?: string | null
  status?: string
  ausstellendeStelle?: string | null
  dokumentId?: string | null
  bemerkung?: string | null
  pflicht?: boolean
  einsatzrelevant?: boolean
}

export async function createQualifikation(supabase: SupabaseClient, params: CreateQualifikationParams): Promise<CaregiverQualifikation> {
  if (!params.title?.trim()) throw new UserFacingError('Titel ist ein Pflichtfeld.')
  if (!params.qualificationType?.trim()) {
    throw new UserFacingError('Qualifikationsart ist ein Pflichtfeld.', 400)
  }
  assertErlaubt(params.qualificationType as Qualifikationstyp, QUALIFIKATIONSTYP_WERTE, 'Qualifikationsart')
  assertErlaubt(params.status as QualifikationStatus | undefined, QUALIFIKATION_STATUS_WERTE, 'Status')
  assertDatum(params.issuedDate, 'Ausstellungsdatum')
  assertDatum(params.validUntil, 'Gültig bis')

  // Mandanten-Fence VOR dem Schreiben: caregiver_id kommt aus dem Body und
  // wird mit dem Dienstschluessel geschrieben, der RLS umgeht
  // (Begruendung in lib/personal/organization-guard.ts).
  await assertCaregiverInOrg(supabase, params.caregiverId, params.organizationId)

  const { data, error } = await supabase
    .from('caregiver_qualifications')
    .insert({
      organization_id: params.organizationId,
      caregiver_id: params.caregiverId,
      title: params.title.trim(),
      qualification_type: params.qualificationType,
      issued_date: params.issuedDate ?? null,
      valid_until: params.validUntil ?? null,
      status: params.status ?? 'valid',
      ausstellende_stelle: params.ausstellendeStelle ?? null,
      dokument_id: params.dokumentId ?? null,
      bemerkung: params.bemerkung ?? null,
      pflicht: params.pflicht ?? false,
      einsatzrelevant: params.einsatzrelevant ?? false,
    })
    .select('*')
    .single()
  if (error || !data) throw new Error(`Qualifikation konnte nicht angelegt werden: ${error?.message ?? 'unbekannt'}`)
  return data as CaregiverQualifikation
}

export interface ListQualifikationenFilter {
  organizationId: string
  caregiverId?: string
  nurPflicht?: boolean
  nurEinsatzrelevant?: boolean
}

export async function listQualifikationen(supabase: SupabaseClient, filter: ListQualifikationenFilter): Promise<CaregiverQualifikation[]> {
  let query = supabase
    .from('caregiver_qualifications')
    .select('*')
    .eq('organization_id', filter.organizationId)
    .order('valid_until', { ascending: true, nullsFirst: false })

  if (filter.caregiverId) query = query.eq('caregiver_id', filter.caregiverId)
  if (filter.nurPflicht) query = query.eq('pflicht', true)
  if (filter.nurEinsatzrelevant) query = query.eq('einsatzrelevant', true)

  const { data, error } = await query
  if (error) throw new Error(`Qualifikationen konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as CaregiverQualifikation[]
}

export interface UpdateQualifikationParams {
  title?: string
  qualificationType?: string
  issuedDate?: string | null
  validUntil?: string | null
  status?: string
  ausstellendeStelle?: string | null
  dokumentId?: string | null
  bemerkung?: string | null
  /**
   * Setzt den Pruefvermerk. `verifiziert_von` und `verifiziert_am` sind
   * BEWUSST keine Body-Felder mehr: die Route reichte den Rumpf ungefiltert
   * durch, sodass sich frei bestimmen liess, WER eine Qualifikation wann
   * geprueft hat — bis hin zu einem Datum in der Zukunft oder der Benutzer-ID
   * einer Kollegin, die den Nachweis nie gesehen hat. Genau dieser Vermerk
   * ist bei einer MD-Pruefung der Beleg dafuer, dass das Fuehrungszeugnis
   * tatsaechlich eingesehen wurde. Er kommt jetzt aus dem Auth-Kontext.
   */
  verifiziert?: boolean
  pflicht?: boolean
  einsatzrelevant?: boolean
}

export async function updateQualifikation(
  supabase: SupabaseClient,
  id: string,
  organizationId: string,
  patch: UpdateQualifikationParams,
  /** Angemeldeter Benutzer — Urheber des Pruefvermerks. */
  benutzerId?: string,
): Promise<CaregiverQualifikation> {
  assertErlaubt(patch.qualificationType as Qualifikationstyp | undefined, QUALIFIKATIONSTYP_WERTE, 'Qualifikationsart')
  assertErlaubt(patch.status as QualifikationStatus | undefined, QUALIFIKATION_STATUS_WERTE, 'Status')
  assertDatum(patch.issuedDate, 'Ausstellungsdatum')
  assertDatum(patch.validUntil, 'Gültig bis')
  if (patch.title !== undefined && !String(patch.title).trim()) {
    throw new UserFacingError('Titel darf nicht leer sein.', 400)
  }

  const update: Record<string, unknown> = {}
  if (patch.title !== undefined) update.title = patch.title
  if (patch.qualificationType !== undefined) update.qualification_type = patch.qualificationType
  if (patch.issuedDate !== undefined) update.issued_date = patch.issuedDate
  if (patch.validUntil !== undefined) update.valid_until = patch.validUntil
  if (patch.status !== undefined) update.status = patch.status
  if (patch.ausstellendeStelle !== undefined) update.ausstellende_stelle = patch.ausstellendeStelle
  if (patch.dokumentId !== undefined) update.dokument_id = patch.dokumentId
  if (patch.bemerkung !== undefined) update.bemerkung = patch.bemerkung
  if (patch.verifiziert !== undefined) {
    if (patch.verifiziert) {
      if (!benutzerId) {
        throw new UserFacingError('Prüfvermerk ohne angemeldeten Benutzer nicht möglich.', 400)
      }
      update.verifiziert_von = benutzerId
      update.verifiziert_am = new Date().toISOString()
    } else {
      update.verifiziert_von = null
      update.verifiziert_am = null
    }
  }
  if (patch.pflicht !== undefined) update.pflicht = patch.pflicht
  if (patch.einsatzrelevant !== undefined) update.einsatzrelevant = patch.einsatzrelevant

  if (Object.keys(update).length === 0) throw new UserFacingError('Keine Änderungen übergeben.')

  const { data, error } = await supabase
    .from('caregiver_qualifications')
    .update(update)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select('*')
    .single()
  if (error || !data) throw new Error(`Qualifikation konnte nicht aktualisiert werden: ${error?.message ?? 'unbekannt'}`)
  return data as CaregiverQualifikation
}

export async function deleteQualifikation(supabase: SupabaseClient, id: string, organizationId: string): Promise<void> {
  // Ohne diesen Nachschlag meldete das Loeschen ERFOLG, auch wenn nichts
  // geloescht wurde — bei einer unbekannten Kennung ebenso wie bei einer
  // Zeile eines fremden Mandanten. Der Org-Fence griff (es wurde nichts
  // angefasst), die Antwort war trotzdem `{ ok: true }`. Bei einer
  // Qualifikation faellt das doppelt ins Gewicht: sie steuert die
  // Einsatzfreigabe, und wer sie fuer geloescht haelt, plant danach
  // anders, als die Daten hergeben.
  const { data: bestand, error: ladeFehler } = await supabase
    .from('caregiver_qualifications')
    .select('id')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (ladeFehler) throw new Error(`Qualifikation konnte nicht geladen werden: ${ladeFehler.message}`)
  if (!bestand) throw new UserFacingError('Qualifikation nicht gefunden.', 404)

  const { error } = await supabase
    .from('caregiver_qualifications')
    .delete()
    .eq('id', id)
    .eq('organization_id', organizationId)
  if (error) throw new Error(`Qualifikation konnte nicht gelöscht werden: ${error.message}`)
}

export async function listAblaufWarnungen(supabase: SupabaseClient, organizationId: string): Promise<import('./types').QualifikationAblaufWarnung[]> {
  const { data, error } = await supabase
    .from('qualifikation_ablauf_warnung')
    .select('*')
    .eq('organization_id', organizationId)
    .order('tage_verbleibend', { ascending: true, nullsFirst: false })
  if (error) throw new Error(`Ablaufwarnungen konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as import('./types').QualifikationAblaufWarnung[]
}
