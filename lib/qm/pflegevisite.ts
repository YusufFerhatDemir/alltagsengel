// ═══════════════════════════════════════════════════════════════
// Qualitaetsmanagement — Pflegevisite (§ 113 SGB XI)
//
// Die interne, strukturierte Qualitaetspruefung beim Klienten: planen,
// durchfuehren, Befunde je Pruefpunkt festhalten, auswerten, abschliessen.
// Nach dem Abschluss ist die Visite unveraenderlich.
//
// ── DIE ROLLENTRENNUNG IST HIER KEIN BEIWERK ──────────────────────────
// `lib/auth/rollen.ts` haelt fuer die Rolle `qm` fest: „prueft,
// dokumentiert Befunde, aendert aber die geprueften Daten NICHT — sonst
// pruefte es die eigene Korrektur. Schreibrecht nur im eigenen
// QM-Bestand." Dieses Modul schreibt deshalb NIRGENDWO in
// `pflege_massnahmen`, `pflege_verlauf` oder sonst einen Pflegebestand.
//
// Ein Befund kann eine Massnahme ANTRAGEN (`massnahme_beantragt`); wer
// `pflege.schreiben` hat — die Pflegedienstleitung — legt sie an und
// verknuepft sie ueber `verknuepfeMassnahme()` zurueck. Das ist der
// Regelkreis: Feststellung und Abstellung liegen in verschiedenen Haenden.
//
// ── MANDANTENZAUN ─────────────────────────────────────────────────────
// Die Routen fahren mit `createAdminClient()` (BYPASSRLS). Der Zaun ist
// hier deshalb KEINE Policy, sondern `.eq('organization_id', …)` in jeder
// Abfrage plus `assertClientInOrg()` vor dem Anlegen — dieselbe Stelle,
// an der lib/pflege und lib/personal ihn ebenfalls haben.
// ═══════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { UserFacingError } from '@/lib/api/user-facing-error'
import { clientGehoertZuOrg } from '@/lib/clients/organization-guard'
import { caregiverGehoertZuOrg } from '@/lib/personal/organization-guard'
import { heuteBerlin } from '@/lib/utils/timezone'
import {
  assertErlaubt,
  ABWEICHENDE_BEWERTUNGEN,
  BEFUNDBEWERTUNG_WERTE,
  GESAMTBEWERTUNG_WERTE,
  PRUEFPUNKT_WERTE,
  VISITE_TYP_WERTE,
  type Befundbewertung,
  type Gesamtbewertung,
  type Pruefpunkt,
  type QmPflegevisite,
  type QmVisiteBefund,
  type VisiteStatus,
  type VisiteTyp,
} from './types'

/**
 * Erlaubte Statuswechsel. `abgeschlossen` und `abgesagt` sind Endzustaende
 * — eine abgeschlossene Pruefung wieder zu oeffnen hiesse, das Ergebnis
 * nachtraeglich zu verhandeln. Dafuer gibt es die Nachvisite.
 */
const ERLAUBTE_UEBERGAENGE: Record<VisiteStatus, VisiteStatus[]> = {
  geplant:       ['durchgefuehrt', 'abgesagt'],
  durchgefuehrt: ['ausgewertet', 'abgesagt'],
  ausgewertet:   ['abgeschlossen'],
  abgeschlossen: [],
  abgesagt:      [],
}

export function validateVisiteUebergang(von: VisiteStatus, nach: VisiteStatus): void {
  if (von === nach) return
  if (!ERLAUBTE_UEBERGAENGE[von]?.includes(nach)) {
    throw new UserFacingError(
      `Statuswechsel von "${von}" zu "${nach}" ist nicht vorgesehen.`,
      409,
    )
  }
}

/**
 * Die Migration ist eingecheckt, aber nicht angewendet — solange kennt die
 * Datenbank die Tabellen nicht. Statt der rohen PostgREST-Meldung
 * („relation public.qm_pflegevisiten does not exist", Fehlercode 42P01)
 * bekommt der Aufrufer einen Satz, aus dem hervorgeht, was zu tun ist.
 */
