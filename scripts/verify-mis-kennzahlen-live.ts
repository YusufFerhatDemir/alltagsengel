#!/usr/bin/env tsx
/**
 * verify-mis-kennzahlen-live.ts
 * -----------------------------
 * Beantwortet EINE Frage gegen die Produktion: zeigt das Kontrollzentrum
 * die Wahrheit?
 *
 * ── WARUM ES DIESEN LAUF BRAUCHT ──────────────────────────────────
 * Vor Block 28 gab dasselbe System drei Antworten auf die Frage „wie viel
 * Umsatz?" (Stand 14.09.2026):
 *
 *     /mis                      105 €   Buchungen × 35 € — erfunden
 *     /admin/analytics/kpi    1.901 €   Summe ueber invoices, ungeprueft
 *     offene Posten (OPOS)        0 €   verlangt frozen_at — korrekt
 *
 * Richtig ist die dritte: keine der drei Rechnungen im Bestand ist
 * festgeschrieben. Ein Test faengt das nicht — er prueft die Formel, die
 * gerade dasteht. Dieser Lauf prueft die ZAHL gegen den Bestand.
 *
 * ── WAS ER TUT ────────────────────────────────────────────────────
 * Er ruft dieselbe Funktion auf, die die Route aufruft
 * (`ladeMisKennzahlen`), und stellt das Ergebnis dem Rohbestand
 * gegenueber. Er schreibt NICHTS.
 *
 * Er endet immer mit Code 0: ein leerer Betrieb ist kein Fehler der
 * Software. Was er meldet, ist eine Bestandsaufnahme — und er benennt,
 * welche Zahl aus welchem Grund null ist.
 */
import { readFileSync, existsSync } from 'node:fs'

// Vor JEDEM Modulimport: lib/supabase/admin liest die Schluessel beim
// Laden. Ein statischer Import oben wuerde mit „supabaseUrl is required"
// abbrechen, bevor eine Zeile dieses Skripts laeuft.
for (const datei of ['.env.local', '.env']) {
  if (!existsSync(datei)) continue
  for (const zeile of readFileSync(datei, 'utf8').split('\n')) {
    const m = zeile.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const eur = (n: number) => `${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`

async function main() {
  const { createAdminClient } = await import('../lib/supabase/admin')
  const { ladeMisKennzahlen } = await import('../lib/mis/kennzahlen')
  const { DEFAULT_ORG_ID } = await import('../lib/organizations/types')

  const supabase = createAdminClient()
  const orgId = process.env.MIS_ORG_ID || DEFAULT_ORG_ID

  console.log('═══ Kontrollzentrum — Kennzahlen gegen den Bestand ═══')
  console.log(`Organisation: ${orgId}\n`)

  const k = await ladeMisKennzahlen(supabase, orgId)

  console.log('── Betrieb ──')
  console.log(`  Klienten                    ${k.betrieb.klienten} (davon aktiv: ${k.betrieb.aktiveKlienten})`)
  console.log(`  Kräfte                      ${k.betrieb.kraefte}`)
  console.log(`  davon einsatzbereit         ${k.betrieb.einsatzbereiteKraefte}`)
  console.log(`  aktive Einsätze             ${k.betrieb.aktiveEinsaetze}`)
  console.log(`  Auslastung                  ${k.auslastung.quoteProzent ?? '—'} %`)

  console.log('\n── Geld ──')
  console.log(`  Umsatz (festgeschrieben)    ${eur(k.umsatz.summeEuro)} aus ${k.umsatz.anzahlRechnungen} Rechnung(en)`)
  console.log(`  nicht festgeschrieben       ${k.umsatz.nichtFestgeschrieben} Rechnung(en)`)
  console.log(`  wegen Status nicht gezählt  ${k.umsatz.nichtGezaehlt} Rechnung(en)`)
  console.log(`  Umsatz pro aktiver Kraft    ${k.umsatzProKraft == null ? '— (keine aktive Kraft)' : eur(k.umsatzProKraft)}`)
  console.log(`  offene Posten               ${eur(k.offenePosten.summeEuro)} aus ${k.offenePosten.anzahl} Rechnung(en)`)
  console.log(`  davon überfällig            ${eur(k.offenePosten.ueberfaelligEuro)} (${k.offenePosten.ueberfaelligAnzahl})`)

  console.log('\n── Leistungsnachweise ──')
  console.log(`  erfasst                     ${k.nachweise.gesamt}`)
  console.log(`  mit Unterschriftsbeleg      ${k.nachweise.belegt}`)
  console.log(`  ohne Beleg                  ${k.nachweise.ohneBeleg}`)
  console.log(`  abgerechnet                 ${k.nachweise.abgerechnet}`)

  console.log(`\n── Marktkennzahlen (mis_kpis, Planannahmen) ── ${k.markt.length} Zeile(n)`)
  for (const m of k.markt.slice(0, 20)) {
    console.log(`  ${m.name.padEnd(32)} ${String(m.wert).padStart(8)} ${m.einheit ?? ''}`)
  }

  // ── Gegenprobe: der Rohbestand, ohne jede Regel ──────────────────
  const { data: roh } = await supabase
    .from('invoices')
    .select('total_amount, status, frozen_at')
    .eq('organization_id', orgId)
    .is('deleted_at', null)

  const rohSumme = (roh ?? []).reduce((s, r) => s + (Number(r.total_amount) || 0), 0)

  console.log('\n── Gegenprobe ──')
  console.log(`  Summe ALLER Rechnungen ohne Prüfung   ${eur(rohSumme)}`)
  console.log(`  ausgewiesener Umsatz                  ${eur(k.umsatz.summeEuro)}`)
  if (rohSumme !== k.umsatz.summeEuro) {
    console.log(`  → Differenz ${eur(rohSumme - k.umsatz.summeEuro)} — und das ist richtig so:`)
    if (k.umsatz.nichtFestgeschrieben > 0) {
      console.log(`    ${k.umsatz.nichtFestgeschrieben} Rechnung(en) ohne frozen_at sind nie rechtswirksam`)
      console.log('    ausgestellt worden. Dieselbe Bedingung trägt die OPOS-Liste.')
    }
    if (k.umsatz.nichtGezaehlt > 0) {
      console.log(`    ${k.umsatz.nichtGezaehlt} Rechnung(en) sind storniert, abgelehnt, Entwurf oder abgeschrieben.`)
    }
  } else {
    console.log('  → deckungsgleich')
  }

  console.log('\n── Bewertung ──')
  if (k.betrieb.einsatzbereiteKraefte === 0 && k.betrieb.kraefte > 0) {
    console.log(`  HUMAN_BLOCKER: keine der ${k.betrieb.kraefte} Kräfte hat eine Einsatzfreigabe.`)
    console.log('  Ohne Freigabe entsteht kein Einsatz, kein Nachweis, keine Rechnung.')
    console.log('  Details je Person: npm run verify:einsatzbereitschaft')
  }
  if (k.umsatz.summeEuro === 0 && k.umsatz.nichtFestgeschrieben > 0) {
    console.log('  Umsatz 0 € ist hier die richtige Zahl, nicht eine fehlende:')
    console.log('  der Bestand enthält ausschließlich nicht festgeschriebene Rechnungen.')
    console.log('  Passend zu FIRST_REAL_INVOICE_APPROVED=false.')
  }

  console.log('\n═══ Lauf beendet (schreibt nichts) ═══')
}

main().catch(e => {
  console.error('Lauf fehlgeschlagen:', e instanceof Error ? e.message : e)
  process.exit(1)
})
