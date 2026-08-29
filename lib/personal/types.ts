import { UserFacingError } from '@/lib/api/user-facing-error'
// ═══════════════════════════════════════════════════════════════
// Personalmanagement — geteilte Typen
// Spiegelt 1:1 die Spalten aus
// supabase/migrations/20260811010000_personalmanagement.sql
// ═══════════════════════════════════════════════════════════════

// ── Vertragsstatus (caregivers.vertragsstatus) ──────────────────
export type Vertragsstatus = 'aktiv' | 'gekuendigt' | 'ausgeschieden' | 'ruhend'
export const VERTRAGSSTATUS_WERTE: Vertragsstatus[] = ['aktiv', 'gekuendigt', 'ausgeschieden', 'ruhend']

// ── Schulungsart (personal_schulungen.schulungsart) ─────────────
export type Schulungsart = 'pflichtschulung' | 'fortbildung' | 'auffrischung' | 'einarbeitung' | 'extern' | 'sonstiges'
export const SCHULUNGSART_WERTE: Schulungsart[] = ['pflichtschulung', 'fortbildung', 'auffrischung', 'einarbeitung', 'extern', 'sonstiges']

// ── Dienstplan-Eintrag Status ───────────────────────────────────
export type DienstplanStatus = 'geplant' | 'bestaetigt' | 'in_bearbeitung' | 'abgeschlossen' | 'ausgefallen' | 'vertretung'
export const DIENSTPLAN_STATUS_WERTE: DienstplanStatus[] = ['geplant', 'bestaetigt', 'in_bearbeitung', 'abgeschlossen', 'ausgefallen', 'vertretung']

/**
 * Endzustaende eines geplanten Dienstes: was hier steht, ist gelaufen —
 * Kernfelder und Status lassen sich danach nicht mehr aendern (nur
 * Notizen bleiben ergaenzbar, siehe `updateEintrag`).
 *
 * Stand bis 29.08.2026 als private Konstante in `lib/personal/dienstplan.ts`
 * und war damit fuer die Oberflaeche unerreichbar: der Wochenplan konnte
 * einen abgeschlossenen Dienst zur Bearbeitung anbieten und lief in eine
 * 409 der Route. Hier steht sie client-sicher.
 */
export const DIENSTPLAN_ENDZUSTAENDE: DienstplanStatus[] = ['abgeschlossen', 'ausgefallen']

export type DienstplanTyp = 'regulaer' | 'vertretung' | 'ueberstunden' | 'bereitschaft' | 'notdienst'
export const DIENSTPLAN_TYP_WERTE: DienstplanTyp[] = ['regulaer', 'vertretung', 'ueberstunden', 'bereitschaft', 'notdienst']

// ── Arbeitszeit Status & Quelle ─────────────────────────────────
export type ArbeitszeitQuelle = 'manuell' | 'app' | 'dienstplan' | 'import'
export const ARBEITSZEIT_QUELLE_WERTE: ArbeitszeitQuelle[] = ['manuell', 'app', 'dienstplan', 'import']

export type ArbeitszeitStatus = 'erfasst' | 'bestaetigt' | 'korrigiert' | 'gesperrt'
export const ARBEITSZEIT_STATUS_WERTE: ArbeitszeitStatus[] = ['erfasst', 'bestaetigt', 'korrigiert', 'gesperrt']

// ── Abwesenheit Status ──────────────────────────────────────────
export type AbwesenheitStatus = 'beantragt' | 'genehmigt' | 'abgelehnt' | 'storniert'
export const ABWESENHEIT_STATUS_WERTE: AbwesenheitStatus[] = ['beantragt', 'genehmigt', 'abgelehnt', 'storniert']

export type AbwesenheitTyp = 'sick' | 'vacation' | 'personal' | 'other' | 'fortbildung' | 'mutterschutz' | 'elternzeit' | 'sonderurlaub' | 'unbezahlt'
export const ABWESENHEIT_TYP_WERTE: AbwesenheitTyp[] = ['sick', 'vacation', 'personal', 'other', 'fortbildung', 'mutterschutz', 'elternzeit', 'sonderurlaub', 'unbezahlt']

// ── Audit-Log Entitäten & Aktionen ──────────────────────────────
export type AuditEntitaetTyp = 'caregiver' | 'qualifikation' | 'schulung' | 'arbeitszeit' | 'abwesenheit' | 'urlaubskonto' | 'dienstplan' | 'vertretung' | 'einsatzfreigabe'
export type AuditAktion = 'erstellt' | 'bearbeitet' | 'geloescht' | 'genehmigt' | 'abgelehnt' | 'gesperrt' | 'freigegeben' | 'korrigiert' | 'storniert'

