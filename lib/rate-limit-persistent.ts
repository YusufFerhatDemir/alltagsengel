// ═══════════════════════════════════════════════════════════════════════
// PERSISTENTER RATE-LIMITER (instanzuebergreifend)
//
// Master-Final-Release-Audit 2026-08-19, Befund B-2 / I-6:
// lib/rate-limit.ts zaehlt in einer Map im Modul-Scope — also PRO
// Serverless-Instanz. Auf Vercel startet jede neue Instanz mit leerem
// Zaehler; fuer den unauthentifizierten /api/visitor-alert (schreibt mit
// Admin-Client, versendet Mail, legt Notifications an) reicht das nicht.
//
// Dieser Limiter zaehlt in der Datenbank (public.api_rate_limits) ueber
// die RPC public.api_rate_limit_hit — atomar, ein Roundtrip.
//
// Verhalten wenn die Migration 20260922030000 noch nicht eingespielt ist:
// Fallback auf den In-Memory-Limiter plus einmalige Warnung. Bewusst
// nicht fail-closed — sonst waere die Route bis zum Apply komplett tot,
// und das Ergebnis waere schlechter als der Zustand vor dem Fix.
// ═══════════════════════════════════════════════════════════════════════

import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
const log = logger.child('rate-limit')

/** Warnung nur einmal pro Instanz, nicht pro Request. */
let fallbackGewarnt = false

function fallback(key: string, limit: number, windowMs: number, grund: string): boolean {
  if (!fallbackGewarnt) {
    fallbackGewarnt = true
    log.warn(
      'Persistenter Limiter nicht verfuegbar, Fallback auf In-Memory ' +
        '(Migration 20260922030000_persistenter_api_ratelimit.sql eingespielt?)',
      { grund },
    )
  }
  return rateLimit(key, limit, windowMs)
}

/**
 * true = Request erlaubt, false = Limit erreicht.
 *
 * @param key      z. B. `visitor-alert:${ip}` — wird auf 200 Zeichen gekuerzt
 * @param limit    max. Requests pro Fenster
 * @param windowMs Fenstergroesse in ms (wird auf volle Sekunden aufgerundet)
 */
export async function rateLimitPersistent(
  key: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000))
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.rpc('api_rate_limit_hit', {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    })

    if (error) {
      return fallback(key, limit, windowMs, error.message)
    }
    // Die RPC liefert boolean. Alles andere ist ein Vertragsbruch und
    // wird als "nicht erlaubt" gewertet.
    return data === true
  } catch (err: any) {
    return fallback(key, limit, windowMs, err?.message || 'unbekannter Fehler')
  }
}
