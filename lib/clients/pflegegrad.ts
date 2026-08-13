/**
 * Pflegegrad eines Klienten — EINE Quelle für alle Auswertungen.
 *
 * WARUM ES DIESE FUNKTION GIBT:
 * `clients` führt den Pflegegrad in ZWEI Spalten: `care_level` und
 * `pflegegrad`. Führend ist `care_level` — das schreibt die Eingabemaske,
 * das liest die Klientenakte, danach richtet sich die Budgetanlage.
 * `pflegegrad` wird seit 20260814 beim Anlegen und beim Ändern
 * mitgeschrieben, ist aber bei allen VORHER angelegten Klienten NULL.
 *
 * Wer nur `pflegegrad` liest, sieht deshalb bei Bestandskunden „kein
 * Pflegegrad", obwohl einer erfasst ist. Genau das hat die Pilot-Kette
 * bei jedem Bestandskunden auf Schritt 2 stehen lassen und die
 * Kassenabrechnung jeden Fall verwerfen lassen.
 *
 * Zusammenführen der beiden Spalten in der Datenbank braucht eine
 * Migration. Bis dahin liest jede Auswertung über diese Funktion.
 */
export function pflegegradVon(
  client: { care_level?: number | string | null; pflegegrad?: number | string | null } | null | undefined,
): number | null {
  if (!client) return null
  for (const roh of [client.care_level, client.pflegegrad]) {
    if (roh === null || roh === undefined || roh === '') continue
    const n = Number(roh)
    if (Number.isFinite(n) && n >= 1 && n <= 5) return n
  }
  return null
}

/** Spaltenliste, die `pflegegradVon` braucht — in jedes `select` übernehmen. */
export const PFLEGEGRAD_SPALTEN = 'care_level, pflegegrad'
