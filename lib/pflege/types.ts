// ═══════════════════════════════════════════════════════════════
// Pflegedokumentation — geteilte Typen
// Spiegelt 1:1 die Spalten aus
// supabase/migrations/20260810010000_pflegedokumentation.sql
// ═══════════════════════════════════════════════════════════════

// ── Stammdaten-Erweiterungen auf clients ─────────────────────────
export type Aufnahmestatus = 'offen' | 'in_bearbeitung' | 'vollstaendig' | 'abgelehnt' | 'archiviert'

export type Familienstand =
  | 'ledig' | 'verheiratet' | 'geschieden' | 'verwitwet'
  | 'getrennt_lebend' | 'eingetragene_lebenspartnerschaft'

export type Wohnsituation =
  | 'alleinlebend' | 'mit_partner' | 'mit_angehoerigen'
  | 'betreutes_wohnen' | 'pflegeheim' | 'wg' | 'sonstiges'

/** Die 13 durch die Migration ergänzten Stammdatenfelder auf clients. */
export interface PflegeStammdaten {
  wohnsituation: Wohnsituation | null
  kommunikation_hinweise: string | null
  familienstand: Familienstand | null
  staatsangehoerigkeit: string | null
  religionszugehoerigkeit: string | null
  aufnahmedatum: string | null
  aufgenommen_von: string | null
  aufnahmestatus: Aufnahmestatus | null
  betreuungsbedarf_beschreibung: string | null
  individuelle_wuensche: string | null
  schluesseluebergabe: boolean | null
  haustiere: string | null
  wohnungsbesonderheiten: string | null
}

// ── pflege_aufnahmen ─────────────────────────────────────────────
export type AufnahmeStatus = 'entwurf' | 'in_bearbeitung' | 'abgeschlossen' | 'storniert'
export type AufnahmeOrt = 'wohnung' | 'buero' | 'telefonisch' | 'video' | 'sonstiges'
export type Dringlichkeit = 'normal' | 'dringend' | 'notfall'

export interface PflegeAufnahme {
  id: string
  organization_id: string
  client_id: string
  aufnahmedatum: string
  aufgenommen_von: string
  aufnahme_ort: AufnahmeOrt | null
  status: AufnahmeStatus
  pflegegrad_bei_aufnahme: number | null
  vorherige_versorgung: string | null
  grund_der_anfrage: string | null
  dringlichkeit: Dringlichkeit | null
  wohnsituation_details: string | null
  stockwerk: string | null
  aufzug_vorhanden: boolean | null
  barrierefrei: boolean | null
  schluesselregelung: string | null
  betreuungsbedarf: string | null
  gewuenschte_zeiten: string | null
  gewuenschte_haeufigkeit: string | null
  besondere_anforderungen: string | null
  empfehlung: string | null
  abschluss_bemerkung: string | null
  abgeschlossen_am: string | null
  abgeschlossen_von: string | null
  erstellt_von: string
  created_at: string
  updated_at: string
}

// ── pflege_anamnesen ─────────────────────────────────────────────
export type AnamneseTyp = 'erstanamnese' | 'folgeanamnese' | 'uebergabe' | 'wiederaufnahme'
export type AnamneseStatus = 'entwurf' | 'abgeschlossen' | 'gesperrt'
export type Sturzrisiko = 'unbekannt' | 'niedrig' | 'mittel' | 'hoch'

export interface PflegeAnamnese {
  id: string
  organization_id: string
  client_id: string
  anamnese_datum: string
  anamnese_typ: AnamneseTyp
  erhoben_von: string
  erhoben_rolle: string | null
  // Körper
  koerperlicher_zustand: string | null
  mobilitaet: string | null
  sturzrisiko: Sturzrisiko | null
  schmerzen: string | null
  ernaehrungszustand: string | null
  schluckbeschwerden: boolean | null
  inkontinenz: string | null
  hautbild: string | null
  // Kognition & Psyche
  orientierung: string | null
  kommunikationsfaehigkeit: string | null
  stimmungslage: string | null
  verhaltensauffaelligkeiten: string | null
  nachtruhe: string | null
  // Sozial
  soziale_kontakte: string | null
  tagesstruktur: string | null
  hobbys_interessen: string | null
  religioes_kulturell: string | null
  // Selbstversorgung
  koerperpflege: string | null
  an_auskleiden: string | null
  essen_trinken: string | null
  hauswirtschaft: string | null
  // Freitext
  zusammenfassung: string | null
  besonderheiten: string | null
  empfehlungen: string | null
  // Status
  status: AnamneseStatus
  abgeschlossen_am: string | null
  gesperrt: boolean
  erstellt_von: string
  created_at: string
  updated_at: string
}