// ── DB-Interfaces ───────────────────────────────────────────────

export interface CaregiverStammdaten {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  notfallkontakt_name: string | null
  notfallkontakt_telefon: string | null
  notfallkontakt_beziehung: string | null
  vertragsstatus: Vertragsstatus | null
  einsatzgebiet_plz: string[]
  einsatzgebiet_radius_km: number | null
  wochenstunden_soll: number | null
  urlaubstage_jahresanspruch: number | null
  probezeitende: string | null
  fahrzeug_kennzeichen: string | null
  fuehrerschein_klassen: string[]
  einsatzfreigabe: boolean | null
  qualification_level: string | null
  /** Eigenes Fahrzeug vorhanden (caregivers.has_vehicle). */
  has_vehicle: boolean | null
  /** Führerschein vorhanden (caregivers.has_drivers_license). */
  has_drivers_license: boolean | null
}

export interface PersonalSchulung {
  id: string
  organization_id: string
  caregiver_id: string
  titel: string
  schulungsart: Schulungsart
  anbieter: string | null
  beginn: string
  ende: string | null
  dauer_stunden: number | null
  ort: string | null
  zertifikat_url: string | null
  dokument_id: string | null
  bestanden: boolean | null
  naechste_auffrischung: string | null
  bemerkung: string | null
  erstellt_von: string
  created_at: string
  updated_at: string
}

export interface DienstplanSchicht {
  id: string
  organization_id: string
  bezeichnung: string
  kuerzel: string | null
  start_zeit: string
  end_zeit: string
  pause_minuten: number
  farbe: string
  aktiv: boolean
  created_at: string
  updated_at: string
}

export interface DienstplanEintrag {
  id: string
  organization_id: string
  datum: string
  schicht_id: string | null
  caregiver_id: string | null
  client_id: string | null
  assignment_id: string | null
  start_zeit: string
  end_zeit: string
  pause_minuten: number
  status: DienstplanStatus
  typ: DienstplanTyp
  notizen: string | null
  bestaetigt_von: string | null
  bestaetigt_am: string | null
  erstellt_von: string
  created_at: string
  updated_at: string
}

export interface PersonalUrlaubskonto {
  id: string
  organization_id: string
  caregiver_id: string
  jahr: number
  anspruch_tage: number
  genommen_tage: number
  geplant_tage: number
  uebertrag_vorjahr: number
  resturlaub: number // GENERATED — nicht manuell setzen
  bemerkung: string | null
  created_at: string
  updated_at: string
}

export interface PersonalArbeitszeit {
  id: string
  organization_id: string
  caregiver_id: string
  datum: string
  start_zeit: string
  end_zeit: string
  pause_minuten: number
  ist_minuten: number
  soll_minuten: number | null
  ueberstunden_minuten: number // GENERATED
  dienstplan_eintrag_id: string | null
  service_record_id: string | null
  quelle: ArbeitszeitQuelle
  status: ArbeitszeitStatus
  bestaetigt_von: string | null
  bestaetigt_am: string | null
  gesperrt: boolean
  bemerkung: string | null
  created_at: string
  updated_at: string
}

export interface PersonalZeitkorrektur {
  id: string
  organization_id: string
  arbeitszeit_id: string
  caregiver_id: string
  feld: string
  alter_wert: string | null
  neuer_wert: string | null
  grund: string
  korrigiert_von: string
  created_at: string
}

export interface PersonalAuditLog {
  id: string
  organization_id: string
  entitaet_typ: AuditEntitaetTyp
  entitaet_id: string
  caregiver_id: string | null
  aktion: AuditAktion
  vorher: Record<string, unknown> | null
  nachher: Record<string, unknown> | null
  grund: string | null
  benutzer_id: string
  benutzer_rolle: string | null
  created_at: string
}

export interface Abwesenheit {
  id: string
  organization_id: string
  caregiver_id: string
  absence_type: AbwesenheitTyp
  start_date: string
  end_date: string
  reason: string | null
  status: AbwesenheitStatus | null
  halber_tag: boolean
  tage_berechnet: number | null
  genehmigt_von: string | null
  genehmigt_am: string | null
  ablehnungsgrund: string | null
  dokument_id: string | null
  erstellt_von: string | null
  created_at: string
  updated_at: string | null
}

export interface CaregiverQualifikation {
  id: string
  organization_id: string
  caregiver_id: string
  title: string
  qualification_type: string
  issued_date: string | null
  valid_until: string | null
  status: string
  ausstellende_stelle: string | null
  dokument_id: string | null
  bemerkung: string | null
  verifiziert_von: string | null
  verifiziert_am: string | null
  pflicht: boolean
  einsatzrelevant: boolean
  updated_at: string | null
}

