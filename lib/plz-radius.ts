// ═══════════════════════════════════════════════════════════
// UMKREIS-KONSTANTEN — bewusst in einem eigenen Modul
// ═══════════════════════════════════════════════════════════
// Client-Komponenten brauchen nur die Radius-Werte, nicht die
// Matching-Logik. Lägen die Konstanten in lib/plz-match.ts,
// zöge jeder Import den ~180 KB großen PLZ-Datensatz
// (lib/plz-coords.data.ts) ins Browser-Bundle.
// ═══════════════════════════════════════════════════════════

/** Standard-Umkreis Kunde↔Engel in km.
 *  25 km deckt eine Stadt samt Speckgürtel ab und trennt Frankfurt
 *  von Wiesbaden (≈32 km Luftlinie) weiterhin sauber. */
export const ENGEL_MATCH_RADIUS_KM = 25

/** Vom Kunden wählbare Umkreis-Stufen (km). */
export const RADIUS_OPTIONEN = [10, 25, 50, 100] as const
