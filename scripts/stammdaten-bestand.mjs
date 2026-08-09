#!/usr/bin/env node
/**
 * Zaehlt den REALEN Stammdaten-Bestand der Kassenabrechnung auf der Live-DB.
 * Nur lesend. Gibt Zeilenzahlen aus, keine Inhalte, keine Secrets.
 *
 * Aufruf: node scripts/stammdaten-bestand.mjs
 */
import { readFileSync, existsSync } from 'node:fs'

for (const datei of ['.env.local', '.env']) {
  if (!existsSync(datei)) continue
  for (const zeile of readFileSync(datei, 'utf8').split('\n')) {
    const m = zeile.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const BASIS = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!BASIS || !SERVICE) { console.error('env fehlt'); process.exit(1) }

const TABELLEN = [
  'dta_kostentraeger',
  'datenannahmestellen',
  'abrechnung_zertifikate',
  'billing_tariffs',
  'state_settings',
  'organizations',
  'abrechnungslaeufe',
  'dta_ruecklaeufer',
  'dta_ruecklaeufer_positionen',
  'dta_fehlerprotokoll',
  'dta_validierungen',
  'billing_audit_trail',
  'invoices',
  'clients',
  'service_records',
  'caregivers',
  'profiles',
  'monthly_closings',
  'ops_aufgaben',
]

async function zaehle(tabelle, filter = '') {
  const res = await fetch(`${BASIS}/rest/v1/${tabelle}?select=id${filter}`, {
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      Prefer: 'count=exact',
      Range: '0-0',
    },
  })
  if (!res.ok) return `FEHLER ${res.status}: ${(await res.text()).slice(0, 90)}`
  const bereich = res.headers.get('content-range')
  return bereich ? bereich.split('/')[1] : '?'
}

console.log('\nStammdaten-Bestand (Live)\n')
for (const t of TABELLEN) {
  console.log(`  ${t.padEnd(30)} ${await zaehle(t)}`)
}

console.log('\nDetails\n')
console.log(`  dta_kostentraeger aktiv        ${await zaehle('dta_kostentraeger', '&ist_aktiv=is.true')}`)
console.log(`  datenannahmestellen aktiv      ${await zaehle('datenannahmestellen', '&aktiv=is.true')}`)
console.log(`  billing_tariffs aktiv          ${await zaehle('billing_tariffs', '&ist_aktiv=is.true')}`)
console.log(`  state_settings ANERKANNT       ${await zaehle('state_settings', '&status=eq.ANERKANNT')}`)
console.log(`  state_settings kassenrechnung  ${await zaehle('state_settings', '&kassenrechnung_enabled=is.true')}`)
console.log()
