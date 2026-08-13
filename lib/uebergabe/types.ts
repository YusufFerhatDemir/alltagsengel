// ═══════════════════════════════════════════════════════════════
// Übergabeprotokolle — Typen und erlaubte Werte
// Spiegelt die CHECK-Constraints aus
// supabase/migrations/20260903000000_uebergabeprotokolle.sql.
// ═══════════════════════════════════════════════════════════════

export const SCHICHT_WERTE = [
  'frueh', 'spaet', 'nacht', 'wochenende', 'bereitschaft', 'sonstige',
] as const
export type Schicht = (typeof SCHICHT_WERTE)[number]

export const PROTOKOLL_STATUS_WERTE = ['offen', 'abgeschlossen'] as const
export type ProtokollStatus = (typeof PROTOKOLL_STATUS_WERTE)[number]

export const PUNKT_KATEGORIE_WERTE = [
  'zustandsaenderung', 'medikation', 'wunde', 'vitalwerte', 'sturz',
  'arztkontakt', 'angehoerige', 'hilfsmittel', 'termin', 'organisation', 'sonstiges',
] as const
export type PunktKategorie = (typeof PUNKT_KATEGORIE_WERTE)[number]

export const DRINGLICHKEIT_WERTE = ['normal', 'hoch', 'kritisch'] as const
export type Dringlichkeit = (typeof DRINGLICHKEIT_WERTE)[number]

export const QUELLE_TYP_WERTE = [
  'manuell', 'pflege_verlauf', 'vital_signs', 'wound_assessments',
  'medikament_eingaben', 'ops_aufgabe',
] as const
export type QuelleTyp = (typeof QUELLE_TYP_WERTE)[number]

/** Kategorien, bei denen ein Punkt immer Handlungsbedarf auslöst. */
export const KATEGORIEN_MIT_HANDLUNGSBEDARF: PunktKategorie[] = ['sturz', 'medikation', 'arztkontakt']

export const SCHICHT_LABEL: Record<Schicht, string> = {
  frueh: 'Frühdienst',
  spaet: 'Spätdienst',
  nacht: 'Nachtdienst',
  wochenende: 'Wochenenddienst',
  bereitschaft: 'Rufbereitschaft',
  sonstige: 'Sonstige',
}

export const KATEGORIE_LABEL: Record<PunktKategorie, string> = {
  zustandsaenderung: 'Zustandsänderung',
  medikation: 'Medikation',
  wunde: 'Wunde',
  vitalwerte: 'Vitalwerte',
  sturz: 'Sturz',
  arztkontakt: 'Arztkontakt',
  angehoerige: 'Angehörige',
  hilfsmittel: 'Hilfsmittel',
  termin: 'Termin',
  organisation: 'Organisation',
  sonstiges: 'Sonstiges',
}

export const DRINGLICHKEIT_META: Record<Dringlichkeit, { label: string; color: string }> = {
  normal: { label: 'Normal', color: '#8A8A8A' },
  hoch: { label: 'Hoch', color: '#D99A2B' },
  kritisch: { label: 'Kritisch', color: '#D04B3B' },
}

export const PROTOKOLL_STATUS_META: Record<ProtokollStatus, { label: string; color: string }> = {
  offen: { label: 'Offen', color: '#D99A2B' },
  abgeschlossen: { label: 'Abgeschlossen', color: '#5CB882' },
}

export interface UebergabeProtokoll {
  id: string
  organization_id: string
  datum: string
  schicht: Schicht
  tour_id: string | null
  status: ProtokollStatus
  uebergeber_id: string | null
  uebergeber_name: string
  uebernehmer_caregiver_ids: string[]
  zusammenfassung: string | null
  abgeschlossen_am: string | null
  abgeschlossen_von: string | null
  created_at: string
  updated_at: string
}

export interface UebergabePunkt {
  id: string
  protokoll_id: string
  organization_id: string
  client_id: string | null
  kategorie: PunktKategorie
  dringlichkeit: Dringlichkeit
  inhalt: string
  handlungsbedarf: boolean
  erledigt: boolean
  erledigt_am: string | null
  erledigt_von: string | null
  quelle_typ: QuelleTyp | null
  quelle_id: string | null
  aufgabe_id: string | null
  nachtrag: boolean
  erstellt_von: string | null
  erstellt_von_name: string
  created_at: string
  updated_at: string
}

export interface UebergabeKenntnisnahme {
  id: string
  protokoll_id: string
  organization_id: string
  user_id: string
  caregiver_id: string | null
  name: string
  rolle: string
  zeitpunkt: string
}

export interface ProtokollMitDetails extends UebergabeProtokoll {
  punkte: UebergabePunkt[]
  kenntnisnahmen: UebergabeKenntnisnahme[]
}

/** Wirft, wenn ein gesetzter Wert nicht im erlaubten Wertebereich liegt. */
export function assertErlaubt<T extends string>(
  wert: T | null | undefined,
  erlaubt: readonly T[],
  feld: string,
): void {
  if (wert === null || wert === undefined) return
  if (!erlaubt.includes(wert)) {
    throw new Error(`Ungültiger Wert "${wert}" für ${feld}. Erlaubt: ${erlaubt.join(', ')}.`)
  }
}

/** ISO-Datum (YYYY-MM-DD) — alles andere wäre in der DB ohnehin ungültig. */
export function assertDatum(datum: string, feld = 'datum'): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) {
    throw new Error(`${feld} muss im Format YYYY-MM-DD vorliegen.`)
  }
}