/** Feldgruppen der Anamnese — steuert die Tab-Aufteilung im Admin-Formular. */
export const ANAMNESE_FELDGRUPPEN = {
  koerper: [
    'koerperlicher_zustand', 'mobilitaet', 'sturzrisiko', 'schmerzen',
    'ernaehrungszustand', 'schluckbeschwerden', 'inkontinenz', 'hautbild',
  ],
  kognition: [
    'orientierung', 'kommunikationsfaehigkeit', 'stimmungslage',
    'verhaltensauffaelligkeiten', 'nachtruhe',
  ],
  sozial: ['soziale_kontakte', 'tagesstruktur', 'hobbys_interessen', 'religioes_kulturell'],
  selbstversorgung: ['koerperpflege', 'an_auskleiden', 'essen_trinken', 'hauswirtschaft'],
} as const

// ── pflege_diagnosen ─────────────────────────────────────────────
export type DiagnoseTyp = 'diagnose' | 'einschraenkung' | 'hinweis' | 'chronisch' | 'akut'
export type DiagnoseSchweregrad = 'leicht' | 'mittel' | 'schwer' | 'kritisch'

export interface PflegeDiagnose {
  id: string
  organization_id: string
  client_id: string
  diagnose_typ: DiagnoseTyp
  bezeichnung: string
  icd_code: string | null
  beschreibung: string | null
  diagnostiziert_am: string | null
  diagnostiziert_von: string | null
  schweregrad: DiagnoseSchweregrad | null
  aktiv: boolean
  betreuungsrelevant: boolean
  hinweis_fuer_engel: string | null
  erstellt_von: string
  created_at: string
  updated_at: string
}

// ── pflege_risiken ───────────────────────────────────────────────
export type RisikoTyp =
  | 'allergie' | 'unvertraeglichkeit' | 'sturzrisiko' | 'dekubitusrisiko'
  | 'schluckrisiko' | 'weglaufrisiko' | 'aggressionsrisiko' | 'infektionsrisiko' | 'sonstiges'

export type RisikoSchweregrad = 'niedrig' | 'mittel' | 'hoch' | 'kritisch'

export interface PflegeRisiko {
  id: string
  organization_id: string
  client_id: string
  risiko_typ: RisikoTyp
  bezeichnung: string
  beschreibung: string | null
  schweregrad: RisikoSchweregrad
  massnahmen: string | null
  aktiv: boolean
  erkannt_am: string | null
  erkannt_von: string | null
  naechste_pruefung: string | null
  erstellt_von: string
  created_at: string
  updated_at: string
}

export type RisikoPruefstatus = 'keine_pruefung' | 'ueberfaellig' | 'bald_faellig' | 'ok'

/** Zeile aus View pflege_risiko_dashboard. */
export interface PflegeRisikoDashboardZeile {
  id: string
  organization_id: string
  client_id: string
  kunde_name: string
  risiko_typ: RisikoTyp
  bezeichnung: string
  schweregrad: RisikoSchweregrad
  massnahmen: string | null
  naechste_pruefung: string | null
  pruefstatus: RisikoPruefstatus
}

// ── pflege_massnahmenplaene ──────────────────────────────────────
export type PlanTyp = 'versorgungsplan' | 'betreuungsplan' | 'massnahmenplan' | 'notfallplan'
export type PlanStatus = 'entwurf' | 'aktiv' | 'abgelaufen' | 'gesperrt' | 'ersetzt'

export interface PflegeMassnahmenplan {
  id: string
  organization_id: string
  client_id: string
  titel: string
  plan_typ: PlanTyp
  gueltig_von: string
  gueltig_bis: string | null
  version: number
  status: PlanStatus
  betreuungsziele: string | null
  pflegeziele: string | null
  freigegeben_von: string | null
  freigegeben_am: string | null
  gesperrt: boolean
  vorgaenger_id: string | null
  erstellt_von: string
  created_at: string
  updated_at: string
}

// ── pflege_massnahmen ────────────────────────────────────────────
export type MassnahmeKategorie =
  | 'koerperpflege' | 'ernaehrung' | 'mobilitaet' | 'hauswirtschaft'
  | 'soziale_betreuung' | 'kognitive_foerderung' | 'medikation'
  | 'arztbesuche' | 'kommunikation' | 'sicherheit' | 'sonstiges'

export type MassnahmePrioritaet = 'niedrig' | 'normal' | 'hoch' | 'dringend'
export type MassnahmeStatus = 'geplant' | 'aktiv' | 'pausiert' | 'abgeschlossen' | 'abgebrochen'

