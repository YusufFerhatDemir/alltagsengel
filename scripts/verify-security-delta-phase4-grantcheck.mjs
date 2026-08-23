#!/usr/bin/env node
/**
 * Widerspruchsaufloesung: has_table_privilege('anon', …) meldete fuer
 * audit_logs SELECT/INSERT/UPDATE/DELETE = true, der echte Aufruf mit dem
 * anon-Key bekam aber 42501 "permission denied for table audit_logs".
 *
 * Eine der beiden Messungen luegt. Dieses Skript liest die rohe ACL und
 * vergleicht sie mit beiden Messwegen, damit der Bericht keine erfundene
 * Zahl enthaelt.
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
    method: 'POST', headers: apiHeaders(KEY, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ p: wrapped }),
  })
  const j = JSON.parse(await res.text())
  if (!String(j.message || '').startsWith('ORAKEL:')) throw new Error(JSON.stringify(j).slice(0, 300))
  return JSON.parse(j.message.slice(7))
}

const rows = await sql(`
  SELECT c.relname AS tabelle,
         coalesce(array_to_string(c.relacl, ' | '), '(NULL = nur Owner)') AS acl,
         has_table_privilege('anon', c.oid, 'SELECT') AS hat_select,
         pg_get_userbyid(c.relowner) AS owner
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public'
    AND c.relname IN ('audit_logs','profiles','clients','bundeslaender','angels','invoices')
  ORDER BY 1
`)
for (const r of rows) {
  console.log(`\n▸ ${r.tabelle}  (owner=${r.owner})`)
  console.log(`   has_table_privilege('anon','SELECT') = ${r.hat_select}`)
  console.log(`   ACL: ${String(r.acl).slice(0, 300)}`)
  const res = await fetch(`${BASIS}/rest/v1/${r.tabelle}?select=*&limit=1`, { headers: apiHeaders(ANON) })
  const txt = await res.text()
  console.log(`   echter anon-Aufruf: HTTP ${res.status} ${txt.slice(0, 90)}`)
}

// Ist 'anon' vielleicht Mitglied einer Rolle, die breite Rechte hat?
const mitgliedschaften = await sql(`
  SELECT r.rolname AS rolle, g.rolname AS mitglied_in
  FROM pg_auth_members m
  JOIN pg_roles r ON r.oid = m.member
  JOIN pg_roles g ON g.oid = m.roleid
  WHERE r.rolname IN ('anon','authenticated','authenticator')
  ORDER BY 1,2
`)
console.log('\n▸ Rollen-Mitgliedschaften:')
for (const m of mitgliedschaften) console.log(`   ${m.rolle} ist Mitglied in ${m.mitglied_in}`)
