/**
 * E2E: Admin-Cockpit — was ein Statuswechsel und eine Pflegegrad-Aenderung
 *      tatsaechlich anrichten
 * ═══════════════════════════════════════════════════════════════════════
 *
 * docs/COMPLETION_MATRIX.md hat das Admin-Dashboard ausdruecklich bei
 * PROVEN_LIVE gedeckelt: „geprueft ist der Zugangsriegel und die
 * Datenschicht — NICHT die Funktion aller 98 Bereiche." `/admin`
 * antwortet live mit 307. Das belegt, dass niemand hineinkommt. Es belegt
 * nichts darueber, was drinnen passiert.
 *
 * Diese Suite prueft die WIRKUNG, nicht den Riegel — an den zwei
 * Admin-Funktionen mit den weitesten Folgen:
 *
 *   PATCH /api/admin/clients/[id]/status       Betreuung pausieren/beenden
 *   PATCH /api/admin/clients/[id]/pflegegrad   Hoeher-/Herabstufung MDK
 *
 * Beide sind gewaehlt, weil sie etwas veraendern, das man nicht einfach
 * zurueckdreht: der Status sperrt die Einsatzplanung, der Pflegegrad
 * entscheidet ueber Budgetanspruch. Ein Dashboard-Test, der nur prueft,
 * dass eine Seite laedt, wuerde genau daran vorbeigehen.
 *
 * ─────────────────────────────────────────────────────────────────────
 * DER MANDANTENZAUN IST HIER DER KERN
 * ─────────────────────────────────────────────────────────────────────
 * Beide Routen arbeiten mit dem ADMIN-CLIENT, und der umgeht RLS
 * (BYPASSRLS). Der Mandantenzaun ist an dieser Stelle also KEINE Policy,
 * sondern ein `.eq('organization_id', …)` im Anwendungscode — eine Zeile,
 * die man beim Umbauen verlieren kann, ohne dass irgendetwas rot wird.
 * Genau deshalb steht sie hier unter Test, und zwar mit einem echten
 * zweiten Mandanten, dessen Klient unangetastet bleiben muss.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WAS DIESE SUITE AUSDRUECKLICH NICHT TUT
 * ─────────────────────────────────────────────────────────────────────
 * Sie prueft nicht 98 Bereiche. Sie prueft zwei — und benennt das hier,
 * damit niemand aus einem gruenen Lauf liest, das Admin-Dashboard sei
 * insgesamt durchgeprueft. Die uebrigen Bereiche bleiben, was sie waren:
 * erreichbar und mit einem Riegel davor.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import type { SupabaseClient } from '@supabase/supabase-js'

import { baueKettenSchema } from './helpers/kette-schema'
import { macheSupabaseClient } from './helpers/pglite-supabase'

const ORG_A   = 'aaaaaaaa-0000-4000-8000-000000000019'
const ORG_B   = 'bbbbbbbb-0000-4000-8000-000000000019'
const ADMIN   = '11111111-0000-4000-8000-000000000019'
const KLIENT_A = 'c1111111-0000-4000-8000-000000000019'
const KLIENT_B = 'c2222222-0000-4000-8000-000000000019'
const ENGEL    = 'e1111111-0000-4000-8000-000000000019'

const halter = vi.hoisted(() => ({
  client: null as unknown as SupabaseClient,
  nutzer: null as string | null,
  orgId: null as string | null,
  darf: true,
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
  getActiveOrgId: async () => halter.orgId,
  getActiveOrgIdOrDefault: async () => halter.orgId,
}))
vi.mock('@/lib/auth/rollen-quelle', () => ({
  holeRollenQuellenFuer: async () => ({ profil: 'admin', token: 'admin' }),
  quellenDuerfen: () => halter.darf,
}))

/** Alle Audit-Eintraege dieses Laufs — der Pruefpfad steht mit unter Test. */
const auditEintraege: Array<Record<string, any>> = []
vi.mock('@/lib/audit-log', () => ({
  logAuditEvent: async (e: Record<string, any>) => { auditEintraege.push(e); return true },
  logAuditEventOrWarn: async (e: Record<string, any>) => { auditEintraege.push(e); return true },
}))

import { PATCH as PATCH_STATUS } from '@/app/api/admin/clients/[id]/status/route'
import { PATCH as PATCH_PFLEGEGRAD } from '@/app/api/admin/clients/[id]/pflegegrad/route'

let db: PGlite

