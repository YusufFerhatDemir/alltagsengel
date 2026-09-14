/**
 * E2E: Tourenplanung über die echten Route-Handler
 * ═══════════════════════════════════════════════════════════════════════
 *
 * ── WARUM DIESE KETTE ─────────────────────────────────────────────────
 * `lib/touren/` sind rund 1.960 Zeilen hinter sieben API-Routen, und live
 * stehen `tours`, `tour_stops` und `tour_templates` bei je NULL Zeilen:
 * die Strecke ist nie gelaufen. Unter den 26 E2E-Ketten gab es keine für
 * sie — bis hierher.
 *
 * Sie ist kein Nebenschauplatz. Ein abgeschlossener Stop erzeugt einen
 * LEISTUNGSNACHWEIS; damit ist diese Route der Anfang des Geldwegs. Was
 * hier falsch entsteht, trägt sich durch Nachweis, Budget und Rechnung
 * durch — und drei der Prüfungen im Handler sind genau dagegen gebaut:
 *
 *   · Nachtdienst über Mitternacht. `duration_minutes` ist eine
 *     GENERATED-Spalte ((end - start)/60); ein Ende vor dem Beginn ergibt
 *     eine NEGATIVE Dauer und damit eine Rechnungsposition, die Geld
 *     abzieht statt es zu fordern.
 *   · Fehlende Leistungsart am Einsatz. Ohne sie stünden Tarif und
 *     Budget-Topf nicht fest; ein geratener Wert belastete den falschen
 *     Topf des Kunden (§ 45b statt privat).
 *   · Die Mandantengrenze auf jedem Schreibweg.
 *
 * ── WAS ECHT LÄUFT ────────────────────────────────────────────────────
 * Die Route-Handler, die Trigger (`tour_stop_sync_assignment`,
 * `tour_recalc_totals`), die CHECK-Constraints und die Fremdschlüssel —
 * alles gegen echtes Postgres (PGlite), Schema wortgleich aus
 * supabase/migrations/20260809120000_tourenplanung.sql.
 *
 * GEMOCKT sind nur die Außenkanten: die Sitzung (es gibt keinen Browser)
 * und die Fahrtzeit-Schätzung (sie hinge sonst an der PLZ-Tabelle und
 * würde Laufzeit statt Logik messen).
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  baueKettenSchema, bauePersonalTabellen, baueTourenTabellen, STAMM_ORG,
} from './helpers/kette-schema'
import { macheSupabaseClient } from './helpers/pglite-supabase'

// ─────────────────────────────────────────────────────────────────────
// Außenkanten
// ─────────────────────────────────────────────────────────────────────
const halter = vi.hoisted(() => ({
  client: null as unknown as SupabaseClient,
  sitzung: { userId: '' as string | null, orgId: '' as string | null },
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => halter.client,
}))

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

// Fahrtzeit: sonst hinge der Test an der 176-KB-PLZ-Tabelle und würde
// deren Laufzeit messen statt der Kettenlogik.
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

// ─────────────────────────────────────────────────────────────────────
const ORG_A = STAMM_ORG
const ORG_B = '00000000-0000-4000-8000-0000000000b0'
const ADMIN_A = '00000000-0000-4000-8000-00000000a001'
const ADMIN_B = '00000000-0000-4000-8000-00000000a002'
const KUNDE_A = '00000000-0000-4000-8000-00000000c001'
const ENGEL_A = '00000000-0000-4000-8000-00000000e001'

let db: PGlite

/** Ruft den Handler und gibt Status + Rumpf zurück. */
async function ruf(
  handler: (r: Request, k: { params: Promise<{ id: string }> }) => Promise<Response>,
  url: string,
  koerper: unknown,
  id: string,
  methode = 'PATCH',
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await handler(
    new Request(url, { method: methode, body: JSON.stringify(koerper), headers: { 'content-type': 'application/json' } }),
    { params: Promise.resolve({ id }) },
  )
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

async function rufOhneId(url: string, koerper: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await tourenPost(
    new Request(url, { method: 'POST', body: JSON.stringify(koerper), headers: { 'content-type': 'application/json' } }) as never,
  )
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

/** Legt einen Einsatz an und gibt seine ID zurück. */
async function einsatz(opts: { art: string | null; org?: string; datum?: string }): Promise<string> {
  const id = crypto.randomUUID()
  // Das Datum MUSS zum Tour-Datum passen: die Route weist einen Einsatz
  // eines anderen Tages ab, damit die Tour keine fremden Zeiten erbt.
  await db.query(
    `INSERT INTO public.assignments
       (id, organization_id, client_id, caregiver_id, weekday, start_time, end_time,
        service_type, status, assignment_date)
     VALUES ($1,$2,$3,$4,1,'09:00','10:00',$5,'active',$6)`,
    [id, opts.org ?? ORG_A, KUNDE_A, ENGEL_A, opts.art, opts.datum ?? '2026-10-05'],
  )
  return id
}

beforeAll(async () => {
  db = await baueKettenSchema()
  // Voraussetzung: absences (Abwesenheitspruefung ist fail-closed) und
  // caregivers.wochenstunden_soll (wird von POST /api/tours selektiert).
  await bauePersonalTabellen(db)
  await baueTourenTabellen(db)
  halter.client = macheSupabaseClient(db) as unknown as SupabaseClient

  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES
      ('${ADMIN_A}', 'admin-a@example.org'),
      ('${ADMIN_B}', 'admin-b@example.org');
  `)
  await db.exec(`
    INSERT INTO public.profiles (id, role, first_name, last_name, email) VALUES
      ('${ADMIN_A}', 'admin', 'Admin', 'Alpha', 'admin-a@example.org'),
      ('${ADMIN_B}', 'admin', 'Admin', 'Beta',  'admin-b@example.org');
    INSERT INTO public.organizations (id, name, bundesland, status) VALUES
      ('${ORG_A}', 'Mandant Alpha', 'hessen', 'active'),
      ('${ORG_B}', 'Mandant Beta',  'hessen', 'active');
    INSERT INTO public.clients
      (id, organization_id, customer_number, first_name, last_name, status, zip_code)
      VALUES ('${KUNDE_A}', '${ORG_A}', 'K-0001', 'Erika', 'Testfall', 'active', '60311');
    INSERT INTO public.caregivers
      (id, organization_id, first_name, last_name, initials, status, zip_code)
      VALUES ('${ENGEL_A}', '${ORG_A}', 'Marek', 'Beispiel', 'MB', 'active', '60311');
  `)
}, 120_000)

beforeEach(() => {
  halter.sitzung = { userId: ADMIN_A, orgId: ORG_A }
})

describe('Die Einsatzfreigabe steht VOR der Tour', () => {
  it('ohne aktiven Vertrag entsteht keine Tour — und der Grund wird genannt', async () => {
    const aId = await einsatz({ art: 'alltagsbegleitung' })
    const { status, body } = await rufOhneId('http://x/api/tours', {
      caregiver_id: ENGEL_A, tour_date: '2026-10-05',
      stops: [{ assignment_id: aId, client_id: KUNDE_A, geplante_ankunft: '09:00', geplantes_ende: '10:00' }],
    })
    expect(status).toBe(422)
    expect(String(body.error)).toMatch(/Vertrag/)
    // Der Ausweg wird MITGETEILT — eine Sperre ohne Ausweg fuehrt dazu,
    // dass jemand sie woanders umgeht.
    expect(String(body.hinweis)).toMatch(/force_override/)
    const t = await db.query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM public.tours`)
    expect(t.rows[0].n, 'trotz Ablehnung ist eine Tour entstanden').toBe('0')
  })
})

