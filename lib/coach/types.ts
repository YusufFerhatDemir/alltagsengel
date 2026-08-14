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

// ═══════════════════════════════════════════════════════════════
// Nutzerflow: Anspruch → Genehmigung → Freischaltung → Abrechnung
// (Migration 20260826010000)
// ═══════════════════════════════════════════════════════════════

export interface CoachAnspruchspruefung {
  id: string
  coach_user_id: string
  pflegegrad: number | null
  pflegegrad_beantragt: boolean
  haeusliche_versorgung: boolean | null
  nutzung_durch: 'pflegebeduerftig' | 'angehoerig' | 'gemeinsam' | null
  ergebnis: 'anspruch_moeglich' | 'anspruch_unklar' | 'kein_anspruch'
  kriterien_version: string
  hinweise: string[]
  geprueft_am: string
}

/** Nutzer-Seite: Nachweis eines gültigen Zugangs. */
export interface CoachFreischaltung {
  id: string
  coach_user_id: string
  code_id: string | null
  code_praefix: string | null
  quelle: 'pflegekasse' | 'hersteller_pilot' | 'testzugang'
  status: 'aktiv' | 'abgelaufen' | 'widerrufen'
  gueltig_von: string
  gueltig_bis: string | null
  freigeschaltet_am: string
}

/**
 * Betriebs-Seite: ausgegebener Code. Enthält bewusst KEINEN Bezug auf
 * coach_users — die Einlösung ist nur pseudonym vermerkt.
 */
export interface CoachFreischaltcode {
  id: string
  organization_id: string
  code_praefix: string
  quelle: 'pflegekasse' | 'hersteller_pilot' | 'testzugang'
  kostentraeger_ik: string | null
  genehmigt_am: string | null
  gueltig_von: string
  gueltig_bis: string | null
  status: 'ausgegeben' | 'eingeloest' | 'abgelaufen' | 'storniert'
  abrechnungsweg_key: string | null
  eingeloest_am: string | null
  eingeloest_pseudonym: string | null
  notiz: string | null
  created_at: string
}

export interface CoachAbrechnungsweg {
  id: string
  organization_id: string
  schluessel: string
  bezeichnung: string
  beschreibung: string | null
  rechtsgrundlage: string | null
  aktiv: boolean
  verguetung_geklaert: boolean
  konfiguration: Record<string, unknown>
  created_at: string
  updated_at: string
}

// ═══════════════════════════════════════════════════════════════
// Ergänzende Unterstützungsleistungen (eUL) — Betriebsdaten
// ═══════════════════════════════════════════════════════════════

export interface EulErbringung {
  id: string
  organization_id: string
  booking_id: string | null
  client_id: string | null
  coach_pseudonym: string | null
  leistungsart: string
  datum: string
  dauer_minuten: number
  durchfuehrungsform: string
  inhalt: string
  erbracht_von: string | null
  erbringer_name: string | null
  qualifikation_geprueft: boolean
  bestaetigt_am: string | null
  bestaetigt_durch: string | null
  abrechnungsweg_key: string | null
  bemerkung: string | null
  created_at: string
  updated_at: string
}

export interface EulQualifikation {
  id: string
  organization_id: string
  user_id: string | null
  caregiver_id: string | null
  erbringer_name: string | null
  kriterium_key: string
  erfuellt: boolean
  nachweis_art: string | null
  geprueft_am: string | null
  geprueft_durch: string | null
  gueltig_bis: string | null
  notiz: string | null
  created_at: string
  updated_at: string
}

// ═══════════════════════════════════════════════════════════════
// Selbstzahler-Verkaufsweg (Migration 20260907000000)
// Vertrags- und Zahlungsdaten — KEINE Gesundheitsdaten.
// Rechenlogik dazu: lib/coach/bestellung.ts, lib/coach/pricing.ts
// ═══════════════════════════════════════════════════════════════

export interface CoachBestellung {
  id: string
  coach_user_id: string
  tarif: 'monatlich' | 'jaehrlich'
  /** Bruttobetrag je Abrechnungszeitraum in CENT, eingefroren zum Vertragsschluss. */
  betrag_cent: number
  waehrung: string
  intervall_monate: number
  status: 'offen' | 'aktiv' | 'gekuendigt' | 'abgelaufen' | 'widerrufen' | 'zahlung_offen' | 'gesperrt'
  rechnung_name: string
  rechnung_strasse: string
  rechnung_plz: string
  rechnung_ort: string
  rechnung_land: string
  rechnung_email: string
  bestellt_am: string
  laufzeit_bis: string | null
  gekuendigt_am: string | null
  widerrufen_am: string | null
  agb_akzeptiert_am: string
  datenschutz_akzeptiert_am: string
  widerrufsbelehrung_version: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  stripe_checkout_id: string | null
  created_at: string
  updated_at: string
}

export interface CoachZahlung {
  id: string
  bestellung_id: string
  coach_user_id: string
  art: 'zahlung' | 'fehlgeschlagen' | 'erstattung'
  betrag_cent: number
  waehrung: string
  zeitraum_von: string | null
  zeitraum_bis: string | null
  fehlergrund: string | null
  stripe_invoice_id: string | null
  stripe_payment_intent: string | null
  gebucht_am: string
  created_at: string
}

export interface CoachRechnung {
  id: string
  bestellung_id: string
  coach_user_id: string
  zahlung_id: string | null
  nummer: string
  rechnungsdatum: string
  leistung_von: string
  leistung_bis: string
  brutto_cent: number
  netto_cent: number
  steuer_cent: number
  steuersatz: number
  waehrung: string
  empfaenger_name: string
  empfaenger_anschrift: string
  angaben_unvollstaendig: string | null
  storniert_am: string | null
  storno_grund: string | null
  created_at: string
}
