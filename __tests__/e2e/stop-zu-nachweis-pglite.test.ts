/**
 * E2E: Vom abgeschlossenen Tour-Stop zum Leistungsnachweis
 * ═══════════════════════════════════════════════════════════════════════
 *
 * ── DIE LÜCKE, DIE DIESE KETTE SCHLIESST ──────────────────────────────
 * Zwei Abschnitte des Geldwegs waren geprüft, der Übergang dazwischen
 * nicht:
 *
 *   Tour + Stop anlegen        → tourenplanung-kette-pglite.test.ts
 *   [ Stop → Leistungsnachweis ]   ← HIER, vorher ungeprüft
 *   Unterschrift → abrechenbar → signatur-bis-abrechenbar-pglite.test.ts
 *
 * Der mittlere Schritt ist der, an dem aus erbrachter Arbeit ein
 * abrechenbarer Beleg wird. Was hier falsch entsteht, trägt sich durch
 * Nachweis, Budget und Rechnung durch — und sieht dabei die ganze Zeit
 * vollständig aus.
 *
 * ── WAS AUF DEM SPIEL STEHT ───────────────────────────────────────────
 * `lib/touren/leistungsnachweis.ts` hält fest, was die Route früher fest
 * verdrahtet hatte: `service_type: 'Alltagsbegleitung'` und
 * `budget_type: 'entlastung'`. Beides geraten. Die Folgen stehen dort im
 * Kopf und sind der Grund für diese Tests:
 *   · falscher `service_type` ⇒ der Rechnungslauf löst den FALSCHEN Tarif
 *     auf — und es fällt nicht auf, weil ein Tarif existiert;
 *   · falscher `budget_type` ⇒ ein Verhinderungspflege-Einsatz (§ 42a)
 *     verbraucht still den Entlastungsbetrag nach § 45b (131 €/Monat).
 *
 * Dazu die drei Sperren des Handlers, die alle einen echten Schaden
 * abwenden: Nachtdienst über Mitternacht (negative Dauer ⇒ eine
 * Rechnungsposition, die Geld ABZIEHT), fehlende Leistungsart
 * (fail-closed statt Ersatzwert) und fehlende Zeiten.
 *
 * ── WAS ECHT LÄUFT ────────────────────────────────────────────────────
 * Die Route-Handler, die Trigger und die CHECK-Constraints gegen echtes
 * Postgres. Gemockt sind nur Sitzung und Fahrtzeit-Schätzung.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  baueKettenSchema, bauePersonalTabellen, baueTourenTabellen, STAMM_ORG,
} from './helpers/kette-schema'
import { macheSupabaseClient } from './helpers/pglite-supabase'

const halter = vi.hoisted(() => ({
  client: null as unknown as SupabaseClient,
  sitzung: { userId: '' as string | null, orgId: '' as string | null },
}))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => halter.client }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () =>
        halter.sitzung.userId
          ? { data: { user: { id: halter.sitzung.userId, app_metadata: {} } }, error: null }
          : { data: { user: null }, error: { message: 'keine Sitzung' } },
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({
          data: { currentLevel: 'aal1', nextLevel: 'aal1' },
        }),
      },
    },
    from: (t: string) => (halter.client as unknown as SupabaseClient).from(t),
  }),
}))

vi.mock('@/lib/organizations/server', () => ({
  getActiveOrgId: async () => halter.sitzung.orgId,
  getActiveOrgIdOrDefault: async () => halter.sitzung.orgId,
}))

vi.mock('@/lib/touren/fahrtzeit', () => ({
  UMWEGFAKTOR: 1.3,
  FAHRZEIT_GLEICHE_PLZ_MINUTEN: 7,
  DISTANZ_GLEICHE_PLZ_KM: 2,
  PUFFER_PRO_STOP_MINUTEN: 3,
  durchschnittsgeschwindigkeitKmh: () => 40,
  fahrtZwischenPlz: () => ({ minuten: 10, km: 5, geschaetzt: true }),
  fahrtzeitenEntlangRoute: (stops: Array<unknown>) =>
    stops.map(() => ({ minuten: 10, km: 5, geschaetzt: true })),
}))

import { POST as tourenPost } from '@/app/api/tours/route'
import { PATCH as stopsPatch } from '@/app/api/tours/[id]/stops/route'

const ORG_A = STAMM_ORG
const ADMIN_A = '00000000-0000-4000-8000-00000000a001'
const KUNDE_A = '00000000-0000-4000-8000-00000000c001'
const ENGEL_A = '00000000-0000-4000-8000-00000000e001'

let db: PGlite

/**
 * `tour_stops.tatsaechliches_ende` ist `timestamptz`, nicht `time`.
 * Eine reine Uhrzeit lehnt Postgres mit „invalid input syntax" ab — und
 * die Route meldet das als 500, nicht als Eingabefehler.
 */
