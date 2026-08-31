#!/usr/bin/env node
/**
 * KONTOÜBERWACHUNG — ist sie befristet, begründet und protokolliert?
 *
 * ── DIE FRAGE ─────────────────────────────────────────────────────────────
 * Ein Eintrag in `security_watchlist` zeichnet jede Anmeldung, jedes Gerät
 * und jede IP einer namentlich bekannten Person auf. Das ist keine
 * Systemeinstellung, sondern eine Maßnahme gegen einen Menschen. § 26 BDSG
 * und Art. 5 Abs. 1 lit. e DSGVO verlangen dafür dreierlei: einen Anlass,
 * eine zeitliche Begrenzung und Offenheit. Dieses Skript misst nach, ob das
 * live zutrifft — nicht, ob es im Code steht.
 *
 * Die Migration 20261024000000 nennt diesen Lauf als ihren Nachweis
 * („npm run verify:ueberwachung → U3 und U4 muessen auf OK springen").
 * Bis zum 01.09.2026 gab es ihn nicht: die Migration verwies auf einen
 * Befehl, den niemand ausführen konnte.
 *
 * ── REIN LESEND ───────────────────────────────────────────────────────────
 * Das Skript schaltet nichts ein, nichts ab und ändert keinen Eintrag.
 * U7 misst das nach — sonst wäre es eine Behauptung.
 *
 * Aufruf:  npm run verify:ueberwachung
 * Exit 0 = alle Prüfungen bestanden, Exit 1 = mindestens eine offen,
 * Exit 2 = es wurde NICHTS geprüft (dann ist der Lauf kein Nachweis).
 */

import { apiHeaders, envWert, secretKey } from './lib/supabase-keys.mjs'
import { befristungFuer, pruefeAngaben, HOECHSTDAUER_TAGE } from '../lib/security/befristung.ts'

const URL_BASIS = envWert('NEXT_PUBLIC_SUPABASE_URL')
const SERVICE = secretKey()
if (!URL_BASIS || !SERVICE) {
  console.error('Fehlt: NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY.')
  console.error('Es wurde NICHTS geprueft — dieser Lauf ist kein Nachweis.')
  process.exit(2)
}

const JETZT = new Date()

async function hole(pfad) {
  const res = await fetch(`${URL_BASIS}/rest/v1/${pfad}`, {
    headers: apiHeaders(SERVICE, { Prefer: 'count=exact' }),
  })
  const text = await res.text()
  let daten = null
  try { daten = JSON.parse(text) } catch { /* Fehlertexte sind nicht immer JSON */ }
  return { status: res.status, daten, text, bereich: res.headers.get('content-range') }
}

/** Existiert die Spalte? 42703 heisst „nein", nicht „Fehler". */
async function spalteDa(tabelle, spalte) {
  const r = await hole(`${tabelle}?select=${spalte}&limit=1`)
  if (r.status < 400) return true
  if (r.daten?.code === '42703') return false
  throw new Error(`${tabelle}.${spalte}: HTTP ${r.status} ${r.text.slice(0, 200)}`)
}

const ergebnisse = []
function pruefe(id, titel, bestanden, text) {
  ergebnisse.push({ id, bestanden })
  console.log(`\n[${id}] ${bestanden ? 'OK     ' : 'OFFEN  '} ${titel}`)
  for (const z of String(text).split('\n')) console.log(`  ${z}`)
}

/** Konto-Kennung gekürzt — für einen Prüflauf reicht die Wiedererkennung. */
const kurz = (id) => (typeof id === 'string' ? `${id.slice(0, 8)}…` : '—')

console.log('═══════════════════════════════════════════════════════════════════')
console.log(' KONTOUEBERWACHUNG — befristet, begruendet, protokolliert?')
console.log(` ${JETZT.toISOString()}`)
console.log('═══════════════════════════════════════════════════════════════════')

