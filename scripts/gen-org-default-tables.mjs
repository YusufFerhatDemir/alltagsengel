#!/usr/bin/env node
/**
 * Erzeugt scripts/org-default-tables.json aus der LIVE-Datenbank.
 *
 * Die Liste ist die Tatsachengrundlage von scripts/lint-org-id-inserts.ts.
 * Sie wird bewusst eingecheckt und NICHT bei jedem CI-Lauf frisch gelesen:
 * die Lint-Regel muss auch ohne Datenbank-Zugang laufen (CI hat nur
 * Platzhalter-ENVs). Nach jeder Migration, die eine neue Tabelle mit
 * organization_id DEFAULT current_org_id() anlegt, hier neu erzeugen.
 *
 * Aufruf:  node scripts/gen-org-default-tables.mjs
 */
import { writeFileSync } from 'node:fs'
import { apiHeaders, secretKey, envWert } from './lib/supabase-keys.mjs'

const URL_ = envWert('NEXT_PUBLIC_SUPABASE_URL')
const KEY = secretKey()
if (!URL_ || !KEY) {
  console.error('Fehlt: NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const H = apiHeaders(KEY, { 'Content-Type': 'application/json' })

async function orakel(sql) {
  const wrapped =
    `DO $ORK$ DECLARE r text; BEGIN `
    + `SELECT coalesce(string_agg(z::text, chr(10)), '(leer)') INTO r FROM (${sql}) t(z); `
    + `RAISE EXCEPTION 'ORAKEL:%', r; END $ORK$;`
  const res = await fetch(`${URL_}/rest/v1/rpc/_run_sql`, {
    method: 'POST', headers: H, body: JSON.stringify({ p: wrapped }),
  })
  const text = await res.text()
  let j = null
  try { j = JSON.parse(text) } catch { /* Fehlertexte sind nicht immer JSON */ }
  const msg = j?.message ?? text
  const i = msg.indexOf('ORAKEL:')
  if (i === -1) throw new Error(`Orakel unerwartet (HTTP ${res.status}): ${msg.slice(0, 300)}`)
  return msg.slice(i + 7).trim()
}

const roh = await orakel(`
  select c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_name = c.table_name and t.table_schema = c.table_schema
   where c.table_schema = 'public'
     and c.column_name = 'organization_id'
     and t.table_type = 'BASE TABLE'
     and c.column_default like '%current_org_id%'
   order by 1
`)
const tabellen = roh.split('\n').map((z) => z.trim()).filter(Boolean)

const heute = new Date().toISOString().slice(0, 10)
writeFileSync('scripts/org-default-tables.json', JSON.stringify({
  _hinweis: 'GENERIERT — nicht von Hand pflegen. Neu erzeugen mit: node scripts/gen-org-default-tables.mjs',
  _bedeutung: 'Tabellen, deren Spalte organization_id live den Default current_org_id() traegt. Ein Insert ohne organization_id faellt dort auf diesen Default zurueck; beim Dienstschluessel gibt es kein auth.uid(), die Fallback-Kette laeuft ins Leere und endet in der fest verdrahteten Stamm-Organisation.',
  _stand: heute,
  _quelle: 'information_schema.columns (live gelesen)',
  tabellen,
}, null, 2) + '\n')

console.log(`✅ scripts/org-default-tables.json — ${tabellen.length} Tabellen (Stand ${heute}).`)