function pruefeTabellenVorhanden(error: { code?: string; message?: string } | null): void {
  if (error?.code !== '42P01') return
  throw new UserFacingError(
    'Das Pflegevisiten-Modul ist in dieser Datenbank noch nicht eingerichtet. '
    + 'Migration 20260829005600 ist noch nicht angewendet.',
    503,
  )
}

async function assertClientInOrg(
  supabase: SupabaseClient, clientId: string | null | undefined, organizationId: string,
): Promise<void> {
  if (!clientId?.trim()) throw new UserFacingError('Betreute Person ist ein Pflichtfeld.', 400)
  if (!(await clientGehoertZuOrg(supabase, clientId, organizationId))) {
    // 404 statt 403: die Unterscheidung „gibt es nicht" / „gehoert jemand
    // anderem" waere selbst schon eine Auskunft ueber fremde Bestaende.
    throw new UserFacingError('Betreute Person nicht gefunden.', 404)
  }
}

// ─────────────────────────────────────────────────────────────────
// Visite
// ─────────────────────────────────────────────────────────────────

export interface CreateVisiteParams {
  organizationId: string
  clientId: string
  caregiverId?: string | null
  visiteTyp?: VisiteTyp
  geplantAm?: string
  anlass?: string | null
  erstelltVon: string
}

export async function planeVisite(
  supabase: SupabaseClient, params: CreateVisiteParams,
): Promise<QmPflegevisite> {
  assertErlaubt(params.visiteTyp, VISITE_TYP_WERTE, 'visite_typ')
  await assertClientInOrg(supabase, params.clientId, params.organizationId)

  // Eine Anlassvisite ohne Anlass ist eine Regelvisite mit falschem
  // Etikett — und verfaelscht damit jede Auswertung nach Visitenart.
  if ((params.visiteTyp ?? 'regelvisite') === 'anlassvisite' && !params.anlass?.trim()) {
    throw new UserFacingError('Eine Anlassvisite braucht einen Anlass.', 400)
  }

  if (params.caregiverId) {
    if (!(await caregiverGehoertZuOrg(supabase, params.caregiverId, params.organizationId))) {
      throw new UserFacingError('Mitarbeiter nicht gefunden.', 404)
    }
  }

  const { data, error } = await supabase
    .from('qm_pflegevisiten')
    .insert({
      organization_id: params.organizationId,
      client_id: params.clientId,
      caregiver_id: params.caregiverId ?? null,
      visite_typ: params.visiteTyp ?? 'regelvisite',
      geplant_am: params.geplantAm ?? heuteBerlin(),
      anlass: params.anlass?.trim() || null,
      erstellt_von: params.erstelltVon,
    })
    .select('*')
    .single()
  pruefeTabellenVorhanden(error)
  if (error || !data) {
    throw new Error(`Pflegevisite konnte nicht geplant werden: ${error?.message ?? 'unbekannt'}`)
  }
  return data as QmPflegevisite
}

export interface ListVisitenFilter {
  organizationId: string
  clientId?: string
  status?: VisiteStatus
  visiteTyp?: VisiteTyp
  /** Nur Visiten, die noch nicht abgeschlossen oder abgesagt sind. */
  nurOffen?: boolean
  vonDatum?: string
  bisDatum?: string
}

