#!/usr/bin/env tsx
/**
 * verify-mandanten-eindeutigkeit.ts
 * ---------------------------------
 * Beantwortet EINE Frage gegen die Produktion: gibt es einen Wert, den
 * zwei Mandanten beide erzeugen wuerden — und den die Datenbank nur
 * einmal zulaesst?
 *
 * Die Bewertung steht in lib/mandant/eindeutigkeit.ts und ist dort
 * getestet. Hier ist nur die Beschaffung: UNIQUE-Indexe live aus
 * `pg_index`, beschraenkt auf Tabellen, die `organization_id` tragen und
 * sie im Schluessel NICHT nennen.
 *
 * Er schreibt NICHTS.
 *
 * EXIT: 0 solange jeder Index gebunden, absichtlich global oder als
 * wartende Migration bekannt ist. 1 bei einem NEUEN Befund — dasselbe
 * Verhalten wie verify:portal-bindung, damit eine wartende Migration den
 * Lauf nicht dauerhaft rot faerbt und ein echter Neuzugang trotzdem
 * auffaellt.
 *
 * Aufruf:  npm run verify:mandanten-eindeutigkeit
 */
import { readFileSync, existsSync } from 'node:fs'
import {
  bewerteAlle, veraltet, schluessel,
  type UniqueIndexZeile,
} from '../lib/mandant/eindeutigkeit'

for (const datei of ['.env.local', '.env']) {
  if (!existsSync(datei)) continue
  for (const zeile of readFileSync(datei, 'utf8').split('\n')) {
    const i = zeile.indexOf('=')
    if (i < 0 || zeile.trim().startsWith('#')) continue
    const name = zeile.slice(0, i).trim()
    if (process.env[name]) continue
    process.env[name] = zeile.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
}

/**
 * UNIQUE-Indexe auf Tabellen MIT `organization_id`, deren Schluessel sie
 * nicht enthaelt. Primaerschluessel sind ausgenommen: `id` ist eine UUID
 * und kollidiert nicht.
 */
const ABFRAGE = `
  SELECT c.relname AS tabelle, i.relname AS idx,
         (SELECT string_agg(a.attname, ',' ORDER BY k.ord)
            FROM unnest(ix.indkey) WITH ORDINALITY k(attnum, ord)
            JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.attnum) AS spalten,
         -- Schluesselspalten, die ein Fremdschluessel auf eine Tabelle MIT
         -- organization_id sind. Aus dem Schema gelesen, nicht geraten.
         COALESCE((SELECT string_agg(DISTINCT a.attname, ',')
            FROM unnest(ix.indkey) k(attnum)
            JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.attnum
            JOIN pg_constraint fk ON fk.conrelid = c.oid AND fk.contype = 'f'
                                 AND a.attnum = ANY(fk.conkey)
           WHERE EXISTS (SELECT 1 FROM pg_attribute za
                          WHERE za.attrelid = fk.confrelid
                            AND za.attname = 'organization_id' AND za.attnum > 0)), '') AS gebunden,
         -- Enthaelt der Schluessel die eigene id? Eine UUID kollidiert nie.
         EXISTS (SELECT 1 FROM unnest(ix.indkey) k2(attnum)
                   JOIN pg_attribute a2 ON a2.attrelid = c.oid AND a2.attnum = k2.attnum
                  WHERE a2.attname = 'id') AS eigene_id
    FROM pg_index ix
    JOIN pg_class c ON c.oid = ix.indrelid
    JOIN pg_class i ON i.oid = ix.indexrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND ix.indisunique AND NOT ix.indisprimary
     AND EXISTS (SELECT 1 FROM pg_attribute oa
                  WHERE oa.attrelid = c.oid AND oa.attname = 'organization_id' AND oa.attnum > 0)
     AND NOT EXISTS (SELECT 1 FROM unnest(ix.indkey) kk
                       JOIN pg_attribute a2 ON a2.attrelid = c.oid AND a2.attnum = kk
                      WHERE a2.attname = 'organization_id')`

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SECRET_KEY/SERVICE_ROLE_KEY noetig.')
    process.exit(1)
  }

  // Das Lese-Orakel nimmt den Parameter `p`, nicht `query` — ein falscher
  // Name antwortet mit PGRST202 und sieht aus, als gaebe es die Funktion
  // nicht.
  const sql = `DO $$ DECLARE v text; BEGIN
    SELECT string_agg(t.tabelle || '|' || t.idx || '|' || t.spalten || '|' || t.gebunden || '|' || t.eigene_id::text, E'\\n')
      INTO v FROM (SELECT t0.tabelle, t0.idx, t0.spalten, t0.gebunden, t0.eigene_id FROM (${ABFRAGE}) t0) t;
    RAISE EXCEPTION '%', COALESCE(v, ''); END $$;`

  const res = await fetch(`${url}/rest/v1/rpc/_run_sql`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p: sql }),
  })
  const roh = await res.text()
  let nutzlast: string
  try {
    nutzlast = String(JSON.parse(roh).message ?? '')
  } catch {
    console.error('Die Antwort des Lese-Orakels war nicht lesbar:', roh.slice(0, 300))
    process.exit(1)
    return
  }

  const zeilen: UniqueIndexZeile[] = nutzlast
    .split('\n')
    .map(z => z.trim())
    .filter(Boolean)
    .map(z => {
      const [tabelle, index, spalten, gebunden, eigeneId] = z.split('|')
      return {
        tabelle,
        index,
        spalten: (spalten ?? '').split(',').filter(Boolean),
        gebundenUeber: (gebunden ?? '').split(',').filter(Boolean),
        eigeneId: eigeneId === 'true',
      }
    })

  if (zeilen.length === 0) {
    console.error(
      'Null UNIQUE-Indexe gelesen. Das ist kein Freispruch, sondern verdaechtig — '
      + 'eher ein fehlgeschlagener Zugriff als ein makelloses Schema.',
    )
    process.exit(1)
  }

  const bewertungen = bewerteAlle(zeilen)
  const befunde = bewertungen.filter(b => b.einstufung === 'befund')
  const wartend = bewertungen.filter(b => b.einstufung === 'migration_wartet')

  console.log(`Gelesen: ${zeilen.length} UNIQUE-Indexe auf Mandanten-Tabellen ohne organization_id.\n`)

  for (const b of wartend) {
    console.log(`⏳ ${schluessel(b.zeile)}  (${b.zeile.spalten.join(', ')})`)
    console.log(`     ${b.begruendung}`)
  }
  for (const b of befunde) {
    console.log(`✗  ${schluessel(b.zeile)}  (${b.zeile.spalten.join(', ')})`)
    console.log(`     ${b.begruendung}`)
  }

  const erledigt = veraltet(zeilen)
  for (const k of erledigt) {
    console.log(`✓  ${k} — steht nicht mehr live. Eintrag aus MIGRATION_WARTET entfernen.`)
  }

  const gebunden = bewertungen.filter(b => b.einstufung === 'ueber_fremdschluessel_gebunden').length
  const global = bewertungen.filter(b => b.einstufung === 'absichtlich_global').length
  console.log(
    `\nueber Fremdschluessel gebunden: ${gebunden} | absichtlich global: ${global} | `
    + `Migration wartet: ${wartend.length} | NEUE Befunde: ${befunde.length}`,
  )

  process.exit(befunde.length === 0 ? 0 : 1)
}

main().catch(err => { console.error(err); process.exit(1) })
