#!/usr/bin/env node
/**
 * Gegenprobe zu den zwei Stellen, an denen die erste Messung mehrdeutig war:
 *
 *   A) INSERT-Policies pruefen ueber WITH CHECK, nicht ueber USING. Die erste
 *      Abfrage las nur polqual — bei INSERT ist das immer NULL und sah
 *      deshalb wie "kein Filter" aus. Ohne diese Gegenprobe waere die Schwere
 *      geraten statt gemessen.
 *   B) "anon hat 0 Grants" darf nicht aus role_table_grants allein gefolgert
 *      werden: ein GRANT an PUBLIC taucht dort unter grantee='PUBLIC' auf,
 *      anon erbt es trotzdem. Deshalb hier has_table_privilege('anon', ...) —
 *      das rechnet die Vererbung mit ein.
 *
 * Nur lesend.
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

console.log('\n═══ A) INSERT/UPDATE-Policies mit WITH CHECK ═══')
const wc = await sql(`
  SELECT c.relname AS tabelle, pol.polname AS policy,
         CASE pol.polcmd WHEN 'a' THEN 'INSERT' WHEN 'w' THEN 'UPDATE' ELSE 'ALL' END AS cmd,
         pol.polpermissive AS permissive,
         (SELECT string_agg(rolname,',') FROM pg_roles WHERE oid = ANY(pol.polroles)) AS rollen,
         coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid),'(KEIN WITH CHECK)') AS with_check
  FROM pg_policy pol JOIN pg_class c ON c.oid=pol.polrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND pol.polcmd IN ('a','w','*')
    AND c.relname IN ('billing_tariff_audit','state_waitlist','billing_landesregeln',
                      'billing_tarif_belege','organization_members','organization_subscriptions',
                      'state_settings','state_settings_audit')
  ORDER BY 1,3
`)
for (const p of wc) {
  console.log(`  ${p.tabelle}.${p.policy}`)
  console.log(`     ${p.cmd} ${p.permissive ? 'PERM' : 'REST'} rollen=${p.rollen} :: ${p.with_check.slice(0, 140)}`)
}

console.log('\n═══ B) Effektive anon-Rechte (inkl. PUBLIC-Vererbung) ═══')
const anon = await sql(`
  SELECT c.relname AS tabelle,
         has_table_privilege('anon', c.oid, 'SELECT') AS sel,
         has_table_privilege('anon', c.oid, 'INSERT') AS ins,
         has_table_privilege('anon', c.oid, 'UPDATE') AS upd,
         has_table_privilege('anon', c.oid, 'DELETE') AS del
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p')
    AND (has_table_privilege('anon', c.oid,'SELECT') OR has_table_privilege('anon', c.oid,'INSERT')
      OR has_table_privilege('anon', c.oid,'UPDATE') OR has_table_privilege('anon', c.oid,'DELETE'))
  ORDER BY 1
`)
console.log(`  ${anon.length} Tabellen, auf die anon effektiv ein Recht hat`)
const schreib = anon.filter(a => a.ins || a.upd || a.del)
for (const a of schreib) console.log(`     SCHREIB  ${a.tabelle}  ins=${a.ins} upd=${a.upd} del=${a.del}`)
console.log(`  davon nur-lesend: ${anon.length - schreib.length}`)
if (anon.length) console.log('  Leseliste: ' + anon.filter(a => !schreib.includes(a)).map(a => a.tabelle).join(', ').slice(0, 600))

console.log('\n═══ C) Views ohne security_invoker (anon-Leck-Klasse) ═══')
const views = await sql(`
  SELECT c.relname AS view,
         coalesce((SELECT option_value FROM pg_options_to_table(c.reloptions)
                   WHERE option_name='security_invoker'),'aus') AS invoker,
         has_table_privilege('anon', c.oid,'SELECT') AS anon_select
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='v'
  ORDER BY 1
`)
const offen = views.filter(v => v.invoker !== 'true' && v.anon_select)
console.log(`  ${views.length} Views, davon ohne security_invoker UND fuer anon lesbar: ${offen.length}`)
for (const v of offen) console.log(`     LECK  ${v.view}`)
const ohneInvoker = views.filter(v => v.invoker !== 'true')
console.log(`  ohne security_invoker (aber anon ohne SELECT): ${ohneInvoker.length - offen.length}`)
