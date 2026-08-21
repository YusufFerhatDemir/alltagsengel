// ═══════════════════════════════════════════════════════════════════════════
// Supabase-Schlüssel: eine Quelle der Wahrheit für den ÖFFENTLICHEN Key.
//
// Hintergrund: Supabase löst das Legacy-JWT-Modell (`anon` / `service_role`)
// durch die neuen API-Keys ab (`sb_publishable_…` / `sb_secret_…`). Die alten
// Keys werden Ende 2026 abgekündigt. Beide Modelle laufen parallel — deshalb
// ist die Umstellung rein additiv: neuer Name zuerst, alter Name als Fallback.
//
// WICHTIG — warum hier LITERALE `process.env.…`-Zugriffe stehen müssen:
// Next.js ersetzt `NEXT_PUBLIC_*` textuell zur BUILD-Zeit. Ein dynamischer
// Zugriff (`process.env[name]`) wird im Browser-Bundle NICHT ersetzt und ist
// dort `undefined`. Die Fallback-Kette muss deshalb ausgeschrieben bleiben.
//
// WICHTIG — Header-Regel der neuen Keys:
// `sb_publishable_…` / `sb_secret_…` sind KEINE JWTs. Sie dürfen nur im
// `apikey`-Header stehen. Wer sie zusätzlich als `Authorization: Bearer …`
// mitschickt, bekommt „Invalid JWT" zurück. Für Roh-`fetch`-Aufrufe gegen
// PostgREST gibt es dafür `supabaseApiHeaders()`.
//
// Der GEHEIME Key (`sb_secret_…` / `SUPABASE_SERVICE_ROLE_KEY`) steht bewusst
// NICHT in dieser Datei — sie wird ins Client-Bundle gezogen. Er lebt
// ausschließlich in `lib/supabase/admin.ts`.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Öffentlicher Supabase-Key für Browser, SSR und Middleware.
 * Reihenfolge: neuer Publishable-Key vor Legacy-Anon-Key.
 *
 * Gibt `''` zurück, wenn keiner gesetzt ist — die Aufrufer sind fail-closed
 * gebaut (`proxy.ts` sperrt dann alle geschützten Routen).
 */
export function supabasePublishableKey(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ''
  )
}

/** Supabase-Projekt-URL. Kein Geheimnis, aber derselbe Lesepfad für alle. */
export function supabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || ''
}

/**
 * Ist der Key ein Legacy-JWT (`eyJ…`)? Nur dann ist `Authorization: Bearer`
 * erlaubt. Die neuen Keys tragen die Präfixe `sb_publishable_` / `sb_secret_`.
 */
export function istLegacyJwtKey(key: string | undefined | null): boolean {
  return typeof key === 'string' && key.startsWith('eyJ')
}

/**
 * Header für direkte PostgREST-/Auth-`fetch`-Aufrufe.
 * Setzt `Authorization: Bearer` NUR bei Legacy-JWT-Keys.
 */
export function supabaseApiHeaders(
  key: string,
  extra: Record<string, string> = {}
): Record<string, string> {
  const headers: Record<string, string> = { apikey: key, ...extra }
  // Ein bereits mitgegebener Authorization-Header (z. B. ein User-JWT) hat
  // Vorrang und wird nie überschrieben.
  const hatAuth = Object.keys(headers).some((k) => k.toLowerCase() === 'authorization')
  if (!hatAuth && istLegacyJwtKey(key)) headers.Authorization = `Bearer ${key}`
  return headers
}
