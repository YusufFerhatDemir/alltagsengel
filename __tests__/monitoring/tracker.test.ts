/**
 * withTracking — misst, ohne sich einzumischen
 * ═══════════════════════════════════════════════════════════════════
 *
 * Der Wrapper liegt seit dem Verdrahten in JEDEM Handler des Hauses.
 * Damit ist er die einzige Stelle, an der ein Fehler gleichzeitig alle
 * 400+ Routen kippen kann. Die Zusicherungen hier sind deshalb nicht
 * „misst richtig", sondern vor allem „richtet nie Schaden an".
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { withTracking } from '@/lib/monitoring/tracker'
import { getMetrics, resetMetrics } from '@/lib/monitoring/metrics'

function anfrage(url: string, method = 'GET'): Request {
  return new Request(url, { method })
}

describe('withTracking', () => {
  beforeEach(() => resetMetrics())

  it('gibt die Antwort des Handlers unveraendert zurueck', async () => {
    const original = Response.json({ wert: 42 })
    const GET = withTracking(async () => original)

    const antwort = await GET(anfrage('https://alltagsengel.care/api/test'))

    expect(antwort).toBe(original)
    expect(await antwort.json()).toEqual({ wert: 42 })
  })

  it('reicht alle Argumente durch — auch den Next-Kontext', async () => {
    const gesehen: unknown[] = []
    const PATCH = withTracking(
      async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
        gesehen.push(req, await ctx.params)
        return new Response('ok')
      },
    )

    await PATCH(
      anfrage('https://alltagsengel.care/api/vitals/abc', 'PATCH'),
      { params: Promise.resolve({ id: 'abc' }) },
    )

    expect(gesehen[1]).toEqual({ id: 'abc' })
  })

  it('schreibt Pfad, Methode und Status in den Buffer', async () => {
    const POST = withTracking(async () => new Response('', { status: 201 }))
    await POST(anfrage('https://alltagsengel.care/api/rechnungen?seite=2', 'POST'))

    const { endpoints, totalRequests } = getMetrics()
    expect(totalRequests).toBe(1)
    // Der Query-String gehoert nicht in den Pfad — sonst ist jede Anfrage
    // ein eigener Endpunkt und die Perzentile sind wertlos.
    expect(endpoints[0].path).toBe('/api/rechnungen')
    expect(endpoints[0].count).toBe(1)
    expect(endpoints[0].errors).toBe(0)
  })

  it('zaehlt einen 500er als Fehler, einen 403er nicht', async () => {
    const kaputt = withTracking(async () => new Response('', { status: 500 }))
    const verboten = withTracking(async () => new Response('', { status: 403 }))

    await kaputt(anfrage('https://alltagsengel.care/api/a'))
    await verboten(anfrage('https://alltagsengel.care/api/b'))

    const { totalErrors, totalRequests } = getMetrics()
    expect(totalRequests).toBe(2)
    // 403 ist eine funktionierende Schranke, kein Ausfall.
    expect(totalErrors).toBe(1)
  })

  it('misst einen geworfenen Fehler als 500 — und wirft ihn weiter', async () => {
    const GET = withTracking(async () => { throw new Error('DB weg') })

    await expect(GET(anfrage('https://alltagsengel.care/api/c')))
      .rejects.toThrow('DB weg')

    const { endpoints, totalErrors } = getMetrics()
    expect(totalErrors).toBe(1)
    expect(endpoints[0].path).toBe('/api/c')
  })

  it('kippt die Antwort NICHT, wenn der Request unbrauchbar ist', async () => {
    // Der gefaehrlichste Fall: die Messung liegt im finally jedes
    // Handlers. Wirft sie, wird aus einer 200er-Antwort ein 500er —
    // das Monitoring wuerde die Anwendung kaputtmachen, die es
    // ueberwachen soll.
    const GET = withTracking(async () => Response.json({ ok: true }))

    const antwort = await (GET as unknown as (a: unknown) => Promise<Response>)(
      { url: 'kein-gueltiger-url', method: 'GET' },
    )
    expect(antwort.status).toBe(200)

    const ohneAlles = await (GET as unknown as (a: unknown) => Promise<Response>)(undefined)
    expect(ohneAlles.status).toBe(200)

    // Gemessen wurde trotzdem — nur eben ohne verwertbaren Pfad.
    expect(getMetrics().totalRequests).toBe(2)
  })
})
