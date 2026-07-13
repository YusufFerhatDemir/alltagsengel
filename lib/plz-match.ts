// ═══════════════════════════════════════════════════════════
// ENGEL-MATCHING NACH PLZ-NÄHE
// ═══════════════════════════════════════════════════════════
// Kunden sollen nur Engel sehen, die realistisch zu ihnen fahren
// können. Reiner Präfix-Vergleich (erste 1–2 Stellen) funktioniert
// im Kerngebiet NICHT: Frankfurt-Höchst/Griesheim ist 65xxx (wie
// Wiesbaden!), Frankfurt-Mitte 60xxx — ein 65er-Engel in Griesheim
// gehört zu Frankfurt, nicht zu Wiesbaden.
//
// Deshalb: Distanz zwischen PLZ-Koordinaten.
//   1. Primär: 3-Steller-Zonen-Zentroide aus PLZ_ZONE_CENTROIDS
//      (kuratiert, offline, deterministisch — deckt das komplette
//      Servicegebiet ab). Der zippopotam-DE-Datensatz ist für viele
//      PLZ korrupt (u.a. Frankfurt!), darum ist die API bewusst
//      NICHT primär.
//   2. Fallback (Zone unbekannt): geocodePLZ für beide PLZ — nur
//      plausible Deutschland-Koordinaten werden akzeptiert
//      (Guard in lib/geocoding.ts).
//   3. Letzter Fallback: gleiche PLZ-Leitregion (erste 2 Stellen).
//
// Die Matching-Distanz ist bewusst KEINE Rechts-/Bundesland-Logik —
// dafür gibt es lib/hessen-plz.ts (Kassenleistung nur Hessen).
// ═══════════════════════════════════════════════════════════

import { haversineDistance } from './geocoding'

/** Maximale Luftlinien-Distanz Kunde↔Engel in km. 15 km trennt
 *  Frankfurt und Wiesbaden sauber (West-FFM ↔ Ost-WI ≈ 20 km),
 *  hält aber Stadtgebiete + direkte Nachbarstädte zusammen. */
export const ENGEL_MATCH_RADIUS_KM = 15

/** Unschärfe-Puffer für den Zentroid-Fallback (Zonen sind grob). */
const ZONE_UNSCHAERFE_KM = 5

