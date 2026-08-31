/**
 * Kontaktpersonen liessen sich lesen und sonst nichts.
 *
 * BEFUND (29.08.2026): `/admin/kundenakte/[id]` zeigte den Reiter
 * „Kontaktpersonen" als reine Liste. `POST /api/akten/kontaktpersonen`
 * und `PATCH`/`DELETE` auf `/api/akten/kontaktpersonen/[id]` sind
 * vollständig und wurden von KEINER Stelle aufgerufen — eine
 * Kontaktperson war also weder anlegbar noch änderbar noch entfernbar.
 * In dieser Liste stehen Betreuer, Bevollmächtigte und Notfallkontakte;
 * eine falsche Telefonnummer darin ist kein Schönheitsfehler.
 *
 * ZWEI BEFUNDE IN DEN SCHREIBWEGEN, beim Verdrahten gefunden:
 *
 *  1. `softDeleteKontaktperson` setzte `deleted_at` per UPDATE. Ein
 *     UPDATE, das KEINE Zeile trifft, ist in PostgREST kein Fehler — bei
 *     unbekannter Kennung oder fremdem Mandanten lief das Löschen durch,
 *     die Route antwortete `{ success: true }`, und es entstand ein
 *     Zugriffsprotokoll-Eintrag „geloescht" über eine Kontaktperson, die
 *     es weiter gibt. Ein Protokoll, das eine nicht erfolgte Löschung
 *     festhält, ist schlimmer als gar keines.
 *  2. `updateKontaktperson` baute den Patch aus bekannten Feldern und
 *     schrieb ihn auch dann, wenn kein einziges dabei war — leeres
 *     UPDATE, Erfolgsantwort, Protokolleintrag „bearbeitet" über nichts.
 *
 * NACHTRAG (01.09.2026): `POST` fragt seit dem Security-Review (29f7b07)
 * über `clientGehoertZuOrg`, ob die `clientId` aus dem Rumpf überhaupt zum
 * Mandanten des Aufrufers gehört — geschrieben wird mit dem
 * Dienstschlüssel, RLS greift dort nicht. Der Doppelgänger beantwortete
 * `clients` nicht und lieferte damit „Klient unbekannt": die beiden
 * Anlege-Tests liefen ab da gegen 404. Der Fake kennt den Klienten jetzt,
 * und der Zaun selbst ist mit eigenen Fällen belegt — sonst wäre der
 * grüne Lauf wieder nur die Abwesenheit der Frage.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { erstelleFakeSupabase, hatFilter, hatOrgFence, type FakeSupabase } from '../helpers/supabase-fake'

const ORG = '11111111-1111-4111-8111-111111111111'
const KP = 'kkkkkkkk-kkkk-4kkk-8kkk-kkkkkkkkkkkk'
const CLIENT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

let fake: FakeSupabase
let darfSchreiben = true
/** Was das UPDATE zurückgibt — null heißt „keine Zeile getroffen". */
let getroffen: Record<string, unknown> | null
/** Was `clients` auf die Mandantenfrage zurückgibt — null heißt „fremd oder unbekannt". */
let klientImMandanten: Record<string, unknown> | null

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => fake.client),
}))

vi.mock('@/lib/akten/api-auth', () => ({
  requireAktenAdmin: vi.fn(async () => (
    darfSchreiben
      ? { ok: true as const, ctx: { userId: 'u-1', organizationId: ORG, role: 'pdl', darf: () => true } }
      : { ok: false as const, response: new Response(JSON.stringify({ error: 'fehlt' }), { status: 403 }) }
  )),
}))

vi.mock('@/lib/akten/zugriff-log', () => ({ logAktenZugriff: vi.fn(async () => {}) }))

const { POST } = await import('@/app/api/akten/kontaktpersonen/route')
const { PATCH, DELETE } = await import('@/app/api/akten/kontaktpersonen/[id]/route')

const ctx = { params: Promise.resolve({ id: KP }) }
const anfrage = (body: unknown, methode = 'PATCH', pfad = KP) =>
  new Request(`http://localhost/api/akten/kontaktpersonen/${pfad}`, {
    method: methode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })

const schreibvorgang = () => fake.auf('akten_kontaktpersonen').find(a => a.operation === 'update')

beforeEach(() => {
  darfSchreiben = true
  getroffen = { id: KP, organization_id: ORG, vorname: 'Anna', nachname: 'Muster' }
  klientImMandanten = { id: CLIENT }
  fake = erstelleFakeSupabase((a) => {
    if (a.tabelle === 'akten_kontaktpersonen') return { data: getroffen }
    if (a.tabelle === 'clients') return { data: klientImMandanten }
    return { data: null, error: null }
  })
})