export interface PflegeMassnahme {
  id: string
  organization_id: string
  plan_id: string
  kategorie: MassnahmeKategorie
  titel: string
  beschreibung: string | null
  ziel: string | null
  haeufigkeit: string | null
  verantwortlich: string | null
  prioritaet: MassnahmePrioritaet
  status: MassnahmeStatus
  beginn_datum: string | null
  ende_datum: string | null
  ergebnis: string | null
  sortierung: number
  erstellt_von: string
  created_at: string
  updated_at: string
}

// ── pflege_verlauf ───────────────────────────────────────────────
export type VerlaufTyp =
  | 'verlauf' | 'ereignis' | 'beobachtung' | 'uebergabe' | 'telefonat'
  | 'arztbesuch' | 'angehoerigenkontakt' | 'besonderheit' | 'sturz' | 'notfall'

export type VerlaufKategorie =
  | 'allgemein' | 'koerperpflege' | 'ernaehrung' | 'mobilitaet' | 'kognition'
  | 'soziales' | 'medikation' | 'hauswirtschaft' | 'kommunikation'
  | 'stimmung' | 'schmerz' | 'schlaf' | 'sonstiges'

export type VerlaufSichtbarkeit = 'intern' | 'engel' | 'kunde' | 'alle'

export interface PflegeVerlaufEintrag {
  id: string
  organization_id: string
  client_id: string
  eintrag_datum: string
  eintrag_typ: VerlaufTyp
  kategorie: VerlaufKategorie
  titel: string | null
  inhalt: string
  ist_dringend: boolean
  service_record_id: string | null
  massnahme_id: string | null
  anamnese_id: string | null
  autor_id: string
  autor_name: string
  autor_rolle: string
  sichtbarkeit: VerlaufSichtbarkeit
  gesperrt: boolean
  gesperrt_am: string | null
  gesperrt_von: string | null
  created_at: string
  updated_at: string
}

// ── pflege_doku_perioden ─────────────────────────────────────────
export type PeriodenStatus = 'offen' | 'abgeschlossen' | 'wiedereroeffnet'

export interface PflegeDokuPeriode {
  id: string
  organization_id: string
  client_id: string
  jahr: number
  monat: number
  status: PeriodenStatus
  abgeschlossen_am: string | null
  abgeschlossen_von: string | null
  freigabe_bemerkung: string | null
  wiedereroeffnet_am: string | null
  wiedereroeffnet_von: string | null
  wiedereroeffnung_grund: string | null
  created_at: string
  updated_at: string
}

// ── View pflege_uebersicht ───────────────────────────────────────
export interface PflegeUebersichtZeile {
  client_id: string
  organization_id: string
  first_name: string
  last_name: string
  /** Nachgeordnete Spalte, kann bei Bestandskunden NULL sein. Nie direkt lesen — pflegegradVon() nutzen. */
  pflegegrad: number | null
  /** Führende Spalte (lib/clients/pflegegrad.ts). Nur vorhanden, wenn Migration 20260921020000 live ist. */
  care_level?: number | string | null
  aufnahmestatus: Aufnahmestatus | null
  aufnahmedatum: string | null
  aufnahmen_count: number
  anamnesen_count: number
  letzte_anamnese: string | null
  aktive_diagnosen: number
  aktive_risiken: number
  aktive_plaene: number
  verlauf_count: number
  letzter_verlauf: string | null
}

// ── pflege_audit_log ──────────────────────────────────────────────
// Änderungshistorie der Pflegedokumentation (Aufnahme, Anamnese, Diagnosen,
// Risiken, Verlauf, Maßnahmen/-pläne). Append-only, analog ops_aktivitaetslog
// (lib/ops/aktivitaetslog.ts) / akten_zugriff_log (lib/akten/zugriff-log.ts).
export type PflegeAuditEntitaetTyp =
  | 'aufnahme' | 'anamnese' | 'diagnose' | 'risiko'
  | 'verlauf' | 'massnahme' | 'massnahmenplan'
  | 'medikament' | 'wunddokumentation' | 'sturzprotokoll'
  | 'fixierungsprotokoll' | 'lagerungsprotokoll'
  | 'wund_assessment' | 'wund_behandlung' | 'fem_ueberwachung'

export const PFLEGE_AUDIT_ENTITAET_TYP_WERTE: PflegeAuditEntitaetTyp[] = [
  'aufnahme', 'anamnese', 'diagnose', 'risiko',
  'verlauf', 'massnahme', 'massnahmenplan',
  'medikament', 'wunddokumentation', 'sturzprotokoll',
  'fixierungsprotokoll', 'lagerungsprotokoll',
  'wund_assessment', 'wund_behandlung', 'fem_ueberwachung',
]

export type PflegeAuditAktion =
  | 'erstellt' | 'aktualisiert' | 'geloescht'
  | 'gesperrt' | 'entsperrt' | 'freigegeben'
  | 'archiviert'

