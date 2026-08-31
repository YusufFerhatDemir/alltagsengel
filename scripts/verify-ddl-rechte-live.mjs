#!/usr/bin/env node
/**
 * Beweisstueck: DARF die Rolle hinter dem Dienstschluessel auf Production
 * ueberhaupt DDL ausfuehren?
 *
 * Die acht offenen Migrationen brauchen genau vier DDL-Arten:
 *   CREATE FUNCTION, CREATE TRIGGER, CREATE POLICY, CREATE INDEX
 * — plus REVOKE (Schritt 8). Dieses Skript versucht JEDE davon LIVE und
 * faengt die Antwort der Datenbank ab, statt sie vorherzusagen.
 *
 * NICHTS BLEIBT ZURUECK. Jede Probe laeuft in einem DO-Block, der am Ende
 * IMMER mit RAISE EXCEPTION endet — auch im Erfolgsfall. Damit rollt
 * PostgreSQL den kompletten Block zurueck; der Fehlertext ist das Ergebnis.
 *
 * Warum ueberhaupt: scripts/apply-migration.mjs bricht mit einer VORHERSAGE
 * ab ("darf kein DDL"). Eine Vorhersage ist kein Beleg. Und bei REVOKE ist
 * die Vorhersage sogar noetig, weil PostgreSQL dort NICHT hart scheitert,
 * sondern nur eine WARNING gibt und HTTP 204 = "Erfolg" zurueckkommt
 * (siehe supabase/migrations/20260817010000_sql_exec_rpc_absichern.sql).
 *
 * Aufruf: node scripts/verify-ddl-rechte-live.mjs
 * Exit 0 = DDL moeglich (dann koennen die Migrationen hier laufen),
 * Exit 1 = DDL blockiert (dann nur der Supabase-SQL-Editor als `postgres`).
 */
import { apiHeaders, secretKey, envWert, keyModellBericht } from './lib/supabase-keys.mjs'

const BASIS = envWert('NEXT_PUBLIC_SUPABASE_URL')
const KEY = secretKey()
if (!BASIS || !KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / Dienstschluessel fehlen')
  process.exit(1)
}

async function runSql(sql) {
  const res = await fetch(`${BASIS}/rest/v1/rpc/_run_sql`, {
    method: 'POST',
    headers: apiHeaders(KEY, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ p: sql }),
  })
  const txt = await res.text()
  let json = null
  try { json = JSON.parse(txt) } catch { /* Klartext */ }
  return { status: res.status, txt, json }
}

