/**
 * Fuehrt die ECHTE Readiness-Ermittlung (lib/abrechnung/readiness.ts) gegen die
 * Live-Datenbank aus und druckt jeden Punkt mit Ampel und Blocker-Klasse.
 *
 * Nur lesend. Kein Schreibzugriff, kein DDL, keine Secrets in der Ausgabe.
 *
 * Aufruf: npx tsx scripts/readiness-live.ts [organizationId]
 */
import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { ermittleReadiness } from '../lib/abrechnung/readiness'

for (const datei of ['.env.local', '.env']) {
  if (!existsSync(datei)) continue
  for (const zeile of readFileSync(datei, 'utf8').split('\n')) {
    const m = zeile.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const URL_BASIS = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)!
const ORG = process.argv[2] ?? '00000000-0000-4000-8000-000460629986'

if (!URL_BASIS || !SERVICE) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen')
  process.exit(1)
}

const supabase = createClient(URL_BASIS, SERVICE, { auth: { persistSession: false } })

const SYMBOL = { gruen: 'GRUEN', gelb: 'GELB ', rot: 'ROT  ' } as const

async function main() {
  const r = await ermittleReadiness(supabase, ORG)

  console.log(`\nReadiness — ${r.organisation ?? '(kein Name)'} / IK ${r.ik_nummer ?? '(keine)'}`)
  console.log(`Org ${r.organizationId}`)
  console.log(`Gesamt: ${r.gesamt.toUpperCase()} · Modus: ${r.modus} · versandbereit: ${r.versandbereit}\n`)

  let gruppe = ''
  for (const p of r.punkte) {
    if (p.gruppe !== gruppe) {
      gruppe = p.gruppe
      console.log(`── ${gruppe.toUpperCase()}`)
    }
    const blocker = p.blocker ? ` [${p.blocker}]` : ''
    console.log(`  ${SYMBOL[p.ampel]} ${p.label}${blocker}`)
    if (p.wert) console.log(`         Wert:    ${p.wert}`)
    if (p.hinweis) console.log(`         Hinweis: ${p.hinweis}`)
  }

  console.log(`\nZusammenfassung: ${JSON.stringify(r.zusammenfassung)}`)
  console.log(`Interne Blocker (${r.offeneBlocker.intern.length}): ${r.offeneBlocker.intern.join(' | ') || '—'}`)
  console.log(`Externe Blocker (${r.offeneBlocker.extern.length}): ${r.offeneBlocker.extern.join(' | ') || '—'}`)
  console.log(`\nBetrieb: ${JSON.stringify(r.betrieb, null, 1)}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
