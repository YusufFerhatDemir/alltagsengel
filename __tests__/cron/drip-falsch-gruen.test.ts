/**
 * Block 30 — der Drip-Cron meldete Erfolg, ohne hinzusehen.
 *
 * BEFUND (14.09.2026): `app/api/cron/drip` leitet an `/api/drip` weiter
 * und gab danach bedingungslos
 *
 *     return NextResponse.json({ success: true, ... })
 *
 * zurueck. `response.ok` wurde nie geprueft. Antwortete /api/drip mit 401
 * (falsches Geheimnis), 500 (RESEND_API_KEY fehlt) oder 503, verbuchte
 * Vercel trotzdem einen gruenen Cron — eine Kampagne, die nichts
 * versendet, sah aus wie eine, die alles versendet hat.
 *
 * Das wiegt hier besonders, weil CRON_SECRET noch nicht gesetzt ist: der
 * allererste scharfe Lauf ist genau der, bei dem man einen Fehlschlag
 * sehen will.
 *
 * Alle anderen Cron-Routen machen es richtig — `indexnow` prueft `.ok`,
 * `zustellung-retry` reicht `ok: ergebnis.ok` durch. Diese war die
 * einzige Ausnahme.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('@/lib/api/cron-auth', () => ({
  pruefeCronGeheimnis: () => null,
  cronAuthHeader: () => 'Bearer test-geheimnis',
}))

const ANFRAGE = () => new Request('https://alltagsengel.care/api/cron/drip')

function antwort(status: number, rumpf: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => rumpf,
  } as unknown as Response
}

describe('Cron /api/cron/drip — Fehlschlag der Weiterleitung', () => {
  const echtesFetch = globalThis.fetch

  beforeEach(() => { vi.resetModules() })
  afterEach(() => { globalThis.fetch = echtesFetch })

  it('meldet 502 statt success, wenn die Kampagne abweist (401)', async () => {
    globalThis.fetch = vi.fn(async () => antwort(401, { error: 'Nicht autorisiert.' })) as never
    const { GET } = await import('@/app/api/cron/drip/route')

    const res = await GET(ANFRAGE() as never)
    const rumpf = await res.json()

    expect(res.status).toBe(502)
    expect(rumpf.success).toBe(false)
    expect(rumpf.status).toBe(401)
    expect(rumpf.grund).toMatch(/nichts versendet/)
  })

  it('meldet 502 auch bei 500 — fehlender RESEND_API_KEY ist kein Erfolg', async () => {
    globalThis.fetch = vi.fn(async () => antwort(500, { error: 'RESEND_API_KEY nicht konfiguriert' })) as never
    const { GET } = await import('@/app/api/cron/drip/route')

    const res = await GET(ANFRAGE() as never)
    expect(res.status).toBe(502)
    expect((await res.json()).success).toBe(false)
  })

  it('meldet weiterhin Erfolg, wenn die Kampagne durchläuft', async () => {
    globalThis.fetch = vi.fn(async () => antwort(200, { sent: { day3: 2, day7: 0, day14: 1 } })) as never
    const { GET } = await import('@/app/api/cron/drip/route')

    const res = await GET(ANFRAGE() as never)
    const rumpf = await res.json()

    expect(res.status).toBe(200)
    expect(rumpf.success).toBe(true)
    expect(rumpf.result.sent.day3).toBe(2)
  })

  it('erstickt nicht an einer Antwort ohne JSON-Rumpf', async () => {
    // Ein 502 vom Vercel-Edge hat keinen JSON-Koerper. Vorher waere
    // response.json() geworfen und der Lauf im catch gelandet — mit
    // einer Meldung ueber den Parser statt ueber den Fehlschlag.
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 502,
      json: async () => { throw new SyntaxError('Unexpected token <') },
    })) as never
    const { GET } = await import('@/app/api/cron/drip/route')

    const res = await GET(ANFRAGE() as never)
    const rumpf = await res.json()

    expect(res.status).toBe(502)
    expect(rumpf.success).toBe(false)
    expect(rumpf.result).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════
// Systemischer Riegel: keine zweite Route darf denselben Fehler machen
// ═══════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

describe('Alle Cron-Routen', () => {
  const cronWurzel = join(__dirname, '..', '..', 'app', 'api', 'cron')
  const routen = readdirSync(cronWurzel, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => ({ name: e.name, pfad: join(cronWurzel, e.name, 'route.ts') }))

  it('sind vollständig (12 Zeitpläne in vercel.json)', () => {
    const vercel = JSON.parse(readFileSync(join(__dirname, '..', '..', 'vercel.json'), 'utf8'))
    const geplant: string[] = vercel.crons.map((c: { path: string }) => c.path.replace('/api/cron/', ''))
    for (const p of geplant) {
      expect(routen.map(r => r.name), `Zeitplan ohne Route: ${p}`).toContain(p)
    }
    expect(geplant.length).toBe(12)
  })

  it('tragen ausnahmslos pruefeCronGeheimnis', () => {
    // Ein selbst gebautes `Bearer ${CRON_SECRET}` ist bei fehlender
    // Variable „Bearer undefined" — und passt damit auf jeden Aufrufer.
    for (const r of routen) {
      const quelle = readFileSync(r.pfad, 'utf8')
      expect(quelle, `${r.name} ohne pruefeCronGeheimnis`).toMatch(/pruefeCronGeheimnis/)
    }
  })

  it('prüfen response.ok, wo sie intern weiterleiten', () => {
    // Genau der Befund aus Block 30. Eine Weiterleitung, deren Status
    // niemand ansieht, macht aus jedem Fehlschlag einen grünen Cron.
    for (const r of routen) {
      const quelle = readFileSync(r.pfad, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
      if (!/await fetch\(/.test(quelle)) continue
      expect(quelle, `${r.name} leitet weiter, ohne den Status zu prüfen`).toMatch(/\.ok\b/)
    }
  })
})
