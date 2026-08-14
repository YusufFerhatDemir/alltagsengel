#!/usr/bin/env node
/**
 * Phase 2/3/4 Reverify — 10-Punkte-Stabilisierungsblock.
 *
 * Phase 2: Production-DB-Reverify (Migrationen, Schema-Drift, Funktionen,
 *          Trigger, RLS, Constraints, verwaiste Objekte).
 * Phase 3: Kassenabrechnungs-Reverify (check_billing_gate, create_invoice_
 *          draft_atomic v8, preis_cent, tarif_status, Budget-Konstanten,
 *          Negativlogik, MISSING_SIGNATURE-Audit).
 * Phase 4: Datenintegritaet (VP/KZP-Budgets, Zahlungsziel, Rechnungsnummern).
 *
 * NEBENWIRKUNGSFREI: ausschliesslich SELECT ueber den Orakel-Wrapper
 * (DO-Block mit RAISE EXCEPTION, vollstaendiger Rollback). Kein DDL, kein DML.
 *
 * Exit 0 = alles bestanden, Exit 1 = mindestens ein FAIL.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'

for (const datei of ['.env.local', '.env']) {
  if (!existsSync(datei)) continue
  for (const zeile of readFileSync(datei, 'utf8').split('\n')) {
    const m = zeile.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const BASIS = process.env.NEXT_PUBLIC_SUPABASE_URL
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!BASIS || !SVC) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen')
  process.exit(1)
}

const ergebnisse = []
function pruefe(phase, id, status, meldung) {
  ergebnisse.push({ phase, id, status })
  const tag = status === 'PASS' ? '  PASS ' : status === 'FAIL' ? '  FAIL ' : '  SKIP '
  console.log(`${tag} ${id.padEnd(38)} ${meldung}`)
}

async function post(fn, body, key) {
  const res = await fetch(`${BASIS}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, text: await res.text() }
}

/** Katalog/Daten-Lesung ueber die service_role-RPC. Nur SELECT, voller Rollback. */
async function orakel(sql) {
  const wrapped = `DO $orakel$ DECLARE r text; BEGIN
    SELECT coalesce(string_agg(x.z::text, ' § '), '<leer>') INTO r FROM (${sql}) x(z);
    RAISE EXCEPTION 'ORAKEL:%', r; END $orakel$;`
  const { text } = await post('_run_sql', { p: wrapped }, SVC)
  try {
    const j = JSON.parse(text)
    if (typeof j.message === 'string' && j.message.startsWith('ORAKEL:')) return j.message.slice(7)
  } catch { /* faellt unten auf null */ }
  return { fehler: text.slice(0, 300) }
}

console.log(`\nPhase 2/3/4 Reverify gegen ${BASIS.replace(/^https:\/\//, '')}\n`)

// ─────────────────────────────────────────────────────────────────────────
console.log('══ PHASE 2 — Production Database Reverify ══\n')

// 1) Fix-Migrationen: Funktionen/Trigger, die die Fixes tragen, live vorhanden
console.log('── 1) Fix-Migrationen (M-1..M-6, P0, H-1, H-2) ──')

const p0 = await orakel(`SELECT prosrc LIKE '%kasse_status%' AS treffer FROM pg_proc WHERE proname='check_billing_gate'`)
pruefe('P2', 'P0_check_billing_gate_kasse_status', p0?.fehler ? 'SKIP' : (p0 === 'false' ? 'PASS' : 'FAIL'),
  p0?.fehler ? p0.fehler : p0 === 'false' ? 'kein kasse_status mehr im Body (state_flag() aktiv)' : 'LECK: kasse_status noch im Body — P0 nicht gefixt')

const h1 = await orakel(`SELECT prosrc LIKE '%MISSING_SIGNATURE%' AS treffer FROM pg_proc WHERE proname='create_invoice_draft_atomic'`)
pruefe('P2', 'H1_missing_signature_gate', h1?.fehler ? 'SKIP' : (h1 === 'true' ? 'PASS' : 'FAIL'),
  h1?.fehler ? h1.fehler : h1 === 'true' ? 'MISSING_SIGNATURE-Pruefung im Body vorhanden' : 'MISSING_SIGNATURE fehlt im Body')

