// ═══════════════════════════════════════════════════════════
// TOURENPLANUNG — serverseitige Geschäftslogik (DB-Zugriff)
// ═══════════════════════════════════════════════════════════
// Wird nur aus Route-Handlern unter /api/tours genutzt.
// Grundsatz: tours/tour_stops ordnen an, die Wahrheit über
// Zeitkonflikte bleibt der Trigger check_assignment_overlap
// auf assignments (wirft DOPPELBELEGUNG → HTTP 409).
// ═══════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { fahrtZwischenPlz } from './fahrtzeit'
import { istVerfuegbar, type Zeitfenster } from '@/lib/availability'

export interface StopInput {
  /** vorhandenen Einsatz anhängen … */
  assignment_id?: string
  /** … oder neuen Einsatz aus Klient + Zeiten erzeugen */
  client_id?: string
  geplante_ankunft?: string
  geplantes_ende?: string
  service_type?: string
  notes?: string
}

export interface AufgeloesterStop {
  assignment_id: string | null
  client_id: string | null
  geplante_ankunft: string | null
  geplantes_ende: string | null
  adresse: string | null
  plz: string | null
  notes: string | null
}

const TABELLEN_FEHLEN =
  'Tourenplanung-Tabellen fehlen noch auf der Datenbank — Migration 20260809120000_tourenplanung.sql anwenden.'

/** 42P01 (Tabelle fehlt) in eine verständliche Meldung übersetzen. */
export function uebersetzeDbFehler(error: { code?: string; message: string }): string {
  if (error.code === '42P01' && /tour/.test(error.message)) return TABELLEN_FEHLEN
  return error.message
}

/**
 * Stop-Eingaben auflösen: bestehende Assignments laden bzw. neue anlegen.
 * Neue Assignments laufen durch den Doppelbelegungs-Trigger — bei Konflikt
 * wirft Postgres DOPPELBELEGUNG, das reichen wir unverändert hoch.
 */
export async function aufloeseStops(
  admin: SupabaseClient,
  params: {
    stops: StopInput[]
    caregiverId: string
    tourDate: string
    organizationId: string
    createdBy: string
  }
): Promise<{ stops: AufgeloesterStop[]; fehler: string | null }> {
  const ergebnis: AufgeloesterStop[] = []

  for (const stop of params.stops) {
    if (stop.assignment_id) {
      const { data: a, error } = await admin
        .from('assignments')
        .select('id, client_id, caregiver_id, assignment_date, start_time, end_time, address, zip_code, clients:client_id(address, city, zip_code)')
        .eq('id', stop.assignment_id)
        .eq('organization_id', params.organizationId)
        .single()
      if (error || !a) {
        return { stops: [], fehler: `Einsatz ${stop.assignment_id} nicht gefunden.` }
      }
      if (a.caregiver_id !== params.caregiverId) {
        return { stops: [], fehler: `Einsatz ${stop.assignment_id} gehört einem anderen Mitarbeiter.` }
      }
      // Ein Einsatz eines anderen Tages würde die Tour mit fremden Zeiten
      // füllen — der Doppelbelegungs-Trigger greift dabei nicht (kein
      // INSERT/UPDATE auf assignments).
      if (a.assignment_date && a.assignment_date !== params.tourDate) {
        return {
          stops: [],
          fehler: `Einsatz ${stop.assignment_id} liegt am ${a.assignment_date}, die Tour am ${params.tourDate}.`,
        }
      }
      const client = Array.isArray(a.clients) ? a.clients[0] : a.clients
      ergebnis.push({
        assignment_id: a.id,
        client_id: a.client_id,
        geplante_ankunft: a.start_time,
        geplantes_ende: a.end_time,
        adresse: a.address ?? (client ? [client.address, client.city].filter(Boolean).join(', ') : null),
        plz: a.zip_code ?? client?.zip_code ?? null,
        notes: stop.notes ?? null,
      })
      continue
    }

    if (!stop.client_id || !stop.geplante_ankunft || !stop.geplantes_ende) {
      return { stops: [], fehler: 'Jeder Stop braucht assignment_id ODER client_id + geplante_ankunft + geplantes_ende.' }
    }

    const { data: client, error: clientError } = await admin
      .from('clients')
      .select('id, address, city, zip_code')
      .eq('id', stop.client_id)
      .eq('organization_id', params.organizationId)
      .single()
    if (clientError || !client) {
      return { stops: [], fehler: `Klient ${stop.client_id} nicht gefunden.` }
    }

    const { data: neu, error: insertError } = await admin
      .from('assignments')
      .insert({
        client_id: stop.client_id,
        caregiver_id: params.caregiverId,
        assignment_date: params.tourDate,
        start_time: stop.geplante_ankunft,
        end_time: stop.geplantes_ende,
        service_type: stop.service_type || 'Alltagsbegleitung',
        status: 'GEPLANT',
        is_recurring: false,
        address: [client.address, client.city].filter(Boolean).join(', ') || null,
        zip_code: client.zip_code,
        organization_id: params.organizationId,
        created_by: params.createdBy,
        notes: stop.notes ?? null,
      })
      .select('id')
      .single()
    if (insertError || !neu) {
      return { stops: [], fehler: insertError?.message ?? 'Einsatz konnte nicht angelegt werden.' }
    }

    ergebnis.push({
      assignment_id: neu.id,
      client_id: stop.client_id,
      geplante_ankunft: stop.geplante_ankunft,
      geplantes_ende: stop.geplantes_ende,
      adresse: [client.address, client.city].filter(Boolean).join(', ') || null,
      plz: client.zip_code,
      notes: stop.notes ?? null,
    })
  }

  return { stops: ergebnis, fehler: null }
}

