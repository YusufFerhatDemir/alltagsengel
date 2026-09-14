/**
 * Der Riegel vor den Personalakten hing an einer Antwort, die es nie gab
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (Block 70)
 *
 * `personaldokumentAbgewehrt()` ist der Riegel, der ein Dokument aus einer
 * PERSONALAKTE von jemandem fernhält, dem `personal.lesen` fehlt. Drei
 * schreibende Routen des Aktenmoduls hängen daran:
 *
 *   PATCH  /api/akten/dokumente/[id]
 *   DELETE /api/akten/dokumente/[id]
 *   POST   /api/akten/dokumente/[id]/version
 *   POST   /api/akten/dokumente/[id]/sperren
 *
 * Die Abgrenzung läuft über `caregiver_id` der geladenen Zeile. Der
 * Lesefehler dieser Abfrage wurde verworfen:
 *
 *     const { data } = await dienstClient.from('akten_dokumente')…
 *     if (data?.caregiver_id) return 403
 *     return null                       // ← „Zugriff darf weitergehen"
 *
 * `data` ist bei einem Fehler null, `data?.caregiver_id` undefined — und
 * die Funktion antwortete mit „weitergehen". Ein Verbindungsabbruch, eine
 * Schemadrift oder eine Zeitüberschreitung reichten aus, um ein
 * Personaldokument an jemanden auszuliefern, dem die Berechtigung fehlt.
 *
 * Der lange Absatz über der Funktion wiegt eine Schwäche ab, die „heute
 * nicht ausnutzbar" ist. Diese hier war es.
 *
 * Die Routen fahren mit dem Dienstschlüssel — RLS sieht sie nie, der
 * Riegel ist die Route. Live: akten_dokumente hat 0 Zeilen, kein Schaden
 * im Bestand; `org_fence_akten_dokumente` ist RESTRICTIVE, der
 * Mandantenfilter in der Abfrage also tatsächlich nötig.
 */
import { describe, it, expect } from 'vitest'
import { erstelleFakeSupabase, hatFilter, type FakeAufruf } from '../helpers/supabase-fake'
import { personaldokumentAbgewehrt } from '@/lib/akten/api-auth'
import { readFileSync } from 'node:fs'

const ORG = '11111111-1111-4111-8111-111111111111'
const DOK = '22222222-2222-4222-8222-222222222222'
const CG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function ctx(darfPersonal: boolean) {
  return {
    userId: 'u-1',
    organizationId: ORG,
    role: 'buchhaltung',
    darf: (recht: string) => darfPersonal && recht === 'personal.lesen',
  } as never
}

function fake(antwort: { data?: unknown; error?: { message: string; code?: string } | null }) {
  return erstelleFakeSupabase((_a: FakeAufruf) => antwort)
}

async function abwehr(
  darfPersonal: boolean,
  antwort: { data?: unknown; error?: { message: string; code?: string } | null },
) {
  const f = fake(antwort)
  const res = await personaldokumentAbgewehrt(f.client, DOK, ctx(darfPersonal))
  return {
    status: res?.status ?? null,
    body: res ? await res.json() : null,
    aufrufe: f.aufrufe,
  }
}

describe('Wer personal.lesen hat, wird nicht abgewehrt', () => {
  it('und es wird gar nicht erst nachgesehen', async () => {
    const r = await abwehr(true, { data: { caregiver_id: CG } })
    expect(r.status).toBeNull()
    expect(r.aufrufe).toHaveLength(0)
  })
})

describe('Ohne personal.lesen entscheidet die Zeile', () => {
  it('Personalakte → 403', async () => {
    const r = await abwehr(false, { data: { caregiver_id: CG } })
    expect(r.status).toBe(403)
    expect(r.body.error).toMatch(/Personalakte/)
  })

  it('Klientendokument → durch', async () => {
    const r = await abwehr(false, { data: { caregiver_id: null } })
    expect(r.status).toBeNull()
  })

  it('unbekanntes Dokument → durch (den 404 vergibt der Vorgang selbst)', async () => {
    // Ausdrückliche Entscheidung der Funktion, hier festgehalten, damit sie
    // nicht versehentlich mit dem Fehlerfall zusammenfällt.
    const r = await abwehr(false, { data: null, error: null })
    expect(r.status).toBeNull()
  })
})

describe('Ein Lesefehler ist keine Auskunft über die Zuordnung', () => {
  it('wird NICHT zu „Zugriff darf weitergehen"', async () => {
    const r = await abwehr(false, { data: null, error: { message: 'connection reset', code: '08006' } })
    expect(r.status).not.toBeNull()
  })

  it('antwortet 503 — nicht 403 und nicht durch', async () => {
    const r = await abwehr(false, { data: null, error: { message: 'connection reset', code: '08006' } })
    expect(r.status).toBe(503)
  })

  it('sagt, dass nicht geprüft werden konnte — nicht, dass die Berechtigung fehlt', async () => {
    const r = await abwehr(false, { data: null, error: { message: 'x', code: '42703' } })
    expect(r.body.error).toMatch(/nicht zu prüfen/)
    expect(r.body.error).not.toMatch(/Berechtigung/)
  })

  it('gilt auch, wenn der Fehler eine Zeile MITLIEFERT', async () => {
    // PostgREST tut das nicht, aber eine Attrappe könnte es — und die
    // Reihenfolge im Code muss den Fehler zuerst sehen.
    const r = await abwehr(false, {
      data: { caregiver_id: null }, error: { message: 'x', code: '08006' },
    })
    expect(r.status).toBe(503)
  })
})

describe('Die Abfrage selbst', () => {
  it('trägt den Mandantenfilter von Hand — der Dienstschlüssel sieht den Zaun nicht', async () => {
    const r = await abwehr(false, { data: { caregiver_id: null } })
    expect(hatFilter(r.aufrufe[0], 'eq', 'organization_id', ORG)).toBe(true)
  })

  it('und die Kennung des Dokuments', async () => {
    const r = await abwehr(false, { data: { caregiver_id: null } })
    expect(hatFilter(r.aufrufe[0], 'eq', 'id', DOK)).toBe(true)
  })

  it('liest genau eine Tabelle', async () => {
    const r = await abwehr(false, { data: { caregiver_id: null } })
    expect(r.aufrufe.map(a => a.tabelle)).toEqual(['akten_dokumente'])
  })
})

describe('Quelltext', () => {
  const SRC = readFileSync('lib/akten/api-auth.ts', 'utf8')
  const RUMPF = SRC.slice(
    SRC.indexOf('export async function personaldokumentAbgewehrt'),
    SRC.indexOf('Auth-Guard für Kunden-/Engel-lesende Routen'),
  )

  it('nimmt den Lesefehler entgegen', () => {
    expect(RUMPF).toContain('const { data, error } = await dienstClient')
  })

  it('prüft ihn VOR der Zuordnungsfrage', () => {
    expect(RUMPF.indexOf('if (error) {')).toBeGreaterThan(-1)
    expect(RUMPF.indexOf('if (error) {')).toBeLessThan(RUMPF.indexOf('if (data?.caregiver_id)'))
  })
})
