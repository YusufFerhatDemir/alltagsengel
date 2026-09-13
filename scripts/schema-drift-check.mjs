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
import { apiHeaders, publishableKey, secretKey } from './lib/supabase-keys.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

for (const datei of ['.env.local', '.env']) {
  const p = join(ROOT, datei)
  if (!existsSync(p)) continue
  for (const zeile of readFileSync(p, 'utf8').split('\n')) {
    const m = zeile.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

/**
 * `--warn-only` (CI, Pre-Commit): Befunde werden gemeldet, der Lauf endet
 * trotzdem mit Exit 0. Schema-Drift ist P2 — er soll sichtbar sein, aber
 * keinen Merge und keinen Commit blockieren.
 *
 * Ohne Zugangsdaten kann der Check nichts prüfen. Er meldet das dann laut
 * als ÜBERSPRUNGEN. Exit 0 nur mit `--warn-only`; im Pflichtmodus ist ein
 * nicht durchgeführter Check ein Fehler, kein Erfolg.
 */
const WARN_ONLY = process.argv.includes('--warn-only')
/**
 * `--block-writes`: Befunde in einem SCHREIB-Weg blockieren trotzdem.
 *
 * Schema-Drift ist als P2 eingestuft, weil eine tote LESE-Abfrage „keine
 * Daten" zeigt — aergerlich, aber sichtbar. In einem Schreibweg ist es
 * etwas anderes: die unbekannte Spalte laesst das UPDATE komplett
 * scheitern, der Vorgang findet nicht statt, und der Code laeuft weiter,
 * als waere er geschehen.
 *
 * Am 14.09.2026 hat genau das den Widerrufslink zur Kontoloeschung
 * ausgehebelt: `.select('id')` auf `account_deletion_tokens` (die Tabelle
 * hat keine id-Spalte) — der Token wurde nie verbrannt. Der Pre-Commit-Lauf
 * hat den Befund gemeldet, aber warn-only, und er ging im Protokoll unter.
 */
const BLOCK_WRITES = process.argv.includes('--block-writes')

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = secretKey()
if (!URL_ || !KEY) {
  const text = 'Schema-Drift-Check ÜBERSPRUNGEN — NEXT_PUBLIC_SUPABASE_URL und ein geheimer Key werden benötigt (echtes PostgREST, die lokale Shadow-DB hat keine OpenAPI-Beschreibung).'
  if (WARN_ONLY) {
    console.warn(`⚠️  ${text}`)
    console.warn('   NICHTS GEPRÜFT — dieser Lauf ist kein grünes Ergebnis.')
    process.exit(0)
  }
  console.error(`❌ ${text}`)
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
  // Falsch zugeordnet: `.from(t)` laeuft ueber eine Variable
  // (TABELLEN = client_budgets | service_records | invoices). Alle drei
  // fuehren client_id; der Rueckfall auf das naechstgelegene literale
  // .from('profiles') trifft die falsche Tabelle.
  'app/kunde/nachrichten/page.tsx:profiles.client_id',
  // ECHT, aber nur per Migration lösbar: diesen Tabellen fehlt live die
  // organization_id. Den Org-Fence ersatzlos zu streichen wäre ein
  // Mandantenleck — deshalb bleibt der Code fail-closed stehen, bis die
  // Spalte nachgezogen ist.
  'app/api/admin/krankenfahrten/route.ts:krankenfahrten.organization_id',
  'app/api/admin/krankenfahrten/route.ts:krankenfahrt_providers.organization_id',
  'app/api/admin/krankenfahrten/route.ts:krankenfahrt_reviews.organization_id',
  'app/api/dipa/nachweise/route.ts:coach_nutzungsereignisse.organization_id',
  'lib/ops/nachrichten.ts:ops_posteingang.organization_id',

  // ECHT und ABSICHTLICH: `assignments.booking_id` kommt mit Migration
  // 20261025000000 und wird von Hand im SQL-Editor angewendet. Zwischen
  // Deploy und Anwenden fehlt die Spalte — und genau darauf ist der Code
  // vorbereitet: die Storno-Route faengt 42703/PGRST204 ab und faellt auf
  // den alten Notiz-Bezug zurueck (lib/bookings/assignment-bezug.ts,
  // __tests__/bookings/assignment-bezug.test.ts).
  //
  // Diese Zeile ist deshalb BEFRISTET. Ist die Migration angewendet
  // (`npm run check:migrationen` meldet 20261025000000 als live), gehoert
  // sie geloescht — sonst deckt sie spaeter einen echten Tippfehler zu.
  'app/api/bookings/cancel/route.ts:assignments.booking_id',

  // ── Phase 7 (26.08.2026) — alle acht nachgeprueft, alle falsch zugeordnet ──
  //
  // Zwei Ursachen, beide dieselbe Grenze des Zuordners: er nimmt die Tabelle
  // aus dem naechstgelegenen .from(...) im Dateitext.
  //
  // (a) Der Treffer steht in einem ERKLAERTEXT, nicht im Code. Beide Stellen
  //     zitieren einen Filter, um zu begruenden, warum er dort NICHT steht.
  'lib/billing/core/payments.ts:payment_allocations.paid_amount',
  'lib/billing/core/sammelrechnung.ts:service_records.leistungsart',
  //
  // (b) Die Abfrage wird in einer Hilfsfunktion gebaut (kopf(), ze(), de(),
  //     queue()), der Filter steht am Aufrufort. Die Spalten existieren
  //     saemtlich — nur auf der Tabelle der jeweiligen Hilfsfunktion:
  //       zahlungseingaenge.status        → camt_imports.status
  //       klaerfaelle.ist_ruecklastschrift → zahlungseingaenge.ist_ruecklastschrift
  //       dunning_email_queue.*            → dunning_entries.*
  'lib/pilot/control-center.ts:zahlungseingaenge.status',
  'lib/pilot/control-center.ts:klaerfaelle.ist_ruecklastschrift',
  'lib/pilot/control-center.ts:dunning_email_queue.block_dunning',
  'lib/pilot/control-center.ts:dunning_email_queue.dunning_level',
  'lib/pilot/control-center.ts:dunning_email_queue.next_dunning_at',

  // ── 27.08.2026 — nachgeprueft, beide falsch zugeordnet (Kategorie b/a) ──
  //
  // abrechnung-metriken.ts: zaehlerFuer(admin, 'tabelle', ..., q => q.is(...))
  // baut die Abfrage in zaehle() ueber `.from(tabelle)` (Variable, kein
  // Literal) — der Zuordner sieht das nicht und haengt die Filter am letzten
  // LITERALEN .from('billing_audit_trail') weiter oben auf. Echte Tabellen
  // (per Live-Schema-Abgleich bestaetigt): invoices.deleted_at,
  // dunning_entries.dunning_level, payments.deleted_at,
  // invoice_email_log.status.
  'lib/monitoring/abrechnung-metriken.ts:billing_audit_trail.deleted_at',
  'lib/monitoring/abrechnung-metriken.ts:billing_audit_trail.dunning_level',
  'lib/monitoring/abrechnung-metriken.ts:billing_audit_trail.status',
  //
  // invoice-engine.ts:625 — der Treffer steht in einem ERKLAERTEXT (Kommentar
  // zum CAS-Guard), nicht im Code. Der echte Filter `.is('frozen_at', null)`
  // steht bei Zeile 644 auf `.from('invoices')` (die Spalte existiert dort).
  'lib/billing/core/invoice-engine.ts:invoice_line_snapshots.frozen_at',
])

/**
 * Fehlschlag beim Schema-Abruf darf NIE als „keine Befunde" durchgehen:
 * ein leeres Schema lässt jede Tabelle unbekannt aussehen, der Check
 * überspringt dann stillschweigend alles und meldet ✅.
 */
let schema = new Map()
try {
  const antwort = await fetch(`${URL_}/rest/v1/`, { headers: apiHeaders(KEY) })
  if (!antwort.ok) throw new Error(`HTTP ${antwort.status} ${antwort.statusText}`)
  const spec = await antwort.json()
  for (const [name, def] of Object.entries(spec.definitions ?? {})) {
    schema.set(name, new Set(Object.keys(def.properties ?? {})))
  }
  if (schema.size === 0) throw new Error('OpenAPI-Beschreibung enthält keine Tabellen')
} catch (fehler) {
  const text = `Schema konnte nicht gelesen werden: ${fehler instanceof Error ? fehler.message : String(fehler)}`
  if (WARN_ONLY) {
    console.warn(`⚠️  ${text}`)
    console.warn('   NICHTS GEPRÜFT — dieser Lauf ist kein grünes Ergebnis.')
    process.exit(0)
  }
  console.error(`❌ ${text}`)
  process.exit(1)
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

// `.select(...)` IRGENDWO in der Kette — nicht nur direkt hinter `.from()`.
//
// Bis zum 14.09.2026 verlangte das Muster hier, dass `.select()` unmittelbar
// auf `.from()` folgt. Damit war `update().select('id')` unsichtbar — und
// genau dort ist der Fehler teuer: eine unbekannte Spalte laesst nicht nur
// das Lesen scheitern, sondern das ganze UPDATE. Gefunden an
// `account_deletion_tokens.id` (die Tabelle hat keine id-Spalte, ihr
// Schluessel ist user_id); der Token wurde dadurch nie verbrannt, der
// Widerrufslink blieb gueltig. Aufgefallen ist es erst in der CI.
const SELECT = /\.select\(\s*([`'])([\s\S]*?)\1/g
const FILTER = /\.(eq|neq|gt|gte|lt|lte|in|is|like|ilike|contains|order|not)\(\s*'([a-z0-9_]+)'/g
const FROM = /\.from\(\s*'([a-z0-9_]+)'\s*\)/g

const befunde = []
const schreibBefunde = []
function melde(datei, zeile, tabelle, spalte, art, imSchreibweg = false) {
  const rel = datei.replace(ROOT + '/', '')
  if (AUSNAHMEN.has(`${rel}:${tabelle}.${spalte}`)) return
  const zeileText = `${rel}:${zeile}  ${tabelle}.${spalte}  (${art})${imSchreibweg ? '  ← SCHREIBWEG' : ''}`
  befunde.push(zeileText)
  if (imSchreibweg) schreibBefunde.push(zeileText)
}

const quellen = [...dateien(join(ROOT, 'app')), ...dateien(join(ROOT, 'lib'))]

/**
 * Entfernt Kommentare, laesst aber jedes Zeichen an seiner Stelle.
 *
 * Ohne das liest der Abgleich Kommentare als Code: ein erklaerender Satz,
 * der `.select('id')` oder `.eq('status', …)` ZITIERT, landet im Fenster
 * der davorstehenden Tabelle und erzeugt einen Befund, den es nicht gibt.
 * Genau daran sind am 14.09.2026 vier von sechs Befunden gehangen.
 *
 * Ersetzt wird durch Leerzeichen statt geloescht — sonst verschoeben sich
 * alle Zeilennummern in der Meldung.
 */
function ohneKommentare(text) {
  return text
    // Blockkommentare, Zeilenumbrueche bleiben erhalten.
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    // Zeilenkommentare nur, wenn die Zeile damit BEGINNT — so bleiben
    // URLs (https://…) in Zeichenketten unangetastet.
    .replace(/^([ \t]*)\/\/.*$/gm, (m, einzug) => einzug + ' '.repeat(m.length - einzug.length))
}

for (const datei of quellen) {
  const text = ohneKommentare(readFileSync(datei, 'utf8'))

  // ── Spaltenlisten UND Filter, je Kette ───────────────────────────
  //
  // Ein Fenster reicht von einem `.from('…')` bis zum naechsten. Alles
  // darin gehoert zu dieser Tabelle — Spaltenlisten wie Filter.
  const stellen = [...text.matchAll(FROM)]
  for (let i = 0; i < stellen.length; i++) {
    const tabelle = stellen[i][1]
    const spalten = schema.get(tabelle)
    if (!spalten) continue
    const start = stellen[i].index
    const ende = i + 1 < stellen.length ? stellen[i + 1].index : text.length
    const fenster = text.slice(start, ende)
    // Enthaelt die Kette einen Schreibvorgang? Dann kostet eine unbekannte
    // Spalte nicht nur die Anzeige, sondern den Vorgang selbst.
    const imSchreibweg = /\.(update|insert|upsert|delete)\s*\(/.test(fenster)

    for (const m of fenster.matchAll(SELECT)) {
      // Eingebettete Ressourcen (client:clients(…)) hier nicht auflösen.
      const flach = m[2]
        .replace(/\w+\s*:\s*\w+\s*\([^)]*\)/g, '')
        .replace(/\w+\s*\([^)]*\)/g, '')
      for (const roh of flach.split(',')) {
        const name = roh.trim().split(/\s/)[0]
        if (!name || name === '*' || !/^[a-z0-9_]+$/.test(name)) continue
        if (spalten.has(name)) continue
        melde(datei, text.slice(0, start + m.index).split('\n').length, tabelle, name, 'select', imSchreibweg)
      }
    }

    for (const f of fenster.matchAll(FILTER)) {
      const name = f[2]
      if (name.includes('.') || spalten.has(name)) continue
      melde(datei, text.slice(0, start + f.index).split('\n').length, tabelle, name, `.${f[1]}`, imSchreibweg)
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
if (WARN_ONLY) {
  if (BLOCK_WRITES && schreibBefunde.length > 0) {
    console.error(`\n${schreibBefunde.length} davon in einem SCHREIB-Weg — dort faellt nicht nur die`)
    console.error('Anzeige aus, sondern der Vorgang selbst. Das blockiert, auch mit --warn-only.')
    // Eigener Ausgangscode: der Aufrufer muss „Befund im Schreibweg" von
    // „Check konnte nicht laufen" (Netz, fehlende Schluessel) unterscheiden
    // koennen — sonst blockt ein Netzaussetzer den Commit.
    process.exit(2)
  }
  console.error('\n(--warn-only: Befunde gemeldet, Lauf endet trotzdem mit Exit 0.)')
  process.exit(0)
}
process.exit(1)
