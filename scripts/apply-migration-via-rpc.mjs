#!/usr/bin/env node
/**
 * Spielt eine Migrationsdatei über public._run_sql mit dem Service-Role-Key
 * ein. Ersatzweg, solange in der Session kein Supabase-MCP und kein
 * DATABASE_URL verfügbar ist.
 *
 * Aufruf:
 *   node scripts/apply-migration-via-rpc.mjs supabase/migrations/<datei>.sql [--doit]
 *
 * Ohne --doit wird nur angezeigt, was ausgeführt würde (Trockenlauf).
 * Die Datei wird als EIN Statement geschickt — BEGIN/COMMIT in der Datei
 * bleiben damit wirksam, und ein Fehler rollt alles zurück.
 */
import { readFileSync } from 'node:fs'
import { apiHeaders, secretKey, envWert } from './lib/supabase-keys.mjs'

const BASIS = envWert('NEXT_PUBLIC_SUPABASE_URL')
const KEY = secretKey()
const datei = process.argv[2]
const scharf = process.argv.includes('--doit')

if (!datei) {
  console.error('Aufruf: node scripts/apply-migration-via-rpc.mjs <datei.sql> [--doit]')
  process.exit(1)
}

const roh = readFileSync(datei, 'utf8')

/**
 * BEGIN/COMMIT entfernen.
 *
 * _run_sql fuehrt das Statement per EXECUTE aus; PostgreSQL lehnt
 * Transaktionsbefehle darin mit 0A000 ab ("EXECUTE of transaction commands
 * is not implemented"). Das ist kein Verlust an Atomizitaet: der RPC-Aufruf
 * laeuft ohnehin komplett in EINER Transaktion, ein Fehler rollt alles
 * zurueck. Nur Zeilen, die ausschliesslich aus BEGIN;/COMMIT; bestehen,
 * werden entfernt — kein Eingriff in die eigentlichen Anweisungen.
 */
const sqlText = roh
  .split('\n')
  .filter(z => !/^\s*(BEGIN|COMMIT)\s*;\s*$/i.test(z))
  .join('\n')

console.log(`\nMigration : ${datei}`)
console.log(`Ziel      : ${BASIS.replace(/^https:\/\//, '')}`)
console.log(`Groesse   : ${sqlText.length} Zeichen`)
console.log(`Modus     : ${scharf ? 'SCHARF (wird eingespielt)' : 'Trockenlauf'}\n`)

if (!scharf) {
  console.log('Trockenlauf — nichts ausgefuehrt. Mit --doit wiederholen.')
  process.exit(0)
}

const res = await fetch(`${BASIS}/rest/v1/rpc/_run_sql`, {
  method: 'POST',
  headers: apiHeaders(KEY, { 'Content-Type': 'application/json' }),
  body: JSON.stringify({ p: sqlText }),
})
const txt = await res.text()
console.log(`HTTP ${res.status}`)
console.log(txt.slice(0, 2000) || '(leerer Koerper)')

if (res.status >= 200 && res.status < 300) {
  console.log(`
┌─ ACHTUNG ────────────────────────────────────────────────────────────────┐
│ HTTP 2xx heisst NICHT, dass die Migration gewirkt hat.                    │
│                                                                          │
│ Dieser Weg laeuft als service_role. Fuer REVOKE/GRANT zaehlt aber, wer    │
│ das Recht URSPRUENGLICH vergeben hat: steht in der ACL "/postgres",      │
│ ist postgres der Grantor. Ein REVOKE durch eine andere Rolle ist dann     │
│ ein stiller No-Op — PostgreSQL gibt eine WARNING aus, keinen Fehler, und  │
│ die RPC antwortet trotzdem mit 204.                                       │
│ Dasselbe gilt fuer DROP/CREATE POLICY: das braucht Eigentuemerrechte und  │
│ scheitert hier mit 42501 "must be owner of relation …".                   │
│                                                                          │
│ Deshalb IMMER nachmessen:                                                 │
│   node scripts/verify-security-delta-phase4.mjs                           │
│   node scripts/verify-security-delta-phase4-grantcheck.mjs                │
│ Bleibt der Befund stehen, muss die Datei im Supabase-SQL-Editor laufen    │
│ (dort als postgres).                                                      │
└──────────────────────────────────────────────────────────────────────────┘`)
}
process.exit(res.status >= 200 && res.status < 300 ? 0 : 1)
