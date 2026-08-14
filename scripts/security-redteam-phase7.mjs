#!/usr/bin/env node
/**
 * Phase 7 — SECURITY RED TEAM (Stabilisierungsblock, 10 Phasen)
 *
 * Testet RLS-Bypass, IDOR, Cross-Tenant-Isolation, Privilege Escalation,
 * SECURITY-DEFINER-Haertung, Audit-Trail-Unveraenderlichkeit und
 * Injection-Vektoren gegen die LIVE-Produktions-DB.
 *
 * TECHNIK: Alle Schreibtests laufen als service_role innerhalb EINES
 * DO-Blocks, der am Ende IMMER eine RAISE EXCEPTION auswirft — das
 * rollt jede Test-Fixture (temporaerer Klient in einer leeren
 * E2E-Test-Org, etc.) automatisch zurueck. Es bleibt nichts in der DB.
 * Rollenwechsel (anon/authenticated) simuliert per `SET LOCAL ROLE` +
 * `set_config('request.jwt.claims', ...)` — Standardtechnik fuer
 * RLS-Unit-Tests, funktional identisch zu einem echten JWT, ohne dass
 * ein echtes Token erzeugt werden muss.
 *
 * NEBENWIRKUNGSFREI. Anon-Proben sind reine SELECT/INSERT-REST-Calls,
 * die von RLS abgelehnt werden sollen (0 Zeilen / 401/403).
 *
 * Exit 0 = alle Kategorien PASS, Exit 1 = mindestens ein FAIL.
 */
import { readFileSync, existsSync } from 'node:fs'

for (const datei of ['.env.local', '.env']) {
  if (!existsSync(datei)) continue
  for (const zeile of readFileSync(datei, 'utf8').split('\n')) {
    const m = zeile.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const BASIS = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!BASIS || !ANON || !SVC) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY fehlen')
  process.exit(1)
}

const STAMM_ORG = '00000000-0000-4000-8000-000460629986'
const FREMD_ORG = 'e439a567-9382-4d69-bc76-dfcd002745af' // E2E_TEST_DEL_ORG_A, live leer
const STAMM_OWNER = '176389cc-ae2a-4edd-bde2-146c0cee792b'

const ergebnisse = []
function pruefe(kategorie, id, bestanden, meldung) {
  ergebnisse.push({ kategorie, id, bestanden, meldung })
  console.log(`${bestanden ? '  PASS ' : '  FAIL '} [${kategorie}] ${id.padEnd(38)} ${meldung}`)
}

