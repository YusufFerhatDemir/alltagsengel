#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════
 * Aufbewahrung — Trockenlauf-BERICHT (liest nur, loescht nie)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * WARUM ES DAS ZUSAETZLICH ZUM CRON-TROCKENLAUF GIBT
 *
 * `GET /api/cron/aufbewahrung` laeuft ohne `AUFBEWAHRUNG_AKTIV=1` bereits
 * als Trockenlauf — aber er ZAEHLT nur. Fuer die Entscheidung „duerfen
 * wir scharf schalten?" ist eine Zahl zu wenig. Wer `geloescht: 8315`
 * liest, weiss nicht, WELCHE Zeilen das sind, wie alt der Bestand
 * ueberhaupt ist und ob die Schutzbedingung tatsaechlich etwas
 * zurueckhaelt.
 *
 * Dieser Bericht beantwortet je Regel fuenf Fragen:
 *
 *   1. Wie viele Zeilen hat die Tabelle insgesamt?
 *   2. Wie alt ist der aelteste Datensatz?
 *   3. Wie viele Zeilen wuerde der scharfe Lauf loeschen?
 *   4. WELCHE — mit Kennung und Zeitstempel, als Stichprobe.
 *   5. Wie viele Zeilen sind ALT GENUG, bleiben aber wegen der
 *      Schutzbedingung stehen?
 *
 * Frage 5 ist die wichtigste. Sie ist der einzige Nachweis, dass der
 * Schutz nicht bloss im Quelltext steht, sondern live greift. Steht dort
 * 0, obwohl es geschuetzte Zeilen geben muesste, ist der Filter
 * wirkungslos — genau der Fehler, den `eq` gegen NULL erzeugt haette.
 *
 * ── DIESES WERKZEUG AENDERT NICHTS ────────────────────────────────────
 *
 * Es kennt kein DELETE und kein UPDATE. Es stellt ausschliesslich
 * GET-Anfragen an PostgREST. `AUFBEWAHRUNG_AKTIV` wird NICHT gelesen und
 * NICHT gesetzt — der Bericht ist unabhaengig davon derselbe.
 *
 * ── EINE QUELLE FUER DIE REGELN ───────────────────────────────────────
 *
 * Der Katalog wird aus `lib/aufbewahrung/katalog.ts` IMPORTIERT, nicht
 * abgeschrieben. Eine Kopie waere die naechste Liste, die auseinander-
 * laeuft; der Bericht wuerde dann Fristen ausweisen, nach denen der Lauf
 * gar nicht arbeitet.
 *
 * Aufruf:  npm run aufbewahrung:bericht
 *          npm run aufbewahrung:bericht -- --json
 *
 * Exit 0 = Bericht erstellt. Exit 2 = keine Schluessel, es wurde NICHTS
 * geprueft (ein solcher Lauf ist kein Nachweis).
 */

import { apiHeaders, envWert, secretKey } from './lib/supabase-keys.mjs'
import { katalogMitFristen, NICHT_AUTOMATISCH } from '../lib/aufbewahrung/katalog.ts'

const URL_BASIS = envWert('NEXT_PUBLIC_SUPABASE_URL')
const SERVICE = secretKey()
if (!URL_BASIS || !SERVICE) {
  console.error('Fehlt: NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY.')
  console.error('Es wurde NICHTS geprueft — dieser Lauf ist kein Nachweis.')
  process.exit(2)
}

const alsJson = process.argv.includes('--json')
const JETZT = new Date()

/** Stichtag wie in lib/aufbewahrung/lauf.ts — dieselbe Rechnung. */
const stichtag = (tage) => new Date(JETZT.getTime() - tage * 864e5).toISOString()

/**
 * Ein GET gegen PostgREST. Gibt Zeilen und die Gesamtzahl aus
 * `content-range` zurueck.
 *
 * `count=exact` ist Absicht: eine Schaetzung waere fuer eine
 * Loeschentscheidung wertlos.
 */
async function frage(tabelle, parameter, { nurZaehlen = false } = {}) {
  const url = `${URL_BASIS}/rest/v1/${tabelle}?${parameter}`
  const r = await fetch(url, {
    method: nurZaehlen ? 'HEAD' : 'GET',
    headers: apiHeaders(SERVICE, { Prefer: 'count=exact' }),
  })
  const bereich = r.headers.get('content-range') || ''
  const anzahl = bereich.includes('/') ? Number(bereich.split('/')[1]) : null
  if (!r.ok) {
    const text = nurZaehlen ? '' : await r.text()
    return { fehler: `HTTP ${r.status} ${text.slice(0, 200)}` }
  }
  if (nurZaehlen) return { anzahl }
  return { anzahl, zeilen: await r.json() }
}

