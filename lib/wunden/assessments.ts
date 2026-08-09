// ═══════════════════════════════════════════════════════════════
// Wundassessment — wound_assessments
// PUSH-Teilwerte werden serverseitig aus den Rohdaten berechnet,
// nie vom Client übernommen.
// ═══════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { berechnePushScore } from './push-score'
import {
  assertErlaubt,
  EXSUDAT_ART_WERTE,
  EXSUDAT_MENGE_WERTE,
  GERUCH_WERTE,
  type ExsudatArt,
  type ExsudatMenge,
  type Geruch,
  type WoundAssessment,
} from './types'

function assertProzent(wert: number | null | undefined, feld: string): void {
  if (wert === null || wert === undefined) return
  if (!Number.isInteger(wert) || wert < 0 || wert > 100) throw new Error(`${feld} muss eine ganze Zahl zwischen 0 und 100 sein.`)
}

function assertMass(wert: number | null | undefined, feld: string): void {
  if (wert === null || wert === undefined) return
  if (typeof wert !== 'number' || Number.isNaN(wert) || wert < 0) throw new Error(`${feld} muss eine Zahl ≥ 0 sein.`)
}

export interface CreateAssessmentParams {
  organizationId: string
  woundId: string
  erhobenVon: string
  erhobenAm?: string | null
  laengeCm?: number | null
  breiteCm?: number | null
  tiefeCm?: number | null
  granulationPct?: number | null
  fibrinPct?: number | null
  nekrosePct?: number | null
  epithelPct?: number | null
  wundrand?: string | null
  umgebungshaut?: string | null
  exsudatMenge?: ExsudatMenge | null
  exsudatArt?: ExsudatArt | null
  geruch?: Geruch | null
  schmerzNrs?: number | null
  infektionszeichen?: boolean
  bemerkung?: string | null
}

export async function createAssessment(supabase: SupabaseClient, params: CreateAssessmentParams): Promise<WoundAssessment> {
  assertMass(params.laengeCm, 'Länge')
  assertMass(params.breiteCm, 'Breite')
  assertMass(params.tiefeCm, 'Tiefe')
  assertProzent(params.granulationPct, 'Granulationsanteil')
  assertProzent(params.fibrinPct, 'Fibrinanteil')
  assertProzent(params.nekrosePct, 'Nekroseanteil')
  assertProzent(params.epithelPct, 'Epithelanteil')
  const summe = (params.granulationPct ?? 0) + (params.fibrinPct ?? 0) + (params.nekrosePct ?? 0) + (params.epithelPct ?? 0)
  if (summe > 100) throw new Error('Die Wundgrund-Anteile dürfen zusammen 100 % nicht überschreiten.')
  assertErlaubt(params.exsudatMenge ?? null, EXSUDAT_MENGE_WERTE, 'exsudat_menge')
  assertErlaubt(params.exsudatArt ?? null, EXSUDAT_ART_WERTE, 'exsudat_art')
  assertErlaubt(params.geruch ?? null, GERUCH_WERTE, 'geruch')
  if (params.schmerzNrs !== null && params.schmerzNrs !== undefined) {
    if (!Number.isInteger(params.schmerzNrs) || params.schmerzNrs < 0 || params.schmerzNrs > 10) {
      throw new Error('Schmerz (NRS) muss eine ganze Zahl zwischen 0 und 10 sein.')
    }
  }

  const push = berechnePushScore({
    laengeCm: params.laengeCm ?? null,
    breiteCm: params.breiteCm ?? null,
    exsudatMenge: params.exsudatMenge ?? null,
    granulationPct: params.granulationPct ?? null,
    fibrinPct: params.fibrinPct ?? null,
    nekrosePct: params.nekrosePct ?? null,
    epithelPct: params.epithelPct ?? null,
  })

  const { data, error } = await supabase
    .from('wound_assessments')
    .insert({
      organization_id: params.organizationId,
      wound_id: params.woundId,
      erhoben_am: params.erhobenAm ?? new Date().toISOString(),
      erhoben_von: params.erhobenVon,
      laenge_cm: params.laengeCm ?? null,
      breite_cm: params.breiteCm ?? null,
      tiefe_cm: params.tiefeCm ?? null,
      wundgrund_granulation_pct: params.granulationPct ?? null,
      wundgrund_fibrin_pct: params.fibrinPct ?? null,
      wundgrund_nekrose_pct: params.nekrosePct ?? null,
      wundgrund_epithel_pct: params.epithelPct ?? null,
      wundrand: params.wundrand ?? null,
      umgebungshaut: params.umgebungshaut ?? null,
      exsudat_menge: params.exsudatMenge ?? null,
      exsudat_art: params.exsudatArt ?? null,
      geruch: params.geruch ?? null,
      schmerz_nrs: params.schmerzNrs ?? null,
      infektionszeichen: params.infektionszeichen ?? false,
      push_flaeche_punkte: push.flaechePunkte,
      push_exsudat_punkte: push.exsudatPunkte,
      push_gewebe_punkte: push.gewebePunkte,
      push_gesamt: push.gesamt,
      bemerkung: params.bemerkung ?? null,
    })
    .select('*')
    .single()
  if (error || !data) throw new Error(`Assessment konnte nicht angelegt werden: ${error?.message ?? 'unbekannt'}`)
  return data as WoundAssessment
}

export async function listAssessments(
  supabase: SupabaseClient,
  woundId: string,
  organizationId: string
): Promise<WoundAssessment[]> {
  const { data, error } = await supabase
    .from('wound_assessments')
    .select('*')
    .eq('wound_id', woundId)
    .eq('organization_id', organizationId)
    .order('erhoben_am', { ascending: false })
  if (error) throw new Error(`Assessments konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as WoundAssessment[]
}

export interface VerlaufsPunkt {
  erhoben_am: string
  laenge_cm: number | null
  breite_cm: number | null
  tiefe_cm: number | null
  flaeche_cm2: number | null
  push_gesamt: number | null
  schmerz_nrs: number | null
}

/** Chronologischer Größen-/Score-Verlauf für das Verlaufs-Chart (älteste zuerst). */
export function verlaufAusAssessments(assessments: WoundAssessment[]): VerlaufsPunkt[] {
  return [...assessments]
    .sort((a, b) => a.erhoben_am.localeCompare(b.erhoben_am))
    .map(a => ({
      erhoben_am: a.erhoben_am,
      laenge_cm: a.laenge_cm,
      breite_cm: a.breite_cm,
      tiefe_cm: a.tiefe_cm,
      flaeche_cm2: a.laenge_cm !== null && a.breite_cm !== null
        ? Math.round(a.laenge_cm * a.breite_cm * 10) / 10
        : null,
      push_gesamt: a.push_gesamt,
      schmerz_nrs: a.schmerz_nrs,
    }))
}
