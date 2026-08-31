#!/usr/bin/env node
/**
 * ZEITERFASSUNGS-KETTE gegen die PRODUKTIONSDATENBANK.
 *
 *   Erfassung → Herleitung der Ist-Minuten → ArbZG-Pruefung
 *   (Pflichtpause, Tageshoechstarbeitszeit, Ruhezeit) → Sperre → Konto
 *
 * ── WARUM GERADE HIER ─────────────────────────────────────────────────────
 *
 * Zwei bekannte Befunde liegen genau in diesem Modul:
 *
 *   • „auth.uid() ist unter dem Dienstschluessel NULL" — ein Trigger, der
 *     den Handelnden aus auth.uid() zieht, protokolliert leer; steht die
 *     Zielspalte auf NOT NULL, bricht der ganze Schreibweg. Das war schon
 *     einmal ein P1 in der Zeiterfassung.
 *   • „Arbeitszeit-Sperre Trigger-Luecke" — der DB-Trigger blockt nur
 *     gesperrt→gesperrt; `gesperrt: false` im selben UPDATE umging ihn,
 *     der TypeScript-Guard ist die eigentliche Schranke.
 *
 * Beides ist gegen einen nachgebildeten Client nicht pruefbar. Hier wird
 * es gemessen.
 *
 * ── WAS GESCHRIEBEN WIRD ──────────────────────────────────────────────────
 *
 * Zeiten fuer EINE eigens angelegte Betreuungskraft, weit in der
 * Vergangenheit (2019), damit sie mit keiner echten Auswertung kollidieren.
 * Alles wird am Ende entfernt, mit Gegenprobe.
 *
 * Aufruf:  npm run verify:zeiterfassung
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
import {
  createArbeitszeit, updateArbeitszeit, listArbeitszeiten,
} from '../lib/personal/arbeitszeiten.ts'
import {
  pflichtpauseMinuten, nettoMinuten, MAX_TAGESARBEITSZEIT_MINUTEN, MIN_RUHEZEIT_MINUTEN,
} from '../lib/personal/arbzg.ts'

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

/**
 * Die ArbZG-Verstoesse stehen NICHT auf der Arbeitszeitzeile, sondern in
 * `arbeitszeit_verstoesse` — dort schreibt sie der Trigger
 * `arbzg_pruefung_ist()`. Beim ersten Lauf sah diese Pruefung auf
 * nicht existierende Spalten der Zeitzeile und meldete jeden Riegel als
 * tot; erst der Blick in die richtige Tabelle beantwortet die Frage.
 */
async function verstoesseZu(admin, caregiverId, datum) {
  const { data, error } = await admin
    .from('arbeitszeit_verstoesse')
    .select('verstoss_art, datum, gemessener_wert_minuten, grenzwert_minuten, basis')
    .eq('caregiver_id', caregiverId)
    .eq('datum', datum)
  if (error) return { fehler: error.message, liste: [] }
  return { fehler: null, liste: data ?? [] }
}

const ergebnisse = []
function pruefe(id, titel, bestanden, gemessen) {
  ergebnisse.push({ id, bestanden })
  console.log(`\n[${id}] ${bestanden ? 'OK     ' : 'OFFEN  '} ${titel}`)
  console.log(`  ${String(gemessen).split('\n').join('\n  ')}`)
}

console.log('═══════════════════════════════════════════════════════════════════')
console.log(' ZEITERFASSUNGS-KETTE — live gegen Produktion')
console.log(` ${new Date().toISOString()}`)
console.log('═══════════════════════════════════════════════════════════════════')

let caregiverId = null
const zeiten = []
let aufgeraeumt = 'nicht ausgefuehrt'