describe('Anlegen', () => {
  it('verlangt clientId, rolle, vorname und nachname', async () => {
    const res = await POST(anfrage({ clientId: CLIENT, rolle: 'betreuer' }, 'POST', '') as never)
    expect(res.status).toBe(400)
    expect(fake.aufrufe).toHaveLength(0)
  })

  it('legt mit vollständigen Angaben an', async () => {
    const res = await POST(anfrage(
      { clientId: CLIENT, rolle: 'betreuer', vorname: 'Anna', nachname: 'Muster' }, 'POST', '',
    ) as never)
    expect(res.status).toBe(200)
    const nutzlast = fake.ersterAuf('akten_kontaktpersonen', 'insert')?.payload as Record<string, unknown>
    expect(nutzlast.organization_id).toBe(ORG)
    expect(nutzlast.client_id).toBe(CLIENT)
  })

  it('nimmt den Mandanten aus dem Kontext, nicht aus dem Body', async () => {
    await POST(anfrage(
      { clientId: CLIENT, rolle: 'betreuer', vorname: 'A', nachname: 'B', organizationId: 'fremd' }, 'POST', '',
    ) as never)
    const nutzlast = fake.ersterAuf('akten_kontaktpersonen', 'insert')?.payload as Record<string, unknown>
    expect(nutzlast.organization_id).toBe(ORG)
  })

  it('prüft die clientId aus dem Rumpf gegen den Mandanten — mit Fence, nicht nur auf Existenz', async () => {
    await POST(anfrage(
      { clientId: CLIENT, rolle: 'betreuer', vorname: 'A', nachname: 'B' }, 'POST', '',
    ) as never)
    const zaun = fake.ersterAuf('clients', 'select')
    expect(zaun).toBeDefined()
    expect(hatFilter(zaun, 'eq', 'id', CLIENT)).toBe(true)
    expect(hatOrgFence(zaun, ORG)).toBe(true)
  })

  it('weist einen fremden Klienten mit 404 ab und legt nichts an', async () => {
    klientImMandanten = null
    const res = await POST(anfrage(
      { clientId: CLIENT, rolle: 'betreuer', vorname: 'A', nachname: 'B' }, 'POST', '',
    ) as never)
    expect(res.status).toBe(404)
    expect(fake.ersterAuf('akten_kontaktpersonen', 'insert')).toBeUndefined()
  })

  it('fragt den Zaun vor dem Schreiben, nicht danach', async () => {
    await POST(anfrage(
      { clientId: CLIENT, rolle: 'betreuer', vorname: 'A', nachname: 'B' }, 'POST', '',
    ) as never)
    const zaun = fake.ersterAuf('clients', 'select')!
    const schreiben = fake.ersterAuf('akten_kontaktpersonen', 'insert')!
    expect(zaun.gesamtNr).toBeLessThan(schreiben.gesamtNr)
  })
})

describe('Ändern', () => {
  it('weist ohne stammdaten.schreiben mit 403 ab und fasst nichts an', async () => {
    darfSchreiben = false
    const res = await PATCH(anfrage({ telefon: '030 1234' }) as never, ctx as never)
    expect(res.status).toBe(403)
    expect(fake.aufrufe).toHaveLength(0)
  })

  it('schreibt mit Org-Fence', async () => {
    await PATCH(anfrage({ telefon: '030 1234' }) as never, ctx as never)
    expect(hatOrgFence(schreibvorgang(), ORG)).toBe(true)
    expect(hatFilter(schreibvorgang(), 'eq', 'id', KP)).toBe(true)
  })

  it('bildet die Felder auf die Spalten ab', async () => {
    await PATCH(anfrage({ vollmachtTyp: 'vorsorgevollmacht', istHauptkontakt: true }) as never, ctx as never)
    const nutzlast = schreibvorgang()?.payload as Record<string, unknown>
    expect(nutzlast.vollmacht_typ).toBe('vorsorgevollmacht')
    expect(nutzlast.ist_hauptkontakt).toBe(true)
  })

  it('nimmt null an — „keine Vollmacht" ist eine Angabe, kein Weglassen', async () => {
    await PATCH(anfrage({ vollmachtTyp: null }) as never, ctx as never)
    expect((schreibvorgang()?.payload as Record<string, unknown>).vollmacht_typ).toBeNull()
  })

  it('weist einen Patch ohne bekanntes Feld ab, statt ein leeres UPDATE zu schreiben', async () => {
    const res = await PATCH(anfrage({ unbekanntesFeld: 'x' }) as never, ctx as never)
    expect(res.status).toBe(400)
    expect(schreibvorgang()).toBeUndefined()
  })
})

describe('Entfernen', () => {
  it('setzt einen Soft-Delete statt zu löschen — die Historie bleibt', async () => {
    const res = await DELETE(anfrage({}, 'DELETE') as never, ctx as never)
    expect(res.status).toBe(200)
    expect((schreibvorgang()?.payload as Record<string, unknown>).deleted_at).toBeTruthy()
  })

  it('setzt dabei den Org-Fence', async () => {
    await DELETE(anfrage({}, 'DELETE') as never, ctx as never)
    expect(hatOrgFence(schreibvorgang(), ORG)).toBe(true)
  })

  it('antwortet mit 404, wenn keine Zeile getroffen wurde — vorher war das ein success:true', async () => {
    getroffen = null
    const res = await DELETE(anfrage({}, 'DELETE') as never, ctx as never)
    expect(res.status).toBe(404)
  })

  it('behandelt eine Zeile eines fremden Mandanten wie eine unbekannte', async () => {
    getroffen = null
    const res = await DELETE(anfrage({}, 'DELETE') as never, ctx as never)
    expect(res.status).toBe(404)
  })
})
