/**
 * P0: SECURITY-DEFINER-RPCs der Workflow-Engine und der Rechnungsnummern-
 * vergabe duerfen nicht fuer `anon`/`authenticated` ausfuehrbar sein.
 *
 * BEFUND (live gemessen am 09.08.2026 gegen nnwyktkqibdjxgimjyuq ueber
 * pg_proc/has_function_privilege — Katalogwahrheit, keine Vermutung):
 *
 *   has_function_privilege('anon', ..., 'EXECUTE') = true fuer
 *     wf_emit_event, wf_process_event, wf_execute_queue_item,
 *     wf_process_pending, wf_check_fristen, next_billing_number
 *
 * Alle sechs sind SECURITY DEFINER (laufen als postgres, umgehen JEDE RLS),
 * nehmen die Mandanten-ID als Parameter und pruefen im Body keine
 * Berechtigung. Ein unangemeldeter Aufrufer kann damit
 *   - den Rechnungsnummernkreis fremder Mandanten hochzaehlen
 *     (Luecken in der fortlaufenden Nummer, §14 Abs. 4 UStG / GoBD),
 *   - wf_events und wf_audit_log fremder Mandanten beschreiben,
 *   - die Warteschlange als postgres an der RLS vorbei abarbeiten lassen.
 *
 * Ursache: 20260813010000_workflow_engine.sql enthaelt kein GRANT; die Rechte
 * stammen aus den Default-Privileges von Supabase im Schema public.
 *
 * Diese Tests sind STATISCH: sie sichern, dass die Gegenmigration im Repo
 * liegt, den Entzug ausspricht, service_role nicht mitentzieht und dass keine
 * spaetere Migration den Entzug stillschweigend zurueckdreht.
 * Der Live-Nachweis nach dem Apply laeuft ueber scripts/verify-security-p0.mjs.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATIONEN = join(process.cwd(), 'supabase', 'migrations')
const FIX = '20260817030000_secdef_rpc_haertung.sql'
const ROLLBACK = '20260817030001_rollback_secdef_rpc_haertung.sql'
const APPLY_BLOCK = join(process.cwd(), 'SECURITY_P0_APPLY.sql')

const ZIELFUNKTIONEN = [
  'wf_emit_event',
  'wf_process_event',
  'wf_execute_queue_item',
  'wf_process_pending',
  'wf_check_fristen',
  'next_billing_number',
]

function lies(datei: string): string {
  return readFileSync(join(MIGRATIONEN, datei), 'utf8')
}

/**
 * Entfernt `--`-Kommentare. Ohne das wuerden die Zerstoerungsfrei-Tests auf
 * der Prosa anschlagen ("Kein DROP TABLE, kein DROP FUNCTION ...") statt auf
 * ausfuehrbarem SQL.
 */
function nurStatements(sql: string): string {
  return sql
    .split('\n')
    .map(z => z.replace(/--.*$/, ''))
    .join('\n')
}

