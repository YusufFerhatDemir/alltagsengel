#!/usr/bin/env tsx
/**
 * verify-portal-bindung.ts
 * ------------------------
 * Beantwortet EINE Frage gegen die Produktion: sieht eine Kundin im
 * Portal ausschliesslich ihre eigenen Daten — und sieht sie sie
 * ueberhaupt?
 *
 * Die Bewertung steht in lib/kunde/portal-bindung.ts und ist dort
 * getestet. Hier ist nur die Beschaffung: Tabellenliste aus dem
 * Quelltext des Portals, Policies live aus `pg_policies`.
 *
 * Er schreibt NICHTS.
 *
 * EXIT: 0 solange jede Tabelle gebunden, bewusst offen oder eine BEKANNTE
 * Luecke ist. 1 bei einem NEUEN Befund — dasselbe Verhalten wie
 * verify:mandantenzaun, damit ein wartender Migrations-Eintrag den Lauf
 * nicht dauerhaft rot faerbt und ein echter Neuzugang trotzdem auffaellt.
 *
 * Aufruf:  npm run verify:portal-bindung
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
// Nur der Typ statisch — die Werte kommen unten dynamisch, nachdem die
// Umgebungsvariablen geladen sind.
import type { PolicyZeile } from '../lib/kunde/portal-bindung'

for (const datei of ['.env.local', '.env']) {
  if (!existsSync(datei)) continue
  for (const zeile of readFileSync(datei, 'utf8').split('\n')) {
    const m = zeile.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const PORTAL = join(process.cwd(), 'app', 'kunde')

function dateienUnter(verzeichnis: string): string[] {
  const treffer: string[] = []
  for (const eintrag of readdirSync(verzeichnis)) {
    const pfad = join(verzeichnis, eintrag)
    if (statSync(pfad).isDirectory()) treffer.push(...dateienUnter(pfad))
    else if (/\.tsx?$/.test(eintrag)) treffer.push(pfad)
  }
  return treffer
}

async function main(): Promise<void> {
  const { apiHeaders, secretKey, envWert } = await import('./lib/supabase-keys.mjs')
  const { bewerteTabelle, tabellenAusQuelltext } = await import('../lib/kunde/portal-bindung')

  const gefunden = new Set<string>()
  for (const datei of dateienUnter(PORTAL)) {
    for (const t of tabellenAusQuelltext(readFileSync(datei, 'utf8'))) gefunden.add(t)
  }
  const tabellen = [...gefunden].sort()

  console.log('═══════════════════════════════════════════════════════════════════')
  console.log(' KUNDENPORTAL — sieht die Kundin ihre Daten, und nur ihre?')
  console.log(` ${new Date().toISOString()}`)
  console.log(` ${tabellen.length} Tabellen, aus dem Quelltext von app/kunde gelesen`)
  console.log(' Es wird NICHTS geschrieben.')
  console.log('═══════════════════════════════════════════════════════════════════\n')

  const url = envWert('NEXT_PUBLIC_SUPABASE_URL')
  const liste = tabellen.map(t => `'${t}'`).join(',')
  const sql = `DO $$ DECLARE t text; BEGIN
    SELECT string_agg(z, '~') INTO t FROM (
      SELECT tablename||'|'||policyname||'|'||permissive||'|'||COALESCE(cmd,'-')||'|'||COALESCE(replace(replace(qual, E'\n', ' '), '|', '/'), '') AS z
      FROM pg_policies WHERE schemaname='public' AND tablename IN (${liste})
      ORDER BY tablename, policyname) s;
    RAISE EXCEPTION 'KETTE:%', COALESCE(t, '(keine)');
  END $$;`

  const res = await fetch(`${url}/rest/v1/rpc/_run_sql`, {
    method: 'POST',
    headers: apiHeaders(secretKey(), { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ p: sql }),
  })
  const roh = await res.text()
  let j: { message?: string } | null = null
  try { j = JSON.parse(roh) } catch { /* Fehlertexte sind nicht immer JSON */ }
  const meldung = j?.message ?? roh
  const i = meldung.indexOf('KETTE:')
  if (i === -1) {
    console.error(`Lesefehler: HTTP ${res.status} ${meldung.slice(0, 300)}`)
    process.exit(1)
  }

  const proTabelle = new Map<string, PolicyZeile[]>()
  for (const zeile of meldung.slice(i + 6).replace(/\\n/g, ' ').split('~').filter(Boolean)) {
    const [tabelle, name, permissive, cmd, qual] = zeile.split('|')
    if (!proTabelle.has(tabelle)) proTabelle.set(tabelle, [])
    proTabelle.get(tabelle)!.push({ name, permissive, cmd: cmd ?? '-', qual: qual ?? '' })
  }

  const bewertungen = tabellen.map(t => bewerteTabelle(t, proTabelle.get(t) ?? []))
  const zeichen = { gebunden: '✓', offen_beabsichtigt: '○', bekannte_luecke: '⚠', befund: '✗' } as const

  for (const b of bewertungen) {
    const rechts = b.einordnung === 'gebunden' ? b.policies.join(', ')
      : b.einordnung === 'offen_beabsichtigt' ? 'bewusst offen'
      : b.einordnung === 'bekannte_luecke' ? 'bekannte Luecke, Migration wartet'
      : 'ohne Kundenbindung'
    console.log(`  ${zeichen[b.einordnung]} ${b.tabelle.padEnd(28)} ${rechts}`)
  }

  const gruppe = (art: string) => bewertungen.filter(b => b.einordnung === art)
  const beabsichtigt = gruppe('offen_beabsichtigt')
  const bekannt = gruppe('bekannte_luecke')
  const befunde = gruppe('befund')

  if (beabsichtigt.length > 0) {
    console.log('\n○  bewusst ohne Nutzerbindung:')
    for (const b of beabsichtigt) console.log(`     ${b.tabelle}\n        ${b.begruendung}`)
  }

  if (bekannt.length > 0) {
    console.log('\n⚠  bekannt, eingereicht, wartet auf Einspielung:')
    for (const b of bekannt) console.log(`     ${b.tabelle}\n        ${b.begruendung}`)
  }

  if (befunde.length > 0) {
    console.log('\n✗  NEUER BEFUND — das Portal liest, die Policy bindet nicht:')
    for (const b of befunde) {
      console.log(`     ${b.tabelle}`)
      console.log(`        ${b.begruendung}`)
      console.log('        Folge: PostgREST antwortet mit 200 [] statt mit einem Fehler.')
      console.log('        Die Seite zeigt einen Leerzustand, obwohl Daten da sind.')
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════════')
  console.log(` Tabellen geprueft        : ${tabellen.length}`)
  console.log(` mit Kundenbindung        : ${gruppe('gebunden').length}`)
  console.log(` bewusst offen            : ${beabsichtigt.length}`)
  console.log(` bekannte Luecken         : ${bekannt.length}`)
  console.log(` NEUE BEFUNDE             : ${befunde.length}`)
  console.log(befunde.length === 0
    ? ' ✅ Kein neuer Befund.'
    : ' ❌ Mindestens eine Tabelle wird gelesen, ohne dass eine Policy sie bindet.')
  console.log('═══════════════════════════════════════════════════════════════════')
  process.exit(befunde.length === 0 ? 0 : 1)
}

main().catch(err => { console.error(err); process.exit(1) })
