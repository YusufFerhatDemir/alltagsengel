/**
 * Die Schreibseite des Aktenmoduls war offener als die Leseseite.
 *
 * ── DER BEFUND (29.08.2026), innerhalb EINER Datei sichtbar ──────────
 * `app/api/akten/dokumente/[id]/route.ts` prüft im GET-Handler seit
 * 0ba1d61e
 *
 *     if (dokument.caregiver_id && !auth.ctx.darf('personal.lesen'))
 *
 * PATCH und DELETE zwei Bildschirmseiten darunter nicht. Dasselbe für
 * `[id]/sperren` und `[id]/version`. Wer die Personalakte nicht LESEN
 * darf, konnte ein Dokument daraus also weiterhin umbenennen, sperren,
 * überschreiben oder löschen — nur nicht ansehen.
 *
 * ── WARUM DAS TROTZDEM HEUTE NICHT AUSNUTZBAR IST ───────────────────
 * `stammdaten.schreiben` hat aus `ROLLEN_MATRIX` nur, wer auch
 * `personal.lesen` hat (admin, superadmin, pdl). Der Riegel hing damit an
 * einer Eigenschaft der Rollentabelle statt an einer Prüfung — und die
 * Rollentabelle ist genau die Stelle, an der jemand später eine Rolle
 * ergänzt. Dass es heute nicht ausnutzbar ist, ist kein Grund, es stehen
 * zu lassen; es ist der Grund, warum es niemandem aufgefallen ist.
 *
 * Geprüft wird jeder Handler im LAUF: mit einem Aufrufer OHNE
 * `personal.lesen` — den es in der heutigen Rollentabelle nicht gibt, den
 * die Prüfung aber genau deshalb stellen muss.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { erstelleFakeSupabase, hatFilter, type FakeSupabase } from '../helpers/supabase-fake'

const ORG = '11111111-1111-4111-8111-111111111111'
const DOK = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const CG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

let fake: FakeSupabase
let darfPersonal = false
/** Die Zeile, die der Riegel beim Nachschlagen findet. */
let zeile: Record<string, unknown> | null

// Die Aufrufzähler der Fachfunktionen: der Riegel taugt nur, wenn er VOR
// ihnen greift. Ein 403, nachdem geschrieben wurde, ist kein Riegel.
const updateDokument = vi.fn(async () => ({ id: DOK }))
const softDeleteDokument = vi.fn(async () => {})
const lockDokument = vi.fn(async () => ({ id: DOK }))
const unlockDokument = vi.fn(async () => ({ id: DOK }))
const addDokumentVersion = vi.fn(async () => ({ id: DOK }))
const uploadDokumentDatei = vi.fn(async () => ({ dateipfad: 'p', dateiname: 'n', dateigroesse: 1, mimetype: 'application/pdf' }))
const getDokument = vi.fn(async () => zeile)

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => fake.client),
}))

// Der Guard selbst wird ersetzt, `personaldokumentAbgewehrt` NICHT: genau
// die Funktion ist der Prüfling.
vi.mock('@/lib/akten/api-auth', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/akten/api-auth')>()),
  requireAktenAdmin: vi.fn(async () => ({
    ok: true as const,
    ctx: {
      userId: 'u-1',
      organizationId: ORG,
      role: darfPersonal ? 'pdl' : 'buchhaltung',
      darf: (b: string) => (b === 'personal.lesen' ? darfPersonal : true),
    },
  })),
}))

vi.mock('@/lib/akten/dokumente', () => ({
  updateDokument, softDeleteDokument, lockDokument, unlockDokument,
  addDokumentVersion, uploadDokumentDatei, getDokument,
  listDokumente: vi.fn(), createDokument: vi.fn(), getSignedDokumentUrl: vi.fn(),
}))

const { PATCH, DELETE } = await import('@/app/api/akten/dokumente/[id]/route')
const { POST: sperrenPOST } = await import('@/app/api/akten/dokumente/[id]/sperren/route')
const { POST: versionPOST } = await import('@/app/api/akten/dokumente/[id]/version/route')

