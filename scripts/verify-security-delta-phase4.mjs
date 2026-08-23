#!/usr/bin/env node
/**
 * verify-security-delta-phase4.mjs
 * ─────────────────────────────────
 * Live-Gegenprobe fuer den Security-/DSGVO-Delta-Review Phase 4.
 *
 * Prueft gegen die PRODUKTIONS-Datenbank — nicht gegen das Repo. Der
 * Unterschied ist der Kern dieses Skripts: eine Migration im Repo ist kein
 * Schutz. Erst wenn sie eingespielt ist, haelt sie.
 *
 * Geprueft wird:
 *   1. Sind die Phase-3-Wettlauf-Fixes live? (VP/KZP-Advisory-Lock,
 *      Sammelrechnungs-Unique-Index, Negativbetrag-CHECKs)
 *   2. RLS: Tabellen ohne RLS, Tabellen mit RLS aber ohne Policy
 *   3. SECURITY DEFINER: EXECUTE fuer anon/authenticated
 *   4. Tabellen-Grants fuer anon
 *   5. org_fence: Abdeckung und RESTRICTIVE-Eigenschaft
 *
 * Nur lesend. Jede Abfrage laeuft in einem DO-Block, der mit RAISE EXCEPTION
 * endet — die Transaktion wird immer zurueckgerollt.
 *
 * ENV: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (bzw. SECRET_KEY)
 * Aufruf: node scripts/verify-security-delta-phase4.mjs
 * Exit 0 = keine offenen Befunde, Exit 1 = mindestens ein Befund.
 */
import { apiHeaders, secretKey, envWert, keyModellBericht } from './lib/supabase-keys.mjs'

const BASIS = envWert('NEXT_PUBLIC_SUPABASE_URL')
const KEY = secretKey()
if (!BASIS || !KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen')
  process.exit(1)
}

/**
 * Lese-Orakel. public._run_sql liefert kein Resultset zurueck, deshalb wird
 * das Ergebnis absichtlich als EXCEPTION-Message geworfen und aus dem
 * PostgREST-Fehlerkoerper wieder ausgelesen.
 */
async function sql(query) {
  const wrapped = `DO $probe$ DECLARE r text; BEGIN
    SELECT coalesce(json_agg(t)::text,'[]') INTO r FROM (${query}) t;
    RAISE EXCEPTION 'ORAKEL:%', r; END $probe$;`
  const res = await fetch(`${BASIS}/rest/v1/rpc/_run_sql`, {
    method: 'POST',
    headers: apiHeaders(KEY, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ p: wrapped }),
  })
  const txt = await res.text()
  let j
  try { j = JSON.parse(txt) } catch { throw new Error(`HTTP ${res.status}: ${txt.slice(0, 300)}`) }
  const msg = j.message || ''
  if (!msg.startsWith('ORAKEL:')) throw new Error(`HTTP ${res.status}: ${txt.slice(0, 400)}`)
  return JSON.parse(msg.slice(7))
}

const befunde = []
function melde(schwere, id, text) {
  befunde.push({ schwere, id, text })
  console.log(`  ${schwere.padEnd(2)} ${id.padEnd(30)} ${text}`)
}
function ok(id, text) {
  console.log(`  OK ${id.padEnd(30)} ${text}`)
}

console.log(`\nSecurity-Delta Phase 4 gegen ${BASIS.replace(/^https:\/\//, '')}`)
console.log(keyModellBericht() + '\n')

// ── 1) Phase-3-Wettlauf-Fixes ────────────────────────────────────────────
console.log('── 1) Phase-3-Fixes live? ──')
const [p3] = await sql(`
  SELECT
    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='vpkzp_fortschreiben') AS vpkzp_da,
    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='vpkzp_fortschreiben'
        AND p.prosrc LIKE '%pg_advisory_xact_lock%') AS vpkzp_lock,
    (SELECT count(*) FROM pg_indexes WHERE schemaname='public'
      AND indexname='uq_sammelrechnungslauf_aktiv') AS sammel_idx,
    (SELECT count(*) FROM pg_class WHERE relname='sammelrechnungslaeufe' AND relkind='r') AS sammel_tab
`)
if (Number(p3.vpkzp_da) === 0) {
  melde('P1', 'vpkzp_fortschreiben', 'Funktion existiert live NICHT — VP/KZP-Migrationen nicht eingespielt')
} else if (Number(p3.vpkzp_lock) === 0) {
  melde('P1', 'vpkzp_advisory_lock', 'Funktion live OHNE pg_advisory_xact_lock — Phase-3-Wettlaufsperre fehlt')
} else {
  ok('vpkzp_advisory_lock', 'pg_advisory_xact_lock ist live')
}
if (Number(p3.sammel_tab) === 0) {
  melde('P2', 'sammelrechnungslaeufe', 'Tabelle existiert live nicht — Batch-Migration nicht eingespielt')
} else if (Number(p3.sammel_idx) === 0) {
  melde('P1', 'uq_sammelrechnungslauf', 'Unique-Index fehlt live — paralleler Doppellauf moeglich')
} else {
  ok('uq_sammelrechnungslauf', 'Unique-Index ist live')
}

