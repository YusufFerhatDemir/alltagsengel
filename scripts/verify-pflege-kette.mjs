#!/usr/bin/env node
/**
 * PFLEGEPROZESS-KETTE gegen die PRODUKTIONSDATENBANK.
 *
 *   Klient → Massnahmenplan → Massnahme → Durchfuehrung (Verlauf)
 *   → Evaluation → Wiedervorlage → Unveraenderlichkeit
 *
 * ── WARUM ES DIESE PRUEFUNG GIBT ──────────────────────────────────────────
 *
 * Der Geldweg (verify:geldweg) und die zehn E2E-Ketten decken Nachweis,
 * Rechnung, Zahlung und Mahnwesen ab. Der PFLEGEPROZESS — das fachliche
 * Herz der Software und der Gegenstand von § 114 SGB XI — hatte keine
 * einzige Pruefung gegen die echte Datenbank. Getestet war er nur gegen
 * einen nachgebildeten Supabase-Client.
 *
 * Genau diese Luecke hat im Marketing einen P0 verdeckt: `erteileEinwilligung`
 * scheiterte bei JEDEM Aufruf an einem partiellen Index, und der
 * Doppelgaenger nahm das Upsert widerspruchslos an. Ein Modul kann
 * vollstaendig aussehen und an seiner zentralen Schreiboperation tot sein.
 * Dieselbe Klasse Fehler wird hier gesucht.
 *
 * ── WAS GESCHRIEBEN WIRD ──────────────────────────────────────────────────
 *
 * Echte Zeilen, ueber die echten Modulfunktionen — anders geht es nicht,
 * denn geprueft werden sollen ja genau sie. Alles haengt an EINEM eigens
 * angelegten Pruefklienten und wird am Ende wieder entfernt; der
 * Aufraeumschritt laeuft in `finally` und meldet, was er getan hat.
 *
 * Zwei Dinge bleiben bewusst stehen, wenn sie entstehen: Eintraege in
 * pflege_audit_log und in der Sicherheitsspur. Beide sind unveraenderlich,
 * und das ist richtig so — sie belegen, dass diese Pruefung stattgefunden
 * hat.
 *
 * Aufruf:  npm run verify:pflege-kette
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
import { envWert, secretKey } from './lib/supabase-keys.mjs'
import { createPlan, freigebenPlan } from '../lib/pflege/massnahmenplaene.ts'
import { createMassnahme, updateMassnahme } from '../lib/pflege/massnahmen.ts'
import { evaluiereMassnahme, listEvaluationen } from '../lib/pflege/evaluation.ts'
import { createVerlauf } from '../lib/pflege/verlauf.ts'

const URL_BASIS = envWert('NEXT_PUBLIC_SUPABASE_URL')
const SERVICE = secretKey()
const ORG = '00000000-0000-4000-8000-000460629986'
if (!URL_BASIS || !SERVICE) {
  console.error('Fehlt: NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY')
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

console.log('═══════════════════════════════════════════════════════════════════')
console.log(' PFLEGEPROZESS-KETTE — live gegen Produktion')
console.log(` ${new Date().toISOString()}`)
console.log('═══════════════════════════════════════════════════════════════════')

let klientId = null
let planId = null
const angelegt = { plaene: [], massnahmen: [], evaluationen: [], verlaeufe: [] }
let aufgeraeumt = 'nicht ausgefuehrt'

try {
  // ── Ein Pruefklient, nur fuer diesen Lauf ───────────────────────────────
  const kennung = `PRUEF-KETTE-${Date.now().toString(36).toUpperCase()}`
  const { data: klient, error: klientFehler } = await admin
    .from('clients')
    .insert({
      customer_number: kennung, first_name: 'Pruefung', last_name: 'Pflegekette',
      organization_id: ORG,
    })
    .select('id').single()

  if (klientFehler) throw new Error(`Pruefklient nicht anlegbar: ${klientFehler.message}`)
  klientId = klient.id
  console.log(`\nPruefklient: ${kennung} (${klientId})`)

  // Ein echtes Konto als Urheber — die Spalten sind FK-gebunden.
  const { data: konto } = await admin.from('profiles')
    .select('id').eq('role', 'admin').limit(1).maybeSingle()
  const urheber = konto?.id
  if (!urheber) throw new Error('Kein Admin-Konto als Urheber gefunden.')

  // ── P1) Massnahmenplan ──────────────────────────────────────────────────
  const plan = await createPlan(admin, {
    organizationId: ORG, clientId: klientId,
    titel: 'Kettenpruefung — wird wieder entfernt',
    erstelltVon: urheber,
  })
  planId = plan.id
  angelegt.plaene.push(plan.id)
  pruefe('P1', 'Massnahmenplan laesst sich anlegen',
    !!plan.id, `plan=${plan.id} titel="${plan.titel}"`)

  // ── P2) Massnahme mit Wiedervorlage-Intervall ───────────────────────────
  const massnahme = await createMassnahme(admin, {
    organizationId: ORG, planId,
    kategorie: 'koerperpflege',
    titel: 'Kettenpruefung Massnahme',
    haeufigkeit: 'taeglich',
    evaluationIntervallTage: 14,
    erstelltVon: urheber,
  })
  angelegt.massnahmen.push(massnahme.id)
  pruefe('P2', 'Massnahme haengt am Plan und traegt ihr Intervall',
    massnahme.plan_id === planId,
    `massnahme=${massnahme.id} plan=${massnahme.plan_id} `
    + `intervall=${massnahme.evaluation_intervall_tage ?? '-'}`)

  // ── P3) Durchfuehrung im Verlauf ────────────────────────────────────────
  const verlauf = await createVerlauf(admin, {
    organizationId: ORG, clientId: klientId,
    inhalt: 'Kettenpruefung: Durchfuehrung dokumentiert. Wird wieder entfernt.',
    massnahmeId: massnahme.id,
    autorId: urheber,
    autorName: 'Kettenpruefung',
    autorRolle: 'admin',
  })
  angelegt.verlaeufe.push(verlauf.id)
  pruefe('P3', 'Die Durchfuehrung laesst sich der Massnahme zuordnen',
    verlauf.massnahme_id === massnahme.id,
    `verlauf=${verlauf.id} massnahme=${verlauf.massnahme_id}`)

  // ── P3b) Freigabe: ein Entwurf ist nicht evaluierbar ────────────────────
  //
  // Der Versuch, direkt zu evaluieren, wird abgewiesen — und das ist
  // richtig: ein Plan im Entwurf hat nie gewirkt, eine Beurteilung seiner
  // Wirkung waere eine Aussage ueber nichts. Erst wird die Sperre
  // geprueft, dann freigegeben.
  let entwurfAbgewiesen = ''
  try {
    await evaluiereMassnahme(admin, {
      organizationId: ORG, massnahmeId: massnahme.id,
      zielerreichung: 'teilweise_erreicht',
      bewertung: 'Darf im Entwurf nicht gehen.',
      folgerung: 'fortfuehren', evaluiertVon: urheber,
    })
    entwurfAbgewiesen = 'DURCHGELASSEN — ein Entwurf liess sich evaluieren'
  } catch (err) {
    entwurfAbgewiesen = `abgewiesen: ${err instanceof Error ? err.message : String(err)}`
  }
  pruefe('P3b', 'Ein Plan im Entwurf laesst sich NICHT evaluieren',
    entwurfAbgewiesen.startsWith('abgewiesen'), entwurfAbgewiesen)

  const freigegeben = await freigebenPlan(admin, planId, ORG, urheber)
  pruefe('P3c', 'Der Plan laesst sich freigeben',
    freigegeben.status === 'aktiv',
    `status=${freigegeben.status} freigegeben_am=${freigegeben.freigegeben_am ?? '-'}`)

  // ── P4) Evaluation — der Regelkreis nach § 114 SGB XI ───────────────────
  const evaluation = await evaluiereMassnahme(admin, {
    organizationId: ORG, massnahmeId: massnahme.id,
    zielerreichung: 'teilweise_erreicht',
    bewertung: 'Kettenpruefung: Bewertung ohne fachliche Bedeutung.',
    folgerung: 'fortfuehren',
    evaluiertVon: urheber,
  })
  angelegt.evaluationen.push(evaluation.id)
  pruefe('P4', 'Evaluation laesst sich zur Massnahme erfassen',
    evaluation.massnahme_id === massnahme.id,
    `evaluation=${evaluation.id} zielerreichung=${evaluation.zielerreichung} `
    + `folgerung=${evaluation.folgerung}`)

  // ── P5) Rechnet der Trigger die Wiedervorlage aus? ──────────────────────
  //
  // Der Kern des Regelkreises: ohne naechste Wiedervorlage ist eine
  // Evaluation ein Einzelereignis statt eines Kreislaufs. Der Wert wird
  // NICHT im Code gesetzt — ihn rechnet der DB-Trigger aus dem Intervall
  // der Massnahme. Genau deshalb ist er nur live pruefbar.
  // Der Trigger trg_pme_wiedervorlage schreibt das Datum auf die MASSNAHME,
  // nicht auf die Evaluationszeile — dort steht der Regelkreis, denn die
  // Frage lautet „wann ist diese Massnahme wieder faellig", nicht „wann war
  // diese Beurteilung". Beim ersten Lauf sah die Pruefung auf die falsche
  // Tabelle und meldete den Trigger als tot.
  const { data: nachEval } = await admin
    .from('pflege_massnahmen')
    .select('naechste_evaluation, evaluation_intervall_tage')
    .eq('id', massnahme.id).maybeSingle()
  const { data: evalZeile } = await admin
    .from('pflege_massnahmen_evaluationen')
    .select('evaluiert_am')
    .eq('id', evaluation.id).maybeSingle()
  const erwartet = evalZeile?.evaluiert_am
    ? new Date(new Date(evalZeile.evaluiert_am).getTime() + 14 * 86_400_000)
      .toISOString().slice(0, 10)
    : null
  pruefe('P5', 'Der Trigger schreibt die naechste Wiedervorlage an die Massnahme',
    !!nachEval?.naechste_evaluation
      && String(nachEval.naechste_evaluation).slice(0, 10) === erwartet,
    `evaluiert_am=${evalZeile?.evaluiert_am ?? '-'} | intervall=${nachEval?.evaluation_intervall_tage ?? '-'} `
    + `| naechste=${nachEval?.naechste_evaluation ?? 'NICHT GESETZT'} | erwartet=${erwartet}`)

  // ── P6) Lesen: findet die Abfrage die Evaluation wieder? ────────────────
  const liste = await listEvaluationen(admin, { organizationId: ORG, massnahmeId: massnahme.id })
  const gefunden = (Array.isArray(liste) ? liste : liste?.daten ?? [])
    .some(e => e.id === evaluation.id)
  pruefe('P6', 'Die Evaluation ist ueber die Abfrage wieder auffindbar',
    gefunden, `Treffer=${gefunden}`)

  // ── P7) Unveraenderlichkeit der Evaluation ──────────────────────────────
  //
  // Eine nachtraeglich aenderbare Beurteilung ist kein Nachweis. Der
  // Trigger pflege_evaluation_unveraenderlich soll das verhindern —
  // geprueft wird der Riegel, nicht seine Existenz.
  const { error: aenderungsFehler } = await admin
    .from('pflege_massnahmen_evaluationen')
    .update({ bewertung: 'nachtraeglich geaendert' })
    .eq('id', evaluation.id)

  // JEDER Fehler waere hier zu wenig: beim ersten Lauf stand hier ein
  // falscher Tabellenname, und „Tabelle nicht gefunden" ging als
  // erfolgreiche Abweisung durch. Ein Pruefer, der einen eigenen Tippfehler
  // als bestandene Sperre meldet, ist schlimmer als keiner. Gezaehlt wird
  // deshalb nur eine Abweisung, die nach dem Riegel KLINGT.
  const wirklichAbgewiesen = !!aenderungsFehler
    && /unver|immutab|nicht.*aender|not allowed|P0001/i.test(
      `${aenderungsFehler.message} ${aenderungsFehler.code ?? ''}`)
  pruefe('P7', 'Eine erfasste Evaluation laesst sich nicht mehr aendern',
    wirklichAbgewiesen,
    aenderungsFehler
      ? `${wirklichAbgewiesen ? 'abgewiesen' : 'FEHLER, aber nicht der Riegel'}: ${aenderungsFehler.message}`
      : 'DURCHGELASSEN — der Riegel greift nicht')

  // ── P8) Mandantenbindung der Massnahme ──────────────────────────────────
  const { data: fremdOrg } = await admin.from('organizations')
    .select('id').neq('id', ORG).limit(1).maybeSingle()
  let fremdMeldung = 'kein zweiter Mandant vorhanden — nicht pruefbar'
  let fremdOk = false
  if (fremdOrg?.id) {
    try {
      await createMassnahme(admin, {
        organizationId: fremdOrg.id, planId,   // Plan gehoert zur STAMM-Org
        kategorie: 'koerperpflege', titel: 'Darf nicht entstehen',
        erstelltVon: urheber,
      })
      fremdMeldung = 'DURCHGELASSEN — eine Massnahme haengt an einem fremden Plan'
    } catch (err) {
      fremdOk = true
      fremdMeldung = `abgewiesen: ${err instanceof Error ? err.message : String(err)}`
    }
  }
  pruefe('P8', 'Eine Massnahme kann nicht an einem fremdmandantigen Plan haengen',
    fremdOk, fremdMeldung)

  // ── P9) Pflichtfelder ───────────────────────────────────────────────────
  let leerOk = false
  let leerMeldung = ''
  try {
    await createMassnahme(admin, {
      organizationId: ORG, planId, kategorie: 'koerperpflege', titel: '   ',
      erstelltVon: urheber,
    })
    leerMeldung = 'DURCHGELASSEN — eine Massnahme ohne Titel ist entstanden'
  } catch (err) {
    leerOk = true
    leerMeldung = `abgewiesen: ${err instanceof Error ? err.message : String(err)}`
  }
  pruefe('P9', 'Eine Massnahme ohne Titel wird abgewiesen', leerOk, leerMeldung)

  // ── P10) Audit-Spur des Pflegemoduls ────────────────────────────────────
  const { data: spur } = await admin
    .from('pflege_audit_log')
    .select('id, aktion, entitaet_typ, entitaet_id')
    .eq('organization_id', ORG)
    .order('erstellt_am', { ascending: false })
    .limit(30)
  // Ueber die KENNUNGEN dieses Laufs, nicht ueber Typnamen: so kann die
  // Pruefung nicht versehentlich fremde Eintraege mitzaehlen.
  const eigene = new Set([...angelegt.massnahmen, ...angelegt.plaene, ...angelegt.evaluationen])
  const zurKette = (spur ?? []).filter(z => eigene.has(String(z.entitaet_id)))
  pruefe('P10', 'Die Aenderungen hinterlassen eine Spur im Pflege-Audit',
    zurKette.length > 0,
    `${zurKette.length} Eintraege zu den Kennungen dieses Laufs: `
    + zurKette.slice(0, 5).map(z => `${z.entitaet_typ}/${z.aktion}`).join(', '))

} catch (err) {
  console.error(`\n✗ ABBRUCH: ${err instanceof Error ? err.message : String(err)}`)
  ergebnisse.push({ id: 'ABBRUCH', bestanden: false })
} finally {
  // ── Aufraeumen, von innen nach aussen ───────────────────────────────────
  const geloescht = []
  const weg = async (tabelle, ids) => {
    if (ids.length === 0) return
    const { data, error } = await admin.from(tabelle).delete().in('id', ids).select('id')
    geloescht.push(error ? `${tabelle}: FEHLER ${error.message}` : `${tabelle}: ${(data ?? []).length}`)
  }
  // Evaluationen NICHT einzeln loeschen: der Riegel
  // pflege_evaluation_unveraenderlich verbietet auch DELETE — richtig so.
  // Sie verschwinden mit der Massnahme ueber die Fremdschluessel-Kaskade;
  // die Gegenprobe unten zaehlt nach, ob wirklich nichts stehen bleibt.
  await weg('pflege_verlauf', angelegt.verlaeufe)
  await weg('pflege_massnahmen', angelegt.massnahmen)
  await weg('pflege_massnahmenplaene', angelegt.plaene)
  if (klientId) {
    const { data, error } = await admin.from('clients').delete().eq('id', klientId).select('id')
    geloescht.push(error ? `clients: FEHLER ${error.message}` : `clients: ${(data ?? []).length}`)
  }
  // Gegenprobe: bleibt wirklich nichts stehen? Ohne sie waere „aufgeraeumt"
  // eine Behauptung.
  if (angelegt.evaluationen.length > 0) {
    const { data: rest } = await admin
      .from('pflege_massnahmen_evaluationen')
      .select('id').in('id', angelegt.evaluationen)
    geloescht.push(`evaluationen_rest: ${(rest ?? []).length} (Kaskade)`)
  }
  aufgeraeumt = geloescht.join(' | ') || '(nichts angelegt)'
}

console.log('\n── Aufraeumen ──────────────────────────────────────────────────────')
console.log(`  ${aufgeraeumt}`)
console.log('  (Eintraege in pflege_audit_log bleiben absichtlich stehen — sie sind')
console.log('   unveraenderlich und belegen, dass diese Pruefung stattgefunden hat.)')

const offen = ergebnisse.filter(e => !e.bestanden).length
console.log('\n═══════════════════════════════════════════════════════════════════')
console.log(` ${ergebnisse.length - offen} von ${ergebnisse.length} Pruefungen bestanden.`)
console.log('═══════════════════════════════════════════════════════════════════')
process.exit(offen > 0 ? 1 : 0)
