import { UserFacingError } from '@/lib/api/user-facing-error'
// ═══════════════════════════════════════════════════════════════
// Vertragsverwaltung — akten_vertraege
// CRUD, Status-Workflow, Unterschrift mit anschließender Sperre
// ═══════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { logAktenZugriff } from './zugriff-log'
import type { AktenVertrag, SignaturTyp, VertragsStatus, VertragsTyp } from './types'
import { heuteBerlin } from '@/lib/utils/timezone';

// Erlaubte Status-Übergänge (Statusmaschine, analog lib/billing/core/*)
const ERLAUBTE_UEBERGAENGE: Record<VertragsStatus, VertragsStatus[]> = {
  entwurf: ['versendet', 'storniert'],
  versendet: ['unterschrieben', 'entwurf', 'storniert'],
  unterschrieben: ['aktiv', 'gekuendigt'],
  aktiv: ['gekuendigt', 'beendet'],
  gekuendigt: ['beendet'],
  beendet: [],
  storniert: [],
}

export function validateVertragsUebergang(von: VertragsStatus, nach: VertragsStatus): void {
  if (von === nach) return
  if (!ERLAUBTE_UEBERGAENGE[von]?.includes(nach)) {
    throw new Error(`Statuswechsel von "${von}" zu "${nach}" ist nicht erlaubt.`)
  }
}

export interface CreateVertragParams {
  organizationId: string
  clientId?: string | null
  caregiverId?: string | null
  titel: string
  vertragstyp: VertragsTyp
  vertragsnummer?: string | null
  vertragsbeginn?: string | null
  vertragsende?: string | null
  kuendigungsfristTage?: number | null
  autoVerlaengerung?: boolean
  dokumentId?: string | null
  pdfUrl?: string | null
  bemerkung?: string | null
  erstelltVon: string
  actorRole?: string
}

export async function createVertrag(supabase: SupabaseClient, params: CreateVertragParams): Promise<AktenVertrag> {
  if (params.clientId && params.caregiverId) {
    throw new UserFacingError('Ein Vertrag kann nicht gleichzeitig Kunde und Mitarbeiter zugeordnet sein.')
  }

  const { data, error } = await supabase
    .from('akten_vertraege')
    .insert({
      organization_id: params.organizationId,
      client_id: params.clientId ?? null,
      caregiver_id: params.caregiverId ?? null,
      titel: params.titel,
      vertragstyp: params.vertragstyp,
      vertragsnummer: params.vertragsnummer ?? null,
      vertragsbeginn: params.vertragsbeginn ?? null,
      vertragsende: params.vertragsende ?? null,
      kuendigungsfrist_tage: params.kuendigungsfristTage ?? null,
      auto_verlaengerung: params.autoVerlaengerung ?? false,
      dokument_id: params.dokumentId ?? null,
      pdf_url: params.pdfUrl ?? null,
      bemerkung: params.bemerkung ?? null,
      erstellt_von: params.erstelltVon,
    })
    .select('*')
    .single()
  if (error || !data) throw new Error(`Vertrag konnte nicht angelegt werden: ${error?.message ?? 'unbekannt'}`)

  await logAktenZugriff(supabase, {
    organizationId: params.organizationId, entitaetTyp: 'vertrag', entitaetId: data.id,
    aktion: 'hochgeladen', benutzerId: params.erstelltVon, benutzerRolle: params.actorRole,
    vertragId: data.id, details: { titel: params.titel, vertragstyp: params.vertragstyp },
  })

  return data as AktenVertrag
}

export interface ListVertraegeFilter {
  organizationId: string
  clientId?: string
  caregiverId?: string
  status?: VertragsStatus
  vertragstyp?: VertragsTyp
  auslaufendBis?: string
  /** Siehe `ListDokumenteFilter.ohnePersonaldokumente` — Arbeitsvertraege
   *  sind Personalakte und gehen `stammdaten.lesen` allein nichts an. */
  ohnePersonaldokumente?: boolean
}