function anfrage(pfad: string, body: unknown) {
  return new Request(`http://localhost${pfad}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function setzeStatus(id: string, body: unknown) {
  const res = await PATCH_STATUS(
    anfrage(`/api/admin/clients/${id}/status`, body) as never,
    { params: Promise.resolve({ id }) } as never,
  )
  return { status: res.status, body: await res.json() as Record<string, any> }
}

async function setzePflegegrad(id: string, body: unknown) {
  const res = await PATCH_PFLEGEGRAD(
    anfrage(`/api/admin/clients/${id}/pflegegrad`, body) as never,
    { params: Promise.resolve({ id }) } as never,
  )
  return { status: res.status, body: await res.json() as Record<string, any> }
}

async function klient(id: string) {
  const r = await db.query<{
    status: string; pipeline_status: string
    care_level: number | null; pflegegrad: number | null
    care_level_since: Date | null
  }>(`SELECT status, pipeline_status, care_level, pflegegrad, care_level_since
        FROM public.clients WHERE id = $1`, [id])
  return r.rows[0]
}

const JAHR = new Date().getFullYear()

beforeAll(async () => {
  db = await baueKettenSchema()
  halter.client = macheSupabaseClient(db) as unknown as SupabaseClient

  // Live-Stand (nachgemessen 28.08.2026): Migration 20260907010000 ist
  // angewendet, alle fuenf Statuswerte sind erlaubt. Das Kettenschema legt
  // clients ohne diesen Constraint an — ohne den Nachzug liefe der Test
  // gegen eine lockerere Datenbank als die Produktion.
  await db.exec(`
    ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_status_check;
    ALTER TABLE public.clients ADD CONSTRAINT clients_status_check
      CHECK (status = ANY (ARRAY['active'::text,'new'::text,'paused'::text,
                                 'inactive'::text,'archived'::text]));
  `)

  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ('${ADMIN}', 'admin@example.org');
    INSERT INTO public.profiles (id, role, first_name, last_name, email)
      VALUES ('${ADMIN}', 'admin', 'Admin', 'Alpha', 'admin@example.org');
    INSERT INTO public.organizations (id, name, bundesland, status) VALUES
      ('${ORG_A}', 'Mandant A', 'hessen', 'active'),
      ('${ORG_B}', 'Mandant B', 'bayern', 'active');
  `)

  await halter.client.from('caregivers').insert({
    id: ENGEL, organization_id: ORG_A, first_name: 'Marek', last_name: 'Beispiel',
    status: 'active',
  }).select('id')
})

beforeEach(async () => {
  halter.nutzer = ADMIN
  halter.orgId = ORG_A
  halter.darf = true
  auditEintraege.length = 0

  await db.exec(`
    DELETE FROM public.assignments;
    DELETE FROM public.client_budgets;
    DELETE FROM public.clients;
    INSERT INTO public.clients
      (id, organization_id, customer_number, first_name, last_name, status, pipeline_status, care_level, pflegegrad)
    VALUES
      ('${KLIENT_A}', '${ORG_A}', 'KD-A-1', 'Erika', 'Testfall', 'active', 'active', 2, 2),
      ('${KLIENT_B}', '${ORG_B}', 'KD-B-1', 'Fremde', 'Person',  'active', 'active', 2, 2);
  `)
})

