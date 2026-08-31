// ═══════════════════════════════════════════════════════════════════════
// Welche Spalten einer Verordnung darf die Abrechnung sehen?
// ═══════════════════════════════════════════════════════════════════════
//
// `verordnungen` fuehrt 54 Spalten. Acht davon braucht die Abrechnung, um
// einen Abrechnungsfall zu bilden. Eine davon ist `diagnose` — ein
// Gesundheitsdatum, und `lib/auth/rollen.ts` haelt woertlich fest, dass
// die Buchhaltung „KEINE Gesundheitsdaten" bekommt.
//
// RLS kann diese Unterscheidung nicht treffen: Row Level Security
// entscheidet ueber ZEILEN. Die Trennung muss deshalb in der Abfrage
// stehen — und dafuer an EINER Stelle, nicht in jeder Route neu.
//
// ── ERLAUBNISLISTE, KEINE SPERRLISTE ──────────────────────────────────
//
// Die Richtung ist die eigentliche Entscheidung. Eine Sperrliste
// („alles ausser diagnose") waere bequemer und waere falsch: die naechste
// Spalte auf dieser Tabelle — ein Freitextfeld mit Befunden, eine
// ICD-Kennung, eine Notiz der Pflegedienstleitung — waere damit
// automatisch DRIN, und niemand haette eine Entscheidung getroffen.
//
// Diese Liste ist deshalb abschliessend. Wer eine Spalte ergaenzt,
// ergaenzt sie hier bewusst, und der Test daneben verlangt eine
// Begruendung in Form eines gruenen Laufs.

/**
 * Die Spalten, die `/admin/abrechnung` braucht — und nur diese.
 *
 * Jede einzeln begruendet, weil „braucht die Seite halt" keine
 * Begruendung ist, wenn Gesundheitsdaten daneben liegen:
 *
 *   id, client_id            Zuordnung zur Leistung und zum Versicherten
 *   genehmigung_status       ob abgerechnet werden darf
 *   genehmigung_aktenzeichen gehoert in den Datentraegeraustausch
 *   kostentraeger_name/_ik   der Rechnungsempfaenger
 *   gueltig_von/_bis         ob die Leistung im Genehmigungszeitraum lag
 */
export const ABRECHNUNGSSPALTEN = [
  'id',
  'client_id',
  'genehmigung_status',
  'genehmigung_aktenzeichen',
  'kostentraeger_name',
  'kostentraeger_ik_nummer',
  'gueltig_von',
  'gueltig_bis',
] as const

/**
 * Spalten, die diese Projektion NIEMALS herausgeben darf.
 *
 * Sie steht hier nicht als zweiter Filter — gefiltert wird ausschliesslich
 * ueber die Erlaubnisliste oben. Sie steht hier, damit der Test etwas hat,
 * woran er die Erlaubnisliste messen kann: ein Name, der versehentlich in
 * beide Listen geriete, bricht den Lauf.
 */
export const NIEMALS_AN_DIE_ABRECHNUNG = [
  'diagnose',
  'leistung_beschreibung',
  'arzt_name',
  'arzt_praxis',
  'notes',
  'verordnung_document_url',
  'genehmigung_document_url',
] as const

export interface VerordnungFuerAbrechnung {
  id: string
  client_id: string | null
  genehmigung_status: string | null
  genehmigung_aktenzeichen: string | null
  kostentraeger_name: string | null
  kostentraeger_ik_nummer: string | null
  gueltig_von: string | null
  gueltig_bis: string | null
}

/**
 * Prueft, ob ein Datensatz ueber die erlaubten Felder hinausgeht.
 *
 * Fuer den Fall, dass jemand die Projektion umgeht und trotzdem durch
 * diese Stelle laeuft — dann faellt es hier auf und nicht erst beim
 * Empfaenger. Gibt die unerlaubten Feldnamen zurueck, leer heisst sauber.
 */
export function unerlaubteFelder(datensatz: Record<string, unknown>): string[] {
  const erlaubt = new Set<string>(ABRECHNUNGSSPALTEN)
  return Object.keys(datensatz).filter(k => !erlaubt.has(k))
}
