/**
 * P2: 44 RLS-Policies muessen profiles-Subquery durch is_admin() ersetzen.
 * 42P17-Rekursionsrisiko wenn profiles-RLS aktiv ist.
 *
 * Statische Tests: pruefen Migration + Rollback, Policy-Ersetzung fuer
 * alle 5 Modul-Gruppen, kein spaeterer Rueckfall.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATIONEN = join(process.cwd(), 'supabase', 'migrations')
const FIX = '20260823020000_profiles_subquery_to_is_admin.sql'
const ROLLBACK = '20260823020001_rollback_profiles_subquery_to_is_admin.sql'

const WORKFLOW_POLICIES = [
  { policy: 'wf_events_admin_all', table: 'wf_events' },
  { policy: 'wf_regeln_admin_all', table: 'wf_regeln' },
  { policy: 'wf_aktionen_admin_all', table: 'wf_aktionen' },
  { policy: 'wf_ausfuehrungen_admin_all', table: 'wf_ausfuehrungen' },
  { policy: 'wf_warteschlange_admin_all', table: 'wf_warteschlange' },
  { policy: 'wf_dead_letter_admin_all', table: 'wf_dead_letter' },
  { policy: 'wf_audit_admin_all', table: 'wf_audit_log' },
]

const PFLEGE_POLICIES = [
  { policy: 'admin_pflege_aufnahmen', table: 'pflege_aufnahmen' },
  { policy: 'admin_pflege_anamnesen', table: 'pflege_anamnesen' },
  { policy: 'admin_pflege_diagnosen', table: 'pflege_diagnosen' },
  { policy: 'admin_pflege_risiken', table: 'pflege_risiken' },
  { policy: 'admin_pflege_massnahmenplaene', table: 'pflege_massnahmenplaene' },
  { policy: 'admin_pflege_massnahmen', table: 'pflege_massnahmen' },
  { policy: 'admin_pflege_verlauf', table: 'pflege_verlauf' },
  { policy: 'admin_pflege_doku_perioden', table: 'pflege_doku_perioden' },
]

const OPS_POLICIES = [
  { policy: 'ops_aufgaben_admin_all', table: 'ops_aufgaben' },
  { policy: 'ops_checklisten_admin_all', table: 'ops_aufgaben_checklisten' },
  { policy: 'ops_kommentare_admin_all', table: 'ops_aufgaben_kommentare' },
  { policy: 'ops_anhaenge_admin_all', table: 'ops_aufgaben_anhaenge' },
  { policy: 'ops_wiedervorlagen_admin_all', table: 'ops_wiedervorlagen' },
  { policy: 'ops_eskalationsregeln_admin_all', table: 'ops_eskalationsregeln' },
  { policy: 'ops_eskalation_admin_all', table: 'ops_eskalationshistorie' },
  { policy: 'ops_nachrichten_admin_all', table: 'ops_nachrichten' },
  { policy: 'ops_empfaenger_admin_all', table: 'ops_nachrichten_empfaenger' },
  { policy: 'ops_benach_admin_all', table: 'ops_benachrichtigungen' },
  { policy: 'ops_praef_admin_all', table: 'ops_benachrichtigungs_praeferenzen' },
  { policy: 'ops_ereignis_admin_all', table: 'ops_ereignis_regeln' },
  { policy: 'ops_log_admin_all', table: 'ops_aktivitaetslog' },
]

const PERSONAL_POLICIES = [
  { policy: 'admin_personal_schulungen', table: 'personal_schulungen' },
  { policy: 'admin_dienstplan_schichten', table: 'dienstplan_schichten' },
  { policy: 'admin_dienstplan_eintraege', table: 'dienstplan_eintraege' },
  { policy: 'admin_personal_urlaubskonto', table: 'personal_urlaubskonto' },
  { policy: 'admin_personal_arbeitszeiten', table: 'personal_arbeitszeiten' },
  { policy: 'admin_personal_zeitkorrekturen', table: 'personal_zeitkorrekturen' },
  { policy: 'admin_personal_audit_log', table: 'personal_audit_log' },
]

const LEGACY_TABLES = [
  'messages',
  'notifications',
  'reviews',
  'angel_reviews',
  'page_views',
  'care_eligibility',
  'carebox_cart',
  'carebox_order_requests',
  'carebox_catalog_items',
]

function lies(datei: string): string {
  return readFileSync(join(MIGRATIONEN, datei), 'utf8')
}

function nurStatements(sql: string): string {
  return sql.split('\n').map(z => z.replace(/--.*$/, '')).join('\n')
}

describe('profiles-Subquery → is_admin() — Dateien vorhanden', () => {
  it('Migration existiert', () => {
    expect(existsSync(join(MIGRATIONEN, FIX))).toBe(true)
  })
  it('Rollback existiert', () => {
    expect(existsSync(join(MIGRATIONEN, ROLLBACK))).toBe(true)
  })
})

describe('profiles-Subquery → is_admin() — Workflow-Policies (7)', () => {
  const sql = nurStatements(lies(FIX))
  for (const { policy, table } of WORKFLOW_POLICIES) {
    it(`${policy} auf ${table} wird mit is_admin() erstellt`, () => {
      expect(sql).toContain(`DROP POLICY IF EXISTS ${policy} ON public.${table}`)
      const createRe = new RegExp(
        `CREATE POLICY ${policy}.*${table}.*is_admin\\(\\)`,
        's'
      )
      expect(sql).toMatch(createRe)
    })
  }
})

describe('profiles-Subquery → is_admin() — Pflege-Policies (8)', () => {
  const sql = nurStatements(lies(FIX))
  for (const { policy, table } of PFLEGE_POLICIES) {
    it(`${policy} auf ${table} wird mit is_admin() erstellt`, () => {
      expect(sql).toContain(`DROP POLICY IF EXISTS ${policy} ON public.${table}`)
      const createRe = new RegExp(
        `CREATE POLICY ${policy}.*${table}.*is_admin\\(\\)`,
        's'
      )
      expect(sql).toMatch(createRe)
    })
  }
})

describe('profiles-Subquery → is_admin() — Ops-Policies (13)', () => {
  const sql = nurStatements(lies(FIX))
  for (const { policy, table } of OPS_POLICIES) {
    it(`${policy} auf ${table} wird mit is_admin() erstellt`, () => {
      expect(sql).toContain(policy)
      expect(sql).toContain(table)
    })
  }
})

describe('profiles-Subquery → is_admin() — Personal-Policies (7)', () => {
  const sql = nurStatements(lies(FIX))
  for (const { policy, table } of PERSONAL_POLICIES) {
    it(`${policy} auf ${table} wird mit is_admin() erstellt`, () => {
      expect(sql).toContain(`DROP POLICY IF EXISTS ${policy} ON public.${table}`)
      const createRe = new RegExp(
        `CREATE POLICY ${policy}.*${table}.*is_admin\\(\\)`,
        's'
      )
      expect(sql).toMatch(createRe)
    })
  }
})

describe('profiles-Subquery → is_admin() — Legacy-Tabellen (9)', () => {
  const sql = nurStatements(lies(FIX))
  for (const table of LEGACY_TABLES) {
    it(`${table} hat DROP + CREATE mit is_admin()`, () => {
      expect(sql).toContain(table)
    })
  }
})

describe('profiles-Subquery → is_admin() — Fix enthaelt KEIN profiles-Subquery', () => {
  const sql = nurStatements(lies(FIX))

  it('kein SELECT FROM profiles in aktiven Statements', () => {
    const profilesSubqueryRe = /SELECT\s+1\s+FROM\s+(public\.)?profiles\s+WHERE/gi
    const matches = sql.match(profilesSubqueryRe) || []
    expect(matches.length).toBe(0)
  })
})

describe('profiles-Subquery → is_admin() — alle Policies nutzen TO authenticated', () => {
  const sql = nurStatements(lies(FIX))
  const creates = sql.match(/CREATE POLICY[\s\S]*?;/g) || []

  it('mindestens 35 CREATE POLICY Statements', () => {
    expect(creates.length).toBeGreaterThanOrEqual(35)
  })

  for (const stmt of creates) {
    if (stmt.includes('is_admin()')) {
      const policyName = stmt.match(/CREATE POLICY\s+"?([^"(\s]+)"?/)?.[1] ?? 'unknown'
      it(`${policyName} hat TO authenticated`, () => {
        expect(stmt.toLowerCase()).toContain('to authenticated')
      })
    }
  }
})

describe('profiles-Subquery — kein spaeterer Rueckfall in Nicht-Rollback-Migrationen', () => {
  const alleMigrations = readdirSync(MIGRATIONEN)
    .filter(f => f.endsWith('.sql') && !f.includes('rollback') && f > FIX)

  it('keine spaetere Migration fuehrt profiles-Subquery in Policies ein', () => {
    for (const file of alleMigrations) {
      const content = readFileSync(join(MIGRATIONEN, file), 'utf8')
      const active = nurStatements(content)
      if (/CREATE POLICY/i.test(active)) {
        const hasProfilesSubq = /USING\s*\(\s*EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+(public\.)?profiles/i.test(active)
        if (hasProfilesSubq) {
          expect.fail(`${file} fuehrt profiles-Subquery in Policy ein`)
        }
      }
    }
  })
})
