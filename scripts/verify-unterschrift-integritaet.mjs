#!/usr/bin/env node
/**
 * UNTERSCHRIFT UND INTEGRITAET gegen die PRODUKTIONSDATENBANK.
 *
 *   Nachweis → Unterschrift → Hash → Sperre → Belegpruefung → Abrechnung
 *
 * ── DER BEFUND, DER DAZU GEFUEHRT HAT ─────────────────────────────────────
 *
 * Live tragen 30 von 30 Leistungsnachweisen `signature_hash IS NULL` und
 * `is_locked = false` — 26 davon MIT gezeichneter Unterschrift, 15 davon
 * bereits abgerechnet. Der naheliegende Schluss waere „der Hash wird nicht
 * berechnet". Er ist falsch, und der Unterschied ist wichtig:
 *
 *   Der Trigger `trg_compute_signature_hash` steht live und rechnet
 *   richtig. Er verlangt nur `proof_status = 'UNTERSCHRIEBEN' AND
 *   client_signed_at IS NOT NULL` — und live steht auf allen 30 Zeilen
 *   `proof_status = 'ENTWURF'` bei `client_signed_at IS NULL`. Die
 *   Bedingung war nie erfuellt. Es fehlt kein Hash, es fehlt eine
 *   Unterschrift.
 *
 * Das ist genau die Unterscheidung aus lib/billing/nachweis-beleg.ts:
 * `client_signature` ist ein BILD, das die Verwaltungsmaske mitspeichert.
 * Ein BELEG ist es nicht — dazu gehoert der Zeitpunkt und der Hash
 * darueber. Diese Pruefung misst beides getrennt.
 *
 * ── WAS GESCHRIEBEN WIRD ──────────────────────────────────────────────────
 *
 * Ein eigens angelegter Pruefklient mit einer Pruefkraft und vier
 * Nachweisen, datiert 2019 — weit weg von jeder echten Auswertung. Es
 * entsteht KEINE Rechnung, KEINE Mahnung, KEINE Zahlung. Alles wird am
 * Ende entfernt, mit Gegenprobe.
 *
 * Aufruf:  npm run verify:unterschrift
 */

import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'

