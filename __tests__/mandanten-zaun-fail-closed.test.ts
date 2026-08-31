/**
 * Zaeune, die bei Stoerung aufgehen
 * =================================
 *
 * Ein Mandanten-Zaun hat zwei Zustaende, die im Code leicht gleich
 * aussehen: „diese Organisation hat keine Mitglieder" und „ich konnte die
 * Mitglieder nicht lesen". Wird der Zaun als BEDINGUNG formuliert — den
 * Filter nur anhaengen, wenn die Liste nicht leer ist —, faellt der zweite
 * Zustand auf die Seite „kein Filter", und die Abfrage laeuft ueber alle
 * Mandanten.
 *
 * Die Tests hier fahren genau diese beiden Zustaende gegen die Wege, die
 * sie betreffen, und pruefen, dass NICHTS hinausgeht.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { erstelleFakeSupabase, hatFilter, type FakeAufruf, type FakeSupabase } from './helpers/supabase-fake'

const ORG_A = '11111111-1111-4111-8111-111111111111'
const NUTZER = '22222222-2222-4222-8222-222222222222'
const FEHLER = { message: 'Verbindung unterbrochen', code: '08006' }

let aktiverFake: FakeSupabase
let orgId: string | null = ORG_A

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: NUTZER } }, error: null }) },
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => aktiverFake.client,
}))
vi.mock('@/lib/organizations/server', () => ({
  getActiveOrgIdOrDefault: async () => orgId,
}))
vi.mock('@/lib/monitoring/tracker', () => ({
  withTracking: (fn: unknown) => fn,
}))

function anfrage() {
  return new Request('https://alltagsengel.care/api/notify-admin-registration', {
    method: 'POST',
    body: JSON.stringify({
      userId: NUTZER, role: 'engel', firstName: 'Erika',
      lastName: 'Mustermann', email: 'e@example.org', phone: '0170',
    }),
  }) as never
}

/** Alle Admins ueber ALLE Mandanten — was ohne Zaun zurueckkaeme. */
const ADMINS_ALLER_MANDANTEN = [
  { id: 'admin-org-a', email: 'a@a.example', first_name: 'A' },
  { id: 'admin-org-b', email: 'b@b.example', first_name: 'B' },
]

describe('Registrierungsmeldung: der Mandanten-Zaun ist keine Bedingung', () => {
  beforeEach(() => { orgId = ORG_A; vi.clearAllMocks() })

  it('verschickt nichts, wenn die Mitgliederliste nicht lesbar ist', async () => {
    // Vorher: memberIdList blieb leer, `.in('id', …)` wurde nie angehaengt,
    // und die Meldung ueber den frisch Registrierten — Name, E-Mail,
    // Telefon — ging an die Admins JEDES Mandanten.
    aktiverFake = erstelleFakeSupabase((a: FakeAufruf) => {
      if (a.tabelle === 'organization_members') return { error: FEHLER, data: null }
      if (a.tabelle === 'profiles') return { data: ADMINS_ALLER_MANDANTEN }
      return { data: null }
    })

    const { POST } = await import('@/app/api/notify-admin-registration/route')
    const antwort = await POST(anfrage())
    const rumpf = await antwort.json()

    expect(rumpf.sent).toBe(0)
    expect(rumpf.grund).toBe('mitglieder_nicht_lesbar')
    // Der eigentliche Beweis: es wurde keine einzige Benachrichtigung angelegt.
    expect(aktiverFake.aufrufe.some(a => a.tabelle === 'notifications')).toBe(false)
  })

  it('verschickt nichts, wenn die Organisation keine Mitglieder hat', async () => {
    aktiverFake = erstelleFakeSupabase((a: FakeAufruf) => {
      if (a.tabelle === 'organization_members') return { data: [] }
      if (a.tabelle === 'profiles') return { data: ADMINS_ALLER_MANDANTEN }
      return { data: null }
    })

    const { POST } = await import('@/app/api/notify-admin-registration/route')
    const rumpf = await (await POST(anfrage())).json()

    expect(rumpf.sent).toBe(0)
    expect(rumpf.grund).toBe('keine_mitglieder')
    expect(aktiverFake.aufrufe.some(a => a.tabelle === 'notifications')).toBe(false)
  })

  it('verschickt nichts, wenn gar keine Organisation aufloesbar ist', async () => {
    orgId = null
    aktiverFake = erstelleFakeSupabase((a: FakeAufruf) => {
      if (a.tabelle === 'profiles') return { data: ADMINS_ALLER_MANDANTEN }
      return { data: null }
    })

    const { POST } = await import('@/app/api/notify-admin-registration/route')
    const rumpf = await (await POST(anfrage())).json()

    expect(rumpf.sent).toBe(0)
    expect(rumpf.grund).toBe('keine_organisation')
    expect(aktiverFake.aufrufe.some(a => a.tabelle === 'notifications')).toBe(false)
  })

  it('Gegenprobe: mit lesbaren Mitgliedern geht die Meldung raus — und NUR an die eigenen', async () => {
    aktiverFake = erstelleFakeSupabase((a: FakeAufruf) => {
      if (a.tabelle === 'organization_members') return { data: [{ user_id: 'admin-org-a' }] }
      if (a.tabelle === 'profiles') {
        return { data: [{ id: 'admin-org-a', email: 'a@a.example', first_name: 'A' }] }
      }
      if (a.tabelle === 'notifications') return { data: null }
      return { data: null }
    })

    const { POST } = await import('@/app/api/notify-admin-registration/route')
    const rumpf = await (await POST(anfrage())).json()

    expect(rumpf.sent).toBe(1)
    // Der Zaun sitzt jetzt bedingungslos an der Abfrage.
    const profilAbfrage = aktiverFake.aufrufe.find(a => a.tabelle === 'profiles')
    expect(hatFilter(profilAbfrage, 'in', 'id', ['admin-org-a'])).toBe(true)
  })
})

