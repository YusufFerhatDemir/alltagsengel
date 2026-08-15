#!/usr/bin/env tsx
// ═══════════════════════════════════════════════════════════════
// dipa-compliance-check — Antragsreife und Dokument-Aktualität
//
//   npm run dipa:compliance              Bericht ausgeben
//   npm run dipa:compliance -- --check   zusätzlich Exit-Code 1 bei veraltetem
//                                        kritischem Dokument
//
// UNTERSCHIED zu scripts/dipa-katalog-check.ts: jenes Skript prüft die
// STRUKTUR des Katalogs (tote Nachweis-Links, doppelte Kennungen). Dieses
// Skript zieht zwei Auswertungen, die bis 15.08.2026 im Code standen, aber
// nie aufgerufen wurden (`antragsBlocker()`, `ZEITKLASSE`), und prüft
// zusätzlich, ob die externen Vorbereitungsdokumente (DSFA, AVV-Dossier,
// ISMS-Scope, TR-03161-Checkliste, ...) noch mit einem aktuellen
// „Stand:"-Datum versehen sind.
// ═══════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { antragsreife, formatiereBlocker, pruefeKritischeDokumente } from '../lib/coach/dipa-compliance'
import { ZEITKLASSE_LABELS } from '../lib/coach/anforderungskatalog'

const nurPruefen = process.argv.includes('--check')
const wurzel = resolve(import.meta.dirname, '..')
const heuteIso = new Date().toISOString().slice(0, 10)

let befunde = 0
const meldung = (text: string) => { console.log(text) }

meldung('')
meldung('═══ DiPA-Compliance ═══════════════════════════════════════')
meldung('')

// ── 1. Antragsreife ──────────────────────────────────────────────────
const bericht = antragsreife()
meldung('── Antragsreife (Zeitklasse A — muss vor Antragstellung vorliegen) ──')
if (bericht.bereit) {
  meldung('✓ Kein offener Zeitklasse-A-Punkt.')
} else {
  meldung(`✗ ${bericht.blocker.length} offene(r) Zeitklasse-A-Punkt(e) — ${bericht.blockerIntern} intern (Klasse A–C), ${bericht.blockerExtern} extern (Klasse D–E)`)
  for (const e of bericht.blocker) meldung(`    ${formatiereBlocker(e)}`)
  // Kein Befund im Sinne des Exit-Codes: offene externe Beauftragungen sind
  // der erwartete Zustand vor Abschluss der Prüfstellenverfahren, keine
  // Regression. Nur veraltete Dokumente (Abschnitt 2) lösen --check aus.
}
meldung('')
meldung(`   Katalog gesamt: ${bericht.fortschritt.erfuellt}/${bericht.fortschritt.gesamt} erfüllt, belastbare Quote ${Math.round(bericht.fortschritt.quote * 100)} %`)

// ── 2. Dokument-Aktualität ───────────────────────────────────────────
meldung('')
meldung('── Kritische Vorbereitungsdokumente ─────────────────────────')
const dateiLeser = (pfad: string): string | null => {
  try {
    return readFileSync(resolve(wurzel, pfad), 'utf-8')
  } catch {
    return null
  }
}
const dokBefunde = pruefeKritischeDokumente(dateiLeser, heuteIso)
for (const d of dokBefunde) {
  if (!d.pruefung.gefunden) {
    befunde += 1
    meldung(`✗ ${d.pfad} — kein "**Stand:**"-Datum gefunden oder Datei fehlt (deckt ${d.deckt.join(', ')})`)
  } else if (!d.pruefung.aktuell) {
    befunde += 1
    meldung(`✗ ${d.pfad} — Stand ${d.pruefung.datum}, ${d.pruefung.tageAlt} Tage alt (Grenze ${d.maxTageAlter}) — deckt ${d.deckt.join(', ')}`)
  } else {
    meldung(`✓ ${d.pfad} — Stand ${d.pruefung.datum}, ${d.pruefung.tageAlt} Tage alt`)
  }
}

meldung('')
meldung('── Zeitklassen-Legende ──────────────────────────────────────')
for (const [klasse, label] of Object.entries(ZEITKLASSE_LABELS)) {
  meldung(`   ${klasse}: ${label}`)
}

meldung('')
if (befunde === 0) {
  meldung('═══ Ergebnis: keine Befunde ════════════════════════════════')
} else {
  meldung(`═══ Ergebnis: ${befunde} Befund(e) ═══════════════════════════════════`)
}
meldung('')

if (nurPruefen && befunde > 0) process.exit(1)
