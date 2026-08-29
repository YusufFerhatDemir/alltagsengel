// ═══════════════════════════════════════════════════════════════
// Angehörige / Bevollmächtigte / Notfallkontakte — akten_kontaktpersonen
// ═══════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { logAktenZugriff } from './zugriff-log'
import { UserFacingError } from '@/lib/api/user-facing-error'
import type { AktenKontaktperson, KontaktRolle, VollmachtTyp } from './types'

export interface CreateKontaktpersonParams {
  organizationId: string
  clientId: string
  rolle: KontaktRolle
  anrede?: string | null
  vorname: string
  nachname: string
  telefon?: string | null
  mobil?: string | null
  email?: string | null
  adresse?: string | null
  plz?: string | null
  ort?: string | null
  vollmachtTyp?: VollmachtTyp | null
  vollmachtDatum?: string | null
  vollmachtDokumentId?: string | null
  bevorzugteKontaktart?: 'telefon' | 'mobil' | 'email' | 'post' | null
  beziehung?: string | null
  istHauptkontakt?: boolean
  bemerkung?: string | null
  actorId: string
  actorRole?: string
}

export async function createKontaktperson(supabase: SupabaseClient, params: CreateKontaktpersonParams): Promise<AktenKontaktperson> {
  const { data, error } = await supabase
    .from('akten_kontaktpersonen')
    .insert({
      organization_id: params.organizationId,
      client_id: params.clientId,
      rolle: params.rolle,
      anrede: params.anrede ?? null,
      vorname: params.vorname,
      nachname: params.nachname,
      telefon: params.telefon ?? null,
      mobil: params.mobil ?? null,
      email: params.email ?? null,
      adresse: params.adresse ?? null,
      plz: params.plz ?? null,
      ort: params.ort ?? null,
      vollmacht_typ: params.vollmachtTyp ?? null,
      vollmacht_datum: params.vollmachtDatum ?? null,
      vollmacht_dokument_id: params.vollmachtDokumentId ?? null,
      bevorzugte_kontaktart: params.bevorzugteKontaktart ?? null,
      beziehung: params.beziehung ?? null,
      ist_hauptkontakt: params.istHauptkontakt ?? false,
      bemerkung: params.bemerkung ?? null,
    })
    .select('*')
    .single()
  if (error || !data) throw new Error(`Kontaktperson konnte nicht angelegt werden: ${error?.message ?? 'unbekannt'}`)

  await logAktenZugriff(supabase, {
    organizationId: params.organizationId, entitaetTyp: 'kontaktperson', entitaetId: data.id,
    aktion: 'bearbeitet', benutzerId: params.actorId, benutzerRolle: params.actorRole,
    details: { aktion_detail: 'angelegt', name: `${params.vorname} ${params.nachname}` },
  })

  return data as AktenKontaktperson
}

export async function listKontaktpersonen(supabase: SupabaseClient, organizationId: string, clientId: string): Promise<AktenKontaktperson[]> {
  const { data, error } = await supabase
    .from('akten_kontaktpersonen')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .order('ist_hauptkontakt', { ascending: false })
    .order('nachname')
  if (error) throw new Error(`Kontaktpersonen konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as AktenKontaktperson[]
}

export type UpdateKontaktpersonParams = Partial<Omit<CreateKontaktpersonParams, 'organizationId' | 'clientId' | 'actorId' | 'actorRole'>>

export async function updateKontaktperson(
  supabase: SupabaseClient,
  id: string,
  organizationId: string,
  patch: UpdateKontaktpersonParams,
  actorId: string,
  actorRole?: string
): Promise<AktenKontaktperson> {
  const update: Record<string, unknown> = {}
  if (patch.rolle !== undefined) update.rolle = patch.rolle
  if (patch.anrede !== undefined) update.anrede = patch.anrede
  if (patch.vorname !== undefined) update.vorname = patch.vorname
  if (patch.nachname !== undefined) update.nachname = patch.nachname
  if (patch.telefon !== undefined) update.telefon = patch.telefon
  if (patch.mobil !== undefined) update.mobil = patch.mobil
  if (patch.email !== undefined) update.email = patch.email
  if (patch.adresse !== undefined) update.adresse = patch.adresse
  if (patch.plz !== undefined) update.plz = patch.plz
  if (patch.ort !== undefined) update.ort = patch.ort
  if (patch.vollmachtTyp !== undefined) update.vollmacht_typ = patch.vollmachtTyp
  if (patch.vollmachtDatum !== undefined) update.vollmacht_datum = patch.vollmachtDatum
  if (patch.vollmachtDokumentId !== undefined) update.vollmacht_dokument_id = patch.vollmachtDokumentId
  if (patch.bevorzugteKontaktart !== undefined) update.bevorzugte_kontaktart = patch.bevorzugteKontaktart
  if (patch.beziehung !== undefined) update.beziehung = patch.beziehung
  if (patch.istHauptkontakt !== undefined) update.ist_hauptkontakt = patch.istHauptkontakt
  if (patch.bemerkung !== undefined) update.bemerkung = patch.bemerkung

  // Ein Patch ohne bekanntes Feld ist keine Aenderung, sondern eine
  // verworfene Eingabe. Ihn durchzulassen erzeugte ein leeres UPDATE, eine
  // Erfolgsantwort und einen Protokolleintrag „bearbeitet" ueber nichts.
  if (Object.keys(update).length === 0) {
    throw new UserFacingError('Keine Änderungen übergeben.', 400)
  }

  const { data, error } = await supabase
    .from('akten_kontaktpersonen')
    .update(update)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select('*')
    .single()
  if (error || !data) throw new Error(`Kontaktperson konnte nicht aktualisiert werden: ${error?.message ?? 'unbekannt'}`)

  await logAktenZugriff(supabase, {
    organizationId, entitaetTyp: 'kontaktperson', entitaetId: id, aktion: 'bearbeitet',
    benutzerId: actorId, benutzerRolle: actorRole, details: patch as Record<string, unknown>,
  })

  return data as AktenKontaktperson
}

export async function softDeleteKontaktperson(supabase: SupabaseClient, id: string, organizationId: string, actorId: string, actorRole?: string): Promise<void> {
  // BEFUND 29.08.2026: Ein UPDATE, das keine Zeile trifft, ist in PostgREST
  // KEIN Fehler. Bei unbekannter Kennung oder einer Zeile eines fremden
  // Mandanten lief das Loeschen damit durch, die Route antwortete
  // `{ success: true }` — und schrieb einen Zugriffsprotokoll-Eintrag
  // „geloescht" ueber eine Kontaktperson, die es weiter gibt. Ein
  // Protokoll, das eine nicht erfolgte Loeschung festhaelt, ist schlimmer
  // als gar keines: es wird spaeter gelesen und geglaubt.
  //
  // `.select('id')` macht aus dem UPDATE eine Auskunft darueber, ob es
  // getroffen hat — ohne zweite Abfrage, und ohne die Wettlaufluecke, die
  // ein vorgeschaltetes Nachschlagen haette.
  const { data, error } = await supabase
    .from('akten_kontaktpersonen')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select('id')
    .maybeSingle()
  if (error) throw new Error(`Kontaktperson konnte nicht gelöscht werden: ${error.message}`)
  if (!data) throw new UserFacingError('Kontaktperson nicht gefunden.', 404)

  await logAktenZugriff(supabase, {
    organizationId, entitaetTyp: 'kontaktperson', entitaetId: id, aktion: 'geloescht',
    benutzerId: actorId, benutzerRolle: actorRole,
  })
}
