#!/usr/bin/env node
/**
 * Gesamtverifikation der Security-P0-Migrationen gegen die LIVE-Datenbank.
 *
 *   20260817010000  _run_sql / _sql_parts fuer anon geschlossen
 *   20260817030000  SECURITY-DEFINER-RPCs (wf_*, next_billing_number) zu
 *   20260815010000  profiles: anon-Leseleck zu
 *   20260817040000  bookings: transitive 42P17-Rekursion beseitigt
 *   20260817020000  billing_audit_trail: Probe-Zeile dokumentiert
 *
 * NEBENWIRKUNGSFREI. Es wird nichts geschrieben:
 *   - anon-Proben sind `SELECT 1`, ein absichtlicher Syntaxfehler und GETs
 *   - die einzige aktiv gerufene RPC ist wf_execute_queue_item mit einer
 *     Null-UUID; ihr Body macht
 *         SELECT .. WHERE id = p_queue_id AND status = 'wartend';
 *         IF NOT FOUND THEN RETURN false; END IF;
 *     und kehrt damit vor jedem Schreibvorgang zurueck.
 *   - next_billing_number und wf_emit_event werden NIE aufgerufen: sie
 *     schreiben sofort. Ihr Zustand wird ueber den Katalog geprueft.
 *
 * Der Katalogteil braucht den SERVICE_ROLE_KEY (nur lokal, nie im Browser).
 * Fehlt er, laufen die Blackbox-Pruefungen trotzdem.
 *
 * Exit 0 = alles geschlossen, Exit 1 = mindestens ein Befund offen.
 */
import { readFileSync, existsSync } from 'node:fs'
import { apiHeaders, publishableKey, secretKey } from './lib/supabase-keys.mjs'

