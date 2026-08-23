#!/usr/bin/env node
/**
 * Phase 4, Track 7a — E2E-Produktionsketten gegen die LIVE-Datenbank.
 *
 * Die Kettentests in __tests__/e2e/*.test.ts laufen gegen PGlite: echtes
 * PostgreSQL, aber ein aus den Migrationsdateien gebautes Schema. Damit
 * ist bewiesen, dass die Migrationen das Richtige TUN — nicht, dass sie
 * live ANGEWENDET sind. Genau diese Luecke schliesst dieses Skript: es
 * prueft je Kette die Objekte, ohne die der Kettentest live nicht
 * gelten wuerde.
 *
 * NEBENWIRKUNGSFREI. Ausschliesslich Lesen — ueber PostgREST und ueber
 * den Orakel-Wrapper (DO-Block mit RAISE EXCEPTION, vollstaendiger
 * Rollback). Kein DDL, kein DML, keine Testdaten.
 *
 *   node scripts/verify-e2e-ketten-live.mjs
 *
 * Exit 0 = alle Ketten live abgedeckt, Exit 1 = mindestens eine offen.
 * SKIP bedeutet: nicht messbar (Orakel nicht erreichbar) — das ist
 * ausdruecklich KEIN Bestanden.
 */

import { readFileSync, existsSync } from 'node:fs'
import { apiHeaders, secretKey } from './lib/supabase-keys.mjs'

for (const datei of ['.env.local', '.env']) {
  if (!existsSync(datei)) continue
  for (const zeile of readFileSync(datei, 'utf8').split('\n')) {
    const m = zeile.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const BASIS = process.env.NEXT_PUBLIC_SUPABASE_URL
const SVC = secretKey()
if (!BASIS || !SVC) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen')
  process.exit(1)
}

const ergebnisse = []
function pruefe(kette, id, status, meldung) {
  ergebnisse.push({ kette, id, status })
  const tag = status === 'PASS' ? '  PASS ' : status === 'FAIL' ? '  FAIL ' : '  SKIP '
  console.log(`${tag} ${id.padEnd(40)} ${meldung}`)
}

/**
 * Lese-Orakel: der Rueckgabewert kommt per RAISE EXCEPTION zurueck, weil
 * _run_sql bei Erfolg nichts liefert. Die Ausnahme rollt die Transaktion
 * zurueck — deshalb ist der Aufruf nebenwirkungsfrei.
 */
async function orakel(sql) {
  const wrapped = `DO $orakel$ DECLARE r text; BEGIN
    SELECT coalesce(string_agg(x.z::text, ' § '), '<leer>') INTO r FROM (${sql}) x(z);
    RAISE EXCEPTION 'ORAKEL:%', r; END $orakel$;`
  const res = await fetch(`${BASIS}/rest/v1/rpc/_run_sql`, {
    method: 'POST',
    headers: apiHeaders(SVC, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ p: wrapped }),
  })
  const text = await res.text()
  try {
    const j = JSON.parse(text)
    if (typeof j.message === 'string' && j.message.startsWith('ORAKEL:')) return j.message.slice(7)
  } catch { /* faellt unten durch */ }
  return { fehler: text.slice(0, 200) }
}

/** Erwartet vom Orakel genau `soll`. */
async function erwarte(kette, id, sql, soll, text) {
  const ist = await orakel(sql)
  if (ist?.fehler) return pruefe(kette, id, 'SKIP', `Orakel nicht erreichbar: ${ist.fehler}`)
  const ok = String(ist) === String(soll)
  pruefe(kette, id, ok ? 'PASS' : 'FAIL', ok ? text : `${text} — erwartet "${soll}", gelesen "${ist}"`)
}

/** Tabelle ueber PostgREST erreichbar? */
async function tabelle(kette, id, name, text) {
  const res = await fetch(`${BASIS}/rest/v1/${name}?select=*&limit=0`, {
    headers: apiHeaders(SVC, { Prefer: 'count=exact', Range: '0-0' }),
  })
  const ok = res.status < 400
  pruefe(kette, id, ok ? 'PASS' : 'FAIL',
    ok ? `${text} (${res.headers.get('content-range') ?? '?'})` : `${name} nicht erreichbar (HTTP ${res.status})`)
}

console.log(`\nE2E-Produktionsketten gegen ${BASIS.replace(/^https:\/\//, '')}\n`)

// ── Kette 1: Buchung → Rechnung → Versand ───────────────────────────
console.log('══ Kette 1 — Buchung → Rechnung → Versand ══')
for (const [id, name] of [
  ['K1_bookings', 'bookings'], ['K1_assignments', 'assignments'],
  ['K1_service_records', 'service_records'], ['K1_service_signatures', 'service_signatures'],
  ['K1_invoices', 'invoices'], ['K1_invoice_email_log', 'invoice_email_log'],
]) await tabelle('K1', id, name, 'vorhanden')

await erwarte('K1', 'K1_rpc_v9',
  `SELECT count(*)::text FROM pg_proc WHERE proname = 'create_invoice_draft_atomic'`,
  '1', 'create_invoice_draft_atomic ist live')

