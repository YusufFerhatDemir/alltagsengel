/**
 * Phase 8.4 Track 1/2/9 — Live-Gegenprobe des Pilot Control Centers.
 *
 * Ruft die PRODUKTIVE Auswertungslogik (control-center.ts, pilot-phasen.ts,
 * pilot-kandidat.ts, camt-pilot.ts) gegen die ECHTE Datenbank auf und druckt,
 * was `/admin/pilot` heute anzeigen wuerde.
 *
 * REIN LESEND. Keines der aufgerufenen Module exportiert einen Schreibpfad;
 * dieses Skript ruft ausschliesslich `ermittle*`/`pruefe*`-Funktionen auf.
 * Es erzeugt KEIN Token, versendet NICHTS, bucht NICHTS.
 *
 * Exit 0 = jede der 14 Kategorien (5 Bereiche + 9 Phasen) hat aufgeloest,
 * Exit 1 = mindestens eine Kategorie ist 'ungeprueft'/'BLOCKED' wegen eines
 *          Lesefehlers.
 *
 * Aufruf: npx tsx scripts/verify-pilot-control-center-live.ts [orgId]
 */
import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { ermittleMoneyPath } from '../lib/pilot/control-center'
import { ermittlePilotPhasen } from '../lib/pilot/pilot-phasen'
import { ermittlePilotKandidat } from '../lib/pilot/pilot-kandidat'
import { PILOT_MODUS, PILOT_QUELLE } from '../lib/pilot/camt-pilot'
import { camtImportModus } from '../lib/billing/camt/camt-modus'
import { DEFAULT_ORG_ID } from '../lib/organizations/types'

for (const datei of ['.env.local', '.env']) {
  if (!existsSync(datei)) continue
  for (const zeile of readFileSync(datei, 'utf8').split('\n')) {
    const m = zeile.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY werden benoetigt.')
  process.exit(1)
}

const orgId = process.argv[2] || DEFAULT_ORG_ID
const admin = createClient(URL_, KEY, { auth: { persistSession: false } })

let offen = 0

async function main() {
  console.log(`\nPilot Control Center — Live-Gegenprobe (org ${orgId})\n`)

  // ── 5 Bereiche ───────────────────────────────────────────────────────────
  const mp = await ermittleMoneyPath(admin, orgId)
  console.log('── Money-Path-Bereiche (5) ──')
  for (const b of mp.bereiche) {
    const schlecht = b.ampel === 'ungeprueft'
    if (schlecht) offen++
    console.log(` ${schlecht ? 'OFFEN' : ' OK  '} ${b.id.padEnd(9)} ${b.ampel.padEnd(11)} ${b.begruendung}`)
    for (const k of b.kennzahlen) {
      console.log(`         · ${k.label.padEnd(30)} ${k.wert === null ? 'NICHT MESSBAR' : k.wert}`)
    }
  }
  if (mp.hinweise.length) {
    console.log('\n  Hinweise (Money Path):')
    for (const h of mp.hinweise) console.log(`   ! ${h}`)
  }

  // ── 9 Phasen ─────────────────────────────────────────────────────────────
  const ph = await ermittlePilotPhasen(admin, { organizationId: orgId })
  console.log('\n── Erstbetriebs-Phasen (9) ──')
  for (const p of ph.phasen) {
    const schlecht = p.status === 'BLOCKED'
    if (schlecht) offen++
    console.log(` ${schlecht ? 'OFFEN' : ' OK  '} ${String(p.nr).padStart(2)} ${p.id.padEnd(15)} ${p.status.padEnd(12)} ${p.begruendung}`)
    if (p.naechsterSchritt) console.log(`         → ${p.naechsterSchritt}`)
  }
  console.log(`\n  Fortschritt: ${ph.fortschritt.verifiziert}/${ph.fortschritt.gesamt} (${ph.fortschritt.prozent}%)`)
  console.log(`  aktuelle Phase: ${ph.aktuellePhase?.id ?? '—'}`)
  console.log(`  offene Versandsperren: ${ph.versandSperrenDetails === null ? 'NICHT LESBAR' : ph.versandSperrenDetails.length}`)
  if (ph.hinweise.length) {
    console.log('\n  Hinweise (Phasen):')
    for (const h of ph.hinweise) console.log(`   ! ${h}`)
  }

  // ── Kandidat ─────────────────────────────────────────────────────────────
  const k = await ermittlePilotKandidat(admin, orgId)
  console.log('\n── Pilot-Kandidat ──')
  console.log(`  Zustand:        ${k.zustand}`)
  console.log(`  Begruendung:    ${k.begruendung}`)
  console.log(`  actionRequired: ${k.actionRequired ?? '—'}`)
  console.log(`  versandbereit:  ${k.versandbereit === null ? 'NICHT MESSBAR' : k.versandbereit}`)
  console.log(`  ohneEmpfaenger: ${k.ohneEmpfaenger === null ? 'NICHT MESSBAR' : k.ohneEmpfaenger}`)
  console.log(`  Freigabe-Env:   ${k.freigabe.freigegeben ? 'GESETZT' : 'NICHT GESETZT'} — ${k.freigabe.grund}`)
  if (k.kandidat) {
    console.log(`  Rechnung:       ${k.kandidat.invoiceNumber} / ${k.kandidat.invoiceId}`)
    console.log(`  Urteil:         ${k.kandidat.urteil}`)
  }
  if (k.zustand === 'NICHT_MESSBAR') offen++
  if (k.hinweise.length) for (const h of k.hinweise) console.log(`   ! ${h}`)

  // ── CAMT — Betriebsart der ECHTEN Umgebung ───────────────────────────────
  const umg = camtImportModus(process.env as Record<string, string | undefined>)
  console.log('\n── CAMT-Pilot ──')
  console.log(`  CAMT_IMPORT_MODE gesetzt: ${process.env.CAMT_IMPORT_MODE ? 'JA' : 'nein'}`)
  console.log(`  Umgebungsmodus:           ${umg.modus} (buchend: ${umg.buchend})`)
  console.log(`  Umgebungsgrund:           ${umg.grund}`)
  console.log(`  PILOT_MODUS:              ${PILOT_MODUS}`)
  console.log(`  PILOT_QUELLE eingefroren: ${Object.isFrozen(PILOT_QUELLE) ? 'JA' : 'NEIN'}`)
  if (umg.buchend) { console.log('  OFFEN: die echte Umgebung wuerde buchen.'); offen++ }
  if (!Object.isFrozen(PILOT_QUELLE)) { console.log('  OFFEN: PILOT_QUELLE ist nicht eingefroren.'); offen++ }

  console.log(`\n${offen === 0 ? 'Alle 14 Kategorien aufgeloest.' : `${offen} Kategorie(n) nicht aufgeloest.`}`)
  process.exit(offen === 0 ? 0 : 1)
}

main().catch(err => {
  console.error('FEHLER:', err)
  process.exit(1)
})