export async function listVisiten(
  supabase: SupabaseClient, filter: ListVisitenFilter,
): Promise<QmPflegevisite[]> {
  let query = supabase
    .from('qm_pflegevisiten')
    .select('*')
    .eq('organization_id', filter.organizationId)
    .order('geplant_am', { ascending: false })
    .order('created_at', { ascending: false })

  if (filter.clientId) query = query.eq('client_id', filter.clientId)
  if (filter.status) query = query.eq('status', filter.status)
  if (filter.visiteTyp) query = query.eq('visite_typ', filter.visiteTyp)
  if (filter.nurOffen) query = query.in('status', ['geplant', 'durchgefuehrt', 'ausgewertet'])
  if (filter.vonDatum) query = query.gte('geplant_am', filter.vonDatum)
  if (filter.bisDatum) query = query.lte('geplant_am', filter.bisDatum)

  const { data, error } = await query
  pruefeTabellenVorhanden(error)
  if (error) throw new Error(`Pflegevisiten konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as QmPflegevisite[]
}

export async function getVisite(
  supabase: SupabaseClient, id: string, organizationId: string,
): Promise<QmPflegevisite | null> {
  const { data, error } = await supabase
    .from('qm_pflegevisiten')
    .select('*')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .maybeSingle()
  pruefeTabellenVorhanden(error)
  if (error) throw new Error(`Pflegevisite konnte nicht geladen werden: ${error.message}`)
  return (data as QmPflegevisite) ?? null
}

export interface UpdateVisiteParams {
  caregiverId?: string | null
  visiteTyp?: VisiteTyp
  geplantAm?: string
  durchgefuehrtAm?: string | null
  status?: VisiteStatus
  anlass?: string | null
  zusammenfassung?: string | null
  gesamtbewertung?: Gesamtbewertung | null
  durchgefuehrtVon?: string | null
}

export async function updateVisite(
  supabase: SupabaseClient,
  id: string,
  organizationId: string,
  patch: UpdateVisiteParams,
): Promise<QmPflegevisite> {
  const bestand = await getVisite(supabase, id, organizationId)
  if (!bestand) throw new UserFacingError('Pflegevisite nicht gefunden.', 404)

  // Der Riegel steht ZWEIMAL: hier fuer die lesbare Meldung, und als
  // Trigger in der Datenbank fuer alles, was an dieser Funktion vorbei
  // schreibt. Nur der Trigger ist nicht umgehbar; nur diese Zeile ist
  // lesbar. Beide werden gebraucht.
  if (bestand.status === 'abgeschlossen') {
    throw new UserFacingError('Abgeschlossene Pflegevisite kann nicht mehr geändert werden.', 409)
  }

  assertErlaubt(patch.visiteTyp, VISITE_TYP_WERTE, 'visite_typ')
  assertErlaubt(patch.gesamtbewertung, GESAMTBEWERTUNG_WERTE, 'gesamtbewertung')
  if (patch.status) validateVisiteUebergang(bestand.status, patch.status)

  if (patch.caregiverId) {
    if (!(await caregiverGehoertZuOrg(supabase, patch.caregiverId, organizationId))) {
      throw new UserFacingError('Mitarbeiter nicht gefunden.', 404)
    }
  }

  const update: Record<string, unknown> = {}
  if (patch.caregiverId !== undefined) update.caregiver_id = patch.caregiverId
  if (patch.visiteTyp !== undefined) update.visite_typ = patch.visiteTyp
  if (patch.geplantAm !== undefined) update.geplant_am = patch.geplantAm
  if (patch.durchgefuehrtAm !== undefined) update.durchgefuehrt_am = patch.durchgefuehrtAm
  if (patch.status !== undefined) update.status = patch.status
  if (patch.anlass !== undefined) update.anlass = patch.anlass
  if (patch.zusammenfassung !== undefined) update.zusammenfassung = patch.zusammenfassung
  if (patch.gesamtbewertung !== undefined) update.gesamtbewertung = patch.gesamtbewertung
  if (patch.durchgefuehrtVon !== undefined) update.durchgefuehrt_von = patch.durchgefuehrtVon

  if (Object.keys(update).length === 0) throw new UserFacingError('Keine Änderungen übergeben.', 400)

  const { data, error } = await supabase
    .from('qm_pflegevisiten')
    .update(update)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select('*')
    .single()
  if (error || !data) {
    const msg = error?.message ?? 'unbekannt'
    if (msg.includes('Abgeschlossene Pflegevisite')) {
      throw new UserFacingError('Abgeschlossene Pflegevisite kann nicht mehr geändert werden.', 409)
    }
    if (msg.includes('qm_pflegevisiten_durchgefuehrt_datum')) {
      throw new UserFacingError('Eine durchgeführte Visite braucht ein Durchführungsdatum.', 400)
    }
    throw new Error(`Pflegevisite konnte nicht aktualisiert werden: ${msg}`)
  }
  return data as QmPflegevisite
}

/**
 * Durchfuehrung festhalten: Datum und pruefende Person.
 *
 * Bewusst ein eigener Schritt und nicht Teil des Abschlusses — zwischen
 * Besuch und Auswertung liegen in der Praxis Tage, und das Datum des
 * Besuchs ist es, das die Frist der naechsten Visite bestimmt.
 */
export async function fuehreVisiteDurch(
  supabase: SupabaseClient,
  id: string,
  organizationId: string,
  durchgefuehrtVon: string,
  durchgefuehrtAm?: string,
): Promise<QmPflegevisite> {
  const datum = durchgefuehrtAm ?? heuteBerlin()
  if (datum > heuteBerlin()) {
    throw new UserFacingError('Eine Visite kann nicht für die Zukunft als durchgeführt gemeldet werden.', 400)
  }
  return updateVisite(supabase, id, organizationId, {
    status: 'durchgefuehrt', durchgefuehrtAm: datum, durchgefuehrtVon,
  })
}

/**
 * Auswertung: Gesamturteil und Zusammenfassung.
 *
 * Das Urteil faellt die pruefende Person, es wird NICHT aus den
 * Einzelbefunden gerechnet — ein einzelner schwerer Befund kann eine sonst
 * gute Visite kippen, und eine Formel kann das nicht wissen. Was die
 * Funktion dagegen erzwingt: ohne Befunde gibt es kein Urteil, und ein
 * „ohne Beanstandung" vertraegt sich nicht mit einem offenen „nicht
 * erfuellt". Beides waere ein Widerspruch im eigenen Dokument.
 */
export async function werteVisiteAus(
  supabase: SupabaseClient,
  id: string,
  organizationId: string,
  bewertung: Gesamtbewertung,
  zusammenfassung?: string | null,
): Promise<QmPflegevisite> {
  assertErlaubt(bewertung, GESAMTBEWERTUNG_WERTE, 'gesamtbewertung')

  const befunde = await listBefunde(supabase, id, organizationId)
  if (befunde.length === 0) {
    throw new UserFacingError('Eine Visite ohne Befunde kann nicht ausgewertet werden.', 409)
  }
  const abweichungen = befunde.filter(b => ABWEICHENDE_BEWERTUNGEN.includes(b.bewertung))
  if (bewertung === 'ohne_beanstandung' && abweichungen.length > 0) {
    throw new UserFacingError(
      `„Ohne Beanstandung" ist nicht möglich: ${abweichungen.length} Prüfpunkt(e) sind als abweichend bewertet.`,
      409,
    )
  }

  return updateVisite(supabase, id, organizationId, {
    status: 'ausgewertet', gesamtbewertung: bewertung, zusammenfassung: zusammenfassung ?? null,
  })
}