// ═══════════════════════════════════════════════════════════════════════
describe('Statuswechsel — die Wirkung', () => {
  it('pausieren setzt Status UND Pipeline-Stufe', async () => {
    const { status, body } = await setzeStatus(KLIENT_A, { status: 'paused' })
    expect(status).toBe(200)
    expect(body.status).toBe('paused')

    const z = await klient(KLIENT_A)
    expect(z.status).toBe('paused')
    // Ohne die Ableitung bliebe pipeline_status stehen — genau der Befund
    // aus Bereich 1 der Lueckenanalyse.
    expect(z.pipeline_status).toBe('paused')
  })

  it('beenden fuehrt die Pipeline auf ended', async () => {
    await setzeStatus(KLIENT_A, { status: 'inactive' })
    expect((await klient(KLIENT_A)).pipeline_status).toBe('ended')
  })

  it('eine ausdrueckliche Pipeline-Stufe schlaegt die Ableitung', async () => {
    await setzeStatus(KLIENT_A, { status: 'paused', pipeline_status: 'lead' })
    expect((await klient(KLIENT_A)).pipeline_status).toBe('lead')
  })

  it('unbekannter Status wird abgewiesen, bevor die Datenbank ihn sieht', async () => {
    const { status, body } = await setzeStatus(KLIENT_A, { status: 'geloescht' })
    expect(status).toBe(400)
    expect(body.error).toMatch(/Ungültiger Status/)
    expect((await klient(KLIENT_A)).status).toBe('active')
  })

  it("'new' laesst sich nicht setzen — ein beendeter Klient wird nicht wieder neu", async () => {
    expect((await setzeStatus(KLIENT_A, { status: 'new' })).status).toBe(400)
    expect((await klient(KLIENT_A)).status).toBe('active')
  })

  it('derselbe Status noch einmal gibt 400 statt eines leeren Erfolgs', async () => {
    const { status, body } = await setzeStatus(KLIENT_A, { status: 'active' })
    expect(status).toBe(400)
    expect(body.error).toMatch(/unverändert/i)
  })

  it('das Beenden warnt vor den geplanten Einsaetzen, die es NICHT storniert', async () => {
    const morgen = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
    await db.query(`
      INSERT INTO public.assignments
        (organization_id, client_id, caregiver_id, assignment_date,
         start_time, end_time, service_type, status)
      VALUES ($1, $2, $3, $4, '09:00', '11:00', 'Betreuung', 'GEPLANT')`,
      [ORG_A, KLIENT_A, ENGEL, morgen])

    const { body } = await setzeStatus(KLIENT_A, { status: 'inactive' })
    const text = body.hinweise.join(' ')
    expect(text).toMatch(/1 geplante/)
    expect(text).toMatch(/storniert sie NICHT/)

    // Und der Einsatz steht auch wirklich noch da — der Hinweis waere
    // sonst falsch, und das faellt einem Text-Test allein nicht auf.
    const r = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.assignments WHERE client_id = $1`, [KLIENT_A])
    expect(r.rows[0].n).toBe(1)
  })

  it('der Statuswechsel loescht nichts und sagt das auch', async () => {
    await db.query(`
      INSERT INTO public.client_budgets
        (client_id, organization_id, year, annual_amount, monthly_amount)
      VALUES ($1, $2, $3, 1572, 131)`, [KLIENT_A, ORG_A, JAHR])

    const { body } = await setzeStatus(KLIENT_A, { status: 'archived' })
    expect(body.hinweise.join(' ')).toMatch(/Aufbewahrungspflicht/)

    const r = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.client_budgets WHERE client_id = $1`, [KLIENT_A])
    expect(r.rows[0].n).toBe(1)
  })

  it('der Pruefpfad haelt fest, dass NICHT geloescht wurde', async () => {
    await setzeStatus(KLIENT_A, { status: 'inactive', grund: 'Kuendigung zum Monatsende' })
    const e = auditEintraege.at(-1)!
    expect(e.entityType).toBe('client')
    expect(e.details.von).toBe('active')
    expect(e.details.nach).toBe('inactive')
    expect(e.details.grund).toBe('Kuendigung zum Monatsende')
    expect(e.details.hinweis).toMatch(/keine Datenlöschung/)
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('Pflegegrad — die Wirkung auf das Budget', () => {
  it('das Hochstufen legt das fehlende Budget nach', async () => {
    const { status, body } = await setzePflegegrad(KLIENT_A, { care_level: 4 })
    expect(status).toBe(200)
    expect(body.vorher).toBe(2)
    expect(body.care_level).toBe(4)
    expect(body.budgetErstellt).toBe(true)

    const z = await klient(KLIENT_A)
    // Beide Spalten muessen mitgehen, sonst laufen FHIR-Export und
    // PDF-Erzeugung auseinander (Projekt-Gedaechtnis: care_level ist
    // fuehrend, pflegegrad bei Bestandskunden NULL).
    expect(z.care_level).toBe(4)
    expect(z.pflegegrad).toBe(4)
  })

  it('das Herabstufen unter die VP/KZP-Grenze warnt und loescht NICHT', async () => {
    // Bestehendes VP/KZP-Budget mit Verbrauch — der Fall, der fachlich
    // entschieden werden muss.
    await db.query(`
      INSERT INTO public.client_budgets
        (client_id, organization_id, year, annual_amount, monthly_amount,
         combined_annual_amount, combined_used_amount)
      VALUES ($1, $2, $3, 1572, 131, 3539, 420)`, [KLIENT_A, ORG_A, JAHR])

    const { status, body } = await setzePflegegrad(KLIENT_A, { care_level: 1 })
    expect(status).toBe(200)
    const text = body.hinweise.join(' ')
    expect(text).toMatch(/Verhinderungs-\/Kurzzeitpflege/)
    expect(text).toMatch(/420\.00/)
    expect(text).toMatch(/NICHT gelöscht/)

    const r = await db.query<{ combined_annual_amount: string }>(
      `SELECT combined_annual_amount FROM public.client_budgets WHERE client_id = $1`,
      [KLIENT_A])
    expect(Number(r.rows[0].combined_annual_amount)).toBe(3539)
  })

  it('Pflegegrad 0 raeumt die Spalten und meldet die Folge fuer das Budget', async () => {
    const { status, body } = await setzePflegegrad(KLIENT_A, { care_level: 0 })
    expect(status).toBe(200)
    expect(body.care_level).toBeNull()
    expect(body.hinweise.join(' ')).toMatch(/kein Anspruch auf §45b/)

    const z = await klient(KLIENT_A)
    expect(z.care_level).toBeNull()
    expect(z.pflegegrad).toBeNull()
  })

  it('ein Pflegegrad ausserhalb 0..5 wird abgewiesen', async () => {
    for (const cl of [-1, 6, 3.5, 'drei']) {
      const { status } = await setzePflegegrad(KLIENT_A, { care_level: cl })
      expect(status).toBe(400)
    }
    expect((await klient(KLIENT_A)).care_level).toBe(2)
  })

  it('ein unveraenderter Pflegegrad gibt 400', async () => {
    const { status, body } = await setzePflegegrad(KLIENT_A, { care_level: 2 })
    expect(status).toBe(400)
    expect(body.error).toMatch(/unverändert/i)
  })

  it('ein falsch formatiertes Gueltigkeitsdatum wird abgewiesen', async () => {
    const { status, body } = await setzePflegegrad(
      KLIENT_A, { care_level: 3, care_level_since: '01.02.2026' })
    expect(status).toBe(400)
    expect(body.error).toMatch(/JJJJ-MM-TT/)
    expect((await klient(KLIENT_A)).care_level).toBe(2)
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('Der Mandantenzaun — hier haelt ihn nur der Anwendungscode', () => {
  // Beide Routen fahren mit dem Admin-Client, der RLS umgeht. Was hier
  // traegt, ist ausschliesslich das .eq('organization_id', …) im Code.

  it('Statuswechsel an einem fremden Klienten: 404, keine Aenderung', async () => {
    const { status } = await setzeStatus(KLIENT_B, { status: 'inactive' })
    expect(status).toBe(404)
    expect((await klient(KLIENT_B)).status).toBe('active')
  })

  it('Pflegegrad an einem fremden Klienten: 404, keine Aenderung', async () => {
    const { status } = await setzePflegegrad(KLIENT_B, { care_level: 5 })
    expect(status).toBe(404)
    const z = await klient(KLIENT_B)
    expect(z.care_level).toBe(2)
    // Und es ist auch kein Budget im fremden Mandanten entstanden.
    const r = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.client_budgets WHERE client_id = $1`, [KLIENT_B])
    expect(r.rows[0].n).toBe(0)
  })

  it('GEGENPROBE: derselbe Aufruf aus dem richtigen Mandanten geht durch', async () => {
    // Ohne diesen Test waere „404 fuer alles" ebenfalls gruen — und der
    // Zaun kein Zaun, sondern ein Defekt.
    halter.orgId = ORG_B
    const { status } = await setzeStatus(KLIENT_B, { status: 'inactive' })
    expect(status).toBe(200)
    expect((await klient(KLIENT_B)).status).toBe('inactive')
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('Der Riegel vor beiden Routen', () => {
  const faelle: Array<[string, () => Promise<{ status: number }>]> = [
    ['Statuswechsel', () => setzeStatus(KLIENT_A, { status: 'paused' })],
    ['Pflegegrad',    () => setzePflegegrad(KLIENT_A, { care_level: 4 })],
  ]

  for (const [name, aufruf] of faelle) {
    it(`${name}: ohne Anmeldung 401 und keine Aenderung`, async () => {
      halter.nutzer = null
      expect((await aufruf()).status).toBe(401)
      const z = await klient(KLIENT_A)
      expect(z.status).toBe('active')
      expect(z.care_level).toBe(2)
    })

    it(`${name}: ohne Berechtigung 403 und keine Aenderung`, async () => {
      halter.darf = false
      expect((await aufruf()).status).toBe(403)
      const z = await klient(KLIENT_A)
      expect(z.status).toBe('active')
      expect(z.care_level).toBe(2)
    })

    it(`${name}: ohne Organisation 403 und keine Aenderung`, async () => {
      halter.orgId = null
      expect((await aufruf()).status).toBe(403)
      const z = await klient(KLIENT_A)
      expect(z.status).toBe('active')
      expect(z.care_level).toBe(2)
    })
  }
})
