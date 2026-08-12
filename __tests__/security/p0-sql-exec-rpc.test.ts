/**
 * P0: die SQL-Ausfuehrungs-RPC `public._run_sql` darf nicht fuer die
 * oeffentlichen Rollen ausfuehrbar sein.
 *
 * BEFUND (live gemessen am 09.08.2026 gegen nnwyktkqibdjxgimjyuq, nur mit dem
 * oeffentlichen anon-Key, der in jedem Browser-Bundle steht):
 *
 *   POST /rest/v1/rpc/_run_sql {"p":"SELECT 1"}      -> 204
 *   POST /rest/v1/rpc/_run_sql {"p":"SELEKT kaputt"} -> 400 42601 syntax error
 *   GET  /rest/v1/_sql_parts?select=*                -> 200
 *
 * Die Funktion laeuft als INVOKER (SELECT auf auth.users gibt 42501), es ist
 * also keine Superuser-Uebernahme — aber ein anonymer Aufrufer bekommt die
 * vollen Rechte der Rolle `anon` ohne den Umweg ueber PostgREST.
 *
 * Diese Tests sind STATISCH: sie pruefen, dass die Gegenmigration im Repo
 * liegt und den Entzug tatsaechlich ausspricht, und dass keine spaetere
 * Migration ihn stillschweigend zurueckdreht. Der Live-Nachweis nach dem Apply
 * laeuft ueber scripts/verify-sql-exec-abgesichert.mjs.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATIONEN = join(process.cwd(), 'supabase', 'migrations')
const FIX = '20260817010000_sql_exec_rpc_absichern.sql'
const ROLLBACK = '20260817010001_rollback_sql_exec_rpc_absichern.sql'

function lies(datei: string): string {
  return readFileSync(join(MIGRATIONEN, datei), 'utf8')
}

describe('P0 — public._run_sql fuer anon geschlossen', () => {
  it('die Gegenmigration existiert', () => {
    expect(readdirSync(MIGRATIONEN)).toContain(FIX)
  })

  it('entzieht EXECUTE fuer PUBLIC, anon und authenticated', () => {
    const sql = lies(FIX)
    for (const rolle of ['PUBLIC', 'anon', 'authenticated']) {
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION %s FROM ${rolle}`))
    }
  })

  it('loest die Signatur ueber pg_proc auf, statt sie zu raten', () => {
    const sql = lies(FIX)
    expect(sql).toContain('pg_proc')
    expect(sql).toContain("proname = '_run_sql'")
    expect(sql).toContain('regprocedure')
  })

  it('schliesst auch die Hilfstabelle _sql_parts (RLS an, Grants weg)', () => {
    const sql = lies(FIX)
    expect(sql).toContain('ALTER TABLE public._sql_parts ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain('REVOKE ALL ON TABLE public._sql_parts FROM anon')
    expect(sql).toContain('REVOKE ALL ON TABLE public._sql_parts FROM authenticated')
  })

  it('loescht nichts — kein DROP FUNCTION, kein DROP TABLE', () => {
    const sql = lies(FIX)
    expect(sql).not.toMatch(/DROP\s+FUNCTION/i)
    expect(sql).not.toMatch(/DROP\s+TABLE/i)
  })

  it('der Rollback ist als Wiederherstellung einer Luecke gekennzeichnet', () => {
    const sql = lies(ROLLBACK)
    expect(sql).toMatch(/SICHERHEITSLUECKE WIEDER HER/i)
  })

  it('keine andere Migration erteilt anon oder authenticated EXECUTE auf _run_sql', () => {
    const treffer: string[] = []
    for (const datei of readdirSync(MIGRATIONEN)) {
      if (!datei.endsWith('.sql') || datei === ROLLBACK) continue
      const sql = readFileSync(join(MIGRATIONEN, datei), 'utf8')
      if (/GRANT[\s\S]{0,120}_run_sql/i.test(sql) || /_run_sql[\s\S]{0,120}TO\s+(anon|authenticated)/i.test(sql)) {
        treffer.push(datei)
      }
    }
    expect(treffer).toEqual([])
  })

  it('kein Anwendungscode ruft _run_sql oder _sql_parts auf', () => {
    // Der einzige erlaubte Aufrufer ist das Admin-Skript scripts/apply-migration.mjs,
    // das ausschliesslich mit dem service-role-Key laeuft.
    const verzeichnisse = ['app', 'lib', 'components']
    const treffer: string[] = []

    function durchsuche(pfad: string) {
      for (const eintrag of readdirSync(pfad, { withFileTypes: true })) {
        const voll = join(pfad, eintrag.name)
        if (eintrag.isDirectory()) {
          if (eintrag.name === 'node_modules' || eintrag.name.startsWith('.')) continue
          durchsuche(voll)
        } else if (/\.(ts|tsx|js|jsx|mjs)$/.test(eintrag.name)) {
          const inhalt = readFileSync(voll, 'utf8')
          if (inhalt.includes('_run_sql') || inhalt.includes('_sql_parts')) treffer.push(voll)
        }
      }
    }

    for (const v of verzeichnisse) {
      try {
        durchsuche(join(process.cwd(), v))
      } catch {
        // Verzeichnis existiert nicht — nichts zu pruefen.
      }
    }

    expect(treffer).toEqual([])
  })
})

describe('billing_audit_trail — Probe-Zeile dokumentiert, Schutz unangetastet', () => {
  const DOK = '20260817020000_audit_probe_zeile_dokumentieren.sql'

  it('die Dokumentations-Migration existiert', () => {
    expect(readdirSync(MIGRATIONEN)).toContain(DOK)
  })

  it('benennt die Probe-Zeile eindeutig', () => {
    const sql = lies(DOK)
    expect(sql).toContain('e9c8908f-8d54-4d15-9aba-22096eef5efb')
    expect(sql).toContain('__probe__')
  })

  it('fasst weder Daten noch Trigger noch Policies an', () => {
    // Nur die ausfuehrbaren Zeilen bewerten — die Kommentarkoepfe erwaehnen
    // DELETE/UPDATE zwangslaeufig, weil sie den Immutabilitaetsschutz erklaeren.
    const anweisungen = lies(DOK)
      .split('\n')
      .filter(z => !z.trimStart().startsWith('--'))
      .join('\n')

    expect(anweisungen).toMatch(/COMMENT ON TABLE public\.billing_audit_trail/i)
    expect(anweisungen).not.toMatch(/\bDELETE\s+FROM\b/i)
    expect(anweisungen).not.toMatch(/\bUPDATE\s+public\./i)
    expect(anweisungen).not.toMatch(/DROP\s+TRIGGER/i)
    expect(anweisungen).not.toMatch(/DISABLE\s+TRIGGER/i)
    expect(anweisungen).not.toMatch(/DROP\s+POLICY/i)
  })
})
