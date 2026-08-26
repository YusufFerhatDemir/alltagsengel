#!/usr/bin/env node
/**
 * Phase 8.3 Track 2 — Live-Verifikation von `pilot_send_gate` und
 * `pilot_versand_sperre` (Migration 20261005000000).
 *
 * NEBENWIRKUNGSFREI. Es wird ausschliesslich gelesen:
 *   Jede Abfrage laeuft in einem DO-Block, der sein Ergebnis per
 *   RAISE EXCEPTION zurueckgibt. Die Exception rollt die (ohnehin nur
 *   lesende) Transaktion zurueck. Es wird KEIN Token erzeugt, KEINE Sperre
 *   gesetzt, KEIN DDL ausgefuehrt.
 *
 * Exit 0 = alle Pruefpunkte erfuellt, Exit 1 = mindestens einer offen.
 */
import { readFileSync, existsSync } from 'node:fs'
import { apiHeaders, secretKey } from './lib/supabase-keys.mjs'

for (const datei of ['.env.local', '.env']) {
  if (!existsSync(datei)) continue
  for (const zeile of readFileSync(datei, 'utf8').split('\n')) {
    const m = zeile.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const BASIS = process.env.NEXT_PUBLIC_SUPABASE_URL
const SVC = secretKey()
if (!BASIS || !SVC) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen')
  process.exit(1)
}

/**
 * Fuehrt eine reine Leseabfrage aus und holt das Ergebnis ueber eine
 * Exception zurueck. `sql` muss genau einen Textwert liefern.
 */
async function orakel(sql) {
  const wrapped = `DO $ORK$ DECLARE r text; BEGIN
    SELECT (${sql}) INTO r;
    RAISE EXCEPTION 'ORAKEL:%', coalesce(r, '<null>');
  END $ORK$;`
  const res = await fetch(`${BASIS}/rest/v1/rpc/_run_sql`, {
    method: 'POST',
    headers: apiHeaders(SVC, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ p: wrapped }),
  })
  const text = await res.text()
  try {
    const j = JSON.parse(text)
    if (typeof j.message === 'string' && j.message.startsWith('ORAKEL:')) {
      return j.message.slice(7)
    }
    return `FEHLER:${j.message ?? text.slice(0, 200)}`
  } catch {
    return `FEHLER:HTTP ${res.status} ${text.slice(0, 200)}`
  }
}

const ergebnisse = []
function pruefe(id, bestanden, meldung) {
  ergebnisse.push({ id, bestanden })
  console.log(`${bestanden ? '  OK  ' : ' OFFEN'} ${id.padEnd(34)} ${meldung}`)
}

console.log(`\nPilot-Send-Gate-Verifikation gegen ${BASIS.replace(/^https:\/\//, '')}\n`)

// ── 1) Existenz der beiden Tabellen ────────────────────────────────────────
console.log('── 1) Tabellen ──')
for (const t of ['pilot_send_gate', 'pilot_versand_sperre']) {
  // to_regclass::text liefert den Namen unqualifiziert, sobald `public` im
  // search_path steht — deshalb wird gegen pg_class geprueft, nicht gegen den
  // (schema-abhaengigen) Textwert.
  const da = await orakel(
    `SELECT (to_regclass('public.${t}') IS NOT NULL)::text || ':' || coalesce(to_regclass('public.${t}')::text, '-')`
  )
  const [gefunden, name] = da.split(':')
  pruefe(`T_${t}_existiert`, gefunden === 'true', gefunden === 'true' ? `existiert (${name})` : `nicht gefunden (${da})`)
}

// ── 2) RLS aktiv ───────────────────────────────────────────────────────────
console.log('\n── 2) Row Level Security ──')
for (const t of ['pilot_send_gate', 'pilot_versand_sperre']) {
  const rls = await orakel(
    `SELECT relrowsecurity::text FROM pg_class WHERE oid = 'public.${t}'::regclass`)
  pruefe(`R_${t}_rls`, rls === 'true', rls === 'true' ? 'RLS aktiv' : `RLS NICHT aktiv (${rls})`)
}

