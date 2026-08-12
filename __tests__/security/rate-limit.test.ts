import {
  checkRateLimit,
  getTierForRoute,
  getClientIP,
  handleRateLimit,
  TIER_STRICT,
  TIER_MEDIUM,
  TIER_STANDARD,
  _resetStore,
} from '@/lib/middleware/rate-limit'
import { NextRequest } from 'next/server'

beforeEach(() => {
  _resetStore()
})

function makeRequest(path: string, options?: {
  method?: string
  ip?: string
  cookies?: Record<string, string>
}): NextRequest {
  const url = `https://alltagsengel.care${path}`
  const req = new NextRequest(url, { method: options?.method || 'GET' })

  if (options?.ip) {
    req.headers.set('x-forwarded-for', options.ip)
  }

  return req
}

// ── Tier-Zuordnung ──

describe('getTierForRoute', () => {
  it('gibt STRICT für Auth-Routen zurück', () => {
    expect(getTierForRoute('/api/auth/login', 'POST')).toBe(TIER_STRICT)
    expect(getTierForRoute('/api/auth/send-reset', 'POST')).toBe(TIER_STRICT)
    expect(getTierForRoute('/api/auth/check-rate-limit', 'POST')).toBe(TIER_STRICT)
  })

  it('gibt MEDIUM für Billing-Mutations zurück (nicht-GET)', () => {
    expect(getTierForRoute('/api/billing/invoices/123/stornieren', 'POST')).toBe(TIER_MEDIUM)
    expect(getTierForRoute('/api/billing/sepa/mandates/abc/revoke', 'POST')).toBe(TIER_MEDIUM)
    expect(getTierForRoute('/api/billing/dunning/456/eskalieren', 'POST')).toBe(TIER_MEDIUM)
    expect(getTierForRoute('/api/einsatzplanung', 'POST')).toBe(TIER_MEDIUM)
  })

  it('gibt STANDARD für Billing-GET zurück (lesend, nicht limitiert wie Mutations)', () => {
    expect(getTierForRoute('/api/billing/invoices/123', 'GET')).toBe(TIER_STANDARD)
    expect(getTierForRoute('/api/billing/sepa/mandates/abc', 'GET')).toBe(TIER_STANDARD)
  })

  it('gibt STANDARD für normale API-Routen zurück', () => {
    expect(getTierForRoute('/api/clients', 'GET')).toBe(TIER_STANDARD)
    expect(getTierForRoute('/api/service-records', 'POST')).toBe(TIER_STANDARD)
  })

  it('gibt null für Nicht-API-Routen zurück', () => {
    expect(getTierForRoute('/', 'GET')).toBeNull()
    expect(getTierForRoute('/dashboard', 'GET')).toBeNull()
    expect(getTierForRoute('/engel-werden', 'GET')).toBeNull()
  })
})

// ── Core Rate-Limit-Logik ──

describe('checkRateLimit', () => {
  it('erlaubt Requests bis zum Limit', () => {
    const config = { max: 5, windowMs: 60_000 }
    for (let i = 0; i < 5; i++) {
      const result = checkRateLimit('test-key', config)
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(4 - i)
    }
  })

  it('blockiert den 6. Request innerhalb des Fensters', () => {
    const config = { max: 5, windowMs: 60_000 }
    for (let i = 0; i < 5; i++) {
      checkRateLimit('test-key', config)
    }
    const result = checkRateLimit('test-key', config)
    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
    expect(result.retryAfterSeconds).toBeGreaterThan(0)
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(60)
  })

  it('setzt Retry-After Header korrekt', () => {
    const config = { max: 5, windowMs: 60_000 }
    for (let i = 0; i < 6; i++) {
      checkRateLimit('retry-key', config)
    }
    const result = checkRateLimit('retry-key', config)
    expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(1)
  })

  it('isoliert Rate-Limits pro Key (User A beeinflusst User B nicht)', () => {
    const config = { max: 3, windowMs: 60_000 }

    for (let i = 0; i < 3; i++) {
      checkRateLimit('user-a', config)
    }
    const blockedA = checkRateLimit('user-a', config)
    expect(blockedA.allowed).toBe(false)

    const allowedB = checkRateLimit('user-b', config)
    expect(allowedB.allowed).toBe(true)
    expect(allowedB.remaining).toBe(2)
  })

  it('setzt Fenster nach Ablauf zurück', () => {
    const config = { max: 2, windowMs: 100 }

    checkRateLimit('window-key', config)
    checkRateLimit('window-key', config)
    const blocked = checkRateLimit('window-key', config)
    expect(blocked.allowed).toBe(false)

    return new Promise<void>(resolve => {
      setTimeout(() => {
        const after = checkRateLimit('window-key', config)
        expect(after.allowed).toBe(true)
        expect(after.remaining).toBe(1)
        resolve()
      }, 150)
    })
  })
})

