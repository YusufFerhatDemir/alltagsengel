#!/usr/bin/env node
/**
 * Verifiziert nebenwirkungsfrei, ob das PflegeCoach-Datenmodell (coach_*)
 * auf der Live-DB vorhanden ist — und ob der Apply-Weg via _run_sql
 * (service_role) überhaupt DDL-Rechte hat.
 *
 * Lese-Orakel: _run_sql gibt nichts zurück, daher RAISE EXCEPTION mit dem
 * Ergebniswert in der Message (Muster aus scripts/verify-security-p0.mjs).
 *
 * Aufruf: node scripts/verify-pflegecoach-migration.mjs
 */
import { readFileSync, existsSync } from 'node:fs'

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

async function orakel(label, sqlAusdruck) {
  const p = `DO $x$ BEGIN RAISE EXCEPTION 'ORAKEL=%', (${sqlAusdruck}); END $x$;`
  const res = await fetch(`${URL_BASIS}/rest/v1/rpc/_run_sql`, {
    method: 'POST',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p }),
  })
  const text = await res.text()
  const m = text.match(/ORAKEL=([^"\\]*)/)
  const wert = m ? m[1] : `HTTP ${res.status}: ${text.slice(0, 160)}`
  console.log(`${label}: ${wert}`)
  return wert
}

console.log('— PflegeCoach-Migrations-Verifikation (read-only) —')
await orakel('DB-Rolle von _run_sql', 'SELECT current_user::text')
await orakel('CREATE-Recht auf public', "SELECT has_schema_privilege(current_user,'public','CREATE')::text")
const tabellen = ['coach_users','coach_consents','coach_shares','coach_assessments','coach_goals','coach_activities','coach_activity_log','coach_measurements','coach_reports']
let vorhanden = 0
for (const t of tabellen) {
  const w = await orakel(`Tabelle ${t}`, `SELECT (to_regclass('public.${t}') IS NOT NULL)::text`)
  if (w === 'true') vorhanden++
}
if (vorhanden === tabellen.length) {
  await orakel('RLS aktiv auf allen coach_*', `SELECT (count(*) = ${tabellen.length})::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname LIKE 'coach\\_%' AND c.relrowsecurity`)
  await orakel('anon-Grants auf coach_* (soll 0)', `SELECT count(*)::text FROM information_schema.role_table_grants WHERE grantee='anon' AND table_schema='public' AND table_name LIKE 'coach\\_%'`)
  await orakel('Policies auf coach_* (soll >= 18)', `SELECT count(*)::text FROM pg_policies WHERE schemaname='public' AND tablename LIKE 'coach\\_%'`)
}
console.log(`Ergebnis: ${vorhanden}/${tabellen.length} coach_-Tabellen vorhanden`)
process.exit(vorhanden === tabellen.length ? 0 : 2)