export async function listVertraege(supabase: SupabaseClient, filter: ListVertraegeFilter): Promise<AktenVertrag[]> {
  let query = supabase
    .from('akten_vertraege')
    .select('*')
    .eq('organization_id', filter.organizationId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (filter.ohnePersonaldokumente) query = query.is('caregiver_id', null)
  if (filter.clientId) query = query.eq('client_id', filter.clientId)
  if (filter.caregiverId) query = query.eq('caregiver_id', filter.caregiverId)
  if (filter.status) query = query.eq('status', filter.status)
  if (filter.vertragstyp) query = query.eq('vertragstyp', filter.vertragstyp)
  if (filter.auslaufendBis) query = query.lte('vertragsende', filter.auslaufendBis)

  const { data, error } = await query
  if (error) throw new Error(`Verträge konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as AktenVertrag[]
}

export async function getVertrag(supabase: SupabaseClient, id: string, organizationId: string): Promise<AktenVertrag | null> {
  const { data, error } = await supabase
    .from('akten_vertraege')
    .select('*')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw new Error(`Vertrag konnte nicht geladen werden: ${error.message}`)
  return data as AktenVertrag | null
}

export interface UpdateVertragParams {
  titel?: string
  status?: VertragsStatus
  vertragsbeginn?: string | null
  vertragsende?: string | null
  kuendigungsfristTage?: number | null
  autoVerlaengerung?: boolean
  bemerkung?: string | null
}

export async function updateVertrag(
  supabase: SupabaseClient,
  id: string,
  organizationId: string,
  patch: UpdateVertragParams,
  actorId: string,
  actorRole?: string
): Promise<AktenVertrag> {
  const existing = await getVertrag(supabase, id, organizationId)
  if (!existing) throw new UserFacingError('Vertrag nicht gefunden.')
  // Gesperrt (= unterschrieben) schützt nur die Kerndaten (Titel, Laufzeitbeginn) —
  // Statusfolgeschritte (unterschrieben → aktiv → gekündigt/beendet) bleiben möglich.
  // Die DB (trg_locked_contract) erzwingt dasselbe zusätzlich auf Tabellenebene.
  if (existing.gesperrt && (patch.titel !== undefined || patch.vertragsbeginn !== undefined)) {
    throw new UserFacingError('Unterschriebener Vertrag ist gesperrt — Kerndaten können nicht mehr geändert werden.')
  }
  if (patch.status) validateVertragsUebergang(existing.status, patch.status)

  const update: Record<string, unknown> = {}
  if (patch.titel !== undefined) update.titel = patch.titel
  if (patch.status !== undefined) update.status = patch.status
  if (patch.vertragsbeginn !== undefined) update.vertragsbeginn = patch.vertragsbeginn
  if (patch.vertragsende !== undefined) update.vertragsende = patch.vertragsende
  if (patch.kuendigungsfristTage !== undefined) update.kuendigungsfrist_tage = patch.kuendigungsfristTage
  if (patch.autoVerlaengerung !== undefined) update.auto_verlaengerung = patch.autoVerlaengerung
  if (patch.bemerkung !== undefined) update.bemerkung = patch.bemerkung

  const { data, error } = await supabase
    .from('akten_vertraege')
    .update(update)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select('*')
    .single()
  if (error || !data) throw new Error(`Vertrag konnte nicht aktualisiert werden: ${error?.message ?? 'unbekannt'}`)

  await logAktenZugriff(supabase, {
    organizationId, entitaetTyp: 'vertrag', entitaetId: id, aktion: 'bearbeitet',
    benutzerId: actorId, benutzerRolle: actorRole, vertragId: id, details: patch as Record<string, unknown>,
  })

  return data as AktenVertrag
}

// ---------------------------------------------------------------------------
// Unterschrift — sperrt den Vertrag danach unwiderruflich (bis auf Status-Folgeschritte)
// ---------------------------------------------------------------------------

export interface UnterschreibenParams {
  unterschriebenVon: string
  signaturTyp: SignaturTyp
  signaturDaten?: Record<string, unknown> | null
  unterschriftDatum?: string
  actorId: string
  actorRole?: string
}

export async function vertragUnterschreiben(
  supabase: SupabaseClient,
  id: string,
  organizationId: string,
  params: UnterschreibenParams
): Promise<AktenVertrag> {
  const existing = await getVertrag(supabase, id, organizationId)
  if (!existing) throw new UserFacingError('Vertrag nicht gefunden.')
  if (existing.gesperrt) throw new UserFacingError('Vertrag ist bereits unterschrieben und gesperrt.')
  validateVertragsUebergang(existing.status, 'unterschrieben')

  const { data, error } = await supabase
    .from('akten_vertraege')
    .update({
      status: 'unterschrieben',
      unterschrift_datum: params.unterschriftDatum ?? heuteBerlin(),
      unterschrieben_von: params.unterschriebenVon,
      signatur_typ: params.signaturTyp,
      signatur_daten: params.signaturDaten ?? null,
      gesperrt: true,
    })
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select('*')
    .single()
  if (error || !data) throw new Error(`Vertrag konnte nicht unterschrieben werden: ${error?.message ?? 'unbekannt'}`)

  await logAktenZugriff(supabase, {
    organizationId, entitaetTyp: 'vertrag', entitaetId: id, aktion: 'unterschrieben',
    benutzerId: params.actorId, benutzerRolle: params.actorRole, vertragId: id,
    details: { unterschrieben_von: params.unterschriebenVon, signatur_typ: params.signaturTyp },
  })

  return data as AktenVertrag
}
