/**
 * Track 12 / B1 — die Registrierung als Umgehung der Stundensatz-Sperre
 *
 * Track 9 hat den Stundensatz an der Datenbank verriegelt: `authenticated`
 * hat auf `public.angels` kein table-weites UPDATE mehr, sondern nur noch
 * Spaltenrechte auf (is_online, bio, services, availability). Live am
 * 28.08.2026 gegen die Produktion geprueft:
 *
 *     has_column_privilege('authenticated','public.angels','hourly_rate','UPDATE')     = false
 *     has_column_privilege('authenticated','public.angels','qualification','UPDATE')   = false
 *     has_column_privilege('authenticated','public.angels','is_certified','UPDATE')    = false
 *     has_column_privilege('authenticated','public.angels','is_45b_capable','UPDATE')  = false
 *     has_column_privilege('authenticated','public.angels','is_online','UPDATE')       = true
 *
 * Im selben Zug wanderte die Registrierung auf den ADMIN-Client, der genau
 * diese Sperre umgeht — und der Aufruf war ein `upsert` auf `id`, also
 * idempotent per Konstruktion. `requireAuth()` prueft nur, DASS jemand
 * angemeldet ist. Ein laengst registrierter Engel konnte die Server Action
 * ein zweites Mal aufrufen und dabei genau die vier gesperrten Spalten frei
 * setzen. Server Actions sind aufrufbare HTTP-Endpunkte; dass die
 * Oberflaeche das Feld gar nicht anbietet — sie schickt die Konstante
 * ENGEL_HOURLY_RATE — ist keine Schranke.
 *
 * Geprueft wird deshalb: was landet in der Datenbank, wenn der Aufruf
 * manipulierte Werte mitbringt, und was bleibt beim zweiten Aufruf stehen.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { erstelleFakeSupabase, type FakeAufruf, type FakeSupabase } from './helpers/supabase-fake'
import { ENGEL_HOURLY_RATE } from '@/lib/pricing/b2c-constants'

const USER = '44444444-4444-4444-8444-444444444444'

let nutzerFake: FakeSupabase
let adminFake: FakeSupabase
/** Steuert, ob bereits eine angels-Zeile fuer diesen Nutzer existiert. */
let bereitsRegistriert = false

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => nutzerFake.client),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => adminFake.client),
}))

vi.mock('@/lib/organizations/server', () => ({
  getActiveOrgIdOrDefault: vi.fn(async () => '00000000-0000-4000-8000-000460629986'),
}))

vi.mock('@/lib/audit-log', () => ({
  logAuditEventOrWarn: vi.fn(async () => {}),
}))

vi.mock('@/lib/geocoding', () => ({
  geocodePLZ: vi.fn(async () => null),
}))

function baueFakes() {
  nutzerFake = erstelleFakeSupabase((aufruf: FakeAufruf) => {
    if (aufruf.tabelle === 'profiles') return { data: { role: 'engel', first_name: 'A', last_name: 'B' } }
    return { data: null }
  })
  ;(nutzerFake.client as unknown as { auth: unknown }).auth = {
    getUser: async () => ({ data: { user: { id: USER } }, error: null }),
  }

  adminFake = erstelleFakeSupabase((aufruf: FakeAufruf) => {
    if (aufruf.tabelle === 'angels' && aufruf.operation === 'select') {
      return { data: bereitsRegistriert ? { id: USER } : null }
    }
    return { data: null }
  })
}

const EINGABE = {
  firstName: 'Anna', lastName: 'Beispiel', email: 'a@b.de', phone: '0',
  plz: '60311', stadt: 'Frankfurt',
  qualification: 'Pflegehelferin',
  services: ['hauswirtschaft'], availability: ['mo'],
}

function angelsSchreibvorgang(fake: FakeSupabase) {
  return fake.aufrufe.find(a => a.tabelle === 'angels' && a.operation !== 'select')
}