const ctx = { params: Promise.resolve({ id: DOK }) }

const json = (body: unknown, methode = 'PATCH') =>
  new Request(`http://localhost/api/akten/dokumente/${DOK}`, {
    method: methode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })

function formular(): Request {
  const fd = new FormData()
  fd.set('file', new File(['x'], 'neu.pdf', { type: 'application/pdf' }))
  return new Request(`http://localhost/api/akten/dokumente/${DOK}/version`, { method: 'POST', body: fd })
}

beforeEach(() => {
  vi.clearAllMocks()
  darfPersonal = false
  zeile = { id: DOK, organization_id: ORG, caregiver_id: CG, client_id: null }
  fake = erstelleFakeSupabase(() => ({ data: zeile }))
})

const VORGAENGE = [
  { name: 'PATCH', lauf: () => PATCH(json({ titel: 'Umbenannt' }) as never, ctx as never), fach: updateDokument },
  { name: 'DELETE', lauf: () => DELETE(json({}, 'DELETE') as never, ctx as never), fach: softDeleteDokument },
  { name: 'sperren', lauf: () => sperrenPOST(json({ grund: 'Test' }, 'POST') as never, ctx as never), fach: lockDokument },
  { name: 'version', lauf: () => versionPOST(formular() as never, ctx as never), fach: addDokumentVersion },
] as const

describe.each(VORGAENGE)('$name auf einem Dokument der Personalakte', (fall) => {
  it('antwortet mit 403, wenn personal.lesen fehlt', async () => {
    const res = await fall.lauf()
    expect(res.status).toBe(403)
  })

  it('führt den Vorgang dabei GAR NICHT aus', async () => {
    await fall.lauf()
    expect(fall.fach).not.toHaveBeenCalled()
  })

  it('antwortet 403 und nicht 404 — die Zeile gibt es, nur nicht für diesen Aufrufer', async () => {
    const res = await fall.lauf()
    expect(res.status).not.toBe(404)
    const body = await res.json() as { error: string }
    expect(body.error).toMatch(/Personalakte/i)
  })

  it('lässt den Vorgang mit personal.lesen durch', async () => {
    darfPersonal = true
    const res = await fall.lauf()
    expect(res.status).toBe(200)
    expect(fall.fach).toHaveBeenCalled()
  })

  it('lässt ein KLIENTENdokument auch ohne personal.lesen durch', async () => {
    zeile = { id: DOK, organization_id: ORG, caregiver_id: null, client_id: 'c-1' }
    const res = await fall.lauf()
    expect(res.status).toBe(200)
    expect(fall.fach).toHaveBeenCalled()
  })

  it('schlägt die Zeile mit Mandanten-Fence nach', async () => {
    // Der Dienstschlüssel sieht `org_fence_akten_dokumente` nicht — der
    // Fence muss von Hand an der Abfrage stehen.
    await fall.lauf()
    const nachschlag = fake.ersterAuf('akten_dokumente', 'select')
    expect(hatFilter(nachschlag, 'eq', 'organization_id', ORG)).toBe(true)
    expect(hatFilter(nachschlag, 'eq', 'id', DOK)).toBe(true)
  })

  it('schlägt gar nicht erst nach, wenn der Aufrufer personal.lesen hat', async () => {
    // Eine Abfrage, deren Ergebnis nichts ändern kann, ist eine Abfrage zu viel.
    darfPersonal = true
    await fall.lauf()
    expect(fake.auf('akten_dokumente')).toHaveLength(0)
  })
})

describe('Entsperren ist derselbe Eingriff wie Sperren', () => {
  it('weist auch das Entsperren eines Personaldokuments ab', async () => {
    const res = await sperrenPOST(json({ gesperrt: false }, 'POST') as never, ctx as never)
    expect(res.status).toBe(403)
    expect(unlockDokument).not.toHaveBeenCalled()
  })
})