for (const datei of ['.env.local', '.env']) {
  if (!existsSync(datei)) continue
  for (const zeile of readFileSync(datei, 'utf8').split('\n')) {
    const m = zeile.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const BASIS = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = publishableKey()
const SVC = secretKey()
if (!BASIS || !ANON) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY fehlen')
  process.exit(1)
}

const NIL_UUID = '00000000-0000-0000-0000-000000000000'
const ergebnisse = []
function pruefe(id, bestanden, meldung) {
  ergebnisse.push({ id, bestanden })
  console.log(`${bestanden ? '  OK  ' : ' OFFEN'} ${id.padEnd(30)} ${meldung}`)
}

async function post(fn, body, key) {
  const res = await fetch(`${BASIS}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: apiHeaders(key, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  })
  return { status: res.status, text: (await res.text()).slice(0, 300) }
}
async function hole(pfad, key) {
  const res = await fetch(`${BASIS}/rest/v1/${pfad}`, {
    headers: apiHeaders(key),
  })
  return { status: res.status, text: (await res.text()).slice(0, 300) }
}

/** Katalog-Lesung ueber die verbliebene service_role-RPC. Nur SELECT. */
async function katalog(sql) {
  if (!SVC) return null
  const wrapped = `DO $orakel$ DECLARE r text; BEGIN
    SELECT coalesce(string_agg(x.z, ' | '), '<leer>') INTO r FROM (${sql}) x(z);
    RAISE EXCEPTION 'ORAKEL:%', r; END $orakel$;`
  const { text } = await post('_run_sql', { p: wrapped }, SVC)
  try {
    const j = JSON.parse(text)
    if (typeof j.message === 'string' && j.message.startsWith('ORAKEL:')) return j.message.slice(7)
  } catch { /* faellt unten auf null */ }
  return null
}

console.log(`\nSecurity-P0-Verifikation gegen ${BASIS.replace(/^https:\/\//, '')}\n`)
console.log('── 1) SQL-Ausfuehrungs-RPC (20260817010000) ──')

const exec1 = await post('_run_sql', { p: 'SELECT 1' }, ANON)
pruefe('A_run_sql_anon_zu', exec1.status >= 400,
  exec1.status < 400 ? `LECK: anon fuehrt SQL aus (HTTP ${exec1.status})` : `anon abgewiesen (HTTP ${exec1.status})`)

const kaputt = await post('_run_sql', { p: 'SELEKT kaputt' }, ANON)
const parser = kaputt.text.includes('42601')
pruefe('B_parser_unerreichbar', !parser,
  parser ? 'LECK: anon erreicht den SQL-Parser (42601)' : `kein Parser-Kontakt (HTTP ${kaputt.status})`)

const parts = await hole('_sql_parts?select=*&limit=1', ANON)
pruefe('C_sql_parts_zu', parts.status >= 400,
  parts.status < 400 ? `LECK: anon liest _sql_parts (HTTP ${parts.status})` : `anon abgewiesen (HTTP ${parts.status})`)

console.log('\n── 2) SECURITY-DEFINER-RPCs (20260817030000) ──')

const wfq = await post('wf_execute_queue_item', { p_queue_id: NIL_UUID }, ANON)
pruefe('D_wf_engine_anon_zu', wfq.status >= 400,
  wfq.status < 400
    ? `LECK: anon erreicht die Workflow-Engine (HTTP ${wfq.status})`
    : `anon abgewiesen (HTTP ${wfq.status})`)

const ZIELE = ['wf_emit_event', 'wf_process_event', 'wf_execute_queue_item',
  'wf_process_pending', 'wf_check_fristen', 'next_billing_number']
const grants = await katalog(`
  SELECT p.proname || '=' ||
         has_function_privilege('anon', p.oid, 'EXECUTE')::text || '/' ||
         has_function_privilege('authenticated', p.oid, 'EXECUTE')::text
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname IN (${ZIELE.map(z => `'${z}'`).join(',')})
  ORDER BY 1`)
if (grants === null) {
  console.log('  --   E_secdef_grants              uebersprungen (kein SERVICE_ROLE_KEY / _run_sql fuer service_role zu)')
} else {
  const offen = grants.split(' | ').filter(t => t.includes('true'))
  pruefe('E_secdef_grants', offen.length === 0,
    offen.length ? `LECK: anon/auth EXECUTE noch vorhanden -> ${offen.join(', ')}` : `alle sechs nur service_role (${grants})`)
}

console.log('\n── 3) profiles-RLS (20260815010000) ──')

const pAnon = await hole('profiles?select=id,email&limit=5', ANON)
let anonZeilen = null
try { const j = JSON.parse(pAnon.text); if (Array.isArray(j)) anonZeilen = j.length } catch { /* kein Array */ }
const rekursion = pAnon.text.includes('42P17')

// Wichtig: 42P17 darf NICHT als Erfolg zaehlen. Die Rekursion verdeckt das
// Leck nur — sie behebt es nicht. Faellt sie, liest anon sonst sofort alles.
pruefe('F_profiles_keine_rekursion', !rekursion,
  rekursion
    ? 'BLOCKADE: 42P17 — profiles ist fuer JEDEN Nicht-service_role tot '
      + '(transitiv ueber bookings, siehe 20260817040000)'
    : `keine Rekursion (HTTP ${pAnon.status})`)

pruefe('G_profiles_anon_leer', !rekursion && (anonZeilen === 0 || pAnon.status >= 400),
  anonZeilen > 0
    ? `LECK: anon liest ${anonZeilen}+ Profilzeilen inkl. email`
    : rekursion
      ? 'nicht bewertbar, solange 42P17 die Abfrage abbricht'
      : `anon sieht nichts (HTTP ${pAnon.status})`)

// Die transitive Rekursionsquelle direkt im Katalog nachsehen.
const bookingsAlt = await katalog(`
  SELECT CASE WHEN EXISTS (
           SELECT 1 FROM pg_policies WHERE schemaname='public'
             AND tablename='bookings' AND policyname='Admin bookingleri yönetebilir')
         THEN 'steht noch' ELSE 'entfernt' END`)
if (bookingsAlt === null) {
  console.log('  --   H_bookings_altpolicy         uebersprungen (kein Katalogzugriff)')
} else {
  pruefe('H_bookings_altpolicy', bookingsAlt === 'entfernt',
    bookingsAlt === 'entfernt'
      ? 'rekursive bookings-Alt-Policy ist weg'
      : 'REKURSIONSQUELLE: bookings."Admin bookingleri yönetebilir" steht noch')
}

console.log('\n── 4) Audit-Probe-Zeile (20260817020000) ──')

const kommentar = await katalog(`
  SELECT CASE WHEN obj_description('public.billing_audit_trail'::regclass, 'pg_class')
                   LIKE '%__probe__%'
              THEN 'dokumentiert' ELSE 'nicht dokumentiert' END`)
if (kommentar === null) {
  console.log('  --   I_audit_probe_dokumentiert   uebersprungen (kein Katalogzugriff)')
} else {
  pruefe('I_audit_probe_dokumentiert', kommentar === 'dokumentiert',
    kommentar === 'dokumentiert'
      ? 'Tabellenkommentar weist die Probe-Zeile aus'
      : 'COMMENT fehlt — Migration 20260817020000 nicht angewendet')
}

const offen = ergebnisse.filter(e => !e.bestanden)
console.log(`\n${ergebnisse.length - offen.length}/${ergebnisse.length} bestanden`)
if (offen.length > 0) {
  console.log(`\nOFFEN: ${offen.map(o => o.id).join(', ')}`)
  console.log('Apply-Weg: den kombinierten Block aus SECURITY_P0_APPLY.sql im')
  console.log('Supabase-SQL-Editor ausfuehren, danach dieses Skript erneut starten.\n')
  process.exit(1)
}
console.log('\nAlle geprueften Befunde sind auf Production geschlossen.\n')
process.exit(0)
