/**
 * POST /api/einsatzplanung — ein unbekannter Klient ist kein Serverfehler
 *
 * BEFUND: `pruefeClientFreigabe()` WIRFT, wenn der Klient unter der
 * uebergebenen ID in dieser Organisation nicht existiert (Tippfehler in der
 * ID, geloeschter Kunde, ID aus einem anderen Mandanten). Der Wurf wurde
 * NIRGENDS aufgefangen: er lief durch `withTracking` — das rethrowt bewusst,
 * um die Messung nicht zu verfaelschen — bis in den Next.js-Handler und kam
 * als HTTP 500 „Interner Serverfehler" zurueck.
 *
 * Zwei Dinge waren daran falsch:
 *   1. Der Aufrufer bekam keinen Klartext. Ein 500 sieht aus wie ein
 *      Ausfall der Anwendung, nicht wie eine falsche Eingabe — die
 *      Disposition haette den Tippfehler nie gefunden.
 *   2. Die Antwort war fuer den Client nicht unterscheidbar von einem echten
 *      Bruch, weil der Fehler-Sanitizer alles Weitere verschluckt.
 *
 * Zusage jetzt: unbekannter Klient → HTTP 404 mit lesbarer Meldung,
 * bekannter Klient → die Pruefung laeuft normal weiter.
 *
 * Dieselbe Zusage gilt fuer `pruefeEinsatzfreigabe()` (unbekannter
 * Mitarbeiter) — der Wurf lag in derselben ungeschuetzten Kette.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const ORG = 'org-1'
const KLIENT = '11111111-1111-4111-8111-111111111111'
const MITARBEITER = '22222222-2222-4222-8222-222222222222'
const UNBEKANNT = '99999999-9999-4999-8999-999999999999'

const { mockCreateClient, mockCreateAdminClient } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockCreateAdminClient: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: mockCreateClient }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mockCreateAdminClient }))
vi.mock('@/lib/organizations/server', () => ({
  getActiveOrgId: async () => ORG,
  getActiveOrgIdOrDefault: async () => ORG,
  resolveUserOrgId: async () => ORG,
}))
vi.mock('@/lib/audit-log', () => ({
  logAuditEvent: async () => undefined,
  logAuditEventOrWarn: async () => undefined,
}))
vi.mock('@/lib/billing/core/audit', () => ({ logBillingAction: async () => undefined }))

import { POST } from '@/app/api/einsatzplanung/route'

// ── Tabellen-Doppelgaenger fuer PostgREST ──────────────────────────
type Zeile = Record<string, any>

function fakeDb(state: Record<string, Zeile[]>) {
  function passt(row: Zeile, [art, feld, wert]: [string, string, any]): boolean {
    if (art === 'eq') return row[feld] === wert
    if (art === 'in') return (wert as any[]).includes(row[feld])
    return true
  }

  return {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
    from(tabelle: string) {
      const filter: [string, string, any][] = []
      let op: 'select' | 'insert' = 'select'
      let werte: Zeile | null = null

      const treffer = () => (state[tabelle] ?? []).filter(r => filter.every(f => passt(r, f)))

      const kette: any = {
        select: () => kette,
        insert: (w: Zeile) => { op = 'insert'; werte = w; return kette },
        update: () => kette,
        eq: (f: string, w: any) => { filter.push(['eq', f, w]); return kette },
        in: (f: string, w: any[]) => { filter.push(['in', f, w]); return kette },
        is: () => kette, or: () => kette, not: () => kette,
        gte: () => kette, lte: () => kette, lt: () => kette, gt: () => kette,
        order: () => kette, limit: () => kette, neq: () => kette,
        single: async () => {
          if (op === 'insert') {
            const zeile = { id: 'neuer-einsatz', ...(werte as Zeile) }
            ;(state[tabelle] ??= []).push(zeile)
            return { data: zeile, error: null }
          }
          const eins = treffer()[0]
          return eins
            ? { data: eins, error: null }
            : { data: null, error: { message: 'no rows', code: 'PGRST116' } }
        },
        maybeSingle: async () => ({ data: treffer()[0] ?? null, error: null }),
        then: (auf: any) => Promise.resolve(auf({ data: treffer(), error: null })),
      }
      return kette
    },
  }
}

/** Bestand, in dem Klient UND Mitarbeiter einsatzbereit sind. */
function grundzustand(): Record<string, Zeile[]> {
  return {
    profiles: [{ id: 'user-1', role: 'admin' }],
    clients: [{
      id: KLIENT, organization_id: ORG, first_name: 'Erika', last_name: 'Muster',
      status: 'aktiv', aufnahmestatus: 'aufgenommen',
    }],
    akten_vertraege: [{
      id: 'v-1', client_id: KLIENT, organization_id: ORG,
      status: 'aktiv', vertragsende: null,
    }],
    caregivers: [{
      id: MITARBEITER, organization_id: ORG, first_name: 'Sabrina', last_name: 'Martin',
      einsatzfreigabe: true, vertragsstatus: 'aktiv', status: 'aktiv', user_id: 'engel-1',
    }],
    caregiver_qualifications: [
      { id: 'q-1', caregiver_id: MITARBEITER, organization_id: ORG, title: 'Erweitertes Führungszeugnis', valid_until: null, einsatzrelevant: true, pflicht: true },
      { id: 'q-2', caregiver_id: MITARBEITER, organization_id: ORG, title: 'Erste Hilfe Kurs', valid_until: null, einsatzrelevant: true, pflicht: true },
    ],
    absences: [],
    angel_availability: [],
    client_budgets: [],
    assignments: [],
  }
}

