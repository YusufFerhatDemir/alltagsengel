// ═══════════════════════════════════════════════════════════════════════
// invoices.status hat ZWEI Vokabulare — und beide sind live in Gebrauch
// ═══════════════════════════════════════════════════════════════════════
//
// BEFUND (31.08.2026)
//
// `invoices_status_check` laesst einundzwanzig Werte zu. Sie zerfallen in
// zwei Saetze, die dasselbe meinen:
//
//   deutsch   entwurf, geprueft, freigegeben, uebermittelt, quittiert,
//             bezahlt, teilweise_bezahlt, storniert, strittig, abgelehnt,
//             akzeptiert, abgeschrieben, gekuerzt, korrektur_erforderlich,
//             erneut_eingereicht
//   englisch  draft, sent, paid, partial, rejected, disputed
//
// Der Bestand nutzt BEIDE: die drei Rechnungen in der
// Produktionsdatenbank stehen auf `sent`, `disputed` und `paid`, waehrend
// der Rechnungsweg (npm run verify:geldweg) durchgehend deutsche Werte
// schreibt.
//
// Vier Stellen fuehrten je eine eigene Liste — und alle vier kannten nur
// die deutsche Haelfte:
//
//   lib/billing/dunning/mahn-safety-gate.ts   GESPERRTE_STATUS
//   lib/billing/core/dunning.ts               NICHT_MAHNFAEHIG
//   lib/billing/opos/opos-manager.ts          OPOS-Abfrage
//   lib/billing/core/payments.ts              Zuordnungskandidaten
//   lib/billing/matching/matching-engine.ts   Zuordnungskandidaten
//
// Die Folgen unterscheiden sich je Stelle, und keine davon war harmlos:
//
//   • Mahntor: Pruefpunkt 3 meldete woertlich „Status ‚paid' ist
//     mahnfaehig". Bezahlte und bestrittene Rechnungen fingen andere
//     Punkte ab; ein ENTWURF (`draft`) mit offenem Betrag und
//     ueberschrittener Faelligkeit haette alle zehn passiert.
//   • Offene Posten: eine stornierte Rechnung im englischen Wortlaut
//     (`cancelled`) behaelt ihren Betrag und stand weiter in der Liste —
//     die ausgewiesene Forderung war zu hoch.
//   • Zahlungszuordnung: dieselbe stornierte Rechnung wurde als Ziel
//     einer eingehenden Zahlung angeboten und automatisch zugeordnet.
//
// Diese Datei ist die eine Liste, damit es keine fuenfte gibt. Wer eine
// neue Abfrage baut, nimmt sie von hier — und bekommt beide Vokabulare
// geschenkt.
//
// ── WARUM NICHT EINFACH DIE SPALTE VEREINHEITLICHEN ───────────────────
//
// Weil das eine Datenmigration ueber jede Rechnung waere, mit einem
// CHECK, der sie erzwingt, und mit Anpassungen an jedem Statuswechsel im
// System — und weil `validate_invoice_status_transition` in der Datenbank
// die erlaubten Uebergaenge kennt. Das ist der richtige Schritt, aber ein
// eigener. Bis dahin ist eine gemeinsame Liste die ehrliche Antwort: sie
// behauptet nicht, das Problem sei weg.

/**
 * Endzustaende: hier ist nichts mehr zu holen und nichts mehr zu mahnen.
 *
 * `bezahlt`/`paid` steht mit drin, obwohl der offene Betrag das ohnehin
 * abfaengt — eine Liste, die den offensichtlichen Fall auslaesst, laedt
 * dazu ein, sich auf den zweiten Riegel zu verlassen.
 */
export const RECHNUNG_ERLEDIGT: readonly string[] = [
  // deutsch
  'bezahlt', 'storniert', 'akzeptiert', 'abgeschrieben',
  // englisch
  'paid', 'cancelled',
]

/**
 * Zustaende, in denen NICHT gemahnt werden darf — die Endzustaende plus
 * alles, was noch nicht hinausgegangen ist oder bestritten wird.
 *
 * `sent`/`uebermittelt`/`freigegeben` und `partial`/`teilweise_bezahlt`
 * stehen bewusst NICHT hier: das ist der Normalfall einer offenen
 * Forderung.
 */
export const NICHT_MAHNFAEHIGE_STATUS: readonly string[] = [
  ...RECHNUNG_ERLEDIGT,
  // deutsch
  'entwurf', 'geprueft', 'korrektur_erforderlich', 'strittig', 'abgelehnt',
  // englisch
  'draft', 'rejected', 'disputed',
]

/**
 * Zustaende, die als Ziel einer Zahlungszuordnung ausscheiden.
 *
 * Enger als NICHT_MAHNFAEHIGE_STATUS: eine bestrittene oder noch nicht
 * versandte Rechnung darf man sehr wohl bezahlen — man darf sie nur nicht
 * mahnen. Ausgeschlossen sind nur die Endzustaende.
 */
export const KEINE_ZUORDNUNG_STATUS: readonly string[] = RECHNUNG_ERLEDIGT

/**
 * Dieselbe Liste als PostgREST-Literal fuer `.not('status','in', …)`.
 *
 * PostgREST erwartet dort `("a","b")` — von Hand zusammengesetzt ist das
 * eine Fehlerquelle mehr, gerade weil ein falsch geschriebenes Literal
 * nicht auffaellt: die Abfrage laeuft, sie filtert nur nichts.
 */
export function alsPostgrestListe(werte: readonly string[]): string {
  return `(${werte.map(w => `"${w}"`).join(',')})`
}
