/**
 * Phase-3 Multi-Mandant — Tenant-Isolation-Tests
 *
 * Diese Suite hat ZWEI unabhängige Ebenen:
 *
 *  1. STATISCH (läuft immer, ohne jede DB-Verbindung):
 *     - Parst supabase/migrations/*.sql und prüft strukturell, dass die
 *       RLS-Fence, Helper-Funktionen und Grants wie im Bauplan angelegt
 *       sind, und dass keine neuen "Live-only"-Tabellen (nicht in den
 *       Migrationen enthalten) unbemerkt dazukommen.
 *     - Mockt lib/organizations/server.ts (requireOrgRole) und prüft die
 *       Zugriffslogik der Admin-Routen ohne echte DB.
 *
 *  2. DYNAMISCH (nur wenn eine Shadow-Datenbank konfiguriert ist):
 *     - Meldet sich als echter Nutzer aus Org A an und versucht,
 *       SELECT/INSERT/UPDATE/DELETE auf Org-B-Daten auszuführen.
 *     - Prüft, dass service_role weiterhin mandantenübergreifend lesen kann.
 *     - Wird übersprungen (nicht "grün gelogen"), wenn die Env-Variablen
 *       fehlen — siehe audit/SHADOW_DB_MIGRATION_REPORT.md, warum das
 *       aktuell der Fall ist (kein Supabase-Access-Token, kein Docker).
 *
 *  Aktivierung der dynamischen Tests — lokal via Shadow-DB-Stack:
 *    ./scripts/shadow-db.sh test          (baut DB + Seed von null)
 *    ./scripts/shadow-db-http.sh          (startet PostgREST + Auth-Shim,
 *                                          gibt die drei Env-Variablen aus)
 *  oder gegen eine Supabase-Branch:
 *    SHADOW_SUPABASE_URL=https://<branch-ref>.supabase.co \
 *    SHADOW_SUPABASE_ANON_KEY=... \
 *    SHADOW_SUPABASE_SERVICE_ROLE_KEY=... \
 *    npx vitest run __tests__/shadow-db/tenant-isolation.test.ts
 *  Voraussetzung: supabase/shadow/10_seed_two_orgs.sql wurde vorher gegen
 *  dieselbe Shadow-DB ausgeführt (legt die Test-User/-Orgs/-Klienten an).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'supabase', 'migrations')
const PHASE3_MIGRATION = 'supabase/migrations/20260801_phase3_multi_mandant_saas.sql'

function readMigration(file: string): string {
  return fs.readFileSync(path.join(__dirname, '..', '..', file), 'utf-8')
}

function allMigrationFiles(): string[] {
  return fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort()
}

// ═══════════════════════════════════════════════════════════════════
// 1) STATISCH — Migrations-Audit (kein DB-Zugriff nötig)
// ═══════════════════════════════════════════════════════════════════
describe('Statisch: Phase-3 Migration — RLS-Fence-Struktur', () => {
  const sql = readMigration(PHASE3_MIGRATION)

  it('legt organizations / organization_members / organization_subscriptions an', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.organizations/)
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.organization_members/)
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.organization_subscriptions/)
  })

  it('current_org_id() löst in der dokumentierten Reihenfolge auf: JWT → Mitgliedschaft → Stamm-Org', () => {
    const fn = sql.match(/CREATE OR REPLACE FUNCTION public\.current_org_id[\s\S]*?\$\$;/)?.[0] ?? ''
    expect(fn).toMatch(/app_metadata.*org_id/)
    expect(fn).toMatch(/organization_members/)
    expect(fn).toMatch(/00000000-0000-4000-8000-000460629986/)
  })

  it('current_org_id/is_org_member/has_org_role sind SECURITY DEFINER (sonst scheitert der Lookup an der eigenen RLS)', () => {
    for (const fn of ['current_org_id', 'is_org_member', 'has_org_role']) {
      const def = sql.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}[\\s\\S]*?\\$\\$;`))?.[0] ?? ''
      expect(def, `Funktion ${fn} nicht gefunden`).not.toBe('')
      expect(def).toMatch(/SECURITY DEFINER/)
    }
  })

  it('EXECUTE-Rechte auf die Helper-Funktionen sind von public zurückgezogen', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.current_org_id\(\) FROM public/)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.is_org_member\(uuid\) FROM public/)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.has_org_role\(uuid, text\[\]\) FROM public/)
  })

  it('Fence-Policy ist RESTRICTIVE (schränkt bestehende Policies ein, statt neue Rechte zu vergeben)', () => {
    expect(sql).toMatch(/CREATE POLICY "%s_org_fence" ON public\.%I AS RESTRICTIVE FOR ALL/)
    expect(sql).toMatch(/USING \(organization_id = public\.current_org_id\(\)\)/)
    expect(sql).toMatch(/WITH CHECK \(organization_id = public\.current_org_id\(\)\)/)
  })

  it('tenant_tables-Array enthält alle geschäftskritischen Kern-Tabellen', () => {
    const arr = sql.match(/tenant_tables text\[\] := ARRAY\[([\s\S]*?)\];/)?.[1] ?? ''
    const critical = [
      'clients', 'care_recipients', 'caregivers', 'service_records',
      'invoices', 'client_budgets', 'verordnungen', 'fahrzeuge',
    ]
    for (const t of critical) {
      expect(arr, `Tabelle '${t}' fehlt im tenant_tables-Array`).toMatch(new RegExp(`'${t}'`))
    }
  })

  it('Migration ist transaktional (BEGIN…COMMIT) und idempotent (IF NOT EXISTS / ON CONFLICT durchgängig)', () => {
    expect(sql.match(/^BEGIN;/m)).toBeTruthy()
    expect(sql.match(/^COMMIT;/m)).toBeTruthy()
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS/)
    expect(sql).not.toMatch(/^\s*DROP TABLE\b/m)
  })

  it('Spalten-Rollout prüft information_schema, bevor ALTER TABLE ausgeführt wird (Schutz gegen Live-only-Tabellen)', () => {
    expect(sql).toMatch(/IF NOT EXISTS \(\s*SELECT 1 FROM information_schema\.tables/)
    expect(sql).toMatch(/RAISE NOTICE 'Tabelle % existiert nicht/)
  })
})

// ═══════════════════════════════════════════════════════════════════
// 2) STATISCH — Regression-Guard: "Live-only"-Tabellen (nicht in
//    Migrationen enthalten) dürfen nicht unbemerkt wachsen oder schrumpfen.
//    Siehe audit/SHADOW_DB_MIGRATION_REPORT.md, Abschnitt "Kritischer Befund".
// ═══════════════════════════════════════════════════════════════════
describe('Statisch: Live-only-Tabellen (Schema existiert NICHT in supabase/migrations/)', () => {
  // Diese Tabellen existierten bis 2026-08-01 NUR live in Supabase und
  // werden seit 20260101000000_baseline_live_only_tables.sql per Migration
  // angelegt. Die Liste bleibt als Regressions-Anker: fällt eine davon
  // wieder aus den Migrationen heraus, schlägt der Test unten an.
  const KNOWN_LIVE_ONLY_TABLES = new Set([
    'clients', 'caregivers', 'applications', 'assignments', 'absences',
    'bookings', 'medikamentenplan', 'notfall_info', 'substitution_requests',
    'client_preferred_substitutes', 'satisfaction_calls', 'fahrzeuge',
    'caregiver_bonuses', 'caregiver_documents', 'caregiver_initials_history',
    'caregiver_qualifications', 'cooperation_partners', 'hygienebox_orders',
    'client_budgets', 'budget_transactions', 'invoices', 'invoice_items',
    'invoice_disputes', 'service_records', 'abrechnungslaeufe',
    'abrechnung_zertifikate', 'mis_applicants', 'mis_availability',
    'mis_complaints', 'mis_job_postings', 'mis_shifts',
  ])

  function tablesCreatedByMigrations(): Set<string> {
    const created = new Set<string>()
    // initial-setup.sql läuft im kanonischen Aufbau (scripts/shadow-db.sh)
    // VOR den Migrationen und legt u.a. bookings/profiles an — gehört
    // deshalb mit in die Menge der repo-definierten Tabellen.
    const sources = [
      'supabase/initial-setup.sql',
      ...allMigrationFiles().map(f => path.join('supabase', 'migrations', f)),
    ]
    for (const file of sources) {
      const sql = readMigration(file)
      for (const m of sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?(?:public\.)?"?(\w+)"?/gi)) {
        created.add(m[1].toLowerCase())
      }
    }
    return created
  }

  function tenantTables(): string[] {
    const sql = readMigration(PHASE3_MIGRATION)
    const arr = sql.match(/tenant_tables text\[\] := ARRAY\[([\s\S]*?)\];/)?.[1] ?? ''
    return [...arr.matchAll(/'(\w+)'/g)].map(m => m[1])
  }

  it('JEDE tenant_tables-Tabelle wird inzwischen per Migration erstellt (Baseline 20260101000000 schließt die Live-only-Lücke)', () => {
    const created = tablesCreatedByMigrations()
    const missing = tenantTables().filter(t => !created.has(t))
    expect(
      missing,
      `Tabelle(n) ohne CREATE TABLE in supabase/migrations/: ${missing.join(', ')}. ` +
      `Ein Replay auf leerer DB würde brechen — Migration ergänzen (siehe audit/DATABASE_SCHEMA_GAP_REPORT.md).`
    ).toEqual([])
  })

  it('die früheren Live-only-Tabellen (u.a. "clients") sind jetzt alle per Baseline-Migration angelegt', () => {
    // Bis 2026-08-01 brach ein Migrations-Replay auf leerer DB mit
    // "relation public.clients does not exist" (siehe audit/SHADOW_DB_MIGRATION_REPORT.md).
    // Seit 20260101000000_baseline_live_only_tables.sql ist die Lücke zu —
    // dieser Test hält sie zu.
    const eylem = readMigration('supabase/migrations/20260719000200_eylem_audit_complete_features.sql')
    expect(eylem).toMatch(/REFERENCES public\.clients\(id\)/)
    const created = tablesCreatedByMigrations()
    const stillMissing = [...KNOWN_LIVE_ONLY_TABLES].filter(t => !created.has(t))
    expect(stillMissing).toEqual([])
  })

  it('keine Migration enthält destruktive DROP TABLE / TRUNCATE außerhalb von Kommentaren', () => {
    // Rollback-Migrationen enthalten absichtlich DROP TABLE — das ist ihr Zweck
    for (const file of allMigrationFiles().filter(f => !f.includes('rollback'))) {
      const sql = readMigration(path.join('supabase', 'migrations', file))
      const codeOnly = sql
        .split('\n')
        .filter(line => !line.trim().startsWith('--'))
        .filter(line => !/^\s*(REVOKE|GRANT)\b/i.test(line))
        .join('\n')
      expect(codeOnly, `${file} enthält DROP TABLE/TRUNCATE`).not.toMatch(/\b(DROP TABLE|TRUNCATE)\b/i)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════
// 3) STATISCH (Mock) — Admin-Routen prüfen Organisationszugehörigkeit
//    requireOrgRole() wird mit gemocktem Supabase-Client getestet,
//    keine echte DB nötig.
// ═══════════════════════════════════════════════════════════════════
const { mockGetUser, mockMaybeSingle } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockMaybeSingle: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mockGetUser },
  }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: mockMaybeSingle,
          }),
        }),
      }),
    }),
  }),
}))

describe('Statisch (Mock): requireOrgRole() — Admin-Routen-Guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('nicht angemeldeter User → 401', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const { requireOrgRole } = await import('@/lib/organizations/server')

    const result = await requireOrgRole('aaaaaaaa-0000-4000-8000-000000000001')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(401)
  })

  it('angemeldeter User ohne Mitgliedschaft in der Ziel-Org → 403', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-org-b' } } })
    mockMaybeSingle.mockResolvedValue({ data: null })
    const { requireOrgRole } = await import('@/lib/organizations/server')

    const result = await requireOrgRole('aaaaaaaa-0000-4000-8000-000000000001')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(403)
  })

  it('Mitglied mit unzureichender Rolle (staff bei owner/admin-Anforderung) → 403', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'staff-user' } } })
    mockMaybeSingle.mockResolvedValue({ data: { role: 'staff' } })
    const { requireOrgRole } = await import('@/lib/organizations/server')

    const result = await requireOrgRole('aaaaaaaa-0000-4000-8000-000000000001', ['owner', 'admin'])

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(403)
  })

  it('Mitglied mit passender Rolle → ok', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'owner-user' } } })
    mockMaybeSingle.mockResolvedValue({ data: { role: 'owner' } })
    const { requireOrgRole } = await import('@/lib/organizations/server')

    const result = await requireOrgRole('aaaaaaaa-0000-4000-8000-000000000001', ['owner', 'admin'])

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.role).toBe('owner')
  })
})

// ═══════════════════════════════════════════════════════════════════
// 4) DYNAMISCH — echte Shadow-DB (übersprungen ohne Konfiguration)
// ═══════════════════════════════════════════════════════════════════
const SHADOW_URL = process.env.SHADOW_SUPABASE_URL
const SHADOW_ANON_KEY = process.env.SHADOW_SUPABASE_ANON_KEY
const SHADOW_SERVICE_KEY = process.env.SHADOW_SUPABASE_SERVICE_ROLE_KEY
const hasShadowDb = Boolean(SHADOW_URL && SHADOW_ANON_KEY && SHADOW_SERVICE_KEY)

// IDs entsprechen supabase/shadow/10_seed_two_orgs.sql (Quelle der Wahrheit
// für die lokale Shadow-DB via scripts/shadow-db.sh).
const ORG_A = 'aaaaaaaa-0000-4000-8000-000000000001'
const ORG_B = 'bbbbbbbb-0000-4000-8000-000000000002'
const ORG_B_CLIENT = 'c1b00000-0000-4000-8000-000000000003'
const ORG_A_STAFF_EMAIL = 'admin-a@shadow.test'
const TEST_PASSWORD = 'ShadowTest123!'

describe.skipIf(!hasShadowDb)('Dynamisch: RLS-Isolation gegen echte Shadow-DB', () => {
  it('Org-A-User kann Org-B-Klienten NICHT lesen (SELECT)', async () => {
    const { createClient } = await import('@supabase/supabase-js')
    const client = createClient(SHADOW_URL!, SHADOW_ANON_KEY!)
    const { error: signInError } = await client.auth.signInWithPassword({
      email: ORG_A_STAFF_EMAIL,
      password: TEST_PASSWORD,
    })
    expect(signInError).toBeNull()

    const { data, error } = await client.from('clients').select('id').eq('id', ORG_B_CLIENT)
    expect(error).toBeNull() // RLS liefert leeres Ergebnis, keinen Query-Fehler
    expect(data).toEqual([])
  })

  it('Org-A-User kann KEINE Zeile in Org B einfügen (INSERT)', async () => {
    const { createClient } = await import('@supabase/supabase-js')
    const client = createClient(SHADOW_URL!, SHADOW_ANON_KEY!)
    await client.auth.signInWithPassword({ email: ORG_A_STAFF_EMAIL, password: TEST_PASSWORD })

    const { error } = await client.from('clients').insert({
      first_name: 'Illegal', last_name: 'Cross-Tenant', organization_id: ORG_B,
    })
    expect(error).not.toBeNull()
  })

  it('Org-A-User kann Org-B-Klienten NICHT verändern (UPDATE) oder löschen (DELETE)', async () => {
    const { createClient } = await import('@supabase/supabase-js')
    const client = createClient(SHADOW_URL!, SHADOW_ANON_KEY!)
    await client.auth.signInWithPassword({ email: ORG_A_STAFF_EMAIL, password: TEST_PASSWORD })

    const upd = await client.from('clients').update({ last_name: 'Gehackt' }).eq('id', ORG_B_CLIENT).select()
    expect(upd.data).toEqual([])

    const del = await client.from('clients').delete().eq('id', ORG_B_CLIENT).select()
    expect(del.data).toEqual([])
  })

  it('service_role liest mandantenübergreifend (Admin-Panel-Pfad bleibt funktionsfähig)', async () => {
    const { createClient } = await import('@supabase/supabase-js')
    const admin = createClient(SHADOW_URL!, SHADOW_SERVICE_KEY!)

    const { data, error } = await admin
      .from('clients')
      .select('organization_id')
      .in('organization_id', [ORG_A, ORG_B])

    expect(error).toBeNull()
    const orgIds = new Set((data ?? []).map(r => r.organization_id))
    expect(orgIds.has(ORG_A)).toBe(true)
    expect(orgIds.has(ORG_B)).toBe(true)
  })
})

if (!hasShadowDb) {
  describe('Dynamisch: RLS-Isolation gegen echte Shadow-DB', () => {
    it.skip('übersprungen — SHADOW_SUPABASE_URL/ANON_KEY/SERVICE_ROLE_KEY nicht gesetzt (siehe audit/SHADOW_DB_MIGRATION_REPORT.md)', () => {})
  })
}
