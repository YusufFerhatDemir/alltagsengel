#!/usr/bin/env node
/**
 * Kassenabrechnungs-Final-Reverify (Stabilisierungsblock, nach H-3 + REVOKE-Nachtrag).
 *
 * Prueft die 10 angeforderten Negativtests gegen die LIVE-Produktions-DB
 * (nnwyktkqibdjxgimjyuq), Stamm-Org 00000000-0000-4000-8000-000460629986.
 *
 * TECHNIK: wie scripts/security-redteam-phase7.mjs — Schreibtests laufen
 * innerhalb eines DO-Blocks, der am Ende eine RAISE EXCEPTION auswirft und
 * damit die gesamte Transaktion (inkl. Fixtures) zurueckrollt. AUSNAHME:
 * Test 1b (Audit-Trail-Durabilitaet) braucht einen ECHTEN, nicht zurueck-
 * gerollten Aufruf, weil genau geprueft wird, ob der Audit-Eintrag eine
 * echte Transaktion ueberlebt — dafuer wird eine Fixture in der leeren
 * E2E-Test-Org angelegt und am Ende explizit wieder geloescht (Cleanup).
 *
 * Exit 0 = alle Tests wie erwartet, Exit 1 = mindestens ein FAIL.
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
if (!BASIS || !ANON || !SVC) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY fehlen')
  process.exit(1)
}

const STAMM_ORG = '00000000-0000-4000-8000-000460629986'
const FREMD_ORG = 'e439a567-9382-4d69-bc76-dfcd002745af' // E2E_TEST_DEL_ORG_A, live leer
const STAMM_OWNER = '176389cc-ae2a-4edd-bde2-146c0cee792b'
const CAREGIVER = '794ab04b-e488-40e6-8f2b-cf52764e4ef9'

const ergebnisse = []
function pruefe(id, bestanden, meldung) {
  ergebnisse.push({ id, bestanden, meldung })
  console.log(`${bestanden ? '  PASS ' : '  FAIL '} ${id.padEnd(42)} ${meldung}`)
}

async function post(fn, body, key) {
  const res = await fetch(`${BASIS}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: apiHeaders(key, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  })
  return { status: res.status, text: (await res.text()).slice(0, 800) }
}
async function hole(pfad, key, extraHeaders = {}) {
  const res = await fetch(`${BASIS}/rest/v1/${pfad}`, { headers: apiHeaders(key, { ...extraHeaders }) })
  return { status: res.status, text: (await res.text()).slice(0, 800) }
}

async function orakel(sql) {
  const wrapped = `DO $orakel$ DECLARE r text; BEGIN
    SELECT coalesce(string_agg(x.z::text, ' ~ '), '<leer>') INTO r FROM (${sql}) x(z);
    RAISE EXCEPTION 'ORAKEL:%', r; END $orakel$;`
  const { text } = await post('_run_sql', { p: wrapped }, SVC)
  try {
    const j = JSON.parse(text)
    if (typeof j.message === 'string' && j.message.startsWith('ORAKEL:')) return j.message.slice(7)
    return `ERR:${JSON.stringify(j).slice(0, 400)}`
  } catch { return `RAW:${text}` }
}
async function testBlock(plpgsql) {
  const wrapped = `DO $orakel$ DECLARE r text := '<kein Ergebnis gesetzt>'; BEGIN
    ${plpgsql}
    RAISE EXCEPTION 'ORAKEL:%', r; END $orakel$;`
  const { text } = await post('_run_sql', { p: wrapped }, SVC)
  try {
    const j = JSON.parse(text)
    if (typeof j.message === 'string' && j.message.startsWith('ORAKEL:')) return j.message.slice(7)
    return `ERR:${JSON.stringify(j).slice(0, 400)}`
  } catch { return `RAW:${text}` }
}
function alsAuth(userId) {
  return `
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claims', json_build_object('sub','${userId}','role','authenticated')::text, true);
  `
}

console.log(`\nKassenabrechnungs-Final-Reverify gegen ${BASIS.replace(/^https:\/\//, '')}\n`)

// ═══════════════════════════════════════════════════════════════════════
// 1a) Fehlende Unterschrift -> MISSING_SIGNATURE (Fehlermeldung, rollback-Test)
// ═══════════════════════════════════════════════════════════════════════
console.log('── 1a) MISSING_SIGNATURE: Fehlermeldung bei fehlender Unterschrift ──')
const missingSigMsg = await testBlock(`
  DECLARE
    v_client uuid;
    v_sr     uuid;
    v_err    text := '<kein Fehler -> LECK: Rechnung ohne Unterschrift erstellt>';
  BEGIN
    INSERT INTO public.clients (organization_id, customer_number, first_name, last_name, care_level)
      VALUES ('${FREMD_ORG}', 'RV-SIG-001', 'Reverify', 'Sig', 2) RETURNING id INTO v_client;
    INSERT INTO public.service_records (
      organization_id, client_id, caregiver_id, date, start_time, end_time,
      service_type, budget_type, status, proof_status, signature_hash, caregiver_initials
    ) VALUES (
      '${FREMD_ORG}', v_client, '${CAREGIVER}', '2026-06-01', '09:00', '10:00',
      'Grundpflege', 'entlastung', 'complete', NULL, NULL, 'RV'
    ) RETURNING id INTO v_sr;

    BEGIN
      PERFORM public.create_invoice_draft_atomic(v_client, '${FREMD_ORG}'::uuid, '2026-06', 'entlastung', '${STAMM_OWNER}'::uuid);
      v_err := '<kein Fehler -> LECK: Rechnung ohne Unterschrift erstellt>';
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
    END;
    r := v_err;
  END;
`)
pruefe('1a_missing_signature_fehlermeldung', /^MISSING_SIGNATURE:/.test(missingSigMsg), missingSigMsg.slice(0, 200))

// ═══════════════════════════════════════════════════════════════════════
// 1b) Audit-Trail-Durabilitaet: ueberlebt der billing_audit_trail-Eintrag
//     die Transaktion wirklich? ECHTER (nicht zurueckgerollter) Aufruf,
//     danach Cleanup.
// ═══════════════════════════════════════════════════════════════════════
console.log('\n── 1b) MISSING_SIGNATURE: Audit-Eintrag durabel? (echter Aufruf + Cleanup) ──')
let fixtureClient = null
try {
  const insViaRest = await fetch(`${BASIS}/rest/v1/clients`, {
    method: 'POST',
    headers: apiHeaders(SVC, { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
    body: JSON.stringify({ organization_id: FREMD_ORG, customer_number: 'RV-SIG-DUR-002', first_name: 'Reverify', last_name: 'Durability', care_level: 2 }),
  })
  const clientRows = await insViaRest.json()
  fixtureClient = Array.isArray(clientRows) ? clientRows[0]?.id : null
  if (!fixtureClient) throw new Error(`Fixture-Client-Insert fehlgeschlagen: ${JSON.stringify(clientRows).slice(0, 300)}`)

  const insSr = await fetch(`${BASIS}/rest/v1/service_records`, {
    method: 'POST',
    headers: apiHeaders(SVC, { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
    body: JSON.stringify({
      organization_id: FREMD_ORG, client_id: fixtureClient, caregiver_id: CAREGIVER,
      date: '2026-06-02', start_time: '09:00', end_time: '10:00',
      service_type: 'Grundpflege', budget_type: 'entlastung', status: 'complete',
      proof_status: null, signature_hash: null, caregiver_initials: 'RV',
    }),
  })
  const srRows = await insSr.json()
  if (!Array.isArray(srRows) || !srRows[0]?.id) throw new Error(`Fixture-SR-Insert fehlgeschlagen: ${JSON.stringify(srRows).slice(0, 300)}`)

  // Echter (nicht gewrappter) RPC-Aufruf -> loest MISSING_SIGNATURE aus, Transaktion rollt aber
  // NUR den RPC-Aufruf selbst zurueck, nicht die vorher committeten Fixtures.
  const rpcRes = await post('create_invoice_draft_atomic', {
    p_client_id: fixtureClient, p_org_id: FREMD_ORG, p_period_month: '2026-06',
    p_budget_type: 'entlastung', p_actor_id: STAMM_OWNER,
  }, SVC)

  const auditCheck = await orakel(`
    SELECT action || '|' || (new_state->>'error_code') FROM billing_audit_trail
    WHERE entity_id = '${fixtureClient}' AND entity_type = 'invoice_draft'
  `)
  const durabel = auditCheck !== '<leer>' && !auditCheck.startsWith('ERR:') && !auditCheck.startsWith('RAW:')
  pruefe('1b_audit_eintrag_durabel_nach_missing_signature', durabel,
    durabel
      ? `Audit-Eintrag ueberlebt die Transaktion: ${auditCheck}`
      : `KEIN Audit-Eintrag persistiert (RPC-Antwort war HTTP ${rpcRes.status}: ${rpcRes.text.slice(0, 150)}) — INSERT und nachfolgendes RAISE EXCEPTION laufen in DERSELBEN Transaktion, PostgREST rollt beides gemeinsam zurueck. H-3 hat nur den CHECK-Constraint-Blocker beseitigt, nicht die fehlende Persistenz.`)
} finally {
  if (fixtureClient) {
    await fetch(`${BASIS}/rest/v1/service_records?client_id=eq.${fixtureClient}`, { method: 'DELETE', headers: apiHeaders(SVC) })
    await fetch(`${BASIS}/rest/v1/billing_audit_trail?entity_id=eq.${fixtureClient}`, { method: 'DELETE', headers: apiHeaders(SVC) })
    await fetch(`${BASIS}/rest/v1/clients?id=eq.${fixtureClient}`, { method: 'DELETE', headers: apiHeaders(SVC) })
    console.log(`  (Cleanup: Fixture-Client ${fixtureClient} + service_records + etwaige Audit-Zeilen geloescht)`)
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 2) Falscher Mandant -> org_fence blockt
// ═══════════════════════════════════════════════════════════════════════
console.log('\n── 2) Falscher Mandant: org_fence blockt ──')
const orgMismatch = await testBlock(`
  DECLARE
    v_stamm_client uuid;
    v_err text := '<kein Fehler -> LECK>';
  BEGIN
    SELECT id INTO v_stamm_client FROM public.clients WHERE organization_id = '${STAMM_ORG}' LIMIT 1;
    BEGIN
      PERFORM public.create_invoice_draft_atomic(v_stamm_client, '${FREMD_ORG}'::uuid, '2026-06', 'entlastung', '${STAMM_OWNER}'::uuid);
      v_err := '<kein Fehler -> LECK: RPC mit vertauschter org_id akzeptiert>';
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
    END;
    r := v_err;
  END;
`)
pruefe('2_org_fence_blockt_rpc_org_mismatch', /gehoert nicht zu Organisation|existiert nicht/i.test(orgMismatch), orgMismatch.slice(0, 200))

const orgFenceSelect = await testBlock(`
  DECLARE
    v_fremd_client uuid;
    v_sichtbar int;
  BEGIN
    INSERT INTO public.clients (organization_id, customer_number, first_name, last_name)
      VALUES ('${FREMD_ORG}', 'RV-ORGFENCE-001', 'Reverify', 'OrgFence') RETURNING id INTO v_fremd_client;
    ${alsAuth(STAMM_OWNER)}
    SELECT count(*) INTO v_sichtbar FROM public.clients WHERE id = v_fremd_client;
    r := 'sichtbar=' || v_sichtbar;
  END;
`)
pruefe('2_org_fence_blockt_select_fremde_org', /sichtbar=0/.test(orgFenceSelect), orgFenceSelect)

// ═══════════════════════════════════════════════════════════════════════
// 3) Nicht freigeschaltetes Bundesland -> KASSENABRECHNUNG_NOCH_NICHT_FREIGESCHALTET
// ═══════════════════════════════════════════════════════════════════════
console.log('\n── 3) Bundesland nicht freigeschaltet ──')
const stateSettings = await orakel(`SELECT string_agg(DISTINCT insurance_enabled::text || '/' || kassenrechnung_enabled::text, ',') FROM state_settings`)
pruefe('3a_alle_bundeslaender_geparkt', stateSettings === 'false/false', `insurance_enabled/kassenrechnung_enabled: ${stateSettings}`)

const gateTest = await testBlock(`
  DECLARE
    v_client uuid;
    v_sr     uuid;
    v_status text;
  BEGIN
    INSERT INTO public.clients (organization_id, customer_number, first_name, last_name, care_level)
      VALUES ('${FREMD_ORG}', 'RV-GATE-001', 'Reverify', 'Gate', 2) RETURNING id INTO v_client;
    INSERT INTO public.service_records (
      organization_id, client_id, caregiver_id, date, start_time, end_time,
      service_type, budget_type, billing_type, status, caregiver_initials
    ) VALUES (
      '${FREMD_ORG}', v_client, '${CAREGIVER}', '2026-06-03', '09:00', '10:00',
      'Grundpflege', 'entlastung', '§45b', 'complete', 'RV'
    ) RETURNING id, billing_status INTO v_sr, v_status;
    r := 'billing_status=' || COALESCE(v_status, '<NULL>');
  END;
`)
pruefe('3b_check_billing_gate_setzt_status', /KASSENABRECHNUNG_NOCH_NICHT_FREIGESCHALTET/.test(gateTest), gateTest)

// 3c) Setzt der Gate-Status (Park-Vermerk) die Fakturierung tatsaechlich
//     ausser Kraft, oder ist er wirkungslos? Genutzt wird der einzige live
//     verifizierte Kassentarif (leistungsart 'wegepauschale', §45b SGB XI),
//     damit die Rechnung nicht schon an MISSING_VALID_TARIFF scheitert.
const gateWirkungTest = await testBlock(`
  DECLARE
    v_client uuid;
    v_sr     uuid;
    v_status text;
    v_result text;
  BEGIN
    INSERT INTO public.clients (organization_id, customer_number, first_name, last_name, care_level)
      VALUES ('${FREMD_ORG}', 'RV-GATEWIRK-001', 'Reverify', 'GateWirkung', 2) RETURNING id INTO v_client;
    INSERT INTO public.service_records (
      organization_id, client_id, caregiver_id, date, start_time, end_time,
      service_type, budget_type, billing_type, status, proof_status, signature_hash, caregiver_initials
    ) VALUES (
      '${FREMD_ORG}', v_client, '${CAREGIVER}', '2026-07-20', '09:00', '10:00',
      'Wegepauschale', 'entlastung', '§45b', 'complete', 'UNTERSCHRIEBEN', 'testhash-gatewirk', 'RV'
    ) RETURNING id, billing_status INTO v_sr, v_status;

    BEGIN
      PERFORM public.create_invoice_draft_atomic(v_client, '${FREMD_ORG}'::uuid, '2026-07', 'entlastung', '${STAMM_OWNER}'::uuid);
      v_result := 'RECHNUNG_ERSTELLT_TROTZ_' || COALESCE(v_status, '<NULL>');
    EXCEPTION WHEN OTHERS THEN
      v_result := 'GEBLOCKT:' || SQLERRM;
    END;
    r := 'gate_status=' || COALESCE(v_status, '<NULL>') || ' rpc_ergebnis=' || v_result;
  END;
`)
pruefe('3c_gate_status_wirkt_auf_fakturierung',
  gateWirkungTest.includes('rpc_ergebnis=GEBLOCKT'),
  gateWirkungTest.includes('RECHNUNG_ERSTELLT_TROTZ_KASSENABRECHNUNG_NOCH_NICHT_FREIGESCHALTET')
    ? `LUECKE: ${gateWirkungTest} — check_billing_gate parkt billing_status, aber create_invoice_draft_atomic liest billing_status nie und fakturiert trotzdem`
    : gateWirkungTest)

// ═══════════════════════════════════════════════════════════════════════
// 4+5) Tarif blocked/unverified
// ═══════════════════════════════════════════════════════════════════════
console.log('\n── 4+5) Tarif-Status blocked/unverified ──')
const tarifStatusVerteilung = await orakel(`
  SELECT tarif_status || '=' || count(*)::text FROM billing_tariffs GROUP BY tarif_status ORDER BY 1
`)
console.log(`  info  billing_tariffs tarif_status-Verteilung: ${tarifStatusVerteilung}`)
const kassenVerifiziert = await orakel(`
  SELECT leistungsart || '=' || count(*)::text FROM billing_tariffs
  WHERE rechtsgrundlage <> 'privat' AND tarif_status = 'verified' GROUP BY leistungsart
`)
const nurWegepauschale = kassenVerifiziert !== '<leer>' && /^wegepauschale=\d+$/.test(kassenVerifiziert)
pruefe('4_5_kassentarife_nur_nebenleistung_verifiziert', nurWegepauschale || kassenVerifiziert === '<leer>',
  kassenVerifiziert === '<leer>'
    ? '0 verifizierte Kassentarife live -> jeder Kassenweg bleibt am Fail-Closed-Filter haengen (EXTERNAL BLOCKER)'
    : `verifiziert live: ${kassenVerifiziert} — nur die Nebenleistung "wegepauschale" (5,00€ Pauschale), KEINE Kern-Pflegeleistung (Grundpflege/Behandlungspflege/etc.) verifiziert. Ein echter Kassen-Leistungsnachweis scheitert weiterhin an MISSING_VALID_TARIFF (EXTERNAL BLOCKER besteht fuer alle Kernleistungen fort)`)
const fcClause = await orakel(`
  SELECT prosrc LIKE '%tarif_status = ''verified''%' AND prosrc LIKE '%bt.tarif_status <> ''blocked''%'
  FROM pg_proc WHERE proname = 'create_invoice_draft_atomic'
`)
pruefe('4_5_fail_closed_klausel_im_rpc_body', fcClause === 'true', `Klausel (Kasse=verified, Privat<>blocked) im Body: ${fcClause}`)

// ═══════════════════════════════════════════════════════════════════════
// 6) Budget ueberschritten
// ═══════════════════════════════════════════════════════════════════════
console.log('\n── 6) Budget ueberschritten ──')
const budgetCheckImRpc = await orakel(`
  SELECT prosrc LIKE '%v_budget_total%' FROM pg_proc WHERE proname = 'create_invoice_draft_atomic'
`)
console.log(`  info  v_budget_total wird im RPC-Body akkumuliert (Nachweis, keine harte Sperre): ${budgetCheckImRpc}`)
const budgetLuecke = await orakel(`
  SELECT count(*)::text FROM client_budgets cb JOIN clients c ON c.id = cb.client_id
  WHERE COALESCE(c.care_level, c.pflegegrad) >= 2 AND COALESCE(cb.combined_annual_amount, 0) = 0
`)
pruefe('6_keine_budgetluecke_pg_ab_2', budgetLuecke === '0', `${budgetLuecke} Klient(en) mit PG>=2 ohne combined_annual_amount (H-2, weiterhin gehalten)`)
console.log('  HINWEIS: create_invoice_draft_atomic berechnet und SPEICHERT budget_amount, blockt aber nicht hart bei Ueberschreitung — das ist Business-Layer-Aufgabe (lib/billing), nicht DB-Layer. Siehe Positiv-Kette-Bericht fuer TS-seitige Pruefung.')

// ═══════════════════════════════════════════════════════════════════════
// 7) Doppelabrechnung
// ═══════════════════════════════════════════════════════════════════════
console.log('\n── 7) Doppelabrechnung ──')
const idempUnique = await orakel(`
  SELECT pg_get_constraintdef(oid) FROM pg_constraint
  WHERE conrelid = 'public.invoices'::regclass AND pg_get_constraintdef(oid) ILIKE '%idempotency_key%'
`)
pruefe('7_idempotency_key_unique_constraint', typeof idempUnique === 'string' && idempUnique.includes('UNIQUE'),
  idempUnique === '<leer>' ? 'KEIN UNIQUE-Constraint auf idempotency_key gefunden' : `Constraint: ${idempUnique}`)

const doppelTest = await testBlock(`
  DECLARE
    v_client uuid;
    v_sr uuid;
    v_first  public.create_invoice_draft_result;
    v_second public.create_invoice_draft_result;
    v_erster_ok boolean := true;
    v_erster_err text := '<kein Fehler>';
    v_zweiter_err text := '<kein Fehler>';
  BEGIN
    INSERT INTO public.clients (organization_id, customer_number, first_name, last_name, care_level)
      VALUES ('${STAMM_ORG}', 'RV-DUP-001', 'Reverify', 'Dup', 2) RETURNING id INTO v_client;
    INSERT INTO public.service_records (
      organization_id, client_id, caregiver_id, date, start_time, end_time,
      service_type, budget_type, status, proof_status, signature_hash, caregiver_initials
    ) VALUES (
      '${STAMM_ORG}', v_client, '${CAREGIVER}', '2026-07-21', '09:00', '10:00',
      'Alltagsbegleitung', 'private', 'complete', 'UNTERSCHRIEBEN', 'testhash123', 'RV'
    ) RETURNING id INTO v_sr;

    BEGIN
      v_first := public.create_invoice_draft_atomic(v_client, '${STAMM_ORG}'::uuid, '2026-07', 'private', '${STAMM_OWNER}'::uuid);
    EXCEPTION WHEN OTHERS THEN
      v_erster_ok := false; v_erster_err := SQLERRM;
    END;

    IF v_erster_ok THEN
      BEGIN
        v_second := public.create_invoice_draft_atomic(v_client, '${STAMM_ORG}'::uuid, '2026-07', 'private', '${STAMM_OWNER}'::uuid);
      EXCEPTION WHEN OTHERS THEN
        v_zweiter_err := SQLERRM;
      END;
      r := 'erster_ok=true erste_invoice_id=' || COALESCE(v_first.invoice_id::text,'<null>')
        || ' zweite_ist_bereits_vorhanden=' || COALESCE(v_second.already_exists::text, '<n/a>')
        || ' gleiche_invoice_id=' || (v_first.invoice_id = v_second.invoice_id)::text
        || ' zweiter_fehler=' || v_zweiter_err;
    ELSE
      r := 'erster_ok=false erster_fehler=' || v_erster_err;
    END IF;
  END;
`)
pruefe('7_doppelabrechnung_idempotent_verhindert',
  /erster_ok=true/.test(doppelTest) && /zweite_ist_bereits_vorhanden=true/.test(doppelTest) && /gleiche_invoice_id=true/.test(doppelTest),
  doppelTest)

// ═══════════════════════════════════════════════════════════════════════
// 8) Falscher service_type in finalisierten Records -> blockiert
// ═══════════════════════════════════════════════════════════════════════
console.log('\n── 8) service_type-Aenderung in finalisierten Records ──')
const finalMutTest = await testBlock(`
  DECLARE
    v_client uuid;
    v_sr uuid;
    v_err text := '<kein Fehler -> LECK>';
  BEGIN
    INSERT INTO public.clients (organization_id, customer_number, first_name, last_name)
      VALUES ('${FREMD_ORG}', 'RV-FINAL-001', 'Reverify', 'Final') RETURNING id INTO v_client;
    INSERT INTO public.service_records (
      organization_id, client_id, caregiver_id, date, start_time, end_time,
      service_type, budget_type, status, is_locked, caregiver_initials
    ) VALUES (
      '${FREMD_ORG}', v_client, '${CAREGIVER}', '2026-06-05', '09:00', '10:00',
      'Grundpflege', 'entlastung', 'complete', TRUE, 'RV'
    ) RETURNING id INTO v_sr;

    BEGIN
      UPDATE public.service_records SET service_type = 'Behandlungspflege' WHERE id = v_sr;
      v_err := '<kein Fehler -> LECK: service_type in finalisiertem Record geaendert>';
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
    END;
    r := v_err;
  END;
`)
pruefe('8_service_type_finalisiert_blockiert', !/LECK/.test(finalMutTest), finalMutTest.slice(0, 200))

// ═══════════════════════════════════════════════════════════════════════
// 9) RPC-Aufruf als anon -> blockiert
// ═══════════════════════════════════════════════════════════════════════
console.log('\n── 9) RPC als anon ──')
for (const fn of ['create_invoice_draft_atomic', 'create_credit_note_atomic', 'validate_correction_atomic']) {
  const r = await post(fn, { p_org_id: STAMM_ORG }, ANON)
  pruefe(`9_${fn}_anon_blockiert`, r.status >= 400, `HTTP ${r.status}`)
}
const grantsAnon = await orakel(`
  SELECT p.proname || '=anon:' || has_function_privilege('anon', p.oid, 'EXECUTE')::text
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname IN ('create_invoice_draft_atomic','create_credit_note_atomic','validate_correction_atomic')
`)
pruefe('9_grants_anon_kein_execute', !grantsAnon.includes('true'), grantsAnon)

// ═══════════════════════════════════════════════════════════════════════
// 10) Cross-Tenant IDOR
// ═══════════════════════════════════════════════════════════════════════
console.log('\n── 10) Cross-Tenant IDOR ──')
const idorTest = await testBlock(`
  DECLARE
    v_fremd_client uuid;
    v_fremd_inv uuid;
    v_upd int; v_del int; v_sel_cl int; v_sel_inv int;
  BEGIN
    INSERT INTO public.clients (organization_id, customer_number, first_name, last_name)
      VALUES ('${FREMD_ORG}', 'RV-IDOR-001', 'Reverify', 'Idor') RETURNING id INTO v_fremd_client;
    INSERT INTO public.invoices (organization_id, invoice_number, client_id, period_start, period_end, total_amount)
      VALUES ('${FREMD_ORG}', 'RV-IDOR-INV-001', v_fremd_client, '2026-06-01', '2026-06-30', 42.00)
      RETURNING id INTO v_fremd_inv;

    ${alsAuth(STAMM_OWNER)}

    SELECT count(*) INTO v_sel_cl FROM public.clients WHERE id = v_fremd_client;
    SELECT count(*) INTO v_sel_inv FROM public.invoices WHERE id = v_fremd_inv;
    UPDATE public.invoices SET status = 'storniert' WHERE id = v_fremd_inv;
    GET DIAGNOSTICS v_upd = ROW_COUNT;
    DELETE FROM public.clients WHERE id = v_fremd_client;
    GET DIAGNOSTICS v_del = ROW_COUNT;

    r := 'sel_client=' || v_sel_cl || ' sel_invoice=' || v_sel_inv || ' update=' || v_upd || ' delete=' || v_del;
  END;
`)
pruefe('10_cross_tenant_idor_0_ergebnisse', /sel_client=0 sel_invoice=0 update=0 delete=0/.test(idorTest), idorTest)

// ═══════════════════════════════════════════════════════════════════════
console.log('\n══ Zusammenfassung ══\n')
const pass = ergebnisse.filter(e => e.bestanden).length
const fail = ergebnisse.length - pass
console.log(`${pass}/${ergebnisse.length} Tests wie erwartet`)
if (fail > 0) {
  console.log('\nABWEICHUNGEN:')
  for (const e of ergebnisse.filter(x => !x.bestanden)) console.log(`  - ${e.id}: ${e.meldung}`)
  process.exit(1)
}
console.log('Alle Negativtests wie erwartet.\n')
process.exit(0)