export const PFLEGE_AUDIT_AKTION_WERTE: PflegeAuditAktion[] = [
  'erstellt', 'aktualisiert', 'geloescht',
  'gesperrt', 'entsperrt', 'freigegeben',
  'archiviert',
]

export interface PflegeAuditLogEintrag {
  id: string
  organization_id: string
  entitaet_typ: PflegeAuditEntitaetTyp
  entitaet_id: string
  aktion: PflegeAuditAktion
  vorher: Record<string, unknown> | null
  nachher: Record<string, unknown> | null
  akteur_id: string | null
  ip_adresse: string | null
  erstellt_am: string
}

// ── Gültigkeitslisten (Laufzeit-Validierung vor jedem DB-Zugriff) ─
export const AUFNAHME_STATUS_WERTE: AufnahmeStatus[] = ['entwurf', 'in_bearbeitung', 'abgeschlossen', 'storniert']
export const AUFNAHME_ORT_WERTE: AufnahmeOrt[] = ['wohnung', 'buero', 'telefonisch', 'video', 'sonstiges']
export const DRINGLICHKEIT_WERTE: Dringlichkeit[] = ['normal', 'dringend', 'notfall']
export const ANAMNESE_TYP_WERTE: AnamneseTyp[] = ['erstanamnese', 'folgeanamnese', 'uebergabe', 'wiederaufnahme']
export const STURZRISIKO_WERTE: Sturzrisiko[] = ['unbekannt', 'niedrig', 'mittel', 'hoch']
export const DIAGNOSE_TYP_WERTE: DiagnoseTyp[] = ['diagnose', 'einschraenkung', 'hinweis', 'chronisch', 'akut']
export const DIAGNOSE_SCHWEREGRAD_WERTE: DiagnoseSchweregrad[] = ['leicht', 'mittel', 'schwer', 'kritisch']
export const RISIKO_TYP_WERTE: RisikoTyp[] = [
  'allergie', 'unvertraeglichkeit', 'sturzrisiko', 'dekubitusrisiko',
  'schluckrisiko', 'weglaufrisiko', 'aggressionsrisiko', 'infektionsrisiko', 'sonstiges',
]
export const RISIKO_SCHWEREGRAD_WERTE: RisikoSchweregrad[] = ['niedrig', 'mittel', 'hoch', 'kritisch']
export const PLAN_TYP_WERTE: PlanTyp[] = ['versorgungsplan', 'betreuungsplan', 'massnahmenplan', 'notfallplan']
export const MASSNAHME_KATEGORIE_WERTE: MassnahmeKategorie[] = [
  'koerperpflege', 'ernaehrung', 'mobilitaet', 'hauswirtschaft', 'soziale_betreuung',
  'kognitive_foerderung', 'medikation', 'arztbesuche', 'kommunikation', 'sicherheit', 'sonstiges',
]
export const MASSNAHME_PRIORITAET_WERTE: MassnahmePrioritaet[] = ['niedrig', 'normal', 'hoch', 'dringend']
export const MASSNAHME_STATUS_WERTE: MassnahmeStatus[] = ['geplant', 'aktiv', 'pausiert', 'abgeschlossen', 'abgebrochen']
export const VERLAUF_TYP_WERTE: VerlaufTyp[] = [
  'verlauf', 'ereignis', 'beobachtung', 'uebergabe', 'telefonat',
  'arztbesuch', 'angehoerigenkontakt', 'besonderheit', 'sturz', 'notfall',
]
export const VERLAUF_KATEGORIE_WERTE: VerlaufKategorie[] = [
  'allgemein', 'koerperpflege', 'ernaehrung', 'mobilitaet', 'kognition', 'soziales',
  'medikation', 'hauswirtschaft', 'kommunikation', 'stimmung', 'schmerz', 'schlaf', 'sonstiges',
]
export const VERLAUF_SICHTBARKEIT_WERTE: VerlaufSichtbarkeit[] = ['intern', 'engel', 'kunde', 'alle']

/**
 * Wirft mit lesbarer Meldung, wenn ein Wert nicht in der erlaubten Liste steht.
 * Die DB-Check-Constraints erzwingen dasselbe — hier greift die Prüfung schon
 * vor dem Roundtrip und liefert eine deutschsprachige Fehlermeldung.
 */
export function assertErlaubt<T extends string>(wert: T | null | undefined, erlaubt: readonly T[], feld: string): void {
  if (wert === null || wert === undefined) return
  if (!erlaubt.includes(wert)) {
    throw new Error(`Ungültiger Wert "${wert}" für ${feld}. Erlaubt: ${erlaubt.join(', ')}.`)
  }
}
