import type { SupabaseClient } from '@supabase/supabase-js'
import { assertErlaubt, VERTRAGSSTATUS_WERTE, type CaregiverStammdaten, type Vertragsstatus } from './types'

const STAMMDATEN_SELECT = `id, first_name, last_name, email, phone,
  notfallkontakt_name, notfallkontakt_telefon, notfallkontakt_beziehung,
  vertragsstatus, einsatzgebiet_plz, einsatzgebiet_radius_km,
  wochenstunden_soll, urlaubstage_jahresanspruch, probezeitende,
  fahrzeug_kennzeichen, fuehrerschein_klassen, einsatzfreigabe, qualification_level`

export interface ListStammdatenFilter {
  organizationId: string
  vertragsstatus?: Vertragsstatus
  search?: string
}

export async function listStammdaten(supabase: SupabaseClient, filter: ListStammdatenFilter): Promise<CaregiverStammdaten[]> {
  let query = supabase
    .from('caregivers')
    .select(STAMMDATEN_SELECT)
    .eq('organization_id', filter.organizationId)
    .order('last_name', { ascending: true })

  if (filter.vertragsstatus) query = query.eq('vertragsstatus', filter.vertragsstatus)

  const { data, error } = await query
  if (error) throw new Error(`Stammdaten konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as CaregiverStammdaten[]
}

export async function getStammdaten(supabase: SupabaseClient, caregiverId: string, organizationId: string): Promise<CaregiverStammdaten | null> {
  const { data, error } = await supabase
    .from('caregivers')
    .select(STAMMDATEN_SELECT)
    .eq('id', caregiverId)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (error) throw new Error(`Stammdaten konnten nicht geladen werden: ${error.message}`)
  return data as CaregiverStammdaten | null
}

/** Qualifikationsstufen, die caregivers.qualification_level akzeptiert. */
export const QUALIFIKATIONSSTUFE_WERTE = [
  'betreuungskraft_45a',
  'pflegehelferin',
  'pflegefachkraft',
  'hauswirtschafterin',
  'alltagsbegleiterin',
] as const
export type Qualifikationsstufe = (typeof QUALIFIKATIONSSTUFE_WERTE)[number]

export interface ErstelleStammdatenParams {
  vorname: string
  nachname: string
  email?: string | null
  telefon?: string | null
  qualifikationsstufe?: Qualifikationsstufe | null
  vertragsstatus?: Vertragsstatus | null
  eintrittsdatum?: string | null
  einsatzgebietPlz?: string[]
  wochenstundenSoll?: number | null
}

/**
 * Legt einen neuen Mitarbeiter an.
 *
 * Bewusst OHNE Einsatzfreigabe: die wird erst nach Prüfung von
 * Führungszeugnis, Erste-Hilfe und Qualifikation über
 * /admin/einsatzfreigabe erteilt (lib/personal/einsatzfreigabe.ts).
 * Ein frisch angelegter Mitarbeiter darf noch zu keinem Einsatz.
 */
export async function erstelleStammdaten(
  supabase: SupabaseClient,
  organizationId: string,
  params: ErstelleStammdatenParams,
): Promise<CaregiverStammdaten> {
  const vorname = params.vorname?.trim()
  const nachname = params.nachname?.trim()
  if (!vorname || !nachname) throw new Error('Vor- und Nachname sind Pflichtfelder.')

  assertErlaubt(params.vertragsstatus, VERTRAGSSTATUS_WERTE, 'vertragsstatus')
  assertErlaubt(params.qualifikationsstufe, QUALIFIKATIONSSTUFE_WERTE, 'qualifikationsstufe')

  const email = params.email?.trim() || null
  if (email) {
    const { data: doppelt, error: doppeltErr } = await supabase
      .from('caregivers')
      .select('id')
      .eq('organization_id', organizationId)
      .ilike('email', email)
      .maybeSingle()
    // FAIL-CLOSED: lässt sich die Dublettenprüfung nicht durchführen,
    // wird nicht angelegt — sonst entstehen zwei Personalakten.
    if (doppeltErr) throw new Error(`Dublettenprüfung fehlgeschlagen: ${doppeltErr.message}`)
    if (doppelt) throw new Error('Zu dieser E-Mail existiert bereits ein Mitarbeiter.')
  }

  const insert: Record<string, unknown> = {
    organization_id: organizationId,
    first_name: vorname,
    last_name: nachname,
    initials: `${vorname[0]}.${nachname[0]}.`.toUpperCase(),
    email,
    phone: params.telefon?.trim() || null,
    status: 'active',
    vertragsstatus: params.vertragsstatus ?? 'aktiv',
    qualification_level: params.qualifikationsstufe ?? 'betreuungskraft_45a',
    einsatzfreigabe: false,
    einsatzgebiet_plz: params.einsatzgebietPlz ?? [],
  }
  if (params.eintrittsdatum) insert.eintrittsdatum = params.eintrittsdatum
  if (params.wochenstundenSoll != null) insert.wochenstunden_soll = params.wochenstundenSoll

  const { data, error } = await supabase
    .from('caregivers')
    .insert(insert)
    .select(STAMMDATEN_SELECT)
    .single()

  if (error || !data) {
    throw new Error(`Mitarbeiter konnte nicht angelegt werden: ${error?.message ?? 'unbekannt'}`)
  }
  return data as CaregiverStammdaten
}

export interface UpdateStammdatenParams {
  notfallkontaktName?: string | null
  notfallkontaktTelefon?: string | null
  notfallkontaktBeziehung?: string | null
  vertragsstatus?: Vertragsstatus | null
  einsatzgebietPlz?: string[]
  einsatzgebietRadiusKm?: number | null
  wochenstundenSoll?: number | null
  urlaubstageJahresanspruch?: number | null
  probezeitende?: string | null
  fahrzeugKennzeichen?: string | null
  fuehrerscheinKlassen?: string[]
}

export async function updateStammdaten(
  supabase: SupabaseClient,
  caregiverId: string,
  organizationId: string,
  patch: UpdateStammdatenParams,
): Promise<CaregiverStammdaten> {
  assertErlaubt(patch.vertragsstatus, VERTRAGSSTATUS_WERTE, 'vertragsstatus')

  const update: Record<string, unknown> = {}
  if (patch.notfallkontaktName !== undefined) update.notfallkontakt_name = patch.notfallkontaktName
  if (patch.notfallkontaktTelefon !== undefined) update.notfallkontakt_telefon = patch.notfallkontaktTelefon
  if (patch.notfallkontaktBeziehung !== undefined) update.notfallkontakt_beziehung = patch.notfallkontaktBeziehung
  if (patch.vertragsstatus !== undefined) update.vertragsstatus = patch.vertragsstatus
  if (patch.einsatzgebietPlz !== undefined) update.einsatzgebiet_plz = patch.einsatzgebietPlz
  if (patch.einsatzgebietRadiusKm !== undefined) update.einsatzgebiet_radius_km = patch.einsatzgebietRadiusKm
  if (patch.wochenstundenSoll !== undefined) update.wochenstunden_soll = patch.wochenstundenSoll
  if (patch.urlaubstageJahresanspruch !== undefined) update.urlaubstage_jahresanspruch = patch.urlaubstageJahresanspruch
  if (patch.probezeitende !== undefined) update.probezeitende = patch.probezeitende
  if (patch.fahrzeugKennzeichen !== undefined) update.fahrzeug_kennzeichen = patch.fahrzeugKennzeichen
  if (patch.fuehrerscheinKlassen !== undefined) update.fuehrerschein_klassen = patch.fuehrerscheinKlassen

  if (Object.keys(update).length === 0) throw new Error('Keine Änderungen übergeben.')

  const { data, error } = await supabase
    .from('caregivers')
    .update(update)
    .eq('id', caregiverId)
    .eq('organization_id', organizationId)
    .select(STAMMDATEN_SELECT)
    .single()
  if (error || !data) throw new Error(`Stammdaten konnten nicht aktualisiert werden: ${error?.message ?? 'unbekannt'}`)
  return data as CaregiverStammdaten
}
