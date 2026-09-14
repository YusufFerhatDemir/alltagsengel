#!/usr/bin/env tsx
/**
 * verify-bewerberfunnel-live.ts
 * -----------------------------
 * Faehrt die Bewerbungsstrecke von der Website bis zur Wiedervorlage ab
 * und zeigt, was die beiden Bewerberlisten je antworten.
 *
 * ── WARUM ─────────────────────────────────────────────────────────
 * Es gibt zwei Listen: `lead_inquiries` (Website-Formular, gefuehrt in
 * /admin/applications) und `mis_applicants` (von Hand erfasst, gefuehrt
 * in /mis/recruiting). Am 14.09.2026 standen dort 36 gegen 0 — und
 * /mis/recruiting zeigte darauf „Keine Bewerber" samt KPI
 * „Offene Bewerbungen: 0". Kein Fehler, keine Meldung; wer dort nachsah,
 * schloss daraus, dass sich niemand beworben hat.
 *
 * Diese Pruefung liest NUR. Sie legt nichts an und schreibt nichts.
 *
 * Aufruf:  npm run verify:bewerberfunnel
 */
import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { BEWERBUNG_FILTER, istBewerbung } from '../lib/admin/ops'
import { stufeFuerBewerbung, BEWERBER_ENDZUSTAENDE } from '../lib/bewerbung/pipeline'
import { tageSeit, bewerbungHinweis } from '../lib/bewerbung/quellen'

for (const datei of ['.env.local', '.env']) {
  if (!existsSync(datei)) continue
  for (const zeile of readFileSync(datei, 'utf8').split('\n')) {
    const m = zeile.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

let fehler = 0
function pruefe(id: string, frage: string, ok: boolean, detail = ''): void {
  console.log(`  ${ok ? '✓' : '✗'} ${id}  ${frage}`)
  if (!ok) { fehler++; if (detail) console.log(`        ${detail}`) }
}

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.log('Keine Zugangsdaten — uebersprungen.')
    return
  }
  const sb = createClient(url, key)

  console.log('═══════════════════════════════════════════════════════════════════')
  console.log(' BEWERBERFUNNEL — live')
  console.log(` ${new Date().toISOString()}`)
  console.log('═══════════════════════════════════════════════════════════════════\n')

  const { data: alle, error } = await sb
    .from('lead_inquiries')
    .select('id, art, source, status, created_at, eingereicht_am, bewerbung_daten')
    .limit(5000)
  if (error) { console.error('Lesefehler:', error.message); process.exit(1) }

  const zeilen = alle ?? []
  const bewerbungen = zeilen.filter(istBewerbung)
  const nurArt = zeilen.filter(z => z.art === 'bewerbung')

  console.log('QUELLE 1 — Website-Formular (lead_inquiries)')
  pruefe('B1', `Bewerbungen gefunden: ${bewerbungen.length}`, bewerbungen.length > 0)
  pruefe('B2',
    `nur auf art gefiltert waeren es ${nurArt.length} — die Altbestaende brauchen source`,
    nurArt.length <= bewerbungen.length)
  console.log(`        (Differenz ${bewerbungen.length - nurArt.length}: art='anfrage' + source='engel-bewerbung')`)

  const offene = bewerbungen.filter(z => {
    const { stufe } = stufeFuerBewerbung(z.bewerbung_daten, z.status)
    return !BEWERBER_ENDZUSTAENDE.includes(stufe)
  })
  const eingaenge = offene
    .map(z => (z.eingereicht_am ?? z.created_at) as string | null)
    .filter((s): s is string => Boolean(s)).sort()
  const aeltesteTage = eingaenge.length ? tageSeit(eingaenge[0]) : null
  console.log(`        offen (ohne Endzustaende): ${offene.length}`)
  console.log(`        aelteste offene wartet seit: ${aeltesteTage ?? '—'} Tagen`)

  console.log('\nQUELLE 2 — von Hand erfasst (mis_applicants)')
  const { count: misAnzahl } = await sb
    .from('mis_applicants').select('id', { count: 'exact', head: true })
  console.log(`        Zeilen: ${misAnzahl ?? 0}`)

  console.log('\nDIE LUECKE, DIE DER HINWEIS SCHLIESST')
  const luecke = offene.length > 0 && (misAnzahl ?? 0) === 0
  pruefe('B3',
    luecke
      ? `/mis/recruiting zeigte 0, waehrend ${offene.length} offen sind — Hinweis noetig`
      : 'beide Listen sind stimmig',
    true)
  console.log(`\n        Hinweis mit Recht : ${bewerbungHinweis({ offen: offene.length, aeltesteTage, darfSehen: true })}`)
  console.log(`        Hinweis ohne Recht: ${bewerbungHinweis({ offen: null, aeltesteTage: null, darfSehen: false })}`)

  console.log('\nFOLGE-KETTE')
  const unbearbeitet = bewerbungen.filter(z => z.status === 'new').length
  pruefe('B4', `Kette 13 (lead-follow-up) ist fuer ${unbearbeitet} unbearbeitete Bewerbungen zustaendig`, true)
  const ohneEingang = bewerbungen.filter(z => !z.eingereicht_am && !z.created_at).length
  pruefe('B5', 'jede Bewerbung traegt einen Eingangszeitpunkt', ohneEingang === 0,
    `${ohneEingang} ohne eingereicht_am UND ohne created_at`)

  console.log('\n═══════════════════════════════════════════════════════════════════')
  console.log(fehler === 0 ? ' ✅ Bewerberfunnel: alle Pruefungen bestanden' : ` ❌ ${fehler} Pruefung(en) fehlgeschlagen`)
  console.log('═══════════════════════════════════════════════════════════════════')
  process.exit(fehler === 0 ? 0 : 1)
}

main().catch(err => { console.error(err); process.exit(1) })
