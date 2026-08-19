/**
 * P1: 17 SECURITY-DEFINER-Trigger-Funktionen muessen EXECUTE fuer
 * anon/authenticated entzogen haben. 2 Non-Trigger-SECDEF (is_internal_staff,
 * state_flag) muessen PUBLIC-Grant entzogen haben, aber anon/authenticated
 * behalten (RLS-Abhaengigkeit).
 *
 * Statische Tests: pruefen, dass die Migration im Repo liegt und die
 * richtigen REVOKE/GRANT-Statements enthaelt.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATIONEN = join(process.cwd(), 'supabase', 'migrations')
const FIX = '20260823010000_secdef_trigger_revoke.sql'
const ROLLBACK = '20260823010001_rollback_secdef_trigger_revoke.sql'

const TRIGGER_FUNKTIONEN = [
  'audit_invoice_status_change',
  'prevent_messages_field_tampering',
  'prevent_notifications_field_tampering',
  'prevent_privileged_role_insert',
  'audit_service_record_change',
  'enforce_tariff_obergrenze',
  'enforce_kassentarif_freigeschaltet',
  'enforce_kassenrechnung_freigeschaltet',
  'enforce_booking_zahlungsart',
  'enforce_state_settings_kanal',
  'audit_state_settings_immer',
  'log_arbeitszeit_korrektur',
  'check_aufgabe_eskalation',
  'create_recurring_aufgabe',
  'compute_signature_hash',
  'prevent_locked_record_change',
  'seed_state_settings_for_org',
]

const NON_TRIGGER_SECDEF = ['is_internal_staff', 'state_flag']

function lies(datei: string): string {
  return readFileSync(join(MIGRATIONEN, datei), 'utf8')
}

describe('SECDEF-Trigger-REVOKE — Migration vorhanden', () => {
  it('Migration existiert', () => {
    expect(existsSync(join(MIGRATIONEN, FIX))).toBe(true)
  })

  it('Rollback existiert', () => {
    expect(existsSync(join(MIGRATIONEN, ROLLBACK))).toBe(true)
  })
})

describe('SECDEF-Trigger-REVOKE — Trigger-Funktionen im Fix aufgelistet', () => {
  const sql = lies(FIX)

  for (const fn of TRIGGER_FUNKTIONEN) {
    it(`${fn} ist in der Migration enthalten`, () => {
      expect(sql).toContain(fn)
    })
  }
})

describe('SECDEF-Trigger-REVOKE — REVOKE-Pattern vorhanden', () => {
  const sql = lies(FIX)

  it('enthaelt REVOKE ALL FROM PUBLIC', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION.*FROM PUBLIC/i)
  })

  it('enthaelt REVOKE ALL FROM anon', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION.*FROM anon/i)
  })

  it('enthaelt REVOKE ALL FROM authenticated', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION.*FROM authenticated/i)
  })

  it('enthaelt GRANT EXECUTE TO service_role', () => {
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION.*TO service_role/i)
  })
})

describe('SECDEF-Trigger-REVOKE — Non-Trigger-Funktionen korrekt behandelt', () => {
  const sql = lies(FIX)

  for (const fn of NON_TRIGGER_SECDEF) {
    it(`${fn} ist in der Migration enthalten`, () => {
      expect(sql).toContain(fn)
    })
  }

  it('is_internal_staff behaelt anon-Grant (RLS-Abhaengigkeit)', () => {
    expect(sql).toMatch(/is_internal_staff.*anon.*Grant.*beibehalten|GRANT.*is_internal_staff.*TO anon/is)
  })

  it('state_flag behaelt anon-Grant (Warteliste-RLS)', () => {
    expect(sql).toMatch(/state_flag.*anon.*beibehalten|GRANT.*state_flag.*TO anon/is)
  })
})

describe('SECDEF-Trigger-REVOKE — search_path-Haertung', () => {
  const sql = lies(FIX)

  it('setzt search_path fuer SECDEF-Funktionen ohne search_path', () => {
    expect(sql).toMatch(/ALTER FUNCTION.*SET search_path/i)
  })
})

describe('SECDEF-Trigger-REVOKE — kein spaeterer Re-Grant', () => {
  const alleFiles = readdirSync(MIGRATIONEN)
    .filter((f: string) => f.endsWith('.sql') && !f.includes('rollback') && f > FIX)

  for (const fn of TRIGGER_FUNKTIONEN) {
    it(`keine spaetere Migration gibt ${fn} an anon zurueck`, () => {
      for (const file of alleFiles) {
        const content = readFileSync(join(MIGRATIONEN, file), 'utf8')
        const active = content.split('\n').filter(l => !l.trim().startsWith('--')).join('\n')
        if (active.includes(fn) && /GRANT.*EXECUTE/i.test(active) && /TO.*anon/i.test(active)) {
          expect.fail(`${file} gibt ${fn} an anon zurueck`)
        }
      }
    })
  }
})
