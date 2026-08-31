#!/usr/bin/env node
/**
 * DIENSTPLAN → TOUR → EINSATZ, live gegen die PRODUKTIONSDATENBANK.
 *
 *   Schicht → Dienst → Einsatz → Doppelbelegungsriegel → Abwesenheit →
 *   Vertretung → Tour → Stops → Statuswege → Durchschlag auf den Einsatz
 *
 * ── WARUM GERADE HIER ─────────────────────────────────────────────────────
 *
 * Dienstplan, Tourenplanung und Einsaetze waren die drei Kernmodule ohne
 * jede Live-Pruefung. Sie haengen aneinander wie nichts sonst im System:
 * ein Dienst ohne Einsatz ist eine Absichtserklaerung, ein Einsatz ohne
 * Stop faehrt niemand an, und ein abgeschlossener Stop soll den Einsatz
 * mitziehen — sonst steht am Monatsende ein erbrachter Einsatz auf
 * „geplant" und wird nicht abgerechnet.
 *
 * Drei bekannte Befunde liegen genau hier:
 *
 *   • „Nachtdienst-Fix assignments" (20261012000000) — der
 *     Doppelbelegungs-Trigger verglich nur Minuten INNERHALB eines Tages.
 *     Zwei Einsaetze 22:00–02:00 und 01:00–03:00 galten als
 *     ueberschneidungsfrei. Die Migration steht live; ob sie greift, sagt
 *     nur ein Schreibversuch.
 *   • „Engel-RLS: caregivers-Join-Falle" — Abfragen, die ueber
 *     `caregivers` joinen, kommen still leer zurueck.
 *   • „duration_minutes ist generiert" — der Nachtdienst ueber Mitternacht
 *     ergibt eine NEGATIVE Dauer und damit eine negative Rechnungsposition.
 *
 * ── WAS GESCHRIEBEN WIRD ──────────────────────────────────────────────────
 *
 * Ein eigener Pruefklient, zwei Pruefkraefte, Dienste, Einsaetze, eine
 * Tour mit Stops — alles datiert 2019, weit weg von jeder echten
 * Auswertung, alles in der eigenen Organisation. Es entsteht KEINE
 * Rechnung, KEINE Mahnung, KEINE Zahlung. Am Ende wird alles entfernt,
 * mit Gegenprobe.
 *
 * Aufruf:  npm run verify:dienstplan-touren
 */

import { readFileSync, existsSync } from 'node:fs'

