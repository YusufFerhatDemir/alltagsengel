import type { BewerbungDaten } from './katalog'

/**
 * Wie vollständig ist eine Bewerbung?
 *
 * WOZU
 * Eine Bewerbung ist selten auf einmal fertig. Das Formular verlangt nur
 * Name und Telefon; alles andere ist freiwillig, damit sich überhaupt
 * jemand bewirbt. Die Verwaltung muss aber sehen, wo nachzufassen ist —
 * und zwar ohne jeden Datensatz einzeln aufzuklappen.
 *
 * ── WARUM GEWICHTET UND NICHT GEZÄHLT ─────────────────────────────────
 * Neun Felder gleich zu gewichten würde bedeuten: wer Sprachen und
 * Verfügbarkeit angibt, aber keine E-Mail hinterlässt, steht bei 22 % —
 * obwohl genau das eine fehlende Feld die Bewerbung unbearbeitbar macht.
 * Die Schritte tragen deshalb Gewichte nach ihrer Bedeutung für den
 * nächsten Arbeitsschritt.
 *
 * ── DER FÜHRUNGSZEUGNIS-SCHRITT IST BEWUSST NICHT DABEI ───────────────
 * Das erweiterte Führungszeugnis ist Pflicht vor dem ersten Einsatz, aber
 * es wird nicht über dieses Formular erhoben — es kommt als Papier und
 * wird in der Personalakte geführt. Hier stünde es dauerhaft auf „fehlt"
 * und würde jede Anzeige verfälschen. Der Hinweis darauf gehört in die
 * Kommunikation (Vorlage 2.3), nicht in diese Rechnung.
 */

export interface FortschrittsSchritt {
  key: string
  label: string
  /** Anteil am Gesamtfortschritt. Summe aller Gewichte = 100. */
  gewicht: number
  erfuellt: boolean
  /** Was der Verwaltung fehlt — nur gesetzt, wenn nicht erfüllt. */
  hinweis?: string
}

export interface Fortschritt {
  prozent: number
  schritte: FortschrittsSchritt[]
  /** Was als Nächstes fehlt, nach Gewicht sortiert. Leer = vollständig. */
  offen: FortschrittsSchritt[]
  /** Ohne Rückweg ist keine Bearbeitung möglich — eigene Ampel. */
  kontaktierbar: boolean
}

export interface BewerbungFuerFortschritt {
  name?: string | null
  email?: string | null
  phone?: string | null
  plz?: string | null
  daten?: BewerbungDaten | null
}

function nichtLeer(w: unknown): boolean {
  return typeof w === 'string' && w.trim().length > 0
}

function hatEintraege(w: unknown): boolean {
  return Array.isArray(w) && w.length > 0
}

export function berechneFortschritt(b: BewerbungFuerFortschritt): Fortschritt {
  const d = b.daten ?? null

  const schritte: FortschrittsSchritt[] = [
    {
      key: 'name',
      label: 'Name',
      gewicht: 10,
      erfuellt: nichtLeer(b.name),
      hinweis: 'Name fehlt',
    },
    {
      key: 'telefon',
      label: 'Telefon',
      gewicht: 20,
      erfuellt: nichtLeer(b.phone),
      hinweis: 'Keine Telefonnummer — Rückruf nicht möglich',
    },
    {
      // Schwer gewichtet: ohne E-Mail geht keine automatische Bestätigung
      // und keine Einladung raus. Genau diese Lücke tragen die 34
      // Altbestände aus dem früheren Kurzformular.
      key: 'email',
      label: 'E-Mail',
      gewicht: 20,
      erfuellt: nichtLeer(b.email),
      hinweis: 'Keine E-Mail — Einladung und Bestätigung nicht zustellbar',
    },
    {
      key: 'region',
      label: 'Region / PLZ',
      gewicht: 10,
      erfuellt: nichtLeer(b.plz) || nichtLeer(d?.region),
      hinweis: 'Kein Einsatzort bekannt',
    },
    {
      key: 'qualifikation',
      label: 'Qualifikation',
      gewicht: 10,
      erfuellt: nichtLeer(d?.qualifikation),
      hinweis: 'Erfahrung unbekannt',
    },
    {
      key: 'verfuegbarkeit',
      label: 'Verfügbarkeit',
      gewicht: 10,
      erfuellt: hatEintraege(d?.verfuegbarkeit),
      hinweis: 'Keine Zeiten angegeben',
    },
    {
      key: 'stunden',
      label: 'Stunden pro Woche',
      gewicht: 5,
      erfuellt: nichtLeer(d?.stunden),
      hinweis: 'Umfang offen',
    },
    {
      key: 'beschaeftigungsart',
      label: 'Beschäftigungsart',
      gewicht: 5,
      erfuellt: nichtLeer(d?.beschaeftigungsart),
      hinweis: 'Beschäftigungsmodell offen',
    },
    {
      key: 'fuehrerschein',
      label: 'Führerschein',
      gewicht: 5,
      erfuellt: nichtLeer(d?.fuehrerschein),
      hinweis: 'Mobilität unbekannt',
    },
    {
      key: 'sprachen',
      label: 'Sprachen',
      gewicht: 5,
      erfuellt: hatEintraege(d?.sprachen),
      hinweis: 'Sprachen unbekannt',
    },
  ]

  const erreicht = schritte.filter(s => s.erfuellt).reduce((sum, s) => sum + s.gewicht, 0)
  const offen = schritte.filter(s => !s.erfuellt).sort((a, b) => b.gewicht - a.gewicht)

  return {
    prozent: Math.round(erreicht),
    schritte,
    offen,
    kontaktierbar: nichtLeer(b.phone) || nichtLeer(b.email),
  }
}

/** Grobe Einordnung für Filter und Farbgebung. */
export type FortschrittsStufe = 'vollstaendig' | 'gut' | 'luecken' | 'duenn'

export function stufeFuer(prozent: number): FortschrittsStufe {
  if (prozent >= 100) return 'vollstaendig'
  if (prozent >= 70) return 'gut'
  if (prozent >= 40) return 'luecken'
  return 'duenn'
}

export const FORTSCHRITT_STUFEN: Record<FortschrittsStufe, { label: string; color: string }> = {
  vollstaendig: { label: 'Vollständig', color: '#5CB882' },
  gut: { label: 'Weitgehend', color: '#26A69A' },
  luecken: { label: 'Lücken', color: '#E8A000' },
  duenn: { label: 'Sehr dünn', color: '#D04B3B' },
}

/**
 * Lohnt eine Erinnerung?
 *
 * Nur wenn drei Dinge zusammenkommen: Der Vorgang ist noch offen, es fehlt
 * genug, dass Nachfassen sich lohnt, und es gibt eine E-Mail, über die man
 * fragen kann. Wer telefonisch erreichbar ist, aber keine Adresse hat,
 * bekommt keine Erinnerungsmail — er bekommt einen Anruf, und das
 * entscheidet ein Mensch.
 */
export function erinnerungSinnvoll(
  b: BewerbungFuerFortschritt,
  status: string,
): boolean {
  if (status !== 'new' && status !== 'contacted') return false
  if (!nichtLeer(b.email)) return false
  return berechneFortschritt(b).prozent < 70
}
