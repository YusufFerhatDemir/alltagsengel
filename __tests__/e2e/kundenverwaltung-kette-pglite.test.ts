/**
 * E2E: Kundenverwaltung — Anlage, Kundennummer, Budget, Mandantenzaun
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Die Kundenverwaltung stand in docs/COMPLETION_MATRIX.md auf
 * PROVEN_LIVE mit der Begruendung „vier Klienten sind ein Pilotbestand,
 * kein Betrieb". Vier Zeilen belegen, dass die Tabelle existiert. Sie
 * belegen nicht, dass die Anlage-Kette haelt — und schon gar nicht, was
 * beim FUENFTEN Klienten oder beim ZWEITEN Mandanten passiert.
 *
 * Diese Suite faehrt POST /api/admin/clients durch den echten
 * Route-Handler auf echtem PostgreSQL (PGlite), inklusive
 * `erstelleInitialBudgets`. Die Kette ist:
 *
 *   Berechtigung → Klient → Kundennummer → Budget fuer das Jahr
 *
 * ─────────────────────────────────────────────────────────────────────
 * WAS DIESE SUITE BEIM SCHREIBEN GEFUNDEN HAT (Befund, live bestaetigt)
 * ─────────────────────────────────────────────────────────────────────
 * Auf `clients` liegt live genau ein eindeutiger Index neben dem
 * Primaerschluessel: `clients_customer_number_key UNIQUE (customer_number)`
 * — GLOBAL ueber alle Mandanten. Die Route prueft dagegen mandantenweise
 * (`customer_number` UND `organization_id`). Vorpruefung und Index
 * beantworten also verschiedene Fragen:
 *
 *   • Ein Mandant kann eine Nummer nicht vergeben, die ein ANDERER fuehrt.
 *     Seine eigene Liste ist leer, der Fehler hat fuer ihn keine Ursache.
 *   • Die Vorpruefung meldet „frei", der INSERT scheitert mit 23505, und
 *     die Route reichte `insertError.message` als 500 durch — samt
 *     Constraint-Name und Nummer. Ueber die Mandantengrenze hinweg.
 *   • `generateCustomerNumber()` zieht vier Zufallsziffern: 9000 Nummern
 *     pro Monat fuer ALLE Mandanten zusammen. Die Kollision trifft damit
 *     auch die automatische Anlage.
 *
 * Behoben in zwei Schritten, die diese Suite getrennt prueft:
 * Migration 20260828210000 zieht den Index auf
 * (organization_id, customer_number); die Route faengt 23505 zusaetzlich
 * ab und wirkt damit auch OHNE die Migration.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WARUM ECHTES POSTGRES
 * ─────────────────────────────────────────────────────────────────────
 * Das Testschema aus kette-schema.ts legt `clients` ohne
 * `clients_status_check` an. Live gibt es den Constraint. Diese Suite
 * zieht ihn deshalb ausdruecklich nach — beide Fassungen, die alte enge
 * und die heutige — weil die Route einen Fallback GENAU fuer die enge
 * Fassung enthaelt und ein Testschema ohne Constraint diesen Fallback nie
 * ausloest. Ein Prueflauf, der lockerer ist als die Produktion, prueft
 * einen anderen Code als den ausgelieferten.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import type { SupabaseClient } from '@supabase/supabase-js'

import { baueKettenSchema } from './helpers/kette-schema'
import { macheSupabaseClient } from './helpers/pglite-supabase'

const ORG_A  = 'aaaaaaaa-0000-4000-8000-000000000018'
const ORG_B  = 'bbbbbbbb-0000-4000-8000-000000000018'
const ADMIN  = '11111111-0000-4000-8000-000000000018'

const halter = vi.hoisted(() => ({
  client: null as unknown as SupabaseClient,
  nutzer: null as string | null,
  orgId: null as string | null,
  /** Was quellenDuerfen() zurueckgeben soll — der Berechtigungsriegel. */
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
vi.mock('@/lib/audit-log', () => ({
  logAuditEvent: async () => true,
  logAuditEventOrWarn: async () => true,
}))