// ── Kette 2/3: fehlender Nachweis, fehlende Unterschrift ────────────
console.log('\n══ Ketten 2+3 — fehlender Nachweis / fehlende Unterschrift ══')
await erwarte('K23', 'K23_kein_nachweis',
  `SELECT (prosrc LIKE '%Keine abrechenbaren Leistungen%')::text
     FROM pg_proc WHERE proname = 'create_invoice_draft_atomic'`,
  'true', 'Abbruch ohne abrechenbaren Nachweis steht im Funktionsrumpf')
await erwarte('K23', 'K23_missing_signature',
  `SELECT (prosrc LIKE '%MISSING_SIGNATURE%')::text
     FROM pg_proc WHERE proname = 'create_invoice_draft_atomic'`,
  'true', 'Unterschriftssperre steht im Funktionsrumpf')
await erwarte('K23', 'K23_audit_vokabular',
  `SELECT (pg_get_constraintdef(oid) LIKE '%invoice_draft%')::text
     FROM pg_constraint WHERE conname = 'billing_audit_trail_entity_type_check'`,
  'true', 'entity_type-Vokabular traegt den Sperreintrag')

// ── Kette 4: Mahnlauf → Queue → Retry → Dead Letter ─────────────────
console.log('\n══ Kette 4 — Mahnlauf → Warteschlange → Wiederholung → Dead Letter ══')
await tabelle('K4', 'K4_queue', 'dunning_email_queue', 'Warteschlange vorhanden')
await erwarte('K4', 'K4_versuchsspur',
  `SELECT count(*)::text FROM information_schema.columns
    WHERE table_schema='public' AND table_name='dunning_email_queue'
      AND column_name IN ('versuche','letzter_versuch_am','naechster_versuch_ab')`,
  '3', 'Versuchsspur (20261001000000) ist eingespielt')
await erwarte('K4', 'K4_dead_letter_status',
  `SELECT (pg_get_constraintdef(oid) LIKE '%aufgegeben%')::text
     FROM pg_constraint
    WHERE conrelid = 'public.dunning_email_queue'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%wartend%'`,
  'true', 'Endzustand "aufgegeben" ist im Status-CHECK')
await erwarte('K4', 'K4_versuche_nicht_negativ',
  `SELECT count(*)::text FROM pg_constraint
    WHERE conname = 'dunning_email_queue_versuche_nicht_negativ'`,
  '1', 'Versuchszaehler kann nicht negativ werden')
await erwarte('K4', 'K4_org_fence',
  `SELECT count(*)::text FROM pg_policies
    WHERE tablename = 'dunning_email_queue' AND policyname = 'org_fence_dunning_email_queue'`,
  '1', 'Mandantengrenze der Warteschlange steht')

// ── Kette 5: Zustellspur und Wiederholungslauf ──────────────────────
console.log('\n══ Kette 5 — Benachrichtigung → Zustellspur → Wiederholung ══')
await tabelle('K5', 'K5_zustellspur', 'notification_delivery_log', 'Zustellspur vorhanden')
await erwarte('K5', 'K5_dublettensperre',
  `SELECT count(*)::text FROM pg_indexes
    WHERE indexname = 'uq_notification_delivery_log_erfolg'`,
  '1', 'genau EINE Erfolgszeile je (Vorgang, Kanal)')
await erwarte('K5', 'K5_vorgangsspalten',
  `SELECT count(*)::text FROM information_schema.columns
    WHERE table_schema='public' AND table_name='notification_delivery_log'
      AND column_name IN ('vorgang_art','vorgang_ref','vorgang_empfaenger','grund')`,
  '4', 'Vorgangsregister (20260927000000) ist eingespielt')
await erwarte('K5', 'K5_lauf_sperre',
  `SELECT count(*)::text FROM pg_indexes WHERE indexname = 'uq_zustellung_retry_lauf_aktiv'`,
  '1', 'hoechstens EIN laufender Wiederholungslauf')

// ── Kette 6: FCM-Push ───────────────────────────────────────────────
console.log('\n══ Kette 6 — Push: Token, Zustellung, ungueltige Token ══')
await tabelle('K6', 'K6_fcm_tokens', 'fcm_tokens', 'Geraeteregister vorhanden')
await erwarte('K6', 'K6_dublettensperre',
  `SELECT count(*)::text FROM pg_indexes WHERE indexname = 'fcm_tokens_user_token_uniq'`,
  '1', 'ein Token je Nutzer nur einmal')
await erwarte('K6', 'K6_org_und_nutzung',
  `SELECT count(*)::text FROM information_schema.columns
    WHERE table_schema='public' AND table_name='fcm_tokens'
      AND column_name IN ('organization_id','last_used_at')`,
  '2', 'Mandant und Zustellzeitpunkt am Geraet')

// ── Kette 7: VP/KZP ─────────────────────────────────────────────────
console.log('\n══ Kette 7 — VP/KZP: Kontingente, Jahreswechsel, Wettlauf ══')
for (const [id, name] of [
  ['K7_buchungen', 'vpkzp_buchungen'], ['K7_stand', 'client_vpkzp_usage'],
  ['K7_audit', 'vpkzp_audit_log'],
]) await tabelle('K7', id, name, 'vorhanden')

