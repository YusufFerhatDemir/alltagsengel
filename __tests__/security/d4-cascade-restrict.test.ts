/**
 * D4: ON DELETE CASCADE → RESTRICT auf Pflegedokumentation
 *
 * Prüft:
 * 1) Migration existiert und konvertiert alle betroffenen Tabellen
 * 2) Interne Parent-Child-CASCADEs bleiben erhalten
 * 3) Rollback-Migration existiert
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const REPO_ROOT = path.resolve(__dirname, '../..')
const read = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), 'utf-8')

const MIGRATION = 'supabase/migrations/20260831010100_d4_cascade_to_restrict.sql'
const ROLLBACK = 'supabase/migrations/20260831010001_rollback_d4_cascade_to_restrict.sql'

const PFLEGE_TABELLEN_MIT_CLIENT_FK = [
  'pflege_aufnahmen',
  'pflege_anamnesen',
  'pflege_diagnosen',
  'pflege_risiken',
  'pflege_massnahmenplaene',
  'pflege_verlauf',
  'pflege_doku_perioden',
  'sis_assessments',
  'vital_signs',
  'vital_sign_thresholds',
  'wounds',
  'medikamente',
  'medikament_eingaben',
]

describe('D4: CASCADE → RESTRICT Migration', () => {
  it('Migration existiert', () => {
    expect(existsSync(path.join(REPO_ROOT, MIGRATION))).toBe(true)
  })

  it('Rollback existiert', () => {
    expect(existsSync(path.join(REPO_ROOT, ROLLBACK))).toBe(true)
  })

  const migrationSql = read(MIGRATION)

  for (const tabelle of PFLEGE_TABELLEN_MIT_CLIENT_FK) {
    it(`konvertiert ${tabelle}.client_id zu RESTRICT`, () => {
      expect(migrationSql).toContain(`'${tabelle}'`)
      expect(migrationSql).toContain('ON DELETE RESTRICT')
    })
  }

  it('benutzt idempotentes Pattern (kein harter DROP ohne Check)', () => {
    expect(migrationSql).toContain('confdeltype')
  })

  it('enthält Transaktions-Klammern', () => {
    expect(migrationSql).toContain('BEGIN')
    expect(migrationSql).toContain('COMMIT')
  })

  it('räumt Hilfsfunktion auf', () => {
    expect(migrationSql).toContain('DROP FUNCTION IF EXISTS _tmp_fk_cascade_to_restrict')
  })
})

describe('D4: Interne Parent-Child-CASCADEs bleiben erhalten', () => {
  const migrationSql = read(MIGRATION)

  const INTERNE_CASCADE_TABELLEN = [
    'pflege_massnahmen',       // plan_id → pflege_massnahmenplaene(id) CASCADE
    'wound_assessments',       // wound_id → wounds(id) CASCADE
    'wound_treatments',        // wound_id → wounds(id) CASCADE
    'wound_photos',            // wound_id → wounds(id) CASCADE
    'sis_themenfelder',        // assessment_id → sis_assessments(id) CASCADE
    'sis_risikomatrix',        // assessment_id → sis_assessments(id) CASCADE
    'medikament_eingaben',     // medikament_id → medikamente(id) CASCADE (ok, medikamente.client_id wird RESTRICT)
  ]

  for (const tabelle of INTERNE_CASCADE_TABELLEN) {
    it(`${tabelle}: interne CASCADE wird NICHT in RESTRICT umgewandelt (außer client_id)`, () => {
      if (tabelle === 'medikament_eingaben') {
        // medikament_eingaben hat SOWOHL client_id→clients (wird RESTRICT) als auch
        // medikament_id→medikamente (bleibt CASCADE). Die Migration konvertiert nur
        // den client_id FK.
        expect(migrationSql).toContain("'medikament_eingaben', 'client_id'")
        expect(migrationSql).not.toContain("'medikament_eingaben', 'medikament_id'")
        return
      }
      // Alle anderen internen CASCADEs sollten NICHT in der Migration auftauchen
      expect(migrationSql).not.toContain(`'${tabelle}', 'plan_id'`)
      expect(migrationSql).not.toContain(`'${tabelle}', 'wound_id'`)
      expect(migrationSql).not.toContain(`'${tabelle}', 'assessment_id'`)
    })
  }
})

describe('D4: Ursprüngliche Migrationen haben CASCADE (Ist-Zustand vor Fix)', () => {
  const QUELL_MIGRATIONEN = [
    'supabase/migrations/20260810010000_pflegedokumentation.sql',
    'supabase/migrations/20260820010000_medikamentenmanagement.sql',
    'supabase/migrations/20260818010100_vitalwerte.sql',
    'supabase/migrations/20260818030000_wunddokumentation.sql',
    'supabase/migrations/20260818010000_sis_strukturierte_informationssammlung.sql',
  ]

  for (const mig of QUELL_MIGRATIONEN) {
    it(`${path.basename(mig)} hat ON DELETE CASCADE auf clients(id)`, () => {
      const sql = read(mig)
      expect(sql).toMatch(/REFERENCES\s+(public\.)?clients\(id\)\s+ON DELETE CASCADE/)
    })
  }
})
