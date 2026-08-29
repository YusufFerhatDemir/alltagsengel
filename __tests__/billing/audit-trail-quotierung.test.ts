/**
 * `GET /api/billing/audit` — die Quotierung sah aus wie eine und war keine.
 *
 * BEFUND (29.08.2026):
 *
 *     const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10), 1), 1000) : 100
 *
 * Die Klammerung liest sich wie eine saubere Begrenzung auf 1…1000. Sie ist
 * es für jede Zahl — aber `parseInt('viele', 10)` ist `NaN`, und `NaN`
 * überlebt `Math.max` und `Math.min` unverändert: beide geben `NaN` zurück,
 * sobald ein Argument `NaN` ist. Aus `?limit=viele` wurde damit
 * `.limit(NaN)`, also etwas Undefiniertes an der Abfrage — kein Fehler,
 * keine Meldung, und beim Lesen des Codes fällt es nicht auf, weil dort ja
 * sichtbar geklammert wird.
 *
 * Dieselbe Klasse wie bei `/api/personal/arbeitszeiten/korrekturen`:
 * unbrauchbare Eingabe abweisen, nie in etwas anderes umdeuten.
 *
 * `billing_audit_trail` ist außerdem eine der wenigen Tabellen dieses
 * Projekts, die live tatsächlich Zeilen trägt — der Fehler betrifft echten
 * Bestand, nicht nur einen leeren Weg.
 *
 * Geprüft wird der Handler im LAUF, über einen protokollierenden
 * Supabase-Doppelgänger: ob eine Grenze im Code steht, sagt nichts darüber,
 * was an der Abfrage ankommt.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { erstelleFakeSupabase, hatFilter, type FakeAufruf, type FakeSupabase } from '../helpers/supabase-fake'

const ORG = '11111111-1111-4111-8111-111111111111'

let fake: FakeSupabase
/** Steuert, ob der Aufrufer `abrechnung.lesen` hat. */
let darfLesen = true

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => fake.client),
}))

vi.mock('@/lib/organizations/server', () => ({
  getActiveOrgId: vi.fn(async () => ORG),
}))

vi.mock('@/lib/auth/rollen-quelle', () => ({
  holeRollenQuellenFuer: vi.fn(async () => ({ appRolle: 'buchhaltung', profilRolle: 'buchhaltung' })),
  quellenDuerfen: vi.fn(() => darfLesen),
}))

const { GET } = await import('@/app/api/billing/audit/route')

const anfrage = (query = '') => new Request(`http://localhost/api/billing/audit${query}`)

/** Die gesetzte Zeilengrenze — `.limit(n)` legt `n` als `spalte` ab. */
function grenzeVon(aufruf: FakeAufruf | undefined): unknown {
  const treffer = aufruf?.filter.find(f => f.methode === 'limit')
  return treffer ? Number(treffer.spalte) : null
}

beforeEach(() => {
  darfLesen = true
  fake = erstelleFakeSupabase(() => ({ data: [] }))
  // Der Handler ruft zuerst `auth.getUser()` auf; der Doppelgänger kennt
  // nur `from()`, deshalb wird die Auth-Seite hier ergänzt.
  ;(fake.client as unknown as { auth: unknown }).auth = {
    getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }),
  }
})

describe('Zeilengrenze', () => {
  it('begrenzt auch ohne Angabe', async () => {
    const res = await GET(anfrage() as never)
    expect(res.status).toBe(200)
    expect(grenzeVon(fake.ersterAuf('billing_audit_trail'))).toBe(100)
  })

  it('übernimmt eine gültige Angabe', async () => {
    await GET(anfrage('?limit=25') as never)
    expect(grenzeVon(fake.ersterAuf('billing_audit_trail'))).toBe(25)
  })

  it('weist eine unbrauchbare Angabe ab, statt NaN durchzureichen', async () => {
    // DER Befund. Vorher: `.limit(NaN)`.
    const res = await GET(anfrage('?limit=viele') as never)
    expect(res.status).toBe(400)
    expect(fake.auf('billing_audit_trail'), 'Es darf gar nicht abgefragt worden sein').toHaveLength(0)
  })

  it('weist 0, negative Werte und Kommazahlen ab', async () => {
    for (const wert of ['0', '-5', '12.5']) {
      fake = erstelleFakeSupabase(() => ({ data: [] }))
      ;(fake.client as unknown as { auth: unknown }).auth = {
        getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }),
      }
      const res = await GET(anfrage(`?limit=${wert}`) as never)
      expect(res.status, `limit=${wert}`).toBe(400)
    }
  })

  it('weist eine Angabe über 1000 ab, statt sie leise zu kappen', async () => {
    // Leises Kappen wäre die schlechtere Antwort: der Aufrufer bekäme
    // weniger Einträge als verlangt und hielte das Protokoll für
    // vollständig — bei einem Audit-Trail ist genau das der teure Irrtum.
    const res = await GET(anfrage('?limit=5000') as never)
    expect(res.status).toBe(400)
  })
})

describe('Mandant und Filter', () => {
  it('setzt den Mandanten aus dem Kontext, nicht aus der Adresszeile', async () => {
    await GET(anfrage('?organization_id=fremde-org') as never)
    expect(hatFilter(fake.ersterAuf('billing_audit_trail'), 'eq', 'organization_id', ORG)).toBe(true)
  })

  it('reicht Objekt-Filter und Zeitraum durch', async () => {
    await GET(anfrage('?entity_type=invoice&entity_id=re-1&from=2026-08-01T00:00:00Z&to=2026-08-31T23:59:59Z') as never)
    const a = fake.ersterAuf('billing_audit_trail')
    expect(hatFilter(a, 'eq', 'entity_type', 'invoice')).toBe(true)
    expect(hatFilter(a, 'eq', 'entity_id', 're-1')).toBe(true)
    expect(hatFilter(a, 'gte', 'created_at')).toBe(true)
    expect(hatFilter(a, 'lte', 'created_at')).toBe(true)
  })

  it('weist ohne abrechnung.lesen mit 403 ab und fragt nicht ab', async () => {
    darfLesen = false
    const res = await GET(anfrage() as never)
    expect(res.status).toBe(403)
    expect(fake.auf('billing_audit_trail')).toHaveLength(0)
  })
})
