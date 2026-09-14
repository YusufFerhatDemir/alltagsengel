#!/usr/bin/env tsx
/**
 * verify-migrationsstand.ts
 * -------------------------
 * Beantwortet EINE Frage gegen die Produktion: welche der wartenden
 * Migrationen hat tatsaechlich gewirkt?
 *
 * Gefragt wird NICHT das Migrations-Verzeichnis — `supabase_migrations.
 * schema_migrations` liegt in einem Schema, das PostgREST nicht
 * ausliefert. Gefragt wird die WIRKUNG: existiert die Policy, ist sie
 * RESTRICTIVE, steht der Constraint, laesst der CHECK den Wert zu.
 *
 * Das ist auch die bessere Frage. Ein Apply ueber den Dienstschluessel
 * meldet HTTP 204 auch dann, wenn ihm die Rechte fehlten — „kein Fehler"
 * ist kein Beleg, und ein Verzeichniseintrag ohne Wirkung waere die
 * schlechtere Auskunft.
 *
 * Der Katalog steht in lib/migration/stand.ts und ist dort getestet.
 * Hier ist nur die Beschaffung. Er schreibt NICHTS.
 *
 * EXIT: immer 0. Dieser Lauf ist eine Standmeldung, kein Tor — die sechs
 * sind bekanntermassen offen, und ein dauerhaft rotes Kommando liest
 * niemand mehr. Rot faerbt hier nur ein Fehler beim Messen selbst.
 *
 * Aufruf:  npm run verify:migrationsstand
 */
import { readFileSync, existsSync } from 'node:fs'
import {
  WARTENDE_MIGRATIONEN, standVon, fehlendeWirkungen, wirkungsSchluessel,
  type LiveWirkung,
} from '../lib/migration/stand'

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

const SYMBOL = { angewendet: '✓', teilweise: '◐', offen: '·' } as const

async function orakel(url: string, key: string, sql: string): Promise<string> {
  // Das Lese-Orakel nimmt den Parameter `p`, nicht `query`.
  const res = await fetch(`${url}/rest/v1/rpc/_run_sql`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p: `DO $$ DECLARE v text; BEGIN ${sql} RAISE EXCEPTION '%', COALESCE(v, ''); END $$;` }),
  })
  const roh = await res.text()
  try {
    return String(JSON.parse(roh).message ?? '')
  } catch {
    throw new Error(`Antwort des Lese-Orakels nicht lesbar: ${roh.slice(0, 200)}`)
  }
}

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SECRET_KEY/SERVICE_ROLE_KEY noetig.')
    process.exit(1)
  }

  const live = new Map<string, LiveWirkung>()

  // Policies: Name, Tabelle und ob sie RESTRICTIVE ist. Ein permissiver
  // Zaun traegt denselben Namen und bewirkt nichts.
  const policies = await orakel(url, key, `
    SELECT string_agg(tablename || '|' || policyname || '|' || permissive, E'\\n')
      INTO v FROM pg_policies WHERE schemaname = 'public';`)
  for (const z of policies.split('\n').filter(Boolean)) {
    const [tabelle, name, permissive] = z.split('|')
    live.set(wirkungsSchluessel({ art: 'policy', tabelle, name }), {
      art: 'policy', tabelle, name, restriktiv: permissive === 'RESTRICTIVE',
    })
  }

  // Constraints samt Definition — ein CHECK kann stehen, ohne den neuen
  // Wert zuzulassen.
  const constraints = await orakel(url, key, `
    SELECT string_agg(c.relname || '|' || con.conname || '|' ||
             replace(pg_get_constraintdef(con.oid), E'\\n', ' '), E'\\n')
      INTO v
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND con.contype IN ('c', 'u');`)
  for (const z of constraints.split('\n').filter(Boolean)) {
    const [tabelle, name, ...rest] = z.split('|')
    live.set(wirkungsSchluessel({ art: 'constraint', tabelle, name }), {
      art: 'constraint', tabelle, name, definition: rest.join('|'),
    })
  }

  if (live.size === 0) {
    console.error(
      'Null Policies und null Constraints gelesen. Das ist kein Freispruch, '
      + 'sondern ein fehlgeschlagener Zugriff.',
    )
    process.exit(1)
  }

  console.log(`Gelesen: ${live.size} Policies und Constraints aus der Produktion.\n`)

  let angewendet = 0, teilweise = 0, offen = 0
  for (const m of WARTENDE_MIGRATIONEN) {
    const stand = standVon(m, live)
    if (stand === 'angewendet') angewendet++
    else if (stand === 'teilweise') teilweise++
    else offen++

    console.log(`${SYMBOL[stand]} ${stand.toUpperCase().padEnd(11)} ${m.datei}`)
    console.log(`              ${m.titel}`)
    if (stand !== 'angewendet') {
      for (const w of fehlendeWirkungen(m, live)) {
        const l = live.get(wirkungsSchluessel(w))
        const grund = !l
          ? 'nicht vorhanden'
          : w.restriktiv && l.restriktiv !== true
            ? 'vorhanden, aber PERMISSIVE — neben is_admin() wirkungslos'
            : `vorhanden, aber ohne „${w.enthaelt}" in der Definition`
        console.log(`                fehlt: ${w.art} ${w.tabelle}.${w.name} — ${grund}`)
      }
    }
    console.log()
  }

  console.log(`angewendet: ${angewendet} | teilweise: ${teilweise} | offen: ${offen}`)
  if (teilweise > 0) {
    console.log(
      '\n◐ TEILWEISE ist der gefaehrliche Fall: im SQL-Editor sah er aus wie '
      + 'Erfolg. Die fehlenden Anweisungen stehen oben namentlich.',
    )
  }
  console.log('\nAnwendungsanweisung: docs/migrations/DISPATCH.md')
}

main().catch(err => { console.error(err); process.exit(1) })
