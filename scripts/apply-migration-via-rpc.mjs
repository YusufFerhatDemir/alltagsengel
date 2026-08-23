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

const sqlText = readFileSync(datei, 'utf8')
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
process.exit(res.status >= 200 && res.status < 300 ? 0 : 1)
