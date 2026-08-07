// ═══════════════════════════════════════════════════════════════
// EXPANSION DEUTSCHLAND — Typen & Konstanten
// ═══════════════════════════════════════════════════════════════
// Spiegelt supabase/migrations/20260808100000_expansion_deutschland.sql.
//
// Grundsatz: Die Anerkennung nach §45a SGB XI ist ein Zustand EINES
// Bundeslands, kein Zustand der Plattform. Werbung, Registrierung,
// Warteliste und Privatleistungen laufen unabhängig davon weiter.
// ═══════════════════════════════════════════════════════════════

/** Katalog-Codes der 16 Bundesländer (= public.bundeslaender.code). */
export const BUNDESLAND_CODES = [
  'baden_wuerttemberg',
  'bayern',
  'berlin',
  'brandenburg',
  'bremen',
  'hamburg',
  'hessen',
  'mecklenburg_vorpommern',
  'niedersachsen',
  'nordrhein_westfalen',
  'rheinland_pfalz',
  'saarland',
  'sachsen',
  'sachsen_anhalt',
  'schleswig_holstein',
  'thueringen',
] as const

export type BundeslandCode = (typeof BUNDESLAND_CODES)[number]

export function istBundeslandCode(value: unknown): value is BundeslandCode {
  return typeof value === 'string'
    && (BUNDESLAND_CODES as readonly string[]).includes(value)
}

export const BUNDESLAND_NAMEN: Record<BundeslandCode, string> = {
  baden_wuerttemberg:     'Baden-Württemberg',
  bayern:                 'Bayern',
  berlin:                 'Berlin',
  brandenburg:            'Brandenburg',
  bremen:                 'Bremen',
  hamburg:                'Hamburg',
  hessen:                 'Hessen',
  mecklenburg_vorpommern: 'Mecklenburg-Vorpommern',
  niedersachsen:          'Niedersachsen',
  nordrhein_westfalen:    'Nordrhein-Westfalen',
  rheinland_pfalz:        'Rheinland-Pfalz',
  saarland:               'Saarland',
  sachsen:                'Sachsen',
  sachsen_anhalt:         'Sachsen-Anhalt',
  schleswig_holstein:     'Schleswig-Holstein',
  thueringen:             'Thüringen',
}

export const BUNDESLAND_ISO: Record<BundeslandCode, string> = {
  baden_wuerttemberg:     'DE-BW',
  bayern:                 'DE-BY',
  berlin:                 'DE-BE',
  brandenburg:            'DE-BB',
  bremen:                 'DE-HB',
  hamburg:                'DE-HH',
  hessen:                 'DE-HE',
  mecklenburg_vorpommern: 'DE-MV',
  niedersachsen:          'DE-NI',
  nordrhein_westfalen:    'DE-NW',
  rheinland_pfalz:        'DE-RP',
  saarland:               'DE-SL',
  sachsen:                'DE-SN',
  sachsen_anhalt:         'DE-ST',
  schleswig_holstein:     'DE-SH',
  thueringen:             'DE-TH',
}

// ── Anerkennungs-Status ─────────────────────────────────────────

export const EXPANSION_STATUS = [
  'VORBEREITUNG',
  'ANTRAG_EINGEREICHT',
  'IN_PRUEFUNG',
  'ANERKANNT',
  'ABGELEHNT',
] as const

export type ExpansionStatus = (typeof EXPANSION_STATUS)[number]

export function istExpansionStatus(value: unknown): value is ExpansionStatus {
  return typeof value === 'string'
    && (EXPANSION_STATUS as readonly string[]).includes(value)
}

export const STATUS_META: Record<ExpansionStatus, { label: string; color: string; kurz: string }> = {
  VORBEREITUNG:       { label: 'In Vorbereitung',    color: '#8A8177', kurz: 'Vorbereitung' },
  ANTRAG_EINGEREICHT: { label: 'Antrag eingereicht', color: '#E8A000', kurz: 'Eingereicht' },
  IN_PRUEFUNG:        { label: 'In Prüfung',         color: '#2196F3', kurz: 'Prüfung' },
  ANERKANNT:          { label: 'Anerkannt',          color: '#3E8E5A', kurz: 'Anerkannt' },
  ABGELEHNT:          { label: 'Abgelehnt',          color: '#D04B3B', kurz: 'Abgelehnt' },
}

