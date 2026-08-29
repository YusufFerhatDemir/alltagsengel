/**
 * Die Personalakte konnte anlegen und nichts korrigieren.
 *
 * BEFUND (29.08.2026): `PATCH`/`DELETE` auf
 * `/api/personal/qualifikationen/[id]` und `/api/personal/schulungen/[id]`
 * sind vollständig und wurden von KEINER Stelle der Oberfläche aufgerufen.
 * Bei einer Schulung wäre das lästig; bei einer Qualifikation ist es
 * betrieblich: `valid_until`, `pflicht` und `einsatzrelevant` steuern
 * `pruefeEinsatzfreigabe` — ein falsch eingetragenes Ablaufdatum sperrt
 * eine Pflegekraft für die Einsatzplanung, und es gab keinen Weg, es zu
 * berichtigen.
 *
 * ZWEI BEFUNDE IN DEN LÖSCHWEGEN, beim Verdrahten gefunden:
 *
 *  1. Beide meldeten ERFOLG, auch wenn nichts gelöscht wurde — bei einer
 *     unbekannten Kennung ebenso wie bei einer Zeile eines fremden
 *     Mandanten. Der Org-Fence griff (es wurde nichts angefasst), die
 *     Antwort war trotzdem `{ ok: true }`.
 *  2. `updateSchulung` weist jede Änderung an einer BESTANDENEN Schulung
 *     mit 409 ab — sie ist ein Nachweis. Das Löschen war davon nicht
 *     erfasst. Löschen ist der stärkere Eingriff.
 *
 * Die Handler laufen hier wirklich, über einen protokollierenden
 * Supabase-Doppelgänger.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  erstelleFakeSupabase, hatFilter, hatOrgFence,
  type FakeAufruf, type FakeSupabase,
} from '../helpers/supabase-fake'

const ORG = '11111111-1111-4111-8111-111111111111'
const USER = '44444444-4444-4444-8444-444444444444'
const ID = '88888888-8888-4888-8888-888888888888'

let fake: FakeSupabase
let darfSchreiben = true
/** Was der Doppelgänger als vorhandene Zeile liefert. */
let quali: Record<string, unknown> | null
let schulung: Record<string, unknown> | null

vi.mock('@/lib/personal/api-auth', () => ({
  requirePersonalAdmin: vi.fn(async () => (
    darfSchreiben
      ? { ok: true, ctx: { userId: USER, organizationId: ORG, role: 'pdl', name: 'Test' } }
      : { ok: false, response: new Response(JSON.stringify({ error: 'fehlt' }), { status: 403 }) }
  )),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => fake.client),
}))

const quWeg = await import('@/app/api/personal/qualifikationen/[id]/route')
const scWeg = await import('@/app/api/personal/schulungen/[id]/route')

const ctx = { params: Promise.resolve({ id: ID }) }

