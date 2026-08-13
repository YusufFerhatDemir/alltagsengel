/**
 * Go-Live-Status auf der Konsole — dieselbe Logik wie /admin/go-live.
 *
 * Zweck: den Status ohne Browser und ohne Admin-Login gegen die echte
 * Datenbank prüfen (Deploy-Gate, Cron, schneller Blick vom Terminal).
 *
 *   npx tsx scripts/go-live-check.ts
 *
 * Exit-Code 0, wenn kein Bereich BLOCKED ist; sonst 1. EXTERNAL zählt nicht
 * als Fehlschlag — darauf hat der Betrieb keinen Einfluss.
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { ermittleGoLiveStatus, type GoLiveStatus } from '../lib/go-live/status'
import { DEFAULT_ORG_ID } from '../lib/organizations/types'

config({ path: '.env.local' })
config({ path: '.env' })

const SYMBOL: Record<GoLiveStatus, string> = { ready: '✓ READY   ', blocked: '✕ BLOCKED ', external: '· EXTERNAL' }

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY müssen gesetzt sein.')
    process.exit(2)
  }

  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  const orgId = process.argv[2] ?? DEFAULT_ORG_ID
  const ergebnis = await ermittleGoLiveStatus(supabase, orgId)

  console.log(`\nGo-Live-Status — ${ergebnis.organisation ?? orgId} — Stand ${ergebnis.stichtag}\n`)
  for (const b of ergebnis.bereiche) {
    console.log(`${SYMBOL[b.status]}  ${b.titel}`)
    for (const p of b.pruefungen) {
      const z = p.erfuellt === true ? '✓' : p.erfuellt === false ? '✕' : '?'
      const tag = p.erfuellt === true ? '' : ` [${p.zustaendig.toUpperCase()}${p.relevanz === 'hinweis' ? '/HINWEIS' : ''}]`
      console.log(`             ${z} ${p.label}: ${p.wert}${tag}`)
    }
    if (b.status !== 'ready') console.log(`             → ${b.naechsterSchritt}`)
    console.log('')
  }

  const z = ergebnis.zusammenfassung
  console.log(`READY ${z.ready} · EXTERNAL ${z.external} · BLOCKED ${z.blocked} (von ${z.gesamt})`)
  if (ergebnis.hinweise.length > 0) {
    console.log(`\nNicht prüfbar (gilt als nicht erfüllt):`)
    for (const h of ergebnis.hinweise) console.log(`  - ${h}`)
  }
  process.exit(z.blocked > 0 ? 1 : 0)
}

main().catch(err => {
  console.error(err)
  process.exit(2)
})
