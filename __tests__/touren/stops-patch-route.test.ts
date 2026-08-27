/**
 * PATCH /api/tours/[id]/stops — Stop und Einsatz laufen nicht auseinander
 *
 * Der Stop ordnet nur an; die Wahrheit für Kalender, Doppelbelegungs-Trigger
 * und Abrechnung steht im verknüpften `assignment`. Geprüft wird hier, dass
 * beide zusammenbleiben — jeder dieser Fälle war vorher offen:
 *
 *  1. Schlug das Zurückschreiben der Zeiten auf den Einsatz aus einem anderen
 *     Grund als DOPPELBELEGUNG fehl, wurde der Fehler VERSCHLUCKT: der Stop
 *     trug danach die neue Zeit, der Einsatz die alte.
 *  2. `reihenfolge: [A, A]` kam durch die Prüfung (Länge stimmte, jede ID war
 *     bekannt) und zerlegte die Positionen.
 *  3. Ein Stop ließ sich von AUSGEFALLEN zurück auf GEPLANT setzen, ohne dass
 *     sein stornierter Einsatz zurückkam.
 *  4. Stops einer STORNIERTEN Tour ließen sich weiter ändern.
 *
 * Statuscodes: Eingabefehler (unlesbare Uhrzeit, Spanne ohne Dauer) → 400,
 * Zustandskonflikte (Statuswechsel, geschlossene Tour) → 409. Der Code steckt
 * im UserFacingError selbst, damit jeder Aufrufer denselben bekommt.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const ORG = 'org-1'
const TOUR = 'tour-1'
const STOP = 'stop-1'
const ASSIGNMENT = 'assignment-1'

const { mockRequireOpsAdmin, mockCreateAdminClient } = vi.hoisted(() => ({
  mockRequireOpsAdmin: vi.fn(),
  mockCreateAdminClient: vi.fn(),
}))

vi.mock('@/lib/ops/api-auth', () => ({ requireOpsAdmin: mockRequireOpsAdmin }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mockCreateAdminClient }))

import { PATCH } from '@/app/api/tours/[id]/stops/route'

// ── Zustandsbehafteter PostgREST-Doppelgänger ──────────────────────
type Zeile = Record<string, any>
interface Aufruf { tabelle: string; op: string; werte?: Zeile; filter: [string, string, any][] }

interface FakeOptionen {
  /** Fehler je (Tabelle, Operation) — für die Fehlerpfade. */
  fehler?: (a: Aufruf) => { message: string; code?: string } | null
}

function fakeDb(state: Record<string, Zeile[]>, optionen: FakeOptionen = {}) {
  const aufrufe: Aufruf[] = []

  function passt(row: Zeile, [art, feld, wert]: [string, string, any]): boolean {
    if (art === 'eq') return row[feld] === wert
    if (art === 'in') return (wert as any[]).includes(row[feld])
    if (art === 'is') return row[feld] === wert || (wert === null && row[feld] == null)
    if (art === 'notIn') return !(wert as any[]).includes(row[feld])
    return true
  }

  const client: any = {
    aufrufe,
    from(tabelle: string) {
      const a: Aufruf = { tabelle, op: 'select', filter: [] }
      aufrufe.push(a)
      let sortierung: { feld: string; auf: boolean } | null = null
      let grenze: number | null = null

      const kette: any = {
        select() { return kette },
        update(werte: Zeile) { a.op = 'update'; a.werte = werte; return kette },
        insert(werte: Zeile) { a.op = 'insert'; a.werte = werte; return kette },
        delete() { a.op = 'delete'; return kette },
        eq(f: string, w: any) { a.filter.push(['eq', f, w]); return kette },
        in(f: string, w: any[]) { a.filter.push(['in', f, w]); return kette },
        is(f: string, w: any) { a.filter.push(['is', f, w]); return kette },
        not(f: string, _op: string, liste: string) {
          a.filter.push(['notIn', f, liste.replace(/[()]/g, '').split(',')])
          return kette
        },
        order(feld: string, opt?: { ascending?: boolean }) {
          sortierung = { feld, auf: opt?.ascending !== false }; return kette
        },
        limit(n: number) { grenze = n; return kette },
        single() { return Promise.resolve(lauf(true)) },
        maybeSingle() { return Promise.resolve(lauf(true, true)) },
        then(aufloesen: any) { return Promise.resolve(aufloesen(lauf(false))) },
      }

      function lauf(einzeln: boolean, weich = false) {
        const fehler = optionen.fehler?.(a) ?? null
        if (fehler) return { data: null, error: fehler }

        const rows = state[tabelle] ?? []
        let treffer = rows.filter(r => a.filter.every(f => passt(r, f)))
        if (sortierung) {
          const s = sortierung as { feld: string; auf: boolean }
          treffer = [...treffer].sort((x, y) =>
            (x[s.feld] > y[s.feld] ? 1 : -1) * (s.auf ? 1 : -1))
        }
        if (grenze !== null) treffer = treffer.slice(0, grenze)

        if (a.op === 'update') {
          for (const r of treffer) Object.assign(r, a.werte)
        }
        if (a.op === 'delete') {
          state[tabelle] = rows.filter(r => !treffer.includes(r))
        }
        if (einzeln) {
          const eins = treffer[0] ?? null
          if (!eins && !weich) {
            return { data: null, error: { message: 'no rows', code: 'PGRST116' } }
          }
          return { data: eins, error: null }
        }
        return { data: treffer, error: null }
      }

      return kette
    },
  }
  return client
}

