#!/usr/bin/env node
/**
 * Wendet GENAU EINE Datei aus supabase/migrations/ auf die Live-DB an.
 *
 * Kein freies SQL: der Pfad muss unterhalb von supabase/migrations/ liegen und
 * auf .sql enden. Der Inhalt wird unveraendert uebergeben.
 *
 * ABHAENGIGKEIT: nutzt die DB-Funktion public._run_sql(p text). Die ist ein
 * Werkzeug-Rest, der NICHT aus diesem Repo stammt und der bis zum Apply von
 * 20260817010000_sql_exec_rpc_absichern.sql auch fuer die Rolle `anon` offen
 * steht (Details dort). Nach diesem Apply bleibt sie nur fuer service_role
 * erreichbar — also genau fuer dieses Skript.
 *
 * ═══ WICHTIGE EINSCHRAENKUNG (gemessen am 2026-08-19) ═══
 *   _run_sql laeuft als `service_role`:
 *     current_user = service_role, superuser = false,
 *     Mitglied von `postgres` = false, CREATE auf schema public = false.
 *   Alle Tabellen und Funktionen in public gehoeren `postgres`. Daraus folgt:
 *
 *     * ALTER TABLE / CREATE POLICY / CREATE FUNCTION scheitern hart
 *       ("must be owner of ...") — das faellt wenigstens auf.
 *     * REVOKE/GRANT scheitern NICHT hart. Postgres gibt bei einem
 *       Nicht-Eigentuemer nur eine WARNING aus ("no privileges could be
 *       revoked") und macht weiter. Die Migration meldete dann frueher
 *       HTTP 204 = Erfolg, OBWOHL sich nichts geaendert hat.
 *
 *   Genau in diese Falle lief der Security-Fix vom 2026-08-19: das REVOKE auf
 *   cron_check_ueberfaellige_aufgaben() quittierte 204, und der Endpunkt war
 *   danach unveraendert fuer `anon` aufrufbar.
 *
 *   Deshalb prueft dieses Skript jetzt VORHER, ob die Rolle ueberhaupt DDL
 *   ausfuehren darf, und bricht sonst mit einer klaren Ansage ab. Der Weg fuer
 *   DDL ist der Supabase-SQL-Editor (der laeuft als `postgres`).
 *
 * Aufruf: node scripts/apply-migration.mjs 20260815010000_beispiel.sql
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve, basename } from 'node:path'

for (const datei of ['.env.local', '.env']) {
  if (!existsSync(datei)) continue
  for (const zeile of readFileSync(datei, 'utf8').split('\n')) {
    const m = zeile.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const URL_BASIS = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_BASIS || !SERVICE) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen')
  process.exit(1)
}

const name = basename(process.argv[2] || '')
if (!name.endsWith('.sql')) {
  console.error('Nutzung: node scripts/apply-migration.mjs <datei>.sql')
  process.exit(1)
}
const pfad = resolve('supabase/migrations', name)
if (!existsSync(pfad)) {
  console.error(`Migration nicht gefunden: ${pfad}`)
  process.exit(1)
}

const roh = readFileSync(pfad, 'utf8')

// _run_sql fuehrt den Text per EXECUTE in einer plpgsql-Funktion aus. Postgres
// erlaubt dort keine Transaktionsbefehle:
//   0A000 "EXECUTE of transaction commands is not implemented"
// Deshalb werden ein fuehrendes BEGIN; und ein abschliessendes COMMIT; hier
// entfernt. Die Atomaritaet geht dabei NICHT verloren: der Funktionsaufruf
// laeuft selbst in einer Transaktion, der ganze Rumpf faellt also gemeinsam
// durch. Die Migrationsdatei behaelt BEGIN/COMMIT, damit sie unveraendert im
// Supabase-SQL-Editor und per psql anwendbar bleibt.
const inhalt = roh
  .replace(/^\s*BEGIN\s*;\s*$/im, '')
  .replace(/^\s*COMMIT\s*;\s*$/im, '')

if (inhalt !== roh) {
  console.log('Hinweis: BEGIN/COMMIT entfernt — _run_sql kapselt die Anweisungen selbst in einer Transaktion.')
}
console.log(`Wende an: ${name} (${inhalt.length} Zeichen)`)

async function runSql(sql) {
  const res = await fetch(`${URL_BASIS}/rest/v1/rpc/_run_sql`, {
    method: 'POST',
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p: sql }),
  })
  return { status: res.status, ok: res.ok, text: await res.text() }
}

// ── Vorabpruefung: darf die ausfuehrende Rolle ueberhaupt DDL? ───────────
// Ergebnis kommt per RAISE EXCEPTION zurueck, weil _run_sql bei Erfolg
// 204 ohne Inhalt liefert. Die Exception rollt zugleich alles zurueck.
const probe = await runSql(`
DO $$
DECLARE
  darf_create boolean := has_schema_privilege(current_user, 'public', 'CREATE');
  ist_postgres boolean := pg_has_role(current_user, 'postgres', 'USAGE');
BEGIN
  RAISE EXCEPTION 'PROBE:%:%:%', current_user, darf_create, ist_postgres;
END $$;`)

const treffer = /PROBE:([^:]*):([^:"]*):([^:"]*)/.exec(probe.text)
if (!treffer) {
  console.error('Vorabpruefung fehlgeschlagen — _run_sql nicht erreichbar oder veraendert.')
  console.error(probe.status, probe.text.slice(0, 500))
  process.exit(1)
}

const [, rolle, darfCreate, istPostgres] = treffer
const ddlMoeglich = darfCreate === 't' || darfCreate === 'true' || istPostgres === 't' || istPostgres === 'true'

if (!ddlMoeglich) {
  console.error('')
  console.error(`  ABBRUCH: Rolle "${rolle}" darf in diesem Projekt kein DDL ausfuehren.`)
  console.error('  (kein CREATE auf schema public, kein Mitglied von "postgres";')
  console.error('   alle Objekte in public gehoeren "postgres")')
  console.error('')
  console.error('  Wichtig: REVOKE/GRANT wuerden hier NICHT hart scheitern, sondern')
  console.error('  nur eine WARNING erzeugen — das Skript haette "erfolgreich"')
  console.error('  gemeldet, ohne dass sich etwas aendert. Deshalb der Abbruch.')
  console.error('')
  console.error(`  Anwenden im Supabase-SQL-Editor (laeuft als "postgres"):`)
  console.error(`     supabase/migrations/${name}`)
  console.error('')
  process.exit(2)
}

const res = await runSql(inhalt)
console.log('HTTP', res.status)
console.log(res.text.slice(0, 2000))
process.exit(res.ok ? 0 : 1)
