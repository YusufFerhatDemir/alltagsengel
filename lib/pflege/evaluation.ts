// ═══════════════════════════════════════════════════════════════
// Evaluation einer Pflegemassnahme — der sechste Schritt des
// Pflegeprozesses und der Schluss des Regelkreises.
//
// BEFUND GAP-14 (29.08.2026): die Massnahmenplanung kannte Plaene,
// Massnahmen, Versionen, Freigabe und Sperre — aber keine Evaluation.
// Zwei Felder sahen danach aus und waren es nicht:
//
//   • `pflege_massnahmen.ergebnis` — Freitext ohne Datum, ohne Urheber,
//     ohne Wiedervorlage, ueberschreibbar. Die vorherige Beurteilung ist
//     nach der naechsten weg, es gibt also keine Reihe und damit keinen
//     Regelkreis.
//   • `pflege_massnahmen.status` — sagt, was mit der MASSNAHME geschieht,
//     nicht ob ihr ZIEL erreicht wurde. Eine abgebrochene Massnahme kann
//     ihr Ziel erreicht haben; eine laufende kann es verfehlen.
//
// Praktische Folge: es gab keine Abfrage, die „welche Massnahmen sind zur
// Evaluation faellig?" beantwortet. Bei einer Qualitaetspruefung nach
// § 114 SGB XI ist das die Frage — und die Antwort waere gewesen, dass
// man es nicht weiss.
//
// ── WAS HIER BEWUSST NICHT PASSIERT ───────────────────────────────────
// Der Status der Massnahme wird NICHT automatisch fortgeschrieben. „Ziel
// nicht erreicht" heisst nicht „Massnahme beenden"; welche Folge richtig
// ist, entscheidet die Pflegefachkraft, und `folgerung` haelt genau diese
// Entscheidung fest. Ein Automatismus haette sie ihr abgenommen und im
// Nachhinein wie eine fachliche Beurteilung ausgesehen.
// ═══════════════════════════════════════════════════════════════

import { UserFacingError } from '@/lib/api/user-facing-error'
import type { SupabaseClient } from '@supabase/supabase-js'
import { logPflegeAktivitaet } from './audit-log'
import {
  assertErlaubt,
  EVALUATION_FOLGERUNG_WERTE,
  ZIELERREICHUNG_WERTE,
  type EvaluationFolgerung,
  type PflegeMassnahmeEvaluation,
  type Zielerreichung,
} from './types'
import { heuteBerlin } from '@/lib/utils/timezone'
import { logger } from '@/lib/logger'
const log = logger.child('pflege-evaluation')

/** Kuerzeste Beurteilung, die noch eine ist. Spiegelt `pme_bewertung_nicht_leer`. */
const MIN_BEWERTUNG_ZEICHEN = 3

export interface CreateEvaluationParams {
  organizationId: string
  massnahmeId: string
  zielerreichung: Zielerreichung
  bewertung: string
  folgerung: EvaluationFolgerung
  /** Beurteilungsdatum; Vorgabe ist heute (Berliner Zeit). */
  evaluiertAm?: string
  /**
   * Ausdrueckliche naechste Wiedervorlage. Fehlt sie, rechnet der
   * DB-Trigger sie aus `evaluation_intervall_tage` der Massnahme — und
   * wenn auch das fehlt, gibt es keine. Kein Vorgabewert: eine erfundene
   * Wiedervorlage taeuscht eine Verabredung vor, die niemand getroffen hat.
   */
  naechsteEvaluation?: string | null
  evaluiertVon: string
}

/**
 * Beurteilt eine Massnahme und schliesst den Regelkreis.
 *
 * FAIL-CLOSED an drei Stellen, jede mit eigenem Grund:
 *   1. Die Massnahme muss zum Mandanten gehoeren — die Route faehrt mit
 *      dem Dienstschluessel, RLS sieht sie also nie.
 *   2. Ein Plan im ENTWURF hat nie gewirkt und ist nicht beurteilbar.
 *      Der DB-Trigger `pflege_evaluation_plan_in_kraft` sagt dasselbe;
 *      hier steht die lesbare Haelfte.
 *   3. Eine Beurteilung ohne Text ist ein Haekchen, und ein Haekchen ist
 *      bei einer Pruefung nichts wert.
 */
