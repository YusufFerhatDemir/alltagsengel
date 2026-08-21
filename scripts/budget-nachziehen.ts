#!/usr/bin/env tsx
/**
 * budget-nachziehen.ts — fehlende Budgetansprüche für Bestandskunden ergänzen
 *
 * ── Befund (live 14.08.2026, Agent 2 / E2E-Nutzerworkflow, Schritt 3) ──────
 * Zwei von vier Kunden mit Pflegegrad 2 hatten combined_annual_amount = 0
 * statt 3.539 € — der Anspruch auf Verhinderungs-/Kurzzeitpflege (§ 42a
 * SGB XI) fehlte vollständig:
 *
 *   AE-TEST-0001  PG2   §45b 1.572 €   §42a     0 €   ← fehlt
 *   AE-TEST-0002  PG3   §45b 1.572 €   §42a 3.539 €
 *   AE-TEST-0003  PG2   §45b 1.572 €   §42a     0 €   ← fehlt
 *   TEST-2026-001 PG3   §45b 1.572 €   §42a 3.539 €
 *
 * URSACHE: erstelleInitialBudgets() legt den §42a-Anspruch korrekt an, wird
 * aber nur bei der Kundenanlage und bei einer Pflegegrad-Änderung gerufen.
 * Kunden, die vor dieser Logik angelegt wurden, bekommen ihn nie — es gibt
 * keinen Pfad, der bestehende Budgets nachbewertet. Sichtbar wird das erst,
 * wenn eine Verhinderungspflege abgerechnet werden soll: die Budgetprüfung
 * findet 0 € Anspruch und lehnt ab.
 *
 * Dieses Skript ruft genau dieselbe produktive Funktion für jeden aktiven
 * Kunden mit Pflegegrad ≥ 1. Sie ist idempotent: vorhandene Werte werden
 * NICHT überschrieben, nur fehlende ergänzt. Ein zweiter Lauf ändert nichts.
 *
 * Aufruf:
 *   npx tsx scripts/budget-nachziehen.ts              — nur berichten (Default)
 *   npx tsx scripts/budget-nachziehen.ts --anwenden   — Lücken schliessen
 *   npx tsx scripts/budget-nachziehen.ts --org <uuid> — nur eine Organisation
 *
 * Ohne --anwenden wird NICHTS geschrieben. Das ist Absicht: das Skript soll
 * sich gefahrlos zur Kontrolle laufen lassen.
 */
import { readFileSync, existsSync } from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { erstelleInitialBudgets } from '../lib/budget/auto-budget'
import { budgetVersionFuerJahr } from '../lib/config/budget-constants'
import { berlinParts } from '../lib/utils/timezone'
import { pflegegradVon } from '../lib/clients/pflegegrad'

