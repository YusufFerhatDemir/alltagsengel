#!/usr/bin/env node
/**
 * Live-Nachweis fuer den Signaturen-Track.
 *
 * Prueft ausschliesslich TATSACHEN gegen die Produktionsdatenbank — keine
 * Annahmen aus dem Repo. Jede Zeile, die dieser Lauf ausgibt, ist entweder
 * aus pg_policies / pg_proc / information_schema gelesen oder eine
 * zurueckgerollte Schreibprobe.
 *
 * Aufruf:  node scripts/verify-signaturen-live.mjs
 */
import { apiHeaders, secretKey, envWert } from './lib/supabase-keys.mjs'

const URL_ = envWert('NEXT_PUBLIC_SUPABASE_URL')
const KEY = secretKey()

if (!URL_ || !KEY) {
  console.error('Fehlt: NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

// apiHeaders() statt eines rohen `Authorization: Bearer` — die neuen
// sb_secret_-Keys sind keine JWTs, ein Bearer-Header laesst die API mit
// „Invalid JWT" antworten und das Skript wuerde daraus faelschlich
// „kein Zugriff" lesen (siehe scripts/lib/supabase-keys.mjs).
const H = apiHeaders(KEY, { 'Content-Type': 'application/json' })

const ergebnisse = []
const pruefe = (id, ok, meldung) => ergebnisse.push({ id, ok, meldung })

/**
 * Lese-Orakel: `public._run_sql` liefert `void`, das Ergebnis kommt
 * deshalb ueber eine RAISE-Meldung zurueck. Die Ausnahme rollt die
 * Transaktion immer zurueck — es kann per Konstruktion nichts
 * geschrieben werden. Gleiche Bauart wie in
 * scripts/verify-bonussystem-live.mjs.
 */
async function orakel(sql) {
  const wrapped =
    `DO $ORK$ DECLARE r text; BEGIN `
    + `SELECT coalesce(string_agg(z::text, chr(10)), '(leer)') INTO r FROM (${sql}) t(z); `
    + `RAISE EXCEPTION 'ORAKEL:%', r; END $ORK$;`
  const res = await fetch(`${URL_}/rest/v1/rpc/_run_sql`, {
    method: 'POST',
    headers: H,
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

async function zaehle(tabelle) {
  const r = await fetch(`${URL_}/rest/v1/${tabelle}?select=id`, {
    headers: { ...H, Prefer: 'count=exact', Range: '0-0' },
  })
  if (!r.ok) return { ok: false, fehler: `HTTP ${r.status}` }
  const cr = r.headers.get('content-range') || ''
  return { ok: true, anzahl: Number(cr.split('/')[1] ?? -1) }
}

// ── A) Tabellen existieren live (Migration 20260821020000) ──────
const BESTAND = {}
for (const t of ['signatur_dokumente', 'signaturen', 'signatur_audit_log', 'qes_hooks']) {
  const z = await zaehle(t)
  BESTAND[t] = z.ok ? z.anzahl : -1
  pruefe(`A:${t}`, z.ok, z.ok ? `${t}: live erreichbar, ${z.anzahl} Zeilen` : `${t}: ${z.fehler}`)
}

// ── B) signatur_audit_log hat KEINE Policy fuer Signatare ───────
//     Genau daran scheiterte jeder Audit-Eintrag eines Nicht-Admins.
const policies = await orakel(
  `SELECT tablename || '|' || policyname || '|' || permissive || '|' || cmd || '|' || coalesce(qual,'')
   FROM pg_policies WHERE schemaname='public'
     AND tablename IN ('signatur_dokumente','signaturen','signatur_audit_log','qes_hooks')`)
const zeilen = policies.split('\n').filter(Boolean)
console.log('── Policies live ───────────────────────────────────────────')
for (const z of zeilen) console.log('   ' + z.replace(/\s+/g, ' ').slice(0, 150))
console.log('────────────────────────────────────────────────────────────')

const auditPermissive = zeilen.filter(z => z.startsWith('signatur_audit_log|') && !z.includes('|RESTRICTIVE|'))
pruefe(
  'B:audit-log-policies',
  auditPermissive.length > 0 && auditPermissive.every(z => z.includes('is_admin()')),
  auditPermissive.length === 0
    ? 'signatur_audit_log: KEINE permissive Policy — auch die Administration kaeme nicht heran'
    : `signatur_audit_log: ${auditPermissive.length} permissive Policy(s), alle auf is_admin() — ein Signatar (engel/kunde) kann per RLS NICHT protokollieren`,
)

const signaturenPolicies = zeilen.filter(z => z.startsWith('signaturen|'))
pruefe(
  'B:signatar-update',
  signaturenPolicies.some(z => z.includes('signatar_eigene_update')),
  signaturenPolicies.some(z => z.includes('signatar_eigene_update'))
    ? 'signaturen.signatar_eigene_update vorhanden — der Signatar DARF seine Zeile schreiben, nur den Nachweis dazu nicht'
    : 'signaturen: keine Signatar-Update-Policy gefunden',
)

const dokPermissive = zeilen.filter(z => z.startsWith('signatur_dokumente|') && !z.includes('|RESTRICTIVE|'))
pruefe(
  'B:dokumente-fuer-betriebsrollen',
  !dokPermissive.some(z => /darf\(|'pdl'|'qm'|'buchhaltung'/.test(z)),
  `signatur_dokumente: ${dokPermissive.length} permissive Policy(s), keine fuer pdl/qm/buchhaltung — der Leseweg dieser Rollen laeuft ueber den Dienstschluessel, nicht ueber RLS`,
)

// ── C) is_admin() ist live admin|superadmin ─────────────────────
const isAdminRumpf = await orakel(`SELECT prosrc FROM pg_proc WHERE proname='is_admin'`)
pruefe(
  'C:is_admin',
  /'admin'/.test(isAdminRumpf) && /'superadmin'/.test(isAdminRumpf) && !/'pdl'|'qm'|'buchhaltung'/.test(isAdminRumpf),
  `is_admin(): ${isAdminRumpf.replace(/\s+/g, ' ').slice(0, 140)}`,
)

// ── D) signaturen.ip_adresse ist inet ───────────────────────────
const spalten = await orakel(
  `SELECT column_name || '=' || data_type FROM information_schema.columns
   WHERE table_schema='public' AND table_name='signaturen'
     AND column_name IN ('ip_adresse','user_agent','signatur_hash_sha256')`)
pruefe(
  'D:ip-adresse-typ',
  /ip_adresse=inet/.test(spalten),
  `signaturen: ${spalten.replace(/\n/g, ', ')}`,
)

// ── E) Gegenprobe: inet weist eine Proxy-Kette ab ───────────────
//     Die Route schrieb x-forwarded-for bis zu diesem Track ROH in
//     diese Spalte. Hinter einer Proxy-Kette steht dort "a, b".
let ketteAbgewiesen = false
let ketteMeldung = ''
try {
  ketteMeldung = await orakel(`SELECT ('203.0.113.7, 198.51.100.4'::inet)::text`)
} catch (err) {
  ketteMeldung = String(err.message)
  ketteAbgewiesen = /invalid input syntax|22P02/i.test(ketteMeldung)
}
pruefe(
  'E:inet-kette',
  ketteAbgewiesen,
  ketteAbgewiesen
    ? 'inet weist "203.0.113.7, 198.51.100.4" mit 22P02 ab — eine ungefilterte x-forwarded-for-Kette laesst das UPDATE scheitern'
    : `inet nahm die Kette an?! ${ketteMeldung.slice(0, 200)}`,
)

// ── F) Einzel-IP wird angenommen (Gegenprobe zur Gegenprobe) ────
let einzelOk = false
try {
  const t = await orakel(`SELECT ('203.0.113.7'::inet)::text`)
  einzelOk = t.includes('203.0.113.7')
} catch { einzelOk = false }
pruefe('F:inet-einzel', einzelOk, 'inet nimmt eine einzelne IP an — die erste Adresse der Kette ist der richtige Wert')

// ── Ausgabe ─────────────────────────────────────────────────────
console.log('── Signaturen: Live-Tatsachen ──────────────────────────────')
for (const e of ergebnisse) console.log(`${e.ok ? 'OK  ' : 'FAIL'}  ${e.id}: ${e.meldung}`)
const gruen = ergebnisse.filter(e => e.ok).length
console.log('────────────────────────────────────────────────────────────')
console.log(`${gruen}/${ergebnisse.length} gruen`)
process.exit(gruen === ergebnisse.length ? 0 : 1)
