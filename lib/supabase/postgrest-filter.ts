// ═══════════════════════════════════════════════════════════════════════
// PostgREST-Filterwerte sicher zusammensetzen
// ═══════════════════════════════════════════════════════════════════════
//
// WARUM DIESES MODUL: `.eq('spalte', wert)` ist ungefaehrlich — der Wert
// geht als eigener Parameter in die Anfrage und wird kodiert. `.or(…)`
// dagegen nimmt EINE ZEICHENKETTE, und PostgREST liest darin seine eigene
// Filtergrammatik: Kommas trennen Bedingungen, Punkte trennen
// Spalte/Operator/Wert, Klammern gruppieren. Wer eine Sucheingabe roh
// hineinschreibt,
//
//     .or(`display_name.ilike.%${suche}%,kim_address.ilike.%${suche}%`)
//
// laesst den Suchenden zusaetzliche Bedingungen ueber BELIEBIGE Spalten
// der Tabelle anhaengen — eine Suche nach `x,ik_nummer.eq.260326822`
// beantwortet die Frage, ob es eine Zeile mit dieser IK gibt. Die
// Mandantengrenze faellt dabei NICHT: `.eq('organization_id', …)` steht
// als eigener Parameter daneben und wird mit UND verknuepft. Was faellt,
// ist die Zusage, dass eine Suche eine Suche ist.
//
// `postgrestWert()` gab es bereits — aber nur in lib/akten/dokumente.ts,
// also genau dort, wo jemand schon einmal darueber gestolpert war. Die
// Aktensuche hat es benutzt, das KIM-Adressbuch nicht (Befund Track 7,
// 28.08.2026). Deshalb liegt die Regel jetzt an einer neutralen Stelle,
// die jedes Modul importieren kann, ohne von der Aktenverwaltung
// abzuhaengen.
// ═══════════════════════════════════════════════════════════════════════

/**
 * Ein Suchbegriff als PostgREST-Wert fuer `ilike`/`like` innerhalb von
 * `.or(…)`: in doppelte Anfuehrungszeichen gesetzt, mit `%` an beiden
 * Enden.
 *
 * In der Anfuehrungsform verlieren Komma, Punkt und Klammer ihre
 * Sonderbedeutung; maskiert werden muessen nur der Backslash und das
 * Anfuehrungszeichen selbst — beide wuerden die Klammerung sonst wieder
 * aufbrechen. Die Reihenfolge ist wesentlich: erst der Backslash, dann
 * das Anfuehrungszeichen. Andersherum wuerde der eingefuegte Backslash
 * der ersten Ersetzung von der zweiten noch einmal verdoppelt.
 */
export function postgrestSuchwert(begriff: string): string {
  const maskiert = begriff.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return `"%${maskiert}%"`
}

/**
 * Ein Wert fuer einen Gleichheitsvergleich innerhalb von `.or(…)` —
 * ohne die `%`-Platzhalter der Suchform.
 */
export function postgrestWert(wert: string): string {
  const maskiert = wert.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return `"${maskiert}"`
}
