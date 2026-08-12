// ═══════════════════════════════════════════════════════════════
// Wunddokumentation — Typen & Wertelisten
// Spiegelt die Check-Constraints aus 20260818010000_wunddokumentation.sql.
// ═══════════════════════════════════════════════════════════════

export const WUND_TYP_WERTE = [
  'dekubitus', 'ulcus_cruris', 'diabetisches_fusssyndrom', 'op_wunde', 'traumatische_wunde', 'sonstige',
] as const
export type WundTyp = (typeof WUND_TYP_WERTE)[number]

export const WUND_TYP_LABELS: Record<WundTyp, string> = {
  dekubitus: 'Dekubitus',
  ulcus_cruris: 'Ulcus cruris',
  diabetisches_fusssyndrom: 'Diabetisches Fußsyndrom',
  op_wunde: 'OP-Wunde',
  traumatische_wunde: 'Traumatische Wunde',
  sonstige: 'Sonstige Wunde',
}

export const WUND_STATUS_WERTE = ['aktiv', 'in_abheilung', 'stagnierend', 'verschlechtert', 'abgeheilt'] as const
export type WundStatus = (typeof WUND_STATUS_WERTE)[number]

export const WUND_STATUS_LABELS: Record<WundStatus, string> = {
  aktiv: 'Aktiv',
  in_abheilung: 'In Abheilung',
  stagnierend: 'Stagnierend',
  verschlechtert: 'Verschlechtert',
  abgeheilt: 'Abgeheilt',
}

export const KOERPERSEITE_WERTE = ['links', 'rechts', 'mittig'] as const
export type Koerperseite = (typeof KOERPERSEITE_WERTE)[number]

/** Körperschema-Stellen (Auswahl der pflegerisch relevanten Prädilektionsstellen). */
export const KOERPERSTELLEN = [
  { code: 'hinterkopf', label: 'Hinterkopf' },
  { code: 'ohr', label: 'Ohr' },
  { code: 'schulter', label: 'Schulter' },
  { code: 'schulterblatt', label: 'Schulterblatt' },
  { code: 'ellenbogen', label: 'Ellenbogen' },
  { code: 'wirbelsaeule', label: 'Wirbelsäule' },
  { code: 'kreuzbein', label: 'Kreuzbein / Sakrum' },
  { code: 'gesaess', label: 'Gesäß' },
  { code: 'sitzbein', label: 'Sitzbeinhöcker' },
  { code: 'trochanter', label: 'Trochanter (Hüfte)' },
  { code: 'oberschenkel', label: 'Oberschenkel' },
  { code: 'knie', label: 'Knie' },
  { code: 'unterschenkel', label: 'Unterschenkel' },
  { code: 'knoechel', label: 'Knöchel / Malleolus' },
  { code: 'ferse', label: 'Ferse' },
  { code: 'fussruecken', label: 'Fußrücken' },
  { code: 'fusssohle', label: 'Fußsohle' },
  { code: 'zehen', label: 'Zehen' },
  { code: 'bauch', label: 'Bauch' },
  { code: 'brust', label: 'Brust / Thorax' },
  { code: 'arm', label: 'Arm' },
  { code: 'hand', label: 'Hand' },
  { code: 'sonstige', label: 'Sonstige Lokalisation' },
] as const
export type KoerperstelleCode = (typeof KOERPERSTELLEN)[number]['code']
export const KOERPERSTELLE_CODES = KOERPERSTELLEN.map(k => k.code) as readonly KoerperstelleCode[]

export const EXSUDAT_MENGE_WERTE = ['keine', 'wenig', 'maessig', 'viel'] as const
export type ExsudatMenge = (typeof EXSUDAT_MENGE_WERTE)[number]
export const EXSUDAT_MENGE_LABELS: Record<ExsudatMenge, string> = {
  keine: 'Keine', wenig: 'Wenig', maessig: 'Mäßig', viel: 'Viel',
}

export const EXSUDAT_ART_WERTE = ['seroes', 'blutig', 'seroes_blutig', 'eitrig', 'sonstige'] as const
export type ExsudatArt = (typeof EXSUDAT_ART_WERTE)[number]
export const EXSUDAT_ART_LABELS: Record<ExsudatArt, string> = {
  seroes: 'Serös', blutig: 'Blutig', seroes_blutig: 'Serös-blutig', eitrig: 'Eitrig', sonstige: 'Sonstige',
}

export const GERUCH_WERTE = ['kein', 'leicht', 'stark'] as const
export type Geruch = (typeof GERUCH_WERTE)[number]

export interface Wound {
  id: string
  organization_id: string
  client_id: string
  wund_typ: WundTyp
  dekubitus_grad: number | null
  lokalisation: string
  koerperstelle_code: string | null
  koerperseite: Koerperseite | null
  entstanden_am: string | null
  erstdokumentation_am: string
  status: WundStatus
  abgeheilt_am: string | null
  bemerkung: string | null
  erstellt_von: string
  created_at: string
  updated_at: string
}

/** Wound mit eingebettetem Kunden (PostgREST-Embedding clients(...)). */
export interface WoundMitKunde extends Wound {
  clients: { first_name: string | null; last_name: string | null } | null
}

export interface WoundAssessment {
  id: string
  organization_id: string
  wound_id: string
  erhoben_am: string
  erhoben_von: string
  laenge_cm: number | null
  breite_cm: number | null
  tiefe_cm: number | null
  wundgrund_granulation_pct: number | null
  wundgrund_fibrin_pct: number | null
  wundgrund_nekrose_pct: number | null
  wundgrund_epithel_pct: number | null
  wundrand: string | null
  umgebungshaut: string | null
  exsudat_menge: ExsudatMenge | null
  exsudat_art: ExsudatArt | null
  geruch: Geruch | null
  schmerz_nrs: number | null
  infektionszeichen: boolean
  push_flaeche_punkte: number | null
  push_exsudat_punkte: number | null
  push_gewebe_punkte: number | null
  push_gesamt: number | null
  bemerkung: string | null
  created_at: string
  updated_at: string
}

export interface WoundMaterial {
  name: string
  menge?: string
}

export interface WoundTreatment {
  id: string
  organization_id: string
  wound_id: string
  durchgefuehrt_am: string
  durchgefuehrt_von: string
  massnahme: string
  wundreinigung: string | null
  materialien: WoundMaterial[]
  schmerzmittel_gegeben: boolean
  besonderheiten: string | null
  naechster_vw_am: string | null
  created_at: string
  updated_at: string
}

export interface WoundPhoto {
  id: string
  organization_id: string
  wound_id: string
  assessment_id: string | null
  bucket: string
  dateipfad: string
  dateiname: string
  mime_type: string
  dateigroesse_bytes: number | null
  aufgenommen_am: string
  aufgenommen_von: string
  bemerkung: string | null
  created_at: string
}

/** WoundPhoto plus kurzlebige signierte Download-URL (nie persistiert). */
export interface WoundPhotoMitUrl extends WoundPhoto {
  signed_url: string
}

/**
 * Wirft bei unbekanntem Wert eine deutschsprachige Fehlermeldung, bevor die
 * DB-Check-Constraints denselben Verstoß kryptischer melden würden.
 */
export function assertErlaubt<T extends string>(wert: T | null | undefined, erlaubt: readonly T[], feld: string): void {
  if (wert === null || wert === undefined) return
  if (!erlaubt.includes(wert)) {
    throw new Error(`Ungültiger Wert "${wert}" für ${feld}. Erlaubt: ${erlaubt.join(', ')}.`)
  }
}