function grundzustand(over: { tourStatus?: string; stopStatus?: string } = {}) {
  return {
    tours: [{
      id: TOUR, organization_id: ORG, caregiver_id: 'cg-1', tour_date: '2026-09-10',
      status: over.tourStatus ?? 'GEPLANT',
      caregivers: { first_name: 'Sabrina', last_name: 'Martin', initials: 'S.M.', zip_code: '60311' },
    }],
    tour_stops: [{
      id: STOP, tour_id: TOUR, assignment_id: ASSIGNMENT, client_id: 'kl-1', position: 1,
      geplante_ankunft: '08:00:00', geplantes_ende: '09:00:00',
      status: over.stopStatus ?? 'GEPLANT', service_record_id: null, plz: '60311',
      fahrzeit_minuten: null, distanz_km: null, notes: null,
      tatsaechliche_ankunft: null, tatsaechliches_ende: null, adresse: 'Weg 1',
    }],
    assignments: [{
      id: ASSIGNMENT, caregiver_id: 'cg-1', client_id: 'kl-1',
      assignment_date: '2026-09-10', start_time: '08:00:00', end_time: '09:00:00',
      status: 'GEPLANT',
    }],
  }
}

async function patch(db: any, body: unknown) {
  mockCreateAdminClient.mockReturnValue(db)
  const req = new Request('http://test/api/tours/tour-1/stops', {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
  const res = await PATCH(req as any, { params: Promise.resolve({ id: TOUR }) } as any)
  return { status: res.status, body: await res.json() }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireOpsAdmin.mockResolvedValue({
    ok: true, ctx: { organizationId: ORG, userId: 'user-1', role: 'admin' },
  })
})

describe('Zeiten: Stop und Einsatz bleiben zusammen', () => {
  it('schreibt die neue Zeit auf beide', async () => {
    const state = grundzustand()
    const db = fakeDb(state)
    const res = await patch(db, { stop_id: STOP, geplante_ankunft: '10:00', geplantes_ende: '11:00' })
    expect(res.status).toBe(200)
    expect(state.assignments[0].start_time).toBe('10:00')
    expect(state.assignments[0].end_time).toBe('11:00')
    expect(state.tour_stops[0].geplante_ankunft).toBe('10:00')
  })

  it('schreibt den Einsatz VOR dem Stop', async () => {
    // Reihenfolge ist die eigentliche Zusage: scheitert der Einsatz, ist der
    // Stop noch unberührt und braucht keine Rücknahme (die selbst scheitern
    // könnte).
    const db = fakeDb(grundzustand())
    await patch(db, { stop_id: STOP, geplante_ankunft: '10:00', geplantes_ende: '11:00' })
    const schreibende = db.aufrufe.filter((a: Aufruf) => a.op === 'update')
    expect(schreibende[0].tabelle).toBe('assignments')
    expect(schreibende.find((a: Aufruf) => a.tabelle === 'tour_stops')).toBeDefined()
  })

  it('lässt den Stop unverändert, wenn der Einsatz nicht geschrieben werden kann', async () => {
    const state = grundzustand()
    const db = fakeDb(state, {
      fehler: a => (a.tabelle === 'assignments' && a.op === 'update')
        ? { message: 'connection reset', code: '08006' } : null,
    })
    const res = await patch(db, { stop_id: STOP, geplante_ankunft: '10:00', geplantes_ende: '11:00' })
    expect(res.status).toBe(500)
    expect(res.body.error).toMatch(/NICHT geändert/)
    expect(state.tour_stops[0].geplante_ankunft).toBe('08:00:00')
    expect(state.assignments[0].start_time).toBe('08:00:00')
  })

  it('meldet eine Doppelbelegung als 409 und ändert nichts', async () => {
    const state = grundzustand()
    const db = fakeDb(state, {
      fehler: a => (a.tabelle === 'assignments' && a.op === 'update')
        ? { message: 'DOPPELBELEGUNG: Mitarbeiter x hat bereits einen Einsatz' } : null,
    })
    const res = await patch(db, { stop_id: STOP, geplante_ankunft: '10:00', geplantes_ende: '11:00' })
    expect(res.status).toBe(409)
    expect(state.tour_stops[0].geplante_ankunft).toBe('08:00:00')
  })

  it('weist eine Zeitspanne ohne Dauer ab', async () => {
    const state = grundzustand()
    const res = await patch(fakeDb(state), { stop_id: STOP, geplante_ankunft: '10:00', geplantes_ende: '10:00' })
    expect(res.status).toBe(400)
    expect(state.assignments[0].start_time).toBe('08:00:00')
  })

  it('weist eine unlesbare Uhrzeit ab, statt sie an Postgres zu reichen', async () => {
    const res = await patch(fakeDb(grundzustand()), { stop_id: STOP, geplante_ankunft: '25:00', geplantes_ende: '11:00' })
    expect(res.status).toBe(400)
  })

  it('lässt einen Nachteinsatz über Mitternacht zu', async () => {
    const state = grundzustand()
    const res = await patch(fakeDb(state), { stop_id: STOP, geplante_ankunft: '22:00', geplantes_ende: '06:00' })
    expect(res.status).toBe(200)
    expect(state.assignments[0].end_time).toBe('06:00')
  })
})

describe('Statuswechsel am Stop', () => {
  it('setzt den Einsatz bei Reaktivierung eines ausgefallenen Stops zurück', async () => {
    const state = grundzustand({ stopStatus: 'AUSGEFALLEN' })
    state.assignments[0].status = 'STORNIERT'
    const res = await patch(fakeDb(state), { stop_id: STOP, status: 'GEPLANT' })
    expect(res.status).toBe(200)
    expect(state.tour_stops[0].status).toBe('GEPLANT')
    // Ohne diese Zeile stünde der Stop wieder in der Tour, sein Einsatz aber
    // weiterhin auf STORNIERT: kein Kalendereintrag, keine Abrechnung.
    expect(state.assignments[0].status).toBe('GEPLANT')
  })

  it('lehnt den Sprung von AUSGEFALLEN direkt auf ABGESCHLOSSEN ab', async () => {
    const state = grundzustand({ stopStatus: 'AUSGEFALLEN' })
    state.assignments[0].status = 'STORNIERT'
    const res = await patch(fakeDb(state), { stop_id: STOP, status: 'ABGESCHLOSSEN' })
    expect(res.status).toBe(409)
    expect(state.tour_stops[0].status).toBe('AUSGEFALLEN')
  })

  it('lehnt jeden Rückschritt aus ABGESCHLOSSEN ab', async () => {
    const state = grundzustand({ stopStatus: 'ABGESCHLOSSEN' })
    const res = await patch(fakeDb(state), { stop_id: STOP, status: 'GEPLANT' })
    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/Leistungsnachweis/)
    expect(state.tour_stops[0].status).toBe('ABGESCHLOSSEN')
  })

  it('lässt den Weg vorwärts weiterhin zu', async () => {
    const state = grundzustand()
    const res = await patch(fakeDb(state), { stop_id: STOP, status: 'UNTERWEGS' })
    expect(res.status).toBe(200)
    expect(state.tour_stops[0].status).toBe('UNTERWEGS')
  })

  it('storniert den Einsatz beim Ausfall', async () => {
    const state = grundzustand()
    const res = await patch(fakeDb(state), { stop_id: STOP, status: 'AUSGEFALLEN' })
    expect(res.status).toBe(200)
    expect(state.assignments[0].status).toBe('STORNIERT')
  })

  it('weist einen unbekannten Status ab', async () => {
    const res = await patch(fakeDb(grundzustand()), { stop_id: STOP, status: 'IRGENDWAS' })
    expect(res.status).toBe(400)
  })
})

