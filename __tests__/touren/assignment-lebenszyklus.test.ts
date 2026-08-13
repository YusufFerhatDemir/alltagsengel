// ═══════════════════════════════════════════════════════════════
// TOURENPLANUNG — Einsatz-Lebenszyklus an den Tour-Stops
// ═══════════════════════════════════════════════════════════════
// Ein Stop, der aus der Tour fällt (entfernt / AUSGEFALLEN / Tour
// storniert), darf seinen Einsatz nicht als Geistertermin
// zurücklassen: sonst blockiert check_assignment_overlap die Zeit
// des Mitarbeiters weiter und der Termin steht in Kalender und
// Engel-App, obwohl er nicht mehr stattfindet.

import { describe, it, expect } from 'vitest'
import {
  storniereGeloesteAssignments,
  aktualisiereFahrtzeiten,
  aufloeseStops,
} from '@/lib/touren/server'

// ── Mini-Fake für die genutzten PostgREST-Ketten ────────────────
type Row = Record<string, any>
type Filter = ['eq' | 'in' | 'notIn', string, any]

function fakeDb(state: Record<string, Row[]>) {
  function passt(row: Row, filter: Filter): boolean {
    const [art, feld, wert] = filter
    if (art === 'eq') return row[feld] === wert
    if (art === 'in') return (wert as any[]).includes(row[feld])
    return !(wert as any[]).includes(row[feld])
  }

  const client: any = {
    from(table: string) {
      const chain: any = {
        _op: 'select' as 'select' | 'update' | 'insert' | 'delete',
        _werte: null as Row | null,
        _filters: [] as Filter[],
        _single: false,
        select() { return chain },
        update(werte: Row) { chain._op = 'update'; chain._werte = werte; return chain },
        insert(werte: Row) { chain._op = 'insert'; chain._werte = werte; return chain },
        delete() { chain._op = 'delete'; return chain },
        eq(feld: string, wert: any) { chain._filters.push(['eq', feld, wert]); return chain },
        in(feld: string, werte: any[]) { chain._filters.push(['in', feld, werte]); return chain },
        not(feld: string, _op: string, liste: string) {
          chain._filters.push(['notIn', feld, liste.replace(/[()]/g, '').split(',')])
          return chain
        },
        order() { return chain },
        limit() { return chain },
        single() { chain._single = true; return chain },
        then(resolve: any) { return Promise.resolve(resolve(chain._lauf())) },
        _lauf() {
          const rows = state[table] ?? []
          const treffer = rows.filter(r => chain._filters.every((f: Filter) => passt(r, f)))
          if (chain._op === 'update') {
            for (const r of treffer) Object.assign(r, chain._werte)
          }
          if (chain._op === 'insert') {
            const neu = { id: `neu-${rows.length + 1}`, ...chain._werte }
            rows.push(neu)
            state[table] = rows
            return { data: chain._single ? neu : [neu], error: null }
          }
          if (chain._op === 'delete') {
            state[table] = rows.filter(r => !treffer.includes(r))
          }
          if (chain._single) {
            return treffer.length === 1
              ? { data: treffer[0], error: null }
              : { data: null, error: { code: 'PGRST116', message: 'not found' } }
          }
          return { data: treffer, error: null }
        },
      }
      return chain
    },
  }
  return client
}

// ── storniereGeloesteAssignments ───────────────────────────────
describe('storniereGeloesteAssignments', () => {
  it('storniert den Einsatz, dessen Stop entfernt wurde', async () => {
    const state = {
      tour_stops: [],
      assignments: [{ id: 'a1', status: 'GEPLANT' }],
    }
    await storniereGeloesteAssignments(fakeDb(state), ['a1'])
    expect(state.assignments[0].status).toBe('STORNIERT')
  })

  it('lässt den Einsatz stehen, solange ein anderer Stop ihn nutzt', async () => {
    const state = {
      tour_stops: [{ id: 's2', assignment_id: 'a1', status: 'GEPLANT' }],
      assignments: [{ id: 'a1', status: 'GEPLANT' }],
    }
    await storniereGeloesteAssignments(fakeDb(state), ['a1'])
    expect(state.assignments[0].status).toBe('GEPLANT')
  })

  it('ignoriert den gerade ausgefallenen Stop selbst', async () => {
    const state = {
      tour_stops: [{ id: 's1', assignment_id: 'a1', status: 'AUSGEFALLEN' }],
      assignments: [{ id: 'a1', status: 'GEPLANT' }],
    }
    await storniereGeloesteAssignments(fakeDb(state), ['a1'], { ignoriereStopIds: ['s1'] })
    expect(state.assignments[0].status).toBe('STORNIERT')
  })

  it('rührt bereits beendete oder stornierte Einsätze nicht an', async () => {
    const state = {
      tour_stops: [],
      assignments: [
        { id: 'a1', status: 'BEENDET' },
        { id: 'a2', status: 'STORNIERT' },
        { id: 'a3', status: 'GEPLANT' },
      ],
    }
    await storniereGeloesteAssignments(fakeDb(state), ['a1', 'a2', 'a3'])
    expect(state.assignments.map(a => a.status)).toEqual(['BEENDET', 'STORNIERT', 'STORNIERT'])
  })

  it('tut nichts ohne verknüpften Einsatz', async () => {
    const state = { tour_stops: [], assignments: [{ id: 'a1', status: 'GEPLANT' }] }
    await storniereGeloesteAssignments(fakeDb(state), [null, undefined as any])
    expect(state.assignments[0].status).toBe('GEPLANT')
  })
})

