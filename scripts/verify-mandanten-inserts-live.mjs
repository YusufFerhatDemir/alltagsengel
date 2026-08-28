#!/usr/bin/env node
/**
 * Live-Nachweis fuer Track 6 (Mandanten-Streuung in die Stamm-Organisation).
 *
 * Prueft ausschliesslich TATSACHEN gegen die Produktionsdatenbank — keine
 * Annahmen aus dem Repo.
 *
 * Aufruf:  node scripts/verify-mandanten-inserts-live.mjs
 */
import { readFileSync } from 'node:fs'
import { apiHeaders, secretKey, envWert } from './lib/supabase-keys.mjs'

const URL_ = envWert('NEXT_PUBLIC_SUPABASE_URL')
const KEY = secretKey()
if (!URL_ || !KEY) {
  console.error('Fehlt: NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const H = apiHeaders(KEY, { 'Content-Type': 'application/json' })

const ergebnisse = []
const pruefe = (id, ok, meldung) => ergebnisse.push({ id, ok, meldung })

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

// ── 1) current_org_id() endet wirklich in einer festen Stamm-Organisation ──
{
  const src = await orakel(`select prosrc from pg_proc where proname = 'current_org_id'`)
  pruefe('T6-1',
    src.includes('auth.uid()') && /'[0-9a-f-]{36}'::uuid\s*\)?\s*;?\s*$/m.test(src),
    'current_org_id() liest auth.uid() und endet in einer fest verdrahteten UUID '
    + '— beim Dienstschluessel greift genau dieser letzte Zweig.')
}

// ── 2) Die eingecheckte Tabellenliste stimmt mit der Live-DB ueberein ──
{
  const live = (await orakel(`
    select c.table_name from information_schema.columns c
      join information_schema.tables t
        on t.table_name = c.table_name and t.table_schema = c.table_schema
     where c.table_schema = 'public' and c.column_name = 'organization_id'
       and t.table_type = 'BASE TABLE' and c.column_default like '%current_org_id%'
     order by 1
  `)).split('\n').map((z) => z.trim()).filter(Boolean)
  const datei = JSON.parse(readFileSync('scripts/org-default-tables.json', 'utf-8')).tabellen
  const fehlend = live.filter((t) => !datei.includes(t))
  const zuviel = datei.filter((t) => !live.includes(t))
  pruefe('T6-2', fehlend.length === 0 && zuviel.length === 0,
    `org-default-tables.json deckt sich mit der Live-DB (${live.length} Tabellen)`
    + (fehlend.length ? ` — FEHLEN: ${fehlend.join(', ')}` : '')
    + (zuviel.length ? ` — ZUVIEL: ${zuviel.join(', ')}` : ''))
}

// ── 3) Die betroffenen Tabellen tragen den RESTRICTIVE org_fence ──
// Ohne ihn waere eine falsch abgelegte Zeile nur unordentlich; MIT ihm ist sie
// fuer den eigenen Mandanten verloren.
{
  const tabellen = ['service_signatures', 'invoice_packages', 'verordnungen', 'service_records',
                    'abrechnung_zertifikate', 'fcm_tokens']
  const gefunden = (await orakel(`
    select tablename from pg_policies
     where schemaname = 'public' and permissive = 'RESTRICTIVE'
       and policyname like '%org_fence%'
       and tablename in (${tabellen.map((t) => `'${t}'`).join(',')})
     group by tablename order by 1
  `)).split('\n').map((z) => z.trim()).filter(Boolean)
  const ohne = tabellen.filter((t) => !gefunden.includes(t))
  pruefe('T6-3', ohne.length === 0,
    `RESTRICTIVE org_fence auf allen ${tabellen.length} betroffenen Tabellen`
    + (ohne.length ? ` — OHNE: ${ohne.join(', ')}` : ''))
}

// ── 4) Kein Bestand liegt beim falschen Mandanten (kein Backfill noetig) ──
{
  const faelle = [
    ['service_signatures', `select count(*) from service_signatures s
        join service_records r on r.id = s.service_record_id
       where s.organization_id is distinct from r.organization_id`],
    ['invoice_packages', `select count(*) from invoice_packages p
        join invoices i on i.id = p.invoice_id
       where p.organization_id is distinct from i.organization_id`],
    ['service_records', `select count(*) from service_records r
        join clients c on c.id = r.client_id
       where r.organization_id is distinct from c.organization_id`],
    ['verordnungen', `select count(*) from verordnungen v
        join clients c on c.id = v.client_id
       where v.organization_id is distinct from c.organization_id`],
  ]
  for (const [name, sql] of faelle) {
    const n = Number((await orakel(sql)).trim())
    pruefe(`T6-4-${name}`, n === 0,
      `${name}: ${n} Zeile(n) mit abweichendem Mandanten zum Bezugsobjekt`)
  }
}

// ── 5) Es gibt mehr als einen Mandanten — die Streuung waere real ──
{
  const n = Number((await orakel('select count(*) from organizations')).trim())
  pruefe('T6-5', n > 1, `${n} Organisationen live — eine Fehlablage traefe echte Fremdmandanten`)
}

const ok = ergebnisse.filter((e) => e.ok).length
for (const e of ergebnisse) console.log(`${e.ok ? '✅' : '❌'} ${e.id}  ${e.meldung}`)
console.log(`\n${ok}/${ergebnisse.length} gruen.`)
process.exit(ok === ergebnisse.length ? 0 : 1)
