// ═══════════════════════════════════════════════════════════════════════
// Master-Final-Release-Audit 2026-08-19, Befund B-2 / I-6
//
// /api/visitor-alert ist unauthentifiziert, nutzt createAdminClient(),
// versendet Mail und legt Notifications an. Der Schutz war ein Zaehler
// im Modul-Scope — also PRO Serverless-Instanz und damit umgehbar.
//
// Geprueft: der Limiter fragt wirklich die DB-RPC, wertet sie korrekt
// aus und faellt bei fehlender Migration nachvollziehbar zurueck.
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

let rpcAntwort: { data: any; error: { message: string } | null } = { data: true, error: null }
let rpcAufrufe: Array<{ name: string; args: any }> = []
let werfeBeimClientAufbau = false

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    if (werfeBeimClientAufbau) throw new Error('SUPABASE_SERVICE_ROLE_KEY fehlt')
    return {
      rpc: async (name: string, args: any) => {
        rpcAufrufe.push({ name, args })
        return rpcAntwort
      },
    }
  },
}))

import { rateLimitPersistent } from '@/lib/rate-limit-persistent'

beforeEach(() => {
  rpcAntwort = { data: true, error: null }
  rpcAufrufe = []
  werfeBeimClientAufbau = false
  vi.restoreAllMocks()
})

describe('rateLimitPersistent — DB-Pfad', () => {
  it('ruft die RPC api_rate_limit_hit mit Sekunden-Fenster auf', async () => {
    await rateLimitPersistent('visitor-alert:ip:1.2.3.4', 20, 60_000)
    expect(rpcAufrufe).toHaveLength(1)
    expect(rpcAufrufe[0].name).toBe('api_rate_limit_hit')
    expect(rpcAufrufe[0].args).toEqual({
      p_key: 'visitor-alert:ip:1.2.3.4',
      p_limit: 20,
      p_window_seconds: 60,
    })
  })

  it('rundet Millisekunden-Fenster auf volle Sekunden auf', async () => {
    await rateLimitPersistent('k', 1, 1500)
    expect(rpcAufrufe[0].args.p_window_seconds).toBe(2)
    rpcAufrufe = []
    await rateLimitPersistent('k', 1, 10)
    expect(rpcAufrufe[0].args.p_window_seconds).toBe(1)
  })

  it('gibt true zurueck, wenn die RPC true liefert', async () => {
    rpcAntwort = { data: true, error: null }
    await expect(rateLimitPersistent('k', 5, 60_000)).resolves.toBe(true)
  })

  it('gibt false zurueck, wenn die RPC false liefert', async () => {
    rpcAntwort = { data: false, error: null }
    await expect(rateLimitPersistent('k', 5, 60_000)).resolves.toBe(false)
  })

  it('wertet einen Vertragsbruch (kein boolean) als "nicht erlaubt"', async () => {
    for (const kaputt of [null, undefined, 'true', 1, {}]) {
      rpcAntwort = { data: kaputt, error: null }
      await expect(rateLimitPersistent('k', 5, 60_000)).resolves.toBe(false)
    }
  })
})

describe('rateLimitPersistent — Fallback ohne Migration', () => {
  it('faellt bei RPC-Fehler auf den In-Memory-Limiter zurueck und warnt', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    rpcAntwort = { data: null, error: { message: 'function public.api_rate_limit_hit does not exist' } }

    const schluessel = `fallback-${Math.random()}`
    // In-Memory-Limiter: Limit 2 → zwei erlaubt, dritter geblockt
    expect(await rateLimitPersistent(schluessel, 2, 60_000)).toBe(true)
    expect(await rateLimitPersistent(schluessel, 2, 60_000)).toBe(true)
    expect(await rateLimitPersistent(schluessel, 2, 60_000)).toBe(false)

    expect(spy.mock.calls.some(c => String(c[0]).includes('Fallback auf In-Memory'))).toBe(true)
  })

  it('faellt auch zurueck, wenn schon der Admin-Client nicht aufgebaut werden kann', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    werfeBeimClientAufbau = true
    await expect(rateLimitPersistent(`aufbau-${Math.random()}`, 1, 60_000)).resolves.toBe(true)
  })

  it('warnt nur einmal pro Instanz, nicht pro Request', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    rpcAntwort = { data: null, error: { message: 'boom' } }
    for (let i = 0; i < 5; i++) await rateLimitPersistent(`spam-${i}`, 10, 60_000)
    const warnungen = spy.mock.calls.filter(c => String(c[0]).includes('Fallback auf In-Memory'))
    expect(warnungen.length).toBeLessThanOrEqual(1)
  })
})

describe('visitor-alert nutzt den persistenten Limiter', () => {
  const quelle = fs.readFileSync(
    path.join(__dirname, '..', '..', 'app', 'api', 'visitor-alert', 'route.ts'),
    'utf-8',
  )

  it('haelt keinen Zaehler mehr im Modul-Scope', () => {
    // Genau das war der Befund: `const lastAlerts = new Map()` pro Instanz.
    expect(quelle).not.toMatch(/new Map<[^>]*>\(\)/)
    expect(quelle).not.toContain('lastAlerts')
  })

  it('limitiert Aufrufer-IP und Cooldown ueber den persistenten Limiter', () => {
    expect(quelle).toContain('rateLimitPersistent(`visitor-alert:ip:')
    expect(quelle).toContain('rateLimitPersistent(`visitor-alert:cooldown:')
  })

  it('await-et beide Limiter-Aufrufe', () => {
    const aufrufe = quelle.match(/rateLimitPersistent\(/g) ?? []
    const awaited = quelle.match(/await rateLimitPersistent\(/g) ?? []
    expect(aufrufe.length).toBeGreaterThan(0)
    expect(awaited.length).toBe(aufrufe.length)
  })
})
