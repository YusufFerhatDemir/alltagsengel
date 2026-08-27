#!/usr/bin/env node
/**
 * Verifiziert die LIVE-Tatsachen, auf denen die Härtung der
 * Personalverwaltung aufsetzt. Nur lesend — kein DDL, kein DML.
 *
 * Die Schreibwege der Personalverwaltung arbeiten mit dem Dienstschlüssel
 * (createAdminClient), der RLS umgeht. `organization_id` kommt aus dem
 * Auth-Kontext, `caregiver_id` aber aus dem Request-Body. Der Mandanten-
 * Fence liegt deshalb im Code (lib/personal/organization-guard.ts) und
 * nicht in einer Policy. Ob er nötig ist, hängt an vier Tatsachen der
 * Datenbank, die dieses Skript nachmisst:
 *
 *   A) DIE AUSWERTUNGS-VIEWS JOINEN `caregivers` OHNE MANDANTEN-
 *      BEDINGUNG. `personal_urlaubsuebersicht`,
 *      `qualifikation_ablauf_warnung` und `personal_arbeitszeitkonto`
 *      verbinden ausschließlich über `cg.id = <tabelle>.caregiver_id`.
 *      Gefiltert wird in der Anwendung auf die `organization_id` der
 *      EIGENEN Zeile — nicht auf die des gejointen Mitarbeiters. Eine
 *      Zeile mit fremder `caregiver_id` holt damit den Klarnamen des
 *      fremden Mitarbeiters in die eigene Auswertung. Schlägt (A) um
 *      (weil die Views einen Fence bekommen haben), ist der Code-Fence
 *      nicht mehr die einzige Schranke — die Bewertung gehört dann neu
 *      gemacht, entfernt werden darf er trotzdem nicht.
 *
 *   B) DIE ERLAUBNISLISTEN IM CODE DECKEN SICH MIT DEN LIVE-CHECKS.
 *      `caregiver_qualifications` bindet `qualification_type` und
 *      `status`, `personal_schulungen` die `schulungsart`,
 *      `personal_urlaubskonto` das `jahr`. Weicht der Code ab, kommt die
 *      Verletzung wieder als „Interner Serverfehler" statt als lesbarer
 *      Hinweis zurück.
 *
 *   C) DIE SPALTEN DER MITARBEITERAKTE EXISTIEREN. Die Seite schrieb
 *      zehn von elf Feldern unter Namen, die der Server nicht kennt;
 *      `has_vehicle` und `has_drivers_license` sind die echten Spalten
 *      hinter den Kästchen „Fahrzeug" und „Führerschein".
 *
 *   D) BESTAND: gibt es bereits Zeilen, deren `caregiver_id` auf einen
 *      Mitarbeiter einer ANDEREN Organisation zeigt? Das ist die
 *      Schadensfrage — der Fence verhindert neue Fälle, alte fände nur
 *      diese Abfrage.
 *
 * Aufruf: node scripts/verify-personalverwaltung-live.mjs
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

// ── A) Views joinen caregivers ohne Mandanten-Bedingung ───────
const VIEWS = ['personal_urlaubsuebersicht', 'qualifikation_ablauf_warnung', 'personal_arbeitszeitkonto']
for (const view of VIEWS) {
  const def = await orakel(
    `SELECT definition FROM pg_views WHERE schemaname='public' AND viewname='${view}'`)
  if (def === '(leer)') {
    pruefe(`A:${view}`, false, `View ${view} existiert nicht (mehr) — Annahme neu prüfen`)
    continue
  }
  const jointCaregivers = /JOIN caregivers/i.test(def)
  // Ein Fence im JOIN wuerde die organization_id beider Seiten vergleichen.
  const hatFence = /cg\.organization_id/i.test(def)
  // Geprueft wird der DATENWEG, nicht das Fehlen einer Absicherung: die
  // View muss weiterhin ueber caregiver_id auf caregivers gehen, sonst
  // stimmt die Begruendung des Code-Fence nicht mehr. Ein spaeter
  // ergaenzter Fence in der View ist eine Verbesserung und darf diese
  // Pruefung NICHT rot faerben — er wird nur vermerkt.
  pruefe(
    `A:${view}`,
    jointCaregivers,
    jointCaregivers
      ? `${view} joint caregivers über caregiver_id`
        + (hatFence
          ? ' — inzwischen MIT Mandanten-Bedingung (zusätzliche Schicht; der Code-Fence bleibt die führende)'
          : ' ohne Mandanten-Bedingung (deshalb der Fence in lib/personal/organization-guard.ts)')
      : `${view} joint caregivers nicht mehr — Begründung des Code-Fence neu prüfen`,
  )
}

// ── B) Erlaubnislisten gegen die Live-CHECKs ──────────────────
const checks = await orakel(`
  SELECT conname || ' :: ' || pg_get_constraintdef(oid)
  FROM pg_constraint
  WHERE conrelid IN (
      'caregiver_qualifications'::regclass,
      'personal_schulungen'::regclass,
      'personal_urlaubskonto'::regclass)
    AND contype = 'c'
  ORDER BY conname`)

const ERWARTET = [
  // [Kennung des CHECK, Werte, die der Code fuehrt]
  ['caregiver_qualifications_qualification_type_check',
    ['fuehrungszeugnis', 'erste_hilfe', 'hygiene', 'datenschutz', 'brandschutz', 'pflichtunterweisung', 'fortbildung', 'sonstige']],
  ['caregiver_qualifications_status_check',
    ['valid', 'expiring', 'expired', 'pending']],
  ['personal_schulungen_art_check',
    ['pflichtschulung', 'fortbildung', 'auffrischung', 'einarbeitung', 'extern', 'sonstiges']],
]
for (const [conname, werte] of ERWARTET) {
  const zeile = checks.split('\n').find(z => z.startsWith(conname))
  const alleDrin = !!zeile && werte.every(w => zeile.includes(`'${w}'`))
  // Gegenrichtung: der CHECK darf auch nicht MEHR erlauben, als der Code
  // kennt — sonst weist die Anwendung Werte ab, die fachlich gültig sind.
  const zusaetzlich = zeile
    ? [...zeile.matchAll(/'([a-z0-9_]+)'::text/g)].map(m => m[1]).filter(w => !werte.includes(w))
    : []
  pruefe(
    `B:${conname}`,
    alleDrin && zusaetzlich.length === 0,
    zeile
      ? `Code-Liste deckt sich mit dem CHECK${zusaetzlich.length ? ` — live zusätzlich erlaubt: ${zusaetzlich.join(', ')}` : ''}`
      : `CHECK ${conname} nicht gefunden`,
  )
}

const jahrCheck = checks.split('\n').find(z => z.startsWith('personal_urlaubskonto_jahr_check'))
pruefe('B:jahr', !!jahrCheck && jahrCheck.includes('2020') && jahrCheck.includes('2099'),
  `Jahresgrenzen 2020..2099 wie im Code (${jahrCheck ?? 'CHECK fehlt'})`)

// ── C) Spalten der Mitarbeiterakte ────────────────────────────
const SPALTEN = [
  'notfallkontakt_name', 'notfallkontakt_telefon', 'notfallkontakt_beziehung',
  'qualification_level', 'einsatzgebiet_plz', 'einsatzgebiet_radius_km',
  'wochenstunden_soll', 'urlaubstage_jahresanspruch', 'probezeitende',
  'has_vehicle', 'has_drivers_license',
]
const vorhanden = await orakel(`
  SELECT column_name FROM information_schema.columns
  WHERE table_schema='public' AND table_name='caregivers'
    AND column_name IN (${SPALTEN.map(s => `'${s}'`).join(',')})`)
const fehlend = SPALTEN.filter(s => !vorhanden.split('\n').includes(s))
pruefe('C', fehlend.length === 0,
  fehlend.length ? `caregivers fehlen Spalten: ${fehlend.join(', ')}` : `alle ${SPALTEN.length} Spalten der Mitarbeiterakte vorhanden`)

// ── D) Bestand: bereits mandantenfremde Zeilen? ───────────────
const TABELLEN = [
  'caregiver_qualifications', 'personal_schulungen',
  'personal_urlaubskonto', 'personal_arbeitszeiten', 'absences',
]
for (const tabelle of TABELLEN) {
  const anzahl = await orakel(`
    SELECT count(*)::text FROM ${tabelle} t
    JOIN caregivers cg ON cg.id = t.caregiver_id
    WHERE cg.organization_id IS DISTINCT FROM t.organization_id`)
  pruefe(`D:${tabelle}`, Number(anzahl) === 0,
    `${tabelle}: ${anzahl} Zeile(n) mit mandantenfremdem Mitarbeiter`)
}

// ── Ausgabe ───────────────────────────────────────────────────
console.log('\nPersonalverwaltung — Live-Zusagen\n')
for (const e of ergebnisse) {
  console.log(`${e.ok ? '✅' : '❌'} ${e.id}: ${e.meldung}`)
}
const offen = ergebnisse.filter(e => !e.ok)
console.log(`\n${ergebnisse.length - offen.length}/${ergebnisse.length} erfüllt`)
process.exit(offen.length === 0 ? 0 : 1)
