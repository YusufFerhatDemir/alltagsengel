/**
 * PATCH /api/leistungsnachweis/crud — Unterschrift und Storno
 *
 * Zwei Wege, die vorher offenstanden:
 *
 *  1. action:'sign' setzte proof_status='UNTERSCHRIEBEN' auch ohne jede
 *     Unterschrift (`if (body.client_signature)` — sonst eben nicht). Der
 *     DB-Trigger compute_signature_hash() vergibt an diesem Statuswechsel
 *     signature_hash und is_locked=true, und die Rechnungs-RPC prüft genau
 *     diese beiden Merkmale. Ein Nachweis ohne Unterschrift war damit
 *     abrechenbar und zugleich gegen jede Korrektur gesperrt.
 *
 *  2. action:'cancel' stornierte auch einen Nachweis, der bereits auf einer
 *     Rechnung steht. Die Rechnung blieb, ihr Beleg war weg.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const ORG = 'org-1'
const ID = 'rec-1'

const { mockCreateClient, mockAudit } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockAudit: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: mockCreateClient }))
vi.mock('@/lib/organizations/server', () => ({
  getActiveOrgId: async () => ORG,
  getActiveOrgIdOrDefault: async () => ORG,
  resolveUserOrgId: async () => ORG,
}))
vi.mock('@/lib/audit-log', () => ({
  logAuditEventOrWarn: mockAudit,
  logAuditEvent: mockAudit,
}))

import { PATCH } from '@/app/api/leistungsnachweis/crud/route'

interface Zustand {
  record: Record<string, unknown>
  /** Zeilen in service_signatures mit signer_role='client'. */
  signaturen: number
}

function fakeSupabase(zustand: Zustand) {
  const updates: Record<string, unknown>[] = []

  const client: any = {
    updates,
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
    from(tabelle: string) {
      const kette: any = {
        _op: 'select',
        _count: false,
        select(_cols?: string, opt?: { head?: boolean; count?: string }) {
          if (opt?.count) kette._count = true
          return kette
        },
        update(werte: Record<string, unknown>) {
          kette._op = 'update'
          updates.push({ tabelle, ...werte })
          Object.assign(zustand.record, werte)
          return kette
        },
        insert() { kette._op = 'insert'; return kette },
        eq() { return kette },
        order() { return kette },
        limit() { return kette },
        single: async () => antwort(),
        maybeSingle: async () => antwort(),
        then: (aufloesen: any) => Promise.resolve(aufloesen(antwort())),
      }

      function antwort() {
        if (tabelle === 'profiles') return { data: { role: 'admin' }, error: null, count: null }
        if (tabelle === 'service_signatures') {
          return { data: null, error: null, count: kette._count ? zustand.signaturen : null }
        }
        if (tabelle === 'service_records') return { data: zustand.record, error: null, count: null }
        return { data: null, error: null, count: null }
      }

      return kette
    },
  }
  return client
}

async function patch(zustand: Zustand, body: unknown) {
  const supabase = fakeSupabase(zustand)
  mockCreateClient.mockResolvedValue(supabase)
  const req = new Request('http://test/api/leistungsnachweis/crud', {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
  const res = await PATCH(req as any)
  return { status: res.status, body: await res.json(), supabase }
}

function abgeschlossenerNachweis(over: Record<string, unknown> = {}): Zustand {
  return {
    record: {
      id: ID, proof_status: 'ABGESCHLOSSEN', status: 'complete',
      billing_status: 'OFFEN', client_signature: null, ...over,
    },
    signaturen: 0,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAudit.mockResolvedValue(undefined)
})

describe("action: 'sign'", () => {
  it('lehnt die Unterschrift ohne Unterschrift ab', async () => {
    const zustand = abgeschlossenerNachweis()
    const res = await patch(zustand, { id: ID, action: 'sign' })
    expect(res.status).toBe(422)
    expect(res.body.error).toMatch(/Unterschrift/)
    // Entscheidend: der Status darf sich NICHT bewegt haben — mit ihm hätte
    // die Datenbank Hash und Sperre vergeben.
    expect(zustand.record.proof_status).toBe('ABGESCHLOSSEN')
    expect(res.supabase.updates).toHaveLength(0)
  })

  it('nimmt die im Request mitgeschickte Unterschrift an', async () => {
    const zustand = abgeschlossenerNachweis()
    const res = await patch(zustand, {
      id: ID, action: 'sign',
      client_signature: 'data:image/png;base64,iVBOR',
      client_signer_name: 'M. Meier',
    })
    expect(res.status).toBe(200)
    expect(zustand.record.proof_status).toBe('UNTERSCHRIEBEN')
    // status muss im SELBEN Update mit: nach is_locked=true blockiert der
    // Sperr-Trigger jedes weitere.
    expect(res.supabase.updates[0].status).toBe('signed')
  })

  it('nimmt eine bereits am Datensatz hinterlegte Unterschrift an', async () => {
    const zustand = abgeschlossenerNachweis({ client_signature: 'data:image/png;base64,iVBOR' })
    const res = await patch(zustand, { id: ID, action: 'sign' })
    expect(res.status).toBe(200)
  })

  it('nimmt die getrennt abgelegte Unterschrift der App an', async () => {
    const zustand = abgeschlossenerNachweis()
    zustand.signaturen = 1
    const res = await patch(zustand, { id: ID, action: 'sign' })
    expect(res.status).toBe(200)
    expect(zustand.record.proof_status).toBe('UNTERSCHRIEBEN')
  })

  it('lehnt einen Unterzeichner-Namen ohne Unterschrift ab', async () => {
    // Ein Name ist eine Angabe ÜBER die Unterschrift, nicht die Unterschrift.
    const zustand = abgeschlossenerNachweis()
    const res = await patch(zustand, { id: ID, action: 'sign', client_signer_name: 'M. Meier' })
    expect(res.status).toBe(422)
  })

  it('bleibt bei der Statusregel: nur aus ABGESCHLOSSEN', async () => {
    const zustand = abgeschlossenerNachweis({ proof_status: 'ENTWURF' })
    const res = await patch(zustand, { id: ID, action: 'sign', client_signature: 'data:image/png;base64,x' })
    expect(res.status).toBe(409)
  })
})

describe("action: 'cancel'", () => {
  it('storniert einen offenen Nachweis', async () => {
    const zustand = abgeschlossenerNachweis()
    const res = await patch(zustand, { id: ID, action: 'cancel', grund: 'Einsatz entfallen' })
    expect(res.status).toBe(200)
    expect(zustand.record.proof_status).toBe('STORNIERT')
    expect(zustand.record.billing_status).toBe('STORNIERT')
  })

  it('lehnt das Storno eines abgerechneten Nachweises ab', async () => {
    const zustand = abgeschlossenerNachweis({ status: 'invoiced', billing_status: 'ABGERECHNET' })
    const res = await patch(zustand, { id: ID, action: 'cancel' })
    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/Gutschrift/)
    expect(zustand.record.billing_status).toBe('ABGERECHNET')
    expect(res.supabase.updates).toHaveLength(0)
  })

  it('lehnt das Storno eines einer Rechnung zugeordneten Nachweises ab', async () => {
    const zustand = abgeschlossenerNachweis({ billing_status: 'ZUGEORDNET' })
    const res = await patch(zustand, { id: ID, action: 'cancel' })
    expect(res.status).toBe(409)
    expect(zustand.record.billing_status).toBe('ZUGEORDNET')
  })
})
