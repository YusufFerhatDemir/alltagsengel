/**
 * E2E: Engel-Verwaltung — Registrierung, Profil, Verfuegbarkeit
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Die Engel-Verwaltung stand in docs/COMPLETION_MATRIX.md auf
 * PROVEN_LIVE: 16 `angels` live, der Spalten-GRANT aus Track 9 live
 * belegt, die Umgehung ueber `registerAsEngel` in Track 12 geschlossen —
 * aber **kein durchgehender Lauf** ueber Profil und Verfuegbarkeit.
 *
 * Diese Suite faehrt die Kette durch die ECHTEN Server Actions auf echtem
 * PostgreSQL (PGlite). Der Unterschied zu einer Attrappe ist hier nicht
 * akademisch: die drei tragenden Aussagen dieses Moduls sind allesamt
 * Aussagen ueber die DATENBANK —
 *
 *   • `angel_availability_zeitfenster_gueltig` (CHECK, end_time > start_time)
 *   • `weekday between 1 and 7` (CHECK, ISO-Zaehlung)
 *   • `angel_availability_eindeutig` (UNIQUE)
 *
 * — und eine Attrappe haette jede davon bestaetigt, egal was drinsteht.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WAS DIESE SUITE BEIM SCHREIBEN GEFUNDEN HAT
 * ─────────────────────────────────────────────────────────────────────
 * `addAvailabilitySlot` und `applyDefaultTemplate` haben den Wochentag
 * gegen `0..6` geprueft — die JavaScript-Zaehlung aus `Date.getDay()`.
 * Die Spalte, die Liste WOCHENTAGE in lib/availability.ts und die
 * Oberflaeche zaehlen dagegen nach ISO, `1..7`. Folge: SONNTAG liess sich
 * nicht hinterlegen, obwohl die Oberflaeche ihn anbietet. Korrigiert; die
 * Tests unten halten beide Enden des Bereichs fest.
 *
 * ─────────────────────────────────────────────────────────────────────
 * GEGENPROBE ZU TRACK 12 / B1
 * ─────────────────────────────────────────────────────────────────────
 * `registerAsEngel` laeuft ueber den Admin-Client und umgeht damit die
 * Spalten-GRANTs, die Track 9 an der Datenbank gesetzt hat. Der Befund
 * war: ein bereits registrierter Engel konnte die Action ein zweites Mal
 * aufrufen und dabei genau die vier gesperrten Spalten frei setzen.
 *
 * Die Fassung dieses Tests prueft BEIDES — dass der zweite Aufruf die
 * gesperrten Felder nicht mehr anfasst UND dass er die selbstgepflegten
 * weiterhin fortschreibt. Ohne die zweite Haelfte waere „nichts geht
 * mehr" ebenfalls gruen, und die Sperre kein Beweis.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import type { SupabaseClient } from '@supabase/supabase-js'

import { baueKettenSchema } from './helpers/kette-schema'
import { macheSupabaseClient } from './helpers/pglite-supabase'

const ORG          = 'aaaaaaaa-0000-4000-8000-000000000017'
const ENGEL_NUTZER = 'e1111111-0000-4000-8000-000000000017'
const FREMDER      = 'e2222222-0000-4000-8000-000000000017'

const ENGEL_STUNDENSATZ = 20   // muss ENGEL_HOURLY_RATE entsprechen, s. u.

// ── Testdoubles ──────────────────────────────────────────────────────
const halter = vi.hoisted(() => ({
  client: null as unknown as SupabaseClient,
  nutzer: null as string | null,
}))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => halter.client }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    ...halter.client,
    auth: {
      getUser: async () =>
        halter.nutzer
          ? { data: { user: { id: halter.nutzer } }, error: null }
          : { data: { user: null }, error: { message: 'keine Sitzung' } },
    },
  }),
}))
vi.mock('@/lib/organizations/server', () => ({
  getActiveOrgIdOrDefault: async () => ORG,
  getActiveOrgId: async () => ORG,
  resolveUserOrgId: async () => ORG,
}))
vi.mock('@/lib/audit-log', () => ({
  logAuditEventOrWarn: async () => true,
  logAuditEvent: async () => true,
}))
// geocodePLZ geht live gegen einen fremden Dienst. Hier ein fester Wert:
// die Kette soll die Koordinaten DURCHREICHEN, nicht das Netz pruefen.
vi.mock('@/lib/geocoding', () => ({
  geocodePLZ: async () => ({ lat: 50.1109, lng: 8.6821 }),
}))

import { registerAsEngel } from '@/app/engel/register/actions'
import {
  addAvailabilitySlot,
  deleteAvailabilitySlot,
  applyDefaultTemplate,
} from '@/app/engel/verfuegbarkeit/actions'
import { ENGEL_HOURLY_RATE } from '@/lib/pricing/b2c-constants'

let db: PGlite

const STAMMDATEN = {
  firstName: 'Marek', lastName: 'Beispiel',
  email: 'marek@example.org', phone: '069 1234567',
  plz: '60311', stadt: 'Frankfurt',
  qualification: 'Betreuungskraft nach 43b',
  services: ['betreuung'],
  availability: ['Mo', 'Di'],
}

async function engelZeile() {
  const r = await db.query<Record<string, unknown>>(
    `SELECT * FROM public.angels WHERE id = $1`, [ENGEL_NUTZER])
  return r.rows[0]
}

async function fenster(angelId = ENGEL_NUTZER) {
  const r = await db.query<{ id: string; weekday: number }>(
    `SELECT id, weekday FROM public.angel_availability
      WHERE angel_id = $1 ORDER BY weekday`, [angelId])
  return r.rows
}

beforeAll(async () => {
  db = await baueKettenSchema()
  halter.client = macheSupabaseClient(db) as unknown as SupabaseClient

  // angel_availability wortgleich aus der Migration — inklusive der drei
  // Constraints, um die es in dieser Suite geht.
  await db.exec(`
    CREATE TABLE IF NOT EXISTS public.angel_availability (
      id uuid primary key default gen_random_uuid(),
      angel_id uuid not null references public.profiles(id) on delete cascade,
      weekday smallint not null check (weekday between 1 and 7),
      start_time time not null,
      end_time time not null,
      created_at timestamptz not null default now(),
      constraint angel_availability_zeitfenster_gueltig check (end_time > start_time),
      constraint angel_availability_eindeutig unique (angel_id, weekday, start_time, end_time)
    );
  `)

  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES
      ('${ENGEL_NUTZER}', 'marek@example.org'),
      ('${FREMDER}', 'fremd@example.org');
    INSERT INTO public.profiles (id, role, first_name, last_name, email) VALUES
      ('${ENGEL_NUTZER}', 'engel', 'Marek', 'Beispiel', 'marek@example.org'),
      ('${FREMDER}', 'engel', 'Fremde', 'Person', 'fremd@example.org');
    INSERT INTO public.organizations (id, name, bundesland, status)
      VALUES ('${ORG}', 'Mandant Engel', 'hessen', 'active');
  `)
})

beforeEach(async () => {
  halter.nutzer = ENGEL_NUTZER
  await db.exec(`DELETE FROM public.angel_availability;`)
  await db.exec(`DELETE FROM public.angels;`)
})

// ═══════════════════════════════════════════════════════════════════════
describe('Registrierung — Erstanlage', () => {
  it('legt die angels-Zeile an und setzt den Stundensatz aus der Serverkonstante', async () => {
    // Der Aufruf schickt ausdruecklich einen ABWEICHENDEN Stundensatz mit.
    // Genau das war der Angriff aus Track 12/B1: Server Actions sind
    // aufrufbare Endpunkte, die Oberflaeche ist keine Schranke.
    const r = await registerAsEngel({ ...STAMMDATEN, hourlyRate: 999 })
    expect(r).toEqual({ ok: true })

    const z = await engelZeile()
    expect(Number(z.hourly_rate)).toBe(ENGEL_HOURLY_RATE)
    expect(Number(z.hourly_rate)).not.toBe(999)
    expect(z.services).toEqual(['betreuung'])
    expect(z.is_online).toBe(true)
    // qualification traegt kein '45b' → das Paragraf-45b-Kennzeichen bleibt aus.
    expect(z.is_45b_capable).toBe(false)
    expect(z.is_certified).toBe(false)
  })

  it('schreibt die Stammdaten ins Profil, samt Koordinaten aus der PLZ', async () => {
    await registerAsEngel(STAMMDATEN)
    const r = await db.query<{ postal_code: string; location: string; latitude: string | null }>(
      `SELECT postal_code, location, latitude FROM public.profiles WHERE id = $1`,
      [ENGEL_NUTZER])
    expect(r.rows[0].postal_code).toBe('60311')
    expect(r.rows[0].location).toBe('60311 Frankfurt')
    expect(r.rows[0].latitude).not.toBeNull()
  })

  it('weist eine Registrierung ohne Leistung oder ohne Verfuegbarkeit ab', async () => {
    expect(await registerAsEngel({ ...STAMMDATEN, services: [] }))
      .toEqual({ ok: false, error: 'Bitte mindestens eine Leistung wählen.' })
    expect(await registerAsEngel({ ...STAMMDATEN, availability: [] }))
      .toEqual({ ok: false, error: 'Bitte mindestens einen Verfügbarkeitstag wählen.' })
    // Und es ist auch wirklich keine Zeile entstanden.
    expect(await engelZeile()).toBeUndefined()
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('Registrierung — der zweite Aufruf (Track 12 / B1)', () => {
  beforeEach(async () => {
    await registerAsEngel(STAMMDATEN)
    // Bewertungshistorie, wie sie im Betrieb entsteht.
    await db.query(
      `UPDATE public.angels SET rating = 4.2, total_jobs = 17, satisfaction_pct = 88
        WHERE id = $1`, [ENGEL_NUTZER])
  })

  it('laesst die vier an der Datenbank gesperrten Felder unveraendert', async () => {
    const r = await registerAsEngel({
      ...STAMMDATEN,
      hourlyRate: 999,
      // '45b' im Freitext war der Weg zum Paragraf-45b-Abzeichen.
      qualification: 'Selbsterklaerte 45b-Qualifikation',
      services: ['betreuung', 'hauswirtschaft'],
    })
    expect(r).toEqual({ ok: true })

    const z = await engelZeile()
    expect(Number(z.hourly_rate)).toBe(ENGEL_HOURLY_RATE)
    expect(z.qualification).toBe(STAMMDATEN.qualification)
    expect(z.is_45b_capable).toBe(false)
    expect(z.is_certified).toBe(false)
  })

  it('stempelt die Bewertungshistorie nicht zurueck', async () => {
    await registerAsEngel(STAMMDATEN)
    const z = await engelZeile()
    expect(Number(z.rating)).toBe(4.2)
    expect(Number(z.total_jobs)).toBe(17)
    expect(Number(z.satisfaction_pct)).toBe(88)
  })

  it('GEGENPROBE: die selbstgepflegten Felder werden weiterhin fortgeschrieben', async () => {
    // Ohne diesen Test waere „der zweite Aufruf aendert gar nichts"
    // ebenfalls gruen — und die Sperre kein Beweis, sondern ein Defekt.
    await registerAsEngel({ ...STAMMDATEN, services: ['betreuung', 'hauswirtschaft'] })
    const z = await engelZeile()
    expect(z.services).toEqual(['betreuung', 'hauswirtschaft'])
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('Verfuegbarkeit — Zeitfenster', () => {
  beforeEach(async () => { await registerAsEngel(STAMMDATEN) })

  it('legt ein Zeitfenster an', async () => {
    const r = await addAvailabilitySlot(1, '09:00', '14:00')
    expect(r.ok).toBe(true)
    expect(await fenster()).toHaveLength(1)
  })

  it('SONNTAG (ISO 7) ist moeglich — Befund dieser Suite', async () => {
    // Die Oberflaeche bietet Sonntag an (WOCHENTAGE in lib/availability.ts,
    // nr 7), die Spalte laesst 1..7 zu. Die Eingabepruefung liess bis zum
    // 28.08.2026 nur 0..6 durch und wies Sonntag ab.
    const r = await addAvailabilitySlot(7, '10:00', '16:00')
    expect(r.ok).toBe(true)
    expect((await fenster()).map(f => f.weekday)).toEqual([7])
  })

  it('die 0 gibt es nach ISO nicht und wird abgewiesen — vor der Datenbank', async () => {
    // Vorher kam die 0 durch die Pruefung und scheiterte erst am CHECK,
    // wo der Fehler zu „konnte nicht gespeichert werden" verallgemeinert
    // wurde. Jetzt trifft sie die Eingabepruefung mit klarer Meldung.
    expect(await addAvailabilitySlot(0, '09:00', '14:00'))
      .toEqual({ ok: false, error: 'Ungueltiger Wochentag.' })
    expect(await fenster()).toHaveLength(0)
  })

  it('das Ende muss nach dem Beginn liegen — der CHECK haelt', async () => {
    // Die Eingabepruefung der Action kennt diese Regel NICHT; sie prueft
    // nur das Format HH:MM. Der Riegel ist hier ausschliesslich der
    // CHECK-Constraint — deshalb ist dieser Test nur auf echtem Postgres
    // aussagekraeftig.
    const r = await addAvailabilitySlot(2, '16:00', '10:00')
    expect(r.ok).toBe(false)
    expect(await fenster()).toHaveLength(0)
  })

  it('Beginn gleich Ende ist kein Zeitfenster', async () => {
    expect((await addAvailabilitySlot(2, '10:00', '10:00')).ok).toBe(false)
    expect(await fenster()).toHaveLength(0)
  })

  it('dasselbe Fenster zweimal wird vom UNIQUE-Index abgewiesen', async () => {
    expect((await addAvailabilitySlot(3, '09:00', '12:00')).ok).toBe(true)
    expect((await addAvailabilitySlot(3, '09:00', '12:00')).ok).toBe(false)
    expect(await fenster()).toHaveLength(1)
  })

  it('eine unsinnige Uhrzeit wird am Format abgewiesen', async () => {
    expect(await addAvailabilitySlot(1, '9:00', '14:00'))
      .toEqual({ ok: false, error: 'Ungueltige Startzeit.' })
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('Verfuegbarkeit — Vorlage und Loeschen', () => {
  beforeEach(async () => { await registerAsEngel(STAMMDATEN) })

  it('die Vorlage legt eine ganze Woche an, Montag bis Sonntag', async () => {
    const r = await applyDefaultTemplate([1, 2, 3, 4, 5, 6, 7], '08:00', '12:00')
    expect(r.ok).toBe(true)
    expect((await fenster()).map(f => f.weekday)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('eine Vorlage mit einem ungueltigen Tag legt GAR NICHTS an', async () => {
    const r = await applyDefaultTemplate([1, 2, 8], '08:00', '12:00')
    expect(r).toEqual({ ok: false, error: 'Ungueltiger Wochentag in der Liste.' })
    // Wichtig: kein Teilerfolg. Die Pruefung sitzt vor dem Batch-Insert.
    expect(await fenster()).toHaveLength(0)
  })

  it('der Engel loescht sein eigenes Fenster', async () => {
    const angelegt = await addAvailabilitySlot(1, '09:00', '14:00')
    expect(angelegt.ok).toBe(true)
    const id = (angelegt as { ok: true; data: { id: string } }).data.id

    expect(await deleteAvailabilitySlot(id)).toEqual({ ok: true })
    expect(await fenster()).toHaveLength(0)
  })

  it('ein fremdes Fenster laesst sich nicht loeschen', async () => {
    // Das Fenster gehoert einem anderen Engel. Der Admin-Client umgeht
    // RLS, der Riegel ist hier die Objektbindung in der Action selbst —
    // und die muss halten, gerade WEIL RLS hier nicht mitlaeuft.
    const r = await db.query<{ id: string }>(`
      INSERT INTO public.angel_availability (angel_id, weekday, start_time, end_time)
      VALUES ($1, 4, '09:00', '12:00') RETURNING id`, [FREMDER])
    const fremdeId = String(r.rows[0].id)

    expect(await deleteAvailabilitySlot(fremdeId))
      .toEqual({ ok: false, error: 'Zugriff verweigert.' })
    expect(await fenster(FREMDER)).toHaveLength(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('Ohne Anmeldung geht nichts', () => {
  beforeEach(() => { halter.nutzer = null })

  it('Registrierung wird abgewiesen', async () => {
    const r = await registerAsEngel(STAMMDATEN)
    expect(r.ok).toBe(false)
    expect(await engelZeile()).toBeUndefined()
  })

  it('Zeitfenster anlegen wird abgewiesen', async () => {
    const r = await addAvailabilitySlot(1, '09:00', '14:00')
    expect(r.ok).toBe(false)
    expect(await fenster()).toHaveLength(0)
  })
})

// Haelt die Annahme fest, auf der der erste Test steht. Weicht die
// Konstante ab, soll DIESER Test es sagen und nicht der andere mit einer
// unverstaendlichen Zahl.
describe('Annahme dieser Suite', () => {
  it('ENGEL_HOURLY_RATE ist der erwartete Serverwert', () => {
    expect(ENGEL_HOURLY_RATE).toBe(ENGEL_STUNDENSATZ)
  })
})
