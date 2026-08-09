// ═══════════════════════════════════════════════════════════════
// PflegeCoach — Assessment-Logik (reine Funktionen, testbar)
//
// WICHTIG (MDR-Negativabgrenzung): Diese Funktionen aggregieren
// ausschließlich Selbsteinschätzungen zu Organisationszwecken.
// Keine Diagnostik, kein Risiko-Scoring, keine klinische Bewertung.
// ═══════════════════════════════════════════════════════════════

import type { CoachAssessment } from './types'

export const ASSESSMENT_BEREICHE = [
  'mobilitaet', 'selbstversorgung', 'alltagsgestaltung', 'soziale_teilhabe', 'kognition',
] as const
export type AssessmentBereich = (typeof ASSESSMENT_BEREICHE)[number]

export const ASSESSMENT_BEREICH_LABELS: Record<AssessmentBereich, string> = {
  mobilitaet: 'Mobilität',
  selbstversorgung: 'Selbstversorgung',
  alltagsgestaltung: 'Gestaltung des Alltags',
  soziale_teilhabe: 'Soziale Teilhabe',
  kognition: 'Gedächtnis & Orientierung im Alltag',
}

/** Antwortstufen der Selbsteinschätzung (0 = selbständig … 4 = umfassende Unterstützung) */
export const ASSESSMENT_STUFEN = [
  'Selbständig, ohne Hilfe',
  'Meist selbständig, gelegentlich Hilfe',
  'Teilweise auf Hilfe angewiesen',
  'Überwiegend auf Hilfe angewiesen',
  'Umfassende Unterstützung nötig',
] as const

/** Summe der beantworteten Bereiche (0–20). Unbeantwortete Bereiche zählen nicht. */
export function assessmentSumme(a: Pick<CoachAssessment, AssessmentBereich>): number {
  return ASSESSMENT_BEREICHE.reduce((s, b) => s + (typeof a[b] === 'number' ? (a[b] as number) : 0), 0)
}

/** Anzahl beantworteter Bereiche — für Vollständigkeits-Anzeige. */
export function assessmentBeantwortet(a: Pick<CoachAssessment, AssessmentBereich>): number {
  return ASSESSMENT_BEREICHE.filter(b => typeof a[b] === 'number').length
}

export interface BereichsDelta {
  bereich: AssessmentBereich
  label: string
  vorher: number | null
  nachher: number | null
  /** positiv = mehr Unterstützungsbedarf als vorher (Verschlechterung der Selbständigkeit) */
  delta: number | null
}

/**
 * Vergleicht zwei Assessments je Bereich. Nur Bereiche, die in BEIDEN
 * Erhebungen beantwortet wurden, bekommen ein Delta.
 */
export function vergleicheAssessments(
  vorher: Pick<CoachAssessment, AssessmentBereich>,
  nachher: Pick<CoachAssessment, AssessmentBereich>
): BereichsDelta[] {
  return ASSESSMENT_BEREICHE.map(bereich => {
    const v = typeof vorher[bereich] === 'number' ? (vorher[bereich] as number) : null
    const n = typeof nachher[bereich] === 'number' ? (nachher[bereich] as number) : null
    return {
      bereich,
      label: ASSESSMENT_BEREICH_LABELS[bereich],
      vorher: v,
      nachher: n,
      delta: v !== null && n !== null ? n - v : null,
    }
  })
}

/** Bereiche mit gestiegenem Unterstützungsbedarf (delta >= schwelle). */
export function verschlechterteBereiche(deltas: BereichsDelta[], schwelle = 1): BereichsDelta[] {
  return deltas.filter(d => d.delta !== null && d.delta >= schwelle)
}