// Grobe Mittelpunkte der 3-stelligen PLZ-Zonen (Näherungswerte).
// Fokus: Rhein-Main + Hessen + Zonen, die im Datenbestand vorkommen.
// Primäre Matching-Quelle (s. Kopfkommentar).
export const PLZ_ZONE_CENTROIDS: Record<string, [number, number]> = {
  // Nordhessen
  '340': [51.31, 9.49], '341': [51.32, 9.50], '342': [51.27, 9.42],
  '343': [51.33, 9.42], '344': [51.38, 9.10], '345': [51.13, 9.27],
  '346': [51.05, 9.35],
  // Mittelhessen
  '350': [50.81, 8.77], '351': [50.80, 8.77], '352': [50.83, 8.92],
  '353': [50.62, 8.70], '354': [50.55, 8.75], '355': [50.56, 8.50],
  '356': [50.60, 8.38], '357': [50.70, 8.30],
  // Osthessen
  '360': [50.55, 9.68], '361': [50.55, 9.72], '362': [50.87, 9.70],
  '363': [50.33, 9.50], '364': [50.83, 10.15], '372': [51.15, 9.95],
  // Mainz / Rheinhessen
  '550': [49.99, 8.25], '551': [50.00, 8.24], '552': [50.02, 8.29],
  '553': [49.91, 8.20], '554': [49.85, 7.87], '555': [49.80, 7.90],
  // Frankfurt
  '603': [50.11, 8.68], '604': [50.15, 8.63], '605': [50.08, 8.60],
  // Hochtaunus / Wetterau
  '611': [50.22, 8.78], '612': [50.33, 8.60], '613': [50.23, 8.62],
  '614': [50.20, 8.55],
  // Offenbach / Hanau / Main-Kinzig
  '630': [50.10, 8.77], '631': [50.02, 8.85], '632': [50.02, 8.68],
  '633': [49.99, 8.75], '634': [50.14, 8.90], '635': [50.07, 9.00],
  '636': [50.30, 9.10],
  // Aschaffenburg / Miltenberg (Bayern)
  '637': [49.98, 9.12], '638': [49.93, 9.18], '639': [49.75, 9.23],
  // Darmstadt / Südhessen
  '640': [49.87, 8.65], '641': [49.87, 8.65], '642': [49.87, 8.65],
  '643': [49.88, 8.58], '644': [49.80, 8.75], '645': [49.95, 8.52],
  '646': [49.62, 8.60], '647': [49.66, 8.99], '648': [49.89, 8.88],
  '649': [49.65, 8.78],
  // Wiesbaden / Taunus / Limburg
  '651': [50.08, 8.24], '652': [50.09, 8.22], '653': [50.09, 8.12],
  '654': [50.01, 8.44], '655': [50.30, 8.15], '656': [50.32, 8.03],
  '657': [50.10, 8.48], '658': [50.13, 8.52], '659': [50.10, 8.56],
  // Zonen aus dem aktuellen Datenbestand außerhalb des Kerngebiets
  '101': [52.53, 13.39], // Berlin-Mitte (Testdaten)
  '413': [51.17, 6.55],  // Korschenbroich / Mönchengladbach
  '590': [51.68, 7.82],  // Hamm
  '861': [48.37, 10.90], // Augsburg
  '868': [48.18, 10.75], // Schwabmünchen
}

/** Grober Zonen-Mittelpunkt für eine 5-stellige PLZ (oder null). */
export function zoneCentroid(plz: string): [number, number] | null {
  return PLZ_ZONE_CENTROIDS[plz.slice(0, 3)] ?? null
}

/**
 * Offline-Matching ohne Geocoding-API:
 * Zonen-Zentroide vergleichen; wenn eine Zone unbekannt ist,
 * auf gleiche PLZ-Leitregion (erste 2 Stellen) zurückfallen.
 */
export function matchPlzOffline(plzA: string, plzB: string): boolean {
  const a = zoneCentroid(plzA)
  const b = zoneCentroid(plzB)
  if (a && b) {
    return haversineDistance(a[0], a[1], b[0], b[1]) <= ENGEL_MATCH_RADIUS_KM + ZONE_UNSCHAERFE_KM
  }
  return plzA.slice(0, 2) === plzB.slice(0, 2)
}

/**
 * Vollständiges Matching Kunde↔Engel:
 *   1. identische PLZ → match
 *   2. beide Zonen bekannt → Zentroid-Distanz (offline, primär)
 *   3. sonst: Geocoding beider PLZ (Injektion, damit der Aufrufer
 *      cachen kann) → exakte Distanz
 *   4. sonst: gleiche PLZ-Leitregion (erste 2 Stellen)
 */
export async function matchPlz(
  plzA: string,
  plzB: string,
  geocode: (plz: string) => Promise<{ lat: number; lng: number } | null>
): Promise<boolean> {
  if (plzA === plzB) return true
  const a = zoneCentroid(plzA)
  const b = zoneCentroid(plzB)
  if (a && b) {
    return haversineDistance(a[0], a[1], b[0], b[1]) <= ENGEL_MATCH_RADIUS_KM + ZONE_UNSCHAERFE_KM
  }
  const [ga, gb] = await Promise.all([geocode(plzA), geocode(plzB)])
  if (ga && gb) {
    return haversineDistance(ga.lat, ga.lng, gb.lat, gb.lng) <= ENGEL_MATCH_RADIUS_KM
  }
  return plzA.slice(0, 2) === plzB.slice(0, 2)
}