/**
 * Abschluss — ab hier ist die Visite ein Pruefergebnis und unveraenderlich.
 *
 * FAIL-CLOSED: jeder abweichende Befund braucht eine Empfehlung UND eine
 * Frist. Eine festgestellte Abweichung ohne Termin ist keine
 * Qualitaetssicherung, sondern eine Notiz — und genau das wirft der
 * Medizinische Dienst einem Dienst bei der Pruefung vor.
 */
export async function schliesseVisiteAb(
  supabase: SupabaseClient,
  id: string,
  organizationId: string,
  abgeschlossenVon: string,
): Promise<QmPflegevisite> {
  const bestand = await getVisite(supabase, id, organizationId)
  if (!bestand) throw new UserFacingError('Pflegevisite nicht gefunden.', 404)
  if (bestand.status === 'abgeschlossen') {
    throw new UserFacingError('Pflegevisite ist bereits abgeschlossen.', 409)
  }
  validateVisiteUebergang(bestand.status, 'abgeschlossen')

  const befunde = await listBefunde(supabase, id, organizationId)
  const ohneAbstellung = befunde.filter(
    b => ABWEICHENDE_BEWERTUNGEN.includes(b.bewertung) && (!b.empfehlung?.trim() || !b.frist),
  )
  if (ohneAbstellung.length > 0) {
    throw new UserFacingError(
      `${ohneAbstellung.length} abweichende(r) Befund(e) ohne Empfehlung oder Frist. `
      + 'Eine festgestellte Abweichung braucht eine Maßnahme und einen Termin.',
      409,
    )
  }

  const { data, error } = await supabase
    .from('qm_pflegevisiten')
    .update({
      status: 'abgeschlossen',
      abgeschlossen_am: new Date().toISOString(),
      abgeschlossen_von: abgeschlossenVon,
    })
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select('*')
    .single()
  if (error || !data) {
    throw new Error(`Pflegevisite konnte nicht abgeschlossen werden: ${error?.message ?? 'unbekannt'}`)
  }
  return data as QmPflegevisite
}