/** Liest einen Wert ueber den RAISE-Umweg: _run_sql gibt keine Zeilen zurueck. */
async function orakel(ausdruck) {
  const r = await runSql(`DO $prb$ BEGIN RAISE EXCEPTION 'ORAKEL=%', (${ausdruck}); END $prb$;`)
  const m = (r.json?.message || r.txt || '').match(/ORAKEL=(.*)/)
  return m ? m[1].replace(/"\s*}?\s*$/, '').trim() : `?? (HTTP ${r.status}: ${(r.txt || '').slice(0, 160)})`
}

/**
 * Fuehrt ein DDL-Statement aus und rollt es GARANTIERT zurueck.
 * Erfolg  -> die Datenbank meldet 'DDL-PROBE: ERFOLG'
 * Ablehng -> die Datenbank meldet ihren eigenen Fehlertext + SQLSTATE
 */
async function ddlProbe(name, statements) {
  const body = statements.map((s) => `EXECUTE ${JSON.stringify(s).replace(/^"|"$/g, "'").replace(/'/g, "''")};`).join('\n')
  // JSON.stringify/replace ist fuer Anfuehrungszeichen unzuverlaessig — sauber ueber Dollar-Quoting:
  const inner = statements.map((s) => `  EXECUTE $stmt$${s}$stmt$;`).join('\n')
  const sql = `DO $prb$
BEGIN
${inner}
  RAISE EXCEPTION 'DDL-PROBE: ERFOLG';
EXCEPTION
  WHEN others THEN
    RAISE EXCEPTION 'DDL-PROBE: SQLSTATE=% | %', SQLSTATE, SQLERRM;
END $prb$;`
  void body
  const r = await runSql(sql)
  const roh = r.json?.message || r.txt || ''
  const m = roh.match(/DDL-PROBE: ([^"]*)/)
  const antwort = m ? m[1].trim() : `HTTP ${r.status} | ${roh.slice(0, 200)}`
  const erfolg = /ERFOLG/.test(antwort)
  console.log(`${erfolg ? '  DARF ' : ' BLOCK'} ${name.padEnd(22)} ${antwort}`)
  return erfolg
}

console.log('\n═══ DDL-Rechte auf Production — LIVE gemessen ═══')
console.log(`Ziel     : ${BASIS.replace(/^https:\/\//, '')}`)
console.log(`Schluessel: ${keyModellBericht ? keyModellBericht() : 'Dienstschluessel'}`)
console.log('Nichts bleibt zurueck: jede Probe endet mit RAISE EXCEPTION (Rollback).\n')

console.log('── Wer bin ich? ──')
for (const [label, ausdruck] of [
  ['current_user', 'current_user'],
  ['session_user', 'session_user'],
  ['superuser', "(SELECT usesuper::text FROM pg_user WHERE usename = current_user)"],
  ['Mitglied "postgres"', "pg_has_role(current_user,'postgres','MEMBER')::text"],
  ['CREATE auf public', "has_schema_privilege(current_user,'public','CREATE')::text"],
  ['Eigentuemer public.medikamente', "(SELECT tableowner FROM pg_tables WHERE schemaname='public' AND tablename='medikamente')"],
]) {
  console.log(`  ${label.padEnd(30)} ${await orakel(ausdruck)}`)
}

console.log('\n── Darf ich die vier DDL-Arten der acht Migrationen? ──')
const proben = [
  ['CREATE FUNCTION', ["CREATE OR REPLACE FUNCTION public._ddlprobe_fn() RETURNS int LANGUAGE sql AS $f$ SELECT 1 $f$"]],
  ['CREATE TRIGGER', ["CREATE OR REPLACE FUNCTION public._ddlprobe_tg() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN RETURN NEW; END $f$",
                      'CREATE TRIGGER _ddlprobe_trg BEFORE UPDATE ON public.medikamente FOR EACH ROW EXECUTE FUNCTION public._ddlprobe_tg()']],
  ['CREATE POLICY', ["CREATE POLICY _ddlprobe_pol ON public.absences FOR SELECT USING (false)"]],
  ['CREATE INDEX', ['CREATE UNIQUE INDEX _ddlprobe_idx ON public.pflege_massnahmenplaene (id)']],
  ['REVOKE', ['REVOKE EXECUTE ON FUNCTION public.rollen_matrix() FROM anon']],
]
let alleDuerfen = true
for (const [name, stmts] of proben) {
  const ok = await ddlProbe(name, stmts)
  if (!ok) alleDuerfen = false
}

console.log('\n═══════════════════════════════════════════════════════')
if (alleDuerfen) {
  console.log(' ERGEBNIS: DDL ist ueber den Dienstschluessel MOEGLICH.')
  console.log(' Die acht Migrationen koennen mit')
  console.log('   node scripts/apply-migration.mjs <datei>')
  console.log(' eingespielt werden.')
} else {
  console.log(' ERGEBNIS: DDL ist ueber den Dienstschluessel BLOCKIERT.')
  console.log(' Einziger Weg: Supabase-SQL-Editor, angemeldet als `postgres`.')
  console.log(' Vorlage: docs/MIGRATIONEN_APPLY_CHECKLISTE.md')
  console.log('')
  console.log(' ACHTUNG bei REVOKE (Schritt 8): steht dort " DARF ", ist das')
  console.log(' KEIN Beleg. PostgreSQL laesst ein REVOKE ohne Eigentuemerrecht')
  console.log(' mit blosser WARNING durchgehen — die Wirkung bleibt aus.')
}
console.log('═══════════════════════════════════════════════════════\n')
process.exit(alleDuerfen ? 0 : 1)