// ── 3) CHECK-Constraints ───────────────────────────────────────────────────
console.log('\n── 3) CHECK-Constraints ──')
const constraints = await orakel(`
  SELECT string_agg(conname || ' := ' || pg_get_constraintdef(oid), ' | ' ORDER BY conname)
  FROM pg_constraint
  WHERE conrelid = 'public.pilot_send_gate'::regclass AND contype = 'c'`)
console.log(`       ${constraints}`)

const erwarteteChecks = [
  ['C_betrag_positiv', /betrag_cents\s*>\s*\(?0\)?/],
  ['C_preflight_ready', /preflight_status\s*=\s*'READY_FOR_SEND'/],
  ['C_nicht_beides', /pilot_send_gate_nicht_beides/],
  ['C_gueltigkeit', /pilot_send_gate_gueltigkeit/],
]
for (const [id, re] of erwarteteChecks) {
  pruefe(id, re.test(constraints || ''), re.test(constraints || '') ? 'vorhanden' : 'FEHLT')
}

const sperreChecks = await orakel(`
  SELECT string_agg(conname || ' := ' || pg_get_constraintdef(oid), ' | ' ORDER BY conname)
  FROM pg_constraint
  WHERE conrelid = 'public.pilot_versand_sperre'::regclass AND contype = 'c'`)
console.log(`       ${sperreChecks}`)
pruefe('C_sperre_aufhebung', /pilot_versand_sperre_aufhebung/.test(sperreChecks || ''),
  /pilot_versand_sperre_aufhebung/.test(sperreChecks || '') ? 'vorhanden' : 'FEHLT')
pruefe('C_sperre_schwere', /schwere\b[\s\S]*P0[\s\S]*P1/.test(sperreChecks || ''),
  /schwere\b[\s\S]*P0[\s\S]*P1/.test(sperreChecks || '') ? "schwere IN ('P0','P1')" : 'FEHLT')

// ── 4) UNIQUE-Teilindizes ──────────────────────────────────────────────────
console.log('\n── 4) UNIQUE-Teilindizes ──')
const indizes = await orakel(`
  SELECT string_agg(indexname || ' := ' || indexdef, ' | ' ORDER BY indexname)
  FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'pilot_send_gate'`)
console.log(`       ${indizes}`)

const offen = /CREATE UNIQUE INDEX pilot_send_gate_offen_je_rechnung[\s\S]*?\(invoice_id\)[\s\S]*?WHERE \(\(verbraucht_am IS NULL\) AND \(entwertet_am IS NULL\)\)/.test(indizes || '')
  || (/pilot_send_gate_offen_je_rechnung/.test(indizes || '') && /UNIQUE INDEX pilot_send_gate_offen_je_rechnung/.test(indizes || ''))
pruefe('I_offen_je_rechnung', offen, offen ? 'UNIQUE partial: max 1 offenes Token/Rechnung' : 'FEHLT oder nicht UNIQUE')

const verbraucht = /UNIQUE INDEX pilot_send_gate_einmal_verbraucht/.test(indizes || '')
pruefe('I_einmal_verbraucht', verbraucht, verbraucht ? 'UNIQUE partial: max 1 verbrauchtes Token/Rechnung' : 'FEHLT oder nicht UNIQUE')

// Die WHERE-Klauseln einzeln, damit ein UNIQUE ohne Teilbedingung auffaellt
// (das waere strenger als gewollt und wuerde den zweiten Index sinnlos machen).
const wOffen = await orakel(`
  SELECT indexdef FROM pg_indexes
  WHERE schemaname='public' AND indexname='pilot_send_gate_offen_je_rechnung'`)
pruefe('I_offen_where', /WHERE .*verbraucht_am IS NULL.*AND.*entwertet_am IS NULL/i.test(wOffen || ''),
  wOffen && wOffen.includes('WHERE') ? 'Teilbedingung korrekt' : `Teilbedingung fehlt (${wOffen})`)

const wVerbraucht = await orakel(`
  SELECT indexdef FROM pg_indexes
  WHERE schemaname='public' AND indexname='pilot_send_gate_einmal_verbraucht'`)
pruefe('I_verbraucht_where', /WHERE .*verbraucht_am IS NOT NULL/i.test(wVerbraucht || ''),
  wVerbraucht && wVerbraucht.includes('WHERE') ? 'Teilbedingung korrekt' : `Teilbedingung fehlt (${wVerbraucht})`)