/**
 * Uebersetzt die Schutzbedingung der Regel in einen PostgREST-Filter.
 *
 * Spiegelt `mitSchutz()` aus lib/aufbewahrung/lauf.ts — einschliesslich
 * der Sonderform `IST_NULL`. Wuerde hier `eq.null` stehen, zaehlte der
 * Bericht eine ANDERE Menge als der Lauf loescht, und der Trockenlauf
 * waere als Entscheidungsmaterial wertlos.
 */
function schutzFilter(regel) {
  const s = regel.schutz
  if (!s) return null
  if (s.operator === 'eq' && s.wert === 'IST_NULL') return `${s.spalte}=is.null`
  if (s.operator === 'in') return `${s.spalte}=in.(${s.wert.join(',')})`
  return `${s.spalte}=${s.operator}.${s.wert}`
}

/** Die Umkehrung — Zeilen, die der Schutz ZURUECKHAELT. */
function schutzFilterNegiert(regel) {
  const s = regel.schutz
  if (!s) return null
  if (s.operator === 'eq' && s.wert === 'IST_NULL') return `${s.spalte}=not.is.null`
  if (s.operator === 'in') return `${s.spalte}=not.in.(${s.wert.join(',')})`
  return `${s.spalte}=not.${s.operator}.${s.wert}`
}

const tage = (iso) => Math.floor((JETZT - new Date(iso)) / 864e5)

async function pruefeRegel(regel) {
  const z = regel.zeitSpalte
  const befund = {
    tabelle: regel.tabelle,
    bereich: regel.bereich,
    zeitSpalte: z,
    loeschFristTage: regel.loeschFrist.tage,
    fristQuelle: regel.loeschFrist.quelle,
    envSchluessel: regel.envSchluessel,
    ipSpalte: regel.ipSpalte ?? null,
    ipFristTage: regel.ipFrist?.tage ?? null,
    begruendung: regel.begruendung,
    schutz: regel.schutz?.begruendung ?? null,
    warnung: regel.loeschFrist.warnung ?? regel.ipFrist?.warnung ?? null,
  }

  // 1 — Gesamtbestand
  const gesamt = await frage(regel.tabelle, 'select=id&limit=1', { nurZaehlen: true })
  if (gesamt.fehler) { befund.fehler = gesamt.fehler; return befund }
  befund.gesamt = gesamt.anzahl

  // 2 — aeltester Datensatz
  const alt = await frage(regel.tabelle, `select=id,${z}&order=${z}.asc&limit=1`)
  if (!alt.fehler && alt.zeilen?.length) {
    befund.aeltester = { id: alt.zeilen[0].id, zeitpunkt: alt.zeilen[0][z], alterTage: tage(alt.zeilen[0][z]) }
  } else {
    befund.aeltester = null
  }

  const grenze = stichtag(regel.loeschFrist.tage)
  befund.stichtagLoeschung = grenze
  const schutz = schutzFilter(regel)

  // 3 — wie viele wuerde der scharfe Lauf loeschen
  const loeschen = await frage(
    regel.tabelle,
    `select=id&${z}=lt.${grenze}${schutz ? '&' + schutz : ''}&limit=1`,
    { nurZaehlen: true },
  )
  befund.wuerdeGeloescht = loeschen.fehler ? null : loeschen.anzahl
  if (loeschen.fehler) befund.fehler = loeschen.fehler

  // 4 — WELCHE (Stichprobe)
  if (befund.wuerdeGeloescht > 0) {
    const probe = await frage(
      regel.tabelle,
      `select=id,${z}&${z}=lt.${grenze}${schutz ? '&' + schutz : ''}&order=${z}.asc&limit=5`,
    )
    befund.beispiele = (probe.zeilen ?? []).map(r => ({
      id: r.id, zeitpunkt: r[z], alterTage: tage(r[z]),
    }))
  } else {
    befund.beispiele = []
  }

  // 5 — alt genug, aber durch die Schutzbedingung gehalten
  if (regel.schutz) {
    const gehalten = await frage(
      regel.tabelle,
      `select=id&${z}=lt.${grenze}&${schutzFilterNegiert(regel)}&limit=1`,
      { nurZaehlen: true },
    )
    befund.durchSchutzGehalten = gehalten.fehler ? null : gehalten.anzahl
  } else {
    befund.durchSchutzGehalten = null
  }

  // IP-Stufe
  if (regel.ipSpalte && regel.ipFrist) {
    const ipGrenze = stichtag(regel.ipFrist.tage)
    befund.stichtagIp = ipGrenze
    const ip = await frage(
      regel.tabelle,
      `select=id&${z}=lt.${ipGrenze}&${regel.ipSpalte}=not.is.null&limit=1`,
      { nurZaehlen: true },
    )
    befund.wuerdeIpGekuerzt = ip.fehler ? null : ip.anzahl
  } else {
    befund.wuerdeIpGekuerzt = null
  }

  return befund
}