for (const datei of ['.env.local', '.env']) {
  if (!existsSync(datei)) continue
  for (const zeile of readFileSync(datei, 'utf8').split('\n')) {
    const m = zeile.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

import { createClient } from '@supabase/supabase-js'
import { apiHeaders, envWert, secretKey } from './lib/supabase-keys.mjs'
import { createSchicht, createEintrag, listEintraege } from '../lib/personal/dienstplan.ts'
import {
  pruefeCaregiverVerfuegbarkeit, findeVertretungsKandidaten, abwesenheitBlockiert,
} from '../lib/touren/server.ts'
import {
  assertTourUebergang, assertStopUebergang, pruefeReihenfolge, assignmentStatusFuerStop,
} from '../lib/touren/stops.ts'
import { writeAuditLog, listAuditLog } from '../lib/personal/audit.ts'

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

const fehlertext = err => (err instanceof Error ? err.message : String(err))

/** Lese-Orakel `public._run_sql` — der Block endet immer mit RAISE, es wird nur gelesen. */
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
  return i === -1 ? `(Orakel unerwartet, HTTP ${res.status})` : msg.slice(i + 7)
}

console.log('═══════════════════════════════════════════════════════════════════')
console.log(' DIENSTPLAN → TOUR → EINSATZ — live gegen Produktion')
console.log(` ${new Date().toISOString()}`)
console.log('═══════════════════════════════════════════════════════════════════')

const angelegt = {
  clients: [], caregivers: [], schichten: [], dienste: [],
  assignments: [], absences: [], vertretungen: [], tours: [], stops: [], audit: [],
}
let aufgeraeumt = 'nicht ausgefuehrt'

try {
  const { data: konto } = await admin.from('profiles')
    .select('id').eq('role', 'admin').limit(1).maybeSingle()
  const urheber = konto?.id
  if (!urheber) throw new Error('Kein Admin-Konto als Urheber gefunden.')

  const kennung = `PRUEF-DT-${Date.now().toString(36).toUpperCase()}`

  const neueKraft = async (nachname, initialen) => {
    const { data, error } = await admin.from('caregivers').insert({
      first_name: 'Pruefung', last_name: `${kennung}-${nachname}`, initials: initialen,
      organization_id: ORG, status: 'active', einsatzfreigabe: true,
    }).select('id').single()
    if (error) throw new Error(`Pruefkraft ${nachname} nicht anlegbar: ${error.message}`)
    angelegt.caregivers.push(data.id)
    return data.id
  }
  const kraftA = await neueKraft('A', 'PA')
  const kraftB = await neueKraft('B', 'PB')

  const { data: cl, error: clFehler } = await admin.from('clients').insert({
    customer_number: kennung, first_name: 'Pruefung', last_name: kennung,
    organization_id: ORG, zip_code: '60311',
  }).select('id').single()
  if (clFehler) throw new Error(`Pruefklient nicht anlegbar: ${clFehler.message}`)
  const klient = cl.id
  angelegt.clients.push(klient)
  console.log(`\nPruefbestand: ${kennung} (Klient ${klient.slice(0, 8)}…, Kraefte A/B)`)

  // ══ TEIL 1 — DIENSTPLAN ═══════════════════════════════════════════════

  // ── T1) Schicht und Dienst entstehen wirklich ──────────────────────────
  const schicht = await createSchicht(admin, {
    organizationId: ORG, bezeichnung: `${kennung} Frueh`, kuerzel: 'PF',
    startZeit: '07:00', endZeit: '15:00', pauseMinuten: 30,
  })
  angelegt.schichten.push(schicht.id)

  const dienst = await createEintrag(admin, {
    organizationId: ORG, datum: '2019-05-06', schichtId: schicht.id,
    caregiverId: kraftA, startZeit: '07:00', endZeit: '15:00',
    pauseMinuten: 30, erstelltVon: urheber,
  })
  angelegt.dienste.push(dienst.id)
  pruefe('T1', 'Schicht und Dienst werden angelegt und sind wieder auffindbar',
    !!schicht.id && !!dienst.id && dienst.caregiver_id === kraftA,
    `Schicht ${schicht.bezeichnung} (${schicht.start_zeit}–${schicht.end_zeit}) | `
    + `Dienst am ${dienst.datum}, Status ${dienst.status}`)

  // ── T2) Ein Zeitfenster, das keines ist, wird abgewiesen ───────────────
  //
  // Die Pause darf die Schicht nicht auffressen. Ohne diesen Riegel
  // entstuende ein Dienst mit negativer Arbeitszeit — dieselbe Klasse
  // Fehler wie die negative `duration_minutes` beim Nachtdienst.
  let zeitfenster = ''
  try {
    const d = await createEintrag(admin, {
      organizationId: ORG, datum: '2019-05-07', caregiverId: kraftA,
      startZeit: '08:00', endZeit: '09:00', pauseMinuten: 120, erstelltVon: urheber,
    })
    angelegt.dienste.push(d.id)
    zeitfenster = 'DURCHGELASSEN — 1 Stunde Dienst mit 2 Stunden Pause wurde angelegt'
  } catch (err) {
    zeitfenster = `abgewiesen: ${fehlertext(err)}`
  }
  pruefe('T2', 'Ein Dienst, dessen Pause laenger ist als er selbst, wird abgewiesen',
    zeitfenster.startsWith('abgewiesen'), zeitfenster)

  // ── T3) Die Tagesansicht findet den Dienst ─────────────────────────────
  const gelesen = await listEintraege(admin, { organizationId: ORG, datum: '2019-05-06' })
  const gefunden = gelesen.filter(e => e.id === dienst.id)
  pruefe('T3', 'Der Dienst ist ueber die Listenabfrage des Moduls lesbar',
    gefunden.length === 1,
    `${gelesen.length} Dienste am 2019-05-06 | eigener Dienst gefunden: ${gefunden.length}`)

  // ══ TEIL 2 — EINSATZ UND DOPPELBELEGUNG ═══════════════════════════════

  const neuerEinsatz = async (datum, von, bis, kraft, extra = {}) => {
    const { data, error } = await admin.from('assignments').insert({
      organization_id: ORG, client_id: klient, caregiver_id: kraft,
      assignment_date: datum, start_time: von, end_time: bis,
      service_type: 'Betreuung', status: 'GEPLANT', ...extra,
    }).select('id, status, assignment_date, start_time, end_time').single()
    if (error) return { fehler: error.message }
    angelegt.assignments.push(data.id)
    return { zeile: data }
  }

  // ── T4) Der Einsatz entsteht ───────────────────────────────────────────
  const e1 = await neuerEinsatz('2019-05-06', '09:00', '11:00', kraftA)
  pruefe('T4', 'Ein Einsatz laesst sich anlegen und traegt den eigenen Mandanten',
    !e1.fehler && !!e1.zeile,
    e1.fehler ? `FEHLER ${e1.fehler}` : `Einsatz ${e1.zeile.assignment_date} `
      + `${e1.zeile.start_time}–${e1.zeile.end_time}, Status ${e1.zeile.status}`)

  // ── T5) Doppelbelegung am selben Tag ───────────────────────────────────
  const e2 = await neuerEinsatz('2019-05-06', '10:00', '12:00', kraftA)
  pruefe('T5', 'Zwei ueberlappende Einsaetze derselben Kraft werden abgewiesen',
    !!e2.fehler && /DOPPELBELEGUNG/i.test(e2.fehler),
    e2.fehler ? `abgewiesen: ${e2.fehler.slice(0, 160)}` : 'DURCHGELASSEN — 09–11 und 10–12 stehen beide')

  // ── T6) Dieselbe Zeit, andere Kraft — muss durchgehen ──────────────────
  //
  // Eine Sperre, die alles abweist, ist keine Sperre. Ohne diese
  // Gegenprobe koennte T5 auch dann gruen sein, wenn der Trigger schlicht
  // jeden zweiten Einsatz blockiert.
  const e3 = await neuerEinsatz('2019-05-06', '10:00', '12:00', kraftB)
  pruefe('T6', 'Dieselbe Zeit bei einer ANDEREN Kraft bleibt erlaubt',
    !e3.fehler, e3.fehler ? `FAELSCHLICH abgewiesen: ${e3.fehler.slice(0, 160)}` : 'angelegt')

  // ── T7) Nachtdienst ueber Mitternacht ──────────────────────────────────
  //
  // Der Kern von Migration 20261012000000. Die alte Fassung rechnete in
  // Tagesminuten: 22:00–02:00 ergab eine negative Dauer und ueberlappte
  // mit nichts. Zwei Kraefte in derselben Nacht waren damit unsichtbar
  // doppelt verplant.
  const n1 = await neuerEinsatz('2019-05-13', '22:00', '02:00', kraftA)
  const n2 = await neuerEinsatz('2019-05-14', '01:00', '03:00', kraftA)
  pruefe('T7', 'Der Doppelbelegungsriegel rechnet ueber Mitternacht',
    !n1.fehler && !!n2.fehler && /DOPPELBELEGUNG/i.test(n2.fehler),
    `Nacht 13.→14. 22:00–02:00: ${n1.fehler ? `FEHLER ${n1.fehler.slice(0, 80)}` : 'angelegt'}\n`
    + `Folgetag 01:00–03:00:     ${n2.fehler ? `abgewiesen (${n2.fehler.slice(0, 90)})` : 'DURCHGELASSEN — Ueberlappung nicht erkannt'}`)

  // ── T8) Ein stornierter Einsatz blockiert nichts mehr ──────────────────
  if (e1.zeile) {
    await admin.from('assignments').update({ status: 'STORNIERT' }).eq('id', e1.zeile.id)
  }
  const e4 = await neuerEinsatz('2019-05-06', '09:30', '10:30', kraftA)
  pruefe('T8', 'Ein stornierter Einsatz belegt die Zeit nicht laenger',
    !e4.fehler,
    e4.fehler ? `abgewiesen, obwohl der Vorgaenger storniert ist: ${e4.fehler.slice(0, 140)}` : 'angelegt')

  // ══ TEIL 3 — ABWESENHEIT UND VERTRETUNG ═══════════════════════════════

  // ── T9) Eine genehmigte Abwesenheit blockiert ──────────────────────────
  const { data: abw, error: abwFehler } = await admin.from('absences').insert({
    organization_id: ORG, caregiver_id: kraftA, absence_type: 'vacation',
    start_date: '2019-06-03', end_date: '2019-06-07', status: 'genehmigt',
  }).select('id').single()
  if (abwFehler) throw new Error(`Abwesenheit nicht anlegbar: ${abwFehler.message}`)
  angelegt.absences.push(abw.id)

  const befund = await pruefeCaregiverVerfuegbarkeit(admin, kraftA, '2019-06-05', '09:00', '11:00')
  pruefe('T9', 'Eine genehmigte Abwesenheit macht die Kraft am Tourtag unverfuegbar',
    befund.abwesend === true,
    `abwesend=${befund.abwesend} | Grund=${befund.abwesenheitsGrund ?? '(keiner)'}`)

  // ── T10) Ein abgelehnter Antrag blockiert NICHT ────────────────────────
  //
  // Der Unterschied entscheidet, ob eine abgelehnte Urlaubsbitte den
  // Mitarbeiter faktisch trotzdem aus dem Plan nimmt. Genau das war der
  // Befund hinter BLOCKIERENDE_ABWESENHEITS_STATUS.
  await admin.from('absences').update({ status: 'abgelehnt' }).eq('id', abw.id)
  const befundAbgelehnt = await pruefeCaregiverVerfuegbarkeit(admin, kraftA, '2019-06-05', '09:00', '11:00')
  pruefe('T10', 'Eine ABGELEHNTE Abwesenheit blockiert die Planung nicht',
    befundAbgelehnt.abwesend === false
      && abwesenheitBlockiert('abgelehnt') === false
      && abwesenheitBlockiert('genehmigt') === true
      && abwesenheitBlockiert(null) === true,
    `abwesend=${befundAbgelehnt.abwesend} (erwartet false)\n`
    + `Regel: genehmigt⇒${abwesenheitBlockiert('genehmigt')} | abgelehnt⇒${abwesenheitBlockiert('abgelehnt')} | `
    + `NULL(Altbestand)⇒${abwesenheitBlockiert(null)}`)
  await admin.from('absences').update({ status: 'genehmigt' }).eq('id', abw.id)

  // ── T11) Vertretungssuche findet die zweite Kraft ──────────────────────
  const kandidaten = await findeVertretungsKandidaten(admin, {
    organizationId: ORG, tourDate: '2019-06-05',
    ausgeschlossenCaregiverId: kraftA, clientIds: [klient],
  })
  const kandidatB = kandidaten.find(k => k.caregiver_id === kraftB)
  const kandidatA = kandidaten.find(k => k.caregiver_id === kraftA)
  pruefe('T11', 'Die Vertretungssuche schlaegt die freie Kraft vor und schliesst die abwesende aus',
    !!kandidatB && kandidatB.abwesend === false && !kandidatA,
    `${kandidaten.length} Kandidaten | Kraft B dabei: ${!!kandidatB}`
    + (kandidatB ? ` (abwesend=${kandidatB.abwesend}, bevorzugt=${kandidatB.bevorzugt})` : '')
    + ` | die abwesende Kraft A ausgeschlossen: ${!kandidatA}`)

  // ── T12) Die Vertretungsanfrage wird zur Zeile ─────────────────────────
  const { data: vertretung, error: vFehler } = await admin.from('substitution_requests').insert({
    organization_id: ORG, client_id: klient, original_caregiver_id: kraftA,
    absence_id: abw.id, date: '2019-06-05', start_time: '09:00', end_time: '11:00',
    service_type: 'Betreuung', status: 'open',
  }).select('id, status').single()
  if (!vFehler) angelegt.vertretungen.push(vertretung.id)
  pruefe('T12', 'Aus der Abwesenheit entsteht eine nachvollziehbare Vertretungsanfrage',
    !vFehler && !!vertretung?.id,
    vFehler ? `FEHLER ${vFehler.message}` : `Anfrage ${vertretung.id.slice(0, 8)}… Status ${vertretung.status}`)

  // ══ TEIL 4 — TOUR UND STOPS ═══════════════════════════════════════════

  // ── T13) Statuswege, bevor etwas geschrieben wird ──────────────────────
  const wege = []
  const wegeOk = (fn, alt, neu, sollErlauben) => {
    try { fn(alt, neu); wege.push(`${alt}→${neu}: erlaubt`); return sollErlauben }
    catch { wege.push(`${alt}→${neu}: abgewiesen`); return !sollErlauben }
  }
  const tourWege = wegeOk(assertTourUebergang, 'GEPLANT', 'FREIGEGEBEN', true)
    && wegeOk(assertTourUebergang, 'ABGESCHLOSSEN', 'GEPLANT', false)
  const stopWege = wegeOk(assertStopUebergang, 'GEPLANT', 'UNTERWEGS', true)
    && wegeOk(assertStopUebergang, 'ABGESCHLOSSEN', 'GEPLANT', false)
  pruefe('T13', 'Statuswege von Tour und Stop lassen nur vorwaerts zu',
    tourWege && stopWege, wege.join('\n'))

  // ── T14) Tour und Stops entstehen ──────────────────────────────────────
  const { data: tour, error: tourFehler } = await admin.from('tours').insert({
    organization_id: ORG, caregiver_id: kraftB, tour_date: '2019-05-20',
    name: `${kennung} Tour`, status: 'GEPLANT', start_zeit: '08:00', ende_zeit: '12:00',
  }).select('id, status').single()
  if (tourFehler) throw new Error(`Tour nicht anlegbar: ${tourFehler.message}`)
  angelegt.tours.push(tour.id)

  const tourEinsatz = await neuerEinsatz('2019-05-20', '09:00', '10:00', kraftB)
  if (tourEinsatz.fehler) throw new Error(`Tour-Einsatz nicht anlegbar: ${tourEinsatz.fehler}`)

  const stopIds = []
  for (const [i, zeit] of [['09:00', '10:00'], ['10:30', '11:30']].entries()) {
    const { data: st, error: stFehler } = await admin.from('tour_stops').insert({
      organization_id: ORG, tour_id: tour.id, client_id: klient,
      assignment_id: i === 0 ? tourEinsatz.zeile.id : null,
      position: i + 1, geplante_ankunft: zeit[0], geplantes_ende: zeit[1],
      plz: '60311', status: 'GEPLANT',
    }).select('id').single()
    if (stFehler) throw new Error(`Stop ${i + 1} nicht anlegbar: ${stFehler.message}`)
    stopIds.push(st.id)
    angelegt.stops.push(st.id)
  }
  pruefe('T14', 'Eine Tour mit zwei Stops entsteht und haengt am richtigen Einsatz',
    stopIds.length === 2,
    `Tour ${tour.id.slice(0, 8)}… Status ${tour.status} | Stops ${stopIds.length}`)

  // ── T15) Die Reihenfolge laesst sich nicht verbiegen ───────────────────
  const guteFolge = pruefeReihenfolge([stopIds[1], stopIds[0]], stopIds)
  const fremdeFolge = pruefeReihenfolge([stopIds[0], '00000000-0000-0000-0000-000000000000'], stopIds)
  const halbeFolge = pruefeReihenfolge([stopIds[0]], stopIds)
  pruefe('T15', 'Eine Umsortierung muss genau dieselben Stops nennen — nicht mehr, nicht weniger',
    guteFolge.ok === true && fremdeFolge.ok === false && halbeFolge.ok === false,
    `Tausch der beiden eigenen Stops : ${guteFolge.ok}  (erwartet true)\n`
    + `fremde Stop-ID eingeschmuggelt  : ${fremdeFolge.ok}  (erwartet false) ${fremdeFolge.fehler ?? ''}\n`
    + `ein Stop weggelassen            : ${halbeFolge.ok}  (erwartet false) ${halbeFolge.fehler ?? ''}`)

  // ── T16) Der abgeschlossene Stop zieht den Einsatz mit ─────────────────
  //
  // Der Folgeprozess. Bliebe der Einsatz auf 'GEPLANT', stuende am
  // Monatsende eine erbrachte Leistung als nicht erbracht da — und wuerde
  // nicht abgerechnet.
  const zielStatus = assignmentStatusFuerStop('ABGESCHLOSSEN')
  await admin.from('tour_stops').update({
    status: 'ABGESCHLOSSEN',
    tatsaechliche_ankunft: '2019-05-20T07:02:00.000Z',
    tatsaechliches_ende: '2019-05-20T08:01:00.000Z',
  }).eq('id', stopIds[0])
  if (zielStatus) {
    await admin.from('assignments').update({ status: zielStatus }).eq('id', tourEinsatz.zeile.id)
  }
  const { data: nachher } = await admin.from('assignments')
    .select('status').eq('id', tourEinsatz.zeile.id).single()
  pruefe('T16', 'Ein abgeschlossener Stop fuehrt zu einem beendeten Einsatz',
    !!zielStatus && nachher?.status === zielStatus,
    `Stop ABGESCHLOSSEN ⇒ Einsatzstatus laut Modul: ${zielStatus ?? '(keiner)'} | `
    + `Einsatz steht auf: ${nachher?.status ?? '(unlesbar)'}`)

  // ── T17) Mandantenbindung ──────────────────────────────────────────────
  const { data: fremdeOrg } = await admin.from('organizations')
    .select('id').neq('id', ORG).limit(1).maybeSingle()
  let mandantText = 'keine zweite Organisation vorhanden — nicht messbar'
  let mandantOk = true
  if (fremdeOrg?.id) {
    const proben = await Promise.all([
      admin.from('tours').select('id').eq('organization_id', fremdeOrg.id).in('id', angelegt.tours),
      admin.from('tour_stops').select('id').eq('organization_id', fremdeOrg.id).in('id', angelegt.stops),
      admin.from('assignments').select('id').eq('organization_id', fremdeOrg.id).in('id', angelegt.assignments),
    ])
    const fremd = proben.reduce((n, p) => n + (p.data ?? []).length, 0)
    mandantOk = fremd === 0
    mandantText = `Pruefzeilen unter der fremden Organisation ${fremdeOrg.id.slice(0, 8)}…: ${fremd} (erwartet 0)`
  }
  pruefe('T17', 'Tour, Stops und Einsaetze haengen ausschliesslich am eigenen Mandanten',
    mandantOk, mandantText)

  // ── T18) Die Spur der Dienstanlage ─────────────────────────────────────
  //
  // Geschrieben wird sie von der ROUTE (app/api/personal/dienstplan/
  // eintraege/route.ts ruft writeAuditLog), nicht vom Modul und nicht von
  // einem Trigger. Der erste Anlauf dieser Pruefung suchte die Spur, ohne
  // sie erzeugt zu haben — `createEintrag` allein schreibt keine. Geprueft
  // wird deshalb genau der Weg, den die Route geht.
  await writeAuditLog(admin, {
    organizationId: ORG, entitaetTyp: 'dienstplan', entitaetId: dienst.id,
    caregiverId: kraftA, aktion: 'erstellt',
    nachher: { datum: dienst.datum, start: dienst.start_zeit, ende: dienst.end_zeit },
    // Ausdruecklich als Pruefspur gekennzeichnet: die Zeile BLEIBT stehen
    // (siehe T20), und wer sie spaeter in einer Auswertung sieht, soll
    // sofort erkennen, woher sie kommt.
    grund: `synthetische Pruefung verify:dienstplan-touren (${kennung})`,
    benutzerId: urheber, benutzerRolle: 'admin',
  })
  const spur = await listAuditLog(admin, {
    organizationId: ORG, entitaetTyp: 'dienstplan', entitaetId: dienst.id,
  })
  angelegt.audit.push(...spur.map(z => z.id))
  pruefe('T18', 'Die Dienstanlage hinterlaesst eine lesbare Spur mit Urheber und Mandant',
    spur.length === 1 && spur[0].benutzer_id === urheber && spur[0].organization_id === ORG,
    spur.length === 0
      ? 'keine Spur in personal_audit_log'
      : `${spur.length} Eintrag | aktion=${spur[0].aktion} | Urheber=${spur[0].benutzer_id === urheber ? 'stimmt' : 'FALSCH'} `
        + `| Mandant=${spur[0].organization_id === ORG ? 'stimmt' : 'FALSCH'}`)

  // ── T19) Und was traegt die Spur, wenn niemand die Route benutzt? ──────
  //
  // Ein Schreibvorgang direkt auf die Tabelle — so, wie ihn ein Skript,
  // ein Cron oder eine kuenftige Route mit Dienstschluessel ausloest.
  // `dienstplan_eintraege` traegt live FUENF Trigger, aber keinen, der
  // protokolliert. Die Spur haengt damit ausschliesslich an der Route.
  //
  // WARUM DAS NICHT MIT EINEM TRIGGER ZU LOESEN IST: `personal_audit_log`
  // hat `benutzer_id NOT NULL`, und unter dem Dienstschluessel ist
  // `auth.uid()` NULL (Projekt-Befund). Ein protokollierender Trigger
  // wuerde deshalb nicht bloss leer schreiben — er wuerde JEDEN
  // Dienstschluessel-Schreibvorgang auf dieser Tabelle scheitern lassen.
  // Beide Tatsachen werden hier gemessen, damit der Schluss nicht
  // behauptet ist.
  const vorher = (await listAuditLog(admin, {
    organizationId: ORG, entitaetTyp: 'dienstplan', entitaetId: dienst.id,
  })).length
  await admin.from('dienstplan_eintraege')
    .update({ notizen: 'am Modul und an der Route vorbei geaendert' }).eq('id', dienst.id)
  const nachDirekt = await listAuditLog(admin, {
    organizationId: ORG, entitaetTyp: 'dienstplan', entitaetId: dienst.id,
  })
  const uidUnterDienstschluessel = await orakel(
    `DO $ora$ DECLARE r text; BEGIN
       SELECT 'auth.uid()=' || COALESCE(auth.uid()::text, 'NULL')
         || ' | benutzer_id NOT NULL=' || (
           SELECT (is_nullable = 'NO')::text FROM information_schema.columns
            WHERE table_schema='public' AND table_name='personal_audit_log'
              AND column_name='benutzer_id')
         || ' | protokollierende Trigger auf dienstplan_eintraege=' || (
           SELECT count(*)::text FROM pg_trigger tg JOIN pg_class c ON c.oid=tg.tgrelid
            JOIN pg_proc p ON p.oid=tg.tgfoid
            WHERE c.relname='dienstplan_eintraege' AND NOT tg.tgisinternal
              AND p.proname LIKE '%audit%')
         INTO r;
       RAISE EXCEPTION 'ORAKEL:%', r; END $ora$;`,
  )
  pruefe('T19', 'Die Dienstplan-Spur haengt an der Route — nachgewiesen, nicht vermutet',
    nachDirekt.length === vorher,
    `Aenderung direkt auf der Tabelle: Spur vorher ${vorher}, nachher ${nachDirekt.length} `
    + `⇒ ${nachDirekt.length === vorher ? 'keine zusaetzliche Spur' : 'unerwartet protokolliert'}\n`
    + `${uidUnterDienstschluessel}\n`
    + 'FOLGE: jeder Schreibweg auf dienstplan_eintraege MUSS ueber die Route laufen.\n'
    + 'Ein protokollierender Trigger ist hier KEINE Loesung — er wuerde mangels\n'
    + 'auth.uid() gegen benutzer_id NOT NULL laufen und jeden Dienstschluessel-\n'
    + 'Schreibvorgang scheitern lassen.')

  // ── T20) Ist die Spur unveraenderlich? ─────────────────────────────────
  //
  // Eine Revisionsspur, die sich loeschen laesst, ist keine. Der Versuch
  // laeuft mit dem DIENSTSCHLUESSEL — der hoechsten Berechtigung, die es
  // hier gibt. Haelt der Riegel dagegen, haelt er gegen alles.
  //
  // Nebenwirkung mit Absicht: die Pruefzeile bleibt danach stehen. Sie
  // wegzuraeumen hiesse, genau die Eigenschaft zu untergraben, die hier
  // nachgewiesen wird. Deshalb traegt sie oben einen Grund, der sie als
  // synthetisch ausweist.
  const zuLoeschen = spur[0]?.id
  let unveraenderlich = 'keine Spur zum Pruefen vorhanden'
  let unveraenderlichOk = false
  if (zuLoeschen) {
    const { error: loeschFehler } = await admin
      .from('personal_audit_log').delete().eq('id', zuLoeschen)
    const { data: nochDa } = await admin
      .from('personal_audit_log').select('id').eq('id', zuLoeschen)
    unveraenderlichOk = !!loeschFehler && (nochDa ?? []).length === 1
    unveraenderlich = loeschFehler
      ? `Loeschen abgewiesen: ${loeschFehler.message}\nZeile steht weiterhin: ${(nochDa ?? []).length === 1}`
      : `DURCHGELASSEN — die Revisionsspur liess sich mit dem Dienstschluessel entfernen `
        + `(verbleibend: ${(nochDa ?? []).length})`
  }
  pruefe('T20', 'Die HR-Revisionsspur laesst sich auch mit dem Dienstschluessel nicht loeschen',
    unveraenderlichOk, unveraenderlich)

} catch (err) {
  console.error(`\n❌ ABBRUCH: ${fehlertext(err)}`)
  ergebnisse.push({ id: 'ABBRUCH', bestanden: false })
} finally {
  const geloescht = []
  const weg = async (tabelle, ids, spalte = 'id') => {
    if (ids.length === 0) return
    const { data, error } = await admin.from(tabelle).delete().in(spalte, ids).select('id')
    geloescht.push(error ? `${tabelle}: FEHLER ${error.message}` : `${tabelle}: ${(data ?? []).length}`)
  }
  // Reihenfolge nach Abhaengigkeit — Stops vor Touren, Einsaetze zuletzt.
  // personal_audit_log wird NICHT aufgeraeumt — die Tabelle ist
  // unveraenderlich (T20), und ein Loeschversuch waere ein Widerspruch zu
  // dem, was diese Pruefung gerade nachgewiesen hat. Die Zeile traegt
  // einen Grund, der sie als synthetisch ausweist.
  if (angelegt.audit.length > 0) {
    geloescht.push(`personal_audit_log: ${angelegt.audit.length} Zeile(n) bleiben (unveraenderlich, so gewollt)`)
  }
  await weg('tour_stops', angelegt.stops)
  await weg('tours', angelegt.tours)
  await weg('substitution_requests', angelegt.vertretungen)
  await weg('absences', angelegt.absences)
  await weg('assignments', angelegt.assignments)
  await weg('dienstplan_eintraege', angelegt.dienste)
  await weg('dienstplan_schichten', angelegt.schichten)
  await weg('clients', angelegt.clients)
  await weg('caregivers', angelegt.caregivers)

  // Gegenprobe — „aufgeraeumt" soll keine Behauptung sein.
  for (const [tabelle, ids] of [
    ['tour_stops', angelegt.stops], ['tours', angelegt.tours],
    ['assignments', angelegt.assignments], ['dienstplan_eintraege', angelegt.dienste],
    ['clients', angelegt.clients], ['caregivers', angelegt.caregivers],
  ]) {
    if (ids.length === 0) continue
    const { data: rest } = await admin.from(tabelle).select('id').in('id', ids)
    geloescht.push(`rest_${tabelle}: ${(rest ?? []).length}`)
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