describe('Eine Tour entsteht', () => {
  it('POST /api/tours legt Tour und Stop an', async () => {
    const aId = await einsatz({ art: 'alltagsbegleitung' })
    const { status, body } = await rufOhneId('http://x/api/tours', {
      caregiver_id: ENGEL_A,
      tour_date: '2026-10-05',
      name: 'Testtour',
      force_override: true,
      stops: [{ assignment_id: aId, client_id: KUNDE_A, geplante_ankunft: '09:00', geplantes_ende: '10:00' }],
    })
    expect(status, JSON.stringify(body)).toBe(201)

    const t = await db.query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM public.tours`)
    expect(t.rows[0].n).toBe('1')
    const s = await db.query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM public.tour_stops`)
    expect(s.rows[0].n).toBe('1')
  })

  it('ohne Stop entsteht keine Tour — eine leere Tour ist kein Arbeitstag', async () => {
    const { status } = await rufOhneId('http://x/api/tours', {
      caregiver_id: ENGEL_A, tour_date: '2026-10-06', force_override: true, stops: [],
    })
    expect(status).toBe(400)
  })

  it('ein Datum, das keines ist, wird abgewiesen', async () => {
    const aId = await einsatz({ art: 'alltagsbegleitung' })
    const { status } = await rufOhneId('http://x/api/tours', {
      caregiver_id: ENGEL_A, tour_date: 'morgen', force_override: true,
      stops: [{ assignment_id: aId, client_id: KUNDE_A, geplante_ankunft: '09:00', geplantes_ende: '10:00' }],
    })
    expect(status).toBe(400)
  })
})

