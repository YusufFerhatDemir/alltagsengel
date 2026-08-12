// ═══════════════════════════════════════════════════════════════
// Digitaler PflegeCoach (DiPA) — Typen
// Produktgrenze: strikt getrennt von Betriebs-Typen (lib/types.ts).
// Tabellen: coach_* (Migration 20260819010000)
// ═══════════════════════════════════════════════════════════════

export type CoachRolle = 'pflegebeduerftig' | 'angehoerig' | 'pflegedienst'
export type CoachSchriftgrad = 'normal' | 'gross' | 'sehr_gross'

export interface CoachUser {
  id: string
  user_id: string
  rolle: CoachRolle
  anzeigename: string | null
  pflegegrad: number | null
  geburtsjahr: number | null
  a11y_schriftgrad: CoachSchriftgrad
  a11y_kontrast: boolean
  onboarding_abgeschlossen: boolean
  created_at: string
  updated_at: string
}

export type ConsentTyp = 'gesundheitsdaten_art9' | 'wissenschaftliche_auswertung' | 'datenfreigabe'

export interface CoachConsent {
  id: string
  coach_user_id: string
  consent_typ: ConsentTyp
  text_version: string
  erteilt: boolean
  erteilt_am: string
  widerrufen_am: string | null
}

export type AssessmentTyp = 'erstassessment' | 'verlaufsassessment'

/** Selbsteinschätzung je Lebensbereich: 0 = selbständig … 4 = umfassende Unterstützung nötig */
export interface CoachAssessment {
  id: string
  coach_user_id: string
  assessment_typ: AssessmentTyp
  mobilitaet: number | null
  selbstversorgung: number | null
  alltagsgestaltung: number | null
  soziale_teilhabe: number | null
  kognition: number | null
  hilfsmittel: string | null
  wohnsituation: string | null
  notizen: string | null
  erhoben_am: string
  created_at: string
}

export type ZielBereich =
  | 'mobilitaet' | 'selbstversorgung' | 'alltagsgestaltung'
  | 'soziale_teilhabe' | 'entlastung_angehoerige'
export type ZielStatus = 'aktiv' | 'erreicht' | 'angepasst' | 'pausiert' | 'beendet'

export interface CoachGoal {
  id: string
  coach_user_id: string
  titel: string
  beschreibung: string | null
  bereich: ZielBereich
  messgroesse: string | null
  startwert: number | null
  zielwert: number | null
  aktueller_wert: number | null
  start_am: string
  ziel_bis: string | null
  status: ZielStatus
  anpassungs_notiz: string | null
  created_at: string
  updated_at: string
}

export type AktivitaetKategorie =
  | 'mobilitaet' | 'selbstversorgung' | 'alltagsgestaltung'
  | 'soziale_teilhabe' | 'entlastung' | 'erinnerung'

export interface CoachActivity {
  id: string
  coach_user_id: string
  titel: string
  beschreibung: string | null
  kategorie: AktivitaetKategorie
  /** 1 = Montag … 7 = Sonntag */
  wochentage: number[]
  uhrzeit: string | null
  dauer_minuten: number | null
  goal_id: string | null
  aktiv: boolean
  created_at: string
  updated_at: string
}

export type ErledigungStatus = 'erledigt' | 'teilweise' | 'ausgelassen'

export interface CoachActivityLog {
  id: string
  activity_id: string
  coach_user_id: string
  datum: string
  status: ErledigungStatus
  notiz: string | null
  created_at: string
}

export type MessInstrument =
  | 'fes_i_k' | 'bsfc_s' | 'sus' | 'belastung_kurz'
  | 'selbsteinschaetzung_selbststaendigkeit' | 'sturzereignis' | 'befinden'
export type Messzeitpunkt = 't0' | 't1' | 't2' | 't3' | 'laufend'

export interface CoachMeasurement {
  id: string
  coach_user_id: string
  instrument: MessInstrument
  messzeitpunkt: Messzeitpunkt
  antworten: Record<string, unknown>
  summenwert: number | null
  erhoben_am: string
  created_at: string
}

export type ReportTyp = 'verlaufsbericht' | 'datenexport'

export interface CoachReport {
  id: string
  coach_user_id: string
  report_typ: ReportTyp
  zeitraum_von: string | null
  zeitraum_bis: string | null
  inhalt: Record<string, unknown>
  erstellt_am: string
}

export interface CoachShare {
  id: string
  owner_coach_user_id: string
  grantee_user_id: string
  empfaenger_rolle: 'angehoerig' | 'pflegedienst'
  erstellt_am: string
  widerrufen_am: string | null
}

export const BEREICH_LABELS: Record<ZielBereich, string> = {
  mobilitaet: 'Mobilität',
  selbstversorgung: 'Selbstversorgung',
  alltagsgestaltung: 'Gestaltung des Alltags',
  soziale_teilhabe: 'Soziale Teilhabe',
  entlastung_angehoerige: 'Entlastung Angehöriger',
}

export const ROLLE_LABELS: Record<CoachRolle, string> = {
  pflegebeduerftig: 'Pflegebedürftige/r',
  angehoerig: 'Pflegende/r Angehörige/r',
  pflegedienst: 'Pflegedienst',
}