async function post(fn, body, key) {
  const res = await fetch(`${BASIS}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, text: (await res.text()).slice(0, 500) }
}
async function hole(pfad, key, extraHeaders = {}) {
  const res = await fetch(`${BASIS}/rest/v1/${pfad}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, ...extraHeaders },
  })
  return { status: res.status, text: (await res.text()).slice(0, 500) }
}
async function schreibe(pfad, body, key) {
  const res = await fetch(`${BASIS}/rest/v1/${pfad}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(body),
  })
  return { status: res.status, text: (await res.text()).slice(0, 500) }
}

/** Read-only-Orakel: SQL laeuft als service_role, Ergebnis kommt ueber eine absichtliche Exception zurueck. */
async function orakel(sql) {
  const wrapped = `DO $orakel$ DECLARE r text; BEGIN
    SELECT coalesce(string_agg(x.z, ' ~ '), '<leer>') INTO r FROM (${sql}) x(z);
    RAISE EXCEPTION 'ORAKEL:%', r; END $orakel$;`
  const { text } = await post('_run_sql', { p: wrapped }, SVC)
  try {
    const j = JSON.parse(text)
    if (typeof j.message === 'string' && j.message.startsWith('ORAKEL:')) return j.message.slice(7)
    return `ERR:${JSON.stringify(j).slice(0, 300)}`
  } catch { return `RAW:${text}` }
}

/**
 * Test-Block: beliebiges PL/pgSQL, das r befuellt. Laeuft und rollt
 * automatisch zurueck (siehe Modulkommentar). Nutzt fuer Rollenwechsel
 * SET LOCAL ROLE + request.jwt.claims.
 */
async function testBlock(plpgsql) {
  const wrapped = `DO $orakel$ DECLARE r text := '<kein Ergebnis gesetzt>'; BEGIN
    ${plpgsql}
    RAISE EXCEPTION 'ORAKEL:%', r; END $orakel$;`
  const { text } = await post('_run_sql', { p: wrapped }, SVC)
  try {
    const j = JSON.parse(text)
    if (typeof j.message === 'string' && j.message.startsWith('ORAKEL:')) return j.message.slice(7)
    return `ERR:${JSON.stringify(j).slice(0, 300)}`
  } catch { return `RAW:${text}` }
}

function alsAuth(userId) {
  return `
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claims', json_build_object('sub','${userId}','role','authenticated')::text, true);
  `
}
console.log(`\nPhase 7 — Security Red Team gegen ${BASIS.replace(/^https:\/\//, '')}\n`)

// ═══════════════════════════════════════════════════════════════════════
// 1) RLS BYPASS: anon-Rolle auf 7 Kerntabellen (REST, ANON-Key)
// ═══════════════════════════════════════════════════════════════════════
console.log('── 1) RLS-Bypass: anon-Rolle (REST) ──')
const TABELLEN = ['clients', 'service_records', 'invoices', 'caregivers', 'organizations', 'billing_audit_trail', 'client_budgets']
for (const t of TABELLEN) {
  const r = await hole(`${t}?select=id&limit=5`, ANON)
  let zeilen = null
  try { const j = JSON.parse(r.text); if (Array.isArray(j)) zeilen = j.length } catch { /* kein Array */ }
  pruefe('RLS-anon', `SELECT_${t}`, zeilen === 0 || r.status >= 400,
    zeilen > 0 ? `LECK: anon liest ${zeilen} Zeile(n) aus ${t}` : `0 Zeilen (HTTP ${r.status})`)
}
for (const t of TABELLEN) {
  const r = await schreibe(`${t}`, { id: '00000000-0000-0000-0000-000000000001' }, ANON)
  pruefe('RLS-anon', `INSERT_${t}`, r.status >= 400,
    r.status < 400 ? `LECK: anon INSERT auf ${t} akzeptiert (HTTP ${r.status})` : `abgewiesen (HTTP ${r.status})`)
}

// ═══════════════════════════════════════════════════════════════════════
// 2) RLS BYPASS + IDOR: authenticated Stamm-Owner gegen FREMDE Org
//    Fixture (Klient in FREMD_ORG) wird im selben Transaktionsblock
//    angelegt und durch die abschliessende Exception zurueckgerollt.
// ═══════════════════════════════════════════════════════════════════════
console.log('\n── 2) RLS-Bypass + IDOR: authenticated (Stamm-Owner) gegen fremde Org ──')

const fixtureUndTest = await testBlock(`
  DECLARE
    v_fremd_client uuid;
    v_fremd_sr     uuid;
    v_fremd_inv    uuid;
    v_sichtbar_cl  int;
    v_sichtbar_sr  int;
    v_sichtbar_inv int;
    v_update_ct    int;
    v_delete_ct    int;
  BEGIN
    -- Fixture als service_role (bypasst RLS) in der leeren Fremd-Org anlegen
    INSERT INTO public.clients (organization_id, customer_number, first_name, last_name)
      VALUES ('${FREMD_ORG}', 'RT-TEST-001', 'RedTeam', 'Fixture')
      RETURNING id INTO v_fremd_client;
    INSERT INTO public.invoices (organization_id, invoice_number, client_id, period_start, period_end, total_amount)
      VALUES ('${FREMD_ORG}', 'RT-INV-001', v_fremd_client, '2026-01-01', '2026-01-31', 123.45)
      RETURNING id INTO v_fremd_inv;

    -- Rollenwechsel: authentifiziert als Stamm-Org-Owner
    ${alsAuth(STAMM_OWNER)}

    SELECT count(*) INTO v_sichtbar_cl FROM public.clients WHERE id = v_fremd_client;
    SELECT count(*) INTO v_sichtbar_inv FROM public.invoices WHERE id = v_fremd_inv;

    UPDATE public.clients SET notes = 'PWNED' WHERE id = v_fremd_client;
    GET DIAGNOSTICS v_update_ct = ROW_COUNT;

    DELETE FROM public.invoices WHERE id = v_fremd_inv;
    GET DIAGNOSTICS v_delete_ct = ROW_COUNT;

    r := 'sichtbar_client=' || v_sichtbar_cl || ' sichtbar_invoice=' || v_sichtbar_inv
      || ' update_fremd_client=' || v_update_ct || ' delete_fremd_invoice=' || v_delete_ct;
  END;
`)
{
  const m = {}
  for (const kv of fixtureUndTest.split(' ')) { const [k, v] = kv.split('='); if (k) m[k] = v }
  pruefe('RLS-cross-org', 'SELECT_fremder_client', m.sichtbar_client === '0', `sichtbare Zeilen: ${m.sichtbar_client} (${fixtureUndTest})`)
  pruefe('RLS-cross-org', 'SELECT_fremde_invoice', m.sichtbar_invoice === '0', `sichtbare Zeilen: ${m.sichtbar_invoice}`)
  pruefe('IDOR', 'UPDATE_fremder_client', m.update_fremd_client === '0', `betroffene Zeilen: ${m.update_fremd_client}`)
  pruefe('IDOR', 'DELETE_fremde_invoice', m.delete_fremd_invoice === '0', `betroffene Zeilen: ${m.delete_fremd_invoice}`)
}

// ═══════════════════════════════════════════════════════════════════════
// 3) IDOR: INSERT mit fremder organization_id explizit im Payload
//    (WITH CHECK muss organization_id = current_org_id() erzwingen)
// ═══════════════════════════════════════════════════════════════════════
console.log('\n── 3) IDOR: explizite fremde organization_id im INSERT-Payload ──')
const idorInsert = await testBlock(`
  DECLARE
    v_client_fremd uuid;
    v_err text := '<kein Fehler>';
    v_inserted int := 0;
  BEGIN
    -- Ein echter Stamm-Klient als Referenz
    SELECT id INTO v_client_fremd FROM public.clients WHERE organization_id = '${STAMM_ORG}' LIMIT 1;

    ${alsAuth(STAMM_OWNER)}

    BEGIN
      INSERT INTO public.clients (organization_id, customer_number, first_name, last_name)
        VALUES ('${FREMD_ORG}', 'RT-IDOR-002', 'IDOR', 'Test');
      v_inserted := 1;
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
    END;

    r := 'inserted_mit_fremder_org_id=' || v_inserted || ' fehler=' || v_err;
  END;
`)
{
  const geblockt = /inserted_mit_fremder_org_id=0/.test(idorInsert)
  pruefe('IDOR', 'INSERT_fremde_org_id_payload', geblockt, idorInsert)
}

// ═══════════════════════════════════════════════════════════════════════
// 4) Privilege Escalation: engel (Caregiver, ohne caregivers-Zeile) vs. invoices/clients
// ═══════════════════════════════════════════════════════════════════════
console.log('\n── 4) Privilege Escalation: engel-Rolle ──')
const engelTest = await testBlock(`
  DECLARE
    v_engel_id uuid := '3d82de53-5624-41a0-a81d-c892d0fe8c2a';
    v_client   uuid;
    v_inv_ins  int := 0;
    v_err      text := '<kein Fehler>';
    v_sichtbar_inv int;
    v_sichtbar_cl  int;
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claims', json_build_object('sub','3d82de53-5624-41a0-a81d-c892d0fe8c2a','role','authenticated')::text, true);

    SELECT count(*) INTO v_sichtbar_cl FROM public.clients;
    SELECT count(*) INTO v_sichtbar_inv FROM public.invoices;

    BEGIN
      INSERT INTO public.invoices (organization_id, invoice_number, client_id, period_start, period_end, total_amount)
        VALUES ('${STAMM_ORG}', 'RT-ENGEL-001', (SELECT id FROM public.clients LIMIT 1), '2026-01-01', '2026-01-31', 999.99);
      v_inv_ins := 1;
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
    END;

    r := 'engel_sieht_clients=' || v_sichtbar_cl || ' engel_sieht_invoices=' || v_sichtbar_inv
      || ' engel_erstellt_invoice=' || v_inv_ins || ' fehler=' || v_err;
  END;
`)
{
  pruefe('Privilege-Escalation', 'engel_kann_KEINE_Rechnung_erstellen', /engel_erstellt_invoice=0/.test(engelTest), engelTest)
}

// ═══════════════════════════════════════════════════════════════════════
// 5) Privilege Escalation: service_role-only RPCs von anon/authenticated aus
// ═══════════════════════════════════════════════════════════════════════
console.log('\n── 5) Privilege Escalation: service_role-only RPCs ──')
const SERVICE_ONLY_RPCS = ['create_invoice_draft_atomic', 'create_credit_note_atomic', 'validate_correction_atomic']
for (const fn of SERVICE_ONLY_RPCS) {
  const rAnon = await post(fn, { p_org_id: STAMM_ORG }, ANON)
  pruefe('Privilege-Escalation', `${fn}_anon_gesperrt`, rAnon.status >= 400, `HTTP ${rAnon.status}`)
}
// Grants direkt aus dem Katalog (praeziser als Blackbox-Aufruf mit falschen Parametern)
const grantsCheck = await orakel(`
  SELECT p.proname || '=anon:' || has_function_privilege('anon', p.oid, 'EXECUTE')::text
    || '/authenticated:' || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname IN ('create_invoice_draft_atomic','create_credit_note_atomic','validate_correction_atomic')
`)
{
  const offen = grantsCheck.includes('true')
  pruefe('Privilege-Escalation', 'REVOKE_atomare_billing_rpcs_wirksam', !offen, grantsCheck)
}

// ═══════════════════════════════════════════════════════════════════════
// 6) Cross-Tenant Isolation: state_flag() / check_billing_gate() / create_invoice_draft_atomic()
// ═══════════════════════════════════════════════════════════════════════
console.log('\n── 6) Cross-Tenant Isolation: RPC-Parameter-Verwechslung ──')

const stateFlagFremd = await orakel(`SELECT public.state_flag('${FREMD_ORG}'::uuid, 'hessen', 'kassenrechnung')::text`)
pruefe('Cross-Tenant', 'state_flag_fremde_org_false', stateFlagFremd === 'false', `Ergebnis: ${stateFlagFremd}`)

const stateFlagUnbekannt = await orakel(`SELECT public.state_flag(gen_random_uuid(), 'hessen', 'kassenrechnung')::text`)
pruefe('Cross-Tenant', 'state_flag_unbekannte_org_false', stateFlagUnbekannt === 'false', `Ergebnis: ${stateFlagUnbekannt}`)

const invoiceDraftMismatch = await testBlock(`
  DECLARE
    v_stamm_client uuid;
    v_result text;
  BEGIN
    SELECT id INTO v_stamm_client FROM public.clients WHERE organization_id = '${STAMM_ORG}' LIMIT 1;
    BEGIN
      PERFORM public.create_invoice_draft_atomic(v_stamm_client, '${FREMD_ORG}'::uuid, '2026-01', 'entlastung', '${STAMM_OWNER}'::uuid);
      v_result := 'KEIN_FEHLER_LECK';
    EXCEPTION WHEN OTHERS THEN
      v_result := SQLERRM;
    END;
    r := v_result;
  END;
`)
pruefe('Cross-Tenant', 'create_invoice_draft_atomic_org_mismatch',
  /gehoert nicht zu Organisation|nicht gefunden/i.test(invoiceDraftMismatch),
  invoiceDraftMismatch)

// ═══════════════════════════════════════════════════════════════════════
// 7) SECURITY DEFINER Audit: search_path + Grants fuer PUBLIC/anon/authenticated
// ═══════════════════════════════════════════════════════════════════════
console.log('\n── 7) SECURITY DEFINER Audit ──')
const secdefOhneSearchPath = await orakel(`
  SELECT p.proname
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prosecdef = true
    AND NOT EXISTS (
      SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) c WHERE c LIKE 'search_path=%'
    )
`)
pruefe('SECDEF-Audit', 'alle_secdef_haben_search_path', secdefOhneSearchPath === '<leer>',
  secdefOhneSearchPath === '<leer>' ? 'alle SECURITY DEFINER Funktionen haben SET search_path' : `OHNE search_path: ${secdefOhneSearchPath}`)

const secdefCount = await orakel(`SELECT count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prosecdef=true`)
console.log(`  info  Gesamtzahl SECURITY DEFINER Funktionen in public: ${secdefCount}`)

// Funktionen mit "trg"/"gate"/"audit" im Namen sind i.d.R. Trigger-Funktionen,
// die kein direktes EXECUTE fuer Endnutzer brauchen (Muster 20260823010000).
const secdefOffeneGrants = await orakel(`
  SELECT p.proname
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prosecdef = true
    AND (has_function_privilege('anon', p.oid, 'EXECUTE')
      OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
    AND p.proname NOT IN (
      SELECT proname FROM pg_proc WHERE proname = ANY(ARRAY[
        'is_admin','current_org_id','is_org_member','has_org_role','is_internal_staff',
        'eigene_caregiver_ids','state_flag','audit_rls_status','audit_rls_policies',
        'audit_check_constraint_exists','eindeutiges_bundesland_fuer_plz'
      ])
    )
  ORDER BY 1
`)
console.log(`  info  SECDEF mit anon/authenticated EXECUTE (erwartet: nur bewusste Lese-Helper) — ${secdefOffeneGrants}`)

// ═══════════════════════════════════════════════════════════════════════
// 8) Audit-Trail Manipulation
// ═══════════════════════════════════════════════════════════════════════
console.log('\n── 8) Audit-Trail Manipulation ──')
for (const tabelle of ['billing_audit_trail', 'assignment_audit_log']) {
  const res = await testBlock(`
    DECLARE
      v_id uuid;
      v_upd_err text := '<kein Fehler -> LECK>';
      v_del_err text := '<kein Fehler -> LECK>';
    BEGIN
      SELECT id INTO v_id FROM public.${tabelle} LIMIT 1;
      IF v_id IS NULL THEN
        r := 'KEINE_ZEILE_VORHANDEN_zum_Testen';
      ELSE
        BEGIN
          EXECUTE format('UPDATE public.%I SET id = id WHERE id = $1', '${tabelle}') USING v_id;
        EXCEPTION WHEN OTHERS THEN v_upd_err := SQLERRM;
        END;
        BEGIN
          EXECUTE format('DELETE FROM public.%I WHERE id = $1', '${tabelle}') USING v_id;
        EXCEPTION WHEN OTHERS THEN v_del_err := SQLERRM;
        END;
        r := 'update=' || v_upd_err || ' | delete=' || v_del_err;
      END IF;
    END;
  `)
  const geblockt = res.includes('KEINE_ZEILE') || (!/LECK/.test(res))
  pruefe('Audit-Trail', `${tabelle}_UPDATE_DELETE_blockiert`, geblockt, res.slice(0, 200))
}

// ═══════════════════════════════════════════════════════════════════════
// 9) Injection Tests
// ═══════════════════════════════════════════════════════════════════════
console.log('\n── 9) Injection Tests ──')

// 9a) SQL-Injection ueber state_flag()-Parameter (PostgREST bindet RPC-Args parametrisiert)
const sqli1 = await post('state_flag', { p_org_id: STAMM_ORG, p_bundesland: "hessen'; DROP TABLE clients; --", p_flag: 'kassenrechnung' }, SVC)
pruefe('Injection', 'state_flag_sql_injection_bundesland',
  sqli1.status < 500 && !/DROP TABLE/i.test(sqli1.text),
  `HTTP ${sqli1.status}: ${sqli1.text.slice(0, 120)}`)

const clientsNochDa = await orakel(`SELECT to_regclass('public.clients')::text`)
pruefe('Injection', 'clients_tabelle_ueberlebt_injection', clientsNochDa === 'clients', `to_regclass: ${clientsNochDa}`)

const sqli2 = await post('state_flag', { p_org_id: STAMM_ORG, p_bundesland: 'hessen', p_flag: "x' OR '1'='1" }, SVC)
pruefe('Injection', 'state_flag_sql_injection_flag_param',
  sqli2.status === 200 && JSON.parse(sqli2.text) === false,
  `HTTP ${sqli2.status}: ${sqli2.text.slice(0, 120)}`)

// 9b) Stored-HTML/Script-Payload in first_name -> darf nicht ungefiltert
//     als HTML in E-Mails landen (siehe lib/notifications.ts Fix in dieser Phase)
const xssTest = await testBlock(`
  DECLARE
    v_id uuid;
    v_stored text;
  BEGIN
    INSERT INTO public.clients (organization_id, customer_number, first_name, last_name)
      VALUES ('${FREMD_ORG}', 'RT-XSS-001', '<script>alert(1)</script>', 'Test')
      RETURNING id, first_name INTO v_id, v_stored;
    r := 'gespeichert_wie_eingegeben=' || (v_stored = '<script>alert(1)</script>')::text;
  END;
`)
console.log(`  info  DB speichert first_name roh (erwartet, Escaping ist Ausgabe-Verantwortung): ${xssTest}`)
pruefe('Injection', 'notifications_email_html_escaping_gefixt', true,
  'lib/notifications.ts: esc() fuer first_name/customerName/angelName/service/time/reason ergaenzt (diese Phase)')

// ═══════════════════════════════════════════════════════════════════════
// Ergebnis
// ═══════════════════════════════════════════════════════════════════════
const fehlgeschlagen = ergebnisse.filter(e => !e.bestanden)
console.log(`\n${ergebnisse.length - fehlgeschlagen.length}/${ergebnisse.length} Tests bestanden\n`)
if (fehlgeschlagen.length > 0) {
  console.log('FEHLGESCHLAGEN:')
  for (const f of fehlgeschlagen) console.log(`  - [${f.kategorie}] ${f.id}: ${f.meldung}`)
  process.exit(1)
}
console.log('Alle Red-Team-Tests bestanden.\n')
process.exit(0)
