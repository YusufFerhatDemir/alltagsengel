// ═══════════════════════════════════════════════════════════════
// Vitalwerte — geteilte Typen & Typ-Konfiguration
// Spiegelt 1:1 die Spalten aus
// supabase/migrations/20260818010000_vitalwerte.sql
// ═══════════════════════════════════════════════════════════════

export type VitalTyp =
  | 'blutdruck' | 'puls' | 'temperatur' | 'blutzucker' | 'spo2'
  | 'gewicht' | 'atemfrequenz' | 'schmerz' | 'trinkmenge' | 'ausscheidung'

export const VITAL_TYP_WERTE: VitalTyp[] = [
  'blutdruck', 'puls', 'temperatur', 'blutzucker', 'spo2',
  'gewicht', 'atemfrequenz', 'schmerz', 'trinkmenge', 'ausscheidung',
]

export type AlarmStufe = 'ok' | 'warnung' | 'kritisch'

/** Grenzwert-Satz, wie er in der Bewertung gebraucht wird (Teilmenge der DB-Zeile). */
export interface Grenzwerte {
  min_warn: number | null
  max_warn: number | null
  min_critical: number | null
  max_critical: number | null
  min_warn_secondary?: number | null
  max_warn_secondary?: number | null
  min_critical_secondary?: number | null
  max_critical_secondary?: number | null
}

export interface VitalTypConfig {
  label: string
  einheit: string
  /** Blutdruck: value = systolisch, value_secondary = diastolisch */
  hatSekundaer: boolean
  labelWert: string
  labelSekundaer?: string
  /** Harte Plausibilitätsgrenzen für die Eingabe (kein Alarm, sondern Validierungsfehler). */
  plausibelMin: number
  plausibelMax: number
  /** Nur beim Blutdruck (diastolisch) abweichend von plausibelMin/-Max; sonst identisch. */
  plausibelMinSekundaer?: number
  plausibelMaxSekundaer?: number
  dezimalstellen: number
  /**
   * Standard-Grenzwerte (Erwachsene, häusliche Betreuung) — greifen nur,
   * solange KEIN klientenspezifischer Grenzwert-Satz hinterlegt ist.
   * null = Organisation muss bewusst konfigurieren (z. B. Gewicht).
   */
  standard: Grenzwerte | null
}

export const VITAL_TYPEN: Record<VitalTyp, VitalTypConfig> = {
  blutdruck: {
    label: 'Blutdruck', einheit: 'mmHg', hatSekundaer: true,
    labelWert: 'Systolisch', labelSekundaer: 'Diastolisch',
    plausibelMin: 40, plausibelMax: 300,
    plausibelMinSekundaer: 20, plausibelMaxSekundaer: 200,
    dezimalstellen: 0,
    standard: {
      min_warn: 100, max_warn: 140, min_critical: 90, max_critical: 180,
      min_warn_secondary: 60, max_warn_secondary: 90,
      min_critical_secondary: 50, max_critical_secondary: 110,
    },
  },
  puls: {
    label: 'Puls', einheit: 'bpm', hatSekundaer: false, labelWert: 'Herzfrequenz',
    plausibelMin: 20, plausibelMax: 250, dezimalstellen: 0,
    standard: { min_warn: 50, max_warn: 100, min_critical: 40, max_critical: 120 },
  },
  temperatur: {
    label: 'Temperatur', einheit: '°C', hatSekundaer: false, labelWert: 'Körpertemperatur',
    plausibelMin: 30, plausibelMax: 45, dezimalstellen: 1,
    standard: { min_warn: 36.0, max_warn: 37.8, min_critical: 35.0, max_critical: 39.5 },
  },
  blutzucker: {
    label: 'Blutzucker', einheit: 'mg/dl', hatSekundaer: false, labelWert: 'Glukose',
    plausibelMin: 20, plausibelMax: 600, dezimalstellen: 0,
    standard: { min_warn: 70, max_warn: 180, min_critical: 54, max_critical: 250 },
  },
  spo2: {
    label: 'Sauerstoffsättigung', einheit: '%', hatSekundaer: false, labelWert: 'SpO2',
    plausibelMin: 50, plausibelMax: 100, dezimalstellen: 0,
    standard: { min_warn: 92, max_warn: null, min_critical: 88, max_critical: null },
  },
  gewicht: {
    label: 'Gewicht', einheit: 'kg', hatSekundaer: false, labelWert: 'Körpergewicht',
    plausibelMin: 20, plausibelMax: 350, dezimalstellen: 1,
    // Gewichtsgrenzen sind hochindividuell — bewusst keine Standardwerte.
    standard: null,
  },
  atemfrequenz: {
    label: 'Atemfrequenz', einheit: '/min', hatSekundaer: false, labelWert: 'Atemzüge',
    plausibelMin: 4, plausibelMax: 80, dezimalstellen: 0,
    standard: { min_warn: 10, max_warn: 22, min_critical: 8, max_critical: 30 },
  },
  schmerz: {
    label: 'Schmerz (NRS)', einheit: 'NRS 0–10', hatSekundaer: false, labelWert: 'Schmerzstärke',
    plausibelMin: 0, plausibelMax: 10, dezimalstellen: 0,
    standard: { min_warn: null, max_warn: 3, min_critical: null, max_critical: 6 },
  },
  trinkmenge: {
    label: 'Trinkmenge', einheit: 'ml', hatSekundaer: false, labelWert: 'Menge',
    plausibelMin: 0, plausibelMax: 10000, dezimalstellen: 0,
    // Einzelmessung — Tagesbilanz-Grenzen sind Auswertungssache, keine Messwert-Alarme.
    standard: null,
  },
  ausscheidung: {
    label: 'Ausscheidung', einheit: 'ml', hatSekundaer: false, labelWert: 'Menge',
    plausibelMin: 0, plausibelMax: 10000, dezimalstellen: 0,
    standard: null,
  },
}

// ── DB-Zeilen ────────────────────────────────────────────────────
export interface VitalSign {
  id: string
  organization_id: string
  client_id: string
  type: VitalTyp
  value: number
  value_secondary: number | null
  unit: string
  measured_at: string
  measured_by: string
  measured_by_name: string | null
  measured_by_role: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface VitalSignThreshold extends Grenzwerte {
  id: string
  organization_id: string
  client_id: string
  type: VitalTyp
  min_warn_secondary: number | null
  max_warn_secondary: number | null
  min_critical_secondary: number | null
  max_critical_secondary: number | null
  enabled: boolean
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

/** Ergebnis der Alarm-Bewertung einer Messung. */
export interface AlarmBewertung {
  stufe: AlarmStufe
  /** Menschlich lesbare Begründungen, z. B. „Systolisch 190 mmHg über kritischer Grenze (180)". */
  meldungen: string[]
  /** Woher die Grenzen kamen: klientenspezifisch, Standard oder gar keine. */
  quelle: 'klient' | 'standard' | 'keine'
}

export function assertVitalTyp(typ: string): asserts typ is VitalTyp {
  if (!VITAL_TYP_WERTE.includes(typ as VitalTyp)) {
    throw new Error(`Unbekannter Vitaltyp "${typ}". Erlaubt: ${VITAL_TYP_WERTE.join(', ')}`)
  }
}
