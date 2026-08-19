// ═══════════════════════════════════════════════════════════════════════
// Security-Audit 2026-08-19 — MITTEL-1: getActiveOrgId() war fail-open
//
// Vorher lieferte lib/organizations/server.ts bei fehlender Mitgliedschaft
// UND bei jeder Exception die Stamm-Org zurueck. Ein Admin ohne Zeile in
// organization_members landete damit still in fremden Daten; die Guards
// pruefen auf `!organizationId` und konnten deshalb nie greifen.
//
// Diese Suite haelt den neuen Kontrakt fest:
//   getActiveOrgId()        → null (fail-closed)
//   getActiveOrgIdOrDefault() → Stamm-Org (dokumentierte Ausnahme)
//   resolveUserOrgId()      → Org aus caregivers/clients, sonst null
// ═══════════════════════════════════════════════════════════════════════
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const STAMM_ORG = '00000000-0000-4000-8000-000460629986'

let aktuellerUser: { id: string } | null = { id: 'user-1' }
type Mitgliedschaft = { role: string; organizations: { id: string } }
type OrgZeile = { organization_id: string } | null

let mitgliedschaften: Mitgliedschaft[] = []
let mitgliedschaftsFehler: { message: string } | null = null
let caregiverZeile: OrgZeile = null
let clientZeile: OrgZeile = null
let cookieWert: string | undefined

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => (cookieWert ? { value: cookieWert } : undefined) }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: aktuellerUser } }) },
  }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(tabelle: string) {
      if (tabelle === 'organization_members') {
        const kette: Record<string, unknown> = {
          select: () => kette,
          eq: () => kette,
          order: async () => ({ data: mitgliedschaften, error: mitgliedschaftsFehler }),
        }
        return kette
      }
      const zeile = tabelle === 'caregivers' ? caregiverZeile : clientZeile
      const kette: Record<string, unknown> = {
        select: () => kette,
        eq: () => kette,
        not: () => kette,
        limit: () => kette,
        maybeSingle: async () => ({ data: zeile, error: null }),
      }
      return kette
    },
  }),
}))

async function laden() {
  vi.resetModules()
  return await import('@/lib/organizations/server')
}

beforeEach(() => {
  aktuellerUser = { id: 'user-1' }
  mitgliedschaften = []
  mitgliedschaftsFehler = null
  caregiverZeile = null
  clientZeile = null
  cookieWert = undefined
})

describe('getActiveOrgId() ist fail-closed', () => {
  it('ohne eingeloggten User → null (vorher: Stamm-Org)', async () => {
    aktuellerUser = null
    const { getActiveOrgId } = await laden()
    expect(await getActiveOrgId()).toBeNull()
  })

  it('eingeloggt, aber ohne Zeile in organization_members → null', async () => {
    mitgliedschaften = []
    const { getActiveOrgId } = await laden()
    expect(await getActiveOrgId()).toBeNull()
  })

  it('DB-Fehler beim Mitgliedschafts-Lookup → null, kein stiller Stamm-Org-Fallback', async () => {
    mitgliedschaftsFehler = { message: 'connection reset' }
    const { getActiveOrgId } = await laden()
    expect(await getActiveOrgId()).toBeNull()
  })

  it('mit Mitgliedschaft → genau diese Organisation', async () => {
    mitgliedschaften = [{ role: 'owner', organizations: { id: 'org-A' } }]
    const { getActiveOrgId } = await laden()
    expect(await getActiveOrgId()).toBe('org-A')
  })

  it('Org-Switcher-Cookie wird gegen die Mitgliedschaft validiert', async () => {
    mitgliedschaften = [
      { role: 'owner', organizations: { id: '11111111-1111-4111-8111-111111111111' } },
      { role: 'admin', organizations: { id: '22222222-2222-4222-8222-222222222222' } },
    ]
    cookieWert = '22222222-2222-4222-8222-222222222222'
    const { getActiveOrgId } = await laden()
    expect(await getActiveOrgId()).toBe('22222222-2222-4222-8222-222222222222')
  })

  it('Cookie auf eine fremde Org wird ignoriert (kein Mandantensprung)', async () => {
    mitgliedschaften = [{ role: 'owner', organizations: { id: '11111111-1111-4111-8111-111111111111' } }]
    cookieWert = '99999999-9999-4999-8999-999999999999'
    const { getActiveOrgId } = await laden()
    expect(await getActiveOrgId()).toBe('11111111-1111-4111-8111-111111111111')
  })
})