describe('P0 — SECURITY-DEFINER-RPCs fuer anon geschlossen', () => {
  it('die Gegenmigration und ihr Rollback existieren', () => {
    const dateien = readdirSync(MIGRATIONEN)
    expect(dateien).toContain(FIX)
    expect(dateien).toContain(ROLLBACK)
  })

  it('nennt alle sechs betroffenen Funktionen', () => {
    const sql = lies(FIX)
    for (const fn of ZIELFUNKTIONEN) {
      expect(sql, `${fn} fehlt in der Migration`).toContain(`'${fn}'`)
    }
  })

  it('entzieht EXECUTE fuer PUBLIC, anon und authenticated', () => {
    const sql = lies(FIX)
    for (const rolle of ['PUBLIC', 'anon', 'authenticated']) {
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION %s FROM ${rolle}`))
    }
  })

  it('erteilt service_role ausdruecklich EXECUTE — sonst kappt der PUBLIC-Entzug die App', () => {
    // Alle Produktionsaufrufer laufen ueber createAdminClient() = service_role.
    // Haenge der Grant nur an PUBLIC, wuerde der REVOKE oben sie mit abschneiden.
    const sql = lies(FIX)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION %s TO service_role/)
  })

  it('loest die Signaturen ueber pg_proc auf, statt sie zu raten', () => {
    const sql = lies(FIX)
    expect(sql).toContain('pg_proc')
    expect(sql).toContain('regprocedure')
  })

  it('bricht ab, statt still nichts zu tun, wenn keine Zielfunktion existiert', () => {
    // Ein No-Op sieht aus wie Erfolg — das ist bei einer Sicherheitsmigration
    // die gefaehrlichere Fehlerart.
    const sql = lies(FIX)
    expect(sql).toMatch(/IF n = 0 THEN[\s\S]{0,200}RAISE EXCEPTION/)
  })

  it('loescht nichts: kein DROP FUNCTION, kein DROP TABLE, kein DELETE', () => {
    const sql = nurStatements(lies(FIX))
    expect(sql).not.toMatch(/DROP\s+FUNCTION/i)
    expect(sql).not.toMatch(/DROP\s+TABLE/i)
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i)
    expect(sql).not.toMatch(/\bTRUNCATE\b/i)
  })

  it('zieht search_path bei SECURITY-DEFINER-Funktionen nach', () => {
    const sql = lies(FIX)
    expect(sql).toMatch(/ALTER FUNCTION %s SET search_path TO public, pg_temp/)
  })

  it('der Rollback stellt die Grants wieder her und warnt davor', () => {
    const sql = readFileSync(join(MIGRATIONEN, ROLLBACK), 'utf8')
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION %s TO anon, authenticated/)
    expect(sql).toMatch(/SICHERHEITSLUECKE WIEDER HER/)
  })

  it('keine andere Migration erteilt anon oder authenticated EXECUTE auf den sechs Funktionen', () => {
    const treffer: string[] = []
    for (const datei of readdirSync(MIGRATIONEN)) {
      if (!datei.endsWith('.sql')) continue
      if (datei === ROLLBACK) continue // dokumentierter Notausstieg
      if (datei > FIX) {
        const sql = lies(datei)
        for (const fn of ZIELFUNKTIONEN) {
          // GRANT ... TO anon/authenticated = Zugriff erteilen (verboten)
          // REVOKE ... FROM anon/authenticated + GRANT ... TO service_role = korrekt
          const reGrantTo = new RegExp(`GRANT\\s+EXECUTE[^;]*${fn}[^;]*TO\\s+[^;]*(anon|authenticated)`, 'i')
          if (reGrantTo.test(sql)) treffer.push(`${datei} -> ${fn}`)
        }
      }
    }
    expect(treffer, `spaetere Migration dreht den Entzug zurueck: ${treffer.join(', ')}`).toEqual([])
  })
})

describe('Kombinierter Apply-Block SECURITY_P0_APPLY.sql', () => {
  it('existiert', () => {
    expect(existsSync(APPLY_BLOCK)).toBe(true)
  })

  it('haelt die geforderte Reihenfolge ein: Security -> profiles-RLS -> Audit-Probe', () => {
    const sql = readFileSync(APPLY_BLOCK, 'utf8')
    const t1 = sql.indexOf('TEIL 1 — SQL-Ausfuehrungs-RPC')
    const t2 = sql.indexOf('TEIL 2 — SECURITY-DEFINER-RPCs')
    const t3 = sql.indexOf('TEIL 3 — profiles-RLS')
    const t4 = sql.indexOf('TEIL 4 — Audit-Probe-Zeile')
    expect(t1).toBeGreaterThan(-1)
    expect(t2).toBeGreaterThan(t1)
    expect(t3).toBeGreaterThan(t2)
    expect(t4).toBeGreaterThan(t3)
  })

  it('laeuft in genau einer Transaktion', () => {
    const sql = readFileSync(APPLY_BLOCK, 'utf8')
    expect(sql.match(/^BEGIN;$/gm)?.length).toBe(1)
    expect(sql.match(/^COMMIT;$/gm)?.length).toBe(1)
  })

  it('prueft Vorbedingungen, bevor die erste Aenderung passiert', () => {
    const sql = readFileSync(APPLY_BLOCK, 'utf8')
    const teil0 = sql.indexOf('TEIL 0 — VORBEDINGUNGEN')
    const ersteAenderung = sql.indexOf('REVOKE')
    expect(teil0).toBeGreaterThan(-1)
    expect(teil0).toBeLessThan(ersteAenderung)
    expect(sql).toMatch(/RAISE EXCEPTION E'ABBRUCH/)
  })

  it('zerstoert keine Daten und keine Objekte', () => {
    const sql = nurStatements(readFileSync(APPLY_BLOCK, 'utf8'))
    expect(sql).not.toMatch(/DROP\s+TABLE/i)
    expect(sql).not.toMatch(/DROP\s+FUNCTION/i)
    expect(sql).not.toMatch(/DROP\s+TRIGGER/i)
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i)
    expect(sql).not.toMatch(/\bTRUNCATE\b/i)
    // DROP POLICY ist erlaubt und der eigentliche Zweck von TEIL 3.
    expect(sql).toMatch(/DROP POLICY IF EXISTS/)
  })

  it('laesst den Immutabilitaetsschutz von billing_audit_trail unangetastet', () => {
    const sql = nurStatements(readFileSync(APPLY_BLOCK, 'utf8'))
    expect(sql).not.toMatch(/ALTER TABLE public\.billing_audit_trail\s+DISABLE/i)
    expect(sql).not.toMatch(/trg_audit_trail_no_(update|delete)[\s\S]{0,40}DROP/i)
    // TEIL 4 darf ausschliesslich kommentieren.
    expect(sql).toMatch(/COMMENT ON TABLE public\.billing_audit_trail IS/)
  })

  it('behaelt _run_sql fuer service_role — sonst bricht der Apply-Weg', () => {
    const sql = readFileSync(APPLY_BLOCK, 'utf8')
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION %s TO service_role/)
  })

  it('dropt die drei profiles-Alt-Policies namentlich', () => {
    const sql = readFileSync(APPLY_BLOCK, 'utf8')
    for (const p of [
      'Admin profilleri yönetebilir',
      'Herkes profilleri okuyabilir',
      'Anyone can view public profiles',
    ]) {
      expect(sql).toContain(`DROP POLICY IF EXISTS "${p}"`)
    }
  })

  it('dropt auch die transitive Rekursionsquelle auf bookings', () => {
    const sql = readFileSync(APPLY_BLOCK, 'utf8')
    expect(sql).toContain('DROP POLICY IF EXISTS "Admin bookingleri yönetebilir" ON public.bookings')
  })

  it('prueft bookings_admin als Vorbedingung, bevor die Alt-Policy faellt', () => {
    const sql = readFileSync(APPLY_BLOCK, 'utf8')
    const vorbedingung = sql.indexOf("policyname = 'bookings_admin'")
    const drop = sql.indexOf('DROP POLICY IF EXISTS "Admin bookingleri yönetebilir"')
    expect(vorbedingung).toBeGreaterThan(-1)
    expect(vorbedingung).toBeLessThan(drop)
  })
})

describe('42P17 — transitive Rekursion ueber bookings', () => {
  const FIX_B = '20260817040000_bookings_policy_rekursion.sql'
  const ROLLBACK_B = '20260817040001_rollback_bookings_policy_rekursion.sql'

  it('Migration und Rollback existieren', () => {
    const dateien = readdirSync(MIGRATIONEN)
    expect(dateien).toContain(FIX_B)
    expect(dateien).toContain(ROLLBACK_B)
  })

  it('entfernt genau die rekursive Alt-Policy und sonst nichts', () => {
    const sql = nurStatements(lies(FIX_B))
    expect(sql).toContain('DROP POLICY IF EXISTS "Admin bookingleri yönetebilir" ON public.bookings')
    expect(sql.match(/DROP POLICY/g)?.length).toBe(1)
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i)
    expect(sql).not.toMatch(/DROP\s+(TABLE|FUNCTION|TRIGGER)/i)
  })

  it('bricht ab, wenn der Ersatz bookings_admin fehlt', () => {
    const sql = lies(FIX_B)
    expect(sql).toMatch(/policyname = 'bookings_admin'[\s\S]{0,300}RAISE EXCEPTION/)
  })

  it('der Rollback warnt vor der wiederhergestellten Totalblockade', () => {
    const sql = readFileSync(join(MIGRATIONEN, ROLLBACK_B), 'utf8')
    expect(sql).toMatch(/42P17-TOTALBLOCKADE.*WIEDER HER/s)
    expect(sql).toContain('CREATE POLICY "Admin bookingleri yönetebilir"')
  })

  it('keine spaetere Migration legt die rekursive Policy wieder an', () => {
    const treffer: string[] = []
    for (const datei of readdirSync(MIGRATIONEN)) {
      if (!datei.endsWith('.sql') || datei <= FIX_B || datei === ROLLBACK_B) continue
      if (/CREATE POLICY "Admin bookingleri yönetebilir"/.test(lies(datei))) treffer.push(datei)
    }
    expect(treffer, `legt die Rekursion neu an: ${treffer.join(', ')}`).toEqual([])
  })
})