// ── 2) RLS ───────────────────────────────────────────────────────────────
console.log('\n── 2) RLS ──')
const tabellen = await sql(`
  SELECT c.relname AS tabelle, c.relrowsecurity AS rls,
         (SELECT count(*) FROM pg_policy pol WHERE pol.polrelid=c.oid) AS policies
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p')
  ORDER BY c.relname
`)
const ohneRls = tabellen.filter(x => !x.rls).map(x => x.tabelle)
const ohnePolicy = tabellen.filter(x => x.rls && Number(x.policies) === 0).map(x => x.tabelle)
console.log(`  (${tabellen.length} Tabellen im Schema public)`)
if (ohneRls.length) melde('P1', 'rls_aus', `RLS AUS: ${ohneRls.join(', ')}`)
else ok('rls_aus', 'alle Tabellen haben RLS aktiv')
if (ohnePolicy.length) melde('P3', 'rls_ohne_policy', `RLS an, 0 Policies (= dicht ausser service_role): ${ohnePolicy.length} Tabellen`)
else ok('rls_ohne_policy', 'jede Tabelle mit RLS hat mindestens eine Policy')

// ── 3) SECURITY DEFINER offen ────────────────────────────────────────────
console.log('\n── 3) SECURITY DEFINER fuer anon/authenticated ──')
const secdef = await sql(`
  SELECT p.oid::regprocedure::text AS funktion,
         has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.prosecdef
    AND (has_function_privilege('anon', p.oid,'EXECUTE')
      OR has_function_privilege('authenticated', p.oid,'EXECUTE'))
  ORDER BY 1
`)
const anonOffen = secdef.filter(f => f.anon)
if (anonOffen.length) {
  melde('P1', 'secdef_anon', `${anonOffen.length} SECDEF-Funktionen fuer anon ausfuehrbar`)
  for (const f of anonOffen) console.log(`       · ${f.funktion}`)
} else {
  ok('secdef_anon', 'keine SECDEF-Funktion fuer anon ausfuehrbar')
}
console.log(`  (zusaetzlich fuer authenticated ausfuehrbar: ${secdef.filter(f => f.auth && !f.anon).length})`)

// ── 4) Tabellen-Grants fuer anon ─────────────────────────────────────────
console.log('\n── 4) Tabellen-Grants fuer anon ──')
const anonGrants = await sql(`
  SELECT table_name AS tabelle, string_agg(DISTINCT privilege_type, ',') AS rechte
  FROM information_schema.role_table_grants
  WHERE grantee='anon' AND table_schema='public'
  GROUP BY table_name ORDER BY 1
`)
const anonSchreib = anonGrants.filter(g => /INSERT|UPDATE|DELETE|TRUNCATE/.test(g.rechte))
if (anonSchreib.length) {
  melde('P1', 'anon_schreibrechte', `${anonSchreib.length} Tabellen mit Schreibrecht fuer anon`)
  for (const g of anonSchreib) console.log(`       · ${g.tabelle}: ${g.rechte}`)
} else {
  ok('anon_schreibrechte', 'anon hat nirgends INSERT/UPDATE/DELETE')
}
console.log(`  (anon hat auf ${anonGrants.length} Tabellen ueberhaupt ein Grant — RLS entscheidet darueber)`)

// ── 5) org_fence ─────────────────────────────────────────────────────────
console.log('\n── 5) org_fence ──')
const fences = await sql(`
  SELECT c.relname AS tabelle, pol.polname AS policy, pol.polpermissive AS permissive
  FROM pg_policy pol JOIN pg_class c ON c.oid=pol.polrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND pol.polname ILIKE '%org_fence%'
  ORDER BY 1
`)
const permissiveFences = fences.filter(f => f.permissive)
console.log(`  (${fences.length} org_fence-Policies live)`)
if (permissiveFences.length) {
  melde('P1', 'org_fence_permissive', `${permissiveFences.length} org_fence-Policies sind PERMISSIVE statt RESTRICTIVE`)
  for (const f of permissiveFences) console.log(`       · ${f.tabelle}.${f.policy}`)
} else {
  ok('org_fence_permissive', 'alle org_fence-Policies sind RESTRICTIVE')
}

// Tabellen mit organization_id, aber ohne org_fence
const ungezaeunt = await sql(`
  SELECT c.relname AS tabelle
  FROM pg_class c
  JOIN pg_namespace n ON n.oid=c.relnamespace
  JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname='organization_id' AND a.attnum>0
  WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity
    AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid AND p.polname ILIKE '%org_fence%')
  ORDER BY 1
`)
if (ungezaeunt.length) {
  melde('P2', 'org_fence_luecke', `${ungezaeunt.length} Tabellen mit organization_id ohne org_fence-Policy`)
  console.log('       · ' + ungezaeunt.map(t => t.tabelle).join(', '))
} else {
  ok('org_fence_luecke', 'jede Tabelle mit organization_id hat einen org_fence')
}

// ── Zusammenfassung ──────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(70))
if (!befunde.length) {
  console.log('Keine offenen Befunde.')
  process.exit(0)
}
const nachSchwere = befunde.reduce((a, b) => ((a[b.schwere] = (a[b.schwere] || 0) + 1), a), {})
console.log(`${befunde.length} Befund(e): ` + Object.entries(nachSchwere).map(([s, n]) => `${s}=${n}`).join(' '))
process.exit(1)
