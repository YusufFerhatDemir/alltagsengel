#!/usr/bin/env node
/**
 * Prueft live, ob die drei Migrationen des Security-Fix-Pakets vom 2026-08-19
 * tatsaechlich angewendet sind.
 *
 * Hintergrund: `scripts/apply-migration.mjs` kann diese Migrationen NICHT
 * anwenden — _run_sql laeuft als `service_role`, und die gehoert weder den
 * Objekten in `public` noch der Rolle `postgres`. REVOKE/GRANT scheitern dort
 * nicht hart, sondern erzeugen nur eine WARNING: das Skript meldete frueher
 * Erfolg, obwohl sich nichts geaendert hatte. Genau deshalb gibt es diese
 * unabhaengige Gegenprobe.
 *
 * Anwenden der Migrationen: Supabase-SQL-Editor (laeuft als `postgres`), in
 * dieser Reihenfolge:
 *   1. 20260922000000_revoke_anon_cron_funktionen.sql
 *   2. 20260922010000_analytics_org_scope.sql
 *   3. 20260922020000_hoch1_mandantentrennung.sql
 *
 * Aufruf: node scripts/verify-security-fixes-2026-08-19.mjs
 * Exit 0 = alles angewendet, Exit 1 = mindestens eine Pruefung offen.
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

const URL_BASIS = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = publishableKey()
const SERVICE = secretKey()
if (!URL_BASIS || !ANON || !SERVICE) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY / SUPABASE_SERVICE_ROLE_KEY fehlen')
  process.exit(1)
}

const ergebnisse = []
function pruefe(name, bestanden, detail) {
  ergebnisse.push({ name, bestanden, detail })
  console.log(`${bestanden ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

// ── MITTEL-5: cron-RPC darf fuer anon NICHT mehr aufrufbar sein ──────────
console.log('\nMITTEL-5 — Cron-RPC gegen anon')
{
  const r = await fetch(`${URL_BASIS}/rest/v1/rpc/cron_check_ueberfaellige_aufgaben`, {
    method: 'POST',
    headers: apiHeaders(ANON, { 'Content-Type': 'application/json' }),
    body: '{}',
  })
  pruefe(
    'cron_check_ueberfaellige_aufgaben() ist fuer anon gesperrt',
    r.status !== 200,
    `HTTP ${r.status} (200 = weiterhin offen)`,
  )
}

// ── MITTEL-2 / HOCH-1: organization_id-Spalten vorhanden? ────────────────
console.log('\nMITTEL-2 + HOCH-1 — organization_id auf den nachgezogenen Tabellen')
{
  const spec = await (await fetch(`${URL_BASIS}/rest/v1/`, {
    headers: apiHeaders(SERVICE, { Accept: 'application/openapi+json' }),
  })).json()
  const defs = spec.definitions || {}

  const analytics = ['page_views', 'visitors', 'visitor_locations', 'analytics_events', 'partner_visits', 'conversions', 'geo_events']
  const fence = ['approved_locations', 'audit_logs', 'kf_booking_reviews', 'kf_partner_availability',
    'kf_partners', 'krankenfahrt_providers', 'krankenfahrt_reviews', 'krankenfahrten', 'lead_inquiries',
    'mis_auth_log', 'mis_dataroom_access', 'mis_privacy_audit_log', 'mis_privacy_consents',
    'mis_privacy_records', 'mis_privacy_requests', 'newsletter_subscribers', 'notfall_access_attempts',
    'whatsapp_conversations']

  for (const [gruppe, tabellen] of [['analytics (20260922010000)', analytics], ['org_fence (20260922020000)', fence]]) {
    const fehlend = tabellen.filter(t => defs[t] && !(defs[t].properties || {}).organization_id)
    pruefe(
      `${gruppe}: alle ${tabellen.length} Tabellen haben organization_id`,
      fehlend.length === 0,
      fehlend.length ? `fehlt bei: ${fehlend.join(', ')}` : undefined,
    )
  }
}

// ── NIEDRIG-3: offene INSERT-Policies entfernt? ──────────────────────────
// Gegenprobe ueber den anon-Key: ein Insert MUSS abgewiesen werden.
// Falls er DOCH durchgeht (= Policy noch offen), wird die Zeile unmittelbar
// mit dem Service-Role-Key wieder entfernt — die Pruefung darf keine Spuren
// in Production hinterlassen.
console.log('\nNIEDRIG-3 — offene INSERT-Policies auf den Tracking-Tabellen')
const MARKER = '/__rls_probe__'
// Die Probe MUSS alle NOT-NULL-Spalten fuellen. Sonst antwortet Postgres mit
// 23502 (not-null violation), bevor die Policy ueberhaupt ausgewertet wird —
// das saehe wie ein erfolgreicher Block aus, ist aber keiner.
const PROBE = {
  page_views:        { spalte: 'path',      koerper: { path: MARKER } },
  visitors:          { spalte: 'page',      koerper: { page: MARKER } },
  visitor_locations: { spalte: 'page_path', koerper: { page_path: MARKER, portal: 'landing' } },
}

for (const [tabelle, { spalte, koerper }] of Object.entries(PROBE)) {
  const r = await fetch(`${URL_BASIS}/rest/v1/${tabelle}`, {
    method: 'POST',
    headers: apiHeaders(ANON, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
    body: JSON.stringify(koerper),
  })
  const durchgekommen = r.status === 200 || r.status === 201 || r.status === 204

  let nachsatz = `HTTP ${r.status}`
  let geblockt = durchgekommen === false

  if (durchgekommen) {
    const weg = await fetch(
      `${URL_BASIS}/rest/v1/${tabelle}?${spalte}=eq.${encodeURIComponent(MARKER)}`,
      { method: 'DELETE', headers: apiHeaders(SERVICE) },
    )
    nachsatz += ` — Probe-Zeile wieder entfernt (DELETE ${weg.status})`
  } else {
    // Nicht jeder Fehler ist ein Policy-Block. Nur 42501 bzw. eine
    // ausdrueckliche RLS-Meldung zaehlt; alles andere ist ein Probenfehler
    // und wird als UNGEKLAERT gemeldet statt als Erfolg.
    const text = await r.text()
    if (/42501|row-level security/.test(text)) {
      nachsatz += ' (42501 — Policy greift)'
    } else {
      geblockt = false
      nachsatz += ` — UNGEKLAERT, kein Policy-Fehler: ${text.slice(0, 110)}`
    }
  }

  pruefe(`${tabelle}: anon darf nicht mehr schreiben`, geblockt, nachsatz)
}

// ── Zusatz: welche SECURITY-DEFINER-Funktion ist fuer anon ausfuehrbar? ──
// Der Katalog ist hier die belastbare Quelle — ein PostgREST-404 hiesse nur
// "keine Funktion mit dieser Signatur", nicht "gesperrt". Gelesen wird per
// RAISE EXCEPTION, weil _run_sql bei Erfolg 204 ohne Inhalt liefert; die
// Exception rollt zugleich alles zurueck (rein lesend).
console.log('\nZusatz — SECURITY-DEFINER-Funktionen mit EXECUTE fuer anon')
{
  const res = await fetch(`${URL_BASIS}/rest/v1/rpc/_run_sql`, {
    method: 'POST',
    headers: apiHeaders(SERVICE, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ p: `
DO $$
DECLARE
  z text := '';
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.prorettype <> 'trigger'::regtype
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
    ORDER BY 1
  LOOP
    z := z || r.sig || ' ; ';
  END LOOP;
  RAISE EXCEPTION 'SECDEF_ANON:%', coalesce(nullif(z, ''), '(keine)');
END $$;` }),
  })
  const koerper = await res.text()
  const treffer = /SECDEF_ANON:(.*?)"/.exec(koerper.replace(/\\n/g, ' '))
  const liste = treffer ? treffer[1].trim() : null

  if (liste === null) {
    pruefe('Katalog-Abfrage der SECDEF-Funktionen', false, `unerwartete Antwort: ${koerper.slice(0, 160)}`)
  } else {
    const namen = liste === '(keine)' ? [] : liste.split(';').map(s => s.trim()).filter(Boolean)
    // Erwartet ist nur cron_check_ueberfaellige_aufgaben() — und auch die
    // nur, solange 20260922000000 nicht angewendet ist.
    const unerwartet = namen.filter(n => !n.startsWith('cron_check_ueberfaellige_aufgaben'))
    pruefe(
      'keine unerwartete SECDEF-Funktion ist fuer anon ausfuehrbar',
      unerwartet.length === 0,
      namen.length ? `anon-ausfuehrbar: ${namen.join(', ')}` : 'keine',
    )
  }
}

// ── Zusammenfassung ─────────────────────────────────────────────────────
const offen = ergebnisse.filter(e => !e.bestanden)
console.log(`\n${ergebnisse.length - offen.length}/${ergebnisse.length} Pruefungen bestanden`)
if (offen.length) {
  console.log('\nOffen — die zugehoerige Migration ist noch nicht angewendet:')
  for (const e of offen) console.log(`  · ${e.name}`)
  console.log('\nAnwenden im Supabase-SQL-Editor (laeuft als "postgres"):')
  console.log('  1. supabase/migrations/20260922000000_revoke_anon_cron_funktionen.sql')
  console.log('  2. supabase/migrations/20260922010000_analytics_org_scope.sql')
  console.log('  3. supabase/migrations/20260922020000_hoch1_mandantentrennung.sql')
}
process.exit(offen.length ? 1 : 0)