for (const datei of ['.env.local', '.env']) {
  if (!existsSync(datei)) continue
  for (const zeile of readFileSync(datei, 'utf8').split('\n')) {
    const m = zeile.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)
if (!URL_ || !KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY werden benötigt.')
  process.exit(1)
}

const anwenden = process.argv.includes('--anwenden')
const orgIndex = process.argv.indexOf('--org')
const nurOrg = orgIndex >= 0 ? process.argv[orgIndex + 1] : undefined

const ROT = '\x1b[31m', GRUEN = '\x1b[32m', GELB = '\x1b[33m', GRAU = '\x1b[90m', AUS = '\x1b[0m'

async function main() {
  const supabase: SupabaseClient = createClient(URL_!, KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const jahr = parseInt(berlinParts(new Date()).year, 10)
  const version = budgetVersionFuerJahr(jahr)

  let query = supabase
    .from('clients')
    .select('id, customer_number, first_name, last_name, care_level, pflegegrad, care_level_since, organization_id')
    .eq('status', 'active')
  if (nurOrg) query = query.eq('organization_id', nurOrg)

  const { data: clients, error } = await query
  if (error) {
    console.error(`Kunden nicht lesbar: ${error.message}`)
    process.exit(1)
  }

  const { data: budgets, error: bErr } = await supabase
    .from('client_budgets')
    .select('client_id, annual_amount, monthly_amount, combined_annual_amount')
    .eq('year', jahr)
  if (bErr) {
    console.error(`Budgets nicht lesbar: ${bErr.message}`)
    process.exit(1)
  }

  console.log(
    `\nBudgetjahr ${jahr} — §45b ${version.entlastungMonatlich} €/Monat ` +
    `(${version.entlastungJaehrlich} €/Jahr), §42a ${version.vpKzpKombiniert} € ` +
    `ab PG ${version.minPflegegradVpKzp}\n`,
  )
  console.log(anwenden
    ? `${GELB}Modus: ANWENDEN — fehlende Ansprüche werden ergänzt.${AUS}\n`
    : `${GRAU}Modus: nur Bericht. Mit --anwenden werden die Lücken geschlossen.${AUS}\n`)

  let luecken = 0, ergaenzt = 0, fehler = 0, ok = 0, ohnePg = 0

  for (const c of clients ?? []) {
    // care_level ist führend, pflegegrad ist bei Bestandskunden NULL.
    const pg = pflegegradVon(c)
    const name = `${c.customer_number ?? c.id.slice(0, 8)}`.padEnd(16)

    if (!pg || pg < 1) { ohnePg++; continue }

    const b = budgets?.find(x => x.client_id === c.id)
    const sollVp = pg >= version.minPflegegradVpKzp ? version.vpKzpKombiniert : 0
    const istVp = Number(b?.combined_annual_amount ?? 0)
    const istEntlastung = Number(b?.annual_amount ?? 0)

    const fehltVp = sollVp > 0 && istVp === 0
    const fehltEntlastung = istEntlastung === 0

    if (!b) {
      luecken++
      console.log(`${ROT}KEIN BUDGET${AUS}  ${name} PG${pg}`)
    } else if (fehltVp || fehltEntlastung) {
      luecken++
      const was = [fehltEntlastung && '§45b', fehltVp && '§42a'].filter(Boolean).join(' + ')
      console.log(`${ROT}LÜCKE${AUS}       ${name} PG${pg}  fehlt: ${was}  (ist §45b ${istEntlastung} €, §42a ${istVp} €)`)
    } else {
      ok++
      continue
    }

    if (!anwenden) continue

    // Monat des Pflegegrad-Beginns: nur relevant, wenn er im laufenden Jahr
    // liegt — sonst gilt der volle Jahresanspruch (gleiche Regel wie im
    // Pflegegrad-Endpunkt).
    const seit = c.care_level_since as string | null
    const seitJahr = seit ? parseInt(seit.slice(0, 4), 10) : jahr
    const pgMonat = seit && seitJahr === jahr ? parseInt(seit.slice(5, 7), 10) : 1

    const res = await erstelleInitialBudgets(supabase, c.id, c.organization_id, pg, pgMonat)
    if (res.fehler) {
      fehler++
      console.log(`  ${ROT}→ Fehler${AUS} ${res.fehler}`)
    } else if (res.erstellt) {
      ergaenzt++
      console.log(`  ${GRUEN}→ ergänzt${AUS}`)
    } else {
      console.log(`  ${GRAU}→ nichts zu tun${AUS}`)
    }
  }

  console.log(
    `\n${clients?.length ?? 0} aktive Kunden: ${ok} vollständig, ${luecken} mit Lücke, ` +
    `${ohnePg} ohne Pflegegrad (kein Anspruch).`,
  )
  if (anwenden) {
    console.log(`${ergaenzt} ergänzt, ${fehler} Fehler.`)
    if (fehler > 0) process.exitCode = 1
  } else if (luecken > 0) {
    console.log(`${GELB}Zum Schliessen: npx tsx scripts/budget-nachziehen.ts --anwenden${AUS}`)
    process.exitCode = 1
  }
}

main().catch(e => {
  console.error(`Abbruch: ${e instanceof Error ? e.message : String(e)}`)
  process.exitCode = 1
})