/** Fahrtzeiten entlang der Stop-Reihenfolge anreichern (Start = Mitarbeiter-PLZ). */
export function reichereFahrtzeitenAn<T extends { plz: string | null }>(
  stops: T[],
  startPlz: string | null
): (T & { fahrzeit_minuten: number | null; distanz_km: number | null })[] {
  return stops.map((stop, i) => {
    const vorherPlz = i === 0 ? startPlz : stops[i - 1].plz
    const fahrt = fahrtZwischenPlz(vorherPlz, stop.plz)
    return {
      ...stop,
      fahrzeit_minuten: fahrt?.fahrzeitMinuten ?? null,
      distanz_km: fahrt?.distanzKm ?? null,
    }
  })
}

/**
 * Fahrtzeiten aller Stops einer Tour neu berechnen und persistieren.
 * AUSGEFALLENE Stops werden übersprungen (die Route fährt an ihnen
 * vorbei) und ihre alten Werte geleert, damit Detailansicht und
 * Ausdruck keine Anfahrt zu einem entfallenen Halt mehr zeigen.
 */
export async function aktualisiereFahrtzeiten(
  admin: SupabaseClient,
  tourId: string,
  startPlz: string | null
): Promise<void> {
  const { data: stops } = await admin
    .from('tour_stops')
    .select('id, position, plz, status')
    .eq('tour_id', tourId)
    .order('position', { ascending: true })
  if (!stops) return

  const aktive = stops.filter(s => s.status !== 'AUSGEFALLEN')
  for (const s of reichereFahrtzeitenAn(aktive, startPlz)) {
    await admin
      .from('tour_stops')
      .update({ fahrzeit_minuten: s.fahrzeit_minuten, distanz_km: s.distanz_km })
      .eq('id', s.id)
  }

  const entfallen = stops.filter(s => s.status === 'AUSGEFALLEN').map(s => s.id)
  if (entfallen.length > 0) {
    await admin
      .from('tour_stops')
      .update({ fahrzeit_minuten: null, distanz_km: null })
      .in('id', entfallen)
  }
}

/** Einsatz-Status, die nicht mehr storniert werden dürfen. */
const NICHT_MEHR_STORNIERBAR = ['BEENDET', 'STORNIERT', 'cancelled', 'NO_SHOW']

/**
 * Einsätze stornieren, die aus einer Tour herausfallen (Stop entfernt,
 * Stop AUSGEFALLEN, Tour storniert).
 *
 * Ohne das bleibt das assignment auf GEPLANT stehen: es blockiert über
 * check_assignment_overlap weiterhin die Zeit des Mitarbeiters und
 * erscheint in Kalender und Engel-App als gültiger Termin.
 *
 * Storniert wird nur, wenn KEIN anderer Stop den Einsatz noch nutzt —
 * `ignoriereStopIds` nimmt die Stops aus, die gerade wegfallen.
 */
export async function storniereGeloesteAssignments(
  admin: SupabaseClient,
  assignmentIds: (string | null)[],
  optionen: { ignoriereStopIds?: string[] } = {}
): Promise<void> {
  const ids = [...new Set(assignmentIds.filter((a): a is string => !!a))]
  if (ids.length === 0) return

  const { data: verknuepfte } = await admin
    .from('tour_stops')
    .select('id, assignment_id, status')
    .in('assignment_id', ids)

  const ignoriert = new Set(optionen.ignoriereStopIds ?? [])
  const nochGenutzt = new Set(
    (verknuepfte ?? [])
      .filter(s => !ignoriert.has(s.id) && s.status !== 'AUSGEFALLEN')
      .map(s => s.assignment_id as string)
  )

  const frei = ids.filter(id => !nochGenutzt.has(id))
  if (frei.length === 0) return

  await admin
    .from('assignments')
    .update({ status: 'STORNIERT' })
    .in('id', frei)
    .not('status', 'in', `(${NICHT_MEHR_STORNIERBAR.join(',')})`)
}

export interface VerfuegbarkeitsBefund {
  abwesend: boolean
  abwesenheitsGrund: string | null
  ausserhalbZeitfenster: boolean
}

