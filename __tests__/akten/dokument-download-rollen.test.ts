/**
 * Die Akte war für die Rollen, die sie führen, nur zur Hälfte da.
 *
 * ── DER BEFUND (29.08.2026, live aus `pg_policies` und
 *    `pg_get_functiondef` gelesen) ────────────────────────────────────
 * `GET /api/akten/dokumente/[id]/download` liest die Zeile mit dem
 * RLS-gebundenen Client des angemeldeten Nutzers. Auf `akten_dokumente`
 * stehen live vier Policies: `admin_akten_dokumente` (ALL, `is_admin()`),
 * `kunde_akten_dokumente_select`, `engel_akten_dokumente_select` und der
 * RESTRICTIVE `org_fence_akten_dokumente`.
 *
 * `is_admin()` ist live auf `role IN ('admin','superadmin')` beschränkt.
 * Für `pdl`, `qm` und `buchhaltung` trifft damit KEINE der drei
 * permissiven Policies zu — sie sind weder Administration noch Kunde noch
 * Engel der Zeile. Die Abfrage lieferte nichts, und die Route antwortete
 * „Dokument nicht gefunden oder kein Zugriff."
 *
 * Dieselben Rollen dürfen `/api/akten/dokumente` und `/api/akten/suche`
 * lesen (`stammdaten.lesen`). Sie SAHEN das Dokument also in jeder Liste
 * und bekamen es nicht heraus — die Pflegedienstleitung, die die Akte
 * führt, konnte kein einziges Dokument öffnen.
 *
 * ── WAS SICH GEÄNDERT HAT ───────────────────────────────────────────
 * Ein zweiter Weg NACH dem RLS-Lauf: wer `stammdaten.lesen` hat, bekommt
 * die Zeile über den Dienstschlüssel — mit von Hand gesetztem
 * Mandanten-Fence (der Dienstschlüssel sieht `org_fence_…` nicht) und mit
 * derselben Personalakten-Regel wie die Listen (0ba1d61e): ein Dokument
 * mit `caregiver_id` braucht `personal.lesen`.
 *
 * Fail-closed: ohne `stammdaten.lesen` bleibt es beim 404 von vorher.
 * Der Statusriegel (`darfAusgeliefertWerden`) liegt hinter beiden Wegen
 * und gilt unverändert für beide.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { erstelleFakeSupabase, hatFilter, type FakeSupabase } from '../helpers/supabase-fake'

const ORG = '11111111-1111-4111-8111-111111111111'
const DOK = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const CG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

let fake: FakeSupabase
/** Was der RLS-gebundene Client zurückgibt — null heißt „Policy trifft nicht". */
let rlsZeile: Record<string, unknown> | null
/** Was der Dienstschlüssel findet. */
let dienstZeile: Record<string, unknown> | null
let istAktenAdmin = true
let darfPersonal = false

const getSignedDokumentUrl = vi.fn(async () => 'https://beispiel.invalid/signiert')
const logAktenZugriff = vi.fn(async () => {})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          is: () => ({ maybeSingle: async () => ({ data: rlsZeile, error: null }) }),
        }),
      }),
    }),
  })),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => fake.client),
}))

vi.mock('@/lib/akten/api-auth', () => ({
  requireAktenUser: vi.fn(async () => ({ ok: true as const, userId: 'u-1' })),
  requireAktenAdmin: vi.fn(async () => (
    istAktenAdmin
      ? {
          ok: true as const,
          ctx: {
            userId: 'u-1', organizationId: ORG,
            role: darfPersonal ? 'pdl' : 'buchhaltung',
            darf: (b: string) => (b === 'personal.lesen' ? darfPersonal : true),
          },
        }
      : { ok: false as const, response: new Response(null, { status: 403 }) }
  )),
}))

vi.mock('@/lib/akten/dokumente', () => ({ getSignedDokumentUrl }))
vi.mock('@/lib/akten/zugriff-log', () => ({ logAktenZugriff }))

const { GET } = await import('@/app/api/akten/dokumente/[id]/download/route')

const ctx = { params: Promise.resolve({ id: DOK }) }
const anfrage = () => new Request(`http://localhost/api/akten/dokumente/${DOK}/download`)

const KLIENTENDOK = {
  id: DOK, organization_id: ORG, dateipfad: 'p/x.pdf', dateiname: 'x.pdf',
  client_id: 'c-1', caregiver_id: null, status: 'aktiv',
}