describe('REGRESSION: force_override war vollständig unbenutzbar', () => {
  /**
   * Gefunden beim ersten Lauf dieser Kette, 14.09.2026.
   *
   * `app/api/tours/route.ts` schrieb den Übersteuerungs-Beleg mit
   * `entityId: "tour-override-<uuid>"` — und
   * `billing_audit_trail.entity_id` ist vom Typ uuid. Der Insert
   * scheiterte, `logBillingAction` warf, und die Route endete mit 500.
   *
   * Tour und Stops waren da schon angelegt. Jeder Versuch hinterließ also
   * eine Tour, zeigte einen Fehler und erzeugte beim nächsten Anlauf die
   * zweite. Damit war der EINZIGE Weg, trotz fehlender Einsatzfreigabe zu
   * planen, in der Praxis nicht benutzbar — und live wäre es niemandem
   * aufgefallen, weil `tours` bei null Zeilen steht.
   */
  it('der Beleg wird geschrieben und trägt die reine Tour-ID', async () => {
    const aId = await einsatz({ art: 'alltagsbegleitung', datum: '2026-10-07' })
    const { status } = await rufOhneId('http://x/api/tours', {
      caregiver_id: ENGEL_A, tour_date: '2026-10-07', force_override: true,
      grund: 'Vertrag liegt in Papierform vor',
      stops: [{ assignment_id: aId, client_id: KUNDE_A, geplante_ankunft: '11:00', geplantes_ende: '12:00' }],
    })
    expect(status).toBe(201)

    const beleg = await db.query<{ entity_id: string; action: string; reason: string }>(
      `SELECT entity_id, action, reason FROM public.billing_audit_trail
       WHERE action = 'force_override' ORDER BY created_at DESC LIMIT 1`)
    expect(beleg.rows.length, 'kein Übersteuerungs-Beleg geschrieben').toBe(1)
    expect(beleg.rows[0].entity_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(beleg.rows[0].reason).toBe('Vertrag liegt in Papierform vor')
  })

  it('die Begründung wird festgehalten — eine Übersteuerung ohne Grund ist keine', async () => {
    const aId = await einsatz({ art: 'alltagsbegleitung', datum: '2026-10-08' })
    await rufOhneId('http://x/api/tours', {
      caregiver_id: ENGEL_A, tour_date: '2026-10-08', force_override: true,
      stops: [{ assignment_id: aId, client_id: KUNDE_A, geplante_ankunft: '13:00', geplantes_ende: '14:00' }],
    })
    const beleg = await db.query<{ reason: string }>(
      `SELECT reason FROM public.billing_audit_trail
       WHERE action = 'force_override' ORDER BY created_at DESC LIMIT 1`)
    expect(beleg.rows[0].reason).toMatch(/Keine Begruendung angegeben/)
  })
})

describe('Mandantengrenze', () => {
  it('ein Einsatz aus einer anderen Organisation kommt nicht in die Tour', async () => {
    const fremd = await einsatz({ art: 'alltagsbegleitung', org: ORG_B, datum: '2026-10-09' })
    const { status, body } = await rufOhneId('http://x/api/tours', {
      caregiver_id: ENGEL_A, tour_date: '2026-10-09', force_override: true,
      stops: [{ assignment_id: fremd, client_id: KUNDE_A, geplante_ankunft: '09:00', geplantes_ende: '10:00' }],
    })
    expect(status).toBe(422)
    expect(String(body.error)).toMatch(/nicht gefunden/)
  })

  it('ohne Sitzung entsteht nichts', async () => {
    halter.sitzung = { userId: null, orgId: null }
    const aId = await einsatz({ art: 'alltagsbegleitung', datum: '2026-10-10' })
    const { status } = await rufOhneId('http://x/api/tours', {
      caregiver_id: ENGEL_A, tour_date: '2026-10-10', force_override: true,
      stops: [{ assignment_id: aId, client_id: KUNDE_A, geplante_ankunft: '09:00', geplantes_ende: '10:00' }],
    })
    expect(status).toBe(401)
  })
})