// ── Welche Spalten hat die Tabelle live? ──────────────────────────────
const hatFrist = await spalteDa('security_watchlist', 'befristet_bis')
const hatZweck = await spalteDa('security_watchlist', 'zweck')
const hatSchalter = await spalteDa('security_watchlist', 'alle_ereignisse')

const spalten = ['id', 'user_id', 'organization_id', 'aktiv', 'grund', 'angelegt_von', 'created_at']
if (hatSchalter) spalten.push('alle_ereignisse', 'ohne_sperrfrist', 'melde_email', 'email_kontrolle')
if (hatFrist) spalten.push('befristet_bis')
if (hatZweck) spalten.push('zweck', 'rechtsgrundlage', 'person_informiert_am')

const liste = await hole(`security_watchlist?select=${spalten.join(',')}&order=created_at.desc`)
if (liste.status >= 400) {
  console.error(`\nDie Ueberwachungsliste ist nicht lesbar: HTTP ${liste.status} ${liste.text.slice(0, 300)}`)
  console.error('Es wurde NICHTS geprueft — dieser Lauf ist kein Nachweis.')
  process.exit(2)
}

const eintraege = liste.daten ?? []
const aktive = eintraege.filter(e => e.aktiv === true)
const mitFrist = aktive.map(e => ({
  e,
  b: befristungFuer(e.created_at, JETZT, hatFrist ? e.befristet_bis : null),
}))
const wirkend = mitFrist.filter(x => !x.b.abgelaufen)

console.log(`\nBestand: ${eintraege.length} Eintraege, davon ${aktive.length} auf „aktiv",`)
console.log(`davon ${wirkend.length} tatsaechlich wirksam (Frist nicht abgelaufen).`)

// ── U1) Steht die Liste, und sagt „aktiv" dasselbe wie „wirkt"? ───────
const scheinAktiv = mitFrist.filter(x => x.b.abgelaufen)
pruefe('U1', 'Kein Eintrag steht auf „aktiv", ohne noch zu wirken',
  scheinAktiv.length === 0,
  scheinAktiv.length === 0
    ? `Alle ${aktive.length} aktiven Eintraege sind innerhalb ihrer Frist.\n`
      + 'Ein Eintrag, der „aktiv" sagt und nichts mehr meldet, ist eine\n'
      + 'Falschauskunft — die Anwendung zaehlt ihn nicht mehr mit, die\n'
      + 'Liste zeigte ihn aber als laufende Massnahme.'
    : scheinAktiv.map(x => `${kurz(x.e.user_id)}  ${x.b.hinweis}`).join('\n')
      + '\n\nDiese Eintraege melden nichts mehr. Bitte abschalten oder mit\n'
      + 'neuer Begruendung erneut anordnen — die Oberflaeche bietet beides\n'
      + 'unter /admin/security/audit-log → „Ueberwachte Konten".')

// ── U2) Traegt jede laufende Massnahme die vier Pflichtangaben? ───────
const ohneAngaben = wirkend
  .map(x => ({ x, a: pruefeAngaben(String(x.e.grund ?? '')) }))
  .filter(z => !z.a.ok)

pruefe('U2', 'Jede laufende Ueberwachung nennt Zweck, Rechtsgrundlage, Zeitraum und Transparenz',
  ohneAngaben.length === 0,
  ohneAngaben.length === 0
    ? `${wirkend.length} laufende Massnahme(n), alle vollstaendig begruendet.\n`
      + 'Code kann den INHALT einer Begruendung nicht pruefen — nur, dass die\n'
      + 'vier Punkte auffindbar dastehen. Der Rest verantwortet die Person in\n'
      + '`angelegt_von`.'
    : ohneAngaben.map(z => `${kurz(z.x.e.user_id)}  es fehlen: ${z.a.fehlend.join(', ')}`).join('\n')
      + '\n\nDiese Eintraege stammen aus der Zeit vor der Pflicht (31.08.2026).\n'
      + 'Der Riegel greift beim naechsten Einschalten; der BESTAND laeuft\n'
      + 'weiter, ohne dass sich auf eine Rechtsgrundlage berufen liesse.\n'
      + 'Abhilfe: einmal abschalten und mit vollstaendiger Begruendung neu\n'
      + 'anordnen — das startet auch die Frist neu.')

