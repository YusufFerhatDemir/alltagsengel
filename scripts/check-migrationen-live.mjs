#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════
 * Welche Migration steht live — und welche nur im Repo?
 * ═══════════════════════════════════════════════════════════════════════
 *
 * WARUM ES DAS BRAUCHT
 *
 * Dieses Projekt hat keine funktionierende Migrationsbuchhaltung. Die
 * Dateien ab `20260901…` tragen ZUKUNFTS-Zeitstempel (bewusst, wegen der
 * Anwendungsreihenfolge von `rollen_matrix()`), und `supabase db push`
 * ist deshalb ausdruecklich verboten — es saehe alle als „nicht
 * angewendet". Die Frage „ist X live?" wurde bisher aus
 * `docs/MIGRATION_LEDGER.md` beantwortet, also aus einer von Hand
 * gepflegten Liste.
 *
 * Am 31.08.2026 stimmte diese Liste an fuenf Stellen nicht:
 *
 *   - Der Ledger fuehrte drei Marketing-Migrationen als „OFFEN". Alle
 *     drei stehen live (6 Tabellen, `marketing.verwalten` in
 *     `rollen_matrix()`, `mis_audit_log_action_check` erweitert).
 *   - Umgekehrt galten `20261008000000` und `20261009000000` als
 *     erledigt; live fehlen die Funktionen bzw. der eindeutige Index.
 *
 * Beide Richtungen sind gefaehrlich. „Faelschlich offen" kostet Zeit;
 * „faelschlich live" laesst eine Sperre als vorhanden gelten, die es
 * nicht gibt — bei `20261009000000` heisst das: zwei aktive
 * Massnahmenplaene je Klient sind weiter moeglich.
 *
 * ── WIE GEPRUEFT WIRD ─────────────────────────────────────────────────
 *
 * Nicht durch Nachbilden der Migration, sondern durch eine Frage an den
 * Katalog nach dem OBJEKT, das sie hinterlaesst: eine Funktion, ein
 * Trigger, ein eindeutiger Index, ein CHECK, eine Policy, ein Recht.
 * Steht das Objekt, ist die Migration angewendet.
 *
 * Zwei Fallen sind darin schon eingearbeitet:
 *
 *   1. RECHTE: `information_schema.*_privileges` zeigt PUBLIC-Grants
 *      nicht und meldete `angels` faelschlich als ungeschuetzt. Rechte
 *      werden ausschliesslich mit `has_*_privilege()` geprueft.
 *   2. NAMEN: der Constraint auf `kim_audit_log` heisst nicht
 *      `…action…`, sondern `kim_audit_log_aktion_check`. Eine Probe, die
 *      per LIKE raet, meldet „fehlt", wo nichts fehlt. Jede Probe nennt
 *      deshalb den exakten Namen.
 *
 * Der Katalog deckt die Dateien ab `20261006000000` ab. Alles davor gilt
 * seit dem 27.08.2026 als angewendet (227+ Migrationen, damals gegen die
 * Live-Datenbank geprueft).
 *
 * Aufruf:  npm run check:migrationen
 * Exit 0 = alle geprueften Migrationen stehen, 1 = mindestens eine fehlt.
 */

import { apiHeaders, envWert, secretKey } from './lib/supabase-keys.mjs'

const URL_BASIS = envWert('NEXT_PUBLIC_SUPABASE_URL')
const SERVICE = secretKey()
if (!URL_BASIS || !SERVICE) {
  console.error('Fehlt: NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY.')
  console.error('Es wurde NICHTS geprueft — dieser Lauf ist kein Nachweis.')
  process.exit(2)
}

import { KATALOG } from './lib/migrationen-katalog.mjs'

const FELD = '<<|>>'

async function orakel(sql) {
  const res = await fetch(`${URL_BASIS}/rest/v1/rpc/_run_sql`, {
    method: 'POST',
    headers: apiHeaders(SERVICE, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ p: sql }),
  })
  const text = await res.text()
  let j = null
  try { j = JSON.parse(text) } catch { /* Fehlertexte sind nicht immer JSON */ }
  const msg = j?.message ?? text
  const i = msg.indexOf('ORAKEL:')
  if (i === -1) throw new Error(`HTTP ${res.status}: ${msg.slice(0, 500)}`)
  return msg.slice(i + 7).replace(/\\n/g, '\n')
}

console.log('═══════════════════════════════════════════════════════════════════')
console.log(' MIGRATIONEN — steht sie live, oder nur im Repo?')
console.log(` ${new Date().toISOString()}`)
console.log('═══════════════════════════════════════════════════════════════════')
console.log()
console.log(`Geprueft werden ${KATALOG.length} Migrationen ab 20261006000000.`)
console.log('Alles davor gilt seit dem 27.08.2026 als angewendet (227+ Dateien).')
console.log()

const ausdruck = KATALOG
  .map((e, i) => `'${i}=' || (${e.sql})::text`)
  .join(` || '${FELD}' || `)
const roh = await orakel(
  `DO $ora$ DECLARE r text; BEGIN SELECT ${ausdruck} INTO r; RAISE EXCEPTION 'ORAKEL:%', r; END $ora$;`,
)
const zahlen = Object.fromEntries(roh.split(FELD).map(s => {
  const [i, n] = s.split('=')
  return [Number(i), Number(n)]
}))

const offen = []
for (const [i, e] of KATALOG.entries()) {
  const ist = zahlen[i]
  const steht = e.mindestens ? ist >= e.soll : ist === e.soll
  const marke = steht ? '✅' : '❌'
  console.log(`${marke} ${e.datei}`)
  console.log(`     ${e.was} — gefunden ${ist}, erwartet ${e.mindestens ? '≥' : ''}${e.soll}`)
  if (!steht) offen.push(e)
}

console.log()
console.log('═══════════════════════════════════════════════════════════════════')
if (offen.length === 0) {
  console.log(` ✅ Alle ${KATALOG.length} geprueften Migrationen stehen live.`)
  console.log('═══════════════════════════════════════════════════════════════════')
  process.exit(0)
}
console.log(` ${offen.length} MIGRATION(EN) STEHEN NICHT LIVE:`)
for (const e of offen) console.log(`   ${e.datei}`)
console.log()
console.log(' Anwenden im Supabase-SQL-Editor als `postgres`. Ueber den')
console.log(' Dienstschluessel scheitert jedes DDL am Eigentuemer (42501) —')
console.log(' geprueft am 31.08.2026 mit CREATE POLICY auf public.absences.')
console.log('═══════════════════════════════════════════════════════════════════')
process.exit(1)
