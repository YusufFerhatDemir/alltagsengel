/**
 * Faehrt den Abrechnungs-Kernpfad gegen die LIVE-Datenbank — ausschliesslich
 * lesend bzw. als dryRun. Es wird kein Lauf erstellt, keine Datei erzeugt,
 * nichts uebermittelt und kein Monatsabschluss geschrieben.
 *
 * Geprueft werden:
 *   1. PreFlight-Validierung        (nur lesend)
 *   2. Monatsabschluss              (dryRun: true — kein Schreiben)
 *   3. Versand-Guard                (muss sperren, solange Readiness rot ist)
 *
 * Aufruf: npx tsx scripts/kernpfad-dryrun.ts [YYYY-MM] [bundesland]
 */
import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { preFlightValidierung } from '../lib/abrechnung/kassenabrechnung-engine'
import { erstelleMonatsabschluss } from '../lib/abrechnung/monatsabschluss'
import { pruefeVersandbereitschaft, VersandGesperrtError } from '../lib/abrechnung/versand-guard'

for (const datei of ['.env.local', '.env']) {
  if (!existsSync(datei)) continue
  for (const zeile of readFileSync(datei, 'utf8').split('\n')) {
    const m = zeile.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const ORG = '00000000-0000-4000-8000-000460629986'
const MONAT = process.argv[2] ?? '2026-08'
const BUNDESLAND = process.argv[3] ?? 'hessen'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)!,
  { auth: { persistSession: false } },
)

async function main() {
  console.log(`\nKernpfad-Dry-Run — Org ${ORG}, Monat ${MONAT}, Bundesland ${BUNDESLAND}\n`)

  // ── 1. PreFlight ──────────────────────────────────────────────
  console.log('── 1. PreFlight-Validierung (lesend)')
  const pf = await preFlightValidierung(supabase, {
    organizationId: ORG,
    abrechnungsmonat: MONAT,
    bundesland: BUNDESLAND,
  })
  console.log(`   bestanden: ${pf.bestanden}`)
  console.log(`   Fehler: ${pf.fehler.length} · Warnungen: ${pf.warnungen.length}`)
  for (const p of pf.alle) {
    const marke = p.bestanden ? 'OK   ' : p.pflicht ? 'FEHLER' : 'WARN  '
    console.log(`   [${marke}] ${p.label}${p.details ? ` — ${p.details}` : ''}`)
  }

  // ── 2. Monatsabschluss (dryRun) ───────────────────────────────
  console.log('\n── 2. Monatsabschluss (dryRun — schreibt nicht)')
  try {
    const ma = await erstelleMonatsabschluss(MONAT, supabase, {
      bundesland: BUNDESLAND,
      organizationId: ORG,
      dryRun: true,
    })
    console.log(`   ${JSON.stringify({
      monat: ma.monat,
      zeitraum: ma.zeitraum,
      verordnungen_geprueft: ma.verordnungen_geprueft,
      positionen_abrechenbar: ma.positionen_abrechenbar,
      positionen_blockiert: ma.positionen_blockiert,
      gesamt_cent: ma.gesamt_cent,
      gruppen: ma.gruppen.length,
      warnungen: ma.warnungen.length,
      closings_geschrieben: ma.closings_geschrieben,
    })}`)
    for (const w of ma.warnungen) console.log(`   WARNUNG ${JSON.stringify(w)}`)
  } catch (err) {
    console.log(`   BLOCKIERT: ${(err as Error).message}`)
  }

  // ── 3. Versand-Guard ──────────────────────────────────────────
  console.log('\n── 3. Versand-Guard (muss sperren, solange Readiness rot ist)')
  try {
    await pruefeVersandbereitschaft(supabase, ORG)
    console.log('   OFFEN — der Guard laesst den Versand zu.')
  } catch (err) {
    if (err instanceof VersandGesperrtError) {
      console.log(`   KORREKT GESPERRT: ${err.message.slice(0, 400)}`)
    } else {
      console.log(`   Unerwarteter Fehler: ${(err as Error).message}`)
    }
  }

  console.log()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