// ── IP-Extraktion ──

describe('getClientIP', () => {
  it('extrahiert IP aus x-forwarded-for', () => {
    const req = makeRequest('/api/test', { ip: '1.2.3.4' })
    expect(getClientIP(req)).toBe('1.2.3.4')
  })

  it('nimmt die erste IP bei mehreren', () => {
    const req = new NextRequest('https://alltagsengel.care/api/test')
    req.headers.set('x-forwarded-for', '10.0.0.1, 192.168.1.1')
    expect(getClientIP(req)).toBe('10.0.0.1')
  })
})

// ── Middleware-Integration ──

describe('handleRateLimit', () => {
  it('gibt null für erlaubte Requests zurück', () => {
    const req = makeRequest('/api/clients', { ip: '1.1.1.1' })
    expect(handleRateLimit(req)).toBeNull()
  })

  it('gibt null für Nicht-API-Routen zurück', () => {
    const req = makeRequest('/dashboard')
    expect(handleRateLimit(req)).toBeNull()
  })

  it('gibt 429 nach Überschreitung zurück', () => {
    for (let i = 0; i < 5; i++) {
      handleRateLimit(makeRequest('/api/auth/login', { ip: '5.5.5.5', method: 'POST' }))
    }
    const response = handleRateLimit(makeRequest('/api/auth/login', { ip: '5.5.5.5', method: 'POST' }))
    expect(response).not.toBeNull()
    expect(response!.status).toBe(429)
    expect(response!.headers.get('Retry-After')).toBeTruthy()
    expect(response!.headers.get('X-RateLimit-Limit')).toBe('5')
    expect(response!.headers.get('X-RateLimit-Remaining')).toBe('0')
  })

  it('blockiert nicht bei normalem Dokumentations-Traffic (120 req/min)', () => {
    for (let i = 0; i < 100; i++) {
      const result = handleRateLimit(makeRequest('/api/service-records', {
        ip: '10.10.10.10',
        method: 'POST',
      }))
      expect(result).toBeNull()
    }
  })

  it('verwendet IP-basiertes Limiting für unauthentifizierte Auth-Requests', () => {
    for (let i = 0; i < 5; i++) {
      handleRateLimit(makeRequest('/api/auth/login', { ip: '9.9.9.9', method: 'POST' }))
    }

    const blocked = handleRateLimit(makeRequest('/api/auth/login', { ip: '9.9.9.9', method: 'POST' }))
    expect(blocked).not.toBeNull()
    expect(blocked!.status).toBe(429)

    const other = handleRateLimit(makeRequest('/api/auth/login', { ip: '8.8.8.8', method: 'POST' }))
    expect(other).toBeNull()
  })

  it('429-Antwort enthält deutschen Fehlertext', async () => {
    for (let i = 0; i < 6; i++) {
      handleRateLimit(makeRequest('/api/auth/login', { ip: '7.7.7.7', method: 'POST' }))
    }
    const response = handleRateLimit(makeRequest('/api/auth/login', { ip: '7.7.7.7', method: 'POST' }))
    const body = await response!.json()
    expect(body.error).toMatch(/Zu viele Anfragen/)
  })
})