async function post(state: Record<string, Zeile[]>, body: Record<string, unknown>) {
  const db = fakeDb(state)
  mockCreateClient.mockResolvedValue(db)
  mockCreateAdminClient.mockReturnValue(db)
  const req = new Request('http://test/api/einsatzplanung', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  const res = await POST(req as any)
  return { status: res.status, body: await res.json() }
}

const basis = {
  client_id: KLIENT,
  caregiver_id: MITARBEITER,
  assignment_date: '2026-09-10',
  service_type: 'Alltagsbegleitung',
  start_time: '08:00',
  end_time: '10:00',
}

beforeEach(() => vi.clearAllMocks())

describe('Unbekannter Klient im Einsatz-POST', () => {
  it('antwortet mit 404 und Klartext statt 500', async () => {
    const res = await post(grundzustand(), { ...basis, client_id: UNBEKANNT })
    expect(res.status).toBe(404)
    expect(res.body.error).toMatch(/Klient nicht gefunden/)
    // Der Fehler-Sanitizer haengt nur an der generischen 500er-Antwort eine
    // Korrelations-ID an. Ist sie da, ist die Meldung NICHT durchgereicht.
    expect(res.body.correlationId).toBeUndefined()
  })

  it('antwortet auch 404, wenn der Klient zu einer anderen Organisation gehört', async () => {
    const state = grundzustand()
    state.clients[0].organization_id = 'org-fremd'
    const res = await post(state, basis)
    expect(res.status).toBe(404)
    expect(res.body.error).toMatch(/Klient nicht gefunden/)
  })

  it('antwortet mit 404, wenn der Mitarbeiter unbekannt ist', async () => {
    const res = await post(grundzustand(), { ...basis, caregiver_id: UNBEKANNT })
    expect(res.status).toBe(404)
    expect(res.body.error).toMatch(/Mitarbeiter nicht gefunden/)
  })

  it('legt den Einsatz an, wenn Klient und Mitarbeiter bekannt und freigegeben sind', async () => {
    const state = grundzustand()
    const res = await post(state, basis)
    expect(res.status).toBe(201)
    expect(state.assignments).toHaveLength(1)
    expect(state.assignments[0].client_id).toBe(KLIENT)
    expect(state.assignments[0].organization_id).toBe(ORG)
  })

  it('meldet einen bekannten, aber nicht freigegebenen Klienten weiterhin als 422', async () => {
    // Die Unterscheidung ist der Punkt: „gibt es nicht" (404) ist etwas
    // anderes als „gibt es, darf aber nicht" (422, übersteuerbar).
    const state = grundzustand()
    state.clients[0].status = 'inaktiv'
    const res = await post(state, basis)
    expect(res.status).toBe(422)
    expect(res.body.client_probleme.join(' ')).toMatch(/inaktiv/)
  })
})