// ── 5) RLS-Policies ────────────────────────────────────────────────────────
console.log('\n── 5) RLS-Policies ──')
for (const t of ['pilot_send_gate', 'pilot_versand_sperre']) {
  const pol = await orakel(`
    SELECT string_agg(policyname || ' [' || permissive || '/' || cmd || '] USING ' ||
           coalesce(qual, '<kein qual>'), ' | ' ORDER BY policyname)
    FROM pg_policies WHERE schemaname='public' AND tablename='${t}'`)
  console.log(`       ${t}: ${pol}`)

  const adminDa = /_admin \[PERMISSIVE\/ALL\][\s\S]*is_admin\(\)/.test(pol || '')
  pruefe(`P_${t}_admin`, adminDa, adminDa ? 'admin-only (PERMISSIVE, is_admin())' : 'Admin-Policy fehlt/abweichend')

  const fenceDa = /org_fence_[a-z_]+ \[RESTRICTIVE\/ALL\][\s\S]*organization_id = current_org_id\(\)/.test(pol || '')
  pruefe(`P_${t}_org_fence`, fenceDa, fenceDa ? 'org_fence RESTRICTIVE + current_org_id()' : 'org_fence fehlt oder nicht RESTRICTIVE')
}

// ── 6) Fremdschluessel ─────────────────────────────────────────────────────
console.log('\n── 6) Fremdschluessel ──')
for (const t of ['pilot_send_gate', 'pilot_versand_sperre']) {
  const fks = await orakel(`
    SELECT string_agg(conname || ' := ' || pg_get_constraintdef(oid), ' | ' ORDER BY conname)
    FROM pg_constraint WHERE conrelid = 'public.${t}'::regclass AND contype = 'f'`)
  console.log(`       ${t}: ${fks}`)
  const orgFk = /FOREIGN KEY \(organization_id\) REFERENCES organizations\(id\)/.test(fks || '')
  pruefe(`F_${t}_org`, orgFk, orgFk ? '→ organizations(id)' : 'FK auf organizations fehlt')
  const invFk = /FOREIGN KEY \(invoice_id\) REFERENCES invoices\(id\)/.test(fks || '')
  pruefe(`F_${t}_invoice`, invFk, invFk ? '→ invoices(id)' : 'FK auf invoices fehlt')
}

// ── 7) Zeilenzahl = 0 (keine echte Freigabe erzeugt) ───────────────────────
console.log('\n── 7) Bestand ──')
for (const t of ['pilot_send_gate', 'pilot_versand_sperre']) {
  const n = await orakel(`SELECT count(*)::text FROM public.${t}`)
  pruefe(`Z_${t}_leer`, n === '0', n === '0' ? '0 Zeilen' : `${n} Zeilen — ES EXISTIERT EINE FREIGABE/SPERRE`)
}

// ── 8) invoice_id NOT NULL im Gate, NULL-bar in der Sperre ────────────────
console.log('\n── 8) Spalten-Nullability ──')
const gateInv = await orakel(`
  SELECT is_nullable FROM information_schema.columns
  WHERE table_schema='public' AND table_name='pilot_send_gate' AND column_name='invoice_id'`)
pruefe('N_gate_invoice_notnull', gateInv === 'NO',
  gateInv === 'NO' ? 'invoice_id NOT NULL (Token immer rechnungsgebunden)' : `invoice_id nullable (${gateInv})`)

const sperreInv = await orakel(`
  SELECT is_nullable FROM information_schema.columns
  WHERE table_schema='public' AND table_name='pilot_versand_sperre' AND column_name='invoice_id'`)
pruefe('N_sperre_invoice_nullable', sperreInv === 'YES',
  sperreInv === 'YES' ? 'invoice_id nullable (mandantenweite Sperre moeglich)' : `NOT NULL (${sperreInv})`)

// ── Bilanz ─────────────────────────────────────────────────────────────────
const offenN = ergebnisse.filter((e) => !e.bestanden)
console.log(`\n${ergebnisse.length - offenN.length}/${ergebnisse.length} Pruefpunkte erfuellt`)
if (offenN.length) {
  console.log('OFFEN: ' + offenN.map((e) => e.id).join(', '))
  process.exit(1)
}
console.log('Track 2: pilot_send_gate LIVE und vollstaendig verriegelt.')
