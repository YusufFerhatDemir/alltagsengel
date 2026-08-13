#!/usr/bin/env node
/**
 * Schema-Drift-Check — findet Code, der Spalten anspricht, die es live nicht gibt.
 *
 * WARUM ES DAS BRAUCHT:
 * PostgREST lehnt eine Abfrage mit einer unbekannten Spalte komplett ab
 * (Fehler 42703). Im Code sieht das Ergebnis dann aus wie „keine Daten":
 *
 *   const { data } = await supabase.from('x').select('a, tippfehler')
 *   if (!data?.length) return []        // ← still, obwohl es Daten gäbe
 *
 * Genau so waren die Budget-Anlage, der Mahnungsversand und der
 * DATEV-Export monatelang tot, ohne dass irgendwo ein Fehler auftauchte.
 * TypeScript merkt davon nichts (kein generiertes Database-Typ-Schema),
 * Unit-Tests auch nicht (Mocks ignorieren die Spaltenliste).
 *
 * Der Check liest das LIVE-Schema über die OpenAPI-Beschreibung von
 * PostgREST und vergleicht:
 *   1. jede Spaltenliste in .select('…')
 *   2. jede Filter-/Sortierspalte in .eq/.in/.order/…
 *
 * Aufruf:
 *   node scripts/schema-drift-check.mjs
 *   npm run check:schema-drift
 *
 * Exit 1, sobald ein Befund übrig bleibt.
 *
 * BEKANNTE GRENZE: die Zuordnung Filter → Tabelle läuft über den zuletzt
 * gesehenen .from('…')-Aufruf. Wo eine Tabelle als String an eine
 * Hilfsfunktion geht (z. B. anzahl(supabase, 'tabelle', q => …)), stimmt
 * das nicht. Solche Stellen stehen in AUSNAHMEN und sind dort begründet.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

for (const datei of ['.env.local', '.env']) {
  const p = join(ROOT, datei)
  if (!existsSync(p)) continue
  for (const zeile of readFileSync(p, 'utf8').split('\n')) {
    const m = zeile.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY werden benötigt.')
  process.exit(1)
}

/**
 * Stellen, an denen der Check bekanntermaßen danebenliegt oder an denen der
 * Befund echt, aber nur per Migration lösbar ist. Format: 'pfad:tabelle.spalte'.
 */
const AUSNAHMEN = new Set([
  // Falsch zugeordnet: Tabelle kommt als String in eine Hilfsfunktion.
  'lib/abrechnung/health.ts:dta_dakota_auftraege.deleted_at',
  'lib/abrechnung/health.ts:dta_versand_protokoll.status',
  // Falsch zugeordnet: der Filter gehört zum folgenden .from('bookings').
  'app/api/bookings/respond/route.ts:profiles.status',
  // Falsch zugeordnet: der Filter gehört zu setzeFaelligkeitFallsLeer auf invoices.
  'lib/billing/core/invoice-engine.ts:clients.due_date',
  // ECHT, aber nur per Migration lösbar: diesen Tabellen fehlt live die
  // organization_id. Den Org-Fence ersatzlos zu streichen wäre ein
  // Mandantenleck — deshalb bleibt der Code fail-closed stehen, bis die
  // Spalte nachgezogen ist.
  'app/api/admin/krankenfahrten/route.ts:krankenfahrten.organization_id',
  'app/api/admin/krankenfahrten/route.ts:krankenfahrt_providers.organization_id',
  'app/api/admin/krankenfahrten/route.ts:krankenfahrt_reviews.organization_id',
  'app/api/dipa/nachweise/route.ts:coach_nutzungsereignisse.organization_id',
  'lib/ops/nachrichten.ts:ops_posteingang.organization_id',
])

const spec = await (await fetch(`${URL_}/rest/v1/`, {
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
})).json()

const schema = new Map()
for (const [name, def] of Object.entries(spec.definitions ?? {})) {
  schema.set(name, new Set(Object.keys(def.properties ?? {})))
}

function dateien(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (['node_modules', '.next', '.git'].includes(e)) continue
    const p = join(dir, e)
    if (statSync(p).isDirectory()) dateien(p, out)
    else if (/\.(ts|tsx)$/.test(e) && !/\.test\.tsx?$/.test(e)) out.push(p)
  }
  return out
}

const SELECT = /\.from\(\s*'([a-z0-9_]+)'\s*\)\s*(?:\r?\n\s*)?\.select\(\s*([`'])([\s\S]*?)\2/g
const FILTER = /\.(eq|neq|gt|gte|lt|lte|in|is|like|ilike|contains|order|not)\(\s*'([a-z0-9_]+)'/g
const FROM = /\.from\(\s*'([a-z0-9_]+)'\s*\)/g

const befunde = []
function melde(datei, zeile, tabelle, spalte, art) {
  const rel = datei.replace(ROOT + '/', '')
  if (AUSNAHMEN.has(`${rel}:${tabelle}.${spalte}`)) return
  befunde.push(`${rel}:${zeile}  ${tabelle}.${spalte}  (${art})`)
}

const quellen = [...dateien(join(ROOT, 'app')), ...dateien(join(ROOT, 'lib'))]

for (const datei of quellen) {
  const text = readFileSync(datei, 'utf8')

  // ── 1. Spaltenlisten in .select() ────────────────────────────────
  for (const m of text.matchAll(SELECT)) {
    const [, tabelle, , spaltenRoh] = m
    const spalten = schema.get(tabelle)
    if (!spalten) continue
    // Eingebettete Ressourcen (client:clients(…)) hier nicht auflösen.
    const flach = spaltenRoh
      .replace(/\w+\s*:\s*\w+\s*\([^)]*\)/g, '')
      .replace(/\w+\s*\([^)]*\)/g, '')
    for (let s of flach.split(',')) {
      const name = s.trim().split(/\s/)[0]
      if (!name || name === '*' || !/^[a-z0-9_]+$/.test(name)) continue
      if (!spalten.has(name)) {
        melde(datei, text.slice(0, m.index).split('\n').length, tabelle, name, 'select')
      }
    }
  }

  // ── 2. Filter- und Sortierspalten ────────────────────────────────
  const stellen = [...text.matchAll(FROM)]
  for (let i = 0; i < stellen.length; i++) {
    const tabelle = stellen[i][1]
    const spalten = schema.get(tabelle)
    if (!spalten) continue
    const start = stellen[i].index
    const ende = i + 1 < stellen.length ? stellen[i + 1].index : text.length
    for (const f of text.slice(start, ende).matchAll(FILTER)) {
      const name = f[2]
      if (name.includes('.') || spalten.has(name)) continue
      melde(datei, text.slice(0, start + f.index).split('\n').length, tabelle, name, `.${f[1]}`)
    }
  }
}

if (befunde.length === 0) {
  console.log(`✅ Schema-Drift-Check OK — ${quellen.length} Dateien gegen ${schema.size} Live-Tabellen geprüft.`)
  process.exit(0)
}

console.error('❌ Spalten, die es im Live-Schema nicht gibt:\n')
console.error(befunde.join('\n'))
console.error(`\n${befunde.length} Befund(e). Jeder davon lässt die ganze Abfrage mit 42703 scheitern.`)
console.error('Entweder den Spaltennamen korrigieren, die Migration anwenden — oder,')
console.error('wenn der Befund nachweislich falsch zugeordnet ist, in AUSNAHMEN begründen.')
process.exit(1)