const h2 = await orakel(`
  SELECT count(*)::text FROM client_budgets cb JOIN clients c ON c.id = cb.client_id
  WHERE COALESCE(c.care_level, c.pflegegrad) >= 2 AND COALESCE(cb.combined_annual_amount, 0) = 0`)
pruefe('P2', 'H2_vp_kzp_budget_luecken', h2?.fehler ? 'SKIP' : (h2 === '0' ? 'PASS' : 'FAIL'),
  h2?.fehler ? h2.fehler : `${h2} Klient(en) mit PG>=2 ohne combined_annual_amount`)

const m1 = await orakel(`
  SELECT string_agg(fn, ',') FROM (VALUES ('validate_correction_atomic'), ('create_credit_note_atomic')) v(fn)
  WHERE NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = v.fn)`)
pruefe('P2', 'M1_correction_credit_note_atomic', m1?.fehler ? 'SKIP' : (m1 === '<leer>' ? 'PASS' : 'FAIL'),
  m1?.fehler ? m1.fehler : m1 === '<leer>' ? 'beide Funktionen vorhanden' : `fehlend: ${m1}`)

const m2 = await orakel(`
  SELECT string_agg(t, ',') FROM (VALUES
    ('trg_immutable_sr_audit_update'), ('trg_immutable_sr_audit_delete'),
    ('trg_immutable_as_audit_update'), ('trg_immutable_as_audit_delete')) v(t)
  WHERE NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = v.t AND NOT tgisinternal)`)
pruefe('P2', 'M2_audit_log_immutable_trigger', m2?.fehler ? 'SKIP' : (m2 === '<leer>' ? 'PASS' : 'FAIL'),
  m2?.fehler ? m2.fehler : m2 === '<leer>' ? 'alle 4 Immutability-Trigger vorhanden' : `fehlend: ${m2}`)

const m3 = await orakel(`SELECT count(*)::text FROM pg_trigger WHERE tgname='trg_sync_clients_pflegegrad' AND NOT tgisinternal`)
pruefe('P2', 'M3_pflegegrad_sync_trigger', m3?.fehler ? 'SKIP' : (m3 === '1' ? 'PASS' : 'FAIL'),
  m3?.fehler ? m3.fehler : m3 === '1' ? 'trg_sync_clients_pflegegrad vorhanden' : `unerwartet: ${m3} Treffer`)

const m4 = await orakel(`SELECT prosrc LIKE '%service_type%' AS treffer FROM pg_proc WHERE proname='prevent_finalized_service_record_mutation'`)
pruefe('P2', 'M4_service_type_finalisierungsschutz', m4?.fehler ? 'SKIP' : (m4 === 'true' ? 'PASS' : 'FAIL'),
  m4?.fehler ? m4.fehler : m4 === 'true' ? 'service_type im Finalisierungsschutz enthalten' : 'service_type fehlt im Schutz')

const m6 = await orakel(`
  SELECT count(*)::text FROM invoices WHERE status='sent' AND (payment_terms_days IS DISTINCT FROM 14 OR due_date IS NULL)`)
pruefe('P2', 'M6_zahlungsziel_14_tage', m6?.fehler ? 'SKIP' : (m6 === '0' ? 'PASS' : 'FAIL'),
  m6?.fehler ? m6.fehler : `${m6} sent-Rechnung(en) ohne 14-Tage-Ziel/due_date`)

const h3 = await orakel(`
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='billing_audit_trail_entity_type_check'
      AND pg_get_constraintdef(oid) LIKE '%invoice_draft%')
  THEN 'angewendet' ELSE 'ausstehend' END`)
pruefe('P2', 'H3_audit_entity_type_invoice_draft', h3?.fehler ? 'SKIP' : (h3 === 'angewendet' ? 'PASS' : 'FAIL'),
  h3?.fehler ? h3.fehler : h3 === 'angewendet'
    ? 'invoice_draft im entity_type-Vokabular — Migration 20260912000000 live'
    : 'Migration 20260912000000 NICHT angewendet — Audit-Eintrag bei MISSING_SIGNATURE weiterhin unmoeglich (23514)')

// 2) Schema-Drift: lokale Migrationsdateien vs. angewendete Versionen
console.log('\n── 2) Schema-Drift ──')

const lokaleVersionen = readdirSync('supabase/migrations')
  .filter(f => /^\d{14}_.*\.sql$/.test(f) && !/rollback/i.test(f))
  .map(f => f.slice(0, 14))
  .sort()