// ── aktualisiereFahrtzeiten ────────────────────────────────────
describe('aktualisiereFahrtzeiten', () => {
  it('rechnet entlang der aktiven Stops und leert ausgefallene', async () => {
    const state = {
      tour_stops: [
        { id: 's1', tour_id: 't1', position: 1, plz: '60311', status: 'GEPLANT', fahrzeit_minuten: null, distanz_km: null },
        { id: 's2', tour_id: 't1', position: 2, plz: '61348', status: 'AUSGEFALLEN', fahrzeit_minuten: 99, distanz_km: 99 },
        { id: 's3', tour_id: 't1', position: 3, plz: '60594', status: 'GEPLANT', fahrzeit_minuten: null, distanz_km: null },
      ],
    }
    await aktualisiereFahrtzeiten(fakeDb(state), 't1', '60311')

    const [s1, s2, s3] = state.tour_stops
    // Start-PLZ = Stop-1-PLZ → Pauschale für dieselbe PLZ
    expect(s1.fahrzeit_minuten).toBe(7)
    expect(s1.distanz_km).toBe(2)
    // ausgefallener Stop: keine Anfahrt mehr ausweisen
    expect(s2.fahrzeit_minuten).toBeNull()
    expect(s2.distanz_km).toBeNull()
    // Stop 3 wird direkt von Stop 1 aus angefahren (Stop 2 entfällt)
    expect(s3.fahrzeit_minuten).toBeGreaterThan(0)
    expect(s3.distanz_km).toBeGreaterThan(0)
  })

  it('lässt Fahrzeiten leer, wenn die PLZ unbekannt ist', async () => {
    const state = {
      tour_stops: [
        { id: 's1', tour_id: 't1', position: 1, plz: '00000', status: 'GEPLANT', fahrzeit_minuten: 5, distanz_km: 5 },
      ],
    }
    await aktualisiereFahrtzeiten(fakeDb(state), 't1', '60311')
    expect(state.tour_stops[0].fahrzeit_minuten).toBeNull()
  })
})

// ── aufloeseStops: Datumsprüfung beim Anhängen ─────────────────
describe('aufloeseStops mit vorhandenem Einsatz', () => {
  const basis = {
    caregiverId: 'cg1',
    tourDate: '2026-08-20',
    organizationId: 'org1',
    createdBy: 'user1',
  }

  const assignment = (datum: string) => ({
    id: 'a1',
    client_id: 'c1',
    caregiver_id: 'cg1',
    organization_id: 'org1',
    assignment_date: datum,
    start_time: '09:00',
    end_time: '10:00',
    address: 'Zeil 1, Frankfurt',
    zip_code: '60313',
    clients: { address: 'Zeil 1', city: 'Frankfurt', zip_code: '60313' },
  })

  it('weist einen Einsatz eines anderen Tages ab', async () => {
    const db = fakeDb({ assignments: [assignment('2026-08-21')] })
    const ergebnis = await aufloeseStops(db, { ...basis, stops: [{ assignment_id: 'a1' }] })
    expect(ergebnis.stops).toEqual([])
    expect(ergebnis.fehler).toMatch(/2026-08-21/)
  })

  it('übernimmt einen Einsatz desselben Tages', async () => {
    const db = fakeDb({ assignments: [assignment('2026-08-20')] })
    const ergebnis = await aufloeseStops(db, { ...basis, stops: [{ assignment_id: 'a1' }] })
    expect(ergebnis.fehler).toBeNull()
    expect(ergebnis.stops[0]).toMatchObject({ assignment_id: 'a1', plz: '60313', geplante_ankunft: '09:00' })
  })

  it('weist einen Einsatz eines anderen Mitarbeiters ab', async () => {
    const db = fakeDb({ assignments: [{ ...assignment('2026-08-20'), caregiver_id: 'cg2' }] })
    const ergebnis = await aufloeseStops(db, { ...basis, stops: [{ assignment_id: 'a1' }] })
    expect(ergebnis.fehler).toMatch(/anderen Mitarbeiter/)
  })
})
