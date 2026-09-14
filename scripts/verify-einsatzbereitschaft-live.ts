#!/usr/bin/env tsx
/**
 * verify-einsatzbereitschaft-live.ts
 * ----------------------------------
 * Beantwortet EINE Frage gegen die Produktion: kann heute ein Einsatz
 * stattfinden — und wenn nein, was genau fehlt?
 *
 * ── WARUM DIESE FRAGE ZUERST KOMMT ────────────────────────────────
 * Die Kette Tour → Stop → Leistungsnachweis → Budget → Rechnung ist
 * geprueft (Bloecke 20 bis 22). Sie beginnt aber alle mit derselben
 * Voraussetzung: ein freigegebener Mitarbeiter und ein Klient mit
 * gueltigem Vertrag. Live steht dort (14.09.2026):
 *
 *     caregivers                     2
 *     davon einsatzfreigabe = true   0
 *     caregiver_qualifications       0
 *
 * Ohne Freigabe entsteht keine Tour, ohne Tour kein Nachweis, ohne
 * Nachweis keine Rechnung. Der Anfang der Wertschoepfung steht auf null,
 * und man sieht es an keiner Stelle der Oberflaeche auf einmal — die
 * Freigabepruefung gibt es nur je Mitarbeiter.
 *
 * ── WAS DIESER LAUF IST UND WAS NICHT ─────────────────────────────
 * Er ist eine BESTANDSAUFNAHME, kein Befund. Dass keine Freigabe erteilt
 * ist, ist kein Fehler der Software: die Nachweise (Fuehrungszeugnis,
 * Erste Hilfe) muss der Betrieb erfassen, und die Wege dafuer gibt es
 * (POST /api/personal/einsatzfreigabe/[caregiverId], die
 * Dokumenten-Routen). Der Lauf sagt nur, WAS fehlt — je Person, in
 * Klartext, ohne dass jemand 22 Datensaetze einzeln oeffnet.
 *
 * Er endet deshalb mit Exit 0, auch wenn nichts bereit ist. Ein rotes
 * Tor waere hier falsch: es wuerde eine Betriebsentscheidung als
 * Programmfehler ausgeben.
 *
 * ── DIESELBE LOGIK, NICHT EINE ZWEITE ─────────────────────────────
 * Geprueft wird mit `pruefeEinsatzfreigabe` und `pruefeClientFreigabe`
 * aus lib/personal/einsatzfreigabe.ts — denselben Funktionen, an denen
 * auch die Tourenplanung entscheidet. Eine Nachbildung haette
 * beantwortet, was die Nachbildung meint.
 *
 * Es wird NICHTS geschrieben.
 *
 * Aufruf:  npm run verify:einsatzbereitschaft
 */
import { readFileSync, existsSync } from 'node:fs'

for (const datei of ['.env.local', '.env']) {
  if (!existsSync(datei)) continue
  for (const zeile of readFileSync(datei, 'utf8').split('\n')) {
    const m = zeile.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

async function main(): Promise<void> {
  const { createClient } = await import('@supabase/supabase-js')
  const { pruefeEinsatzfreigabe, pruefeClientFreigabe } =
    await import('../lib/personal/einsatzfreigabe')

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) { console.log('Keine Zugangsdaten — uebersprungen.'); return }
  const sb = createClient(url, key)

  console.log('═══════════════════════════════════════════════════════════════════')
  console.log(' EINSATZBEREITSCHAFT — was fehlt, damit ein Einsatz stattfinden kann')
  console.log(` ${new Date().toISOString()}`)
  console.log(' Bestandsaufnahme, kein Befund. Es wird nichts geschrieben.')
  console.log('═══════════════════════════════════════════════════════════════════\n')

  const { data: orgs } = await sb.from('organizations').select('id, name')

  let bereiteEngel = 0
  let bereiteKunden = 0
  let engelGesamt = 0
  let kundenGesamt = 0

  for (const org of orgs ?? []) {
    const orgId = String(org.id)

    const { data: engel } = await sb
      .from('caregivers')
      .select('id, first_name, last_name')
      .eq('organization_id', orgId)
    const { data: kunden } = await sb
      .from('clients')
      .select('id, first_name, last_name')
      .eq('organization_id', orgId)

    if ((engel ?? []).length === 0 && (kunden ?? []).length === 0) continue

    console.log(`── ${org.name} ───────────────────────────────────────`)

    for (const e of engel ?? []) {
      engelGesamt++
      try {
        const p = await pruefeEinsatzfreigabe(sb, String(e.id), orgId)
        const name = `${e.first_name ?? ''} ${e.last_name ?? ''}`.trim() || String(e.id).slice(0, 8)
        if (p.freigegeben) {
          bereiteEngel++
          console.log(`  ✓ ${name.padEnd(28)} einsatzbereit`)
        } else {
          console.log(`  ✗ ${name.padEnd(28)} ${p.probleme.length} offene Punkt(e)`)
          for (const problem of p.probleme) console.log(`        · ${problem}`)
        }
      } catch (err) {
        console.log(`  ? ${String(e.id).slice(0, 8)}  nicht pruefbar: ${(err as Error).message}`)
      }
    }

    // Der Klient braucht einen gueltigen Vertrag ZUM EINSATZDATUM —
    // deshalb mit dem heutigen Tag geprueft und nicht ohne Datum.
    const heute = new Date().toISOString().slice(0, 10)
    for (const k of kunden ?? []) {
      kundenGesamt++
      try {
        const p = await pruefeClientFreigabe(sb, String(k.id), orgId, heute)
        const name = `${k.first_name ?? ''} ${k.last_name ?? ''}`.trim() || String(k.id).slice(0, 8)
        if (p.freigegeben) {
          bereiteKunden++
          console.log(`  ✓ ${name.padEnd(28)} betreubar`)
        } else {
          console.log(`  ✗ ${name.padEnd(28)} ${p.probleme.length} offene Punkt(e)`)
          for (const problem of p.probleme) console.log(`        · ${problem}`)
        }
      } catch (err) {
        console.log(`  ? ${String(k.id).slice(0, 8)}  nicht pruefbar: ${(err as Error).message}`)
      }
    }
    console.log()
  }

  console.log('═══════════════════════════════════════════════════════════════════')
  console.log(` Betreuungskraefte einsatzbereit : ${bereiteEngel} von ${engelGesamt}`)
  console.log(` Klienten betreubar              : ${bereiteKunden} von ${kundenGesamt}`)
  const paare = Math.min(bereiteEngel, bereiteKunden)
  if (paare > 0) {
    console.log(` → Ein Einsatz ist moeglich (${paare} Paarung(en) denkbar).`)
  } else {
    console.log(' → Heute kann KEIN Einsatz stattfinden. Die Kette Tour → Nachweis →')
    console.log('   Rechnung beginnt hier; alles dahinter bleibt ohne Wirkung.')
    console.log('   Die offenen Punkte oben sind Erfassungsarbeit, kein Programmfehler.')
  }
  console.log('═══════════════════════════════════════════════════════════════════')
}

main().catch(err => { console.error(err); process.exit(1) })