// ─────────────────────────────────────────────────────────────────
// Befunde
// ─────────────────────────────────────────────────────────────────

/** Wirft, wenn die Visite fehlt oder bereits abgeschlossen ist. */
async function assertVisiteOffen(
  supabase: SupabaseClient, visiteId: string, organizationId: string,
): Promise<QmPflegevisite> {
  const visite = await getVisite(supabase, visiteId, organizationId)
  if (!visite) throw new UserFacingError('Pflegevisite nicht gefunden.', 404)
  if (visite.status === 'abgeschlossen') {
    throw new UserFacingError(
      'Zu einer abgeschlossenen Pflegevisite kann kein Befund mehr erfasst oder geändert werden. '
      + 'Dafür ist eine Nachvisite vorgesehen.',
      409,
    )
  }
  return visite
}

export interface CreateBefundParams {
  organizationId: string
  visiteId: string
  pruefpunkt: Pruefpunkt
  bewertung: Befundbewertung
  feststellung?: string | null
  empfehlung?: string | null
  frist?: string | null
  massnahmeBeantragt?: boolean
  erstelltVon: string
}

export async function erfasseBefund(
  supabase: SupabaseClient, params: CreateBefundParams,
): Promise<QmVisiteBefund> {
  assertErlaubt(params.pruefpunkt, PRUEFPUNKT_WERTE, 'pruefpunkt')
  assertErlaubt(params.bewertung, BEFUNDBEWERTUNG_WERTE, 'bewertung')
  await assertVisiteOffen(supabase, params.visiteId, params.organizationId)

  // Dieselbe Regel wie der CHECK `qm_visite_befunde_feststellung_belegt`
  // — hier fuer die lesbare Meldung, dort fuer alles, was an dieser
  // Funktion vorbei schreibt.
  if (ABWEICHENDE_BEWERTUNGEN.includes(params.bewertung) && !params.feststellung?.trim()) {
    throw new UserFacingError(
      'Eine Abweichung braucht eine Feststellung im Klartext.', 400,
    )
  }

  const { data, error } = await supabase
    .from('qm_visite_befunde')
    .insert({
      organization_id: params.organizationId,
      visite_id: params.visiteId,
      pruefpunkt: params.pruefpunkt,
      bewertung: params.bewertung,
      feststellung: params.feststellung?.trim() || null,
      empfehlung: params.empfehlung?.trim() || null,
      frist: params.frist ?? null,
      massnahme_beantragt: params.massnahmeBeantragt ?? false,
      erstellt_von: params.erstelltVon,
    })
    .select('*')
    .single()
  if (error || !data) {
    const msg = error?.message ?? 'unbekannt'
    if (error?.code === '23505' || msg.includes('qm_visite_befunde_punkt_unique')) {
      throw new UserFacingError(
        'Dieser Prüfpunkt ist in der Visite bereits bewertet. Bitte den bestehenden Befund ändern.',
        409,
      )
    }
    throw new Error(`Befund konnte nicht erfasst werden: ${msg}`)
  }
  return data as QmVisiteBefund
}