// ── U3) Die Fristspalte aus 20261024000000 ────────────────────────────
pruefe('U3', 'security_watchlist fuehrt ein ausdrueckliches Fristende (befristet_bis)',
  hatFrist,
  hatFrist
    ? 'Die Spalte ist vorhanden. Damit laesst sich eine Massnahme KUERZER\n'
      + `anordnen als die Hoechstdauer von ${HOECHSTDAUER_TAGE} Tagen; die\n`
      + 'Hoechstdauer bleibt die Obergrenze.'
    : 'Die Spalte fehlt — Migration 20261024000000 ist nicht angewendet.\n'
      + `Die Frist gilt trotzdem: der Anwendungscode leitet sie aus\n`
      + `created_at + ${HOECHSTDAUER_TAGE} Tage ab und nimmt abgelaufene\n`
      + 'Eintraege nicht in die aktive Menge auf (lib/security/watchlist.ts).\n'
      + 'Was fehlt, ist die Moeglichkeit, KUERZER anzuordnen, und der\n'
      + 'DB-Riegel dagegen, dass ein aktiver Eintrag ohne Ende entsteht.\n'
      + 'Anwenden: supabase/migrations/20261024000000_watchlist_befristung.sql\n'
      + 'im Supabase-SQL-Editor als `postgres` (DDL ist ueber den\n'
      + 'Dienstschluessel gesperrt, 42501).')

// ── U4) Zweck und Rechtsgrundlage als eigene Felder ───────────────────
pruefe('U4', 'Zweck, Rechtsgrundlage und Transparenz haben eigene Spalten',
  hatZweck,
  hatZweck
    ? 'Vorhanden. Die vier Angaben stehen damit auswertbar da und nicht\n'
      + 'nur als Textmarken im Begruendungsfeld.'
    : 'Die Spalten fehlen (dieselbe Migration wie U3). Bis dahin muessen\n'
      + 'die vier Angaben im Begruendungstext stehen — U2 prueft genau das,\n'
      + 'und der Schreibweg weist eine Begruendung ohne sie ab.')

// ── U5) Der Schreibweg ist auf beide Schemastaende vorbereitet ────────
// Gemessen am Code, nicht an der Datenbank: schickt setzeUeberwachung
// `befristet_bis` mit? Ohne das bricht nach dem Anwenden der Migration
// JEDES Einschalten mit 23514 — und der faellt in keinen Rueckfall, weil
// er kein 42703 ist.
const quelle = await import('node:fs').then(fs =>
  fs.readFileSync(new URL('../lib/security/watchlist.ts', import.meta.url), 'utf8'))
const schicktFrist = /zeile\.befristet_bis\s*=/.test(quelle)
const kenntCreatedAt = /zeile\.created_at\s*=/.test(quelle)

pruefe('U5', 'Der Schreibweg ueberlebt das Anwenden der Migration',
  schicktFrist && kenntCreatedAt,
  `befristet_bis wird mitgeschrieben: ${schicktFrist ? 'ja' : 'NEIN'}\n`
  + `created_at wandert bei neuer Anordnung mit: ${kenntCreatedAt ? 'ja' : 'NEIN'}\n\n`
  + 'Der CHECK security_watchlist_aktiv_braucht_frist laesst einen aktiven\n'
  + 'Eintrag ohne Fristende nicht entstehen. Ein Schreibweg ohne die Spalte\n'
  + 'verloere ab dem Anwenden jedes Einschalten — belegt auf echtem Postgres\n'
  + 'in __tests__/security/watchlist-befristung-pglite.test.ts.')

