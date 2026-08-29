import { NextRequest, NextResponse } from 'next/server'

// ═══════════════════════════════════════════════════════════════
// In-Memory API Rate Limiter (Fixed-Window Counter)
//
// Bekannte Limitation: In-Memory Store wird bei Vercel Cold Start
// zurückgesetzt. Für Single-Instance / Serverless-Deployment
// akzeptabel — bei Multi-Instance auf Redis umstellen.
// ═══════════════════════════════════════════════════════════════

interface WindowEntry {
  count: number
  windowStart: number
}

const store = new Map<string, WindowEntry>()

const CLEANUP_INTERVAL_MS = 60_000
let lastCleanup = Date.now()

function cleanup(now: number, maxWindowMs: number) {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return
  lastCleanup = now
  for (const [key, entry] of store) {
    if (now - entry.windowStart > maxWindowMs * 2) {
      store.delete(key)
    }
  }
}

export interface RateLimitConfig {
  max: number
  windowMs: number
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterSeconds: number
  limit: number
}

export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now()
  cleanup(now, config.windowMs)

  const entry = store.get(key)

  if (!entry || now - entry.windowStart >= config.windowMs) {
    store.set(key, { count: 1, windowStart: now })
    return { allowed: true, remaining: config.max - 1, retryAfterSeconds: 0, limit: config.max }
  }

  entry.count++

  if (entry.count > config.max) {
    const windowEnd = entry.windowStart + config.windowMs
    const retryAfterSeconds = Math.ceil((windowEnd - now) / 1000)
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, retryAfterSeconds),
      limit: config.max,
    }
  }

  return {
    allowed: true,
    remaining: config.max - entry.count,
    retryAfterSeconds: 0,
    limit: config.max,
  }
}

// ── Tier-Konfigurationen ──

export const TIER_STRICT: RateLimitConfig = { max: 5, windowMs: 60_000 }
export const TIER_MEDIUM: RateLimitConfig = { max: 30, windowMs: 60_000 }
export const TIER_STANDARD: RateLimitConfig = { max: 120, windowMs: 60_000 }

// ── Route → Tier Zuordnung ──

const STRICT_PATTERNS = [
  '/api/auth/',
]

const MEDIUM_PATTERNS = [
  '/api/billing/invoices/',    // stornieren, credit etc. (Mutations)
  '/api/billing/sepa/mandates/',
  '/api/billing/dunning/',
  '/api/billing/credit-notes',
  '/api/einsatzplanung',
]

function matchesTier(pathname: string, patterns: string[]): boolean {
  return patterns.some(p => pathname.startsWith(p))
}

export function getTierForRoute(pathname: string, method: string): RateLimitConfig | null {
  if (!pathname.startsWith('/api/')) return null

  if (matchesTier(pathname, STRICT_PATTERNS)) return TIER_STRICT

  if (method !== 'GET' && matchesTier(pathname, MEDIUM_PATTERNS)) return TIER_MEDIUM

  return TIER_STANDARD
}

// ── IP-Extraktion ──

export function getClientIP(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  )
}

// ── User-ID aus Supabase JWT (ohne Bibliothek, nur base64-Decode des Payloads) ──

export function extractUserIdFromCookies(req: NextRequest, projectRef: string): string | null {
  const cookieName = `sb-${projectRef}-auth-token`

  const raw = req.cookies.get(cookieName)?.value
    || req.cookies.get(`${cookieName}.0`)?.value
  if (!raw) return null

  try {
    const parsed = typeof raw === 'string' && raw.startsWith('{')
      ? JSON.parse(raw)
      : null
    const accessToken: string | undefined = parsed?.access_token
    if (!accessToken) return null

    const payloadB64 = accessToken.split('.')[1]
    if (!payloadB64) return null

    const payload = JSON.parse(atob(payloadB64))
    return payload.sub || null
  } catch {
    return null
  }
}

// ── Middleware-Handler ──

export function handleRateLimit(req: NextRequest): NextResponse | null {
  // E2E-CI: Playwright spricht den Server direkt (ohne Reverse-Proxy) an,
  // dadurch fehlt x-forwarded-for und getClientIP() liefert für JEDE
  // Anfrage aus JEDER Browser-Session denselben Schlüssel "ip:unknown".
  // 70 Tests × 2 Browser-Projekte × Retries teilen sich so EIN
  // TIER_STANDARD-Budget (120/min) und lösen falsche 429er aus. Gesetzt
  // im CI-Job (.github/workflows/ci.yml) und für den Dev-Server, den
  // Playwright lokal selbst startet (playwright.config.ts, `webServer.env`)
  // — überall sonst, Produktion wie normale Entwicklung, bleibt das Limit
  // scharf.
  if (process.env.DISABLE_RATE_LIMIT_FOR_E2E === '1') return null

  const { pathname } = req.nextUrl
  const method = req.method

  const tier = getTierForRoute(pathname, method)
  if (!tier) return null

  const isStrict = tier === TIER_STRICT
  let key: string

  if (isStrict) {
    key = `strict:${getClientIP(req)}`
  } else {
    const projectRef = extractProjectRef(process.env.NEXT_PUBLIC_SUPABASE_URL)
    const userId = projectRef ? extractUserIdFromCookies(req, projectRef) : null
    key = userId
      ? `user:${userId}`
      : `ip:${getClientIP(req)}`
  }

  const result = checkRateLimit(key, tier)

  if (!result.allowed) {
    return NextResponse.json(
      { error: 'Zu viele Anfragen. Bitte versuchen Sie es später erneut.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(result.retryAfterSeconds),
          'X-RateLimit-Limit': String(result.limit),
          'X-RateLimit-Remaining': '0',
        },
      }
    )
  }

  return null
}

function extractProjectRef(url: string | undefined | null): string | null {
  if (!url) return null
  try {
    const hostname = new URL(url.trim()).hostname
    if (hostname === 'localhost' || hostname === '127.0.0.1') return hostname.split('.')[0]
    if (!hostname.endsWith('.supabase.co')) return null
    const ref = hostname.split('.')[0]
    return ref || null
  } catch {
    return null
  }
}

// ── Test-Helpers (nur für Tests exportiert) ──

export function _resetStore() {
  store.clear()
  lastCleanup = Date.now()
}

export function _getStoreSize(): number {
  return store.size
}