export async function evaluiereMassnahme(
  supabase: SupabaseClient,
  params: CreateEvaluationParams,
): Promise<PflegeMassnahmeEvaluation> {
  assertErlaubt(params.zielerreichung, ZIELERREICHUNG_WERTE, 'zielerreichung')
  assertErlaubt(params.folgerung, EVALUATION_FOLGERUNG_WERTE, 'folgerung')

  const bewertung = (params.bewertung ?? '').trim()
  if (bewertung.length < MIN_BEWERTUNG_ZEICHEN) {
    throw new UserFacingError('Bitte die Beurteilung im Klartext festhalten — sie ist der Kern der Evaluation.')
  }

  const evaluiertAm = params.evaluiertAm ?? heuteBerlin()
  if (params.naechsteEvaluation && params.naechsteEvaluation < evaluiertAm) {
    throw new UserFacingError('Die nächste Evaluation kann nicht vor der heutigen liegen.')
  }

  const plan = await ladePlanZurMassnahme(supabase, params.massnahmeId, params.organizationId)
  if (plan.status === 'entwurf') {
    throw new UserFacingError(
      'Ein Maßnahmenplan im Entwurf hat nie gewirkt und kann nicht evaluiert werden. '
      + 'Erst freigeben, dann evaluieren.',
      409,
    )
  }

  const { data, error } = await supabase
    .from('pflege_massnahmen_evaluationen')
    .insert({
      organization_id: params.organizationId,
      massnahme_id: params.massnahmeId,
      evaluiert_am: evaluiertAm,
      zielerreichung: params.zielerreichung,
      bewertung,
      folgerung: params.folgerung,
      naechste_evaluation: params.naechsteEvaluation ?? null,
      evaluiert_von: params.evaluiertVon,
    })
    .select('*')
    .single()
  if (error || !data) {
    throw new Error(`Evaluation konnte nicht gespeichert werden: ${error?.message ?? 'unbekannt'}`)
  }

  await logPflegeAktivitaet(supabase, {
    organizationId: params.organizationId,
    entitaetTyp: 'evaluation',
    entitaetId: (data as PflegeMassnahmeEvaluation).id,
    aktion: 'erstellt',
    nachher: data,
    akteurId: params.evaluiertVon,
  }).catch((err) => log.errorWithException('Evaluations-Log fehlgeschlagen', err))

  return data as PflegeMassnahmeEvaluation
}

/**
 * Der Plan hinter einer Massnahme — mit Mandantenpruefung.
 *
 * Gefiltert wird auf `pflege_massnahmen.organization_id`, nicht auf die
 * des Plans: beide tragen die Spalte, und die Massnahme ist das Objekt,
 * das der Aufrufer benennt. Ein Plan aus einem fremden Mandanten mit einer
 * eigenen Massnahme kann es nicht geben — der FK haengt am Plan, und
 * `current_org_id()` steht auf beiden als Vorgabe.
 */
async function ladePlanZurMassnahme(
  supabase: SupabaseClient,
  massnahmeId: string,
  organizationId: string,
): Promise<{ id: string; status: string }> {
  const { data, error } = await supabase
    .from('pflege_massnahmen')
    .select('id, plan_id')
    .eq('id', massnahmeId)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (error) throw new Error(`Maßnahme konnte nicht geprüft werden: ${error.message}`)
  if (!data) throw new UserFacingError('Maßnahme nicht gefunden.', 404)

  const { data: plan, error: planFehler } = await supabase
    .from('pflege_massnahmenplaene')
    .select('id, status')
    .eq('id', (data as { plan_id: string }).plan_id)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (planFehler) throw new Error(`Maßnahmenplan konnte nicht geprüft werden: ${planFehler.message}`)
  if (!plan) throw new UserFacingError('Maßnahmenplan nicht gefunden.', 404)

  return plan as { id: string; status: string }
}