describe('getActiveOrgIdOrDefault() — dokumentierte Ausnahme', () => {
  it('ohne Mitgliedschaft → Stamm-Org', async () => {
    const { getActiveOrgIdOrDefault } = await laden()
    expect(await getActiveOrgIdOrDefault()).toBe(STAMM_ORG)
  })

  it('mit Mitgliedschaft → die echte Organisation, nicht die Stamm-Org', async () => {
    mitgliedschaften = [{ role: 'owner', organizations: { id: 'org-B' } }]
    const { getActiveOrgIdOrDefault } = await laden()
    expect(await getActiveOrgIdOrDefault()).toBe('org-B')
  })
})

describe('resolveUserOrgId() — Rollen ohne organization_members', () => {
  it('Engel: Org kommt aus caregivers.organization_id', async () => {
    caregiverZeile = { organization_id: 'org-engel' }
    const { resolveUserOrgId } = await laden()
    expect(await resolveUserOrgId()).toBe('org-engel')
  })

  it('Kunde: Org kommt aus clients.organization_id', async () => {
    clientZeile = { organization_id: 'org-kunde' }
    const { resolveUserOrgId } = await laden()
    expect(await resolveUserOrgId()).toBe('org-kunde')
  })

  it('Mitgliedschaft hat Vorrang vor caregivers', async () => {
    mitgliedschaften = [{ role: 'owner', organizations: { id: 'org-member' } }]
    caregiverZeile = { organization_id: 'org-engel' }
    const { resolveUserOrgId } = await laden()
    expect(await resolveUserOrgId()).toBe('org-member')
  })

  it('keine Bindung irgendwo → null, NICHT Stamm-Org', async () => {
    const { resolveUserOrgId } = await laden()
    expect(await resolveUserOrgId()).toBeNull()
  })

  it('ohne eingeloggten User → null', async () => {
    aktuellerUser = null
    caregiverZeile = { organization_id: 'org-engel' }
    const { resolveUserOrgId } = await laden()
    expect(await resolveUserOrgId()).toBeNull()
  })
})

// ── Statische Gegenprobe: kein bedingter Org-Fence mehr ────────────────
// Ein `if (orgId)` vor dem .eq('organization_id', …) macht die Trennung
// wirkungslos, sobald die Org fehlt — genau der Fall, den MITTEL-1 erzeugt.
describe('kein bedingter Org-Fence in den umgestellten Routen', () => {
  const routen = [
    'app/api/bookings/notify/route.ts',
    'app/api/bookings/respond/route.ts',
    'app/api/pricing/route.ts',
    'app/api/einsatzplanung/route.ts',
    'app/api/engel/match/route.ts',
  ]

  for (const route of routen) {
    it(`${route} hat keinen \`if (orgId)\`-Fence mehr`, () => {
      const src = readFileSync(join(process.cwd(), route), 'utf8')
      expect(src).not.toMatch(/if\s*\(\s*orgId\s*\)\s*(\{|[a-zA-Z])/)
      expect(src).not.toMatch(/if\s*\(\s*organizationId\s*\)\s*(\{|[a-zA-Z])/)
    })
  }
})

// ── Gegenprobe: Admin-Guards verweigern bei fehlender Org ─────────────
describe('Admin-Guards werten das null aus', () => {
  const guards = [
    'lib/ops/api-auth.ts',
    'lib/personal/api-auth.ts',
    'lib/pflege/api-auth.ts',
    'lib/akten/api-auth.ts',
    'lib/medikamente/api-auth.ts',
    'lib/signaturen/api-auth.ts',
    'lib/kim/api-auth.ts',
    'lib/wunden/api-auth.ts',
    'lib/angehoerige/api-auth.ts',
    'lib/uebergabe/api-auth.ts',
    'lib/expansion/api-auth.ts',
    'lib/abrechnung/require-admin.ts',
  ]

  for (const guard of guards) {
    it(`${guard} antwortet mit 403, wenn keine Organisation aufloesbar ist`, () => {
      const src = readFileSync(join(process.cwd(), guard), 'utf8')
      expect(src).toMatch(/if\s*\(\s*!(organizationId|orgId)\s*\)/)
      expect(src).toContain('403')
    })
  }
})