const katalog = katalogMitFristen()
const befunde = []
for (const regel of katalog) befunde.push(await pruefeRegel(regel))

if (alsJson) {
  console.log(JSON.stringify({
    erzeugt: JETZT.toISOString(),
    trockenlauf: true,
    hinweis: 'Nur gelesen. Es wurde nichts geloescht und nichts geaendert.',
    regeln: befunde,
    nichtAutomatisch: NICHT_AUTOMATISCH,
  }, null, 2))
  process.exit(0)
}

const n = (v) => (v === null || v === undefined ? '—' : String(v))

console.log('═══════════════════════════════════════════════════════════════════')
console.log(' AUFBEWAHRUNG — TROCKENLAUF-BERICHT')
console.log(` Erzeugt: ${JETZT.toISOString()}`)
console.log(' Es wurde NICHTS geloescht und NICHTS geaendert — nur gelesen.')
console.log('═══════════════════════════════════════════════════════════════════\n')

let summeLoeschen = 0
let summeIp = 0
let summeGehalten = 0

for (const b of befunde) {
  console.log(`── ${b.tabelle}  [${b.bereich}]`)
  if (b.fehler) {
    console.log(`   FEHLER: ${b.fehler}`)
    console.log('')
    continue
  }
  console.log(`   Frist            ${b.loeschFristTage} Tage (${b.fristQuelle}, ${b.envSchluessel})`)
  console.log(`   Zeitspalte       ${b.zeitSpalte}`)
  console.log(`   Bestand gesamt   ${n(b.gesamt)} Zeilen`)
  console.log(`   Aeltester        ${b.aeltester ? `${b.aeltester.zeitpunkt}  (${b.aeltester.alterTage} Tage, id ${b.aeltester.id})` : '— (Tabelle leer)'}`)
  console.log(`   Stichtag         alles vor ${b.stichtagLoeschung}`)
  console.log(`   WUERDE GELOESCHT ${n(b.wuerdeGeloescht)} Zeilen`)
  if (b.beispiele.length) {
    for (const e of b.beispiele) console.log(`                    · ${e.id}  ${e.zeitpunkt}  (${e.alterTage} Tage)`)
    if (b.wuerdeGeloescht > b.beispiele.length) {
      console.log(`                    … und ${b.wuerdeGeloescht - b.beispiele.length} weitere`)
    }
  }
  if (b.schutz) {
    console.log(`   Schutz haelt     ${n(b.durchSchutzGehalten)} Zeilen zurueck, die alt genug waeren`)
    console.log(`                    Grund: ${b.schutz}`)
  }
  if (b.ipSpalte) {
    console.log(`   IP-Kuerzung      ${n(b.wuerdeIpGekuerzt)} Zeilen (Spalte ${b.ipSpalte}, ${b.ipFristTage} Tage, vor ${b.stichtagIp})`)
  }
  if (b.warnung) console.log(`   WARNUNG          ${b.warnung}`)
  console.log(`   Regel            ${b.begruendung}`)
  console.log('')
  summeLoeschen += b.wuerdeGeloescht ?? 0
  summeIp += b.wuerdeIpGekuerzt ?? 0
  summeGehalten += b.durchSchutzGehalten ?? 0
}

console.log('═══════════════════════════════════════════════════════════════════')
console.log(` SUMME:  ${summeLoeschen} Zeilen wuerden geloescht · ${summeIp} IP-Adressen gekuerzt`)
console.log(`         ${summeGehalten} Zeilen sind alt genug, werden aber vom Schutz gehalten`)
console.log('═══════════════════════════════════════════════════════════════════\n')

console.log('AUSDRUECKLICH OHNE AUTOMATISCHE FRIST:')
for (const e of NICHT_AUTOMATISCH) console.log(`  · ${e.tabelle}\n      ${e.begruendung}`)
console.log('')
console.log('Scharf schalten: AUFBEWAHRUNG_AKTIV=1 setzen. Bis dahin zaehlt der')
console.log('Cron-Lauf nur — dieser Bericht ist dasselbe, nur ausfuehrlicher.')