describe('B1: registerAsEngel setzt keinen Stundensatz aus dem Aufruf', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    bereitsRegistriert = false
    baueFakes()
  })

  it('GEGENPROBE: ein mitgeschickter Stundensatz von 999 landet NICHT in der Datenbank', async () => {
    const { registerAsEngel } = await import('@/app/engel/register/actions')

    const ergebnis = await registerAsEngel({ ...EINGABE, hourlyRate: 999 })
    expect(ergebnis.ok).toBe(true)

    const schreib = angelsSchreibvorgang(adminFake)
    expect(schreib).toBeDefined()
    const payload = schreib!.payload as Record<string, unknown>

    expect(payload.hourly_rate).not.toBe(999)
    expect(payload.hourly_rate).toBe(ENGEL_HOURLY_RATE)
  })

  it('GEGENPROBE: die normale Registrierung laeuft unveraendert durch', async () => {
    // Ohne diese Probe waere "schreibt nie etwas" ebenfalls gruen.
    const { registerAsEngel } = await import('@/app/engel/register/actions')

    const ergebnis = await registerAsEngel({ ...EINGABE, hourlyRate: ENGEL_HOURLY_RATE })
    expect(ergebnis.ok).toBe(true)

    const schreib = angelsSchreibvorgang(adminFake)
    expect(schreib!.operation).toBe('insert')
    const payload = schreib!.payload as Record<string, unknown>
    expect(payload.id).toBe(USER)
    expect(payload.services).toEqual(['hauswirtschaft'])
    expect(payload.availability).toEqual(['mo'])
    expect(payload.is_online).toBe(true)
  })

  it('GEGENPROBE: der zweite Aufruf fasst die gesperrten Spalten nicht mehr an', async () => {
    // Das war der eigentliche Befund: `upsert` auf `id` machte jeden
    // Folgeaufruf zu einer freien Aenderung von hourly_rate, qualification,
    // is_certified und is_45b_capable — genau den vier Spalten, die Track 9
    // an der Datenbank verriegelt hat.
    bereitsRegistriert = true
    const { registerAsEngel } = await import('@/app/engel/register/actions')

    const ergebnis = await registerAsEngel({
      ...EINGABE,
      qualification: 'Fachkraft 45b',   // wuerde is_45b_capable setzen
      hourlyRate: 999,
    })
    expect(ergebnis.ok).toBe(true)

    const schreib = angelsSchreibvorgang(adminFake)
    expect(schreib!.operation).toBe('update')
    const payload = schreib!.payload as Record<string, unknown>

    for (const spalte of ['hourly_rate', 'qualification', 'is_certified', 'is_45b_capable']) {
      expect(payload).not.toHaveProperty(spalte)
    }
  })

  it('GEGENPROBE: der zweite Aufruf setzt Bewertung und Einsatzzahl nicht zurueck', async () => {
    // Vorher stempelte jeder erneute Aufruf rating=5.0, total_jobs=0 und
    // satisfaction_pct=100 — eine Bewertungshistorie liess sich damit
    // loeschen, ohne irgendeine Berechtigung dafuer zu haben.
    bereitsRegistriert = true
    const { registerAsEngel } = await import('@/app/engel/register/actions')

    await registerAsEngel({ ...EINGABE, hourlyRate: ENGEL_HOURLY_RATE })

    const payload = angelsSchreibvorgang(adminFake)!.payload as Record<string, unknown>
    for (const spalte of ['rating', 'total_jobs', 'satisfaction_pct']) {
      expect(payload).not.toHaveProperty(spalte)
    }
  })

  it('bei der ERSTanlage werden Bewertung und Kennzeichen weiterhin gesetzt', async () => {
    bereitsRegistriert = false
    const { registerAsEngel } = await import('@/app/engel/register/actions')

    await registerAsEngel({ ...EINGABE, qualification: 'Fachkraft 45b', hourlyRate: ENGEL_HOURLY_RATE })

    const payload = angelsSchreibvorgang(adminFake)!.payload as Record<string, unknown>
    expect(payload.rating).toBe(5.0)
    expect(payload.total_jobs).toBe(0)
    expect(payload.is_45b_capable).toBe(true)
    expect(payload.hourly_rate).toBe(ENGEL_HOURLY_RATE)
  })

  it('bricht ab, wenn der Bestand nicht lesbar ist — sonst waere jeder Lesefehler eine Erstanlage', async () => {
    // Fail-closed: faellt die Bestandsabfrage aus und der Code liefe als
    // "nicht vorhanden" weiter, waere der Befund ueber einen provozierten
    // Lesefehler wieder erreichbar.
    adminFake = erstelleFakeSupabase((aufruf: FakeAufruf) => {
      if (aufruf.tabelle === 'angels' && aufruf.operation === 'select') {
        return { error: { message: 'timeout', code: '57014' } }
      }
      return { data: null }
    })
    const { registerAsEngel } = await import('@/app/engel/register/actions')

    const ergebnis = await registerAsEngel({ ...EINGABE, hourlyRate: 999 })
    expect(ergebnis.ok).toBe(false)
    expect(angelsSchreibvorgang(adminFake)).toBeUndefined()
  })
})
