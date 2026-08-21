/**
 * UserFacingError — bewusst nach aussen sichtbare Fehlermeldungen
 *
 * Bewusst in einem eigenen, abhaengigkeitsfreien Modul: Business-Logik in
 * `lib/**` wirft diesen Fehler, und Teile davon werden auch von Client-
 * Komponenten importiert. Laege die Klasse in `error-sanitizer.ts`, zoege
 * jeder solche Import `next/server` und `crypto` in das Client-Bundle.
 */

/**
 * Fehler, dessen `message` bewusst an den Client ausgeliefert werden darf.
 *
 * Nur fuer Meldungen verwenden, die redaktionell fuer Endnutzer formuliert
 * sind (Validierung, Geschaeftsregeln, Konflikte) — NIEMALS fuer Fehler, die
 * Datenbank-, Supabase- oder Infrastruktur-Details enthalten.
 *
 * ```ts
 * if (!titel.trim()) throw new UserFacingError('Titel ist ein Pflichtfeld.')
 * throw new UserFacingError('Eintrag ist bereits gesperrt.', 409)
 * ```
 */
export class UserFacingError extends Error {
  readonly status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = 'UserFacingError'
    this.status = status
  }
}
