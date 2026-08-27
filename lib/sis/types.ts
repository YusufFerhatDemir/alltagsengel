// ═══════════════════════════════════════════════════════════════
// SIS — Strukturierte Informationssammlung: geteilte Typen
// Spiegelt 1:1 die Spalten aus
// supabase/migrations/20260818010000_sis_strukturierte_informationssammlung.sql
// ═══════════════════════════════════════════════════════════════

import { UserFacingError } from '@/lib/api/user-facing-error'

export type SisAssessmentTyp = 'erstgespraech' | 'folgegespraech' | 'wiederaufnahme' | 'anlassbezogen'
export type SisVersorgungsform = 'ambulant' | 'stationaer' | 'tagespflege'
export type SisStatus = 'entwurf' | 'abgeschlossen' | 'gesperrt'
export type SisRisiko = 'dekubitus' | 'sturz' | 'inkontinenz' | 'schmerz' | 'ernaehrung'
export type SisRisikoVorhanden = 'ja' | 'nein' | 'unklar'

export const SIS_ASSESSMENT_TYP_WERTE: SisAssessmentTyp[] = ['erstgespraech', 'folgegespraech', 'wiederaufnahme', 'anlassbezogen']
export const SIS_VERSORGUNGSFORM_WERTE: SisVersorgungsform[] = ['ambulant', 'stationaer', 'tagespflege']
export const SIS_STATUS_WERTE: SisStatus[] = ['entwurf', 'abgeschlossen', 'gesperrt']
export const SIS_RISIKO_WERTE: SisRisiko[] = ['dekubitus', 'sturz', 'inkontinenz', 'schmerz', 'ernaehrung']
export const SIS_RISIKO_VORHANDEN_WERTE: SisRisikoVorhanden[] = ['ja', 'nein', 'unklar']

/** Die 6 SIS-Themenfelder. Feld 6 (Haushaltsführung) gilt nur ambulant. */
export const SIS_THEMENFELDER: Array<{ nr: number; titel: string; leitfrage: string; nurAmbulant: boolean }> = [
  { nr: 1, titel: 'Kognitive und kommunikative Fähigkeiten', leitfrage: 'Wie orientiert sich die Person, wie teilt sie sich mit, wie trifft sie Entscheidungen?', nurAmbulant: false },
  { nr: 2, titel: 'Mobilität und Beweglichkeit', leitfrage: 'Wie bewegt sich die Person innerhalb und außerhalb der Wohnung, welche Hilfen nutzt sie?', nurAmbulant: false },
  { nr: 3, titel: 'Krankheitsbezogene Anforderungen und Belastungen', leitfrage: 'Welche Erkrankungen, Therapien und Belastungen bestimmen den Alltag?', nurAmbulant: false },
  { nr: 4, titel: 'Selbstversorgung', leitfrage: 'Wie versorgt sich die Person bei Körperpflege, Kleidung, Essen und Trinken, Ausscheidung?', nurAmbulant: false },
  { nr: 5, titel: 'Leben in sozialen Beziehungen', leitfrage: 'Wie gestaltet die Person Kontakte, Tagesstruktur und Teilhabe?', nurAmbulant: false },
  { nr: 6, titel: 'Haushaltsführung', leitfrage: 'Wie bewältigt die Person Haushalt, Einkäufe, Mahlzeitenzubereitung und Finanzen?', nurAmbulant: true },
]

export const SIS_STATUS_META: Record<string, { label: string; color: string }> = {
  entwurf: { label: 'Entwurf', color: '#E8A000' },
  abgeschlossen: { label: 'Abgeschlossen', color: '#5CB882' },
  gesperrt: { label: 'Gesperrt', color: '#999' },
}

export const SIS_TYP_LABELS: Record<SisAssessmentTyp, string> = {
  erstgespraech: 'Erstgespräch',
  folgegespraech: 'Folgegespräch',
  wiederaufnahme: 'Wiederaufnahme',
  anlassbezogen: 'Anlassbezogen',
}

export const SIS_VERSORGUNGSFORM_LABELS: Record<SisVersorgungsform, string> = {
  ambulant: 'Ambulant',
  stationaer: 'Stationär',
  tagespflege: 'Tagespflege',
}

export const SIS_RISIKO_LABELS: Record<SisRisiko, string> = {
  dekubitus: 'Dekubitus',
  sturz: 'Sturz',
  inkontinenz: 'Inkontinenz',
  schmerz: 'Schmerz',
  ernaehrung: 'Ernährung',
}

export interface SisAssessment {
  id: string
  organization_id: string
  client_id: string
  assessment_datum: string
  assessment_typ: SisAssessmentTyp
  versorgungsform: SisVersorgungsform
  erhoben_von: string
  eingangsfrage: string | null
  status: SisStatus
  abgeschlossen_am: string | null
  abgeschlossen_von: string | null
  gesperrt: boolean
  bemerkung: string | null
  erstellt_von: string
  created_at: string
  updated_at: string
}

export interface SisThemenfeld {
  id: string
  organization_id: string
  assessment_id: string
  feld_nr: number
  sicht_klient: string | null
  einschaetzung_pflege: string | null
  handlungsbedarf: boolean | null
  bemerkung: string | null
  created_at: string
  updated_at: string
}

export interface SisRisikoZeile {
  id: string
  organization_id: string
  assessment_id: string
  risiko: SisRisiko
  risiko_vorhanden: SisRisikoVorhanden
  weitere_einschaetzung: boolean
  bemerkung: string | null
  created_at: string
  updated_at: string
}

export interface SisAssessmentDetail extends SisAssessment {
  themenfelder: SisThemenfeld[]
  risikomatrix: SisRisikoZeile[]
}

/** Wirft, wenn `wert` gesetzt ist, aber nicht in der Werteliste liegt. */
export function assertSisWert<T extends string>(wert: T | undefined | null, erlaubt: readonly T[], feld: string): void {
  if (wert === undefined || wert === null) return
  if (!erlaubt.includes(wert)) {
    throw new UserFacingError(`Ungültiger Wert für ${feld}: "${wert}". Erlaubt: ${erlaubt.join(', ')}`)
  }
}

/** Themenfelder, die für eine Versorgungsform relevant sind (Feld 6 nur ambulant). */
export function relevanteThemenfelder(versorgungsform: SisVersorgungsform): number[] {
  return SIS_THEMENFELDER
    .filter(t => !t.nurAmbulant || versorgungsform === 'ambulant')
    .map(t => t.nr)
}
