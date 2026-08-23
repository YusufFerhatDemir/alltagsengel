#!/usr/bin/env node
/**
 * Detailtiefe zum Delta-Review Phase 4 — Begleitskript zu
 * verify-security-delta-phase4.mjs. Beantwortet die zwei Fragen, an denen
 * sich die Schwere der dortigen Befunde entscheidet:
 *
 *   A) Welche der fuer anon offenen SECURITY-DEFINER-Funktionen sind
 *      ueberhaupt ueber PostgREST aufrufbar? Trigger-Funktionen
 *      (RETURNS trigger) sind es nicht — sie sind Defense-in-Depth,
 *      keine offene Tuer.
 *   B) Sind die Tabellen ohne org_fence tatsaechlich mandantenoffen,
 *      oder haelt eine andere Policy die Grenze?
 *
 * Nur lesend. Aufruf: node scripts/verify-security-delta-phase4-detail.mjs
 */
import { apiHeaders, secretKey, envWert } from './lib/supabase-keys.mjs'

const BASIS = envWert('NEXT_PUBLIC_SUPABASE_URL')
const KEY = secretKey()

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

console.log('\n═══ A) SECDEF fuer anon — Trigger oder echt aufrufbar? ═══')
const funcs = await sql(`
  SELECT p.oid::regprocedure::text AS funktion,
         pg_get_function_result(p.oid) AS rueckgabe,
         has_function_privilege('anon', p.oid,'EXECUTE') AS anon,
         has_function_privilege('authenticated', p.oid,'EXECUTE') AS auth,
         coalesce(p.proconfig::text,'(kein search_path)') AS config
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.prosecdef
    AND (has_function_privilege('anon', p.oid,'EXECUTE')
      OR has_function_privilege('authenticated', p.oid,'EXECUTE'))
  ORDER BY (pg_get_function_result(p.oid)='trigger'), 1
`)
const echt = funcs.filter(f => f.rueckgabe !== 'trigger')
const trigger = funcs.filter(f => f.rueckgabe === 'trigger')
console.log(`\n-- echt aufrufbar (${echt.length}) --`)
for (const f of echt) console.log(`  anon=${String(f.anon).padEnd(5)} auth=${String(f.auth).padEnd(5)} ${f.funktion} -> ${f.rueckgabe}  ${f.config}`)
console.log(`\n-- Trigger-Funktionen, nicht per RPC aufrufbar (${trigger.length}) --`)
for (const f of trigger) console.log(`  anon=${String(f.anon).padEnd(5)} auth=${String(f.auth).padEnd(5)} ${f.funktion}  ${f.config}`)

console.log('\n═══ B) Tabellen mit organization_id ohne org_fence ═══')
const OFFEN = ['billing_landesregeln','billing_tarif_belege','billing_tariff_audit',
  'organization_members','organization_subscriptions','state_settings','state_settings_audit','state_waitlist']
const pols = await sql(`
  SELECT c.relname AS tabelle, pol.polname AS policy,
         pol.polpermissive AS permissive,
         CASE pol.polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT' WHEN 'w' THEN 'UPDATE'
              WHEN 'd' THEN 'DELETE' ELSE 'ALL' END AS cmd,
         (SELECT string_agg(rolname,',') FROM pg_roles WHERE oid = ANY(pol.polroles)) AS rollen,
         coalesce(pg_get_expr(pol.polqual, pol.polrelid),'-') AS using_ausdruck
  FROM pg_policy pol JOIN pg_class c ON c.oid=pol.polrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname IN ('${OFFEN.join("','")}')
  ORDER BY c.relname, pol.polname
`)
let aktuell = ''
for (const p of pols) {
  if (p.tabelle !== aktuell) { console.log(`\n  ▸ ${p.tabelle}`); aktuell = p.tabelle }
  const art = p.permissive ? 'PERM' : 'REST'
  console.log(`     [${art}] ${p.cmd.padEnd(6)} ${String(p.rollen).padEnd(24)} ${p.using_ausdruck.slice(0, 110)}`)
}
const ohnePolicy = OFFEN.filter(t => !pols.some(p => p.tabelle === t))
if (ohnePolicy.length) console.log(`\n  !! ohne jede Policy: ${ohnePolicy.join(', ')}`)

console.log('\n═══ C) Tabellen mit RLS aber ohne Policy ═══')
const leer = await sql(`
  SELECT c.relname AS tabelle FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity
    AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid) ORDER BY 1
`)
console.log('  ' + (leer.map(t => t.tabelle).join(', ') || '(keine)'))
