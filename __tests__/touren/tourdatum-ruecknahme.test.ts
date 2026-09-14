/**
 * PATCH /api/tours/[id] — die Rücknahme einer Datumsverschiebung
 *
 * Eine Tour trägt ein Datum, jeder ihrer Einsätze trägt es noch einmal
 * selbst (`assignments.assignment_date`). Verschiebt jemand die Tour, müssen
 * die Einsätze mitwandern — und wenn einer von ihnen dabei scheitert, müssen
 * ALLE zurück. Genau dieser Rückweg war der Befund.
 *
 * Zwei Asymmetrien, beide gegen die Produktion gemessen:
 *
 *  1. Der Hinweg prüft seinen Fehler und unterscheidet sogar die
 *     Doppelbelegung; der Rückweg schrieb ungeprüft. Live feuert
 *     `trg_check_assignment_overlap` auch auf UPDATE — die Rücknahme kann an
 *     genau dem Fehler scheitern, der sie ausgelöst hat. Die Antwort meldete
 *     trotzdem „die Tour wurde NICHT verschoben", während ein Teil der
 *     Einsätze am neuen Tag stehenblieb.
 *  2. Der Rückweg schrieb `bestand.tour_date` — das Datum der TOUR, nicht das
 *     des Einsatzes. `loeseStops` lässt einen Einsatz mit
 *     `assignment_date = NULL` in eine Tour (`a.assignment_date && …`), und
 *     die Spalte ist live nullable. Die Rücknahme hätte ihm ein Datum
 *     gegeben, das er nie hatte.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { erstelleFakeSupabase, type FakeAufruf } from '../helpers/supabase-fake'

const ORG = 'org-1'
const TOUR = 'tour-1'
const ALT = '2026-09-10'
const NEU = '2026-09-11'

const { mockRequireOpsAdmin, mockCreateAdminClient } = vi.hoisted(() => ({
  mockRequireOpsAdmin: vi.fn(),
  mockCreateAdminClient: vi.fn(),
}))

vi.mock('@/lib/ops/api-auth', () => ({ requireOpsAdmin: mockRequireOpsAdmin }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mockCreateAdminClient }))
vi.mock('@/lib/monitoring/tracker', () => ({ withTracking: (f: unknown) => f }))

import { PATCH } from '@/app/api/tours/[id]/route'

/** Vorwärtszug erkennen: nur er schreibt das NEUE Datum. */
function istHinweg(a: FakeAufruf): boolean {
  return a.tabelle === 'assignments' && a.operation === 'update'
    && (a.payload as { assignment_date?: string })?.assignment_date === NEU
}
function istRueckweg(a: FakeAufruf): boolean {
  return a.tabelle === 'assignments' && a.operation === 'update' && !istHinweg(a)
}

interface Fall {
  /** Einsätze der Tour: Kennung und ihr Datum VOR der Verschiebung. */
  einsaetze: { id: string; datum: string | null }[]
  /** Der wievielte Hinweg scheitert (ab 1) — 0 heißt: keiner. */
  hinwegFehlerBei?: number
  hinwegFehler?: { message: string; code?: string }
  /** Hinweg trifft null Zeilen (Einsatz zwischenzeitlich gelöscht). */
  hinwegLeerBei?: number
  vordatumFehler?: { message: string; code?: string }
  rueckwegFehlerFuer?: string[]
  rueckwegLeerFuer?: string[]
}

