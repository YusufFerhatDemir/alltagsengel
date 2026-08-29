/**
 * Das Korrekturprotokoll ist quotiert — und ein unbrauchbares `limit` wird
 * abgewiesen, nicht verworfen.
 *
 * BEFUND (29.08.2026): `/api/personal/arbeitszeiten/korrekturen` reichte
 * `limit` ungeprüft aus der Adresszeile durch:
 *
 *     const limit = sp.get('limit') ? Number(sp.get('limit')) : undefined
 *
 * Zwei Dinge daran. Erstens fehlte ohne `limit` jede Begrenzung —
 * `personal_zeitkorrekturen` ist ein Revisionsprotokoll, es wächst mit jeder
 * Korrektur und wird nie kleiner. Eine Ansicht ohne Deckel wird also mit der
 * Zeit von selbst zum Problem, ohne dass sich am Code etwas ändert. Live
 * fiel es nicht auf, weil `personal_arbeitszeiten` 0 Zeilen trägt — das ist
 * eine Aussage über den Bestand, nicht über den Code.
 *
 * Zweitens: `Number('viele')` ist `NaN` und damit falsy. Aus einem
 * offensichtlich fehlerhaften `?limit=viele` wurde stillschweigend „keine
 * Begrenzung" — das GEGENTEIL dessen, was der Aufrufer wollte, ohne ein
 * Wort darüber. Dieselbe Klasse wie die stille Feldverwerfung zwischen
 * Oberfläche und Schnittstelle: unbekannte Eingabe abweisen, nie verwerfen.
 *
 * Geprüft wird der Handler im LAUF, nicht sein Quelltext: ob eine Grenze im
 * Code steht, sagt nichts darüber, ob sie an der Abfrage ankommt.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const ORG = '11111111-1111-4111-8111-111111111111'

/** Aufzeichnung dessen, was `listZeitkorrekturen` tatsächlich bekommen hat. */
let zuletzt: Record<string, unknown> | null = null

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({}) as never),
}))

vi.mock('@/lib/personal/api-auth', () => ({
  requirePersonalAdmin: vi.fn(async () => ({
    ok: true as const,
    ctx: { organizationId: ORG, userId: 'pdl-1', name: 'PDL', rolle: 'pdl' },
  })),
}))

vi.mock('@/lib/personal/zeitkorrekturen', () => ({
  listZeitkorrekturen: vi.fn(async (_s: unknown, filter: Record<string, unknown>) => {
    zuletzt = filter
    return []
  }),
}))

const { GET } = await import('@/app/api/personal/arbeitszeiten/korrekturen/route')

/**
 * `NextRequest`, nicht `Request`: der Handler liest `req.nextUrl`, das ein
 * einfaches `Request` nicht hat. Mit `Request` lief jeder Aufruf in den
 * Fehlerpfad und antwortete 500 — die Zusicherungen wären an einer Stelle
 * fehlgeschlagen, die mit dem Prüfgegenstand nichts zu tun hat.
 */
function anfrage(query = '') {
  return new NextRequest(`http://localhost/api/personal/arbeitszeiten/korrekturen${query}`)
}

beforeEach(() => { zuletzt = null })

describe('Korrekturprotokoll — Quotierung', () => {
  it('begrenzt auch ohne Angabe', async () => {
    const res = await GET(anfrage() as never)
    expect(res.status).toBe(200)
    // Der Punkt: NICHT undefined. Ohne Grenze läuft die Abfrage über das
    // ganze Protokoll, und das wächst monoton.
    expect(typeof zuletzt!.limit).toBe('number')
    expect(zuletzt!.limit).toBeGreaterThan(0)
  })

  it('übernimmt eine gültige Angabe unverändert', async () => {
    await GET(anfrage('?limit=25') as never)
    expect(zuletzt!.limit).toBe(25)
  })

  it('weist eine unbrauchbare Angabe ab, statt sie zu verwerfen', async () => {
    // Der eigentliche Befund: früher wurde daraus „keine Begrenzung".
    const res = await GET(anfrage('?limit=viele') as never)
    expect(res.status).toBe(400)
    // Und der Handler darf gar nicht erst abgefragt haben.
    expect(zuletzt).toBeNull()
  })

  it('weist 0 und negative Werte ab', async () => {
    for (const wert of ['0', '-5']) {
      const res = await GET(anfrage(`?limit=${wert}`) as never)
      expect(res.status, `limit=${wert}`).toBe(400)
    }
  })

  it('weist eine Kommazahl ab', async () => {
    // `Number('10.5')` ist eine gültige Zahl und ginge sonst als Grenze
    // durch — PostgREST müsste sie dann selbst deuten.
    const res = await GET(anfrage('?limit=10.5') as never)
    expect(res.status).toBe(400)
  })

  it('weist eine Angabe über der Obergrenze ab, statt sie leise zu kappen', async () => {
    // Leises Kappen wäre die schlechtere Antwort: der Aufrufer bekäme
    // weniger Zeilen als verlangt und hielte das Ergebnis für vollständig.
    const res = await GET(anfrage('?limit=100000') as never)
    expect(res.status).toBe(400)
    expect(await res.json()).toHaveProperty('error')
  })

  it('reicht den Mandanten aus dem Auth-Kontext durch, nicht aus der Adresszeile', async () => {
    await GET(anfrage('?organizationId=fremde-org') as never)
    expect(zuletzt!.organizationId).toBe(ORG)
  })

  it('reicht die Filter auf Mitarbeiter und Arbeitszeit durch', async () => {
    await GET(anfrage('?caregiverId=cg-1&arbeitszeitId=az-1') as never)
    expect(zuletzt!.caregiverId).toBe('cg-1')
    expect(zuletzt!.arbeitszeitId).toBe('az-1')
  })
})
