// ═══════════════════════════════════════════════════════════════
// Aufgaben & Kommunikation — geteilte Typen
// Spiegelt 1:1 die Spalten aus
// supabase/migrations/20260812010000_aufgaben_kommunikation.sql
// ═══════════════════════════════════════════════════════════════

// ── Aufgaben-Enums ─────────────────────────────────────────────

export type AufgabenKategorie =
  | 'allgemein' | 'kunde' | 'mitarbeiter' | 'einsatz' | 'dokument'
  | 'verordnung' | 'abrechnung' | 'pflege' | 'qualifikation'
  | 'dienstplan' | 'urlaub' | 'kommunikation' | 'system'

export const AUFGABEN_KATEGORIE_WERTE: AufgabenKategorie[] = [
  'allgemein', 'kunde', 'mitarbeiter', 'einsatz', 'dokument',
  'verordnung', 'abrechnung', 'pflege', 'qualifikation',
  'dienstplan', 'urlaub', 'kommunikation', 'system',
]

export type AufgabenPrioritaet = 'niedrig' | 'mittel' | 'hoch' | 'kritisch'
export const AUFGABEN_PRIORITAET_WERTE: AufgabenPrioritaet[] = ['niedrig', 'mittel', 'hoch', 'kritisch']

export type AufgabenStatus = 'offen' | 'in_bearbeitung' | 'warten' | 'erledigt' | 'storniert'
export const AUFGABEN_STATUS_WERTE: AufgabenStatus[] = ['offen', 'in_bearbeitung', 'warten', 'erledigt', 'storniert']

export type WiederholungIntervall = 'taeglich' | 'woechentlich' | 'monatlich' | 'quartalsweise' | 'jaehrlich'
export const WIEDERHOLUNG_INTERVALL_WERTE: WiederholungIntervall[] = ['taeglich', 'woechentlich', 'monatlich', 'quartalsweise', 'jaehrlich']

// ── Wiedervorlage-Enums ────────────────────────────────────────

export type WiedervorlageEntitaetTyp =
  | 'aufgabe' | 'kunde' | 'mitarbeiter' | 'einsatz' | 'dokument'
  | 'verordnung' | 'abrechnung' | 'pflege' | 'qualifikation' | 'allgemein'

export const WIEDERVORLAGE_ENTITAET_TYP_WERTE: WiedervorlageEntitaetTyp[] = [
  'aufgabe', 'kunde', 'mitarbeiter', 'einsatz', 'dokument',
  'verordnung', 'abrechnung', 'pflege', 'qualifikation', 'allgemein',
]

export type WiedervorlageStatus = 'aktiv' | 'erledigt' | 'storniert'
export const WIEDERVORLAGE_STATUS_WERTE: WiedervorlageStatus[] = ['aktiv', 'erledigt', 'storniert']

// ── Eskalation-Enums ───────────────────────────────────────────

export type EskalationRolle = 'admin' | 'pdl' | 'geschaeftsfuehrung'
export const ESKALATION_ROLLE_WERTE: EskalationRolle[] = ['admin', 'pdl', 'geschaeftsfuehrung']

// ── Nachrichten-Enums ──────────────────────────────────────────

export type NachrichtenPrioritaet = 'normal' | 'dringend'
export const NACHRICHTEN_PRIORITAET_WERTE: NachrichtenPrioritaet[] = ['normal', 'dringend']

export type NachrichtenKategorie =
  | 'allgemein' | 'einsatz' | 'kunde' | 'mitarbeiter' | 'aufgabe'
  | 'dienstplan' | 'abrechnung' | 'pflege' | 'system'

export const NACHRICHTEN_KATEGORIE_WERTE: NachrichtenKategorie[] = [
  'allgemein', 'einsatz', 'kunde', 'mitarbeiter', 'aufgabe',
  'dienstplan', 'abrechnung', 'pflege', 'system',
]