// ── U6) Jede Aenderung hinterlaesst eine Spur ─────────────────────────
const spur = await hole(
  'security_audit_log?select=id,created_at,severity,metadata&event_type=eq.watchlist_change'
  + '&order=created_at.desc&limit=5')
const spurZeilen = spur.daten ?? []
const alleKritisch = spurZeilen.length > 0 && spurZeilen.every(z => z.severity === 'critical')

pruefe('U6', 'Aenderungen an der Ueberwachungsliste sind protokolliert',
  spurZeilen.length > 0 && alleKritisch,
  spurZeilen.length === 0
    ? 'Kein einziges watchlist_change in der Sicherheitsspur.\n'
      + 'Entweder wurde die Liste nie ueber die Oberflaeche oder das Skript\n'
      + 'geaendert (dann ist der Bestand direkt in der Datenbank entstanden),\n'
      + 'oder das Ereignis wird nicht geschrieben. Beides gehoert geklaert:\n'
      + 'der erste Schritt eines Missbrauchs waere, die Ueberwachung still\n'
      + 'stillzulegen.'
    : spurZeilen.map(z => {
        const m = z.metadata ?? {}
        const nach = m.nachher ?? {}
        return `${String(z.created_at).slice(0, 16)}  aktiv=${nach.aktiv}`
          + `  Frist=${m.befristet_bis ? String(m.befristet_bis).slice(0, 10) : '—'}`
          + `  neu gestartet=${m.frist_neu_gestartet ?? '—'}`
      }).join('\n')
      + `\n\n${spurZeilen.length} Eintrag(e), Schweregrad durchgehend `
      + `${alleKritisch ? 'critical' : 'NICHT durchgehend critical'}.`)

// ── U7) Hat dieser Lauf etwas veraendert? ─────────────────────────────
const nachher = await hole('security_watchlist?select=id,aktiv,grund,created_at&order=created_at.desc')
const gleich = JSON.stringify(
  (nachher.daten ?? []).map(e => [e.id, e.aktiv, e.grund, e.created_at]))
  === JSON.stringify(eintraege.map(e => [e.id, e.aktiv, e.grund, e.created_at]))

pruefe('U7', 'Der Lauf hat die Ueberwachungsliste nicht veraendert',
  gleich,
  `vorher: ${eintraege.length} Eintraege | nachher: ${(nachher.daten ?? []).length}\n`
  + 'Dieses Skript ist rein lesend. Ohne diese Gegenprobe waere das eine\n'
  + 'Behauptung — und Behauptungen sind in diesem Projekt schon falsch gewesen.')

// ── BERICHT ───────────────────────────────────────────────────────────
console.log('\n── BERICHT: Fristen der Eintraege ────────────────────────────────')
if (eintraege.length === 0) {
  console.log('  Kein Konto ausdruecklich ueberwacht.')
} else {
  for (const e of eintraege) {
    const b = befristungFuer(e.created_at, JETZT, hatFrist ? e.befristet_bis : null)
    console.log(`  ${kurz(e.user_id)}  aktiv=${e.aktiv}  ${b.hinweis}`)
    console.log(`      angelegt ${String(e.created_at).slice(0, 10)}`
      + `  Fristquelle: ${b.quelle}`)
  }
  console.log('  Namen und Adressen stehen hier bewusst nicht: ein Pruefprotokoll')
  console.log('  ueber eine Ueberwachung soll nicht selbst eines werden.')
}

const offen = ergebnisse.filter(e => !e.bestanden)
console.log('\n═══════════════════════════════════════════════════════════════════')
console.log(` ${ergebnisse.length - offen.length} von ${ergebnisse.length} Pruefungen bestanden.`)
if (offen.length > 0) console.log(` OFFEN: ${offen.map(e => e.id).join(', ')}`)
console.log('═══════════════════════════════════════════════════════════════════')
process.exit(offen.length > 0 ? 1 : 0)
