#!/usr/bin/env node
/**
 * Verifiziert die LIVE-Tatsachen, auf denen die Härtung des Bonussystems
 * (Block 19) vom 28.08.2026 aufsetzt. Nur lesend — kein DDL, kein DML.
 *
 * Das Bonusmodul entscheidet über die VERGÜTUNG von Mitarbeitenden: wer
 * die Regel schreibt, bestimmt wer eine Prämie bekommt, und wer freigibt,
 * löst die Zahlung aus. Die Härtung stützt sich auf sechs Tatsachen der
 * Datenbank, die dieses Skript nachmisst:
 *
 *   A) DIE bonus_*-POLICIES STEHEN AUF is_admin(). Alle drei Tabellen
 *      (bonus_regeln, bonus_berechnungen, bonus_freigaben) tragen eine
 *      PERMISSIVE ALL-Policy mit `is_admin()` in USING und WITH CHECK, und
 *      is_admin() ist auf admin|superadmin beschränkt. Genau das sagt die
 *      neue Berechtigung 'bonus.verwalten' im Code auch. Ändert sich (A),
 *      laufen Schnittstelle und Datenbank wieder auseinander — dann
 *      gehört die Bewertung neu gemacht.
 *
 *   B) DER UNIQUE-INDEX HINTER DEM ALTEN UPSERT EXISTIERT.
 *      `bonus_berechnungen_unique` auf (regel_id, caregiver_id,
 *      zeitraum_von, zeitraum_bis) war das Ziel des alten
 *      `upsert(..., { onConflict: … })`. Er belegt, dass der Konflikt
 *      zuverlässig eintrat und ein zweiter Lauf eine bereits freigegebene
 *      oder ausgezahlte Prämie tatsächlich auf 'berechnet' zurückgesetzt
 *      hat — der Befund ist keine theoretische Möglichkeit.
 *
 *   C) DAS STATUS-WERTESET KENNT DIE DREI ENDZUSTÄNDE.
 *      `bonus_berechnungen_status_check` muss 'freigegeben', 'abgelehnt'
 *      und 'ausgezahlt' enthalten — das ist die Liste, gegen die
 *      istEntschieden() im Code prüft. Fehlt einer, überspringt der Lauf
 *      zu wenig.
 *
 *   D) DER ZEITRAUM-CHECK EXISTIERT. `zeitraum_bis >= zeitraum_von` ist
 *      live ein CHECK; die verdrehte Eingabe kam ohne die neue Prüfung
 *      als 23514 und damit als „Interner Serverfehler" beim Nutzer an.
 *
 *   E) absences.status IST CHECK-GEBUNDEN und kennt 'abgelehnt' und
 *      'storniert'. Darauf beruht der Befund, dass ein ABGELEHNTER
 *      Urlaubsantrag als Ausfalltag gegen die Prämie zählte.
 *
 *   F) review_errors HAT KEINEN UNIQUE-INDEX auf service_record_id.
 *      Mehrere offene Prüfhinweise am selben Nachweis sind damit
 *      vorgesehen — und genau das machte aus der alten Zählung
 *      (Fehlerzeilen statt Nachweise) eine negative Quote.
 *
 *   G) BESTAND: gibt es bereits Berechnungen, deren Status nicht zum
 *      jüngsten Eintrag in bonus_freigaben passt? Das ist die
 *      Schadensfrage zum Freigabe-Befund — die Härtung verhindert neue
 *      Fälle, alte fände nur diese Abfrage.
 *
 * Aufruf: node scripts/verify-bonussystem-live.mjs
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

// ── A) bonus_*-Policies stehen auf is_admin() ──────────────────
const BONUS_TABELLEN = ['bonus_regeln', 'bonus_berechnungen', 'bonus_freigaben']
const policies = await orakel(
  `SELECT tablename || '|' || policyname || '|' || coalesce(qual,'') || '|' || coalesce(with_check,'')
   FROM pg_policies WHERE schemaname='public' AND tablename LIKE 'bonus%'`)
for (const tabelle of BONUS_TABELLEN) {
  const zeilen = policies.split('\n').filter(z => z.startsWith(`${tabelle}|`))
  const adminPolicy = zeilen.find(z => z.includes('is_admin()'))
  pruefe(
    `A:${tabelle}`,
    Boolean(adminPolicy),
    adminPolicy
      ? `${tabelle}: Policy mit is_admin() vorhanden — der Code-Guard 'bonus.verwalten' sagt dasselbe`
      : `${tabelle}: KEINE is_admin()-Policy mehr — Guard und Datenbank neu abgleichen`,
  )
}

const isAdminRumpf = await orakel(`SELECT prosrc FROM pg_proc WHERE proname='is_admin'`)
const nurAdministration = /'admin'/.test(isAdminRumpf) && /'superadmin'/.test(isAdminRumpf)
  && !/'pdl'|'qm'|'buchhaltung'/.test(isAdminRumpf)
pruefe(
  'A:is_admin',
  nurAdministration,
  nurAdministration
    ? 'is_admin() ist auf admin|superadmin beschränkt — deckungsgleich mit NUR_ADMINISTRATION'
    : 'is_admin() lässt inzwischen weitere Rollen zu — lib/analytics/bonus-auth.ts nachziehen',
)

// ── B) Unique-Index hinter dem alten Upsert ────────────────────
const idx = await orakel(
  `SELECT indexdef FROM pg_indexes WHERE tablename='bonus_berechnungen' AND indexname='bonus_berechnungen_unique'`)
const hatUnique = idx !== '(leer)'
  && /regel_id/.test(idx) && /caregiver_id/.test(idx)
  && /zeitraum_von/.test(idx) && /zeitraum_bis/.test(idx)
pruefe(
  'B:unique',
  hatUnique,
  hatUnique
    ? 'bonus_berechnungen_unique auf (regel_id, caregiver_id, zeitraum_von, zeitraum_bis) — der alte Upsert traf zuverlässig'
    : `Unique-Index fehlt oder deckt andere Spalten: ${idx.slice(0, 200)}`,
)

// ── C) Endzustände im Status-CHECK ─────────────────────────────
const statusCheck = await orakel(
  `SELECT pg_get_constraintdef(oid) FROM pg_constraint
   WHERE conrelid='bonus_berechnungen'::regclass AND contype='c'
     AND pg_get_constraintdef(oid) LIKE '%status%'`)
const ENDZUSTAENDE = ['freigegeben', 'abgelehnt', 'ausgezahlt']
const fehlend = ENDZUSTAENDE.filter(w => !statusCheck.includes(`'${w}'`))
pruefe(
  'C:endzustaende',
  fehlend.length === 0,
  fehlend.length === 0
    ? `Status-CHECK kennt alle drei Endzustände (${ENDZUSTAENDE.join(', ')}) — ENTSCHIEDENE_BONUS_STATUS deckt sich`
    : `Status-CHECK kennt ${fehlend.join(', ')} nicht — der Lauf überspringt zu wenig`,
)

// ── D) Zeitraum-CHECK ──────────────────────────────────────────
const zeitraumCheck = await orakel(
  `SELECT pg_get_constraintdef(oid) FROM pg_constraint
   WHERE conrelid='bonus_berechnungen'::regclass AND contype='c'
     AND pg_get_constraintdef(oid) LIKE '%zeitraum%'`)
const hatZeitraumCheck = /zeitraum_bis\s*>=\s*zeitraum_von/.test(zeitraumCheck)
pruefe(
  'D:zeitraum',
  hatZeitraumCheck,
  hatZeitraumCheck
    ? 'CHECK zeitraum_bis >= zeitraum_von vorhanden — assertZeitraum() nimmt ihm den 500er ab'
    : `Zeitraum-CHECK nicht gefunden: ${zeitraumCheck.slice(0, 200)}`,
)

// ── E) absences.status kennt abgelehnt/storniert ───────────────
const absencesCheck = await orakel(
  `SELECT pg_get_constraintdef(oid) FROM pg_constraint
   WHERE conrelid='absences'::regclass AND contype='c'
     AND pg_get_constraintdef(oid) LIKE '%status%'`)
const kenntAbgelehnt = absencesCheck.includes(`'abgelehnt'`) && absencesCheck.includes(`'storniert'`)
pruefe(
  'E:absences',
  kenntAbgelehnt,
  kenntAbgelehnt
    ? 'absences.status kennt abgelehnt und storniert — ohne Filter zählten beide als Ausfalltag gegen die Prämie'
    : `absences.status-CHECK unerwartet: ${absencesCheck.slice(0, 200)}`,
)

// ── F) review_errors ohne Unique auf service_record_id ─────────
const reviewIdx = await orakel(
  `SELECT indexdef FROM pg_indexes WHERE tablename='review_errors'`)
const hatUniqueAufRecord = reviewIdx
  .split('\n')
  .some(z => /UNIQUE/i.test(z) && /\(service_record_id\)/.test(z))
pruefe(
  'F:review_errors',
  !hatUniqueAufRecord,
  hatUniqueAufRecord
    ? 'review_errors hat inzwischen einen Unique-Index auf service_record_id — die Zählung je Nachweis bleibt trotzdem richtig'
    : 'review_errors hat KEINEN Unique-Index auf service_record_id — mehrere offene Hinweise je Nachweis sind vorgesehen (Grund der negativen Quote)',
)

// ── G) Bestand: Status passt zur jüngsten Freigabe ─────────────
const widerspruch = await orakel(
  `SELECT count(*)::text FROM bonus_berechnungen b
   JOIN LATERAL (
     SELECT entscheidung FROM bonus_freigaben f
     WHERE f.berechnung_id = b.id ORDER BY f.entschieden_am DESC LIMIT 1
   ) letzte ON true
   WHERE b.status <> letzte.entscheidung AND b.status <> 'ausgezahlt'`)
pruefe(
  'G:bestand-status',
  widerspruch === '0',
  widerspruch === '0'
    ? 'Kein Widerspruch zwischen Berechnungsstatus und jüngster Entscheidung'
    : `${widerspruch} Berechnung(en) mit einem Status, der nicht zur jüngsten Entscheidung passt — Altfälle des Reihenfolge-Befunds`,
)

const doppelt = await orakel(
  `SELECT count(*)::text FROM (
     SELECT berechnung_id FROM bonus_freigaben
     GROUP BY berechnung_id HAVING count(*) > 1
   ) x`)
pruefe(
  'G:doppelte-entscheidung',
  doppelt === '0',
  doppelt === '0'
    ? 'Keine Berechnung mit mehr als einer Entscheidungszeile'
    : `${doppelt} Berechnung(en) mit MEHREREN Entscheidungszeilen — genau das, was der fehlende Compare-and-Swap zuliess`,
)

// ── Ausgabe ────────────────────────────────────────────────────
console.log('\nBonussystem (Block 19) — Live-Zusagen\n')
for (const e of ergebnisse) {
  console.log(`${e.ok ? '✅' : '❌'} ${e.id}: ${e.meldung}`)
}
const erfuellt = ergebnisse.filter(e => e.ok).length
console.log(`\n${erfuellt}/${ergebnisse.length} erfüllt`)
process.exit(erfuellt === ergebnisse.length ? 0 : 1)
