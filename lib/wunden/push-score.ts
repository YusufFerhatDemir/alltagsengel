// ═══════════════════════════════════════════════════════════════
// PUSH-Tool 3.0 (Pressure Ulcer Scale for Healing)
// Drei Teilwerte: Fläche (0-10), Exsudatmenge (0-3), Gewebetyp (0-4).
// Gesamt 0-17; sinkender Wert = Heilungstendenz.
// ═══════════════════════════════════════════════════════════════

import type { ExsudatMenge } from './types'

/** Obergrenzen der PUSH-Flächenklassen in cm² (Klasse = Index + 1). */
const FLAECHE_KLASSEN_CM2 = [0.3, 0.6, 1.0, 2.0, 3.0, 4.0, 8.0, 12.0, 24.0] as const

/** Fläche (L×B in cm²) → 0-10 gemäß PUSH 3.0. */
export function pushFlaechePunkte(laengeCm: number | null, breiteCm: number | null): number | null {
  if (laengeCm === null || breiteCm === null) return null
  if (laengeCm < 0 || breiteCm < 0) throw new Error('Länge/Breite dürfen nicht negativ sein.')
  const flaeche = laengeCm * breiteCm
  if (flaeche === 0) return 0
  const klasse = FLAECHE_KLASSEN_CM2.findIndex(grenze => flaeche <= grenze)
  return klasse === -1 ? 10 : klasse + 1
}

/** Exsudatmenge → 0-3 gemäß PUSH 3.0. */
export function pushExsudatPunkte(menge: ExsudatMenge | null): number | null {
  if (menge === null) return null
  return { keine: 0, wenig: 1, maessig: 2, viel: 3 }[menge]
}

export interface PushGewebeInput {
  laengeCm: number | null
  breiteCm: number | null
  granulationPct: number | null
  fibrinPct: number | null
  nekrosePct: number | null
  epithelPct: number | null
}

/**
 * Gewebetyp → 0-4: Es zählt das "schlechteste" vorhandene Gewebe
 * (Nekrose 4 > Fibrin/Beläge 3 > Granulation 2 > Epithel 1 > geschlossen 0).
 * Ohne jede Wundgrund-Angabe kein Teilwert (null) — nicht stillschweigend 0.
 */
export function pushGewebePunkte(input: PushGewebeInput): number | null {
  const { granulationPct, fibrinPct, nekrosePct, epithelPct } = input
  if (granulationPct === null && fibrinPct === null && nekrosePct === null && epithelPct === null) return null
  if ((nekrosePct ?? 0) > 0) return 4
  if ((fibrinPct ?? 0) > 0) return 3
  if ((granulationPct ?? 0) > 0) return 2
  if ((epithelPct ?? 0) > 0) return 1
  // Alle Anteile 0: geschlossene Wunde nur bei Fläche 0, sonst Epithelwert.
  if (input.laengeCm !== null && input.breiteCm !== null && input.laengeCm * input.breiteCm === 0) return 0
  return 1
}

export interface PushScore {
  flaechePunkte: number | null
  exsudatPunkte: number | null
  gewebePunkte: number | null
  /** Nur gesetzt, wenn alle drei Teilwerte vorliegen. */
  gesamt: number | null
}

export function berechnePushScore(params: {
  laengeCm: number | null
  breiteCm: number | null
  exsudatMenge: ExsudatMenge | null
  granulationPct: number | null
  fibrinPct: number | null
  nekrosePct: number | null
  epithelPct: number | null
}): PushScore {
  const flaechePunkte = pushFlaechePunkte(params.laengeCm, params.breiteCm)
  const exsudatPunkte = pushExsudatPunkte(params.exsudatMenge)
  const gewebePunkte = pushGewebePunkte({
    laengeCm: params.laengeCm,
    breiteCm: params.breiteCm,
    granulationPct: params.granulationPct,
    fibrinPct: params.fibrinPct,
    nekrosePct: params.nekrosePct,
    epithelPct: params.epithelPct,
  })
  const gesamt = flaechePunkte !== null && exsudatPunkte !== null && gewebePunkte !== null
    ? flaechePunkte + exsudatPunkte + gewebePunkte
    : null
  return { flaechePunkte, exsudatPunkte, gewebePunkte, gesamt }
}