try {
  const { data: konto } = await admin.from('profiles')
    .select('id').eq('role', 'admin').limit(1).maybeSingle()
  const urheber = konto?.id
  if (!urheber) throw new Error('Kein Admin-Konto als Urheber gefunden.')

  // ── Eine Pruef-Betreuungskraft ──────────────────────────────────────────
  const kennung = `PRUEF-ZEIT-${Date.now().toString(36).toUpperCase()}`
  const { data: cg, error: cgFehler } = await admin
    .from('caregivers')
    .insert({ first_name: 'Pruefung', last_name: kennung, initials: 'PZ', organization_id: ORG })
    .select('id').single()
  if (cgFehler) throw new Error(`Pruef-Betreuungskraft nicht anlegbar: ${cgFehler.message}`)
  caregiverId = cg.id
  console.log(`\nPruef-Betreuungskraft: ${kennung} (${caregiverId})`)

  // ── Z1) Die Rechenregeln, bevor irgendetwas geschrieben wird ────────────
  //
  // Reine Funktionen — aber sie sind der Massstab, an dem alles Folgende
  // gemessen wird. Stimmen sie nicht, sagt der Rest nichts aus.
  pruefe('Z1', 'Pflichtpausen nach § 4 ArbZG',
    pflichtpauseMinuten(360) === 0 && pflichtpauseMinuten(361) === 30
      && pflichtpauseMinuten(540) === 30 && pflichtpauseMinuten(541) === 45,
    `6h⇒${pflichtpauseMinuten(360)} | 6h01⇒${pflichtpauseMinuten(361)} | `
    + `9h⇒${pflichtpauseMinuten(540)} | 9h01⇒${pflichtpauseMinuten(541)} Minuten`)

  // ── Z2) Erfassung: werden die Ist-Minuten hergeleitet? ──────────────────
  const z1 = await createArbeitszeit(admin, {
    organizationId: ORG, caregiverId,
    datum: '2019-03-04', startZeit: '08:00', endZeit: '14:00',
    pauseMinuten: 0, benutzerId: urheber,
  })
  zeiten.push(z1.id)
  pruefe('Z2', 'Ist-Minuten werden serverseitig aus Beginn, Ende und Pause hergeleitet',
    z1.ist_minuten === 360,
    `08:00–14:00 ohne Pause ⇒ ist_minuten=${z1.ist_minuten} (erwartet 360)`)

  // ── Z3) Ein abweichender Ist-Wert wird ABGEWIESEN, nicht uebernommen ────
  //
  // Der Unterschied entscheidet, ob die Zeiterfassung ein Nachweis ist
  // oder ein Wunschzettel.
  let gelogen = ''
  try {
    const z = await createArbeitszeit(admin, {
      organizationId: ORG, caregiverId,
      datum: '2019-03-05', startZeit: '08:00', endZeit: '10:00',
      pauseMinuten: 0, istMinuten: 480, benutzerId: urheber,
    })
    zeiten.push(z.id)
    gelogen = `DURCHGELASSEN — 2 Stunden wurden als ${z.ist_minuten} Minuten gebucht`
  } catch (err) {
    gelogen = `abgewiesen: ${err instanceof Error ? err.message : String(err)}`
  }
  pruefe('Z3', 'Ein mitgegebener, unstimmiger Ist-Wert wird abgewiesen',
    gelogen.startsWith('abgewiesen'), gelogen)

  // ── Z4) Pflichtpause: wird der Verstoss erkannt? ────────────────────────
  const z2 = await createArbeitszeit(admin, {
    organizationId: ORG, caregiverId,
    datum: '2019-03-06', startZeit: '08:00', endZeit: '18:00',
    pauseMinuten: 0, benutzerId: urheber,
  })
  zeiten.push(z2.id)
  const netto = nettoMinuten('08:00', '18:00', 0)
  const v4 = await verstoesseZu(admin, caregiverId, '2019-03-06')
  pruefe('Z4', 'Zehn Stunden ohne Pause werden als Verstoss erfasst',
    v4.liste.length > 0,
    `netto=${netto} | pflichtpause=${pflichtpauseMinuten(netto ?? 0)} | `
    + `Verstoesse=${v4.liste.length} ${v4.liste.map(v => `${v.verstoss_art}(${v.gemessener_wert_minuten}/${v.grenzwert_minuten})`).join(', ')}`
    + (v4.fehler ? ` | FEHLER ${v4.fehler}` : ''))

  // ── Z5) Tageshoechstarbeitszeit ─────────────────────────────────────────
  let ueberlang = ''
  let ueberlangOk = false
  try {
    const z = await createArbeitszeit(admin, {
      organizationId: ORG, caregiverId,
      datum: '2019-03-07', startZeit: '06:00', endZeit: '20:00',
      pauseMinuten: 45, benutzerId: urheber,
    })
    zeiten.push(z.id)
    const v5 = await verstoesseZu(admin, caregiverId, '2019-03-07')
    ueberlangOk = v5.liste.length > 0
    ueberlang = `angelegt (netto ${nettoMinuten('06:00', '20:00', 45)} > ${MAX_TAGESARBEITSZEIT_MINUTEN}) `
      + (v5.fehler ? `| FEHLER ${v5.fehler} ` : '')
      + `| Verstoesse=${v5.liste.length} ${v5.liste.map(v => `${v.verstoss_art}(${v.gemessener_wert_minuten}/${v.grenzwert_minuten})`).join(', ')}`
  } catch (err) {
    ueberlangOk = true
    ueberlang = `abgewiesen: ${err instanceof Error ? err.message : String(err)}`
  }
  pruefe('Z5', 'Mehr als zehn Stunden am Tag bleiben nicht unbemerkt',
    ueberlangOk, ueberlang)

  // ── Z6) Ruhezeit zwischen zwei Tagen ────────────────────────────────────
  const z3 = await createArbeitszeit(admin, {
    organizationId: ORG, caregiverId,
    datum: '2019-03-11', startZeit: '14:00', endZeit: '22:00',
    pauseMinuten: 30, benutzerId: urheber,
  })
  zeiten.push(z3.id)
  const z4 = await createArbeitszeit(admin, {
    organizationId: ORG, caregiverId,
    datum: '2019-03-12', startZeit: '05:00', endZeit: '12:00',
    pauseMinuten: 30, benutzerId: urheber,
  })
  zeiten.push(z4.id)
  const v6 = await verstoesseZu(admin, caregiverId, '2019-03-12')
  pruefe('Z6', 'Zu kurze Ruhezeit zwischen zwei Schichten wird erfasst',
    v6.liste.length > 0,
    `22:00 → 05:00 sind 420 Minuten, verlangt sind ${MIN_RUHEZEIT_MINUTEN} | `
    + `Verstoesse=${v6.liste.length} ${v6.liste.map(v => `${v.verstoss_art}(${v.gemessener_wert_minuten}/${v.grenzwert_minuten})`).join(', ')}`
    + (v6.fehler ? ` | FEHLER ${v6.fehler}` : ''))

  // ── Z7) Die Sperre — und die bekannte Trigger-Luecke ────────────────────
  //
  // Bekannter Befund: der DB-Trigger blockt nur gesperrt→gesperrt. Wer im
  // SELBEN UPDATE `gesperrt: false` mitschickt, umging ihn; die eigentliche
  // Schranke ist der TypeScript-Guard. Genau dieser Weg wird hier
  // versucht — er MUSS scheitern.
  const gesperrt = await updateArbeitszeit(admin, z1.id, ORG, {
    gesperrt: true, benutzerId: urheber,
  })
  pruefe('Z7', 'Eine Zeit laesst sich sperren',
    gesperrt.gesperrt === true, `gesperrt=${gesperrt.gesperrt}`)

  let umgehung = ''
  try {
    await updateArbeitszeit(admin, z1.id, ORG, {
      gesperrt: false, endZeit: '20:00',   // Entsperren UND aendern in einem Zug
      benutzerId: urheber,
    })
    umgehung = 'DURCHGELASSEN — Entsperren und Aendern in einem UPDATE hat gewirkt'
  } catch (err) {
    umgehung = `abgewiesen: ${err instanceof Error ? err.message : String(err)}`
  }
  pruefe('Z8', 'Entsperren und Aendern im selben Zug wird abgewiesen',
    umgehung.startsWith('abgewiesen'), umgehung)

  // ── Z9) Mandantenbindung ────────────────────────────────────────────────
  const { data: fremdOrg } = await admin.from('organizations')
    .select('id').neq('id', ORG).limit(1).maybeSingle()
  let fremd = 'kein zweiter Mandant vorhanden — nicht pruefbar'
  let fremdOk = false
  if (fremdOrg?.id) {
    try {
      const z = await createArbeitszeit(admin, {
        organizationId: fremdOrg.id, caregiverId,   // Kraft gehoert zur STAMM-Org
        datum: '2019-03-20', startZeit: '08:00', endZeit: '12:00',
        pauseMinuten: 0, benutzerId: urheber,
      })
      zeiten.push(z.id)
      fremd = 'DURCHGELASSEN — eine Zeit haengt an einer fremdmandantigen Kraft'
    } catch (err) {
      fremdOk = true
      fremd = `abgewiesen: ${err instanceof Error ? err.message : String(err)}`
    }
  }
  pruefe('Z9', 'Eine Zeit kann nicht an einer fremdmandantigen Kraft haengen', fremdOk, fremd)

  // ── Z10) Lesen: findet die Abfrage die Zeiten wieder? ───────────────────
  const liste = await listArbeitszeiten(admin, { organizationId: ORG, caregiverId })
  pruefe('Z10', 'Die erfassten Zeiten sind wieder auffindbar',
    liste.length >= 4,
    `${liste.length} Zeiten zur Pruefkraft gefunden`)

} catch (err) {
  console.error(`\n✗ ABBRUCH: ${err instanceof Error ? err.message : String(err)}`)
  ergebnisse.push({ id: 'ABBRUCH', bestanden: false })
} finally {
  const geloescht = []
  if (caregiverId) {
    await admin.from('arbeitszeit_verstoesse').delete().eq('caregiver_id', caregiverId)
  }
  if (zeiten.length > 0) {
    // Gesperrte Zeiten zuerst entsperren, sonst haelt der Riegel auch beim
    // Aufraeumen — und das soll er.
    await admin.from('personal_arbeitszeiten').update({ gesperrt: false }).in('id', zeiten)
    const { data, error } = await admin.from('personal_arbeitszeiten')
      .delete().in('id', zeiten).select('id')
    geloescht.push(error ? `zeiten: FEHLER ${error.message}` : `zeiten: ${(data ?? []).length}`)
  }
  if (caregiverId) {
    const { data, error } = await admin.from('caregivers')
      .delete().eq('id', caregiverId).select('id')
    geloescht.push(error ? `caregivers: FEHLER ${error.message}` : `caregivers: ${(data ?? []).length}`)
  }
  // Die Verstosszeilen des Triggers gehoeren mit weg — sie haengen an der
  // Pruefkraft und wuerden sonst in jeder Auswertung mitzaehlen.
  if (caregiverId) {
    const { data, error } = await admin.from('arbeitszeit_verstoesse')
      .delete().eq('caregiver_id', caregiverId).select('id')
    geloescht.push(error ? `verstoesse: FEHLER ${error.message}` : `verstoesse: ${(data ?? []).length}`)
  }

  // Gegenprobe — „aufgeraeumt" soll keine Behauptung sein.
  if (zeiten.length > 0) {
    const { data: rest } = await admin.from('personal_arbeitszeiten').select('id').in('id', zeiten)
    geloescht.push(`rest_zeiten: ${(rest ?? []).length}`)
  }
  if (caregiverId) {
    const { data: restV } = await admin.from('arbeitszeit_verstoesse')
      .select('id').eq('caregiver_id', caregiverId)
    geloescht.push(`rest_verstoesse: ${(restV ?? []).length}`)
  }
  aufgeraeumt = geloescht.join(' | ') || '(nichts angelegt)'
}

console.log('\n── Aufraeumen ──────────────────────────────────────────────────────')
console.log(`  ${aufgeraeumt}`)

const offen = ergebnisse.filter(e => !e.bestanden).length
console.log('\n═══════════════════════════════════════════════════════════════════')
console.log(` ${ergebnisse.length - offen} von ${ergebnisse.length} Pruefungen bestanden.`)
console.log('═══════════════════════════════════════════════════════════════════')
process.exit(offen > 0 ? 1 : 0)