// ── Modul-Schalter ──────────────────────────────────────────────

/** Von der Anerkennung UNABHÄNGIGE Module. */
export const UNABHAENGIGE_MODULE = [
  'marketing_enabled',
  'registration_enabled',
  'waitinglist_enabled',
  'private_enabled',
] as const

/**
 * Module, die die Ein-Klick-Freischaltung mitzieht.
 * Reihenfolge = Anzeigereihenfolge in der Admin-Oberfläche.
 */
export const KASSEN_MODULE = [
  'kassentarife_enabled',
  'budgetpruefung_enabled',
  'kassenrechnung_enabled',
  'elnw_enabled',
  'dakota_export_enabled',
] as const

export type UnabhaengigesModul = (typeof UNABHAENGIGE_MODULE)[number]
export type KassenModul = (typeof KASSEN_MODULE)[number]

export const MODUL_LABELS: Record<UnabhaengigesModul | KassenModul | 'insurance_enabled', string> = {
  marketing_enabled:      'Werbung',
  registration_enabled:   'Registrierung',
  waitinglist_enabled:    'Warteliste',
  private_enabled:        'Privatleistungen',
  insurance_enabled:      'Kassenabrechnung',
  kassentarife_enabled:   'Kassentarife',
  budgetpruefung_enabled: 'Budgetprüfung',
  kassenrechnung_enabled: 'Kassenrechnungen',
  elnw_enabled:           'Digitale Leistungsnachweise',
  dakota_export_enabled:  'Export an Dakota',
}

// ── Datensätze ──────────────────────────────────────────────────

/** Vollzeile aus public.state_settings (nur Admin). */
export interface StateSettings {
  id: string
  organization_id: string
  bundesland: BundeslandCode
  status: ExpansionStatus

  marketing_enabled: boolean
  registration_enabled: boolean
  waitinglist_enabled: boolean
  private_enabled: boolean

  insurance_enabled: boolean
  kassentarife_enabled: boolean
  budgetpruefung_enabled: boolean
  kassenrechnung_enabled: boolean
  elnw_enabled: boolean
  dakota_export_enabled: boolean

  effective_date: string | null
  antrag_eingereicht_am: string | null
  anerkannt_am: string | null
  abgelehnt_am: string | null

  approval_document: string | null
  approval_reference: string | null
  approval_authority: string | null
  rechtsgrundlage_land: string | null

  ansprechpartner_name: string | null
  ansprechpartner_email: string | null
  ansprechpartner_telefon: string | null

  notes: string | null
  created_at: string
  updated_at: string
}

/** Öffentliche Teilmenge (public.state_settings_public) — für Kunde/Native. */
export interface StateSettingsPublic {
  organization_id: string
  bundesland: BundeslandCode
  bundesland_label: string
  status: ExpansionStatus
  marketing_enabled: boolean
  registration_enabled: boolean
  waitinglist_enabled: boolean
  private_enabled: boolean
  insurance_enabled: boolean
  effective_date: string | null
  ansprechpartner_name: string | null
  ansprechpartner_email: string | null
  ansprechpartner_telefon: string | null
}

/** Ergebnis der Ein-Klick-Freischaltung (public.state_activation_result). */
export interface StateActivationResult {
  state_setting_id: string
  bundesland: BundeslandCode
  status: ExpansionStatus
  insurance_enabled: boolean
  effective_date: string | null
  waitlist_count: number
  /** Kassentarife, die die Freischaltung scharf geschaltet hat. */
  tarife_aktiviert: number
  /** Landesregeln, die die Freischaltung scharf geschaltet hat. */
  regeln_aktiviert: number
  already_active: boolean
}

/**
 * Eine Zeile aus public.state_expansion_dashboard — Status, alle Schalter und
 * die Kennzahlen, die über die Freischaltbarkeit entscheiden.
 */
export interface StateDashboardZeile extends StateSettings {
  bundesland_label: string
  iso_code: string
  sort_order: number

