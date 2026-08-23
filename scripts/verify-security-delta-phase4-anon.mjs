#!/usr/bin/env node
/**
 * Anon-Expositionsmessung — Phase-4-Delta.
 *
 * Ausgangslage aus detail2: anon hat auf 225 Tabellen effektiv SELECT/INSERT/
 * UPDATE/DELETE (Supabase-Standardvergabe an PUBLIC). Damit ist RLS die
 * EINZIGE Grenze. Dieses Skript misst deshalb, was von dieser Grenze
 * tatsaechlich durchlaessig ist:
 *
 *   A) Welche Policies gelten ueberhaupt fuer anon (Rolle anon oder public)?
 *      Nur diese koennen einer unangemeldeten Anfrage etwas erlauben.
 *   B) Empirische Gegenprobe mit dem OEFFENTLICHEN anon-Key gegen sensible
 *      Tabellen — lesend. Nach der Methodik: 401/403 = dicht,
 *      200 [] = mehrdeutig, 200 mit Zeilen = Leck.
 *
 * Es wird NICHT geschrieben. Schreibrechte werden ausschliesslich ueber die
 * Policy-Introspektion beurteilt, nicht durch Probe-Schreibzugriffe auf
 * Produktionsdaten.
 */
import { apiHeaders, secretKey, publishableKey, envWert } from './lib/supabase-keys.mjs'

const BASIS = envWert('NEXT_PUBLIC_SUPABASE_URL')
const KEY = secretKey()
const ANON = publishableKey()

async function sql(query) {
  const wrapped = `DO $probe$ DECLARE r text; BEGIN
    SELECT coalesce(json_agg(t)::text,'[]') INTO r FROM (${query}) t;
    RAISE EXCEPTION 'ORAKEL:%', r; END $probe$;`
  const res = await fetch(`${BASIS}/rest/v1/rpc/_run_sql`, {
    method: 'POST',
    headers: apiHeaders(KEY, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ p: wrapped }),
  })
  const j = JSON.parse(await res.text())
  if (!String(j.message || '').startsWith('ORAKEL:')) throw new Error(JSON.stringify(j).slice(0, 300))
  return JSON.parse(j.message.slice(7))
}

console.log('\n═══ A) Policies, die fuer anon gelten ═══')
const pols = await sql(`
  SELECT c.relname AS tabelle, pol.polname AS policy,
         CASE pol.polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT' WHEN 'w' THEN 'UPDATE'
              WHEN 'd' THEN 'DELETE' ELSE 'ALL' END AS cmd,
         pol.polpermissive AS permissive,
         (SELECT string_agg(rolname,',') FROM pg_roles WHERE oid = ANY(pol.polroles)) AS rollen,
         coalesce(pg_get_expr(pol.polqual, pol.polrelid),'-') AS using_a,
         coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid),'-') AS check_a
  FROM pg_policy pol JOIN pg_class c ON c.oid=pol.polrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public'
    AND pol.polpermissive
    AND (pol.polroles = '{0}'::oid[] OR 'anon' IN (
         SELECT rolname FROM pg_roles WHERE oid = ANY(pol.polroles)))
  ORDER BY 1,3
`)
console.log(`  ${pols.length} PERMISSIVE-Policies gelten fuer anon (Rolle anon oder PUBLIC)\n`)
const schreibend = pols.filter(p => p.cmd !== 'SELECT')
console.log(`  -- davon schreibend (${schreibend.length}) --`)
for (const p of schreibend) {
  console.log(`   ${p.tabelle}.${p.policy} [${p.cmd}] rollen=${p.rollen ?? 'PUBLIC'}`)
  console.log(`      USING ${p.using_a.slice(0, 100)} | CHECK ${p.check_a.slice(0, 100)}`)
}
console.log(`\n  -- lesend, USING ohne echten Filter --`)
const schwach = pols.filter(p => p.cmd === 'SELECT' && /^(true|\(true\))$/i.test(p.using_a.trim()))
if (!schwach.length) console.log('   (keine SELECT-Policy mit USING(true))')
for (const p of schwach) console.log(`   LECK  ${p.tabelle}.${p.policy} rollen=${p.rollen ?? 'PUBLIC'}`)

console.log('\n═══ B) Empirische Gegenprobe mit dem oeffentlichen anon-Key ═══')
const ZIELE = ['profiles', 'clients', 'caregivers', 'audit_logs', 'invoices', 'payments',
  'bookings', 'care_notes', 'medikamentenplan', 'notfall_info', 'billing_tariffs',
  'billing_tariff_audit', 'account_deletion_tokens', 'organizations', 'state_waitlist',
  'wounds', 'sis_assessments', 'vitalwerte', 'fcm_tokens', 'notification_delivery_log']
let lecks = 0
for (const t of ZIELE) {
  const res = await fetch(`${BASIS}/rest/v1/${t}?select=*&limit=2`, { headers: apiHeaders(ANON) })
  const txt = await res.text()
  let bewertung
  if (res.status === 401 || res.status === 403) bewertung = 'dicht (RLS)'
  else if (res.status === 404) bewertung = 'nicht exponiert'
  else if (res.status === 200 && txt.trim() === '[]') bewertung = 'leer — mehrdeutig'
  else if (res.status === 200) { bewertung = `LECK: ${txt.length} Bytes Nutzdaten`; lecks++ }
  else bewertung = `HTTP ${res.status}`
  console.log(`  ${String(res.status).padEnd(4)} ${t.padEnd(30)} ${bewertung}`)
}
console.log(`\n  Lecks: ${lecks}`)
process.exit(lecks > 0 ? 1 : 0)