/**
 * Verfügbarkeit eines Mitarbeiters am Tourtag prüfen:
 * genehmigte/gemeldete Abwesenheit blockiert, gepflegte
 * angel_availability-Zeitfenster geben eine Warnung.
 */
export async function pruefeCaregiverVerfuegbarkeit(
  admin: SupabaseClient,
  caregiverId: string,
  tourDate: string,
  startZeit: string | null,
  endeZeit: string | null
): Promise<VerfuegbarkeitsBefund> {
  const befund: VerfuegbarkeitsBefund = {
    abwesend: false,
    abwesenheitsGrund: null,
    ausserhalbZeitfenster: false,
  }

  const { data: abwesenheiten } = await admin
    .from('absences')
    .select('absence_type, status, start_date, end_date')
    .eq('caregiver_id', caregiverId)
    .lte('start_date', tourDate)
    .or(`end_date.gte.${tourDate},end_date.is.null`)
  const aktiv = (abwesenheiten ?? []).filter(a => a.status !== 'ABGELEHNT' && a.status !== 'rejected')
  if (aktiv.length > 0) {
    befund.abwesend = true
    befund.abwesenheitsGrund = aktiv.map(a => a.absence_type).join(', ')
  }

  if (startZeit && endeZeit) {
    const { data: caregiver } = await admin
      .from('caregivers')
      .select('user_id')
      .eq('id', caregiverId)
      .single()
    if (caregiver?.user_id) {
      const { data: fenster } = await admin
        .from('angel_availability')
        .select('weekday, start_time, end_time')
        .eq('angel_id', caregiver.user_id)
      if (fenster && fenster.length > 0) {
        const start = startZeit.slice(0, 5)
        const dauerStunden =
          (Number(endeZeit.slice(0, 2)) * 60 + Number(endeZeit.slice(3, 5))
            - Number(startZeit.slice(0, 2)) * 60 - Number(startZeit.slice(3, 5))) / 60
        if (dauerStunden > 0 && !istVerfuegbar(fenster as Zeitfenster[], null, tourDate, start, dauerStunden)) {
          befund.ausserhalbZeitfenster = true
        }
      }
    }
  }

  return befund
}

export interface VertretungsKandidat {
  caregiver_id: string
  name: string
  bevorzugt: boolean
  prioritaet: number | null
  abwesend: boolean
  hat_fahrzeug: boolean
}

/**
 * Vertretungskandidaten für eine Tour: bevorzugte Vertretungen der
 * betroffenen Klienten zuerst (client_preferred_substitutes), dann
 * alle übrigen aktiven, einsatzfreigegebenen Mitarbeiter. Abwesende
 * werden markiert, nicht verschwiegen.
 */
export async function findeVertretungsKandidaten(
  admin: SupabaseClient,
  params: {
    organizationId: string
    tourDate: string
    ausgeschlossenCaregiverId: string
    clientIds: string[]
  }
): Promise<VertretungsKandidat[]> {
  const { data: caregivers } = await admin
    .from('caregivers')
    .select('id, first_name, last_name, status, einsatzfreigabe, has_vehicle')
    .eq('organization_id', params.organizationId)
    .eq('status', 'active')
    .neq('id', params.ausgeschlossenCaregiverId)

  if (!caregivers || caregivers.length === 0) return []

  const { data: bevorzugte } = params.clientIds.length > 0
    ? await admin
        .from('client_preferred_substitutes')
        .select('caregiver_id, priority')
        .in('client_id', params.clientIds)
    : { data: [] as { caregiver_id: string; priority: number | null }[] }

  const prioMap = new Map<string, number>()
  for (const b of bevorzugte ?? []) {
    const bisher = prioMap.get(b.caregiver_id)
    const prio = b.priority ?? 99
    if (bisher === undefined || prio < bisher) prioMap.set(b.caregiver_id, prio)
  }

  const { data: abwesenheiten } = await admin
    .from('absences')
    .select('caregiver_id, status')
    .lte('start_date', params.tourDate)
    .or(`end_date.gte.${params.tourDate},end_date.is.null`)
  const abwesend = new Set(
    (abwesenheiten ?? [])
      .filter(a => a.status !== 'ABGELEHNT' && a.status !== 'rejected')
      .map(a => a.caregiver_id)
  )

  return caregivers
    .filter(c => c.einsatzfreigabe !== false)
    .map(c => ({
      caregiver_id: c.id,
      name: [c.first_name, c.last_name].filter(Boolean).join(' '),
      bevorzugt: prioMap.has(c.id),
      prioritaet: prioMap.get(c.id) ?? null,
      abwesend: abwesend.has(c.id),
      hat_fahrzeug: c.has_vehicle === true,
    }))
    .sort((a, b) => {
      if (a.abwesend !== b.abwesend) return a.abwesend ? 1 : -1
      if (a.bevorzugt !== b.bevorzugt) return a.bevorzugt ? -1 : 1
      return (a.prioritaet ?? 99) - (b.prioritaet ?? 99)
    })
}
