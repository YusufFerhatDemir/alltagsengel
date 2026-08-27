// ═══════════════════════════════════════════════════════════════
// PflegeCoach — Datenexport (DiPAV Anlage 2 + Art. 20 DSGVO)
//
// Maschinenlesbar: strukturiertes, dokumentiertes JSON (Schema unten).
// Menschenlesbar: Druckansicht unter /pflegecoach/bericht (PDF via Druck).
// FHIR-Mapping (Questionnaire/QuestionnaireResponse, CarePlan) ist als
// Architektur-Option vorgesehen — Verbindlichkeit offen (ORF-9,
// audit/dipa/dipav_gap_liste.md).
// ═══════════════════════════════════════════════════════════════

import type {
  CoachActivity, CoachActivityLog, CoachAnspruchspruefung, CoachAssessment, CoachConsent,
  CoachGoal, CoachMeasurement, CoachReport, CoachShare, CoachUser,
} from './types'
import { COACH_PRODUKT_NAME, COACH_PRODUKT_VERSION } from './version'

export const EXPORT_FORMAT = 'de.alltagsengel.pflegecoach.export'
export const EXPORT_VERSION = '1.0'

export interface CoachExportInput {
  exportiertAm: string // ISO-Timestamp, injiziert für Testbarkeit
  coachUser: CoachUser
  consents: CoachConsent[]
  assessments: CoachAssessment[]
  goals: CoachGoal[]
  activities: CoachActivity[]
  activityLog: CoachActivityLog[]
  measurements: CoachMeasurement[]
  reports: CoachReport[]
  shares: CoachShare[]
  anspruchspruefungen: CoachAnspruchspruefung[]
}

/**
 * Baut den vollständigen, maschinenlesbaren Export der Nutzerdaten.
 * Reine Funktion — keine IO, damit deterministisch testbar.
 * Interne IDs (auth-User-Id) werden NICHT exportiert.
 */
export function buildExport(input: CoachExportInput) {
  const { coachUser } = input
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    produkt: { name: COACH_PRODUKT_NAME, version: COACH_PRODUKT_VERSION },
    exportiert_am: input.exportiertAm,
    hinweis:
      'Vollständiger Export Ihrer Daten aus dem Digitalen PflegeCoach (Art. 20 DSGVO). ' +
      'Feld-Dokumentation: Selbsteinschätzungen 0=selbständig…4=umfassende Unterstützung; ' +
      'Wochentage 1=Montag…7=Sonntag; Belastungs-Selbsteinschätzung Items 0=nie…3=fast immer.',
    nutzer: {
      rolle: coachUser.rolle,
      anzeigename: coachUser.anzeigename,
      pflegegrad: coachUser.pflegegrad,
      geburtsjahr: coachUser.geburtsjahr,
      registriert_am: coachUser.created_at,
    },
    einwilligungen: input.consents.map(c => ({
      typ: c.consent_typ,
      text_version: c.text_version,
      erteilt: c.erteilt,
      erteilt_am: c.erteilt_am,
      widerrufen_am: c.widerrufen_am,
    })),
    assessments: input.assessments.map(a => ({
      typ: a.assessment_typ,
      erhoben_am: a.erhoben_am,
      mobilitaet: a.mobilitaet,
      selbstversorgung: a.selbstversorgung,
      alltagsgestaltung: a.alltagsgestaltung,
      soziale_teilhabe: a.soziale_teilhabe,
      kognition: a.kognition,
      hilfsmittel: a.hilfsmittel,
      wohnsituation: a.wohnsituation,
      notizen: a.notizen,
    })),
    ziele: input.goals.map(g => ({
      titel: g.titel,
      beschreibung: g.beschreibung,
      bereich: g.bereich,
      messgroesse: g.messgroesse,
      startwert: g.startwert,
      zielwert: g.zielwert,
      aktueller_wert: g.aktueller_wert,
      start_am: g.start_am,
      ziel_bis: g.ziel_bis,
      status: g.status,
      anpassungs_notiz: g.anpassungs_notiz,
    })),
    aktivitaeten: input.activities.map(a => ({
      titel: a.titel,
      beschreibung: a.beschreibung,
      kategorie: a.kategorie,
      wochentage: a.wochentage,
      uhrzeit: a.uhrzeit,
      dauer_minuten: a.dauer_minuten,
      aktiv: a.aktiv,
    })),
    erledigungen: input.activityLog.map(l => ({
      datum: l.datum,
      status: l.status,
      notiz: l.notiz,
    })),
    messungen: input.measurements.map(m => ({
      instrument: m.instrument,
      messzeitpunkt: m.messzeitpunkt,
      antworten: m.antworten,
      summenwert: m.summenwert,
      erhoben_am: m.erhoben_am,
    })),
    berichte: input.reports.map(r => ({
      typ: r.report_typ,
      zeitraum_von: r.zeitraum_von,
      zeitraum_bis: r.zeitraum_bis,
      erstellt_am: r.erstellt_am,
      inhalt: r.inhalt,
    })),
    // Wer Zugriff auf die eigenen Daten hat (Angehörige/Pflegedienst) und die
    // Antworten der eigenen Anspruchsprüfung — beides wird bei der Löschung
    // mitgezählt (app/api/coach/loeschung/route.ts), gehört also auch in den
    // Art.-20-Export davor.
    freigaben: input.shares.map(s => ({
      empfaenger_rolle: s.empfaenger_rolle,
      erstellt_am: s.erstellt_am,
      widerrufen_am: s.widerrufen_am,
    })),
    anspruchspruefungen: input.anspruchspruefungen.map(a => ({
      pflegegrad: a.pflegegrad,
      pflegegrad_beantragt: a.pflegegrad_beantragt,
      haeusliche_versorgung: a.haeusliche_versorgung,
      nutzung_durch: a.nutzung_durch,
      ergebnis: a.ergebnis,
      kriterien_version: a.kriterien_version,
      hinweise: a.hinweise,
      geprueft_am: a.geprueft_am,
    })),
  }
}