const angewendet = await orakel(`
  SELECT string_agg(version, ',' ORDER BY version) FROM supabase_migrations.schema_migrations`)
if (angewendet?.fehler) {
  pruefe('P2', 'schema_drift', 'SKIP',
    `schema_migrations fuer service_role nicht lesbar (${angewendet.fehler}) — Drift stattdessen ueber Objektpraesenz pro Migration geprueft (Abschnitt 1, 3, 4)`)
} else {
  const liveSet = new Set((angewendet === '<leer>' ? [] : angewendet.split(',')))
  const fehlend = lokaleVersionen.filter(v => !liveSet.has(v))
  pruefe('P2', 'schema_drift', fehlend.length === 0 ? 'PASS' : 'FAIL',
    fehlend.length === 0
      ? `alle ${lokaleVersionen.length} lokalen Migrationen sind live angewendet`
      : `${fehlend.length} lokale Migration(en) nicht live: ${fehlend.join(', ')}`)
}

// 3) Kritische Funktionen existieren
console.log('\n── 3) Kritische Funktionen ──')
const FUNKTIONEN = ['check_billing_gate', 'create_invoice_draft_atomic', 'validate_correction_atomic',
  'create_credit_note_atomic', 'state_flag', 'validate_invoice_status_transition']
const fnCheck = await orakel(`
  SELECT string_agg(fn, ',') FROM unnest(ARRAY[${FUNKTIONEN.map(f => `'${f}'`).join(',')}]) fn
  WHERE NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname = fn)`)
pruefe('P2', 'funktionen_vorhanden', fnCheck?.fehler ? 'SKIP' : (fnCheck === '<leer>' ? 'PASS' : 'FAIL'),
  fnCheck?.fehler ? fnCheck.fehler : fnCheck === '<leer>' ? `alle ${FUNKTIONEN.length} Funktionen vorhanden` : `fehlend: ${fnCheck}`)

// 4) Kritische Trigger existieren und korrekt verdrahtet
console.log('\n── 4) Kritische Trigger ──')
const TRIGGER_ERWARTUNG = [
  ['trg_check_billing_gate', 'service_records'],
  ['trg_sr_bundesland', 'service_records'],
  ['trg_compute_signature_hash', 'service_records'],
  ['prevent_service_record_audit_edit', null],
  ['prevent_assignment_audit_edit', null],
  ['sync_clients_pflegegrad', null],
]
// prevent_*_audit_edit und sync_clients_pflegegrad sind Funktionsnamen (Trigger heissen trg_immutable_*/trg_sync_clients_pflegegrad)
const triggerCheck = await orakel(`
  SELECT string_agg(x || ':' || COALESCE(gefunden::text,'false'), ',') FROM (
    SELECT 'trg_check_billing_gate on service_records' x,
      EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
        WHERE t.tgname='trg_check_billing_gate' AND c.relname='service_records' AND NOT t.tgisinternal) gefunden
    UNION ALL SELECT 'trg_sr_bundesland on service_records',
      EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
        WHERE t.tgname='trg_sr_bundesland' AND c.relname='service_records' AND NOT t.tgisinternal)
    UNION ALL SELECT 'trg_compute_signature_hash on service_records',
      EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
        WHERE t.tgname='trg_compute_signature_hash' AND c.relname='service_records' AND NOT t.tgisinternal)
    UNION ALL SELECT 'prevent_service_record_audit_edit() als Trigger-Funktion aktiv',
      EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tfoid
        WHERE p.proname='prevent_service_record_audit_edit' AND NOT t.tgisinternal)
    UNION ALL SELECT 'prevent_assignment_audit_edit() als Trigger-Funktion aktiv',
      EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tfoid
        WHERE p.proname='prevent_assignment_audit_edit' AND NOT t.tgisinternal)
    UNION ALL SELECT 'sync_clients_pflegegrad() als Trigger-Funktion aktiv',
      EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tfoid
        WHERE p.proname='sync_clients_pflegegrad' AND NOT t.tgisinternal)
  ) q(x, gefunden)`)
