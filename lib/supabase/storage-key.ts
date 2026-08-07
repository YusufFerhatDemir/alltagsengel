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

    // Lokale Staging-Instanz (Shadow-DB + PostgREST-Shim). Ohne diesen Zweig
    // liefert die Ableitung null, der Client faellt auf 'sb-INVALID-auth-token'
    // zurueck und KEINE Sitzung laesst sich speichern — eine Browser-Abnahme
    // der Admin-Oberflaeche gegen Staging waere unmoeglich.
    //
    // Der Wert MUSS exakt dem entsprechen, was supabase-js selbst bildet:
    //   defaultStorageKey = `sb-${baseUrl.hostname.split(".")[0]}-auth-token`
    // Eine eigene Variante (etwa mit Port) laesst Middleware und Bibliothek
    // unterschiedliche Cookie-Namen suchen — die Sitzung ist dann zwar
    // gesetzt, wird aber nie gefunden ("Auth session missing").
    //
    // Bewusst eng: NUR die Literale localhost und 127.0.0.1. Jeder andere
    // Host ausserhalb von *.supabase.co bleibt fail-closed.
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return hostname.split('.')[0]
    }

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
