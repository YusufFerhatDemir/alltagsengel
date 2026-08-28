// ═══════════════════════════════════════════════════════════════
// Qualitaetsmanagement — geteilte Typen
//
// Spiegelt 1:1 die Spalten und CHECK-Listen aus
// supabase/migrations/20261019000000_qm_pflegevisite.sql. Weicht eine
// Liste hier von der Datenbank ab, kommt die Verletzung als „Interner
// Serverfehler" zurueck statt als lesbarer Hinweis — genau das Muster,
// das lib/personal/types.ts fuer die Personalverwaltung beschreibt.
// ═══════════════════════════════════════════════════════════════

import { UserFacingError } from '@/lib/api/user-facing-error'

// ── Visite ──────────────────────────────────────────────────────

export type VisiteTyp = 'regelvisite' | 'anlassvisite' | 'einarbeitung' | 'nachvisite'
export const VISITE_TYP_WERTE: VisiteTyp[] = ['regelvisite', 'anlassvisite', 'einarbeitung', 'nachvisite']

export type VisiteStatus = 'geplant' | 'durchgefuehrt' | 'ausgewertet' | 'abgeschlossen' | 'abgesagt'
export const VISITE_STATUS_WERTE: VisiteStatus[] = [
  'geplant', 'durchgefuehrt', 'ausgewertet', 'abgeschlossen', 'abgesagt',
]

export type Gesamtbewertung =
  | 'ohne_beanstandung' | 'geringe_abweichung' | 'erhebliche_abweichung' | 'sofortmassnahme'
export const GESAMTBEWERTUNG_WERTE: Gesamtbewertung[] = [
  'ohne_beanstandung', 'geringe_abweichung', 'erhebliche_abweichung', 'sofortmassnahme',
]

// ── Befund ──────────────────────────────────────────────────────

/**
 * Die Pruefpunkte einer Pflegevisite.
 *
 * Kontrolliertes Vokabular, kein Freitext: eine Visite, deren Punkte
 * jeder anders benennt, laesst sich ueber die Zeit nicht vergleichen —
 * und Vergleichbarkeit ist der ganze Zweck einer wiederkehrenden Pruefung.
 * Die Reihenfolge ist die der Checkliste.
 */
export type Pruefpunkt =
  | 'pflegeplanung_aktuell'
  | 'dokumentation_vollstaendig'
  | 'medikamentengabe'
  | 'wundversorgung'
  | 'vitalwerte_erhebung'
  | 'sturzprophylaxe'
  | 'dekubitusprophylaxe'
  | 'ernaehrung_fluessigkeit'
  | 'hygiene'
  | 'hilfsmittel_zustand'
  | 'zufriedenheit_klient'
  | 'zufriedenheit_angehoerige'
  | 'einsatzzeiten_eingehalten'
  | 'schweigepflicht_datenschutz'
  | 'sonstiges'

export const PRUEFPUNKT_WERTE: Pruefpunkt[] = [
  'pflegeplanung_aktuell',
  'dokumentation_vollstaendig',
  'medikamentengabe',
  'wundversorgung',
  'vitalwerte_erhebung',
  'sturzprophylaxe',
  'dekubitusprophylaxe',
  'ernaehrung_fluessigkeit',
  'hygiene',
  'hilfsmittel_zustand',
  'zufriedenheit_klient',
  'zufriedenheit_angehoerige',
  'einsatzzeiten_eingehalten',
  'schweigepflicht_datenschutz',
  'sonstiges',
]

/** Klartext fuer die Oberflaeche und den Ausdruck. */
export const PRUEFPUNKT_BEZEICHNUNG: Record<Pruefpunkt, string> = {
  pflegeplanung_aktuell:      'Pflege- und Maßnahmenplanung ist aktuell',
  dokumentation_vollstaendig: 'Dokumentation ist vollständig und zeitnah',
  medikamentengabe:           'Medikamentengabe entspricht dem Plan',
  wundversorgung:             'Wundversorgung nach Standard',
  vitalwerte_erhebung:        'Vitalwerte werden wie vereinbart erhoben',
  sturzprophylaxe:            'Sturzprophylaxe umgesetzt',
  dekubitusprophylaxe:        'Dekubitusprophylaxe umgesetzt',
  ernaehrung_fluessigkeit:    'Ernährung und Flüssigkeitsversorgung sichergestellt',
  hygiene:                    'Hygienevorgaben eingehalten',
  hilfsmittel_zustand:        'Hilfsmittel vorhanden und funktionsfähig',
  zufriedenheit_klient:       'Zufriedenheit der betreuten Person',
  zufriedenheit_angehoerige:  'Zufriedenheit der Angehörigen',
  einsatzzeiten_eingehalten:  'Vereinbarte Einsatzzeiten werden eingehalten',
  schweigepflicht_datenschutz:'Schweigepflicht und Datenschutz gewahrt',
  sonstiges:                  'Sonstige Feststellung',
}

/** Klartext des Gesamturteils fuer Oberflaeche und Ausdruck. */
export const GESAMTBEWERTUNG_BEZEICHNUNG: Record<Gesamtbewertung, string> = {
  ohne_beanstandung:     'ohne Beanstandung',
  geringe_abweichung:    'geringe Abweichung',
  erhebliche_abweichung: 'erhebliche Abweichung',
  sofortmassnahme:       'Sofortmaßnahme',
}

export type Befundbewertung = 'erfuellt' | 'teilweise_erfuellt' | 'nicht_erfuellt' | 'nicht_anwendbar'
export const BEFUNDBEWERTUNG_WERTE: Befundbewertung[] = [
  'erfuellt', 'teilweise_erfuellt', 'nicht_erfuellt', 'nicht_anwendbar',
]

/**
 * Bewertungen, die eine Abweichung feststellen. Sie verlangen eine
 * Feststellung im Klartext — ein „nicht erfuellt" ohne Sachverhalt ist
 * ein Vorwurf ohne Beleg. Dieselbe Liste steht als CHECK in der Datenbank
 * (`qm_visite_befunde_feststellung_belegt`).
 */
export const ABWEICHENDE_BEWERTUNGEN: Befundbewertung[] = ['teilweise_erfuellt', 'nicht_erfuellt']

// ── DB-Interfaces ───────────────────────────────────────────────

export interface QmPflegevisite {
  id: string
  organization_id: string
  client_id: string
  caregiver_id: string | null
  visite_typ: VisiteTyp
  geplant_am: string
  durchgefuehrt_am: string | null
  status: VisiteStatus
  anlass: string | null
  zusammenfassung: string | null
  gesamtbewertung: Gesamtbewertung | null
  durchgefuehrt_von: string | null
  abgeschlossen_am: string | null
  abgeschlossen_von: string | null
  erstellt_von: string
  created_at: string
  updated_at: string
}

export interface QmVisiteBefund {
  id: string
  organization_id: string
  visite_id: string
  pruefpunkt: Pruefpunkt
  bewertung: Befundbewertung
  feststellung: string | null
  empfehlung: string | null
  frist: string | null
  massnahme_beantragt: boolean
  massnahme_id: string | null
  erledigt_am: string | null
  erstellt_von: string
  created_at: string
  updated_at: string
}

// ── Validierung ─────────────────────────────────────────────────

export function assertErlaubt<T extends string>(
  wert: T | null | undefined,
  erlaubt: readonly T[],
  feldname: string,
): void {
  if (wert != null && !erlaubt.includes(wert)) {
    throw new UserFacingError(
      `Ungültiger Wert "${wert}" für ${feldname}. Erlaubt: ${erlaubt.join(', ')}`,
      400,
    )
  }
}
