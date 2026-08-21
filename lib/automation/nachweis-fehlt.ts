/**
 * Kette 1 — Fehlender Leistungsnachweis nach X Tagen → Aufgabe an Engel + PDL.
 *
 * Vorher existierte dafür nichts: kein Cron, kein Trigger, keine Datei.
 * `service_records` trägt zwei Statusfelder (siehe
 * lib/leistungsnachweis/status-sync.ts) — hier zählt `proof_status`, weil
 * es das Feld ist, das der Erfassungs-Flow tatsächlich schreibt
 * (`app/api/leistungsnachweis/crud/route.ts`).
 *
 * "Nicht eingereicht" heißt: der Einsatz liegt in der Vergangenheit, der
 * Nachweis steht aber noch auf ENTWURF (weder abgeschlossen noch storniert).
 *
 * DUBLETTENSCHUTZ: höchstens eine offene Aufgabe pro (service_record,
 * Zielrolle) — Engel und PDL bekommen bewusst getrennte Aufgaben, damit die
 * Zuständigkeit bei jedem einzeln in der eigenen Aufgabenliste sichtbar ist.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logAuditEvent } from '@/lib/audit-log'
import { ersterPdlDerOrg } from './org-empfaenger'
import { heuteBerlin } from '@/lib/utils/timezone'
import { logger } from '@/lib/logger'
const log = logger.child('nachweis-fehlt')

/** Tage nach Einsatzdatum, ab denen ein fehlender Nachweis eine Aufgabe auslöst. */
export const NACHWEIS_FRIST_TAGE = 3

interface OffenerNachweis {
  id: string
  date: string
  client_id: string | null
  caregiver_id: string
  service_type: string | null
  clients: { first_name?: string | null; last_name?: string | null } | { first_name?: string | null; last_name?: string | null }[] | null
}

export interface NachweisFehltErgebnis {
  geprueft: number
  aufgabenErstellt: number
  fehler: string[]
}

function name(row: OffenerNachweis['clients']): string {
  const r = Array.isArray(row) ? row[0] : row
  if (!r) return 'unbekannt'
  return `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || 'unbekannt'
}

export async function meldeFehlendeNachweise(
  supabase: SupabaseClient,
  organizationId: string,
  actorId: string,
): Promise<NachweisFehltErgebnis> {
  const grenzDatum = new Date()
  grenzDatum.setDate(grenzDatum.getDate() - NACHWEIS_FRIST_TAGE)
  const grenzDatumStr = grenzDatum.toISOString().slice(0, 10)

  const { data: offene, error } = await supabase
    .from('service_records')
    .select('id, date, client_id, caregiver_id, service_type, clients(first_name, last_name)')
    .eq('organization_id', organizationId)
    .eq('proof_status', 'ENTWURF')
    .lt('date', grenzDatumStr)
    .limit(500)

  if (error) {
    return { geprueft: 0, aufgabenErstellt: 0, fehler: [`service_records: ${error.message}`] }
  }

  const offeneNachweise = (offene ?? []) as OffenerNachweis[]
  const fehler: string[] = []
  let aufgabenErstellt = 0
  const pdlId = await ersterPdlDerOrg(supabase, organizationId)

  for (const rec of offeneNachweise) {
    try {
      const { data: cg } = await supabase
        .from('caregivers')
        .select('user_id, first_name, last_name')
        .eq('id', rec.caregiver_id)
        .maybeSingle()

      const titel = `Leistungsnachweis fehlt: ${name(rec.clients)} am ${rec.date}`
      const beschreibung =
        `Einsatz vom ${rec.date}${rec.service_type ? ` (${rec.service_type})` : ''} ist seit mehr als `
        + `${NACHWEIS_FRIST_TAGE} Tagen ohne abgeschlossenen Leistungsnachweis (Status: ENTWURF).`

      if (cg?.user_id) {
        const erstellt = await erstelleAufgabeFallsNeu(supabase, organizationId, actorId, {
          serviceRecordId: rec.id,
          zielrolle: 'engel',
          titel,
          beschreibung: `${beschreibung} Bitte zeitnah abschließen.`,
          verantwortlichId: cg.user_id,
          clientId: rec.client_id,
          caregiverId: rec.caregiver_id,
        })
        if (erstellt) aufgabenErstellt++
      }

      if (pdlId) {
        const erstellt = await erstelleAufgabeFallsNeu(supabase, organizationId, actorId, {
          serviceRecordId: rec.id,
          zielrolle: 'pdl',
          titel,
          beschreibung: `${beschreibung} Mitarbeiter: ${cg ? `${cg.first_name ?? ''} ${cg.last_name ?? ''}`.trim() : rec.caregiver_id}.`,
          verantwortlichId: pdlId,
          clientId: rec.client_id,
          caregiverId: rec.caregiver_id,
        })
        if (erstellt) aufgabenErstellt++
      }
    } catch (err) {
      fehler.push(`${rec.id}: ${(err as Error).message}`)
    }
  }

  return { geprueft: offeneNachweise.length, aufgabenErstellt, fehler }
}

async function erstelleAufgabeFallsNeu(
  supabase: SupabaseClient,
  organizationId: string,
  actorId: string,
  params: {
    serviceRecordId: string
    zielrolle: 'engel' | 'pdl'
    titel: string
    beschreibung: string
    verantwortlichId: string
    clientId: string | null
    caregiverId: string
  },
): Promise<boolean> {
  const { data: vorhanden, error: dupErr } = await supabase
    .from('ops_aufgaben')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('metadata->>service_record_id', params.serviceRecordId)
    .eq('metadata->>zielrolle', params.zielrolle)
    .limit(1)
    .maybeSingle()

  if (dupErr) {
    log.error('Dublettenprüfung fehlgeschlagen', { errorMessage: dupErr.message })
    throw new Error(`Dublettenprüfung fehlgeschlagen: ${dupErr.message}`)
  }
  if (vorhanden) return false

  const { data: aufgabe, error } = await supabase
    .from('ops_aufgaben')
    .insert({
      organization_id: organizationId,
      titel: params.titel,
      beschreibung: params.beschreibung,
      kategorie: 'abrechnung',
      prioritaet: params.zielrolle === 'pdl' ? 'mittel' : 'hoch',
      status: 'offen',
      verantwortlich_id: params.verantwortlichId,
      erstellt_von: actorId,
      faellig_am: heuteBerlin(),
      client_id: params.clientId,
      caregiver_id: params.caregiverId,
      tags: ['leistungsnachweis', 'nachweis_fehlt'],
      metadata: {
        service_record_id: params.serviceRecordId,
        zielrolle: params.zielrolle,
        quelle: 'automatisch_nachweis_fehlt',
      },
    })
    .select('id')
    .single()

  if (error || !aufgabe) {
    log.error('Anlage fehlgeschlagen', { errorMessage: error?.message })
    throw new Error(error?.message ?? 'Aufgabe konnte nicht angelegt werden')
  }

  await logAuditEvent({
    action: 'create',
    actorId,
    organizationId,
    entityType: 'ops_aufgabe',
    entityId: aufgabe.id,
    details: { grund: 'nachweis_fehlt', service_record_id: params.serviceRecordId, zielrolle: params.zielrolle },
  }).catch(err => log.error('Audit fehlgeschlagen', { errorMessage: String(err) }))

  return true
}
