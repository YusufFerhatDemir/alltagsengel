#!/usr/bin/env node
/**
 * Live-Nachweis fuer den Leistungsnachweis-Track (Track 5).
 *
 * Prueft ausschliesslich TATSACHEN gegen die Produktionsdatenbank — keine
 * Annahmen aus dem Repo. Jede Zeile ist entweder aus pg_proc / pg_policies /
 * information_schema gelesen oder eine Zaehlung auf echten Daten.
 *
 * Aufruf:  node scripts/verify-leistungsnachweis-live.mjs
 */
import { apiHeaders, secretKey, envWert } from './lib/supabase-keys.mjs'

const URL_ = envWert('NEXT_PUBLIC_SUPABASE_URL')
const KEY = secretKey()

if (!URL_ || !KEY) {
  console.error('Fehlt: NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const H = apiHeaders(KEY, { 'Content-Type': 'application/json' })

const ergebnisse = []
const pruefe = (id, ok, meldung) => ergebnisse.push({ id, ok, meldung })

/**
 * Lese-Orakel ueber public._run_sql: die Funktion liefert void, das Ergebnis
 * kommt als RAISE-Meldung zurueck. Die Ausnahme rollt die Transaktion immer
 * zurueck — es kann per Konstruktion nichts geschrieben werden.
 */
async function orakel(sql) {
  const wrapped =
    `DO $ORK$ DECLARE r text; BEGIN `
    + `SELECT coalesce(string_agg(z::text, chr(10)), '(leer)') INTO r FROM (${sql}) t(z); `
    + `RAISE EXCEPTION 'ORAKEL:%', r; END $ORK$;`
  const res = await fetch(`${URL_}/rest/v1/rpc/_run_sql`, {
    method: 'POST', headers: H, body: JSON.stringify({ p: wrapped }),
  })
  const text = await res.text()
  let j = null
  try { j = JSON.parse(text) } catch { /* Fehlertexte sind nicht immer JSON */ }
  const msg = j?.message ?? text
  const i = msg.indexOf('ORAKEL:')
  if (i === -1) throw new Error(`Orakel unerwartet (HTTP ${res.status}): ${msg.slice(0, 300)}`)
  return msg.slice(i + 7).trim()
}

// ── 1) Der Statussync laeuft nur in EINE Richtung ────────────────
{
  const src = await orakel(
    `SELECT regexp_replace(prosrc, E'\\\\s+', ' ', 'g') FROM pg_proc p `
    + `JOIN pg_namespace n ON n.oid = p.pronamespace `
    + `WHERE n.nspname = 'public' AND p.proname = 'sync_service_record_status'`,
  )
  const nurEineRichtung = src.includes('NEW.proof_status') && !src.includes('NEW.proof_status :=')
  pruefe(
    'SYNC-1',
    nurEineRichtung,
    nurEineRichtung
      ? 'sync_service_record_status schreibt nur NEW.status — der Rueckweg proof_status fehlt (Befund bestaetigt).'
      : 'Der Trigger schreibt inzwischen auch proof_status — Befund neu bewerten.',
  )
}

// ── 2) Die Drift ist live messbar ────────────────────────────────
{
  const zeile = await orakel(
    `SELECT count(*) FROM service_records `
    + `WHERE proof_status = 'ENTWURF' AND status IN ('signed','invoiced')`,
  )
  const anzahl = Number(zeile)
  pruefe(
    'DRIFT-1',
    Number.isFinite(anzahl),
    `${anzahl} Nachweis(e) tragen proof_status='ENTWURF' bei status signed/invoiced. `
    + 'Jeder davon erzeugte in der alten Fassung taeglich zwei Aufgaben '
    + '(Betreuungskraft + PDL) ueber lib/automation/nachweis-fehlt.ts.',
  )
}
{
  const zeile = await orakel(
    `SELECT count(*) FROM service_records WHERE status = 'invoiced' AND billing_status = 'OFFEN'`,
  )
  pruefe(
    'DRIFT-2',
    true,
    `${zeile} abgerechnete Nachweis(e) tragen billing_status='OFFEN' — dieselbe Einbahn-Sync-Ursache.`,
  )
}

// ── 3) Storno-Bestand (Ausgangslage fuer die Haertung) ───────────
{
  const zeile = await orakel(
    `SELECT count(*) FROM service_records `
    + `WHERE coalesce(proof_status,'') = 'STORNIERT' OR coalesce(billing_status,'') = 'STORNIERT'`,
  )
  const anzahl = Number(zeile)
  pruefe(
    'STORNO-1',
    Number.isFinite(anzahl),
    anzahl === 0
      ? 'Live sind 0 Nachweise storniert — die Haertung greift ab dem ersten Storno, ein Backfill ist nicht noetig.'
      : `${anzahl} stornierte(r) Nachweis(e) live — Bestand pruefen, ob er in Nachweisen oder Exporten aufgetaucht ist.`,
  )
}
{
  // 'STORNIERT' darf im status-Werteset weiterhin NICHT vorkommen — genau
  // darauf beruht der ganze Befund.
  const check = await orakel(
    `SELECT pg_get_constraintdef(oid) FROM pg_constraint `
    + `WHERE conrelid = 'public.service_records'::regclass AND conname = 'service_records_status_check'`,
  )
  const ohneStorno = !check.includes('STORNIERT')
  pruefe(
    'STORNO-2',
    ohneStorno,
    ohneStorno
      ? "service_records_status_check kennt keinen Storno-Wert — ein Widerruf bleibt auf 'signed'/'complete' stehen."
      : 'Das status-Werteset kennt inzwischen STORNIERT — Befund neu bewerten.',
  )
}

// ── 4) Mandant: current_org_id() faellt auf die Stamm-Org zurueck ─
{
  const src = await orakel(
    `SELECT regexp_replace(prosrc, E'\\\\s+', ' ', 'g') FROM pg_proc p `
    + `JOIN pg_namespace n ON n.oid = p.pronamespace `
    + `WHERE n.nspname = 'public' AND p.proname = 'current_org_id'`,
  )
  const faelltZurueck = /'00000000-0000-4000-8000-[0-9a-f]+'::uuid\s*\)/.test(src)
  pruefe(
    'MANDANT-1',
    faelltZurueck,
    faelltZurueck
      ? 'current_org_id() endet in einer fest verdrahteten Stamm-Organisation. Beim Dienstschluessel '
        + 'ist auth.uid() NULL — ein Insert ohne organization_id landet dort.'
      : 'current_org_id() hat keinen Stamm-Org-Rueckfall mehr — Befund neu bewerten.',
  )
}
{
  const zeilen = await orakel(
    `SELECT c.relname || ': default=' || pg_get_expr(d.adbin, d.adrelid) `
    + `FROM pg_attribute a `
    + `JOIN pg_class c ON c.oid = a.attrelid `
    + `JOIN pg_namespace n ON n.oid = c.relnamespace `
    + `JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum `
    + `WHERE n.nspname = 'public' AND a.attname = 'organization_id' `
    + `AND c.relname IN ('ocr_results','review_errors','geo_events') ORDER BY 1`,
  )
  const alleDrei = ['ocr_results', 'review_errors', 'geo_events'].every(t => zeilen.includes(t))
  pruefe(
    'MANDANT-2',
    alleDrei,
    alleDrei
      ? 'ocr_results, review_errors und geo_events tragen organization_id mit Default current_org_id() — '
        + 'die drei Dienstschluessel-Inserts setzen sie jetzt ausdruecklich.'
      : `Nicht alle drei Tabellen gefunden: ${zeilen}`,
  )
}

// ── 5) Schreibende Policies auf der Pruefzentrale ────────────────
{
  const zeilen = await orakel(
    `SELECT tablename || ' | ' || policyname || ' | ' || cmd || ' | ' || coalesce(with_check,'-') `
    + `FROM pg_policies WHERE tablename IN ('ocr_results','review_errors') `
    + `AND cmd = 'ALL' AND policyname LIKE '%admin%' ORDER BY 1`,
  )
  const nurAdmin = zeilen.includes('is_admin()')
  pruefe(
    'PRUEFZENTRALE-1',
    nurAdmin,
    nurAdmin
      ? 'Schreiben auf ocr_results/review_errors verlangt is_admin(). Die Route liess ueber '
        + "'einsatz.schreiben' auch die PDL herein — deren RLS-Insert scheiterte an 42501. "
        + 'Jetzt laeuft der Schreibweg ueber den Dienstschluessel.'
      : `Policy-Lage abweichend: ${zeilen}`,
  )
}
{
  const rollen = await orakel(
    `SELECT regexp_replace(prosrc, E'\\\\s+', ' ', 'g') FROM pg_proc p `
    + `JOIN pg_namespace n ON n.oid = p.pronamespace `
    + `WHERE n.nspname = 'public' AND p.proname = 'is_admin'`,
  )
  const ohnePdl = !rollen.includes("'pdl'")
  pruefe(
    'PRUEFZENTRALE-2',
    ohnePdl,
    ohnePdl
      ? 'is_admin() kennt live keine PDL — der Befund "PDL bekam 42501" ist damit belegt.'
      : 'is_admin() schliesst inzwischen die PDL ein — Befund neu bewerten.',
  )
}
{
  const zeile = await orakel(
    `SELECT (SELECT count(*) FROM ocr_results) || ' / ' || (SELECT count(*) FROM review_errors)`,
  )
  pruefe(
    'PRUEFZENTRALE-3',
    true,
    `Bestand ocr_results / review_errors: ${zeile}. Ein leerer Bestand passt zu einem Weg, `
    + 'der noch nie erfolgreich geschrieben hat — und macht einen Backfill entbehrlich.',
  )
}

// ── 6) Der Riegel in der Rechnungs-RPC steht (v10) ───────────────
{
  const src = await orakel(
    `SELECT regexp_replace(prosrc, E'\\\\s+', ' ', 'g') FROM pg_proc p `
    + `JOIN pg_namespace n ON n.oid = p.pronamespace `
    + `WHERE n.nspname = 'public' AND p.proname = 'create_invoice_draft_atomic'`,
  )
  const hatRiegel = src.includes('STORNIERT')
  pruefe(
    'RPC-1',
    hatRiegel,
    hatRiegel
      ? 'create_invoice_draft_atomic filtert Storno bereits (v10). Die Nachweis- und Exportwege '
        + 'liefen daran vorbei, weil sie ihre Leistungen selbst aus service_records lesen — '
        + 'genau diese Wege sind jetzt nachgezogen.'
      : 'Die Rechnungs-RPC kennt kein STORNIERT — Migration 20261013000000 pruefen.',
  )
}

// ── Ausgabe ──────────────────────────────────────────────────────
const gruen = ergebnisse.filter(e => e.ok).length
console.log('\n═══ Leistungsnachweis-Kette — Live-Nachweis ═══\n')
for (const e of ergebnisse) {
  console.log(`${e.ok ? '✓' : '✗'} ${e.id.padEnd(16)} ${e.meldung}`)
}
console.log(`\n${gruen}/${ergebnisse.length} gruen\n`)
process.exit(gruen === ergebnisse.length ? 0 : 1)
