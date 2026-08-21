// ═══════════════════════════════════════════════════════════════
// Supabase/PostgREST — eingebettete Relationen normalisieren
// ═══════════════════════════════════════════════════════════════
// PostgREST liefert bei einem FK-Join (z. B. `client:clients(...)`)
// zur Laufzeit genau ein Objekt, der generierte Typ beschreibt die
// Relation je nach Query-Form aber als Array. Ohne Normalisierung
// endet das entweder in `as any` oder in Zugriffen wie
// `row.client.first_name`, die der Typechecker zu Recht ablehnt.
//
// `one()` nimmt beide Formen an und gibt die einzelne Zeile zurueck.
// ═══════════════════════════════════════════════════════════════

type Einzelzeile<T> = T extends readonly (infer U)[] ? U : T

export function one<T>(relation: T | null | undefined): Einzelzeile<NonNullable<T>> | null {
  const wert = Array.isArray(relation) ? relation[0] : relation
  return (wert ?? null) as Einzelzeile<NonNullable<T>> | null
}