// ════════════════════════════════════════════════════════════════════
// clientId aus dem Rumpf — Aktenmodul
// ════════════════════════════════════════════════════════════════════

const KLIENT_FREMD = '33333333-3333-4333-8333-333333333333'

vi.mock('@/lib/akten/api-auth', () => ({
  requireAktenAdmin: async () => ({
    ok: true, ctx: { organizationId: ORG_A, userId: NUTZER, role: 'admin' },
  }),
}))

describe('Akten-Kontaktpersonen: die clientId aus dem Rumpf ist unbelegt', () => {
  function kontaktAnfrage(clientId: string) {
    return new Request('https://alltagsengel.care/api/akten/kontaktpersonen', {
      method: 'POST',
      body: JSON.stringify({
        clientId, rolle: 'angehoerige', vorname: 'Max', nachname: 'Mustermann',
      }),
    }) as never
  }

  it('legt keine Kontaktperson an einem Klienten eines fremden Mandanten an', async () => {
    // Geschrieben wird mit dem Dienstschluessel — RLS greift nicht, und
    // `client_id` ist ein einfacher Fremdschluessel. Die beiden
    // Schwesterwege des Moduls (dokumente, vertraege) pruefen das seit
    // Track 10; dieser war uebersehen worden.
    aktiverFake = erstelleFakeSupabase((a: FakeAufruf) => {
      // clients-Abfrage mit org-Fence findet den fremden Klienten nicht.
      if (a.tabelle === 'clients') return { data: null }
      return { data: null }
    })

    const { POST } = await import('@/app/api/akten/kontaktpersonen/route')
    const antwort = await POST(kontaktAnfrage(KLIENT_FREMD))

    expect(antwort.status).toBe(404)
    expect(aktiverFake.aufrufe.some(a => a.tabelle === 'akten_kontaktpersonen')).toBe(false)
  })

  it('Gegenprobe: beim eigenen Klienten wird angelegt', async () => {
    aktiverFake = erstelleFakeSupabase((a: FakeAufruf) => {
      if (a.tabelle === 'clients') return { data: { id: KLIENT_FREMD } }
      if (a.tabelle === 'akten_kontaktpersonen') {
        return { data: { id: 'kp-1', client_id: KLIENT_FREMD, organization_id: ORG_A } }
      }
      return { data: null }
    })

    const { POST } = await import('@/app/api/akten/kontaktpersonen/route')
    const antwort = await POST(kontaktAnfrage(KLIENT_FREMD))

    expect(antwort.status).toBe(200)
    const einfuegen = aktiverFake.aufrufe.find(
      a => a.tabelle === 'akten_kontaktpersonen' && a.operation === 'insert',
    )
    expect(einfuegen).toBeDefined()
    // Der Fence-Vorlauf muss die clients-Tabelle mit BEIDEN Bedingungen gefragt haben.
    const fence = aktiverFake.aufrufe.find(a => a.tabelle === 'clients')
    expect(hatFilter(fence, 'eq', 'organization_id', ORG_A)).toBe(true)
    expect(hatFilter(fence, 'eq', 'id', KLIENT_FREMD)).toBe(true)
  })
})
