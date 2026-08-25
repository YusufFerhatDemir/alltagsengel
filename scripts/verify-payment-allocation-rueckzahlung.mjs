#!/usr/bin/env node
/**
 * Verifikation der Migration 20261004000000_payment_allocation_rueckzahlung
 * gegen die LIVE-Datenbank.
 *
 * Auszufuehren NACH dem Apply im Supabase-SQL-Editor (service_role kann kein
 * DDL — belegt durch 42501 "must be owner of table payment_allocations",
 * s. Kommentar in scripts/apply-migration.mjs).
 *
 * NEBENWIRKUNGSFREI: liest nur ueber das RAISE-Lese-Orakel (_run_sql liefert
 * void, der Wert kommt aus der Fehlermeldung). Es wird nichts geschrieben.
 *
 * Exit 0 = Migration wirksam UND Sicherheitslage unveraendert
 * Exit 1 = mindestens ein Befund
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
  console.error('NEXT_PUBLIC_SUPABASE_URL / Service-Key fehlen')
  process.exit(1)
}

let fehler = 0
function pruefe(label, ok, detail) {
  if (!ok) fehler++
  console.log(`${ok ? 'OK  ' : 'FAIL'}  ${label.padEnd(34)} ${detail}`)
}

async function orakel(ausdruck) {
  const p = `DO $x$ DECLARE r text; BEGIN SELECT (${ausdruck})::text INTO r; RAISE EXCEPTION 'ORAKEL:%', r; END $x$;`
  const res = await fetch(`${BASIS}/rest/v1/rpc/_run_sql`, {
    method: 'POST',
    headers: apiHeaders(SVC, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ p }),
  })
  const body = await res.text()
  const m = body.match(/ORAKEL:([^"\\]*)/)
  return m ? m[1] : `HTTP ${res.status}: ${body.slice(0, 200)}`
}

console.log(`\nZiel: ${BASIS.replace(/^https:\/\//, '')}\n`)

// 1) Der CHECK muss 'rueckzahlung' zulassen.
const def = await orakel(
  `SELECT pg_get_constraintdef(oid) FROM pg_constraint
     WHERE conrelid = 'public.payment_allocations'::regclass
       AND conname  = 'payment_allocations_allocation_type_check'`
)
pruefe('CHECK kennt rueckzahlung', def.includes('rueckzahlung'),
  def.startsWith('HTTP') ? `nicht pruefbar (${def})`
  : def === '<NULL>' ? 'CONSTRAINT FEHLT'
  : def.includes('rueckzahlung') ? 'vorhanden' : 'MIGRATION NICHT ANGEWENDET')

// 2) Die fuenf Altwerte muessen erhalten bleiben (Rueckwaertskompatibilitaet).
for (const w of ['vollzahlung', 'teilzahlung', 'ueberzahlung',
                 'sammelzahlung_anteil', 'gutschrift_verrechnung']) {
  pruefe(`Altwert erhalten: ${w}`, def.includes(w), def.includes(w) ? 'ja' : 'VERLOREN')
}

// 3) Kein Bestandsdatensatz darf den CHECK verletzen.
const verletzer = await orakel(
  `SELECT count(*) FROM public.payment_allocations
     WHERE allocation_type NOT IN ('vollzahlung','teilzahlung','ueberzahlung',
       'sammelzahlung_anteil','gutschrift_verrechnung','rueckzahlung')`
)
pruefe('Bestandsdaten gueltig', verletzer === '0', `${verletzer} Verletzer`)

// 4) RLS muss weiterhin aktiv sein — die Migration fasst sie nicht an,
//    ein Abweichen waere also ein Fremdeingriff.
const rls = await orakel(
  `SELECT relrowsecurity FROM pg_class WHERE oid = 'public.payment_allocations'::regclass`
)
pruefe('RLS aktiv', rls === 'true', rls === 'true' ? 'ja' : `RLS INAKTIV (${rls})`)

// 5) Beide Policies muessen stehen — insbesondere der RESTRICTIVE org_fence
//    (Mandantentrennung). Vgl. org-fence-ist-restrictive.
const fence = await orakel(
  `SELECT coalesce(string_agg(polname || '=' ||
     CASE WHEN polpermissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END, ', '), '(keine)')
     FROM pg_policy WHERE polrelid = 'public.payment_allocations'::regclass`
)
pruefe('org_fence RESTRICTIVE', fence.includes('org_fence_payment_allocations=RESTRICTIVE'), fence)
pruefe('Admin-Policy vorhanden', fence.includes('alloc_admin_all'), fence)

console.log(`\n${fehler === 0 ? 'ALLES GRUEN' : `${fehler} BEFUND(E)`}\n`)
process.exit(fehler === 0 ? 0 : 1)
