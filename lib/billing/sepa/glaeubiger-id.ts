// ═══════════════════════════════════════════════════════════════════
// SEPA-Gläubiger-Identifikationsnummer — Prüfung und Platzhalter-Sperre
// ═══════════════════════════════════════════════════════════════════
//
// PROBLEM (gefixt hier):
// Migration 20260812120000 setzt organizations.sepa_creditor_id auf
// 'DE98ZZZ09999999999'. Das ist ein PLATZHALTER, keine echte, bei der
// Deutschen Bundesbank beantragte Gläubiger-ID. Der Wert steht produktiv
// in der Stamm-Organisation.
//
// createSepaBatch() prüfte bisher ausschliesslich `if (!org?.sepa_creditor_id)`.
// Ein Platzhalter ist nicht leer — die Prüfung ging also durch, und der
// Sammelauftrag wurde mit einer ungültigen CI erzeugt. Zwei Folgen:
//   1. Die Bank weist die Datei zurück — im besten Fall.
//   2. Schlimmer: der Lauf gilt intern als "eingezogen", die Rechnungen
//      wandern aus der OPOS-Liste, und der Zahlungseingang bleibt aus,
//      ohne dass jemand es merkt.
//
// Deshalb ist die Platzhalter-Erkennung hier fail-closed: unbekannte oder
// offensichtlich künstliche IDs blockieren den Einzug, statt ihn zu erlauben.
//
// Die Prüfung ist bewusst KEINE vollständige Verifikation — ob die ID
// tatsächlich der Organisation gehört, weiss nur die Bundesbank. Sie fängt
// genau die Fälle ab, die im Betrieb entstehen: Platzhalter aus Migrationen,
// Testwerte und strukturell unmögliche IDs.
// ═══════════════════════════════════════════════════════════════════

/**
 * Bekannte Platzhalter-/Testwerte, die niemals in einen echten
 * Lastschrifteinzug gelangen dürfen.
 *
 * Neue Platzhalter hier eintragen — die Liste ist die einzige Stelle,
 * an der ein Wert als "nicht echt" markiert wird.
 */
export const SEPA_PLATZHALTER_IDS: readonly string[] = [
  'DE98ZZZ09999999999', // Default aus Migration 20260812120000
  'DE00ZZZ00000000000',
  'DE98ZZZ00000000000',
  'DE12ZZZ00000000000',
]

/** Struktur einer deutschen Gläubiger-ID: DE + 2 Prüfziffern + ZZZ + 11 Stellen. */
const CI_MUSTER_DE = /^DE\d{2}[A-Z0-9]{3}\d{11}$/

export type GlaeubigerIdBefund =
  | 'ok'
  | 'fehlt'
  | 'platzhalter'
  | 'formatfehler'
  | 'nur_nullen'

export interface GlaeubigerIdPruefung {
  befund: GlaeubigerIdBefund
  /** true nur, wenn die ID für einen echten Einzug verwendet werden darf. */
  verwendbar: boolean
  /** Anzeigetext für Oberflächen — enthält die ID nur bei unbedenklichem Befund. */
  hinweis: string | null
}

/** Vereinheitlicht Schreibweise: Leerzeichen weg, Grossbuchstaben. */
export function normalisiereGlaeubigerId(id: string | null | undefined): string {
  return (id ?? '').replace(/\s+/g, '').toUpperCase()
}

/**
 * Prüft eine Gläubiger-Identifikationsnummer auf Verwendbarkeit.
 *
 * Blockiert (verwendbar=false):
 *   - fehlend/leer
 *   - bekannter Platzhalter aus SEPA_PLATZHALTER_IDS
 *   - Format passt nicht zu DEpp ZZZ + 11 Stellen
 *   - der 11-stellige Identifikationsteil besteht nur aus Nullen
 */
export function pruefeGlaeubigerId(id: string | null | undefined): GlaeubigerIdPruefung {
  const wert = normalisiereGlaeubigerId(id)

  if (!wert) {
    return {
      befund: 'fehlt',
      verwendbar: false,
      hinweis: 'Keine Gläubiger-Identifikationsnummer hinterlegt — bei der Deutschen Bundesbank beantragen (kostenfrei, Bearbeitung mehrere Tage).',
    }
  }

  if (SEPA_PLATZHALTER_IDS.includes(wert)) {
    return {
      befund: 'platzhalter',
      verwendbar: false,
      hinweis: 'Hinterlegt ist ein Platzhalter, keine echte Gläubiger-ID. Lastschrifteinzug ist gesperrt, bis die echte ID der Bundesbank eingetragen ist.',
    }
  }

  if (!CI_MUSTER_DE.test(wert)) {
    return {
      befund: 'formatfehler',
      verwendbar: false,
      hinweis: 'Format ungültig — erwartet wird DE + 2 Prüfziffern + ZZZ + 11 Stellen (Beispielform: DE__ZZZ___________).',
    }
  }

  // Die letzten 11 Stellen sind der eigentliche Identifikationsteil.
  if (/^0{11}$/.test(wert.slice(-11))) {
    return {
      befund: 'nur_nullen',
      verwendbar: false,
      hinweis: 'Der Identifikationsteil besteht nur aus Nullen — das ist kein von der Bundesbank vergebener Wert.',
    }
  }

  return { befund: 'ok', verwendbar: true, hinweis: null }
}

export class GlaeubigerIdUngueltigError extends Error {
  readonly befund: GlaeubigerIdBefund

  constructor(pruefung: GlaeubigerIdPruefung) {
    super(
      `SEPA_GESPERRT: Gläubiger-Identifikationsnummer nicht verwendbar (${pruefung.befund}). ` +
      `Es wurde kein Sammelauftrag erzeugt und keine Lastschrift eingezogen. ` +
      `${pruefung.hinweis ?? ''}`.trim(),
    )
    this.name = 'GlaeubigerIdUngueltigError'
    this.befund = pruefung.befund
  }
}

/**
 * Sperre vor dem Erzeugen eines Lastschrift-Sammelauftrags.
 * Wirft, statt einen Wahrheitswert zu liefern — ein vergessener If-Zweig
 * darf nicht zum Einzug mit ungültiger Gläubiger-ID führen.
 *
 * @throws GlaeubigerIdUngueltigError
 */
export function pruefeGlaeubigerIdOderWerfe(id: string | null | undefined): string {
  const pruefung = pruefeGlaeubigerId(id)
  if (!pruefung.verwendbar) {
    throw new GlaeubigerIdUngueltigError(pruefung)
  }
  return normalisiereGlaeubigerId(id)
}