export interface ListEvaluationenFilter {
  organizationId: string
  massnahmeId?: string
}

/**
 * Die Beurteilungen einer Massnahme, die juengste zuerst.
 *
 * Absteigend nach `evaluiert_am`, bei Gleichstand nach `created_at`:
 * zwei Beurteilungen am selben Tag sind moeglich (eine Korrektur wird als
 * NEUE Evaluation erfasst, nicht als Aenderung der alten), und ohne das
 * zweite Kriterium waere ihre Reihenfolge zufaellig.
 */
export async function listEvaluationen(
  supabase: SupabaseClient,
  filter: ListEvaluationenFilter,
): Promise<PflegeMassnahmeEvaluation[]> {
  let query = supabase
    .from('pflege_massnahmen_evaluationen')
    .select('*')
    .eq('organization_id', filter.organizationId)
  if (filter.massnahmeId) query = query.eq('massnahme_id', filter.massnahmeId)

  const { data, error } = await query
    .order('evaluiert_am', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Evaluationen konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as PflegeMassnahmeEvaluation[]
}

/** Die juengste Beurteilung einer Massnahme, oder `null`. */
export async function letzteEvaluation(
  supabase: SupabaseClient,
  massnahmeId: string,
  organizationId: string,
): Promise<PflegeMassnahmeEvaluation | null> {
  const alle = await listEvaluationen(supabase, { organizationId, massnahmeId })
  return alle[0] ?? null
}

export interface FaelligeEvaluation {
  massnahmeId: string
  planId: string
  titel: string
  naechsteEvaluation: string
  /** Tage seit der Faelligkeit; 0 heisst „heute faellig". */
  ueberfaelligTage: number
}

/**
 * Was zur Evaluation ansteht — die Frage, die vor dem 29.08.2026 nicht
 * beantwortbar war.
 *
 * `stichtag` ist ausdruecklich ein Parameter und kein `new Date()` im
 * Rumpf: nur so ist die Faelligkeit pruefbar, ohne die Uhr zu stellen.
 *
 * Beruecksichtigt werden nur Massnahmen in `geplant` oder `aktiv` — eine
 * abgeschlossene oder abgebrochene Massnahme ist nicht faellig, sondern
 * vorbei. Das entspricht dem Teilindex
 * `idx_pflege_massnahmen_evaluation_faellig`.
 */
export async function listFaelligeEvaluationen(
  supabase: SupabaseClient,
  organizationId: string,
  stichtag?: string,
): Promise<FaelligeEvaluation[]> {
  const tag = stichtag ?? heuteBerlin()

  const { data, error } = await supabase
    .from('pflege_massnahmen')
    .select('id, plan_id, titel, naechste_evaluation')
    .eq('organization_id', organizationId)
    .in('status', ['geplant', 'aktiv'])
    .not('naechste_evaluation', 'is', null)
    .lte('naechste_evaluation', tag)
    .order('naechste_evaluation', { ascending: true })
  if (error) throw new Error(`Fällige Evaluationen konnten nicht geladen werden: ${error.message}`)

  return ((data ?? []) as Array<{
    id: string; plan_id: string; titel: string; naechste_evaluation: string
  }>).map(m => ({
    massnahmeId: m.id,
    planId: m.plan_id,
    titel: m.titel,
    naechsteEvaluation: m.naechste_evaluation,
    ueberfaelligTage: tageZwischen(m.naechste_evaluation, tag),
  }))
}

/**
 * Ganze Tage von `von` bis `bis`, beide als `YYYY-MM-DD`.
 *
 * UTC-Arithmetik auf Mitternacht: in lokaler Zeit ist der Tag der
 * Sommerzeitumstellung 23 bzw. 25 Stunden lang, und eine Differenz in
 * Tagen kippt daran um eins.
 */
function tageZwischen(von: string, bis: string): number {
  const a = Date.parse(`${von}T00:00:00Z`)
  const b = Date.parse(`${bis}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0
  return Math.max(0, Math.round((b - a) / 86_400_000))
}