describe('Reihenfolge', () => {
  function mitDreiStops() {
    const state = grundzustand()
    state.tour_stops.push(
      { ...state.tour_stops[0], id: 'stop-2', assignment_id: 'assignment-2', position: 2 },
      { ...state.tour_stops[0], id: 'stop-3', assignment_id: 'assignment-3', position: 3 },
    )
    return state
  }

  it('sortiert um', async () => {
    const state = mitDreiStops()
    const res = await patch(fakeDb(state), { reihenfolge: ['stop-3', STOP, 'stop-2'] })
    expect(res.status).toBe(200)
    const pos = Object.fromEntries(state.tour_stops.map(s => [s.id, s.position]))
    expect(pos['stop-3']).toBe(1)
    expect(pos[STOP]).toBe(2)
    expect(pos['stop-2']).toBe(3)
  })

  it('weist eine doppelte Stop-ID ab, statt die Positionen zu zerlegen', async () => {
    const state = mitDreiStops()
    const res = await patch(fakeDb(state), { reihenfolge: [STOP, STOP, 'stop-2'] })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/doppelt/)
    expect(state.tour_stops.map(s => s.position)).toEqual([1, 2, 3])
  })

  it('weist eine fremde Stop-ID ab', async () => {
    const state = mitDreiStops()
    const res = await patch(fakeDb(state), { reihenfolge: [STOP, 'stop-2', 'fremd'] })
    expect(res.status).toBe(400)
    expect(state.tour_stops.map(s => s.position)).toEqual([1, 2, 3])
  })

  it('meldet einen Schreibfehler, statt die Stops auf Ausweichpositionen liegen zu lassen', async () => {
    const state = mitDreiStops()
    let n = 0
    const db = fakeDb(state, {
      fehler: a => {
        if (a.tabelle !== 'tour_stops' || a.op !== 'update') return null
        n += 1
        return n === 5 ? { message: 'deadlock detected', code: '40P01' } : null
      },
    })
    const res = await patch(db, { reihenfolge: ['stop-3', STOP, 'stop-2'] })
    expect(res.status).toBe(500)
    expect(res.body.error).toMatch(/Ausweichpositionen/)
  })
})

describe('Tourstatus', () => {
  it('lehnt Änderungen an einer stornierten Tour ab', async () => {
    const state = grundzustand({ tourStatus: 'STORNIERT' })
    const res = await patch(fakeDb(state), { stop_id: STOP, geplante_ankunft: '10:00', geplantes_ende: '11:00' })
    expect(res.status).toBe(409)
    expect(state.assignments[0].start_time).toBe('08:00:00')
  })

  it('lehnt Änderungen an einer abgeschlossenen Tour ab', async () => {
    const state = grundzustand({ tourStatus: 'ABGESCHLOSSEN' })
    const res = await patch(fakeDb(state), { stop_id: STOP, status: 'AUSGEFALLEN' })
    expect(res.status).toBe(409)
  })

  it('lässt Änderungen an einer laufenden Tour zu', async () => {
    const state = grundzustand({ tourStatus: 'UNTERWEGS' })
    const res = await patch(fakeDb(state), { stop_id: STOP, status: 'BEIM_KLIENTEN' })
    expect(res.status).toBe(200)
  })
})
