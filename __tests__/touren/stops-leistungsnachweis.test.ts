/**
 * PATCH /api/tours/[id]/stops — der Leistungsnachweis erbt die Werte des
 * Einsatzes, er erfindet sie nicht.
 *
 * BEFUND: Beim Abschluss eines Stops mit `leistungsnachweis_anlegen: true`
 * standen im Nachweis zwei FESTE Werte:
 *
 *     service_type: 'Alltagsbegleitung'
 *     budget_type:  'entlastung'
 *
 * Beide gehoeren zum Einsatz, an dem der Stop haengt. Die Folgen der festen
 * Werte sind je fuer sich Geldfehler, die niemandem auffallen:
 *
 *   · Eine Haushaltshilfe wurde als 'Alltagsbegleitung' abgerechnet. Der
 *     Rechnungslauf loest den Tarif ueber den Namen auf — es gibt einen
 *     Treffer, also faellt nichts auf, nur der Satz ist ein anderer.
 *   · Ein Verhinderungspflege-Einsatz (§ 42a, eigener Topf, eigenes
 *     Kontingent) verbrauchte den Entlastungsbetrag nach § 45b — 131 EUR im
 *     Monat, die dem Kunden an anderer Stelle fehlen.
 *
 * Fail-closed ergaenzt: ohne Leistungsart am Einsatz entsteht KEIN Nachweis
 * mit Ersatzwerten, sondern eine Meldung.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { budgetTypFuerLeistungsart, nachweisWerteAusEinsatz } from '@/lib/touren/leistungsnachweis'

const ORG = 'org-1'
const TOUR = 'tour-1'
const STOP = 'stop-1'
const ASSIGNMENT = 'assignment-1'

const { mockRequireOpsAdmin, mockCreateAdminClient, mockSaveServiceRecord } = vi.hoisted(() => ({
  mockRequireOpsAdmin: vi.fn(),
  mockCreateAdminClient: vi.fn(),
  mockSaveServiceRecord: vi.fn(),
}))

vi.mock('@/lib/ops/api-auth', () => ({ requireOpsAdmin: mockRequireOpsAdmin }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mockCreateAdminClient }))
vi.mock('@/lib/admin/service-records', () => ({ saveServiceRecord: mockSaveServiceRecord }))

import { PATCH } from '@/app/api/tours/[id]/stops/route'

// ── PostgREST-Doppelgaenger (gleiche Bauart wie stops-patch-route.test.ts) ──
type Zeile = Record<string, any>

function fakeDb(state: Record<string, Zeile[]>) {
  function passt(row: Zeile, [art, feld, wert]: [string, string, any]): boolean {
    if (art === 'eq') return row[feld] === wert
    if (art === 'in') return (wert as any[]).includes(row[feld])
    return true
  }

  return {
    from(tabelle: string) {
      const filter: [string, string, any][] = []
      let op: 'select' | 'update' = 'select'
      let werte: Zeile | null = null
      const treffer = () => (state[tabelle] ?? []).filter(r => filter.every(f => passt(r, f)))

      const anwenden = () => {
        const rows = treffer()
        if (op === 'update') for (const r of rows) Object.assign(r, werte)
        return rows
      }

      const kette: any = {
        select: () => kette,
        update: (w: Zeile) => { op = 'update'; werte = w; return kette },
        insert: () => kette,
        eq: (f: string, w: any) => { filter.push(['eq', f, w]); return kette },
        in: (f: string, w: any[]) => { filter.push(['in', f, w]); return kette },
        is: () => kette, not: () => kette, order: () => kette, limit: () => kette,
        single: async () => {
          const eins = anwenden()[0]
          return eins ? { data: eins, error: null } : { data: null, error: { message: 'no rows', code: 'PGRST116' } }
        },
        maybeSingle: async () => ({ data: anwenden()[0] ?? null, error: null }),
        then: (auf: any) => Promise.resolve(auf({ data: anwenden(), error: null })),
      }
      return kette
    },
  }
}

function grundzustand(einsatzServiceType: string | null = 'Haushaltshilfe') {
  return {
    tours: [{
      id: TOUR, organization_id: ORG, caregiver_id: 'cg-1', tour_date: '2026-09-10',
      status: 'GEPLANT',
      caregivers: { first_name: 'Sabrina', last_name: 'Martin', initials: 'S.M.', zip_code: '60311' },
    }],
    tour_stops: [{
      id: STOP, tour_id: TOUR, assignment_id: ASSIGNMENT, client_id: 'kl-1', position: 1,
      geplante_ankunft: '08:00:00', geplantes_ende: '09:00:00',
      status: 'BEIM_KLIENTEN', service_record_id: null, plz: '60311',
      fahrzeit_minuten: null, distanz_km: null, notes: null,
      tatsaechliche_ankunft: null, tatsaechliches_ende: null, adresse: 'Weg 1',
    }],
    assignments: [{
      id: ASSIGNMENT, organization_id: ORG, caregiver_id: 'cg-1', client_id: 'kl-1',
      assignment_date: '2026-09-10', start_time: '08:00:00', end_time: '09:00:00',
      status: 'GEPLANT', service_type: einsatzServiceType,
    }],
    service_records: [],
  }
}

async function abschliessen(state: Record<string, Zeile[]>) {
  mockCreateAdminClient.mockReturnValue(fakeDb(state))
  const req = new Request('http://test/api/tours/tour-1/stops', {
    method: 'PATCH',
    body: JSON.stringify({ stop_id: STOP, status: 'ABGESCHLOSSEN', leistungsnachweis_anlegen: true }),
  })
  const res = await PATCH(req as any, { params: Promise.resolve({ id: TOUR }) } as any)
  return { status: res.status, body: await res.json() }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireOpsAdmin.mockResolvedValue({
    ok: true, ctx: { organizationId: ORG, userId: 'user-1', role: 'admin' },
  })
  mockSaveServiceRecord.mockResolvedValue({ id: 'sr-1', error: null, degraded: false })
})

describe('Ableitung aus der Einsatz-Leistungsart', () => {
  it('bucht Verhinderungspflege auf den § 42a-Topf, nicht auf den Entlastungsbetrag', () => {
    expect(budgetTypFuerLeistungsart('verhinderungspflege')).toBe('verhinderungspflege')
    expect(budgetTypFuerLeistungsart('Verhinderung')).toBe('verhinderungspflege')
    expect(budgetTypFuerLeistungsart('Kurzzeitpflege')).toBe('verhinderungspflege')
  })

  it('bucht Privatleistungen auf keinen Kassentopf', () => {
    expect(budgetTypFuerLeistungsart('privat')).toBe('private')
    expect(budgetTypFuerLeistungsart('Selbstzahler')).toBe('private')
  })

  it('laesst alles Uebrige beim Entlastungsbetrag', () => {
    for (const art of ['Alltagsbegleitung', 'Haushaltshilfe', 'Einkaufshilfe', 'Arztbegleitung']) {
      expect(budgetTypFuerLeistungsart(art)).toBe('entlastung')
    }
  })

  it('gibt die Leistungsart unveraendert weiter — der Tarif haengt am Wortlaut', () => {
    expect(nachweisWerteAusEinsatz('Haushaltshilfe')).toEqual({
      service_type: 'Haushaltshilfe', budget_type: 'entlastung',
    })
  })

  it('liefert null statt eines Ersatzwerts, wenn der Einsatz keine Leistungsart traegt', () => {
    expect(nachweisWerteAusEinsatz(null)).toBeNull()
    expect(nachweisWerteAusEinsatz('')).toBeNull()
    expect(nachweisWerteAusEinsatz('   ')).toBeNull()
  })
})

describe('Leistungsnachweis beim Stop-Abschluss', () => {
  it('uebernimmt die Leistungsart des Einsatzes statt "Alltagsbegleitung"', async () => {
    const res = await abschliessen(grundzustand('Haushaltshilfe'))
    expect(res.status).toBe(200)
    expect(mockSaveServiceRecord).toHaveBeenCalledTimes(1)
    const eingabe = mockSaveServiceRecord.mock.calls[0][1]
    expect(eingabe.service_type).toBe('Haushaltshilfe')
    expect(eingabe.budget_type).toBe('entlastung')
  })

  it('bucht einen Verhinderungspflege-Einsatz auf den § 42a-Topf', async () => {
    const res = await abschliessen(grundzustand('verhinderungspflege'))
    expect(res.status).toBe(200)
    const eingabe = mockSaveServiceRecord.mock.calls[0][1]
    expect(eingabe.service_type).toBe('verhinderungspflege')
    expect(eingabe.budget_type).toBe('verhinderungspflege')
    // Der alte Stand haette hier den Entlastungsbetrag des Kunden belastet.
    expect(eingabe.budget_type).not.toBe('entlastung')
  })

  it('legt KEINEN Nachweis an, wenn der Einsatz keine Leistungsart hat', async () => {
    const res = await abschliessen(grundzustand(null))
    expect(res.status).toBe(200)
    expect(mockSaveServiceRecord).not.toHaveBeenCalled()
    expect(res.body.leistungsnachweis_fehler).toMatch(/keine Leistungsart/i)
  })

  it('legt KEINEN Nachweis an, wenn der Einsatz zu einer anderen Organisation gehoert', async () => {
    const state = grundzustand('Haushaltshilfe')
    state.assignments[0].organization_id = 'org-fremd'
    const res = await abschliessen(state)
    expect(mockSaveServiceRecord).not.toHaveBeenCalled()
    expect(res.body.leistungsnachweis_fehler).toMatch(/keine Leistungsart/i)
  })

  it('schreibt weiterhin Zeiten, Datum und Handzeichen aus Tour und Stop', async () => {
    await abschliessen(grundzustand('Arztbegleitung'))
    const eingabe = mockSaveServiceRecord.mock.calls[0][1]
    expect(eingabe.date).toBe('2026-09-10')
    expect(eingabe.start_time).toBe('08:00')
    expect(eingabe.end_time).toBe('09:00')
    expect(eingabe.caregiver_initials).toBe('S.M.')
    expect(eingabe.status).toBe('draft')
  })
})