// ── View-Interfaces ─────────────────────────────────────────────

export interface DienstplanTagesansicht {
  id: string
  organization_id: string
  datum: string
  start_zeit: string
  end_zeit: string
  pause_minuten: number
  status: DienstplanStatus
  typ: DienstplanTyp
  notizen: string | null
  caregiver_id: string | null
  caregiver_name: string | null
  caregiver_initials: string | null
  client_id: string | null
  client_name: string | null
  schicht_bezeichnung: string | null
  schicht_farbe: string | null
  assignment_id: string | null
  hat_abwesenheit: boolean
  abwesenheit_typ: string | null
}

export interface ArbeitszeitKonto {
  organization_id: string
  caregiver_id: string
  caregiver_name: string
  jahr: number
  monat: number
  anzahl_eintraege: number
  ist_minuten_gesamt: number
  soll_minuten_gesamt: number
  ueberstunden_gesamt: number
  pausen_gesamt: number
  korrigierte_eintraege: number
}

export interface QualifikationAblaufWarnung {
  organization_id: string
  qualifikation_id: string
  caregiver_id: string
  caregiver_name: string
  qualifikation: string
  typ: string
  gueltig_bis: string | null
  pflicht: boolean
  einsatzrelevant: boolean
  warnstufe: string
  tage_verbleibend: number | null
  einsatzfreigabe: boolean | null
}

export interface UrlaubsUebersicht {
  organization_id: string
  caregiver_id: string
  caregiver_name: string
  jahr: number
  anspruch_tage: number
  uebertrag_vorjahr: number
  genommen_tage: number
  geplant_tage: number
  resturlaub: number
  offene_antraege: number
}

// ── Validierung ─────────────────────────────────────────────────

/**
 * Wirft bei einem Wert ausserhalb der Erlaubnisliste.
 *
 * UserFacingError, NICHT der nackte Error von frueher: der Sanitizer
 * (lib/api/error-sanitizer.ts) reicht nur UserFacingError im Klartext
 * hinaus und macht aus jedem anderen Wurf ein „Interner Serverfehler" mit
 * Korrelations-ID. Die Meldung nennt hier das Feld und die erlaubten Werte
 * — genau die Auskunft, die den Tippfehler behebt — und kam trotzdem als
 * 500 ohne jeden Hinweis an. Ein falsch geschriebener Vertragsstatus sah
 * damit aus wie ein Anwendungsausfall.
 */
export function assertErlaubt<T extends string>(
  wert: T | null | undefined,
  erlaubt: readonly T[],
  feldname: string
): void {
  if (wert != null && !erlaubt.includes(wert)) {
    throw new UserFacingError(
      `Ungültiger Wert "${wert}" für ${feldname}. Erlaubt: ${erlaubt.join(', ')}`,
      400,
    )
  }
}

// Plausibilitätsprüfung für Arbeitszeit-Minutenwerte. Absichtlich KEIN
// Vergleich von start_zeit/end_zeit ("Ende vor Start"), da Nachtdienste
// über Mitternacht (z.B. 22:00-06:00) legitim sind (siehe diffMinutes in
// lib/admin/ops.ts, die diesen Fall bereits korrekt über den Tageswechsel
// hinweg berechnet). Stattdessen werden die daraus abgeleiteten
// Minutenwerte auf Plausibilität geprüft -- das fängt vertauschte Felder,
// negative Pausen und Tippfehler ohne falsche Nachtdienst-Ablehnung ab.
export function assertPlausibleZeiten(werte: { istMinuten?: number; pauseMinuten?: number }): void {
  if (werte.istMinuten !== undefined) {
    if (!Number.isFinite(werte.istMinuten) || werte.istMinuten <= 0) {
      throw new UserFacingError('Ist-Minuten müssen größer als 0 sein.')
    }
    if (werte.istMinuten > 1440) {
      throw new UserFacingError('Ist-Minuten dürfen 24 Stunden (1440 Minuten) nicht überschreiten.')
    }
  }
  if (werte.pauseMinuten !== undefined && werte.pauseMinuten !== null) {
    if (!Number.isFinite(werte.pauseMinuten) || werte.pauseMinuten < 0) {
      throw new UserFacingError('Pause-Minuten dürfen nicht negativ sein.')
    }
    if (werte.pauseMinuten > 1440) {
      throw new UserFacingError('Pause-Minuten dürfen 24 Stunden (1440 Minuten) nicht überschreiten.')
    }
  }
}