export type NachrichtenBezugTyp =
  | 'aufgabe' | 'kunde' | 'einsatz' | 'mitarbeiter' | 'dokument' | 'verordnung'

export const NACHRICHTEN_BEZUG_TYP_WERTE: NachrichtenBezugTyp[] = [
  'aufgabe', 'kunde', 'einsatz', 'mitarbeiter', 'dokument', 'verordnung',
]

// ── Benachrichtigungs-Enums ────────────────────────────────────

export type BenachrichtigungTyp = 'info' | 'warnung' | 'fehler' | 'erfolg' | 'erinnerung' | 'eskalation'
export const BENACHRICHTIGUNG_TYP_WERTE: BenachrichtigungTyp[] = ['info', 'warnung', 'fehler', 'erfolg', 'erinnerung', 'eskalation']

export type BenachrichtigungKategorie =
  | 'dienstplan' | 'einsatz' | 'urlaub' | 'qualifikation' | 'dokument'
  | 'abrechnung' | 'aufgabe' | 'pflege' | 'personal' | 'system'
  | 'kommunikation' | 'wiedervorlage' | 'eskalation'

export const BENACHRICHTIGUNG_KATEGORIE_WERTE: BenachrichtigungKategorie[] = [
  'dienstplan', 'einsatz', 'urlaub', 'qualifikation', 'dokument',
  'abrechnung', 'aufgabe', 'pflege', 'personal', 'system',
  'kommunikation', 'wiedervorlage', 'eskalation',
]

export type BenachrichtigungBezugTyp =
  | 'aufgabe' | 'kunde' | 'einsatz' | 'mitarbeiter' | 'dokument'
  | 'verordnung' | 'dienstplan' | 'urlaub' | 'qualifikation'
  | 'abrechnung' | 'nachricht' | 'wiedervorlage'

export const BENACHRICHTIGUNG_BEZUG_TYP_WERTE: BenachrichtigungBezugTyp[] = [
  'aufgabe', 'kunde', 'einsatz', 'mitarbeiter', 'dokument',
  'verordnung', 'dienstplan', 'urlaub', 'qualifikation',
  'abrechnung', 'nachricht', 'wiedervorlage',
]

// ── Ereignis-Enums ─────────────────────────────────────────────

/**
 * Ereignistypen.
 *
 * Diese Liste MUSS deckungsgleich mit dem CHECK-Constraint
 * `ops_ereignis_typ_check` sein. Sie war es nicht: von 22 TypeScript-Werten
 * lehnte Postgres 11 ab (u. a. 'aufgabe_erstellt', 'einsatz_erstellt',
 * 'abrechnung_erstellt'), waehrend 11 DB-Werte in TypeScript fehlten (u. a.
 * 'abrechnung_ruecklaefer', 'unterschrift_fehlend'). Wirkung: fuer die Haelfte
 * aller Ereignisse liess sich keine Regel anlegen (23514 beim INSERT), und die
 * nur in der DB bekannten Typen waren aus dem Code nicht erreichbar.
 *
 * Die Liste unten ist die VEREINIGUNG beider Seiten; die DB-Seite zieht
 * Migration 20260816010000_ereignis_typ_konsistenz.sql nach. Der Abgleich
 * wird von `__tests__/ops/ereignis-typ-konsistenz.test.ts` erzwungen.
 */