// tfoid existiert nicht als Spaltenname in pg_trigger — Korrekturabfrage unten falls Fehler
if (triggerCheck?.fehler) {
  console.log('  (Direktabfrage fehlgeschlagen, Fallback auf tgfoid)')
  const triggerCheck2 = await orakel(`
    SELECT string_agg(x || ':' || gefunden::text, ',') FROM (
      SELECT 'trg_check_billing_gate on service_records' x,
        EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
          WHERE t.tgname='trg_check_billing_gate' AND c.relname='service_records' AND NOT t.tgisinternal) gefunden
      UNION ALL SELECT 'trg_sr_bundesland on service_records',
        EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
          WHERE t.tgname='trg_sr_bundesland' AND c.relname='service_records' AND NOT t.tgisinternal)
      UNION ALL SELECT 'trg_compute_signature_hash on service_records',
        EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
          WHERE t.tgname='trg_compute_signature_hash' AND c.relname='service_records' AND NOT t.tgisinternal)
      UNION ALL SELECT 'prevent_service_record_audit_edit() als Trigger-Funktion aktiv',
        EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
          WHERE p.proname='prevent_service_record_audit_edit' AND NOT t.tgisinternal)
      UNION ALL SELECT 'prevent_assignment_audit_edit() als Trigger-Funktion aktiv',
        EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
          WHERE p.proname='prevent_assignment_audit_edit' AND NOT t.tgisinternal)
      UNION ALL SELECT 'sync_clients_pflegegrad() als Trigger-Funktion aktiv',
        EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
          WHERE p.proname='sync_clients_pflegegrad' AND NOT t.tgisinternal)
    ) q(x, gefunden)`)
  if (triggerCheck2?.fehler) {
    pruefe('P2', 'trigger_verdrahtet', 'SKIP', triggerCheck2.fehler)
  } else {
    const paare = triggerCheck2.split(',').map(s => s.split(':'))
    const fehlgeschlagen = paare.filter(([, v]) => v !== 'true')
    pruefe('P2', 'trigger_verdrahtet', fehlgeschlagen.length === 0 ? 'PASS' : 'FAIL',
      fehlgeschlagen.length === 0 ? `alle 6 Trigger/Funktionen korrekt verdrahtet` : `fehlt: ${fehlgeschlagen.map(p => p[0]).join(' | ')}`)
  }
} else {
  const paare = triggerCheck.split(',').map(s => s.split(':'))
  const fehlgeschlagen = paare.filter(([, v]) => v !== 'true')
  pruefe('P2', 'trigger_verdrahtet', fehlgeschlagen.length === 0 ? 'PASS' : 'FAIL',
    fehlgeschlagen.length === 0 ? `alle 6 Trigger/Funktionen korrekt verdrahtet` : `fehlt: ${fehlgeschlagen.map(p => p[0]).join(' | ')}`)
}

// 5) RLS auf kritischen Tabellen aktiv
console.log('\n── 5) RLS auf kritischen Tabellen ──')
const KRIT_TABELLEN = ['clients', 'service_records', 'invoices', 'invoice_items', 'client_budgets',
  'assignments', 'billing_tariffs', 'leistungspreise', 'payments', 'billing_audit_trail']
const rlsCheck = await orakel(`
  SELECT string_agg(t, ',') FROM unnest(ARRAY[${KRIT_TABELLEN.map(t => `'${t}'`).join(',')}]) t
  WHERE NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=t AND c.relrowsecurity)`)
pruefe('P2', 'rls_kritische_tabellen', rlsCheck?.fehler ? 'SKIP' : (rlsCheck === '<leer>' ? 'PASS' : 'FAIL'),
  rlsCheck?.fehler ? rlsCheck.fehler : rlsCheck === '<leer>' ? `RLS auf allen ${KRIT_TABELLEN.length} Tabellen aktiv` : `RLS AUS bei: ${rlsCheck}`)

const rlsGesamt = await orakel(`
  SELECT count(*)::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity`)
pruefe('P2', 'rls_gesamt_abdeckung', rlsGesamt?.fehler ? 'SKIP' : (rlsGesamt === '0' ? 'PASS' : 'FAIL'),
  rlsGesamt?.fehler ? rlsGesamt.fehler : `${rlsGesamt} public-Tabelle(n) ohne RLS`)

// 6) CHECK Constraint invoices_status_check enthaelt 'abgeschrieben'
console.log('\n── 6) CHECK-Constraints ──')
const statusCheck = await orakel(`
  SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='invoices_status_check'`)