  warteliste_gesamt: number
  warteliste_offen: number

  kassentarife_gesamt: number
  kassentarife_aktiv: number
  privattarife_aktiv: number

  obergrenzen_gesamt: number
  obergrenzen_bestaetigt: number
  landesregeln_aktiv: number
  wegepauschalen_aktiv: number

  klienten: number
  klienten_ohne_plz: number

  /** Bescheid hinterlegt UND mindestens ein vorbereiteter Kassentarif. */
  freischaltbar: boolean
}

/** Cookie, das das aktuell gewählte Bundesland im Admin trägt. */
export const ACTIVE_BUNDESLAND_COOKIE = 'ae_active_bundesland'

/** Sonderwert des Umschalters: keine Einschränkung auf ein Bundesland. */
export const ALLE_BUNDESLAENDER = 'alle'
export type BundeslandAuswahl = BundeslandCode | typeof ALLE_BUNDESLAENDER

export interface WaitlistEintrag {
  bundesland: BundeslandCode
  plz?: string | null
  ort?: string | null
  name?: string | null
  email: string
  telefon?: string | null
  interesse?: 'kasse' | 'privat' | 'beides' | 'mitarbeit'
  benachrichtigen?: boolean
  quelle?: string | null
}

// ── Fail-safe-Default ───────────────────────────────────────────
// Kann der Status eines Bundeslands nicht ermittelt werden (Netzwerkfehler,
// Migration noch nicht angewendet, PLZ nicht zuordenbar), gilt bewusst:
// werben und registrieren ja, Warteliste ja, Kasse NEIN.
// Ein fälschlich angebotenes „privat" ist ärgerlich, ein fälschlich
// angebotenes „Kasse" wäre ein Compliance-Verstoß.
export const FALLBACK_STATE: Omit<StateSettingsPublic, 'organization_id' | 'bundesland' | 'bundesland_label'> = {
  status: 'VORBEREITUNG',
  marketing_enabled: true,
  registration_enabled: true,
  waitinglist_enabled: true,
  private_enabled: false,
  insurance_enabled: false,
  effective_date: null,
  ansprechpartner_name: null,
  ansprechpartner_email: null,
  ansprechpartner_telefon: null,
}

// ── UI-Texte (Vorgabe Geschäftsführung, wörtlich) ───────────────

/**
 * Text am ausgegrauten Kassen-Button.
 * Wortlaut von der Geschäftsführung vorgegeben — nicht umformulieren.
 */
export const TEXT_KASSE_IM_VERFAHREN =
  'Die Anerkennung für die Abrechnung mit den Pflegekassen befindet sich derzeit im '
  + 'Genehmigungsverfahren. Sie können sich bereits registrieren und werden automatisch '
  + 'informiert, sobald die Kassenabrechnung verfügbar ist.'

export const TEXT_KASSE_ABGELEHNT =
  'Für dieses Bundesland liegt derzeit keine Anerkennung für die Pflegekassenabrechnung vor. '
  + 'Privatleistungen können weiterhin gebucht werden.'

export const TEXT_PLZ_UNBEKANNT =
  'Wir konnten Ihre Postleitzahl keinem Bundesland zuordnen. '
  + 'Bitte prüfen Sie Ihre Angabe — bis dahin steht nur die Privatabrechnung zur Verfügung.'

export const TEXT_WARTELISTE =
  'Tragen Sie sich in die Warteliste ein — wir benachrichtigen Sie, sobald die '
  + 'Pflegekassenabrechnung in Ihrem Bundesland freigeschaltet ist.'

/**
 * Statusabhängiger Hinweistext für die Kundenoberfläche.
 * Bewusst KEINE Zeitzusagen — das Verfahren liegt bei der Behörde.
 */
export function kassenHinweisText(status: ExpansionStatus): string {
  switch (status) {
    case 'ANERKANNT':
      return 'Die Pflegekassenabrechnung ist in Ihrem Bundesland freigeschaltet.'
    case 'ABGELEHNT':
      return TEXT_KASSE_ABGELEHNT
    default:
      return TEXT_KASSE_IM_VERFAHREN
  }
}
