#!/usr/bin/env tsx
// ═══════════════════════════════════════════════════════════════
// GENERATOR: PLZ→Bundesland-Regeln als SQL-Seed
// ═══════════════════════════════════════════════════════════════
// Die Zuordnung PLZ → Bundesland wird an ZWEI Stellen gebraucht:
//
//   1. TypeScript (lib/expansion/plz-bundesland.ts) — Buchungsstrecke,
//      offline, ohne DB-Zugriff.
//   2. SQL (public.plz_bundesland_regeln) — die Trigger, die die
//      Anerkennungssperre durchsetzen. Ein Guard, der die Regeln nicht
//      kennt, könnte nur das Bundesland der Organisation prüfen — und
//      wäre damit umgehbar, sobald ein einziges Bundesland frei ist.
//
// Zwei Kopien bedeuten normalerweise Drift. Deshalb ist TypeScript die
// EINZIGE Quelle und die SQL-Seite wird daraus generiert. Der Test
// __tests__/expansion/plz-sql-sync.test.ts schlägt fehl, sobald die
// eingecheckte SQL-Datei nicht mehr zum TS-Modul passt.
//
// Aufruf:  npm run generate:plz-sql
// Ausgabe: supabase/migrations/20260808120001_plz_bundesland_seed.sql
// ═══════════════════════════════════════════════════════════════

import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  AUSNAHMEN_5,
  PRAEFIX_2,
  PRAEFIX_3,
} from '../lib/expansion/plz-bundesland'

export const GENERATED_SQL_PATH = resolve(
  __dirname,
  '../supabase/migrations/20260808120001_plz_bundesland_seed.sql'
)

interface Zeile {
  praefix: string
  bundesland: string
  sicher: boolean
}

/** Alle Regeln in einer flachen, deterministisch sortierten Liste. */
export function sammleRegeln(): Zeile[] {
  const zeilen: Zeile[] = []

  for (const [praefix, bl] of Object.entries(AUSNAHMEN_5)) {
    // Eine 5-stellige Ausnahme ist per Definition eindeutig.
    zeilen.push({ praefix, bundesland: bl, sicher: true })
  }
  for (const [praefix, regel] of Object.entries(PRAEFIX_3)) {
    zeilen.push({ praefix, bundesland: regel.bl, sicher: regel.sicher })
  }
  for (const [praefix, regel] of Object.entries(PRAEFIX_2)) {
    zeilen.push({ praefix, bundesland: regel.bl, sicher: regel.sicher })
  }

  // Sortierung: kurz vor lang, dann alphabetisch — reproduzierbare Ausgabe.
  return zeilen.sort(
    (a, b) => a.praefix.length - b.praefix.length || a.praefix.localeCompare(b.praefix)
  )
}

export function baueSql(): string {
  const zeilen = sammleRegeln()
  const werte = zeilen
    .map(z => `  ('${z.praefix}', '${z.bundesland}', ${z.sicher ? 'TRUE' : 'FALSE'})`)
    .join(',\n')

  return `-- ════════════════════════════════════════════════════════════════════════════
-- GENERIERT — NICHT VON HAND BEARBEITEN
-- Quelle:    lib/expansion/plz-bundesland.ts
-- Generator: scripts/generate-plz-bundesland-sql.ts  (npm run generate:plz-sql)
-- Regeln:    ${zeilen.length}
--
-- Fuellt public.plz_bundesland_regeln (angelegt in 20260808120000).
-- Der laengste passende Praefix gewinnt.
--
-- Aenderungen bitte AUSSCHLIESSLICH in lib/expansion/plz-bundesland.ts vornehmen
-- und danach "npm run generate:plz-sql" ausfuehren. Der Test
-- __tests__/expansion/plz-sql-sync.test.ts bewacht die Uebereinstimmung.
-- ════════════════════════════════════════════════════════════════════════════

DELETE FROM public.plz_bundesland_regeln;

INSERT INTO public.plz_bundesland_regeln (praefix, bundesland, sicher) VALUES
${werte};
`
}

// Direktaufruf: Datei schreiben
if (require.main === module) {
  const sql = baueSql()
  writeFileSync(GENERATED_SQL_PATH, sql, 'utf8')
  console.log(`✅ ${sammleRegeln().length} Regeln geschrieben → ${GENERATED_SQL_PATH}`)
}