export async function listBefunde(
  supabase: SupabaseClient, visiteId: string, organizationId: string,
): Promise<QmVisiteBefund[]> {
  const { data, error } = await supabase
    .from('qm_visite_befunde')
    .select('*')
    .eq('visite_id', visiteId)
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: true })
  pruefeTabellenVorhanden(error)
  if (error) throw new Error(`Befunde konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as QmVisiteBefund[]
}

export interface UpdateBefundParams {
  bewertung?: Befundbewertung
  feststellung?: string | null
  empfehlung?: string | null
  frist?: string | null
  massnahmeBeantragt?: boolean
}

export async function aendereBefund(
  supabase: SupabaseClient,
  id: string,
  organizationId: string,
  patch: UpdateBefundParams,
): Promise<QmVisiteBefund> {
  const bestand = await getBefund(supabase, id, organizationId)
  if (!bestand) throw new UserFacingError('Befund nicht gefunden.', 404)
  await assertVisiteOffen(supabase, bestand.visite_id, organizationId)

  assertErlaubt(patch.bewertung, BEFUNDBEWERTUNG_WERTE, 'bewertung')

  const bewertung = patch.bewertung ?? bestand.bewertung
  const feststellung = patch.feststellung !== undefined ? patch.feststellung : bestand.feststellung
  if (ABWEICHENDE_BEWERTUNGEN.includes(bewertung) && !feststellung?.trim()) {
    throw new UserFacingError('Eine Abweichung braucht eine Feststellung im Klartext.', 400)
  }

  const update: Record<string, unknown> = {}
  if (patch.bewertung !== undefined) update.bewertung = patch.bewertung
  if (patch.feststellung !== undefined) update.feststellung = patch.feststellung
  if (patch.empfehlung !== undefined) update.empfehlung = patch.empfehlung
  if (patch.frist !== undefined) update.frist = patch.frist
  if (patch.massnahmeBeantragt !== undefined) update.massnahme_beantragt = patch.massnahmeBeantragt

  if (Object.keys(update).length === 0) throw new UserFacingError('Keine Änderungen übergeben.', 400)

  const { data, error } = await supabase
    .from('qm_visite_befunde')
    .update(update)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select('*')
    .single()
  if (error || !data) throw new Error(`Befund konnte nicht geändert werden: ${error?.message ?? 'unbekannt'}`)
  return data as QmVisiteBefund
}

export async function getBefund(
  supabase: SupabaseClient, id: string, organizationId: string,
): Promise<QmVisiteBefund | null> {
  const { data, error } = await supabase
    .from('qm_visite_befunde')
    .select('*')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .maybeSingle()
  pruefeTabellenVorhanden(error)
  if (error) throw new Error(`Befund konnte nicht geladen werden: ${error.message}`)
  return (data as QmVisiteBefund) ?? null
}

/**
 * DER REGELKREIS — die Antwort der Pflegedienstleitung auf einen Befund.
 *
 * QM stellt fest und beantragt; die Massnahme selbst legt an, wer
 * `pflege.schreiben` hat. Diese Funktion verknuepft die vorhandene
 * Massnahme mit dem Befund und traegt die Erledigung nach. Sie legt
 * **keine** Massnahme an — das waere genau die Vermischung, die die
 * Rollenmatrix ausschliesst.
 *
 * Sie funktioniert AUCH an einer bereits abgeschlossenen Visite: die
 * Abstellung geschieht naturgemaess NACH der Pruefung, und der DB-Trigger
 * laesst deshalb ausdruecklich `massnahme_id` und `erledigt_am` offen.
 */
export async function verknuepfeMassnahme(
  supabase: SupabaseClient,
  befundId: string,
  organizationId: string,
  massnahmeId: string | null,
  erledigtAm?: string | null,
): Promise<QmVisiteBefund> {
  const bestand = await getBefund(supabase, befundId, organizationId)
  if (!bestand) throw new UserFacingError('Befund nicht gefunden.', 404)

  if (massnahmeId) {
    // Die Massnahme muss im eigenen Mandanten liegen — sonst zeigte der
    // Befund auf einen fremden Pflegebestand.
    const { data } = await supabase
      .from('pflege_massnahmen')
      .select('id')
      .eq('id', massnahmeId)
      .eq('organization_id', organizationId)
      .maybeSingle()
    if (!data) throw new UserFacingError('Maßnahme nicht gefunden.', 404)
  }

  const update: Record<string, unknown> = { massnahme_id: massnahmeId }
  if (erledigtAm !== undefined) update.erledigt_am = erledigtAm

  const { data, error } = await supabase
    .from('qm_visite_befunde')
    .update(update)
    .eq('id', befundId)
    .eq('organization_id', organizationId)
    .select('*')
    .single()
  if (error || !data) {
    throw new Error(`Maßnahme konnte nicht verknüpft werden: ${error?.message ?? 'unbekannt'}`)
  }
  return data as QmVisiteBefund
}

// ─────────────────────────────────────────────────────────────────
// Auswertung
// ─────────────────────────────────────────────────────────────────

export interface OffeneAbweichung {
  befund: QmVisiteBefund
  visiteId: string
  clientId: string
  ueberfaellig: boolean
}

/**
 * Die eigentliche Arbeitsliste des Qualitaetsmanagements: alle
 * festgestellten Abweichungen, die noch nicht erledigt sind — mit dem
 * Hinweis, welche ihre Frist gerissen haben.
 *
 * Ohne diese Liste ist eine Visite ein Dokument im Ordner. Mit ihr ist sie
 * ein Vorgang, der nachverfolgt wird — und genau das ist der Unterschied
 * zwischen Dokumentation und Qualitaetssicherung.
 */
export async function listOffeneAbweichungen(
  supabase: SupabaseClient, organizationId: string, stichtag?: string,
): Promise<OffeneAbweichung[]> {
  const heute = stichtag ?? heuteBerlin()

  const { data, error } = await supabase
    .from('qm_visite_befunde')
    .select('*')
    .eq('organization_id', organizationId)
    .in('bewertung', ABWEICHENDE_BEWERTUNGEN)
    .is('erledigt_am', null)
    .order('frist', { ascending: true })
  pruefeTabellenVorhanden(error)
  if (error) throw new Error(`Offene Abweichungen konnten nicht geladen werden: ${error.message}`)

  const befunde = (data ?? []) as QmVisiteBefund[]
  if (befunde.length === 0) return []

  // Die Klientenzuordnung haengt an der Visite; sie wird in EINER Abfrage
  // nachgeladen statt je Befund (sonst waere die Liste eine N+1-Falle).
  const visitenIds = [...new Set(befunde.map(b => b.visite_id))]
  const { data: visiten, error: visitenFehler } = await supabase
    .from('qm_pflegevisiten')
    .select('id, client_id')
    .eq('organization_id', organizationId)
    .in('id', visitenIds)
  if (visitenFehler) {
    throw new Error(`Visiten konnten nicht geladen werden: ${visitenFehler.message}`)
  }
  const klientJeVisite = new Map(
    ((visiten ?? []) as Array<{ id: string; client_id: string }>).map(v => [v.id, v.client_id]),
  )

  return befunde.map(befund => ({
    befund,
    visiteId: befund.visite_id,
    clientId: klientJeVisite.get(befund.visite_id) ?? '',
    // Ohne Frist ist nichts ueberfaellig — aber der Abschluss laesst eine
    // Abweichung ohne Frist gar nicht erst zu.
    ueberfaellig: !!befund.frist && befund.frist < heute,
  }))
}

export interface VisitenKennzahlen {
  gesamt: number
  offen: number
  abgeschlossen: number
  ohneBeanstandung: number
  mitAbweichung: number
  offeneAbweichungen: number
  ueberfaelligeAbweichungen: number
}

/**
 * Kennzahlen fuer das Qualitaets-Dashboard.
 *
 * Anders als `lib/analytics/quality.ts` zaehlt das hier nicht fremde
 * Bestaende, sondern die eigene Pruefleistung: wie viel wurde geprueft,
 * was kam dabei heraus, und was davon ist noch offen.
 */
export async function berechneVisitenKennzahlen(
  supabase: SupabaseClient, organizationId: string, zeitraum?: { von: string; bis: string },
): Promise<VisitenKennzahlen> {
  const visiten = await listVisiten(supabase, {
    organizationId,
    vonDatum: zeitraum?.von,
    bisDatum: zeitraum?.bis,
  })
  const offeneAbweichungen = await listOffeneAbweichungen(supabase, organizationId)

  return {
    gesamt: visiten.length,
    offen: visiten.filter(v => v.status !== 'abgeschlossen' && v.status !== 'abgesagt').length,
    abgeschlossen: visiten.filter(v => v.status === 'abgeschlossen').length,
    ohneBeanstandung: visiten.filter(v => v.gesamtbewertung === 'ohne_beanstandung').length,
    mitAbweichung: visiten.filter(
      v => v.gesamtbewertung === 'geringe_abweichung'
        || v.gesamtbewertung === 'erhebliche_abweichung'
        || v.gesamtbewertung === 'sofortmassnahme',
    ).length,
    offeneAbweichungen: offeneAbweichungen.length,
    ueberfaelligeAbweichungen: offeneAbweichungen.filter(a => a.ueberfaellig).length,
  }
}
