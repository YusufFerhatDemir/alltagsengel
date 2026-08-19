// ═══════════════════════════════════════════════════════════════════════
// Master-Final-Release-Audit 2026-08-19, Befunde A-4 / I-4 und B-1 / I-5
//
// A-4: supabase/functions/account-hard-delete/index.ts fing den Fehler
//      des documents-Deletes mit `.catch(() => {})` ab, gestuetzt auf den
//      ueberholten Kommentar "documents-Tabelle existiert derzeit nicht in
//      Produktion". Sie existiert (Migration 20260804200000). Der
//      Art.-17-DSGVO-Hard-Delete meldete Erfolg, obwohl personenbezogene
//      Dokumente stehen bleiben konnten.
//
// B-1: ESLint lintete .next-old/** und .claude/worktrees/** mit — rund
//      63 800 der 66 109 Meldungen kamen aus minifiziertem Fremdcode.
//      Als CI-Gate war der Lauf damit wertlos.
//
// Beides sind Eigenschaften von Dateien (Deno-Edge-Function bzw.
// ESLint-Konfiguration), die in dieser Suite nicht ausfuehrbar sind —
// deshalb hier bewusst Quelltext-Assertions.
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const WURZEL = path.join(__dirname, '..', '..')

describe('A-4 — DSGVO-Hard-Delete verschluckt die Dokument-Loeschung nicht mehr', () => {
  const quelle = fs.readFileSync(
    path.join(WURZEL, 'supabase', 'functions', 'account-hard-delete', 'index.ts'),
    'utf-8',
  )

  it('faengt den Fehler des documents-Deletes nicht mehr weg', () => {
    expect(quelle).not.toMatch(/from\('documents'\)[\s\S]{0,120}?\.catch\(\(\)\s*=>\s*\{\}\)/)
    expect(quelle).not.toContain(".then(() => {}).catch(() => {})")
  })

  it('wertet den Fehler des documents-Deletes aus', () => {
    expect(quelle).toMatch(/const \{ error: docErr \} = await admin\.from\('documents'\)\.delete\(\)/)
    expect(quelle).toMatch(/if \(docErr\)/)
  })

  it('bricht bei Fehler ab, BEVOR auth.users geloescht wird', () => {
    const docIndex = quelle.indexOf("from('documents')")
    const abbruch = quelle.indexOf('continue', docIndex)
    const authDelete = quelle.indexOf('auth.admin.deleteUser', docIndex)
    expect(docIndex).toBeGreaterThan(-1)
    expect(abbruch).toBeGreaterThan(-1)
    expect(authDelete).toBeGreaterThan(-1)
    // Der Abbruch muss vor dem Loeschen des Auth-Users liegen, sonst
    // waeren die Dokumente dauerhaft verwaist.
    expect(abbruch).toBeLessThan(authDelete)
  })

  it('meldet den Fehlschlag im results-Array statt Erfolg zu behaupten', () => {
    expect(quelle).toMatch(/results\.push\(\{ userId, ok: false, error: `documents:/)
  })

  it('behauptet nicht mehr, die documents-Tabelle existiere nicht', () => {
    expect(quelle).not.toContain('existiert derzeit nicht in Produktion')
    expect(quelle).toContain('documents-Tabelle EXISTIERT in Produktion')
  })

  it('die documents-Tabelle ist tatsaechlich per Migration angelegt', () => {
    const migration = fs.readFileSync(
      path.join(WURZEL, 'supabase', 'migrations', '20260804200000_create_documents_table.sql'),
      'utf-8',
    )
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.documents')
    // Der Delete filtert auf user_id — die Spalte muss es geben.
    expect(migration).toMatch(/user_id\s+uuid/)
  })
})

describe('B-1 — ESLint lintet keine Build-Artefakte mehr', () => {
  const config = fs.readFileSync(path.join(WURZEL, 'eslint.config.mjs'), 'utf-8')
  const globalIgnores = config.slice(
    config.indexOf('globalIgnores(['),
    config.indexOf('])', config.indexOf('globalIgnores([')),
  )

  it.each([['.next-old/**'], ['.claude/worktrees/**']])('ignoriert %s', (pfad) => {
    expect(globalIgnores).toContain(`"${pfad}"`)
  })

  it('behaelt die bisherigen Ignores', () => {
    for (const pfad of ['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'archive/**', 'native/**']) {
      expect(globalIgnores).toContain(`"${pfad}"`)
    }
  })
})