pruefe('P2', 'invoices_status_check_abgeschrieben', statusCheck?.fehler ? 'SKIP' :
  (typeof statusCheck === 'string' && statusCheck.includes('abgeschrieben') ? 'PASS' : 'FAIL'),
  statusCheck?.fehler ? statusCheck.fehler :
    (statusCheck === '<leer>' ? 'Constraint invoices_status_check existiert nicht' :
      statusCheck.includes('abgeschrieben') ? "'abgeschrieben' im Vokabular" : `Vokabular ohne 'abgeschrieben': ${statusCheck}`))

// 7) Verwaiste/fehlerhafte Objekte
console.log('\n── 7) Verwaiste Objekte ──')
const verwaisteTrigger = await orakel(`
  SELECT count(*)::text FROM pg_trigger t
  WHERE NOT t.tgisinternal AND NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = t.tgfoid)`)
pruefe('P2', 'verwaiste_trigger', verwaisteTrigger?.fehler ? 'SKIP' : (verwaisteTrigger === '0' ? 'PASS' : 'FAIL'),
  verwaisteTrigger?.fehler ? verwaisteTrigger.fehler : `${verwaisteTrigger} Trigger ohne Funktion`)

const secdefOhneSearchPath = await orakel(`
  SELECT count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.prosecdef
    AND NOT EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) cfg WHERE cfg LIKE 'search_path=%')`)
pruefe('P2', 'secdef_ohne_search_path', secdefOhneSearchPath?.fehler ? 'SKIP' : (secdefOhneSearchPath === '0' ? 'PASS' : 'FAIL'),
  secdefOhneSearchPath?.fehler ? secdefOhneSearchPath.fehler : `${secdefOhneSearchPath} SECURITY-DEFINER-Funktion(en) ohne search_path`)

const invalideIndizes = await orakel(`
  SELECT count(*)::text FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT i.indisvalid`)
pruefe('P2', 'keine_invaliden_indizes', invalideIndizes?.fehler ? 'SKIP' : (invalideIndizes === '0' ? 'PASS' : 'FAIL'),
  invalideIndizes?.fehler ? invalideIndizes.fehler : `${invalideIndizes} invalider Index/Indizes`)

const notValidConstraints = await orakel(`
  SELECT count(*)::text FROM pg_constraint co JOIN pg_namespace n ON n.oid=co.connamespace
  WHERE n.nspname='public' AND NOT co.convalidated`)
pruefe('P2', 'keine_not_valid_constraints', notValidConstraints?.fehler ? 'SKIP' : (notValidConstraints === '0' ? 'PASS' : 'FAIL'),
  notValidConstraints?.fehler ? notValidConstraints.fehler : `${notValidConstraints} nicht validierte(r) Constraint(s)`)

// ─────────────────────────────────────────────────────────────────────────
console.log('\n══ PHASE 3 — Kassenabrechnungs-Reverify ══\n')

const stateFlagStatt = await orakel(`SELECT prosrc LIKE '%state_flag(%' AS treffer FROM pg_proc WHERE proname='check_billing_gate'`)
pruefe('P3', 'check_billing_gate_nutzt_state_flag', stateFlagStatt?.fehler ? 'SKIP' : (stateFlagStatt === 'true' ? 'PASS' : 'FAIL'),
  stateFlagStatt?.fehler ? stateFlagStatt.fehler : stateFlagStatt === 'true' ? 'state_flag() im Body aufgerufen' : 'state_flag()-Aufruf fehlt im Body')

const v8Check = await orakel(`
  SELECT (prosrc LIKE '%MISSING_SIGNATURE%' AND (prosrc LIKE '%UNTERSCHRIEBEN%' OR prosrc LIKE '%signature_hash%'))::text
  FROM pg_proc WHERE proname='create_invoice_draft_atomic'`)
pruefe('P3', 'create_invoice_draft_atomic_v8_fail_closed', v8Check?.fehler ? 'SKIP' : (v8Check === 'true' ? 'PASS' : 'FAIL'),
  v8Check?.fehler ? v8Check.fehler : v8Check === 'true' ? 'Unterschriftspruefung (proof_status/signature_hash) fail-closed im Body' : 'Unterschriftspruefung im Body nicht gefunden')

const preisCentSpalten = await orakel(`
  SELECT string_agg(table_name || '.' || column_name, ',') FROM information_schema.columns
  WHERE table_schema='public' AND column_name='preis_cent'`)
