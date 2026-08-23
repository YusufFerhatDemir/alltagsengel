// ═══════════════════════════════════════════════════════════════════════
// CSV-Zellen — eine Stelle, an der die Formel-Entschärfung passiert
// ═══════════════════════════════════════════════════════════════════════
//
// Der führende Apostroph bei =, +, -, @ ist kein Schönheitsfehler: ohne ihn
// interpretiert Excel den Zellinhalt als Formel (CSV-Injection). Ein
// Klientenname wie =HYPERLINK("http://…") stammt aus einem kundenseitigen
// Formular und landet ungefiltert im Prüf-Export, den ein Sachbearbeiter in
// Excel öffnet — das ist ein durchgehender Pfad von außen bis zur Ausführung.
//
// Die Funktion stand ursprünglich nur in lib/analytics/opsAudit.ts. Der
// §-302-Prüf-Export in lib/abrechnung/sgb-v/export-generator.ts hatte sie
// nicht und baute seine Zeilen per join(';') zusammen — ohne Quotierung,
// ohne Formel-Schutz, und mit einem replace(/;/g, ',') als einzigem Schutz
// gegen zerschossene Spalten. Ein Zeilenumbruch im Namen hätte dort die
// ganze Datei verschoben.
//
// Deshalb liegt sie jetzt hier: geteilter Code statt zweier Kopien, von
// denen eine sicher ist und die andere nicht.

/**
 * Eine CSV-Zelle. Trennzeichen ist das Semikolon, weil Excel in deutscher
 * Locale genau das erwartet — ein Komma-CSV landet dort in einer einzigen
 * Spalte und ist für eine Prüfung wertlos.
 *
 * Immer in Anführungszeichen: das trägt Semikolon, Zeilenumbruch und
 * Anführungszeichen im Wert, ohne dass der Aufrufer daran denken muss.
 */
export function csvZelle(wert: unknown): string {
  if (wert === null || wert === undefined) return ''
  const roh = typeof wert === 'object' ? JSON.stringify(wert) : String(wert)
  const entschaerft = /^[=+\-@]/.test(roh) ? `'${roh}` : roh
  return `"${entschaerft.replace(/"/g, '""')}"`
}

/** Eine Zeile aus bereits entschärften Zellen. */
export function csvZeile(werte: readonly unknown[]): string {
  return werte.map(csvZelle).join(';')
}