export type EreignisTyp =
  // in DB und TypeScript
  | 'aufgabe_ueberfaellig' | 'aufgabe_erledigt' | 'aufgabe_eskaliert' | 'aufgabe_zugewiesen'
  | 'wiedervorlage_faellig'
  | 'nachricht_empfangen'
  | 'einsatz_storniert'
  | 'urlaub_beantragt' | 'urlaub_genehmigt'
  | 'qualifikation_abgelaufen'
  | 'abrechnung_fehler'
  // bisher nur in TypeScript — von der Migration in der DB ergaenzt
  | 'aufgabe_erstellt' | 'aufgabe_faellig'
  | 'wiedervorlage_erstellt'
  | 'nachricht_dringend'
  | 'einsatz_erstellt'
  | 'dienstplan_geaendert'
  | 'dokument_hochgeladen'
  | 'abrechnung_erstellt'
  | 'pflege_aufnahme'
  | 'eskalation_ausgeloest'
  | 'system_wartung'
  // bisher nur in der DB — jetzt auch aus dem Code erreichbar
  | 'qualifikation_warnung'
  | 'dokument_abgelaufen' | 'verordnung_abgelaufen'
  | 'dienstplan_aenderung' | 'neuer_einsatz' | 'einsatz_geaendert'
  | 'urlaub_abgelehnt'
  | 'unterschrift_fehlend' | 'pflege_doku_offen'
  | 'abrechnung_ruecklaefer'
  | 'system_kritisch'

export const EREIGNIS_TYP_WERTE: EreignisTyp[] = [
  'aufgabe_ueberfaellig', 'aufgabe_erledigt', 'aufgabe_eskaliert', 'aufgabe_zugewiesen',
  'wiedervorlage_faellig',
  'nachricht_empfangen',
  'einsatz_storniert',
  'urlaub_beantragt', 'urlaub_genehmigt',
  'qualifikation_abgelaufen',
  'abrechnung_fehler',
  'aufgabe_erstellt', 'aufgabe_faellig',
  'wiedervorlage_erstellt',
  'nachricht_dringend',
  'einsatz_erstellt',
  'dienstplan_geaendert',
  'dokument_hochgeladen',
  'abrechnung_erstellt',
  'pflege_aufnahme',
  'eskalation_ausgeloest',
  'system_wartung',
  'qualifikation_warnung',
  'dokument_abgelaufen', 'verordnung_abgelaufen',
  'dienstplan_aenderung', 'neuer_einsatz', 'einsatz_geaendert',
  'urlaub_abgelehnt',
  'unterschrift_fehlend', 'pflege_doku_offen',
  'abrechnung_ruecklaefer',
  'system_kritisch',
]

export type EreignisEmpfaengerRolle = 'admin' | 'pdl' | 'engel' | 'verantwortlicher' | 'alle'
export const EREIGNIS_EMPFAENGER_ROLLE_WERTE: EreignisEmpfaengerRolle[] = ['admin', 'pdl', 'engel', 'verantwortlicher', 'alle']

// ── Aktivitaetslog-Enums ───────────────────────────────────────

export type AktivitaetEntitaetTyp =
  | 'aufgabe' | 'wiedervorlage' | 'eskalation' | 'nachricht'
  | 'benachrichtigung' | 'praeferenz' | 'ereignis_regel' | 'checkliste'

export const AKTIVITAET_ENTITAET_TYP_WERTE: AktivitaetEntitaetTyp[] = [
  'aufgabe', 'wiedervorlage', 'eskalation', 'nachricht',
  'benachrichtigung', 'praeferenz', 'ereignis_regel', 'checkliste',
]

export type AktivitaetAktion =
  | 'erstellt' | 'aktualisiert' | 'geloescht' | 'status_geaendert'
  | 'zugewiesen' | 'eskaliert' | 'erledigt' | 'storniert'
  | 'gelesen' | 'gesendet' | 'genehmigt' | 'abgelehnt'

export const AKTIVITAET_AKTION_WERTE: AktivitaetAktion[] = [
  'erstellt', 'aktualisiert', 'geloescht', 'status_geaendert',
  'zugewiesen', 'eskaliert', 'erledigt', 'storniert',
  'gelesen', 'gesendet', 'genehmigt', 'abgelehnt',
]

// ── DB-Interfaces ──────────────────────────────────────────────

