/**
 * P0-Regression: BEFORE-INSERT-Guard auf public.profiles darf niemals auf
 * OLD.* zugreifen (OLD ist bei INSERT nicht zugewiesen → jede Registrierung
 * scheitert mit "Database error saving new user").
 *
 * Vorfall 2026-08-11: prevent_role_escalation() (für UPDATE geschrieben,
 * referenziert OLD.role) hing zusätzlich als BEFORE-INSERT-Trigger an
 * profiles (20260804140000_missing_production_triggers.sql) und blockierte
 * JEDE Neuregistrierung (kunde/engel/fahrer) production-weit. Live gegen
 * nnwyktkqibdjxgimjyuq reproduziert. Fix bereits vorbereitet in
 * 20260808170000_role_guard_insert_fix.sql (prevent_privileged_role_insert,
 * kein OLD-Zugriff, blockiert nur admin/superadmin) — Live-Apply war zum
 * Vorfallzeitpunkt trotz gegenteiliger Angabe in
 * audit/MIGRATION_INVENTAR_2026-08-10.md NICHT wirksam.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATIONEN = join(process.cwd(), 'supabase', 'migrations')

function lesen(datei: string): string {
  return readFileSync(join(MIGRATIONEN, datei), 'utf8')
}

function ohneKommentare(sql: string): string {
  return sql.split('\n').map(z => z.replace(/--.*$/, '')).join('\n')
}

describe('profiles BEFORE-INSERT-Trigger: kein OLD-Zugriff', () => {
  it('20260808170000_role_guard_insert_fix.sql existiert', () => {
    expect(existsSync(join(MIGRATIONEN, '20260808170000_role_guard_insert_fix.sql'))).toBe(true)
  })

  it('prevent_privileged_role_insert() referenziert OLD nicht', () => {
    const sql = ohneKommentare(lesen('20260808170000_role_guard_insert_fix.sql'))
    const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.prevent_privileged_role_insert')
    expect(start).toBeGreaterThan(-1)
    const body = sql.slice(start, sql.indexOf('$$;', start + 40) + 3)
    expect(body).not.toMatch(/\bOLD\./)
  })

  it('prevent_privileged_role_insert() blockiert nur admin/superadmin', () => {
    const sql = lesen('20260808170000_role_guard_insert_fix.sql')
    expect(sql).toMatch(/NEW\.role\s*<>\s*ALL\s*\(ARRAY\['admin',\s*'superadmin'\]\)/)
  })

  it('trg_prevent_privileged_role_insert wird als BEFORE INSERT an profiles gehängt', () => {
    const sql = lesen('20260808170000_role_guard_insert_fix.sql')
    expect(sql).toMatch(/CREATE TRIGGER trg_prevent_privileged_role_insert\s+BEFORE INSERT ON public\.profiles/)
  })

  it('der alte fehlerhafte INSERT-Trigger wird explizit gedroppt', () => {
    const sql = lesen('20260808170000_role_guard_insert_fix.sql')
    expect(sql).toMatch(/DROP TRIGGER IF EXISTS trg_prevent_role_escalation_insert ON public\.profiles/)
  })

  it('die zuletzt angewendete Migration bindet trg_prevent_role_escalation_insert an die korrekte Funktion', () => {
    // Migrationen laufen sequenziell — nur relevant ist, an welche Funktion
    // der Trigger nach der LETZTEN (chronologisch sortierten) Migration
    // gebunden ist, die ihn erzeugt/ersetzt. 20260804140000 fuehrt den Bug
    // ein, 20260808170000 ersetzt ihn korrekt — die Reihenfolge der
    // Dateinamen (Zeitstempel-Praefix) muss das widerspiegeln.
    const dateien = readdirSync(MIGRATIONEN)
      .filter(f => f.endsWith('.sql') && !f.includes('rollback'))
      .sort()

    const buggyTreffer = /(?:DROP TRIGGER IF EXISTS trg_prevent_role_escalation_insert ON public\.profiles;\s*)?CREATE TRIGGER trg_prevent_role_escalation_insert\s+BEFORE INSERT ON public\.profiles[\s\S]{0,200}?EXECUTE (?:PROCEDURE|FUNCTION) public\.prevent_role_escalation\(\)/
    const fixTreffer = /DROP TRIGGER IF EXISTS trg_prevent_role_escalation_insert ON public\.profiles/

    let letzterZustand: 'keiner' | 'fehlerhaft' | 'gefixt' = 'keiner'
    for (const datei of dateien) {
      const sql = ohneKommentare(lesen(datei))
      if (buggyTreffer.test(sql)) letzterZustand = 'fehlerhaft'
      else if (fixTreffer.test(sql)) letzterZustand = 'gefixt'
    }

    expect(letzterZustand, 'trg_prevent_role_escalation_insert wurde nie erzeugt — unerwartet').not.toBe('keiner')
    expect(letzterZustand, 'letzte Migration laesst trg_prevent_role_escalation_insert auf dem fehlerhaften Stand (OLD.role bei INSERT)').toBe('gefixt')
  })
})
