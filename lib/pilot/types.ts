// ═══════════════════════════════════════════════════════════════════
// Pilot / Kontrollierter Echtbetrieb — geteilte Typen
// ═══════════════════════════════════════════════════════════════════
//
// Der Pilotmodus beantwortet zwei Fragen getrennt voneinander:
//
//   1. BETRIEBSBEREITSCHAFT — darf die Organisation überhaupt einen echten
//      Kunden abrechnen? (lib/pilot/voraussetzungen.ts)
//   2. KUNDENKETTE — wie weit ist ein konkreter Kunde auf dem Weg
//      Kunde → … → DATEV gekommen? (lib/pilot/kundenkette.ts)
//
// Beide nutzen dieselben Ampel- und Blocker-Begriffe wie
// lib/abrechnung/readiness.ts, damit Oberflächen und Sprachgebrauch
// identisch bleiben.
// ═══════════════════════════════════════════════════════════════════

/** Gleiche Semantik wie in lib/abrechnung/readiness.ts. */
export type Ampel = 'gruen' | 'gelb' | 'rot'

/**
 * Wo ein offener Punkt gelöst wird.
 *   intern — im System oder in den Stammdaten machbar
 *   extern — nur von aussen beschaffbar (Behörde, Bank, ITSG, Kasse)
 * Die Trennung ist der Kern: eine Ampel, die beides vermischt, verleitet
 * dazu, externe Voraussetzungen für erledigt zu halten.
 */
export type BlockerArt = 'intern' | 'extern' | null

/** Stand eines Kettenschritts für einen konkreten Kunden. */
export type SchrittStand =
  /** Noch nicht begonnen. */
  | 'offen'
  /** Begonnen, aber noch nicht abgeschlossen. */
  | 'laeuft'
  /** Vollständig erledigt. */
  | 'erledigt'
  /** Kann nicht erledigt werden, solange eine Voraussetzung fehlt. */
  | 'blockiert'
  /** Für diesen Kunden fachlich nicht anwendbar (z. B. Kassenweg bei Selbstzahler). */
  | 'entfaellt'

export const SCHRITT_STAND_LABEL: Record<SchrittStand, string> = {
  offen: 'offen',
  laeuft: 'läuft',
  erledigt: 'erledigt',
  blockiert: 'blockiert',
  entfaellt: 'entfällt',
}

/** Ein Punkt der Betriebs-Checkliste. */
export interface VoraussetzungPunkt {
  id: string
  label: string
  ampel: Ampel
  /** Kurzwert für die Anzeige — niemals ein Geheimnis. */
  wert: string | null
  hinweis: string | null
  /** `null`, wenn der Punkt grün ist. */
  blocker: BlockerArt
  gruppe: VoraussetzungGruppe
  /** Wohin der Admin klicken muss, um den Punkt zu lösen. */
  aktion: { label: string; href: string } | null
  /**
   * true = ohne diesen Punkt darf KEIN echter Kunde abgerechnet werden.
   * false = Vorwarnung oder nur für einen Teilweg nötig (z. B. SEPA).
   */
  pflicht: boolean
}

export type VoraussetzungGruppe =
  | 'organisation'
  | 'stammdaten'
  | 'abrechnung'
  | 'zahlung'
  | 'buchhaltung'
  | 'kassenweg'

export const VORAUSSETZUNG_GRUPPEN: { id: VoraussetzungGruppe; titel: string }[] = [
  { id: 'organisation', titel: 'Organisation & Rechtsgrundlagen' },
  { id: 'stammdaten', titel: 'Stammdaten & Preise' },
  { id: 'abrechnung', titel: 'Rechnungsstellung' },
  { id: 'zahlung', titel: 'Zahlungsverkehr' },
  { id: 'buchhaltung', titel: 'Buchhaltung' },
  { id: 'kassenweg', titel: 'Kassenweg (extern gesperrt)' },
]

export interface VoraussetzungErgebnis {
  organizationId: string
  organisation: string | null
  /** Rot, sobald ein Pflichtpunkt rot ist. */
  gesamt: Ampel
  /**
   * true nur, wenn alle Pflichtpunkte grün sind. Erst dann darf ein echter
   * Kunde durch die Kette geschickt werden.
   */
  echtbetriebFreigegeben: boolean
  punkte: VoraussetzungPunkt[]
  zusammenfassung: { gruen: number; gelb: number; rot: number; gesamt: number }
  offeneBlocker: { intern: string[]; extern: string[] }
  /**
   * Wege, die bewusst gesperrt sind. Sie blockieren den Pilotbetrieb NICHT —
   * ein Selbstzahler-Pilot läuft ohne sie vollständig durch.
   */
  gesperrteWege: { weg: string; grund: string }[]
}

/** Ein Schritt der Kundenkette — Definition (ohne Kundendaten). */
export interface SchrittDefinition {
  id: SchrittId
  /** Position 1..12 in der Kette. */
  nr: number
  label: string
  /** Was genau erfüllt sein muss, damit der Schritt als erledigt gilt. */
  kriterium: string
  /** Zielseite im Admin für die Bearbeitung. `{clientId}` wird ersetzt. */
  href: string
}

export type SchrittId =
  | 'kunde'
  | 'pflegegrad'
  | 'budget'
  | 'engel'
  | 'termin'
  | 'leistungsnachweis'
  | 'signatur'
  | 'freigabe'
  | 'rechnung'
  | 'pdf'
  | 'zahlung'
  | 'opos'
  | 'datev'

/** Stand eines Schritts für einen konkreten Kunden. */
export interface KundenSchritt extends SchrittDefinition {
  stand: SchrittStand
  /** Kurzwert, z. B. "3 Nachweise, 2 unterschrieben". */
  wert: string | null
  /** Was jetzt konkret zu tun ist. `null`, wenn erledigt. */
  naechsterSchritt: string | null
  /** Aufgelöster Link (clientId eingesetzt). */
  aktionHref: string
}

export interface KundenKette {
  clientId: string
  name: string
  /** Selbstzahler oder Kassenweg — bestimmt, ob Kassenschritte entfallen. */
  abrechnungsweg: 'privat' | 'kasse' | 'unbekannt'
  schritte: KundenSchritt[]
  /** Anzahl erledigter Schritte / anwendbare Schritte. */
  fortschritt: { erledigt: number; anwendbar: number; prozent: number }
  /** Der erste Schritt, der nicht erledigt ist — der Ort zum Weiterarbeiten. */
  aktuellerSchritt: KundenSchritt | null
  /** true, wenn die Kette bis DATEV vollständig durchlaufen ist. */
  vollstaendig: boolean
}
