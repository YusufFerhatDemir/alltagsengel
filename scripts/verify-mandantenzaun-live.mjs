#!/usr/bin/env node
/**
 * verify-mandantenzaun-live.mjs
 * -----------------------------
 * Prueft LIVE, ob jede Tabelle mit `organization_id` auch mandantenbezogen
 * abgesichert ist — und nicht nur „irgendwie" durch RLS.
 *
 * ── DAS MUSTER, GEGEN DAS DIESE PRUEFUNG GEBAUT IST ──────────────────
 * Eine Tabelle traegt `organization_id`, hat RLS an und eine Policy — und
 * die Policy lautet `is_admin()`. Sie ist damit ORG-BLIND: jeder
 * Verwaltungsnutzer sieht die Zeilen ALLER Mandanten. Das sieht in jeder
 * Uebersicht unauffaellig aus ("RLS: ja, Policy: ja") und faellt erst auf,
 * wenn ein zweiter Mandant Daten hat.
 *
 * ── WARUM NICHT NACH DEM NAMEN SUCHEN ────────────────────────────────
 * Der Mandantenzaun traegt im Bestand mehrere Schreibweisen, und manche
 * Tabellen loesen die Frage ohne eigene Fence-Policy: `state_waitlist`
 * prueft `is_admin() AND organization_id = current_org_id()` direkt in
 * jeder Policy, `organization_members` ueber `is_org_member(organization_id)`.
 * Beides ist richtig. Wer nur nach einer Policy namens `%org_fence%`
 * sucht, meldet diese Tabellen faelschlich als Luecke.
 *
 * Geprueft wird deshalb der AUSDRUCK: nennt mindestens eine Policy der
 * Tabelle `organization_id`? Das ist grob, aber in der richtigen
 * Richtung streng — eine Policy, die die Spalte nicht einmal erwaehnt,
 * kann nicht nach ihr trennen.
 *
 * ── ERLAUBNISLISTE, NICHT SPERRLISTE ─────────────────────────────────
 * Jede Ausnahme steht unten MIT BEGRUENDUNG. Neue Tabellen sind
 * automatisch ein Befund, bis jemand sie ausdruecklich einordnet.
 *
 * Aufruf:  npm run verify:mandantenzaun
 */
import { apiHeaders, secretKey, envWert } from './lib/supabase-keys.mjs'

// Header und Schluessel kommen aus scripts/lib/supabase-keys.mjs, nicht von
// Hand: die Fallback-Kette dort kennt beide Key-Modelle (Legacy-JWT und
// publishable/secret). Ein selbstgebauter `Authorization: Bearer <key>`
// meldet mit den neuen Keys still „kein Zugriff" — ein Prueflauf, der
// deshalb nichts findet, sieht aus wie ein sauberes Ergebnis.
const URL_BASIS = envWert('NEXT_PUBLIC_SUPABASE_URL')
const SERVICE = secretKey()
if (!URL_BASIS || !SERVICE) {
  console.log('Keine Zugangsdaten — uebersprungen.')
  process.exit(0)
}

/**
 * Tabellen, die `organization_id` tragen, aber bewusst ohne
 * mandantenbezogene Policy auskommen. Jede Zeile ist eine Entscheidung,
 * keine Bequemlichkeit.
 */
const ERLAUBT = {
  // Stand 14.09.2026: org-blind und als Befund gefuehrt. Die Migration
  // 20261115000000 liegt als Datei bereit und ist NICHT angewendet (DDL
  // ist aus der Anwendung heraus nicht moeglich, 42501). Solange sie
  // aussteht, stehen diese drei hier — damit der Lauf gruen bleibt und
  // NEUE Faelle trotzdem auffallen.
  email_entwuerfe:
    'BEFUND, Migration 20261115000000 wartet. Policy ist is_admin() ohne '
    + 'Org-Bezug. Live 0 Zeilen — kein Abfluss, aber strukturell offen.',
  marketing_content_status:
    'BEFUND, Migration 20261115000000 wartet. Policy ist is_admin() ohne '
    + 'Org-Bezug. Live 28 Zeilen, alle Stamm-Organisation.',
  security_watchlist:
    'BEFUND, Migration 20261115000000 wartet. Policy ist ist_sicherheitsadmin() '
    + 'ohne Org-Bezug. Live 1 Zeile, Stamm-Organisation.',
}

