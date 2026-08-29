/**
 * `POST /api/billing/invoices/[id]/abschreiben` — der Weg, den es gab und
 * den niemand gehen konnte.
 *
 * BEFUND (29.08.2026): Die Route ist vollständig, `writeOffInvoice` ist seit
 * langem geprüft, `abgeschrieben` ist in der Statusmaschine, in
 * `invoices_status_check` (live), in der Mahnbremse und im Budget-Deckel
 * berücksichtigt — und die Route wurde von KEINER Stelle der Oberfläche
 * aufgerufen. Eine uneinbringliche Forderung liess sich damit nicht
 * ausbuchen: sie blieb offen, zählte in jeder OPOS-Summe mit und wurde
 * weiter gemahnt.
 *
 * Die bestehende Suite `d6-forderungsabschreibung.test.ts` prüft die Route
 * über den QUELLTEXT (`routeSrc.toContain(…)`). Das sagt, dass etwas
 * dasteht, nicht, was beim Lauf passiert. Diese Suite ruft den Handler auf
 * und sieht auf die Abfragen, die dabei wirklich gestellt werden.
 *
 * `writeOffInvoice` läuft dabei ECHT — nur der Supabase-Client ist ein
 * protokollierender Doppelgänger. Der Statusriegel, der CAS-Vergleich und
 * der Audit-Eintrag sind damit Teil des Prüflings und keine Attrappe.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  erstelleFakeSupabase, hatFilter, hatOrgFence,
  type FakeAufruf, type FakeSupabase,
} from '../helpers/supabase-fake'

const ORG = '11111111-1111-4111-8111-111111111111'
const FREMD = '22222222-2222-4222-8222-222222222222'
const INV = '33333333-3333-4333-8333-333333333333'
// Echte UUID: `billing_audit_trail.actor_id` ist eine UUID-Spalte, und
// `zerlegeHandelnden()` legt alles, was keine UUID ist, als Rolle statt als
// Kennung ab. Eine Platzhalter-Kennung wie 'u-1' wuerde hier also still zu
// `actor_id = null` — der Test saehe dann etwas anderes als die Produktion.
const USER = '44444444-4444-4444-8444-444444444444'

let fake: FakeSupabase
let darfSchreiben = true
/** Die Zeile, die `writeOffInvoice` beim Lesen findet. */
let rechnung: Record<string, unknown> | null

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: USER } }, error: null }) },
  })),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => fake.client),
}))

vi.mock('@/lib/organizations/server', () => ({
  getActiveOrgId: vi.fn(async () => ORG),
}))

vi.mock('@/lib/auth/rollen-quelle', () => ({
  holeRollenQuellenFuer: vi.fn(async () => ({ appRolle: 'buchhaltung', profilRolle: 'buchhaltung' })),
  quellenDuerfen: vi.fn(() => darfSchreiben),
}))

const { POST } = await import('@/app/api/billing/invoices/[id]/abschreiben/route')