await erwarte('K7', 'K7_vp_2025',
  `SELECT public.vpkzp_max_tage('verhinderungspflege', 2025)::text`,
  '56', 'Verhinderungspflege ab 2025: 56 Tage')
await erwarte('K7', 'K7_vp_2024',
  `SELECT public.vpkzp_max_tage('verhinderungspflege', 2024)::text`,
  '42', 'Verhinderungspflege bis 2024: 42 Tage')
await erwarte('K7', 'K7_kzp',
  `SELECT public.vpkzp_max_tage('kurzzeitpflege', 2026)::text`,
  '56', 'Kurzzeitpflege durchgehend: 56 Tage')
await erwarte('K7', 'K7_jahresgrenze',
  `SELECT count(*)::text FROM pg_constraint
    WHERE conname = 'vpkzp_buchungen_im_kalenderjahr'`,
  '1', 'eine Buchung darf ihr Kalenderjahr nicht verlassen')
await erwarte('K7', 'K7_wettlaufsperre',
  `SELECT (prosrc LIKE '%pg_advisory_xact_lock%')::text
     FROM pg_proc WHERE proname = 'vpkzp_fortschreiben'`,
  'true', 'Fortschreibung nimmt eine Transaktions-Sperre')

// ── Kette 8: Mandantentrennung ──────────────────────────────────────
console.log('\n══ Kette 8 — Mandantentrennung ══')
await erwarte('K8', 'K8_org_fence_vpkzp',
  `SELECT count(*)::text FROM pg_policies
    WHERE tablename IN ('vpkzp_buchungen','client_vpkzp_usage','vpkzp_audit_log')
      AND permissive = 'RESTRICTIVE'`,
  '3', 'RESTRICTIVE org_fence auf allen drei VP/KZP-Tabellen')
await erwarte('K8', 'K8_paarung',
  `SELECT count(*)::text FROM pg_trigger WHERE tgname = 'trg_vpkzp_mandantenpaarung'`,
  '1', 'Klient und Mandant muessen zusammenpassen (20261001010000)')
await erwarte('K8', 'K8_anon_gesperrt',
  `SELECT count(*)::text FROM information_schema.role_table_grants
    WHERE table_schema='public' AND grantee='anon'
      AND table_name IN ('vpkzp_buchungen','client_vpkzp_usage','vpkzp_audit_log')`,
  '0', 'anon hat auf keine VP/KZP-Tabelle Zugriff')

// ── Kette 9: negative Betraege ──────────────────────────────────────
console.log('\n══ Kette 9 — negative Betraege ══')
await erwarte('K9', 'K9_checks',
  `SELECT count(*)::text FROM pg_constraint WHERE conname IN (
     'vpkzp_buchungen_betrag_nicht_negativ',
     'vpkzp_buchungen_budgetbetrag_nicht_negativ',
     'vpkzp_buchungen_privatbetrag_nicht_negativ')`,
  '3', 'alle drei Betragsspalten sind gegen negative Werte gesperrt')
await erwarte('K9', 'K9_validiert',
  `SELECT count(*)::text FROM pg_constraint
    WHERE conname LIKE 'vpkzp_buchungen_%nicht_negativ' AND convalidated`,
  '3', 'die CHECKs gelten auch fuer den Bestand (VALIDATED)')

// ── Kette 10: Pruefpfad ─────────────────────────────────────────────
console.log('\n══ Kette 10 — Pruefpfad ══')
await erwarte('K10', 'K10_audit_trigger',
  `SELECT count(*)::text FROM pg_trigger WHERE tgname = 'trg_vpkzp_audit'`,
  '1', 'jede Buchung schreibt ihre Aenderungsspur')
await erwarte('K10', 'K10_nur_aus_trigger',
  `SELECT count(*)::text FROM pg_trigger WHERE tgname = 'trg_vpkzp_audit_nur_aus_trigger'`,
  '1', 'ein von Hand geschriebener Eintrag wird abgewiesen')
await erwarte('K10', 'K10_unveraenderlich',
  `SELECT count(*)::text FROM pg_trigger WHERE tgname = 'trg_vpkzp_audit_unveraenderlich'`,
  '1', 'bestehende Eintraege sind gegen Aenderung und Loeschung gesperrt')

// ── Abschluss ───────────────────────────────────────────────────────
const fail = ergebnisse.filter(e => e.status === 'FAIL')
const skip = ergebnisse.filter(e => e.status === 'SKIP')
const pass = ergebnisse.filter(e => e.status === 'PASS')

console.log(`\n─────────────────────────────────────────────`)
console.log(`PASS ${pass.length}   FAIL ${fail.length}   SKIP ${skip.length}`)
if (fail.length) {
  console.log('\nOffen:')
  for (const f of fail) console.log(`  • ${f.id}`)
}
if (skip.length) {
  console.log('\nNicht messbar (KEIN Bestanden):')
  for (const s of skip) console.log(`  • ${s.id}`)
}
console.log('')

process.exit(fail.length > 0 || skip.length > 0 ? 1 : 0)