async function patch(fall: Fall) {
  let hinwege = 0
  const fake = erstelleFakeSupabase(a => {
    if (a.tabelle === 'tours' && a.operation === 'select') {
      return { data: { id: TOUR, status: 'GEPLANT', tour_date: ALT, caregiver_id: 'cg-1' } }
    }
    if (a.tabelle === 'tours' && a.operation === 'update') {
      return { data: { id: TOUR, tour_date: NEU } }
    }
    if (a.tabelle === 'tour_stops') {
      return {
        data: fall.einsaetze.map((e, i) => ({
          id: `stop-${i}`, assignment_id: e.id, status: 'GEPLANT',
        })),
      }
    }
    if (a.tabelle === 'assignments' && a.operation === 'select') {
      if (fall.vordatumFehler) return { error: fall.vordatumFehler }
      return { data: fall.einsaetze.map(e => ({ id: e.id, assignment_date: e.datum })) }
    }
    if (istHinweg(a)) {
      hinwege++
      if (fall.hinwegLeerBei === hinwege) return { data: [] }
      if (fall.hinwegFehlerBei === hinwege) {
        return { error: fall.hinwegFehler ?? { message: 'connection reset', code: '08006' } }
      }
      return { data: [{ id: 'x' }] }
    }
    if (istRueckweg(a)) {
      const id = a.filter.find(f => f.methode === 'eq' && f.spalte === 'id')?.wert as string
      if (fall.rueckwegFehlerFuer?.includes(id)) {
        return { error: { message: 'DOPPELBELEGUNG: Mitarbeiter hat bereits einen Termin' } }
      }
      if (fall.rueckwegLeerFuer?.includes(id)) return { data: [] }
      return { data: [{ id }] }
    }
    return {}
  })
  mockCreateAdminClient.mockReturnValue(fake.client)
  const req = new Request(`http://test/api/tours/${TOUR}`, {
    method: 'PATCH',
    body: JSON.stringify({ tour_date: NEU }),
  })
  const res = await PATCH(req as never, { params: Promise.resolve({ id: TOUR }) } as never)
  return { status: res.status, body: await res.json(), fake }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireOpsAdmin.mockResolvedValue({
    ok: true, ctx: { organizationId: ORG, userId: 'user-1', role: 'admin' },
  })
})

describe('Verschieben: der Hinweg', () => {
  it('bewegt jeden offenen Einsatz auf das neue Datum', async () => {
    const { status, fake } = await patch({
      einsaetze: [{ id: 'a', datum: ALT }, { id: 'b', datum: ALT }],
    })
    expect(status).toBe(200)
    expect(fake.aufrufe.filter(istHinweg)).toHaveLength(2)
    expect(fake.aufrufe.filter(istRueckweg)).toHaveLength(0)
  })

  it('liest die alten Daten, BEVOR der erste Einsatz bewegt wird', async () => {
    // Danach wären sie nicht mehr zu bekommen — der Rückweg hätte kein Ziel.
    const { fake } = await patch({ einsaetze: [{ id: 'a', datum: ALT }] })
    const lesen = fake.auf('assignments').find(a => a.operation === 'select')
    const ersterHinweg = fake.aufrufe.find(istHinweg)
    expect(lesen).toBeDefined()
    expect(ersterHinweg).toBeDefined()
    expect(lesen!.gesamtNr).toBeLessThan(ersterHinweg!.gesamtNr)
  })

  it('verschiebt gar nichts, wenn die alten Daten nicht lesbar sind', async () => {
    const { status, body, fake } = await patch({
      einsaetze: [{ id: 'a', datum: ALT }],
      vordatumFehler: { message: 'connection reset', code: '08006' },
    })
    expect(status).toBe(500)
    expect(body.error).toMatch(/NICHT verschoben/)
    expect(fake.aufrufe.filter(istHinweg)).toHaveLength(0)
  })

  it('behandelt null getroffene Zeilen als Fehlschlag, nicht als Erfolg', async () => {
    const { status, body, fake } = await patch({
      einsaetze: [{ id: 'a', datum: ALT }, { id: 'b', datum: ALT }],
      hinwegLeerBei: 2,
    })
    expect(status).toBe(500)
    expect(body.error).toMatch(/existiert nicht mehr/)
    // Und der erste, der schon stand, kommt zurück.
    expect(fake.aufrufe.filter(istRueckweg)).toHaveLength(1)
  })
})

