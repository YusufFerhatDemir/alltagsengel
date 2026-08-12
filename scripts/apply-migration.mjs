#!/usr/bin/env node
/**
 * Wendet GENAU EINE Datei aus supabase/migrations/ auf die Live-DB an.
 *
 * Kein freies SQL: der Pfad muss unterhalb von supabase/migrations/ liegen und
 * auf .sql enden. Der Inhalt wird unveraendert uebergeben.
 *
 * ABHAENGIGKEIT: nutzt die DB-Funktion public._run_sql(p text). Die ist ein
 * Werkzeug-Rest, der NICHT aus diesem Repo stammt und der bis zum Apply von
 * 20260817010000_sql_exec_rpc_absichern.sql auch fuer die Rolle `anon` offen
 * steht (Details dort). Nach diesem Apply bleibt sie nur fuer service_role
 * erreichbar — also genau fuer dieses Skript. Wird sie spaeter ganz entfernt,
 * ist der Apply-Weg der Supabase-SQL-Editor.
 *
 * Aufruf: node scripts/apply-migration.mjs 20260815010000_beispiel.sql
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve, basename } from 'node:path'

for (const datei of ['.env.local', '.env']) {
  if (!existsSync(datei)) continue
  for (const zeile of readFileSync(datei, 'utf8').split('\n')) {
    const m = zeile.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const URL_BASIS = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_BASIS || !SERVICE) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen')
  process.exit(1)
}

const name = basename(process.argv[2] || '')
if (!name.endsWith('.sql')) {
  console.error('Nutzung: node scripts/apply-migration.mjs <datei>.sql')
  process.exit(1)
}
const pfad = resolve('supabase/migrations', name)
if (!existsSync(pfad)) {
  console.error(`Migration nicht gefunden: ${pfad}`)
  process.exit(1)
}

const inhalt = readFileSync(pfad, 'utf8')
console.log(`Wende an: ${name} (${inhalt.length} Zeichen)`)

const res = await fetch(`${URL_BASIS}/rest/v1/rpc/_run_sql`, {
  method: 'POST',
  headers: {
    apikey: SERVICE,
    Authorization: `Bearer ${SERVICE}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ p: inhalt }),
})
console.log('HTTP', res.status)
console.log((await res.text()).slice(0, 2000))
process.exit(res.ok ? 0 : 1)