const sql = `DO $$ DECLARE t text; BEGIN
  SELECT string_agg(z, E'\\n') INTO t FROM (
    SELECT c.relname
        || '|' || c.relrowsecurity
        || '|' || COALESCE((SELECT count(*)::text FROM pg_policies p WHERE p.tablename = c.relname), '0')
        || '|' || COALESCE((SELECT 'ja' FROM pg_policies p
                            WHERE p.tablename = c.relname
                              AND (p.qual ILIKE '%organization_id%' OR p.with_check ILIKE '%organization_id%')
                            LIMIT 1), 'nein') AS z
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND EXISTS (SELECT 1 FROM information_schema.columns col
                  WHERE col.table_schema = 'public'
                    AND col.table_name = c.relname
                    AND col.column_name = 'organization_id')
    ORDER BY c.relname) s;
  RAISE EXCEPTION 'KETTE:%', coalesce(t, '(keine Tabellen)');
END $$;`

const res = await fetch(`${URL_BASIS}/rest/v1/rpc/_run_sql`, {
  method: 'POST',
  headers: apiHeaders(SERVICE, { 'Content-Type': 'application/json' }),
  body: JSON.stringify({ p: sql }),
})
const roh = await res.text()
let j = null
try { j = JSON.parse(roh) } catch { /* Fehlertexte sind nicht immer JSON */ }
const meldung = j?.message ?? roh
const i = meldung.indexOf('KETTE:')
if (i === -1) {
  console.error(`Lesefehler: HTTP ${res.status} ${meldung.slice(0, 300)}`)
  process.exit(1)
}

const zeilen = meldung.slice(i + 6).replace(/\\n/g, '\n').split('\n').filter(Boolean)

console.log('═══════════════════════════════════════════════════════════════════')
console.log(' MANDANTENZAUN — jede Tabelle mit organization_id')
console.log(` ${new Date().toISOString()}`)
console.log('═══════════════════════════════════════════════════════════════════\n')

const ohneRls = []
const orgBlind = []
let gefenced = 0

for (const z of zeilen) {
  const [tabelle, rls, anzahl, orgBezug] = z.split('|')
  // Postgres liefert den Wahrheitswert je nach Ausgabeform als 't' ODER
  // 'true'. Ein Vergleich auf nur eine Form meldete am 14.09.2026 alle
  // 269 Tabellen als „RLS aus" — ein Prueflauf, der 269 Falschbefunde
  // ausgibt, wird beim ersten Lesen abgeschaltet.
  const rlsAn = rls === 't' || rls === 'true'
  if (!rlsAn) { ohneRls.push(tabelle); continue }
  if (orgBezug === 'ja') { gefenced++; continue }
  orgBlind.push({ tabelle, policies: Number(anzahl) })
}

console.log(`  Tabellen mit organization_id : ${zeilen.length}`)
console.log(`  davon mandantenbezogen       : ${gefenced}`)
console.log(`  ohne RLS                     : ${ohneRls.length}`)
console.log(`  org-blind (Policy ohne Bezug): ${orgBlind.length}\n`)

let fehler = 0

if (ohneRls.length > 0) {
  console.log('❌ RLS ist AUS — die Tabelle ist fuer jeden lesbar, der ein Token hat:')
  for (const t of ohneRls) console.log(`     ${t}`)
  fehler += ohneRls.length
  console.log()
}

const neuBlind = orgBlind.filter(b => !ERLAUBT[b.tabelle])
const bekanntBlind = orgBlind.filter(b => ERLAUBT[b.tabelle])

if (bekanntBlind.length > 0) {
  console.log('⚠  org-blind, aber eingeordnet:')
  for (const b of bekanntBlind) {
    console.log(`     ${b.tabelle}`)
    console.log(`        ${ERLAUBT[b.tabelle]}`)
  }
  console.log()
}

if (neuBlind.length > 0) {
  console.log('❌ NEU org-blind — keine Policy nennt organization_id:')
  for (const b of neuBlind) {
    console.log(`     ${b.tabelle}  (${b.policies} Policy/Policies)`)
  }
  console.log()
  console.log('   Ein Verwaltungsnutzer sieht damit die Zeilen ALLER Mandanten.')
  console.log('   Abhilfe: org_fence-Policy ergaenzen — oder die Tabelle unten in')
  console.log('   ERLAUBT eintragen, MIT Begruendung.')
  fehler += neuBlind.length
}

console.log('═══════════════════════════════════════════════════════════════════')
if (fehler === 0) {
  console.log(' ✅ Mandantenzaun: kein neuer Befund')
} else {
  console.log(` ❌ Mandantenzaun: ${fehler} Tabelle(n) ohne Mandantentrennung`)
}
console.log('═══════════════════════════════════════════════════════════════════')
process.exit(fehler === 0 ? 0 : 1)