describe('Verschieben: die Rücknahme', () => {
  it('schreibt das Datum des EINSATZES zurück, nicht das der Tour', async () => {
    // Der Einsatz lag auf einem anderen Tag als seine Tour. Die alte
    // Rücknahme hätte ihm `bestand.tour_date` gegeben.
    const { fake } = await patch({
      einsaetze: [{ id: 'a', datum: '2026-08-01' }, { id: 'b', datum: ALT }],
      hinwegFehlerBei: 2,
    })
    const zurueck = fake.aufrufe.filter(istRueckweg)
    expect(zurueck).toHaveLength(1)
    expect((zurueck[0].payload as { assignment_date: string }).assignment_date).toBe('2026-08-01')
  })

  it('gibt einem Einsatz ohne Datum sein NULL zurück, nicht das Tourdatum', async () => {
    const { fake } = await patch({
      einsaetze: [{ id: 'a', datum: null }, { id: 'b', datum: ALT }],
      hinwegFehlerBei: 2,
    })
    const zurueck = fake.aufrufe.filter(istRueckweg)
    expect(zurueck).toHaveLength(1)
    expect((zurueck[0].payload as { assignment_date: string | null }).assignment_date).toBeNull()
  })

  it('meldet die Doppelbelegung des Hinwegs als 409', async () => {
    const { status, body } = await patch({
      einsaetze: [{ id: 'a', datum: ALT }, { id: 'b', datum: ALT }],
      hinwegFehlerBei: 2,
      hinwegFehler: { message: 'DOPPELBELEGUNG: Termin kollidiert' },
    })
    expect(status).toBe(409)
    expect(body.error).toMatch(/kollidierenden Termin/)
    expect(body.error).not.toMatch(/ACHTUNG/)
  })

  it('nennt den Rückstand, wenn die Rücknahme selbst an der Doppelbelegung scheitert', async () => {
    const { status, body } = await patch({
      einsaetze: [{ id: 'a', datum: ALT }, { id: 'b', datum: ALT }, { id: 'c', datum: ALT }],
      hinwegFehlerBei: 3,
      rueckwegFehlerFuer: ['a'],
    })
    expect(status).toBe(500)
    expect(body.error).toMatch(/ACHTUNG/)
    expect(body.error).toContain('a')
    expect(body.error).toMatch(new RegExp(`weiterhin am ${NEU}`))
    expect(body.error).toMatch(/Ein Einsatz steht/)
  })

  it('zählt auch eine Rücknahme ohne getroffene Zeile zum Rückstand', async () => {
    const { body } = await patch({
      einsaetze: [{ id: 'a', datum: ALT }, { id: 'b', datum: ALT }, { id: 'c', datum: ALT }],
      hinwegFehlerBei: 3,
      rueckwegLeerFuer: ['a', 'b'],
    })
    expect(body.error).toMatch(/ACHTUNG/)
    expect(body.error).toMatch(/2 Einsätze stehen/)
  })

  it('schweigt über einen Rückstand, den es nicht gibt', async () => {
    const { body } = await patch({
      einsaetze: [{ id: 'a', datum: ALT }, { id: 'b', datum: ALT }],
      hinwegFehlerBei: 2,
    })
    expect(body.error).not.toMatch(/ACHTUNG/)
    expect(body.error).toMatch(/NICHT verschoben/)
  })

  it('holt jeden bereits bewegten Einsatz zurück, nicht nur den letzten', async () => {
    const { fake } = await patch({
      einsaetze: [
        { id: 'a', datum: ALT }, { id: 'b', datum: ALT },
        { id: 'c', datum: ALT }, { id: 'd', datum: ALT },
      ],
      hinwegFehlerBei: 4,
    })
    const ids = fake.aufrufe.filter(istRueckweg)
      .map(a => a.filter.find(f => f.spalte === 'id')?.wert)
    expect(ids).toEqual(['a', 'b', 'c'])
  })
})

describe('Quelltext: die alte Form darf nicht zurückkehren', () => {
  const quelle = readFileSync(
    join(process.cwd(), 'app/api/tours/[id]/route.ts'), 'utf8',
  )

  it('schreibt nirgends bestand.tour_date auf einen Einsatz', () => {
    expect(quelle).not.toMatch(/assignment_date:\s*bestand\.tour_date/)
  })

  it('prüft jede Rücknahme auf Fehler UND getroffene Zeilen', () => {
    const rumpf = quelle.slice(
      quelle.indexOf('async function nimmVerschiebungZurueck'),
      quelle.indexOf('function berichteRueckstand'),
    )
    expect(rumpf).toContain('.select(\'id\')')
    expect(rumpf).toMatch(/if \(error \|\| \(data \?\? \[\]\)\.length === 0\)/)
  })
})
