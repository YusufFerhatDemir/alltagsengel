/**
 * Baut den Passwort-Reset-Link aus dem `hashed_token`, das
 * `supabase.auth.admin.generateLink({ type: 'recovery' })` zurückgibt.
 *
 * WARUM NICHT `properties.action_link`?
 * ─────────────────────────────────────
 * `action_link` zeigt auf `<project>.supabase.co/auth/v1/verify?...`. Dieser
 * Endpoint verifiziert das Token und leitet mit den Tokens im URL-Fragment
 * weiter (Implicit-Grant):
 *
 *     /auth/reset-password#access_token=…&refresh_token=…&type=recovery
 *
 * Unser Browser-Client (lib/supabase/client.ts) läuft aber mit
 * `flowType: 'pkce'`. supabase-js verweigert in `_getSessionFromURL()` die
 * Verarbeitung eines Implicit-Callbacks, sobald flowType 'pkce' ist
 * ("Not a valid PKCE flow url"). Ergebnis: keine Session, kein
 * PASSWORD_RECOVERY-Event → die Seite meldet sofort "Link abgelaufen".
 * Ein PKCE-`code` kann hier ebenfalls nicht funktionieren, weil der
 * Link serverseitig erzeugt wird und im Browser des Users somit nie ein
 * code_verifier liegt.
 *
 * Deshalb verlinken wir direkt auf unsere eigene Seite und lösen das Token
 * dort per `verifyOtp({ type: 'recovery', token_hash })` ein — das ist
 * unabhängig vom flowType und braucht keinen code_verifier.
 *
 * Nebeneffekt (gewollt): Link-Scanner in Mail-Clients (z. B. Outlook
 * SafeLinks), die den Link bloß per GET vorab abrufen, verbrauchen das
 * Einmal-Token nicht mehr — `verifyOtp` läuft erst im JS der Seite.
 */
export function buildRecoveryLink(siteUrl: string, hashedToken: string): string {
  return `${siteUrl}/auth/reset-password?token_hash=${encodeURIComponent(hashedToken)}&type=recovery`
}
