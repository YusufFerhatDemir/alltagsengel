#!/usr/bin/env node
/**
 * Verifikation der SIS-Migration (20260818010000) gegen die LIVE-Datenbank.
 * Auszuführen NACH dem Apply (Supabase-MCP oder SQL-Editor — service_role
 * kann kein DDL, s. Kommentar in scripts/apply-migration.mjs).
 *
 * NEBENWIRKUNGSFREI. Es wird nichts geschrieben:
 *   - Katalog-Checks laufen als Lese-Orakel über _run_sql
 *     (DO-Block + RAISE EXCEPTION, die Funktion selbst liefert void)
 *   - anon-/service_role-Proben sind reine GETs mit LIMIT 0
 *
 * Exit 0 = Migration vollständig wirksam, Exit 1 = mindestens ein Befund.
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

const ergebnisse = []
function pruefe(id, bestanden, meldung) {
  ergebnisse.push({ id, bestanden })
  console.log(`${bestanden ? '  OK  ' : ' OFFEN'} ${id.padEnd(32)} ${meldung}`)
}

async function hole(pfad, key) {
  const res = await fetch(`${BASIS}${pfad}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  return { status: res.status, text: (await res.text()).slice(0, 300) }
}

/** Lese-Orakel: SQL-Ausdruck (text) über RAISE EXCEPTION aus _run_sql lesen. */
async function orakel(ausdruck) {
  const p = `DO $x$ DECLARE r text; BEGIN SELECT (${ausdruck})::text INTO r; RAISE EXCEPTION 'ORAKEL:%', r; END $x$;`
  const res = await fetch(`${BASIS}/rest/v1/rpc/_run_sql`, {
    method: 'POST',
    headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p }),
  })
  const body = await res.text()
  const m = body.match(/ORAKEL:([^"\\]*)/)
  return m ? m[1] : `HTTP ${res.status}: ${body.slice(0, 200)}`
}

// ── 1. Tabellen + RLS ────────────────────────────────────────────────
for (const tabelle of ['sis_assessments', 'sis_themenfelder', 'sis_risikomatrix']) {
  const rls = await orakel(
    `SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.${tabelle}')`
  )
  pruefe(`tabelle:${tabelle}`, rls === 'true',
    rls === 'true' ? 'existiert, RLS aktiv'
    : rls.startsWith('HTTP') ? `nicht prüfbar (${rls})`
    : rls === '<NULL>' ? 'TABELLE FEHLT (Migration nicht angewendet)' : `RLS INAKTIV (${rls})`)
}

// ── 2. Policies vollständig ──────────────────────────────────────────
const POLICIES = {
  sis_assessments: ['admin_sis_assessments', 'org_fence_sis_assessments', 'engel_sis_assessments_select'],
  sis_themenfelder: ['admin_sis_themenfelder', 'org_fence_sis_themenfelder', 'engel_sis_themenfelder_select'],
  sis_risikomatrix: ['admin_sis_risikomatrix', 'org_fence_sis_risikomatrix', 'engel_sis_risikomatrix_select'],
}
for (const [tabelle, erwartet] of Object.entries(POLICIES)) {
  const anzahl = await orakel(
    `SELECT count(*) FROM pg_policies WHERE tablename = '${tabelle}' AND policyname IN (${erwartet.map(p => `'${p}'`).join(',')})`
  )
  pruefe(`policies:${tabelle}`, anzahl === String(erwartet.length), `${anzahl}/${erwartet.length} erwartete Policies`)
}

// ── 3. Engel-Policies rekursionsfrei (Helper statt assignments-Subquery) ──
const subquery = await orakel(
  `SELECT count(*) FROM pg_policies WHERE tablename LIKE 'sis\\_%' AND qual LIKE '%FROM assignments%'`
)
pruefe('policies:rekursionsfrei', subquery === '0',
  subquery === '0' ? 'keine direkte assignments-Subquery (42P17-Schutz)' : `${subquery} Policy(s) mit assignments-Subquery`)

// ── 4. Helper-Funktion: SECDEF + search_path + kein anon-EXECUTE ─────
const helper = await orakel(
  `SELECT prosecdef::text || '|' ||
          (coalesce(array_to_string(proconfig, ','), '') LIKE '%search_path%')::text || '|' ||
          has_function_privilege('anon', oid, 'EXECUTE')::text || '|' ||
          has_function_privilege('authenticated', oid, 'EXECUTE')::text
   FROM pg_proc WHERE oid = to_regprocedure('public.engel_hat_aktiven_klienten(uuid)')`
)
pruefe('funktion:engel_helper', helper === 'true|true|false|true',
  `secdef|search_path|anon|authenticated = ${helper} (erwartet true|true|false|true)`)

// ── 5. Sperr-/updated_at-Trigger vorhanden ───────────────────────────
const trigger = await orakel(
  `SELECT count(*) FROM pg_trigger WHERE tgname IN
   ('trg_locked_sis','trg_locked_sis_themenfelder','trg_locked_sis_risikomatrix',
    'trg_updated_at_sis_assessments','trg_updated_at_sis_themenfelder','trg_updated_at_sis_risikomatrix')
   AND NOT tgisinternal`
)
pruefe('trigger:vollzaehlig', trigger === '6', `${trigger}/6 Trigger`)

// ── 6. anon hat keine Tabellenrechte (Katalog + Blackbox) ────────────
const anonRechte = await orakel(
  `SELECT count(*) FROM information_schema.role_table_grants
   WHERE grantee = 'anon' AND table_name LIKE 'sis\\_%'`
)
pruefe('grants:anon-katalog', anonRechte === '0', `${anonRechte} anon-Grants auf sis_* (erwartet 0)`)

for (const tabelle of ['sis_assessments', 'sis_themenfelder', 'sis_risikomatrix']) {
  const probe = await hole(`/rest/v1/${tabelle}?select=id&limit=0`, ANON)
  const zu = probe.status === 401 || probe.status === 403 ||
    (probe.status === 404 && probe.text.includes('42P01')) || probe.text.includes('42501')
  pruefe(`anon-blackbox:${tabelle}`, zu, `HTTP ${probe.status} (Zugriff verweigert erwartet)`)
}

// ── 7. service_role kommt durch (App-Pfad createAdminClient) ─────────
const svcProbe = await hole('/rest/v1/sis_assessments?select=id&limit=0', SVC)
pruefe('service_role:lesbar', svcProbe.status === 200, `HTTP ${svcProbe.status}`)

// ── Fazit ────────────────────────────────────────────────────────────
const offen = ergebnisse.filter(e => !e.bestanden).length
console.log(offen === 0
  ? `\nAlle ${ergebnisse.length} Checks OK — SIS-Migration vollständig wirksam.`
  : `\n${offen} von ${ergebnisse.length} Checks OFFEN.`)
process.exit(offen === 0 ? 0 : 1)