const TAG = '2026-11-01'
function ZEIT(uhr: string): string { return `${TAG}T${uhr}:00.000Z` }

async function postTour(koerper: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await tourenPost(
    new Request('http://x/api/tours', {
      method: 'POST', body: JSON.stringify(koerper), headers: { 'content-type': 'application/json' },
    }) as never,
  )
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

async function patchStop(tourId: string, koerper: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await stopsPatch(
    new Request(`http://x/api/tours/${tourId}/stops`, {
      method: 'PATCH', body: JSON.stringify(koerper), headers: { 'content-type': 'application/json' },
    }),
    { params: Promise.resolve({ id: tourId }) },
  )
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

async function einsatz(
  art: string | null, datum: string, von = '09:00', bis = '10:00',
): Promise<string> {
  const id = crypto.randomUUID()
  await db.query(
    `INSERT INTO public.assignments
       (id, organization_id, client_id, caregiver_id, weekday, start_time, end_time,
        service_type, status, assignment_date)
     VALUES ($1,$2,$3,$4,1,$7,$8,$5,'active',$6)`,
    [id, ORG_A, KUNDE_A, ENGEL_A, art, datum, von, bis],
  )
  return id
}

/** Legt Tour mit einem Stop an und gibt Tour- und Stop-ID zurück. */
async function tourMitStop(
  datum: string,
  opts: { art?: string | null; ankunft?: string; ende?: string } = {},
): Promise<{ tourId: string; stopId: string }> {
  // Die Zeiten gehoeren an den EINSATZ: `aufloeseStops` uebernimmt sie von
  // dort in den Stop. Wer sie nur am Stop mitgibt, prueft seine eigene
  // Eingabe statt der Kette.
  const aId = await einsatz(
    opts.art === undefined ? 'alltagsbegleitung' : opts.art, datum,
    opts.ankunft ?? '09:00', opts.ende ?? '10:00',
  )
  const { status, body } = await postTour({
    caregiver_id: ENGEL_A, tour_date: datum, force_override: true,
    stops: [{
      assignment_id: aId, client_id: KUNDE_A,
      geplante_ankunft: opts.ankunft ?? '09:00',
      geplantes_ende: opts.ende ?? '10:00',
    }],
  })
  expect(status, JSON.stringify(body)).toBe(201)
  const r = await db.query<{ tour_id: string; id: string }>(
    `SELECT tour_id, id FROM public.tour_stops
     WHERE tour_id = (SELECT id FROM public.tours WHERE tour_date = $1 ORDER BY created_at DESC LIMIT 1)`,
    [datum],
  )
  return { tourId: r.rows[0].tour_id, stopId: r.rows[0].id }
}

/** Tour mit einem Stop, der an KEINEM Einsatz hängt. */
async function tourOhneEinsatz(datum: string): Promise<{ tourId: string; stopId: string }> {
  const { status, body } = await postTour({
    caregiver_id: ENGEL_A, tour_date: datum, force_override: true,
    stops: [{ client_id: KUNDE_A, geplante_ankunft: '09:00', geplantes_ende: '10:00' }],
  })
  expect(status, JSON.stringify(body)).toBe(201)
  const r = await db.query<{ tour_id: string; id: string }>(
    `SELECT tour_id, id FROM public.tour_stops
     WHERE tour_id = (SELECT id FROM public.tours WHERE tour_date = $1 ORDER BY created_at DESC LIMIT 1)`,
    [datum],
  )
  return { tourId: r.rows[0].tour_id, stopId: r.rows[0].id }
}

beforeAll(async () => {
  db = await baueKettenSchema()
  await bauePersonalTabellen(db)
  await baueTourenTabellen(db)
  halter.client = macheSupabaseClient(db) as unknown as SupabaseClient

  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ('${ADMIN_A}', 'admin-a@example.org');
    INSERT INTO public.profiles (id, role, first_name, last_name, email)
      VALUES ('${ADMIN_A}', 'admin', 'Admin', 'Alpha', 'admin-a@example.org');
    INSERT INTO public.organizations (id, name, bundesland, status)
      VALUES ('${ORG_A}', 'Mandant Alpha', 'hessen', 'active');
    INSERT INTO public.clients
      (id, organization_id, customer_number, first_name, last_name, status, zip_code)
      VALUES ('${KUNDE_A}', '${ORG_A}', 'K-0001', 'Erika', 'Testfall', 'active', '60311');
    INSERT INTO public.caregivers
      (id, organization_id, first_name, last_name, initials, status, zip_code)
      VALUES ('${ENGEL_A}', '${ORG_A}', 'Marek', 'Beispiel', 'MB', 'active', '60311');
  `)
}, 120_000)

beforeEach(() => { halter.sitzung = { userId: ADMIN_A, orgId: ORG_A } })

describe('Aus dem abgeschlossenen Stop wird ein Nachweis', () => {
  it('legt den Nachweis an und verknüpft ihn in BEIDE Richtungen', async () => {
    const { tourId, stopId } = await tourMitStop('2026-11-02')
    const { status, body } = await patchStop(tourId, {
      stop_id: stopId, status: 'ABGESCHLOSSEN',
      tatsaechliches_ende: ZEIT('10:00'), leistungsnachweis_anlegen: true,
    })
    expect(status, JSON.stringify(body)).toBe(200)

    const n = await db.query<{ id: string; service_type: string; budget_type: string; status: string; assignment_id: string | null }>(
      `SELECT id, service_type, budget_type, status, assignment_id FROM public.service_records`)
    expect(n.rows.length, 'kein Nachweis entstanden').toBe(1)
    expect(n.rows[0].status).toBe('draft')
    // Die Rückverknüpfung: ohne sie entstünde beim nächsten Abschluss ein
    // ZWEITER Nachweis zum selben Stop.
    const s = await db.query<{ service_record_id: string | null }>(
      `SELECT service_record_id FROM public.tour_stops WHERE id = $1`, [stopId])
    expect(s.rows[0].service_record_id, 'Stop kennt seinen Nachweis nicht').toBe(n.rows[0].id)
    // Und der Nachweis kennt den Einsatz — sonst fehlt der Bezug zur
    // Verordnung und zur Budgetprüfung.
    expect(n.rows[0].assignment_id).not.toBeNull()
  })

  it('ein zweiter Abschluss erzeugt KEINEN zweiten Nachweis', async () => {
    const { tourId, stopId } = await tourMitStop('2026-11-03')
    for (const s of ['ABGESCHLOSSEN', 'ABGESCHLOSSEN']) {
      await patchStop(tourId, {
        stop_id: stopId, status: s, tatsaechliches_ende: ZEIT('10:00'), leistungsnachweis_anlegen: true,
      })
    }
    const n = await db.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM public.service_records WHERE date = '2026-11-03'`)
    expect(n.rows[0].n).toBe('1')
  })

  it('ohne leistungsnachweis_anlegen entsteht nichts — es ist ein Opt-in', async () => {
    const { tourId, stopId } = await tourMitStop('2026-11-04')
    await patchStop(tourId, { stop_id: stopId, status: 'ABGESCHLOSSEN', tatsaechliches_ende: ZEIT('10:00') })
    const n = await db.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM public.service_records WHERE date = '2026-11-04'`)
    expect(n.rows[0].n).toBe('0')
  })
})

describe('Leistungsart und Budget-Topf kommen aus dem EINSATZ', () => {
  it('Verhinderungspflege belastet NICHT den Entlastungsbetrag nach § 45b', async () => {
    const { tourId, stopId } = await tourMitStop('2026-11-05', { art: 'verhinderungspflege' })
    await patchStop(tourId, {
      stop_id: stopId, status: 'ABGESCHLOSSEN', tatsaechliches_ende: ZEIT('10:00'), leistungsnachweis_anlegen: true,
    })
    const n = await db.query<{ budget_type: string }>(
      `SELECT budget_type FROM public.service_records WHERE date = '2026-11-05'`)
    expect(n.rows.length).toBe(1)
    expect(n.rows[0].budget_type, 'still den § 45b-Topf belastet').toBe('verhinderungspflege')
  })

  it('eine Privatleistung landet im privaten Topf', async () => {
    const { tourId, stopId } = await tourMitStop('2026-11-06', { art: 'privat' })
    await patchStop(tourId, {
      stop_id: stopId, status: 'ABGESCHLOSSEN', tatsaechliches_ende: ZEIT('10:00'), leistungsnachweis_anlegen: true,
    })
    const n = await db.query<{ budget_type: string }>(
      `SELECT budget_type FROM public.service_records WHERE date = '2026-11-06'`)
    expect(n.rows[0].budget_type).toBe('private')
  })

  /**
   * BEOBACHTUNG, kein Fehlerbefund — festgehalten, weil sie eine
   * Entscheidung ist, die man kennen sollte.
   *
   * `assignments.service_type` ist NOT NULL, ein Einsatz kann die
   * Leistungsart also nicht verlieren. Legt die Disposition einen Stop
   * OHNE Einsatz an, erzeugt `aufloeseStops` den Einsatz selbst — mit
   * `stop.service_type || 'Alltagsbegleitung'`. Der Nachweis übernimmt
   * diesen Wert dann korrekt aus dem Einsatz.
   *
   * Das ist derselbe geratene Wert, den lib/touren/leistungsnachweis.ts
   * beim Nachweis ausdrücklich abgeschafft hat — nur eine Ebene früher.
   * Solange die Oberfläche die Leistungsart mitgibt, greift der Default
   * nie; gibt sie ihn nicht mit, wird zum Alltagsbegleitungs-Tarif
   * abgerechnet, ohne dass es auffällt.
   */
  it('ein Stop ohne Einsatz erhält die Vorgabe „Alltagsbegleitung"', async () => {
    const { tourId, stopId } = await tourOhneEinsatz('2026-11-07')
    await patchStop(tourId, {
      stop_id: stopId, status: 'ABGESCHLOSSEN', tatsaechliches_ende: ZEIT('10:00'), leistungsnachweis_anlegen: true,
    })
    const n = await db.query<{ service_type: string; budget_type: string }>(
      `SELECT service_type, budget_type FROM public.service_records WHERE date = '2026-11-07'`)
    expect(n.rows.length).toBe(1)
    expect(n.rows[0].service_type).toBe('Alltagsbegleitung')
    expect(n.rows[0].budget_type).toBe('entlastung')
  })
})

describe('Der Nachtdienst-Riegel', () => {
  it('ein Stop über Mitternacht erzeugt keinen Nachweis mit negativer Dauer', async () => {
    // 23:00 → 01:00. `duration_minutes` ist GENERATED ((end-start)/60);
    // das ergäbe −1320 Minuten und eine Rechnungsposition, die Geld
    // abzieht statt es zu fordern.
    const { tourId, stopId } = await tourMitStop('2026-11-08', { ankunft: '23:00', ende: '01:00' })
    const { body } = await patchStop(tourId, {
      stop_id: stopId, status: 'ABGESCHLOSSEN', tatsaechliches_ende: ZEIT('01:00'), leistungsnachweis_anlegen: true,
    })
    const n = await db.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM public.service_records WHERE date = '2026-11-08'`)
    expect(n.rows[0].n, 'Nachweis über Mitternacht entstanden').toBe('0')
    // Der Grund wird genannt, samt Ausweg (zwei Stops) — sonst versucht es
    // jemand so lange, bis er den Riegel umgeht.
    expect(JSON.stringify(body)).toMatch(/Mitternacht/)
  })

  /**
   * BEFUND AN DER HARNESS, 14.09.2026.
   *
   * Live ist `service_records.duration_minutes` GENERATED
   * ((end_time − start_time)/60) und bestimmt den Rechnungsbetrag. Im
   * Testschema ist sie eine gewöhnliche Spalte (`is_generated = NEVER`)
   * und bleibt NULL, wenn niemand sie setzt.
   *
   * Folge: eine Prüfung auf `duration_minutes < 0` misst hier NICHTS. Der
   * Riegel gegen den Nachtdienst wird deshalb oben an der ANTWORT DER
   * ROUTE gemessen, nicht an der Spalte — das ist die Aussage, die in
   * dieser Harness trägt.
   *
   * Die Spalte generiert nachzuziehen ist ein eigener Vorgang: elf
   * Stellen in neun E2E-Dateien setzen sie beim Einfügen direkt, und ein
   * GENERATED-Spalte lässt sich nicht beschreiben.
   */
  it('die Harness kennt duration_minutes NICHT als generierte Spalte', async () => {
    const r = await db.query<{ g: string }>(
      `SELECT is_generated AS g FROM information_schema.columns
       WHERE table_name = 'service_records' AND column_name = 'duration_minutes'`)
    expect(r.rows[0].g).toBe('NEVER')
  })
})