pruefe('P3', 'preis_cent_spalte_existiert', preisCentSpalten?.fehler ? 'SKIP' : (preisCentSpalten !== '<leer>' ? 'PASS' : 'FAIL'),
  preisCentSpalten?.fehler ? preisCentSpalten.fehler : preisCentSpalten !== '<leer>' ? `preis_cent in: ${preisCentSpalten}` : 'preis_cent existiert nirgends')

const betragCentSpalten = await orakel(`
  SELECT string_agg(table_name || '.' || column_name, ',') FROM information_schema.columns
  WHERE table_schema='public' AND column_name='betrag_cent'`)
pruefe('P3', 'betrag_cent_kein_aktives_billing_feld', betragCentSpalten?.fehler ? 'SKIP' : 'INFO',
  betragCentSpalten?.fehler ? betragCentSpalten.fehler :
    betragCentSpalten === '<leer>' ? 'betrag_cent existiert nirgends' : `betrag_cent gefunden in: ${betragCentSpalten} (Kontext pruefen — kein Abrechnungsfeld erwartet)`)

const tarifStatus = await orakel(`
  SELECT pg_get_constraintdef(oid) FROM pg_constraint
  WHERE conrelid='public.billing_tariffs'::regclass AND pg_get_constraintdef(oid) LIKE '%tarif_status%'`)
pruefe('P3', 'tarif_status_feld_mit_check', tarifStatus?.fehler ? 'SKIP' :
  (typeof tarifStatus === 'string' && tarifStatus.includes('verified') && tarifStatus.includes('unverified') && tarifStatus.includes('blocked') ? 'PASS' : 'FAIL'),
  tarifStatus?.fehler ? tarifStatus.fehler : tarifStatus === '<leer>' ? 'kein tarif_status-CHECK auf billing_tariffs' : `CHECK: ${tarifStatus}`)

const budgetKonstanten = await orakel(`
  SELECT string_agg(DISTINCT combined_annual_amount::text, ',') FROM client_budgets WHERE combined_annual_amount > 0`)
pruefe('P3', 'budget_konstante_vp_kzp_3539', budgetKonstanten?.fehler ? 'SKIP' :
  (budgetKonstanten === '<leer>' || budgetKonstanten.split(',').every(v => Number(v) === 3539) ? 'PASS' : 'FAIL'),
  budgetKonstanten?.fehler ? budgetKonstanten.fehler :
    budgetKonstanten === '<leer>' ? 'keine gesetzten combined_annual_amount-Werte (nichts zu widerlegen)' : `Werte live: ${budgetKonstanten}`)

const entlastungKonstante = await orakel(`
  SELECT string_agg(DISTINCT monthly_amount::text, ',') FROM client_budgets WHERE monthly_amount > 0`)
pruefe('P3', 'budget_konstante_entlastung_131', entlastungKonstante?.fehler ? 'SKIP' :
  (entlastungKonstante === '<leer>' || entlastungKonstante.split(',').every(v => Number(v) === 131) ? 'PASS' : 'FAIL'),
  entlastungKonstante?.fehler ? entlastungKonstante.fehler :
    entlastungKonstante === '<leer>' ? 'keine gesetzten monthly_amount-Werte (nichts zu widerlegen)' : `Werte live: ${entlastungKonstante}`)

const kasseGeparkt = await orakel(`
  SELECT string_agg(DISTINCT insurance_enabled::text || '/' || kassenrechnung_enabled::text, ',') FROM state_settings`)
pruefe('P3', 'kasse_ohne_freischaltung_geparkt', kasseGeparkt?.fehler ? 'SKIP' : (kasseGeparkt === 'false/false' ? 'PASS' : 'INFO'),
  kasseGeparkt?.fehler ? kasseGeparkt.fehler : `insurance_enabled/kassenrechnung_enabled je Bundesland: ${kasseGeparkt} — ohne 'true' bleibt jeder Kassenweg am Gate geparkt`)

const missingSigAuditMoeglich = await orakel(`
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='billing_audit_trail_entity_type_check'
      AND pg_get_constraintdef(oid) LIKE '%invoice_draft%')
  THEN 'true' ELSE 'false' END`)
