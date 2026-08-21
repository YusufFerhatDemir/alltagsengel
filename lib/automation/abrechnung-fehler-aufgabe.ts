/**
 * Kette 9 — Abrechnung fehlerhaft (Validierungsfehler) → Aufgabe an
 * Sachbearbeiter.
 *
 * `preFlightValidierung()` (lib/abrechnung/kassenabrechnung-engine.ts)
 * liefert eine Prüfpunkt-Liste zurück, aber nur zur Anzeige — niemand wurde
 * automatisch informiert, wenn ein Pflicht-Prüfpunkt durchfällt. Der
 * Ereignistyp `abrechnung_fehler` war in lib/ops/types.ts bereits als
 * Enum-Wert vorbereitet, wurde aber nirgends emittiert.
 *
 * DUBLETTENSCHUTZ: höchstens eine offene Aufgabe pro (Organisation,
 * Abrechnungsmonat) — wiederholte Preflight-Aufrufe im selben Monat spammen
 * nicht die Aufgabenliste voll, sondern lassen dieselbe Aufgabe stehen, bis
 * sie erledigt wird.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logAuditEvent } from '@/lib/audit-log'
import { emitEreignis } from '@/lib/ops/ereignis-emitter'
import { ersterPdlDerOrg } from './org-empfaenger'
import { heuteBerlin } from '@/lib/utils/timezone'
import { logger } from '@/lib/logger'
const log = logger.child('abrechnung-fehler')

export interface AbrechnungsFehlerParams {
  organizationId: string
  actorId: string
  abrechnungsmonat: string
  bundesland: string
  fehlgeschlagenePruefpunkte: { label: string; details: string }[]
}

export interface AbrechnungsFehlerErgebnis {
  aufgabeId: string | null
  erstellt: boolean
  dublette: boolean
}

export async function meldeAbrechnungsfehler(
  supabase: SupabaseClient,
  params: AbrechnungsFehlerParams,
): Promise<AbrechnungsFehlerErgebnis> {
  if (params.fehlgeschlagenePruefpunkte.length === 0) {
    return { aufgabeId: null, erstellt: false, dublette: false }
  }

  const schluessel = `${params.abrechnungsmonat}-${params.bundesland}`

  const { data: vorhanden, error: dupErr } = await supabase
    .from('ops_aufgaben')
    .select('id')
    .eq('organization_id', params.organizationId)
    .eq('metadata->>preflight_schluessel', schluessel)
    .eq('status', 'offen')
    .limit(1)
    .maybeSingle()

  if (dupErr) {
    log.error('Dublettenprüfung fehlgeschlagen', { errorMessage: dupErr.message })
    return { aufgabeId: null, erstellt: false, dublette: false }
  }
  if (vorhanden) {
    return { aufgabeId: vorhanden.id, erstellt: false, dublette: true }
  }

  const verantwortlichId = await ersterPdlDerOrg(supabase, params.organizationId)

  const titel = `Abrechnungsvalidierung fehlgeschlagen: ${params.abrechnungsmonat} (${params.bundesland})`
  const beschreibung = [
    `Pre-Flight-Prüfung für ${params.abrechnungsmonat} (${params.bundesland}) hat `
    + `${params.fehlgeschlagenePruefpunkte.length} Pflicht-Prüfpunkt(e) nicht bestanden:`,
    '',
    ...params.fehlgeschlagenePruefpunkte.map(p => `- ${p.label}: ${p.details}`),
  ].join('\n')

  const { data: aufgabe, error } = await supabase
    .from('ops_aufgaben')
    .insert({
      organization_id: params.organizationId,
      titel,
      beschreibung,
      kategorie: 'abrechnung',
      prioritaet: 'hoch',
      status: 'offen',
      verantwortlich_id: verantwortlichId,
      erstellt_von: params.actorId,
      faellig_am: heuteBerlin(),
      tags: ['kassenabrechnung', 'preflight_fehler'],
      metadata: {
        preflight_schluessel: schluessel,
        abrechnungsmonat: params.abrechnungsmonat,
        bundesland: params.bundesland,
        fehlgeschlagene_pruefpunkte: params.fehlgeschlagenePruefpunkte,
        quelle: 'automatisch_abrechnung_fehler',
      },
    })
    .select('id')
    .single()

  if (error || !aufgabe) {
    log.error('Anlage fehlgeschlagen', { errorMessage: error?.message })
    return { aufgabeId: null, erstellt: false, dublette: false }
  }

  await logAuditEvent({
    action: 'create', actorId: params.actorId, organizationId: params.organizationId,
    entityType: 'ops_aufgabe', entityId: aufgabe.id,
    details: { grund: 'abrechnung_fehler', abrechnungsmonat: params.abrechnungsmonat, bundesland: params.bundesland },
  }).catch(err => log.error('Audit fehlgeschlagen', { errorMessage: String(err) }))

  await emitEreignis(supabase, {
    organizationId: params.organizationId,
    ereignisTyp: 'abrechnung_fehler',
    entitaetId: aufgabe.id,
    akteurId: params.actorId,
    kontext: { titel, abrechnungsmonat: params.abrechnungsmonat, aufgabe_id: aufgabe.id },
  }).catch(err => log.error('Ereignis-Emit fehlgeschlagen', { errorMessage: String(err) }))

  return { aufgabeId: aufgabe.id, erstellt: true, dublette: false }
}
