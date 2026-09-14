#!/usr/bin/env tsx
/**
 * verify-mandanten-konsistenz.ts
 * ------------------------------
 * Beantwortet EINE Frage gegen die Produktion: steht eine Zeile beim
 * falschen Mandanten?
 *
 * Gemeint ist nicht eine fehlende `organization_id`, sondern eine
 * FALSCHE: eine Zeile, deren `organization_id` nicht zu der ihres
 * Fremdschluessels passt. Ein Leistungsnachweis bei Mandant A, dessen
 * Klient zu B gehoert.
 *
 * Der RESTRICTIVE `org_fence` versteckt so eine Zeile vor dem eigenen
 * Mandanten UND zeigt sie dem fremden. Beide Wirkungen sind still — es
 * gibt keine Fehlermeldung, nur eine Liste, in der etwas fehlt, und eine
 * andere, in der etwas zu viel steht.
 *
 * Die Liste der geprueften Beziehungen kommt aus dem SCHEMA, nicht aus
 * einer gepflegten Aufzaehlung: jede Fremdschluessel-Beziehung, bei der
 * BEIDE Seiten `organization_id` tragen. Eine neue Tabelle ist damit
 * automatisch dabei.
 *
 * Er schreibt NICHTS.
 *
 * EXIT: 0 ohne Drift, 1 bei Drift — und ebenso, wenn NICHTS geprueft
 * werden konnte (Block 50: ein Lauf, der bei Blindheit gruen meldet, ist
 * schlimmer als keiner).
 *
 * Aufruf:  npm run verify:mandanten-konsistenz
 */
import { readFileSync, existsSync } from 'node:fs'
import {
  leseKonsistenzAntwort, istKonsistenzBefund, konsistenzMeldung,
} from '../lib/mandant/konsistenz'
import { frageOrakel } from './lib/lese-orakel.mjs'

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
 * `query_to_xml` fuehrt je Beziehung eine gezaehlte Abfrage aus — ohne
 * dass der Aufrufer 283 Anweisungen zusammensetzen muss. `format` mit
 * `%I` quotiert die Bezeichner; die Namen stammen ohnehin aus dem
 * Systemkatalog, nicht aus einer Eingabe.
 */
const ABFRAGE = `
  WITH paare AS (
    SELECT c.relname AS kind, p.relname AS eltern,
           (SELECT a.attname FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attnum = fk.conkey[1]) AS spalte,
           (SELECT a.attname FROM pg_attribute a WHERE a.attrelid = p.oid AND a.attnum = fk.confkey[1]) AS zielspalte
      FROM pg_constraint fk
      JOIN pg_class c ON c.oid = fk.conrelid
      JOIN pg_class p ON p.oid = fk.confrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE fk.contype = 'f' AND n.nspname = 'public' AND array_length(fk.conkey, 1) = 1
       AND EXISTS (SELECT 1 FROM pg_attribute x
                    WHERE x.attrelid = c.oid AND x.attname = 'organization_id' AND x.attnum > 0)
       AND EXISTS (SELECT 1 FROM pg_attribute y
                    WHERE y.attrelid = p.oid AND y.attname = 'organization_id' AND y.attnum > 0)
  ), geprueft AS (
    SELECT kind, eltern, spalte,
           (xpath('/row/c/text()', query_to_xml(format(
              'SELECT count(*) AS c FROM public.%I k JOIN public.%I e ON e.%I = k.%I '
              || 'WHERE k.organization_id IS DISTINCT FROM e.organization_id',
              kind, eltern, zielspalte, spalte), false, true, '')))[1]::text::bigint AS drift
      FROM paare
  )
  SELECT COALESCE(
           string_agg(kind || '|' || spalte || '|' || eltern || '|' || drift, E'\\n'
                      ORDER BY drift DESC, kind) FILTER (WHERE drift > 0), '')
         || E'\\nGEPRUEFT|' || count(*)::text
    INTO v
    FROM geprueft;`

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SECRET_KEY/SERVICE_ROLE_KEY noetig.')
    process.exit(1)
  }

  const nutzlast = await frageOrakel(
    url, key,
    `DO $$ DECLARE v text; BEGIN ${ABFRAGE} RAISE EXCEPTION '%', COALESCE(v, ''); END $$;`,
  )

  const befund = leseKonsistenzAntwort(nutzlast)
  console.log('Mandanten-Konsistenz der Bestandsdaten\n')
  console.log(konsistenzMeldung(befund))
  process.exit(istKonsistenzBefund(befund) ? 1 : 0)
}

main().catch(err => { console.error(String(err?.message ?? err)); process.exit(1) })
