#!/usr/bin/env node
/**
 * Prueft, ob die SQL-Ausfuehrungs-RPC public._run_sql und die Hilfstabelle
 * public._sql_parts fuer die oeffentlichen Rollen geschlossen sind.
 *
 * Hintergrund und Fix: supabase/migrations/20260817010000_sql_exec_rpc_absichern.sql
 *
 * Es wird ausschliesslich mit dem OEFFENTLICHEN anon-Key geprueft — also mit
 * genau dem Schluessel, der in jedem Browser-Bundle steht. Kein Schreibzugriff:
 * die Probe-Statements sind `SELECT 1` und ein absichtlicher Syntaxfehler.
 *
 * Exit 0 = geschlossen, Exit 1 = offen.
 */
import { readFileSync, existsSync } from 'node:fs'
import { apiHeaders, publishableKey, secretKey } from './lib/supabase-keys.mjs'

for (const datei of ['.env.local', '.env']) {
  if (!existsSync(datei)) continue
  for (const zeile of readFileSync(datei, 'utf8').split('\n')) {
    const m = zeile.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const BASIS = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = publishableKey()
if (!BASIS || !ANON) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY fehlen')
  process.exit(1)
}

const ergebnisse = []
function pruefe(id, bestanden, meldung) {
  ergebnisse.push({ id, bestanden })
  console.log(`${bestanden ? '  OK  ' : ' OFFEN'} ${id.padEnd(26)} ${meldung}`)
}

async function rpc(sql) {
  const res = await fetch(`${BASIS}/rest/v1/rpc/_run_sql`, {
    method: 'POST',
    headers: apiHeaders(ANON, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ p: sql }),
  })
  return { status: res.status, text: (await res.text()).slice(0, 200) }
}

console.log(`\nSQL-Ausfuehrungs-RPC gegen ${BASIS.replace(/^https:\/\//, '')} (anon-Key)\n`)

// A) Gueltiges SQL — darf NICHT 2xx liefern.
const gueltig = await rpc('SELECT 1')
pruefe(
  'A_anon_kein_exec',
  gueltig.status >= 400,
  gueltig.status < 400
    ? `LECK: anon fuehrt SQL aus (HTTP ${gueltig.status})`
    : `anon abgewiesen (HTTP ${gueltig.status})`,
)

// B) Ungueltiges SQL — ein Syntaxfehler beweist, dass der Parser erreicht wird.
const kaputt = await rpc('SELEKT kaputt')
const parserErreicht = kaputt.text.includes('42601')
pruefe(
  'B_parser_unerreichbar',
  !parserErreicht,
  parserErreicht
    ? 'LECK: anon erreicht den SQL-Parser (42601 Syntaxfehler kommt zurueck)'
    : `kein Parser-Kontakt (HTTP ${kaputt.status})`,
)

// C) Hilfstabelle _sql_parts darf fuer anon nicht lesbar sein.
const tab = await fetch(`${BASIS}/rest/v1/_sql_parts?select=*&limit=1`, {
  headers: apiHeaders(ANON),
})
pruefe(
  'C_sql_parts_zu',
  tab.status >= 400,
  tab.status < 400 ? `LECK: anon liest _sql_parts (HTTP ${tab.status})` : `anon abgewiesen (HTTP ${tab.status})`,
)

const offen = ergebnisse.filter(e => !e.bestanden)
console.log(`\n${ergebnisse.length - offen.length}/${ergebnisse.length} bestanden\n`)
if (offen.length > 0) {
  console.log('Apply-Weg: supabase/migrations/20260817010000_sql_exec_rpc_absichern.sql')
  console.log('im Supabase-SQL-Editor ausfuehren, danach dieses Skript erneut starten.\n')
  process.exit(1)
}
process.exit(0)
