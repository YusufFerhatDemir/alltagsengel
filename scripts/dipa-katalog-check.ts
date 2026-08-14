#!/usr/bin/env tsx
// ═══════════════════════════════════════════════════════════════
// dipa-katalog-check — Dauerkontrolle für den Anforderungskatalog
//
//   npm run dipa:katalog          Bericht ausgeben
//   npm run dipa:katalog -- --check   zusätzlich mit Exit-Code 1 bei Befund
//
// WOZU: Ein Nachweis ist nur so viel wert wie die Datei, auf die er zeigt.
// Wird eine Datei umbenannt oder gelöscht, bleibt der Katalogeintrag stehen
// und behauptet weiter eine Erfüllung, die niemand mehr belegen kann. Genau
// dieses stille Verrotten fängt dieses Skript ab — dasselbe Muster wie
// scripts/schema-drift-check.mjs für die Datenbank.
//
// Zusätzlich macht es sichtbar, was die eigentliche Wahrheit des Katalogs
// ist: wie viele Anforderungen noch nie gegen den Originaltext geprüft
// wurden (AK-REG-01). Diese Zahl darf nicht in Vergessenheit geraten.
// ═══════════════════════════════════════════════════════════════

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  ANFORDERUNGSKATALOG, KATEGORIE_LABELS, KLASSE_LABELS, katalogFortschritt,
  katalogNachKlasse, internOffen, STAND_LABELS,
  type Bearbeitungsklasse,
} from '../lib/coach/anforderungskatalog'

const nurPruefen = process.argv.includes('--check')
const wurzel = resolve(import.meta.dirname, '..')

let befunde = 0
const meldung = (text: string) => { console.log(text) }

meldung('')
meldung('═══ DiPA-Anforderungskatalog ═══════════════════════════════')
meldung('')

// ── 1. Tote Nachweise ────────────────────────────────────────────────
const tote: Array<{ id: string; datei: string }> = []
for (const eintrag of ANFORDERUNGSKATALOG) {
  for (const datei of eintrag.nachweisDateien) {
    if (!existsSync(resolve(wurzel, datei))) tote.push({ id: eintrag.id, datei })
  }
}

if (tote.length === 0) {
  const anzahl = ANFORDERUNGSKATALOG.reduce((s, e) => s + e.nachweisDateien.length, 0)
  meldung(`✓ Nachweise: alle ${anzahl} verwiesenen Dateien existieren`)
} else {
  befunde += tote.length
  meldung(`✗ Nachweise: ${tote.length} Verweis(e) zeigen ins Leere`)
  for (const t of tote) meldung(`    ${t.id}: ${t.datei}`)
}

// ── 2. Einträge, die als erfüllt gelten, aber nichts belegen ─────────
const ohneNachweis = ANFORDERUNGSKATALOG.filter(
  e => e.stand === 'erfuellt' && e.nachweisDateien.length === 0
)
if (ohneNachweis.length === 0) {
  meldung('✓ Belege: jeder erfüllte Eintrag nennt mindestens eine Datei')
} else {
  befunde += ohneNachweis.length
  meldung(`✗ Belege: ${ohneNachweis.length} erfüllte(r) Eintrag/Einträge ohne Nachweisdatei`)
  for (const e of ohneNachweis) meldung(`    ${e.id}`)
}

// ── 3. Doppelte Kennungen ────────────────────────────────────────────
const gesehen = new Set<string>()
const doppelte = ANFORDERUNGSKATALOG.filter(e => {
  if (gesehen.has(e.id)) return true
  gesehen.add(e.id)
  return false
})
if (doppelte.length > 0) {
  befunde += doppelte.length
  meldung(`✗ Kennungen: ${doppelte.map(e => e.id).join(', ')} doppelt vergeben`)
}

// ── 4. Stand ─────────────────────────────────────────────────────────
const fortschritt = katalogFortschritt()
meldung('')
meldung('── Erfüllungsstand ─────────────────────────────────────────')
meldung(`   Anforderungen gesamt:            ${fortschritt.gesamt}`)
meldung(`   erfüllt:                         ${fortschritt.erfuellt}`)
meldung(`   in Arbeit:                       ${fortschritt.inArbeit}`)
meldung(`   offen:                           ${fortschritt.offen}`)
meldung('')
meldung('── Wer kann was erledigen ──────────────────────────────────')
const klassen = katalogNachKlasse()
for (const klasse of ['A', 'B', 'C', 'D', 'E'] as Bearbeitungsklasse[]) {
  const k = klassen[klasse]
  meldung(`   ${klasse} ${KLASSE_LABELS[klasse].padEnd(32)} ${String(k.gesamt).padStart(2)} gesamt, ${k.offen} offen`)
}

const offenIntern = internOffen()
meldung('')
if (offenIntern.length === 0) {
  meldung('✓ Intern (A/B/C) ist nichts mehr offen.')
} else {
  meldung(`── Intern noch offen (${offenIntern.length}) ──────────────────────────────`)
  for (const e of offenIntern) {
    meldung(`   ${e.id.padEnd(12)} [${e.klasse}] ${STAND_LABELS[e.stand]} — ${KATEGORIE_LABELS[e.kategorie]}`)
  }
}

// ── 5. Ungeprüfte Anforderungstexte (AK-REG-01) ──────────────────────
meldung('')
meldung('── Anforderungstexte gegen das Original geprüft ────────────')
meldung(`   geprüft:    ${fortschritt.gesamt - fortschritt.ungeprueft} von ${fortschritt.gesamt}`)
meldung(`   ungeprüft:  ${fortschritt.ungeprueft}`)
meldung('')
meldung('   Solange ein Anforderungstext nicht gegen das Originaldokument')
meldung('   geprüft ist, zählt der Eintrag in der Quote NICHT als erfüllt.')
meldung(`   Belastbare Quote: ${Math.round(fortschritt.quote * 100)} %`)

meldung('')
if (befunde === 0) {
  meldung('═══ Ergebnis: keine Befunde ════════════════════════════════')
} else {
  meldung(`═══ Ergebnis: ${befunde} Befund(e) ═══════════════════════════════════`)
}
meldung('')

if (nurPruefen && befunde > 0) process.exit(1)