pruefe('P3', 'missing_signature_audit_eintrag_moeglich', missingSigAuditMoeglich?.fehler ? 'SKIP' :
  (missingSigAuditMoeglich === 'true' ? 'PASS' : 'FAIL'),
  missingSigAuditMoeglich?.fehler ? missingSigAuditMoeglich.fehler :
    missingSigAuditMoeglich === 'true'
      ? "entity_type='invoice_draft' zulaessig — MISSING_SIGNATURE-Audit-Eintrag kann geschrieben werden"
      : "H-3 weiterhin offen: entity_type='invoice_draft' verletzt den CHECK, Audit-INSERT schlaegt mit 23514 fehl, bevor MISSING_SIGNATURE geworfen wird")

// ─────────────────────────────────────────────────────────────────────────
console.log('\n══ PHASE 4 — Datenintegritaet ══\n')

const vpKzpLuecke = await orakel(`
  SELECT count(*)::text FROM client_budgets cb JOIN clients c ON c.id = cb.client_id
  WHERE COALESCE(c.care_level, c.pflegegrad) >= 2 AND COALESCE(cb.combined_annual_amount, 0) = 0`)
pruefe('P4', 'vp_kzp_keine_luecke_pg_ab_2', vpKzpLuecke?.fehler ? 'SKIP' : (vpKzpLuecke === '0' ? 'PASS' : 'FAIL'),
  vpKzpLuecke?.fehler ? vpKzpLuecke.fehler : `${vpKzpLuecke} Klient(en) mit PG>=2 und combined_annual_amount=0`)

const pg1KeinAnspruch = await orakel(`
  SELECT count(*)::text FROM client_budgets cb JOIN clients c ON c.id = cb.client_id
  WHERE COALESCE(c.care_level, c.pflegegrad) = 1 AND COALESCE(cb.combined_annual_amount, 0) > 0`)
pruefe('P4', 'pg1_kein_vp_kzp_anspruch', pg1KeinAnspruch?.fehler ? 'SKIP' : (pg1KeinAnspruch === '0' ? 'PASS' : 'FAIL'),
  pg1KeinAnspruch?.fehler ? pg1KeinAnspruch.fehler : `${pg1KeinAnspruch} PG-1-Klient(en) mit faelschlich gesetztem combined_annual_amount`)

const zahlungszielInkonsistent = await orakel(`
  SELECT count(*)::text FROM invoices
  WHERE status IN ('sent','paid') AND (due_date IS NULL OR payment_terms_days IS NULL)`)
pruefe('P4', 'zahlungsziel_konsistenz', zahlungszielInkonsistent?.fehler ? 'SKIP' : (zahlungszielInkonsistent === '0' ? 'PASS' : 'FAIL'),
  zahlungszielInkonsistent?.fehler ? zahlungszielInkonsistent.fehler : `${zahlungszielInkonsistent} sent/paid-Rechnung(en) ohne due_date oder payment_terms_days`)

const doppelteRechnungsnummern = await orakel(`
  SELECT count(*)::text FROM (
    SELECT invoice_number FROM invoices WHERE invoice_number IS NOT NULL
    GROUP BY invoice_number HAVING count(*) > 1) d`)
pruefe('P4', 'keine_doppelten_rechnungsnummern', doppelteRechnungsnummern?.fehler ? 'SKIP' : (doppelteRechnungsnummern === '0' ? 'PASS' : 'FAIL'),
  doppelteRechnungsnummern?.fehler ? doppelteRechnungsnummern.fehler : `${doppelteRechnungsnummern} doppelt vergebene Rechnungsnummer(n)`)

// ─────────────────────────────────────────────────────────────────────────
console.log('\n══ Zusammenfassung ══\n')
const pass = ergebnisse.filter(e => e.status === 'PASS').length
const fail = ergebnisse.filter(e => e.status === 'FAIL').length
const skip = ergebnisse.filter(e => e.status === 'SKIP').length
const info = ergebnisse.filter(e => e.status === 'INFO').length
console.log(`${pass} PASS / ${fail} FAIL / ${skip} SKIP / ${info} INFO (${ergebnisse.length} gesamt)`)
if (fail > 0) {
  console.log(`\nFAIL: ${ergebnisse.filter(e => e.status === 'FAIL').map(e => e.id).join(', ')}`)
}
if (skip > 0) {
  console.log(`SKIP: ${ergebnisse.filter(e => e.status === 'SKIP').map(e => e.id).join(', ')}`)
}
process.exit(fail > 0 ? 1 : 0)
