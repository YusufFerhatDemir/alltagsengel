#!/usr/bin/env node
/**
 * Verifiziert die LIVE-Zusagen, auf denen das Angehörigenportal aufsetzt.
 * Nur lesend — kein DDL, kein DML.
 *
 * Das Portal liest seine Daten mit dem Dienstschlüssel und entscheidet
 * die Freigabe im Code (lib/angehoerige/portal-helpers.ts). Diese
 * Entscheidung hängt an vier Tatsachen der Datenbank, die dieses Skript
 * nachmisst:
 *
 *   A) DIE DATENBANK BLEIBT FÜR ANGEHÖRIGE ZU. Auf clients,
 *      service_records, assignments und akten_dokumente darf es KEINE
 *      Policy geben, die `angehoerigen_zugaenge` auswertet. RLS wirkt
 *      zeilenweise: eine solche Policy gäbe dem Angehörigen die ganze
 *      Zeile (Anschrift, interne Bemerkungen, Freitexte) sobald er die
 *      Tabelle direkt über PostgREST anspricht — das Portal gibt aber
 *      nur die Spalten heraus, die der freigegebene Bereich deckt.
 *
 *   B) DAS ZUGRIFFSPROTOKOLL BLEIBT FÜR ANGEHÖRIGE UNLESBAR UND
 *      UNBESCHREIBBAR. Geschrieben wird es vom Server; ein Angehöriger
 *      darf weder hineinsehen noch Einträge erzeugen oder ändern.
 *
 *   C) DIE TERMIN-QUELLE STIMMT. `assignments` führt client_id und
 *      organization_id — danach filtert das Portal. `bookings` hat
 *      dagegen keinen Fremdschlüssel auf clients (customer_id zeigt auf
 *      profiles, care_recipient_id auf care_recipients); der frühere
 *      Filter `.in('customer_id', <clients.id>)` konnte per Schema nie
 *      treffen und die Terminseite war dauerhaft leer. Schlägt (C) um,
 *      ist der Grund für die Umstellung entfallen — dann gehört diese
 *      Entscheidung neu bewertet.
 *
 *   D) BESTAND: wie viele Zugänge, Protokollzeilen und Nachrichten es
 *      gibt, und wie viele Konten überhaupt die Rolle tragen.
 *
 * Aufruf: node scripts/verify-angehoerigenportal-live.mjs
 * Exit 0 = alle Zusagen erfüllt, Exit 1 = mindestens eine offen.
 */
import { apiHeaders, secretKey, envWert } from './lib/supabase-keys.mjs'

const URL_BASIS = envWert('NEXT_PUBLIC_SUPABASE_URL')
const SERVICE = secretKey()
if (!URL_BASIS || !SERVICE) {
  console.error('Fehlt: NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

/**
 * Lese-Orakel: `public._run_sql` liefert `void`, das Ergebnis kommt
 * deshalb über eine RAISE-Meldung zurück. Die Ausnahme rollt die
 * Transaktion immer zurück — es kann per Konstruktion nichts
 * geschrieben werden.
 */
async function orakel(sql) {
  const wrapped =
    `DO $ORK$ DECLARE r text; BEGIN `
    + `SELECT coalesce(string_agg(z::text, chr(10)), '(leer)') INTO r FROM (${sql}) t(z); `
    + `RAISE EXCEPTION 'ORAKEL:%', r; END $ORK$;`
  const res = await fetch(`${URL_BASIS}/rest/v1/rpc/_run_sql`, {
    method: 'POST',
    headers: apiHeaders(SERVICE, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ p: wrapped }),
  })
  const text = await res.text()
  let j = null
  try { j = JSON.parse(text) } catch { /* Fehlertexte sind nicht immer JSON */ }
  const msg = j?.message ?? text
  const i = msg.indexOf('ORAKEL:')
  if (i === -1) throw new Error(`Orakel unerwartet (HTTP ${res.status}): ${msg.slice(0, 400)}`)
  return msg.slice(i + 7).trim()
}

const ergebnisse = []
const pruefe = (id, ok, meldung) => ergebnisse.push({ id, ok, meldung })

// ── A) Keine Angehörigen-Policy auf den Datentabellen ──────────
const datenPolicies = await orakel(`
  SELECT tablename || ' | ' || policyname || ' | ' || cmd
  FROM pg_policies
  WHERE schemaname='public'
    AND tablename IN ('clients','service_records','assignments','akten_dokumente')
    AND (coalesce(qual,'') ILIKE '%angehoerigen_zugaenge%'
      OR coalesce(with_check,'') ILIKE '%angehoerigen_zugaenge%')
  ORDER BY tablename, policyname`)
pruefe('A', datenPolicies === '(leer)',
  `Datentabellen ohne Angehörigen-Policy (zeilenweite Freigabe wäre zu grob) — gefunden: ${datenPolicies}`)

// ── B) Zugriffsprotokoll bleibt admin-only ─────────────────────
const logPolicies = await orakel(`
  SELECT policyname || ' | ' || cmd || ' | ' || permissive || ' | '
      || coalesce(qual, with_check, '-')
  FROM pg_policies
  WHERE schemaname='public' AND tablename='angehoerigen_audit_log'
  ORDER BY policyname`)
const logOffen = await orakel(`
  SELECT count(*)::text FROM pg_policies
  WHERE schemaname='public' AND tablename='angehoerigen_audit_log'
    AND permissive='PERMISSIVE'
    AND coalesce(qual, with_check, '') NOT IN ('is_admin()')`)
pruefe('B', Number(logOffen) === 0,
  `Zugriffsprotokoll nur für Admins (${logOffen} weitere permissive Policy/Policies)`)

// ── C) Termin-Quelle ───────────────────────────────────────────
const assignmentSpalten = await orakel(`
  SELECT count(*)::text FROM information_schema.columns
  WHERE table_schema='public' AND table_name='assignments'
    AND column_name IN ('client_id','organization_id','assignment_date','start_time','end_time','service_type','status')`)
pruefe('C1', Number(assignmentSpalten) === 7,
  `assignments trägt die 7 Spalten der Terminabfrage (gefunden: ${assignmentSpalten})`)

const bookingFk = await orakel(`
  SELECT conname || ' -> ' || confrelid::regclass::text
  FROM pg_constraint
  WHERE conrelid='public.bookings'::regclass AND contype='f' AND conname LIKE '%customer_id%'`)
pruefe('C2', !bookingFk.includes('-> clients'),
  `bookings.customer_id zeigt weiterhin NICHT auf clients (${bookingFk})`)

// ── D) Bestand ─────────────────────────────────────────────────
const bestand = await orakel(`
  SELECT 'zugaenge=' || (SELECT count(*) FROM angehoerigen_zugaenge)
      || ' aktiv=' || (SELECT count(*) FROM angehoerigen_zugaenge WHERE status='aktiv')
      || ' protokollzeilen=' || (SELECT count(*) FROM angehoerigen_audit_log)
      || ' nachrichten=' || (SELECT count(*) FROM angehoerigen_nachrichten)
      || ' konten_mit_rolle=' || (SELECT count(*) FROM profiles WHERE role='angehoerige')`)

console.log('── Policies auf angehoerigen_audit_log ──')
console.log(logPolicies)
console.log('\n── Bestand ──')
console.log(bestand)

console.log('\n── Ergebnis ──')
let offen = 0
for (const e of ergebnisse) {
  if (!e.ok) offen++
  console.log(`${e.ok ? 'OK  ' : 'OFFEN'} ${e.id}: ${e.meldung}`)
}
process.exit(offen === 0 ? 0 : 1)