/**
 * Verlaufsbericht-Snapshot für coach_reports.inhalt: kompakte,
 * nachvollziehbare Zusammenfassung eines Zeitraums.
 */
export function buildVerlaufsbericht(input: {
  von: string
  bis: string
  assessments: CoachAssessment[]
  goals: CoachGoal[]
  activityLog: CoachActivityLog[]
  measurements: CoachMeasurement[]
}) {
  const imZeitraum = <T,>(rows: T[], feld: keyof T) =>
    rows.filter(r => {
      const wert = String((r as Record<string, unknown>)[feld as string] ?? '')
      return wert.slice(0, 10) >= input.von && wert.slice(0, 10) <= input.bis
    })

  const logs = imZeitraum(input.activityLog, 'datum')
  return {
    produkt: { name: COACH_PRODUKT_NAME, version: COACH_PRODUKT_VERSION },
    zeitraum: { von: input.von, bis: input.bis },
    assessments: imZeitraum(input.assessments, 'erhoben_am').map(a => ({
      typ: a.assessment_typ, erhoben_am: a.erhoben_am,
      mobilitaet: a.mobilitaet, selbstversorgung: a.selbstversorgung,
      alltagsgestaltung: a.alltagsgestaltung, soziale_teilhabe: a.soziale_teilhabe,
      kognition: a.kognition,
    })),
    ziele: input.goals.map(g => ({
      titel: g.titel, bereich: g.bereich, status: g.status,
      startwert: g.startwert, zielwert: g.zielwert, aktueller_wert: g.aktueller_wert,
    })),
    erledigungen: {
      gesamt: logs.length,
      erledigt: logs.filter(l => l.status === 'erledigt').length,
      teilweise: logs.filter(l => l.status === 'teilweise').length,
      ausgelassen: logs.filter(l => l.status === 'ausgelassen').length,
    },
    messungen: imZeitraum(input.measurements, 'erhoben_am').map(m => ({
      instrument: m.instrument, messzeitpunkt: m.messzeitpunkt,
      summenwert: m.summenwert, erhoben_am: m.erhoben_am,
    })),
  }
}
