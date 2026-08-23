#!/usr/bin/env node
/**
 * Wo liegen Bankdaten (IBAN/BIC), und wie sind diese Tabellen abgesichert?
 * Zusaetzlich: sind sie fuer anon erreichbar? Nur lesend.
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

const spalten = await sql(`
  SELECT c.table_name AS tabelle, string_agg(c.column_name, ', ') AS spalten,
         t.relrowsecurity AS rls,
         (SELECT count(*) FROM pg_policy p WHERE p.polrelid=t.oid) AS policies,
         has_table_privilege('anon', t.oid, 'SELECT') AS anon_select
  FROM information_schema.columns c
  JOIN pg_class t ON t.relname=c.table_name
  JOIN pg_namespace n ON n.oid=t.relnamespace AND n.nspname='public'
  WHERE c.table_schema='public' AND t.relkind='r'
    AND (c.column_name ILIKE '%iban%' OR c.column_name ILIKE '%bic%'
      OR c.column_name ILIKE '%kontoinhaber%' OR c.column_name ILIKE '%mandat%')
  GROUP BY 1,3,4,5 ORDER BY 1
`)
console.log('\n═══ Tabellen mit Bankdaten ═══')
for (const s of spalten) {
  console.log(`  ${s.tabelle.padEnd(28)} rls=${s.rls} policies=${s.policies} anon_select=${s.anon_select}`)
  console.log(`     ${s.spalten}`)
}

console.log('\n═══ anon-Gegenprobe ═══')
for (const s of spalten) {
  const res = await fetch(`${BASIS}/rest/v1/${s.tabelle}?select=*&limit=1`, { headers: apiHeaders(ANON) })
  const txt = await res.text()
  const urteil = res.status === 200 && txt.trim() !== '[]' ? '>>> LECK' : res.status === 200 ? 'leer' : 'dicht'
  console.log(`  ${String(res.status).padEnd(4)} ${s.tabelle.padEnd(28)} ${urteil}`)
}

console.log('\n═══ SEPA-Glaeubiger-ID: Platzhalter live? ═══')
const org = await sql(`
  SELECT count(*)::int AS gesamt,
         count(*) FILTER (WHERE sepa_creditor_id = 'DE98ZZZ09999999999')::int AS platzhalter,
         count(*) FILTER (WHERE sepa_creditor_id IS NULL)::int AS leer
  FROM public.organizations
`)
console.log('  ' + JSON.stringify(org[0]))
