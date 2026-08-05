// ═══════════════════════════════════════════════════════════════
// Dynamische Ableitung des Supabase-Auth-Cookie-Keys
// ═══════════════════════════════════════════════════════════════
// Format: sb-{PROJECT_REF}-auth-token
// Der Projekt-Ref wird aus NEXT_PUBLIC_SUPABASE_URL extrahiert.
// FAIL-CLOSED: Bei fehlender/ungültiger URL → null (Aufrufer MUSS blockieren).
// ═══════════════════════════════════════════════════════════════

/**
 * Extrahiert den Supabase-Projekt-Ref aus einer Supabase-URL.
 * Gibt `null` zurück bei fehlender, leerer oder ungültiger URL.
 */
export function extractProjectRef(url: string | undefined | null): string | null {
  if (!url || typeof url !== 'string' || url.trim() === '') return null

  try {
    const parsed = new URL(url.trim())
    const hostname = parsed.hostname // z.B. "nnwyktkqibdjxgimjyuq.supabase.co"
    if (!hostname.endsWith('.supabase.co')) return null

    const ref = hostname.split('.')[0]
    if (!ref || ref.length === 0) return null

    return ref
  } catch {
    return null
  }
}

/**
 * Gibt den Supabase-Auth-Storage-Key zurück (Format: `sb-{ref}-auth-token`).
 * Gibt `null` zurück wenn der Projekt-Ref nicht ableitbar ist → FAIL-CLOSED.
 */
export function getSupabaseStorageKey(url: string | undefined | null): string | null {
  const ref = extractProjectRef(url)
  if (!ref) return null
  return `sb-${ref}-auth-token`
}

/**
 * Gibt den Storage-Key basierend auf `NEXT_PUBLIC_SUPABASE_URL` zurück.
 * Wirft NICHT — gibt `null` zurück bei Problemen → Aufrufer blockiert.
 */
export function getStorageKeyFromEnv(): string | null {
  return getSupabaseStorageKey(process.env.NEXT_PUBLIC_SUPABASE_URL)
}