export interface OpsAufgabe {
  id: string
  organization_id: string
  titel: string
  beschreibung: string | null
  kategorie: AufgabenKategorie
  prioritaet: AufgabenPrioritaet
  status: AufgabenStatus
  verantwortlich_id: string | null
  stellvertreter_id: string | null
  erstellt_von: string | null
  faellig_am: string | null
  erledigt_am: string | null
  erledigt_von: string | null
  client_id: string | null
  caregiver_id: string | null
  assignment_id: string | null
  dokument_id: string | null
  verordnung_id: string | null
  abrechnungslauf_id: string | null
  pflege_aufnahme_id: string | null
  dienstplan_eintrag_id: string | null
  ist_wiederkehrend: boolean
  wiederholung_intervall: WiederholungIntervall | null
  wiederholung_naechstes: string | null
  wiederholung_ende: string | null
  wiederholung_vorlage_id: string | null
  eskalationsstufe: number
  eskaliert_am: string | null
  eskaliert_an: string | null
  tags: string[]
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface OpsAufgabeCheckliste {
  id: string
  organization_id: string
  aufgabe_id: string
  titel: string
  position: number
  erledigt: boolean
  erledigt_von: string | null
  erledigt_am: string | null
  created_at: string
}

export interface OpsAufgabeKommentar {
  id: string
  organization_id: string
  aufgabe_id: string
  inhalt: string
  autor_id: string
  ist_intern: boolean
  created_at: string
  updated_at: string
}

export interface OpsAufgabeAnhang {
  id: string
  organization_id: string
  aufgabe_id: string
  dokument_id: string
  hinzugefuegt_von: string | null
  created_at: string
}

export interface OpsWiedervorlage {
  id: string
  organization_id: string
  titel: string
  beschreibung: string | null
  entitaet_typ: WiedervorlageEntitaetTyp
  entitaet_id: string
  faellig_am: string
  empfaenger_id: string
  status: WiedervorlageStatus
  erledigt_am: string | null
  erledigt_von: string | null
  erstellt_von: string
  created_at: string
}

export interface OpsEskalationsregel {
  id: string
  organization_id: string
  name: string
  beschreibung: string | null
  aufgaben_kategorie: AufgabenKategorie | null
  aufgaben_prioritaet: AufgabenPrioritaet | null
  ueberfaellig_stunden: number
  eskalationsstufe: number
  eskalation_an_rolle: EskalationRolle | null
  eskalation_an_user_id: string | null
  benachrichtigung_senden: boolean
  aktiv: boolean
  created_at: string
  updated_at: string
}

export interface OpsEskalationshistorie {
  id: string
  organization_id: string
  aufgabe_id: string
  regel_id: string | null
  eskalationsstufe: number
  eskaliert_an: string | null
  grund: string
  erstellt_am: string
}

export interface OpsNachricht {
  id: string
  organization_id: string
  betreff: string
  inhalt: string
  absender_id: string
  prioritaet: NachrichtenPrioritaet
  kategorie: NachrichtenKategorie
  bezug_typ: NachrichtenBezugTyp | null
  bezug_id: string | null
  eltern_id: string | null
  created_at: string
}

export interface OpsNachrichtEmpfaenger {
  id: string
  organization_id: string
  nachricht_id: string
  empfaenger_id: string
  gelesen: boolean
  gelesen_am: string | null
  created_at: string
}

export interface OpsBenachrichtigung {
  id: string
  organization_id: string
  empfaenger_id: string
  titel: string
  inhalt: string | null
  typ: BenachrichtigungTyp
  kategorie: BenachrichtigungKategorie
  bezug_typ: BenachrichtigungBezugTyp | null
  bezug_id: string | null
  link: string | null
  gelesen: boolean
  gelesen_am: string | null
  email_gesendet: boolean
  push_gesendet: boolean
  created_at: string
}

export interface OpsBenachrichtigungsPraeferenz {
  id: string
  organization_id: string
  benutzer_id: string
  kategorie: BenachrichtigungKategorie
  in_app: boolean
  email: boolean
  push: boolean
  aktiv: boolean
  created_at: string
  updated_at: string
}

export interface OpsEreignisRegel {
  id: string
  organization_id: string
  name: string
  beschreibung: string | null
  ereignis_typ: EreignisTyp
  empfaenger_rolle: EreignisEmpfaengerRolle | null
  empfaenger_user_id: string | null
  nachricht_vorlage: string
  titel_vorlage: string
  prioritaet: NachrichtenPrioritaet
  kategorie: BenachrichtigungKategorie
  aktiv: boolean
  created_at: string
  updated_at: string
}

export interface OpsAktivitaetslog {
  id: string
  organization_id: string
  entitaet_typ: AktivitaetEntitaetTyp
  entitaet_id: string
  aktion: AktivitaetAktion
  vorher: Record<string, unknown> | null
  nachher: Record<string, unknown> | null
  akteur_id: string | null
  ip_adresse: string | null
  erstellt_am: string
}

// ── View-Interfaces ────────────────────────────────────────────

export type FaelligkeitsStatus = 'ueberfaellig' | 'heute' | 'diese_woche' | 'spaeter' | 'ohne_datum'

export interface OpsAufgabeUebersicht extends OpsAufgabe {
  verantwortlich_name: string | null
  stellvertreter_name: string | null
  erstellt_von_name: string | null
  client_name: string | null
  caregiver_name: string | null
  faelligkeits_status: FaelligkeitsStatus
  checklisten_total: number
  checklisten_erledigt: number
  kommentare_anzahl: number
}

export type WiedervorlageDringlichkeit = 'ueberfaellig' | 'heute' | 'morgen' | 'diese_woche' | 'spaeter'

export interface OpsWiedervorlageFaellig extends OpsWiedervorlage {
  empfaenger_name: string | null
  erstellt_von_name: string | null
  dringlichkeit: WiedervorlageDringlichkeit
}

export interface OpsBenachrichtigungZaehler {
  empfaenger_id: string
  kategorie: BenachrichtigungKategorie
  ungelesen: number
}

export interface OpsPosteingang extends OpsNachricht {
  absender_name: string | null
  gelesen: boolean
  antworten_anzahl: number
}

// ── Filter-Interfaces ──────────────────────────────────────────

export interface ListAufgabenFilter {
  organizationId: string
  status?: AufgabenStatus
  kategorie?: AufgabenKategorie
  prioritaet?: AufgabenPrioritaet
  verantwortlichId?: string
  search?: string
  limit?: number
  offset?: number
}

export interface ListWiedervorlagenFilter {
  organizationId: string
  status?: WiedervorlageStatus
  empfaengerId?: string
}

export interface ListEskalationsregelnFilter {
  organizationId: string
  aktiv?: boolean
}

export interface ListEskalationshistorieFilter {
  organizationId: string
  aufgabeId?: string
  limit?: number
}

export interface ListPosteingangFilter {
  organizationId: string
  empfaengerId: string
}

export interface ListBenachrichtigungenFilter {
  organizationId: string
  empfaengerId: string
  gelesen?: boolean
  kategorie?: BenachrichtigungKategorie
  limit?: number
}

export interface ListAktivitaetslogFilter {
  organizationId: string
  entitaetTyp?: AktivitaetEntitaetTyp
  entitaetId?: string
  limit?: number
  offset?: number
}

export interface ListEreignisRegelnFilter {
  organizationId: string
  aktiv?: boolean
}

// ── Validierung ────────────────────────────────────────────────

export function assertErlaubt<T extends string>(
  wert: T | null | undefined,
  erlaubt: readonly T[],
  feldname: string,
): void {
  if (wert != null && !erlaubt.includes(wert)) {
    throw new Error(`Ungueltiger Wert "${wert}" fuer ${feldname}. Erlaubt: ${erlaubt.join(', ')}`)
  }
}