beforeEach(() => {
  vi.clearAllMocks()
  rlsZeile = null
  dienstZeile = { ...KLIENTENDOK }
  istAktenAdmin = true
  darfPersonal = false
  fake = erstelleFakeSupabase(() => ({ data: dienstZeile }))
})

describe('Der bisherige Weg bleibt, wie er war', () => {
  it('liefert aus, wenn die RLS-Policy greift (Kunde, Engel, Administration)', async () => {
    rlsZeile = { ...KLIENTENDOK }
    const res = await GET(anfrage() as never, ctx as never)
    expect(res.status).toBe(200)
    // Der zweite Weg wird dann gar nicht erst betreten.
    expect(fake.aufrufe).toHaveLength(0)
  })

  it('weist ein gesperrtes Dokument auch auf dem RLS-Weg ab', async () => {
    rlsZeile = { ...KLIENTENDOK, status: 'gesperrt' }
    const res = await GET(anfrage() as never, ctx as never)
    expect(res.status).toBe(403)
    expect(getSignedDokumentUrl).not.toHaveBeenCalled()
  })
})

describe('Der zweite Weg: wer die Akte führt, darf herunterladen', () => {
  it('liefert das Klientendokument aus, obwohl RLS nichts zurückgab', async () => {
    const res = await GET(anfrage() as never, ctx as never)
    expect(res.status).toBe(200)
    const body = await res.json() as { url: string; dateiname: string }
    expect(body.url).toContain('signiert')
    expect(body.dateiname).toBe('x.pdf')
  })

  it('setzt den Mandanten-Fence von Hand — der Dienstschlüssel sieht org_fence nicht', async () => {
    await GET(anfrage() as never, ctx as never)
    const nachschlag = fake.ersterAuf('akten_dokumente', 'select')
    expect(hatFilter(nachschlag, 'eq', 'organization_id', ORG)).toBe(true)
    expect(hatFilter(nachschlag, 'eq', 'id', DOK)).toBe(true)
  })

  it('schließt gelöschte Zeilen aus', async () => {
    const nachschlag = await GET(anfrage() as never, ctx as never).then(() => fake.ersterAuf('akten_dokumente', 'select'))
    expect(hatFilter(nachschlag, 'is', 'deleted_at', null)).toBe(true)
  })

  it('hält den Zugriff im Zugriffsprotokoll fest', async () => {
    await GET(anfrage() as never, ctx as never)
    expect(logAktenZugriff).toHaveBeenCalled()
  })

  it('weist ein gesperrtes Dokument auch auf diesem Weg ab', async () => {
    dienstZeile = { ...KLIENTENDOK, status: 'gesperrt' }
    const res = await GET(anfrage() as never, ctx as never)
    expect(res.status).toBe(403)
    expect(getSignedDokumentUrl).not.toHaveBeenCalled()
  })
})

describe('Die Personalakte bleibt Personalakte', () => {
  beforeEach(() => { dienstZeile = { ...KLIENTENDOK, client_id: null, caregiver_id: CG } })

  it('weist ein Mitarbeiterdokument ohne personal.lesen mit 403 ab', async () => {
    const res = await GET(anfrage() as never, ctx as never)
    expect(res.status).toBe(403)
    expect(getSignedDokumentUrl).not.toHaveBeenCalled()
  })

  it('nennt den Grund, statt es als „nicht gefunden" auszugeben', async () => {
    const res = await GET(anfrage() as never, ctx as never)
    const body = await res.json() as { error: string }
    expect(body.error).toMatch(/Personalakte/i)
  })

  it('liefert es mit personal.lesen aus', async () => {
    darfPersonal = true
    const res = await GET(anfrage() as never, ctx as never)
    expect(res.status).toBe(200)
  })
})

describe('Fail-closed', () => {
  it('bleibt bei 404, wenn der Aufrufer die Akte gar nicht lesen darf', async () => {
    istAktenAdmin = false
    const res = await GET(anfrage() as never, ctx as never)
    expect(res.status).toBe(404)
    expect(fake.aufrufe).toHaveLength(0)
    expect(getSignedDokumentUrl).not.toHaveBeenCalled()
  })

  it('bleibt bei 404, wenn es die Zeile im eigenen Mandanten nicht gibt', async () => {
    dienstZeile = null
    const res = await GET(anfrage() as never, ctx as never)
    expect(res.status).toBe(404)
    expect(getSignedDokumentUrl).not.toHaveBeenCalled()
  })
})