const anfrage = (body: unknown) =>
  new Request(`http://localhost/api/billing/invoices/${INV}/abschreiben`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

const ctx = { params: Promise.resolve({ id: INV }) }

/** Die UPDATE-Abfrage auf `invoices` — das eigentliche Ausbuchen. */
function ausbuchung(): FakeAufruf | undefined {
  return fake.auf('invoices').find(a => a.operation === 'update')
}

beforeEach(() => {
  darfSchreiben = true
  rechnung = {
    id: INV,
    organization_id: ORG,
    status: 'freigegeben',
    total_amount: 120,
    paid_amount: 20,
  }
  fake = erstelleFakeSupabase((a) => {
    if (a.tabelle === 'invoices' && a.operation === 'select') {
      // Die Route liest zuerst schmal (id) mit Org-Fence, dann liest
      // writeOffInvoice die volle Zeile.
      return { data: rechnung }
    }
    if (a.tabelle === 'invoices' && a.operation === 'update') {
      // CAS: nur wenn der Status noch dem gelesenen entspricht.
      const passt = a.filter.some(f => f.methode === 'eq' && f.spalte === 'status' && f.wert === rechnung?.status)
      return { data: passt ? { id: INV } : null }
    }
    if (a.tabelle === 'billing_audit_trail') return { data: null, error: null }
    return { data: null }
  })
})

describe('Berechtigung', () => {
  it('weist ohne abrechnung.schreiben mit 403 ab', async () => {
    darfSchreiben = false
    const res = await POST(anfrage({ reason: 'Schuldner insolvent' }) as never, ctx as never)
    expect(res.status).toBe(403)
  })

  it('bucht dabei NICHTS aus', async () => {
    darfSchreiben = false
    await POST(anfrage({ reason: 'Schuldner insolvent' }) as never, ctx as never)
    expect(fake.aufrufe).toHaveLength(0)
  })
})

describe('Begruendung', () => {
  it('weist eine fehlende Begruendung mit 400 ab', async () => {
    const res = await POST(anfrage({}) as never, ctx as never)
    expect(res.status).toBe(400)
  })

  it('weist eine zu kurze Begruendung mit 400 ab', async () => {
    const res = await POST(anfrage({ reason: 'ab' }) as never, ctx as never)
    expect(res.status).toBe(400)
  })

  it('fasst eine fehlende Begruendung NICHT als leere auf — es wird nichts gelesen', async () => {
    // Eine Abschreibung ohne Grund ist im Nachhinein nicht mehr erklaerbar.
    // Der Riegel muss VOR der Abfrage stehen, sonst hat der Lauf die Last
    // schon verursacht.
    await POST(anfrage({ reason: '   ' }) as never, ctx as never)
    expect(fake.aufrufe).toHaveLength(0)
  })
})

describe('Mandantengrenze', () => {
  it('setzt den Org-Fence beim Nachschlagen der Rechnung', async () => {
    await POST(anfrage({ reason: 'Forderung uneinbringlich' }) as never, ctx as never)
    expect(hatOrgFence(fake.ersterAuf('invoices', 'select'), ORG)).toBe(true)
  })

  it('nimmt den Mandanten aus dem Kontext, nicht aus dem Body', async () => {
    await POST(anfrage({ reason: 'Forderung uneinbringlich', organizationId: FREMD }) as never, ctx as never)
    expect(hatFilter(fake.ersterAuf('invoices', 'select'), 'eq', 'organization_id', FREMD)).toBe(false)
  })

  it('antwortet mit 404, wenn die Rechnung nicht zum Mandanten gehoert', async () => {
    rechnung = null
    const res = await POST(anfrage({ reason: 'Forderung uneinbringlich' }) as never, ctx as never)
    expect(res.status).toBe(404)
    expect(ausbuchung()).toBeUndefined()
  })
})

describe('Statusriegel', () => {
  it('bucht aus einem abschreibbaren Status aus', async () => {
    const res = await POST(anfrage({ reason: 'Schuldner insolvent' }) as never, ctx as never)
    expect(res.status).toBe(200)
    expect((ausbuchung()?.payload as { status?: string })?.status).toBe('abgeschrieben')
  })

  it('weist einen Entwurf ab — auf einen Entwurf gibt es keine Forderung', async () => {
    rechnung = { ...rechnung!, status: 'entwurf' }
    const res = await POST(anfrage({ reason: 'Schuldner insolvent' }) as never, ctx as never)
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(ausbuchung()).toBeUndefined()
  })

  it('weist eine bereits bezahlte Rechnung ab', async () => {
    rechnung = { ...rechnung!, status: 'bezahlt' }
    const res = await POST(anfrage({ reason: 'Schuldner insolvent' }) as never, ctx as never)
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(ausbuchung()).toBeUndefined()
  })

  it('weist eine bereits abgeschriebene Rechnung ab — kein zweites Ausbuchen', async () => {
    rechnung = { ...rechnung!, status: 'abgeschrieben' }
    const res = await POST(anfrage({ reason: 'Schuldner insolvent' }) as never, ctx as never)
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(ausbuchung()).toBeUndefined()
  })

  it('weist eine vollstaendig bezahlte Zeile ab — es ist nichts mehr offen', async () => {
    rechnung = { ...rechnung!, paid_amount: 120 }
    const res = await POST(anfrage({ reason: 'Schuldner insolvent' }) as never, ctx as never)
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(ausbuchung()).toBeUndefined()
  })
})

describe('Was ausgebucht wird', () => {
  it('schreibt den OFFENEN Betrag ab, nicht den Gesamtbetrag', async () => {
    // 120,00 gesamt, 20,00 bezahlt → 100,00 offen. Wer hier den Gesamtbetrag
    // nimmt, bucht eine bereits eingegangene Zahlung ein zweites Mal aus.
    const res = await POST(anfrage({ reason: 'Schuldner insolvent' }) as never, ctx as never)
    const json = await res.json() as { writtenOffAmountCents: number; previousStatus: string }
    expect(json.writtenOffAmountCents).toBe(10_000)
    expect(json.previousStatus).toBe('freigegeben')
  })

  it('setzt den CAS-Filter auf den gelesenen Status', async () => {
    await POST(anfrage({ reason: 'Schuldner insolvent' }) as never, ctx as never)
    expect(hatFilter(ausbuchung(), 'eq', 'status', 'freigegeben')).toBe(true)
    expect(hatFilter(ausbuchung(), 'eq', 'id', INV)).toBe(true)
  })

  it('scheitert, wenn die Zeile zwischenzeitlich einen anderen Status hat', async () => {
    // Der Doppelgaenger liefert beim UPDATE nur dann eine Zeile, wenn der
    // CAS-Filter zum gelesenen Status passt. Hier passt er nicht mehr.
    fake = erstelleFakeSupabase((a) => {
      if (a.tabelle === 'invoices' && a.operation === 'select') return { data: rechnung }
      if (a.tabelle === 'invoices' && a.operation === 'update') return { data: null }
      return { data: null }
    })
    const res = await POST(anfrage({ reason: 'Schuldner insolvent' }) as never, ctx as never)
    expect(res.status).toBeGreaterThanOrEqual(400)
  })

  it('haelt den Vorgang im Abrechnungs-Audit fest — mit Grund und Handelndem', async () => {
    await POST(anfrage({ reason: 'Schuldner insolvent, Forderung uneinbringlich' }) as never, ctx as never)
    const eintrag = fake.ersterAuf('billing_audit_trail', 'insert')?.payload as Record<string, unknown>
    expect(eintrag?.action).toBe('abgeschrieben')
    expect(eintrag?.entity_id).toBe(INV)
    expect(eintrag?.organization_id).toBe(ORG)
    expect(eintrag?.reason).toBe('Schuldner insolvent, Forderung uneinbringlich')
    expect(eintrag?.actor_id).toBe(USER)
  })

  it('haelt den Vorzustand fest, damit die Summe spaeter nachvollziehbar ist', async () => {
    await POST(anfrage({ reason: 'Schuldner insolvent' }) as never, ctx as never)
    const eintrag = fake.ersterAuf('billing_audit_trail', 'insert')?.payload as Record<string, unknown>
    expect(eintrag?.previous_state).toMatchObject({ status: 'freigegeben', total_amount: 120, paid_amount: 20 })
    expect(eintrag?.new_state).toMatchObject({ status: 'abgeschrieben', written_off_amount_cents: 10_000 })
  })
})
