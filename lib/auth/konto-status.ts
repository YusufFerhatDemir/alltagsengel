// ═══════════════════════════════════════════════════════════════════════
// Ist dieses Konto zur Löschung vorgemerkt? — eine Regel, eine Stelle
// ═══════════════════════════════════════════════════════════════════════
//
// BEFUND (Track 11): `DELETE /api/user/delete` setzt `profiles.deleted_at`
// und meldet „Konto wurde deaktiviert". Danach fragte KEINE Stelle im
// Anmeldeweg diese Spalte je wieder ab — nachgeprüft über `lib/auth`,
// `lib/supabase`, `lib/organizations`, `proxy.ts` und `app/auth`: null
// Treffer. Und die Datenbank fragt sie auch nicht: die Selbstlese-Policy
// `profiles_select_own USING (auth.uid() = id)` (Migration
// 20260815010000) trägt keinen `deleted_at`-Filter, `auth.users` bleibt
// unangetastet, das Passwort gilt weiter.
//
// Die Löschung endete also beim einmaligen `signOut()`. Wer sich danach
// erneut anmeldete, arbeitete im Konto weiter, als sei nichts geschehen —
// während im Hintergrund die 60-Tage-Frist lief und das Konto (sobald die
// Löschkette wieder greift) mitten im Betrieb endgültig verschwunden
// wäre. Beide Richtungen sind falsch.
//
// EINE AUSNAHME GAB ES BEREITS, und sie zeigt, dass die Absicht immer
// eine andere war: `is_admin()` trägt seit dem Soft-Delete-Entwurf
// `AND deleted_at IS NULL` — ein zur Löschung vorgemerkter Admin verliert
// seine Adminrechte sofort. Nur für alle anderen Rollen fehlte das
// Gegenstück im Anwendungscode.
//
// Diese Datei ist absichtlich rein: kein `next/server`, kein Supabase.
// Damit ist die Regel ohne Sitzung prüfbar und kann sowohl im Proxy
// (Edge-Laufzeit) als auch in den Fach-Guards benutzt werden.
// ═══════════════════════════════════════════════════════════════════════

/** Die Antwort an ein Konto, das zur Löschung vorgemerkt ist. */
export const KONTO_GELOESCHT_TEXT =
  'Dieses Konto wurde zur Löschung vorgemerkt und ist deshalb gesperrt. '
  + 'Über den Link in der Bestätigungs-E-Mail können Sie die Löschung widerrufen.'

/** Der Fehlercode, mit dem der Proxy zur Anmeldeseite umleitet. */
export const KONTO_GELOESCHT_CODE = 'konto_geloescht'

/**
 * Ist das Konto zu diesem Profil-Datensatz zur Löschung vorgemerkt?
 *
 * FAIL-CLOSED in beide Richtungen des Zweifels:
 *   * `null`, `undefined` und der leere String heißen „aktiv" — das ist
 *     der Normalfall, `deleted_at` ist bei jedem lebenden Konto NULL.
 *   * JEDER andere Wert heißt „vorgemerkt", auch ein unlesbares Datum.
 *     Ein `new Date(...)`-Vergleich würde bei einem kaputten Wert `NaN`
 *     liefern und damit stillschweigend auf „aktiv" fallen — also genau
 *     dort öffnen, wo etwas nicht stimmt.
 *
 * Es wird bewusst NICHT gegen die 60-Tage-Frist gerechnet: gesperrt ist
 * das Konto ab dem Vormerken, nicht erst ab dem Fristablauf. Der Widerruf
 * läuft über den Token-Link, nicht über eine Anmeldung.
 */
export function istZurLoeschungVorgemerkt(
  profil: { deleted_at?: unknown } | null | undefined,
): boolean {
  if (!profil) return false
  const wert = profil.deleted_at
  if (wert === null || wert === undefined) return false
  if (typeof wert === 'string' && wert.trim() === '') return false
  return true
}