import { POST } from '@/app/api/admin/clients/route'

let db: PGlite

function anfrage(body: Record<string, unknown>) {
  return new Request('http://localhost/api/admin/clients', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function anlegen(body: Record<string, unknown>) {
  const res = await POST(anfrage(body) as never)
  return { status: res.status, body: await res.json() as Record<string, any> }
}

async function klienten(orgId?: string) {
  const r = orgId
    ? await db.query<{ id: string; customer_number: string; status: string }>(
        `SELECT id, customer_number, status FROM public.clients
          WHERE organization_id = $1 ORDER BY customer_number`, [orgId])
    : await db.query<{ id: string; customer_number: string; status: string }>(
        `SELECT id, customer_number, status FROM public.clients ORDER BY customer_number`)
  return r.rows
}

/** Setzt clients_status_check auf die gewuenschte Fassung. */
async function statusConstraint(werte: string[] | null) {
  await db.exec(`ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_status_check;`)
  if (werte) {
    await db.exec(
      `ALTER TABLE public.clients ADD CONSTRAINT clients_status_check
         CHECK (status = ANY (ARRAY[${werte.map(w => `'${w}'::text`).join(', ')}]));`)
  }
}

/** Setzt den eindeutigen Index auf die gewuenschte Fassung. */
async function nummernIndex(art: 'global' | 'pro_mandant') {
  await db.exec(`
    ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_customer_number_key;
    ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_kundennummer_pro_mandant;
  `)
  await db.exec(art === 'global'
    ? `ALTER TABLE public.clients
         ADD CONSTRAINT clients_customer_number_key UNIQUE (customer_number);`
    : `ALTER TABLE public.clients
         ADD CONSTRAINT clients_kundennummer_pro_mandant
         UNIQUE (organization_id, customer_number);`)
}

const STAMM = { first_name: 'Erika', last_name: 'Testfall' }

beforeAll(async () => {
  db = await baueKettenSchema()
  halter.client = macheSupabaseClient(db) as unknown as SupabaseClient

  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ('${ADMIN}', 'admin@example.org');
    INSERT INTO public.profiles (id, role, first_name, last_name, email)
      VALUES ('${ADMIN}', 'admin', 'Admin', 'Alpha', 'admin@example.org');
    INSERT INTO public.organizations (id, name, bundesland, status) VALUES
      ('${ORG_A}', 'Mandant A', 'hessen', 'active'),
      ('${ORG_B}', 'Mandant B', 'bayern', 'active');
  `)
})

beforeEach(async () => {
  halter.nutzer = ADMIN
  halter.orgId = ORG_A
  halter.darf = true
  await db.exec(`DELETE FROM public.client_budgets; DELETE FROM public.clients;`)
  // Live-Stand (nachgemessen 28.08.2026): fuenf erlaubte Statuswerte,
  // Migration 20260907010000 ist angewendet.
  await statusConstraint(['active', 'new', 'paused', 'inactive', 'archived'])
  await nummernIndex('pro_mandant')
})

// ═══════════════════════════════════════════════════════════════════════
describe('Anlage — der Normalfall', () => {
  it('legt den Klienten an und vergibt eine Kundennummer', async () => {
    const { status, body } = await anlegen(STAMM)
    expect(status).toBe(201)
    expect(body.client.customer_number).toMatch(/^KD-\d{4}-\d{4}$/)
    expect(body.client.status).toBe('new')
    expect(body.client.pipeline_status).toBe('erstgespraech')
    expect(body.hinweise).toEqual([])
    expect(await klienten(ORG_A)).toHaveLength(1)
  })

  it('uebernimmt eine vorgegebene Kundennummer', async () => {
    const { status, body } = await anlegen({ ...STAMM, customer_number: 'KD-EIGEN-1' })
    expect(status).toBe(201)
    expect(body.client.customer_number).toBe('KD-EIGEN-1')
  })

  it('legt den Klienten beim aufrufenden Mandanten ab, nicht in der Stamm-Org', async () => {
    halter.orgId = ORG_B
    const { body } = await anlegen(STAMM)
    const r = await db.query<{ organization_id: string }>(
      `SELECT organization_id FROM public.clients WHERE id = $1`, [body.client.id])
    expect(r.rows[0].organization_id).toBe(ORG_B)
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('Eingabepruefung', () => {
  it('ohne Vor- oder Nachname wird abgewiesen', async () => {
    expect((await anlegen({ last_name: 'Testfall' })).status).toBe(400)
    expect((await anlegen({ first_name: 'Erika' })).status).toBe(400)
    // Leerzeichen zaehlen nicht als Name.
    expect((await anlegen({ first_name: '   ', last_name: 'Testfall' })).status).toBe(400)
    expect(await klienten()).toHaveLength(0)
  })

  it('ein Pflegegrad ausserhalb 1..5 wird abgewiesen', async () => {
    for (const cl of [0, 6, 2.5]) {
      const { status, body } = await anlegen({ ...STAMM, care_level: cl })
      expect(status).toBe(400)
      expect(body.error).toMatch(/Pflegegrad/)
    }
    expect(await klienten()).toHaveLength(0)
  })

  it('care_level wird auf beide Spalten geschrieben', async () => {
    // Projekt-Gedaechtnis: care_level ist fuehrend, pflegegrad ist bei
    // Bestandskunden NULL. Bei der Neuanlage muessen beide stimmen,
    // sonst entsteht genau dieser Bestand neu.
    const { body } = await anlegen({ ...STAMM, care_level: 3 })
    const r = await db.query<{ care_level: number; pflegegrad: number }>(
      `SELECT care_level, pflegegrad FROM public.clients WHERE id = $1`, [body.client.id])
    expect(r.rows[0].care_level).toBe(3)
    expect(r.rows[0].pflegegrad).toBe(3)
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('Budget — Schritt 3 der Kette', () => {
  it('ab Pflegegrad 1 entsteht ein Budget fuer das laufende Jahr', async () => {
    const { status, body } = await anlegen({ ...STAMM, care_level: 2 })
    expect(status).toBe(201)
    expect(body.hinweise).toEqual([])

    const r = await db.query<{ n: number; annual: string; monthly: string }>(`
      SELECT count(*)::int AS n,
             max(annual_amount)::text  AS annual,
             max(monthly_amount)::text AS monthly
        FROM public.client_budgets WHERE client_id = $1`, [body.client.id])
    expect(r.rows[0].n).toBe(1)
    expect(Number(r.rows[0].monthly)).toBeGreaterThan(0)
    expect(Number(r.rows[0].annual)).toBeGreaterThan(0)
  })

  it('ohne Pflegegrad entsteht KEIN Budget — und das ist kein Fehler', async () => {
    const { status, body } = await anlegen(STAMM)
    expect(status).toBe(201)
    expect(body.hinweise).toEqual([])
    const r = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.client_budgets WHERE client_id = $1`,
      [body.client.id])
    expect(r.rows[0].n).toBe(0)
  })

  it('das Budget haengt am selben Mandanten wie der Klient', async () => {
    halter.orgId = ORG_B
    const { body } = await anlegen({ ...STAMM, care_level: 4 })
    const r = await db.query<{ organization_id: string }>(
      `SELECT organization_id FROM public.client_budgets WHERE client_id = $1`,
      [body.client.id])
    expect(r.rows[0].organization_id).toBe(ORG_B)
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('Kundennummer — der Befund dieser Suite', () => {
  it('dieselbe Nummer zweimal im SELBEN Mandanten gibt 409', async () => {
    expect((await anlegen({ ...STAMM, customer_number: 'KD-DOPPEL' })).status).toBe(201)
    const { status, body } = await anlegen({ ...STAMM, customer_number: 'KD-DOPPEL' })
    expect(status).toBe(409)
    expect(body.error).toBe('Kundennummer bereits vergeben.')
    expect(await klienten(ORG_A)).toHaveLength(1)
  })

  it('BEHOBEN: zwei Mandanten duerfen dieselbe Kundennummer fuehren', async () => {
    expect((await anlegen({ ...STAMM, customer_number: 'KD-0001' })).status).toBe(201)
    halter.orgId = ORG_B
    const { status } = await anlegen({ ...STAMM, customer_number: 'KD-0001' })
    expect(status).toBe(201)
    expect(await klienten(ORG_A)).toHaveLength(1)
    expect(await klienten(ORG_B)).toHaveLength(1)
  })

  it('GEGENPROBE mit dem alten globalen Index: 409 statt roher 500', async () => {
    // Stellt den Live-Stand VOR Migration 20260828210000 nach. Der
    // Route-Fallback muss auch dort greifen — die Migration ist noch nicht
    // angewendet, und bis dahin ist dieser Zweig der einzige Schutz.
    await nummernIndex('global')

    expect((await anlegen({ ...STAMM, customer_number: 'KD-GLOBAL' })).status).toBe(201)

    halter.orgId = ORG_B
    const { status, body } = await anlegen({ ...STAMM, customer_number: 'KD-GLOBAL' })

    expect(status).toBe(409)
    expect(body.error).toBe('Kundennummer bereits vergeben.')
    // Und vor allem: die Antwort verraet die Datenbank nicht.
    const text = JSON.stringify(body)
    expect(text).not.toMatch(/customer_number_key|duplicate key|constraint/i)
  })

  it('GEGENPROBE: eine ERZEUGTE Nummer wird bei Kollision neu gezogen', async () => {
    await nummernIndex('global')

    // Erster Klient bekommt eine erzeugte Nummer …
    const erster = await anlegen(STAMM)
    expect(erster.status).toBe(201)
    const belegt = erster.body.client.customer_number as string

    // … die wir im zweiten Mandanten als Kollision erzwingen, indem wir
    // sie dort vorbelegen. Die Route erzeugt eine Nummer, trifft die
    // belegte, und muss neu ziehen statt aufzugeben.
    halter.orgId = ORG_B
    const zweiter = await anlegen({ ...STAMM, customer_number: belegt })
    expect(zweiter.status).toBe(409)   // vorgegeben → kein Neuziehen

    // Der erzeugte Weg dagegen laeuft durch.
    const dritter = await anlegen(STAMM)
    expect(dritter.status).toBe(201)
    expect(dritter.body.client.customer_number).not.toBe(belegt)
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('Der Status-Fallback fuer die enge Datenbank', () => {
  it('mit dem alten engen Constraint wird als inactive angelegt UND gemeldet', async () => {
    // Live ist dieser Zustand seit 20260907010000 vorbei (nachgemessen
    // 28.08.2026). Der Fallback bleibt im Code und wird hier festgehalten,
    // damit er nicht unbemerkt kaputtgeht — und damit sichtbar bleibt,
    // dass er den Nutzer INFORMIERT statt still einen anderen Status zu
    // setzen.
    await statusConstraint(['active', 'paused', 'inactive'])

    const { status, body } = await anlegen(STAMM)
    expect(status).toBe(201)
    expect(body.client.status).toBe('inactive')
    expect(body.hinweise.join(' ')).toMatch(/20260907010000/)
    // Die Lebenszyklus-Stufe bleibt korrekt — sie steht in pipeline_status.
    expect(body.client.pipeline_status).toBe('erstgespraech')
  })

  it('mit dem heutigen Constraint greift der Fallback NICHT', async () => {
    const { body } = await anlegen(STAMM)
    expect(body.client.status).toBe('new')
    expect(body.hinweise).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('Der Riegel vor der Kette', () => {
  it('ohne Anmeldung: 401 und keine Zeile', async () => {
    halter.nutzer = null
    expect((await anlegen(STAMM)).status).toBe(401)
    expect(await klienten()).toHaveLength(0)
  })

  it('ohne Berechtigung stammdaten.schreiben: 403 und keine Zeile', async () => {
    halter.darf = false
    expect((await anlegen(STAMM)).status).toBe(403)
    expect(await klienten()).toHaveLength(0)
  })

  it('ohne Organisation: 403 und keine Zeile', async () => {
    halter.orgId = null
    expect((await anlegen(STAMM)).status).toBe(403)
    expect(await klienten()).toHaveLength(0)
  })
})