for (const datei of ['.env.local', '.env']) {
  if (!existsSync(datei)) continue
  for (const zeile of readFileSync(datei, 'utf8').split('\n')) {
    const m = zeile.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

import { createClient } from '@supabase/supabase-js'
import { apiHeaders, envWert, secretKey } from './lib/supabase-keys.mjs'
import { unterschriftBelegt, belegLuecke } from '../lib/billing/nachweis-beleg.ts'

const URL_BASIS = envWert('NEXT_PUBLIC_SUPABASE_URL')
const SERVICE = secretKey()
const ORG = '00000000-0000-4000-8000-000460629986'
if (!URL_BASIS || !SERVICE) {
  console.error('Fehlt: NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY')
  console.error('Es wurde NICHTS geprueft — dieser Lauf ist kein Nachweis.')
  process.exit(2)
}

const admin = createClient(URL_BASIS, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const ergebnisse = []
function pruefe(id, titel, bestanden, gemessen) {
  ergebnisse.push({ id, bestanden })
  console.log(`\n[${id}] ${bestanden ? 'OK     ' : 'OFFEN  '} ${titel}`)
  console.log(`  ${String(gemessen).split('\n').join('\n  ')}`)
}

/**
 * Den Hash NACHRECHNEN — aber in Postgres, nicht in JavaScript.
 *
 * WOZU UEBERHAUPT NACHRECHNEN: „signature_hash ist nicht leer" beweist nur,
 * dass irgendein Wert dasteht. Erst wenn derselbe Wert unabhaengig aus den
 * Feldern herauskommt, ist belegt, dass der Hash GENAU DIESEN Inhalt
 * bindet — und damit ueberhaupt etwas absichert.
 *
 * WARUM NICHT IN JAVASCRIPT: der erste Anlauf tat genau das und scheiterte,
 * ohne dass irgendetwas kaputt gewesen waere. Der Trigger verkettet
 * `::text`-Umwandlungen von Postgres: `start_time` wird zu '09:00:00',
 * `amount` zu '25.00', `client_signed_at` zu '2019-04-02 08:30:00+00'.
 * PostgREST liefert dieselben Werte als '09:00:00', 25 und
 * '2019-04-02T08:30:00+00:00'. Eine Nachbildung in JS misst deshalb die
 * Formatierungsregeln zweier Systeme und nicht den Hash. Gefragt wird
 * stattdessen die Datenbank selbst — mit demselben Ausdruck, den der
 * Trigger benutzt (Feldfolge aus pg_get_functiondef, 31.08.2026):
 *
 *   id | client_id | date | start_time | end_time | amount | client_signed_at
 */
const HASH_AUSDRUCK = (betragsAufschlag = 0) => `encode(extensions.digest(
    COALESCE(sr.id::text,'') || '|' || COALESCE(sr.client_id::text,'') || '|' ||
    COALESCE(sr.date::text,'') || '|' || COALESCE(sr.start_time::text,'') || '|' ||
    COALESCE(sr.end_time::text,'') || '|' ||
    COALESCE((sr.amount + ${betragsAufschlag})::text,'') || '|' ||
    COALESCE(sr.client_signed_at::text,''), 'sha256'), 'hex')`

async function orakel(sql) {
  const res = await fetch(`${URL_BASIS}/rest/v1/rpc/_run_sql`, {
    method: 'POST',
    // apiHeaders und nicht von Hand: die neuen publishable/secret-Schluessel
    // sind keine JWTs und werden als `Bearer` mit „Invalid JWT" abgewiesen.
    headers: apiHeaders(SERVICE, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ p: sql }),
  })
  const text = await res.text()
  let j = null
  try { j = JSON.parse(text) } catch { /* Fehlertexte sind nicht immer JSON */ }
  const msg = j?.message ?? text
  const i = msg.indexOf('ORAKEL:')
  if (i === -1) throw new Error(`Orakel unerwartet (HTTP ${res.status}): ${msg.slice(0, 300)}`)
  return msg.slice(i + 7)
}

async function lies(id) {
  const { data, error } = await admin
    .from('service_records')
    .select('id, client_id, date, start_time, end_time, amount, status, proof_status, '
      + 'client_signature, client_signed_at, signature_hash, is_locked, organization_id')
    .eq('id', id).single()
  if (error) throw new Error(`Nachweis ${id} nicht lesbar: ${error.message}`)
  return data
}

console.log('═══════════════════════════════════════════════════════════════════')
console.log(' UNTERSCHRIFT UND INTEGRITAET — live gegen Produktion')
console.log(` ${new Date().toISOString()}`)
console.log('═══════════════════════════════════════════════════════════════════')

let clientId = null
let caregiverId = null
const nachweise = []
let aufgeraeumt = 'nicht ausgefuehrt'

try {
  // ── U0) Bestandsaufnahme, bevor irgendetwas angelegt wird ──────────────
  const { data: bestand } = await admin
    .from('service_records')
    .select('id, status, proof_status, client_signature, client_signed_at, signature_hash, is_locked')
  const alle = bestand ?? []
  const ohneHash = alle.filter(r => !r.signature_hash)
  const mitBild = alle.filter(r => r.client_signature)
  const abgerechnetOhneBeleg = alle.filter(
    r => r.status === 'invoiced' && !unterschriftBelegt(r),
  )
  console.log(`\nBestand: ${alle.length} Nachweise | ohne Hash ${ohneHash.length} | `
    + `mit Unterschriftsbild ${mitBild.length} | gesperrt ${alle.filter(r => r.is_locked).length}`)
  console.log(`         abgerechnet ohne Unterschriftsbeleg: ${abgerechnetOhneBeleg.length}`)

  const { data: konto } = await admin.from('profiles')
    .select('id').eq('role', 'admin').limit(1).maybeSingle()
  if (!konto?.id) throw new Error('Kein Admin-Konto als Urheber gefunden.')

  const kennung = `PRUEF-SIG-${Date.now().toString(36).toUpperCase()}`

  const { data: cg, error: cgFehler } = await admin.from('caregivers')
    .insert({ first_name: 'Pruefung', last_name: kennung, initials: 'PS', organization_id: ORG })
    .select('id').single()
  if (cgFehler) throw new Error(`Pruefkraft nicht anlegbar: ${cgFehler.message}`)
  caregiverId = cg.id

  const { data: cl, error: clFehler } = await admin.from('clients')
    // customer_number ist NOT NULL und global eindeutig (nicht je Mandant)
    // — die Kennung traegt deshalb den Zeitstempel.
    .insert({ customer_number: kennung, first_name: 'Pruefung', last_name: kennung, organization_id: ORG })
    .select('id').single()
  if (clFehler) throw new Error(`Pruefklient nicht anlegbar: ${clFehler.message}`)
  clientId = cl.id
  console.log(`Pruefklient/-kraft: ${kennung}`)

  const grundNachweis = (datum, extra = {}) => ({
    organization_id: ORG, client_id: clientId, caregiver_id: caregiverId,
    date: datum, start_time: '09:00', end_time: '10:00',
    service_type: 'Betreuung', caregiver_initials: 'PS',
    // budget_type ist NOT NULL mit CHECK auf
    // entlastung|verhinderungspflege|carryover|private — 'private', damit
    // die Pruefzeile keinen Kassen- oder Budgettopf beruehrt.
    budget_type: 'private',
    amount: 25, status: 'draft', proof_status: 'ENTWURF', ...extra,
  })

  async function anlegen(datum, extra) {
    const { data, error } = await admin.from('service_records')
      .insert(grundNachweis(datum, extra)).select('id').single()
    if (error) throw new Error(`Nachweis ${datum} nicht anlegbar: ${error.message}`)
    nachweise.push(data.id)
    return data.id
  }

  // ── U1) Steht der Rechenweg ueberhaupt? ────────────────────────────────
  //
  // Zuerst, weil jede folgende Messung sonst mehrdeutig waere: „kein Hash"
  // hiesse dann entweder „Bedingung nicht erfuellt" oder „es gibt gar
  // keinen Trigger", und das sind zwei sehr verschiedene Befunde.
  const idRoh = await anlegen('2019-04-01')
  const roh = await lies(idRoh)
  pruefe('U1', 'Ein frischer Nachweis traegt weder Hash noch Sperre',
    !roh.signature_hash && roh.is_locked === false,
    `signature_hash=${roh.signature_hash ?? 'NULL'} | is_locked=${roh.is_locked}`)

  // ── U2) Der Unterschriftsweg erzeugt Hash UND Sperre ───────────────────
  //
  // Genau so schreibt POST /api/leistungsnachweis/crud (action='sign'):
  // proof_status und client_signed_at gehen ZUSAMMEN raus. Getrennt waere
  // die Trigger-Bedingung nicht erfuellt — siehe U4.
  const signiertAm = new Date('2019-04-02T08:30:00.000Z').toISOString()
  const { error: signFehler } = await admin.from('service_records').update({
    proof_status: 'UNTERSCHRIEBEN',
    client_signed_at: signiertAm,
    client_signature: 'data:image/png;base64,PRUEFUNTERSCHRIFT',
  }).eq('id', idRoh)
  const signiert = signFehler ? null : await lies(idRoh)
  pruefe('U2', 'Unterschrift setzt den Hash und sperrt den Nachweis',
    !signFehler && !!signiert?.signature_hash && signiert?.is_locked === true,
    signFehler
      ? `FEHLER ${signFehler.message}`
      : `signature_hash=${signiert.signature_hash?.slice(0, 24)}… (${signiert.signature_hash?.length} Zeichen) `
        + `| is_locked=${signiert.is_locked} | status=${signiert.status}`)

  // ── U3) Bindet der Hash wirklich DIESEN Inhalt? ────────────────────────
  const nachgerechnet = await orakel(
    `DO $ora$ DECLARE r text; BEGIN
       SELECT ${HASH_AUSDRUCK(0)} || '|' || ${HASH_AUSDRUCK(1)}
         INTO r FROM public.service_records sr WHERE sr.id = '${idRoh}';
       RAISE EXCEPTION 'ORAKEL:%', r; END $ora$;`,
  )
  const [gleich, mitAufschlag] = nachgerechnet.split('|')
  pruefe('U3', 'Der Hash ist an Betrag, Zeit und Klient gebunden — unabhaengig nachgerechnet',
    !!signiert?.signature_hash && signiert.signature_hash === gleich
      && mitAufschlag !== signiert.signature_hash,
    `aus der Spalte : ${signiert?.signature_hash ?? '(keiner)'}\n`
    + `nachgerechnet  : ${gleich}\n`
    + `mit Betrag + 1 : ${mitAufschlag}\n`
    + `⇒ ${mitAufschlag === signiert?.signature_hash ? 'GLEICH — der Hash bindet den Betrag NICHT' : 'anders — der Hash bindet den Inhalt'}`)

  // ── U4) Der frueher offene Umgehungsweg ────────────────────────────────
  //
  // proof_status allein auf 'UNTERSCHRIEBEN', ohne Zeitstempel und ohne
  // Unterschrift. Das war der Weg, auf dem ein nie unterschriebener
  // Nachweis abrechenbar wurde: `sync_service_record_status` hob `status`
  // auf 'signed', `compute_signature_hash` lief mangels client_signed_at
  // NICHT, und die Rechnungssperre liess proof_status allein genuegen.
  //
  // Gemessen wird, ob die DATENBANK das heute abweist — nicht, ob ein
  // Guard im Code es tut. Der Schreibversuch laeuft deshalb mit dem
  // Dienstschluessel direkt auf die Tabelle, an jeder Route vorbei.
  const idUmweg = await anlegen('2019-04-03')
  const { error: umwegFehler } = await admin.from('service_records')
    .update({ proof_status: 'UNTERSCHRIEBEN' }).eq('id', idUmweg)
  const umweg = await lies(idUmweg)
  pruefe('U4', 'Ein Nachweis ohne Beleg laesst sich nicht auf UNTERSCHRIEBEN setzen',
    !!umwegFehler && umweg.proof_status === 'ENTWURF' && !umweg.signature_hash,
    umwegFehler
      ? `von der Datenbank abgewiesen (trg_a_unterschrift_beleg):\n`
        + `  ${String(umwegFehler.message).slice(0, 200)}\n`
        + `Zeile steht unveraendert auf proof_status=${umweg.proof_status}, status=${umweg.status}`
      : `DURCHGELASSEN — proof_status=${umweg.proof_status}, status=${umweg.status}, `
        + `signature_hash=${umweg.signature_hash ?? 'NULL'}, is_locked=${umweg.is_locked}`)

  // ── U5) Zweite Linie: faengt die LESENDE Seite denselben Fall? ─────────
  //
  // U4 zeigt, dass so eine Zeile heute gar nicht mehr entsteht — deshalb
  // laesst sie sich fuer diese Pruefung auch nicht mehr herstellen. Der
  // Altbestand kann sie aber tragen (U10), und ein kuenftiger Schreibweg,
  // der den Trigger umgeht, ebenfalls. Geprueft wird die Regel deshalb an
  // einem NACHGEBILDETEN Datensatz: genau die Form, die der frueher offene
  // Weg hinterlassen hat.
  const wieDerUmwegAussah = {
    id: idUmweg, date: '2019-04-03', proof_status: 'UNTERSCHRIEBEN',
    signature_hash: null, client_signed_at: null, client_signature: null,
    digitale_signaturen: 0,
  }
  pruefe('U5', 'unterschriftBelegt() weist den blossen Statuswert ab',
    unterschriftBelegt(wieDerUmwegAussah) === false && belegLuecke(wieDerUmwegAussah) === true,
    `unterschriftBelegt=${unterschriftBelegt(wieDerUmwegAussah)} (erwartet false) | `
    + `belegLuecke=${belegLuecke(wieDerUmwegAussah)} (erwartet true)\n`
    + 'nachgebildet, weil die Datenbank so eine Zeile seit 20261017000000 nicht mehr entstehen laesst.')

  // ── U6) Und laesst sie den echten Beleg durch? ─────────────────────────
  //
  // Eine Sperre, die alles abweist, ist keine Sperre — sie ist ein Ausfall.
  pruefe('U6', 'derselbe Pruefer laesst den echt unterschriebenen Nachweis durch',
    unterschriftBelegt(signiert) === true && belegLuecke(signiert) === false,
    `unterschriftBelegt=${unterschriftBelegt(signiert)} (erwartet true) | `
    + `belegLuecke=${belegLuecke(signiert)} (erwartet false)`)

  // ── U7) Haelt die Sperre? ──────────────────────────────────────────────
  //
  // Wird gemessen, nicht angenommen: `is_locked` ist ein Feld, kein Riegel.
  // Ob daran ein Trigger haengt, sagt nur der Schreibversuch.
  const { error: aenderFehler } = await admin.from('service_records')
    .update({ amount: 999 }).eq('id', idRoh)
  const nachVersuch = await lies(idRoh)
  const geschuetzt = !!aenderFehler || Number(nachVersuch.amount) === 25
  pruefe('U7', 'Ein gesperrter Nachweis laesst sich im Betrag nicht mehr aendern',
    geschuetzt,
    aenderFehler
      ? `abgewiesen: ${aenderFehler.message}`
      : `DURCHGELASSEN — amount steht jetzt auf ${nachVersuch.amount} (war 25), `
        + `Hash unveraendert=${nachVersuch.signature_hash === signiert?.signature_hash}`)

  // ── U8) Beschreibt der gespeicherte Hash noch den gespeicherten Inhalt? ─
  //
  // Die zweite Verteidigungslinie und zugleich der einzige Punkt, an dem
  // der Hash seinen Nutzen zeigt. Waere U7 durchlaessig, stuende hier ein
  // Hash ueber dem ALTEN Betrag neben einem geaenderten — und genau das
  // faellt auf. Solange U7 haelt, muessen beide uebereinstimmen; eine
  // Abweichung waere eine stille Verfaelschung.
  //
  // Dieselbe Abfrage laesst sich ueber den ganzen Bestand fahren; sie ist
  // die Pruefung, die aus dem Hash eine Aussage macht.
  const nachAenderung = await lies(idRoh)
  const istHash = await orakel(
    `DO $ora$ DECLARE r text; BEGIN
       SELECT ${HASH_AUSDRUCK(0)} INTO r
         FROM public.service_records sr WHERE sr.id = '${idRoh}';
       RAISE EXCEPTION 'ORAKEL:%', r; END $ora$;`,
  )
  pruefe('U8', 'Der gespeicherte Hash beschreibt weiterhin genau den gespeicherten Inhalt',
    nachAenderung.signature_hash === istHash,
    `Betrag jetzt   : ${nachAenderung.amount} (angelegt mit 25)\n`
    + `gespeichert    : ${nachAenderung.signature_hash}\n`
    + `aus dem Inhalt : ${istHash}\n`
    + `⇒ ${nachAenderung.signature_hash === istHash
        ? 'deckungsgleich — keine Verfaelschung'
        : 'ABWEICHUNG — der Inhalt wurde nach der Unterschrift geaendert'}`)

  // ── U9) Mandantenbindung ───────────────────────────────────────────────
  const { data: fremd } = await admin.from('organizations')
    .select('id').neq('id', ORG).limit(1).maybeSingle()
  let fremdText = 'keine zweite Organisation vorhanden — nicht messbar'
  let fremdOk = true
  if (fremd?.id) {
    const { data: sichtbar } = await admin.from('service_records')
      .select('id').eq('organization_id', fremd.id).in('id', nachweise)
    fremdOk = (sichtbar ?? []).length === 0
    fremdText = `Pruefnachweise, die unter der fremden Organisation ${fremd.id.slice(0, 8)}… `
      + `stehen: ${(sichtbar ?? []).length} (erwartet 0)`
  }
  pruefe('U9', 'Die Pruefnachweise haengen ausschliesslich am eigenen Mandanten',
    fremdOk, fremdText)

  // ── U11) Der Weg, den bisher NIEMAND geprueft hat: INSERT ──────────────
  //
  // Alle Pruefungen bis hierher gehen ueber ein UPDATE — so schreibt die
  // Route. `trg_compute_signature_hash` ist aber ausdruecklich
  // BEFORE UPDATE und NICHT BEFORE INSERT:
  //
  //   CREATE TRIGGER trg_compute_signature_hash BEFORE UPDATE ON service_records
  //
  // Eine Zeile, die GLEICH als unterschrieben eingefuegt wird, laeuft
  // deshalb an ihm vorbei. `trg_a_unterschrift_beleg` greift hier (BEFORE
  // INSERT OR UPDATE) und verlangt einen Beleg — es entsteht also keine
  // beleglose Zeile. Die Frage ist eine andere: bekommt die Zeile den
  // Siegel-Hash und die Sperre, oder ist sie unterschrieben UND weiterhin
  // frei aenderbar?
  //
  // Der Fall ist nicht theoretisch: eine Nacherfassung, ein Import aus
  // einem Vorsystem und jede Migration schreiben per INSERT.
  const idInsert = await anlegen('2019-04-05', {
    proof_status: 'UNTERSCHRIEBEN',
    client_signed_at: new Date('2019-04-05T08:30:00.000Z').toISOString(),
    client_signature: 'data:image/png;base64,PRUEFUNTERSCHRIFT',
  })
  const perInsert = await lies(idInsert)
  pruefe('U11', 'Auch der INSERT-Weg erzeugt Hash UND Sperre',
    !!perInsert.signature_hash && perInsert.is_locked === true,
    `signature_hash=${perInsert.signature_hash ? perInsert.signature_hash.slice(0, 24) + '…' : 'NULL'}`
    + ` | is_locked=${perInsert.is_locked} | proof_status=${perInsert.proof_status}`
    + ` | status=${perInsert.status}\n`
    + (perInsert.signature_hash && perInsert.is_locked === true
        ? 'Der Trigger greift auch beim Einfuegen.'
        : 'OFFEN: die Zeile gilt als unterschrieben, traegt aber kein Siegel und ist\n'
          + 'nicht gesperrt — sie laesst sich danach im Betrag aendern, ohne dass es\n'
          + 'auffaellt. Ursache: trg_compute_signature_hash ist BEFORE UPDATE.'))

  // U12 misst die FOLGE von U11 — und zwar nur dann, wenn die Sperre fehlt.
  if (perInsert.is_locked !== true) {
    const { error: aendFehler } = await admin.from('service_records')
      .update({ amount: 999 }).eq('id', idInsert)
    const geaendert = await lies(idInsert)
    pruefe('U12', 'Ein unterschriebener Nachweis laesst sich im Betrag nicht mehr aendern',
      !!aendFehler || geaendert.amount === 25,
      aendFehler
        ? `abgewiesen: ${String(aendFehler.message).slice(0, 160)}`
        : `DURCHGELASSEN — Betrag steht jetzt auf ${geaendert.amount} (unterschrieben mit 25).\n`
          + 'Der Nachweis gilt als unterschrieben und wurde nach der Unterschrift\n'
          + 'im Betrag veraendert. Genau das soll der Manipulationsschutz verhindern.')
  }

  // ── U10) Und der Altbestand? ───────────────────────────────────────────
  //
  // Kein Schreibvorgang, eine Feststellung: was von den 30 Bestandszeilen
  // waere nach heutiger Regel abrechenbar.
  pruefe('U10', 'Altbestand: keine abgerechnete Zeile ohne Unterschriftsbeleg',
    abgerechnetOhneBeleg.length === 0,
    `${alle.length} Nachweise im Bestand, davon ${ohneHash.length} ohne Hash.\n`
    + `${abgerechnetOhneBeleg.length} tragen status='invoiced' OHNE Unterschriftsbeleg.\n`
    + 'Ein Nachziehen des Hashes waere hier eine Faelschung: der Zeitpunkt der\n'
    + 'Unterschrift ist unbekannt, und der Hash bildet ihn mit ab. Siehe\n'
    + 'docs/UNTERSCHRIFT_ALTBESTAND_2026-08-31.md.')
} catch (err) {
  console.error(`\n❌ ABBRUCH: ${err instanceof Error ? err.message : String(err)}`)
  ergebnisse.push({ id: 'ABBRUCH', bestanden: false })
} finally {
  const geloescht = []
  if (nachweise.length > 0) {
    // Entsperren, sonst blockiert ein Trigger das Aufraeumen — und dann
    // bliebe Pruefdatum in der Produktionsdatenbank stehen.
    await admin.from('service_records')
      .update({ is_locked: false, proof_status: 'ENTWURF' }).in('id', nachweise)
    const { data, error } = await admin.from('service_records')
      .delete().in('id', nachweise).select('id')
    geloescht.push(error ? `nachweise: FEHLER ${error.message}` : `nachweise: ${(data ?? []).length}`)
  }
  if (clientId) {
    const { data, error } = await admin.from('clients').delete().eq('id', clientId).select('id')
    geloescht.push(error ? `clients: FEHLER ${error.message}` : `clients: ${(data ?? []).length}`)
  }
  if (caregiverId) {
    const { data, error } = await admin.from('caregivers').delete().eq('id', caregiverId).select('id')
    geloescht.push(error ? `caregivers: FEHLER ${error.message}` : `caregivers: ${(data ?? []).length}`)
  }
  // Gegenprobe — „aufgeraeumt" soll keine Behauptung sein.
  if (nachweise.length > 0) {
    const { data: rest } = await admin.from('service_records').select('id').in('id', nachweise)
    geloescht.push(`rest_nachweise: ${(rest ?? []).length}`)
  }
  if (clientId) {
    const { data: restC } = await admin.from('clients').select('id').eq('id', clientId)
    geloescht.push(`rest_clients: ${(restC ?? []).length}`)
  }
  aufgeraeumt = geloescht.join(' | ') || '(nichts angelegt)'
}

console.log('\n── Aufraeumen ──────────────────────────────────────────────────────')
console.log(`  ${aufgeraeumt}`)

const offen = ergebnisse.filter(e => !e.bestanden)
console.log('\n═══════════════════════════════════════════════════════════════════')
console.log(` ${ergebnisse.length - offen.length} von ${ergebnisse.length} Pruefungen bestanden.`)
if (offen.length > 0) console.log(` OFFEN: ${offen.map(e => e.id).join(', ')}`)
console.log('═══════════════════════════════════════════════════════════════════')
process.exit(offen.length > 0 ? 1 : 0)
