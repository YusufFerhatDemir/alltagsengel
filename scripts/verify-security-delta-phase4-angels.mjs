#!/usr/bin/env node
/**
 * Gezielte Gegenprobe zu den vier SELECT-Policies mit USING(true), die fuer
 * anon gelten. Die Policy allein sagt nichts — erst zusammen mit dem
 * Tabellen-GRANT entsteht Zugriff. Deshalb hier der echte HTTP-Aufruf mit
 * dem oeffentlichen anon-Key, plus die Spaltenliste: bei einer
 * Personenstamm-Tabelle entscheidet der Inhalt ueber die Schwere.
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

const ZIELE = ['angels', 'kf_feature_flags', 'bundeslaender', 'plz_bundesland_regeln']

for (const t of ZIELE) {
  console.log(`\n═══ ${t} ═══`)
  const [meta] = await sql(`
    SELECT (SELECT count(*) FROM information_schema.columns
             WHERE table_schema='public' AND table_name='${t}') AS spalten,
           (SELECT string_agg(column_name, ', ' ORDER BY ordinal_position)
              FROM information_schema.columns
             WHERE table_schema='public' AND table_name='${t}') AS spaltenliste,
           has_table_privilege('anon', 'public.${t}', 'SELECT') AS anon_grant
  `)
  console.log(`  anon-GRANT: ${meta.anon_grant} | Spalten: ${meta.spalten}`)
  console.log(`  ${String(meta.spaltenliste).slice(0, 400)}`)

  const res = await fetch(`${BASIS}/rest/v1/${t}?select=*&limit=3`, { headers: apiHeaders(ANON) })
  const txt = await res.text()
  if (res.status === 200 && txt.trim() !== '[]') {
    console.log(`  >>> ANON LIEST: HTTP 200, ${txt.length} Bytes`)
    // Nur Schluesselnamen ausgeben, keine Werte — es sind echte Personendaten.
    try {
      const zeilen = JSON.parse(txt)
      console.log(`  >>> ${zeilen.length} Zeile(n), Felder: ${Object.keys(zeilen[0] || {}).join(', ')}`)
    } catch { /* ignore */ }
  } else {
    console.log(`  anon: HTTP ${res.status} ${txt.trim() === '[]' ? '(leer)' : txt.slice(0, 120)}`)
  }

  const [anz] = await sql(`SELECT count(*)::int AS n FROM public.${t}`)
  console.log(`  Zeilen in der Tabelle (service_role gezaehlt): ${anz.n}`)
}