const patch = (pfad: string, body: unknown) =>
  new Request(`http://localhost/api/personal/${pfad}/${ID}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
const entf = (pfad: string) =>
  new Request(`http://localhost/api/personal/${pfad}/${ID}`, { method: 'DELETE' })

function schreibvorgang(tabelle: string, op: 'update' | 'delete'): FakeAufruf | undefined {
  return fake.auf(tabelle).find(a => a.operation === op)
}

beforeEach(() => {
  darfSchreiben = true
  quali = { id: ID, organization_id: ORG, title: 'Erste Hilfe', valid_until: '2027-01-01' }
  schulung = { id: ID, organization_id: ORG, bestanden: null, beginn: '2026-05-01', ende: null }
  fake = erstelleFakeSupabase((a) => {
    if (a.tabelle === 'caregiver_qualifications') {
      return a.operation === 'select' ? { data: quali } : { data: { ...quali, ...(a.payload as object) } }
    }
    if (a.tabelle === 'personal_schulungen') {
      return a.operation === 'select' ? { data: schulung } : { data: { ...schulung, ...(a.payload as object) } }
    }
    return { data: null, error: null }
  })
})

describe('Qualifikation — Berechtigung und Mandant', () => {
  it('weist PATCH ohne personal.schreiben mit 403 ab und fasst nichts an', async () => {
    darfSchreiben = false
    const res = await quWeg.PATCH(patch('qualifikationen', { title: 'x' }) as never, ctx as never)
    expect(res.status).toBe(403)
    expect(fake.aufrufe).toHaveLength(0)
  })

  it('weist DELETE ohne personal.schreiben mit 403 ab', async () => {
    darfSchreiben = false
    const res = await quWeg.DELETE(entf('qualifikationen') as never, ctx as never)
    expect(res.status).toBe(403)
    expect(fake.aufrufe).toHaveLength(0)
  })

  it('schreibt mit Org-Fence', async () => {
    await quWeg.PATCH(patch('qualifikationen', { validUntil: '2027-06-30' }) as never, ctx as never)
    expect(hatOrgFence(schreibvorgang('caregiver_qualifications', 'update'), ORG)).toBe(true)
  })

  it('nimmt den Mandanten aus dem Kontext, nicht aus dem Body', async () => {
    await quWeg.PATCH(patch('qualifikationen', { validUntil: '2027-06-30', organizationId: 'fremd' }) as never, ctx as never)
    expect(hatFilter(schreibvorgang('caregiver_qualifications', 'update'), 'eq', 'organization_id', 'fremd')).toBe(false)
  })
})

describe('Qualifikation — was das Ablaufdatum steuert', () => {
  it('schreibt das korrigierte Ablaufdatum', async () => {
    const res = await quWeg.PATCH(patch('qualifikationen', { validUntil: '2027-06-30' }) as never, ctx as never)
    expect(res.status).toBe(200)
    expect((schreibvorgang('caregiver_qualifications', 'update')?.payload as Record<string, unknown>).valid_until)
      .toBe('2027-06-30')
  })

  it('nimmt null als „unbefristet" an — der haeufigste Korrekturfall', async () => {
    await quWeg.PATCH(patch('qualifikationen', { validUntil: null }) as never, ctx as never)
    expect((schreibvorgang('caregiver_qualifications', 'update')?.payload as Record<string, unknown>).valid_until)
      .toBeNull()
  })

  it('weist ein unbrauchbares Datum ab, statt es umzudeuten', async () => {
    const res = await quWeg.PATCH(patch('qualifikationen', { validUntil: '30.06.2027' }) as never, ctx as never)
    expect(res.status).toBe(400)
    expect(schreibvorgang('caregiver_qualifications', 'update')).toBeUndefined()
  })

  it('weist einen leeren Titel ab — die Zeile waere danach nicht mehr zuzuordnen', async () => {
    const res = await quWeg.PATCH(patch('qualifikationen', { title: '   ' }) as never, ctx as never)
    expect(res.status).toBe(400)
    expect(schreibvorgang('caregiver_qualifications', 'update')).toBeUndefined()
  })

  it('schreibt pflicht und einsatzrelevant durch — beide steuern die Einsatzfreigabe', async () => {
    await quWeg.PATCH(patch('qualifikationen', { pflicht: true, einsatzrelevant: false }) as never, ctx as never)
    const nutzlast = schreibvorgang('caregiver_qualifications', 'update')?.payload as Record<string, unknown>
    expect(nutzlast.pflicht).toBe(true)
    expect(nutzlast.einsatzrelevant).toBe(false)
  })

  it('weist einen leeren Patch ab, statt eine leere Änderung zu schreiben', async () => {
    const res = await quWeg.PATCH(patch('qualifikationen', {}) as never, ctx as never)
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(schreibvorgang('caregiver_qualifications', 'update')).toBeUndefined()
  })
})

describe('Qualifikation — Löschen meldet nur noch Erfolg, wenn es einen gab', () => {
  it('löscht mit Org-Fence', async () => {
    const res = await quWeg.DELETE(entf('qualifikationen') as never, ctx as never)
    expect(res.status).toBe(200)
    expect(hatOrgFence(schreibvorgang('caregiver_qualifications', 'delete'), ORG)).toBe(true)
  })

  it('antwortet mit 404 auf eine unbekannte Kennung — vorher war das ein ok:true', async () => {
    quali = null
    const res = await quWeg.DELETE(entf('qualifikationen') as never, ctx as never)
    expect(res.status).toBe(404)
    expect(schreibvorgang('caregiver_qualifications', 'delete')).toBeUndefined()
  })

  it('behandelt eine Zeile eines fremden Mandanten wie eine unbekannte', async () => {
    // Der Org-Fence macht sie unsichtbar; die Antwort muss dasselbe sagen
    // und nicht „gelöscht".
    quali = null
    const res = await quWeg.DELETE(entf('qualifikationen') as never, ctx as never)
    expect(res.status).toBe(404)
  })
})

describe('Schulung — Korrektur', () => {
  it('schreibt Titel, Datum und Anbieter', async () => {
    const res = await scWeg.PATCH(
      patch('schulungen', { titel: 'Hygiene', beginn: '2026-05-04', anbieter: 'DRK' }) as never, ctx as never,
    )
    expect(res.status).toBe(200)
    const nutzlast = schreibvorgang('personal_schulungen', 'update')?.payload as Record<string, unknown>
    expect(nutzlast).toMatchObject({ titel: 'Hygiene', beginn: '2026-05-04', anbieter: 'DRK' })
  })

  it('nimmt bestanden = false an — „nicht bestanden" ist etwas anderes als „offen"', async () => {
    await scWeg.PATCH(patch('schulungen', { bestanden: false }) as never, ctx as never)
    expect((schreibvorgang('personal_schulungen', 'update')?.payload as Record<string, unknown>).bestanden).toBe(false)
  })

  it('antwortet mit 404 auf eine unbekannte Kennung', async () => {
    schulung = null
    const res = await scWeg.PATCH(patch('schulungen', { titel: 'x' }) as never, ctx as never)
    expect(res.status).toBe(404)
  })
})

describe('Schulung — der bestandene Nachweis', () => {
  beforeEach(() => { schulung = { ...schulung!, bestanden: true } })

  it('weist die Änderung mit 409 ab', async () => {
    const res = await scWeg.PATCH(patch('schulungen', { titel: 'Andere Schulung' }) as never, ctx as never)
    expect(res.status).toBe(409)
    expect(schreibvorgang('personal_schulungen', 'update')).toBeUndefined()
  })

  it('weist seit dem 29.08.2026 auch das Löschen mit 409 ab', async () => {
    // Vorher liess sich genau das loeschen, was sich nicht aendern liess.
    const res = await scWeg.DELETE(entf('schulungen') as never, ctx as never)
    expect(res.status).toBe(409)
    expect(schreibvorgang('personal_schulungen', 'delete')).toBeUndefined()
  })

  it('nennt dabei den Weg, der bleibt', async () => {
    const res = await scWeg.DELETE(entf('schulungen') as never, ctx as never)
    const json = await res.json() as { error: string }
    expect(json.error).toMatch(/Bemerkung/i)
  })

  it('lässt eine noch offene Schulung weiterhin löschen', async () => {
    schulung = { ...schulung!, bestanden: null }
    const res = await scWeg.DELETE(entf('schulungen') as never, ctx as never)
    expect(res.status).toBe(200)
    expect(schreibvorgang('personal_schulungen', 'delete')).toBeDefined()
  })

  it('lässt eine NICHT bestandene Schulung löschen — sie ist kein Nachweis', async () => {
    schulung = { ...schulung!, bestanden: false }
    const res = await scWeg.DELETE(entf('schulungen') as never, ctx as never)
    expect(res.status).toBe(200)
  })
})
