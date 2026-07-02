// ═══════════════════════════════════════════════════════════
// SIMPLE IN-MEMORY RATE-LIMITER (Sliding Window)
// ═══════════════════════════════════════════════════════════
// Für öffentliche Formular-Endpoints (Lead, Kontakt).
// Pro Serverless-Instanz — kein verteilter Store, aber stoppt
// naive Bot-Floods und Doppel-Submits wirksam.
// ═══════════════════════════════════════════════════════════

const buckets = new Map<string, number[]>()

const MAX_BUCKETS = 10_000 // Speicher-Backstop

/**
 * true = Request erlaubt, false = Limit erreicht.
 * @param key    z. B. `${route}:${ip}`
 * @param limit  max. Requests pro Fenster
 * @param windowMs Fenstergröße in ms
 */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const cutoff = now - windowMs

  const hits = (buckets.get(key) ?? []).filter((t) => t > cutoff)
  if (hits.length >= limit) {
    buckets.set(key, hits)
    return false
  }

  hits.push(now)
  buckets.set(key, hits)

  if (buckets.size > MAX_BUCKETS) {
    // Älteste Einträge grob abräumen
    for (const [k, v] of buckets) {
      if (v.every((t) => t <= cutoff)) buckets.delete(k)
      if (buckets.size <= MAX_BUCKETS / 2) break
    }
  }
  return true
}

/** Client-IP aus Vercel-/Proxy-Headern lesen (Fallback: 'unknown'). */
export function getClientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return request.headers.get('x-real-ip') ?? 'unknown'
}

/** HTML-Sonderzeichen escapen — für User-Input in E-Mail-HTML. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
