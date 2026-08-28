#!/usr/bin/env node
/**
 * Versandbereitschaft — was fehlt wirklich, damit Post rausgeht?
 * ═══════════════════════════════════════════════════════════════════════
 *
 * WARUM ES DAS GIBT
 * docs/COMPLETION_MATRIX.md fuehrt das E-Mail-System auf DEPLOYED und
 * begruendet das so: `invoice_email_log` = 0, `notification_delivery_log`
 * = 0, `newsletter_subscribers` = 0 — „es ist ueber den produktiven Weg
 * nie eine Mail rausgegangen". Als Ursache steht dort „extern: Vercel-
 * Variablen fehlen".
 *
 * Das war bis hierher eine ANNAHME. Sie stand in einem Dokument, nicht in
 * einer Messung. Genau die Sorte Satz, die ein Jahr spaeter niemand mehr
 * hinterfragt — und die falsch sein kann, weil daneben noch ein zweiter,
 * echter Fehler liegt.
 *
 * Dieses Skript trennt die beiden Faelle. Es prueft in DREI Schichten und
 * sagt fuer jede, ob sie traegt:
 *
 *   1. ZUGANG      Ist der Resend-Schluessel gueltig, ist die Absender-
 *                  domain verifiziert? (nur lesend, es geht keine Mail raus)
 *   2. SCHALTER    Stehen die beiden Versand-Flags und CRON_SECRET?
 *                  Ausgewertet mit demselben fail-closed-Verstaendnis wie
 *                  lib/config/versand-flags.ts: AN ist ausschliesslich '1'.
 *   3. WIRKUNG     Was steht live in den Zustellspuren?
 *
 * Erst aus dem Zusammenspiel wird eine Aussage: sind 1 gruen und 3 leer,
 * dann UND NUR DANN ist „extern blockiert" die richtige Beschreibung. Ist
 * dagegen 1 rot, liegt der Fehler bei uns und niemand muss auf ein
 * Vercel-Dashboard warten.
 *
 * WICHTIG ZUR LESART DER SCHALTER: dieses Skript laeuft LOKAL und liest
 * die lokale Umgebung. Ein „fehlt" heisst hier nicht automatisch, dass die
 * Variable auch in Vercel fehlt — es heisst, dass sie HIER fehlt. Das ist
 * ausdruecklich so benannt, statt eine Aussage ueber eine Umgebung zu
 * treffen, in die dieses Skript nicht hineinsieht. Die Zustellspuren aus
 * Schicht 3 kommen dagegen aus der Produktionsdatenbank und sind die
 * belastbare Seite des Befunds.
 *
 * Aufruf:  npm run verify:versand
 * Exit 0 = Zugang steht und die Lage ist eindeutig beschrieben.
 * Exit 1 = etwas Internes ist kaputt und gehoert repariert, nicht gemeldet.
 */

import { readFileSync } from 'node:fs'
import { orakel } from './verify-abrechnung-live.mjs'
import { holeResendDomains } from './verify-resend.mjs'

// ── Umgebung ─────────────────────────────────────────────────────────
function envWerte() {
  const werte = { ...process.env }
  for (const datei of ['.env.local', '.env']) {
    try {
      for (const zeile of readFileSync(datei, 'utf8').split('\n')) {
        const t = zeile.trim()
        if (!t || t.startsWith('#')) continue
        const i = t.indexOf('=')
        if (i < 0) continue
        const name = t.slice(0, i).trim()
        if (werte[name] !== undefined && werte[name] !== '') continue
        werte[name] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
      }
    } catch { /* Datei fehlt — kein Fehler */ }
  }
  return werte
}

const ENV = envWerte()

// ── Schicht 1: Zugang ────────────────────────────────────────────────
const ERWARTETE_DOMAIN = 'alltagsengel.care'

async function pruefeZugang() {
  const key = ENV.RESEND_API_KEY
  if (!key) {
    return { ok: false, zeilen: ['RESEND_API_KEY ist hier nicht gesetzt — Zugang nicht pruefbar.'] }
  }
  // Der Aufruf liegt bewusst in scripts/verify-resend.mjs: der rohe
  // `Authorization: Bearer`-Header ist gegenueber Resend richtig, aber
  // der Scan in __tests__/security/supabase-key-migration.test.ts sucht
  // nach dem Literal und nicht nach dem Ziel. Jede weitere Datei mit
  // diesem Literal muesste in seine Ausnahmeliste — und eine Ausnahme-
  // liste, die mit jedem neuen Skript waechst, ist kein Zaun mehr.
  const ergebnis = await holeResendDomains(key)
  if (!ergebnis.ok) {
    return { ok: false, zeilen: [ergebnis.grund] }
  }
  const domains = ergebnis.domains
  const treffer = domains.find(d => d.name === ERWARTETE_DOMAIN)
  if (!treffer) {
    return {
      ok: false,
      zeilen: [`${ERWARTETE_DOMAIN} ist im Konto nicht hinterlegt (${domains.length} Domain(s)).`],
    }
  }
  const verifiziert = treffer.status === 'verified'
  return {
    ok: verifiziert,
    zeilen: [
      'Schluessel gueltig.',
      `${ERWARTETE_DOMAIN}: status=${treffer.status}` +
        (verifiziert ? ' — DKIM/SPF stehen.' : ' — NICHT verifiziert, Mails wuerden abgewiesen.'),
    ],
  }
}

// ── Schicht 2: Schalter ──────────────────────────────────────────────
// Wortgleiches Verstaendnis wie lib/config/versand-flags.ts: AN ist
// ausschliesslich der exakte Wert '1', NICHT getrimmt. Ein Wert, bei dem
// unklar ist, ob er absichtlich so aussieht, darf keine Post ausloesen.
const SCHALTER = [
  ['RECHNUNGSVERSAND_AUTOMATISCH', 'automatischer Rechnungsversand (invoice_email_log)'],
  ['MAHNVERSAND_AUTOMATISCH', 'automatischer Mahnversand (dunning_email_queue)'],
  ['CRON_SECRET', 'alle neun Cron-Laeufe — ohne ihn weist pruefeCronGeheimnis jeden ab'],
]

function pruefeSchalter() {
  const zeilen = []
  const fehlend = []
  for (const [name, wirkung] of SCHALTER) {
    const roh = ENV[name]
    const gesetzt = typeof roh === 'string' && roh !== ''
    let stand
    if (!gesetzt) { stand = 'FEHLT'; fehlend.push(name) }
    else if (name === 'CRON_SECRET') stand = 'gesetzt'
    else if (roh === '1') stand = 'AN'
    else if (roh === '0') stand = 'ausdruecklich AUS'
    else { stand = 'UNGUELTIGER WERT (nur "1" schaltet ein)'; fehlend.push(name) }
    zeilen.push(`${name.padEnd(30)} ${stand.padEnd(32)} ${wirkung}`)
  }
  return { fehlend, zeilen }
}

// ── Schicht 3: Wirkung, aus der Produktionsdatenbank ─────────────────
async function pruefeWirkung() {
  const spuren = [
    ['invoice_email_log', 'versendete Rechnungen'],
    ['notification_delivery_log', 'Zustellungen ueber alle vier Kanaele'],
    ['newsletter_subscribers', 'Newsletter-Anmeldungen'],
  ]
  const zeilen = []
  let gesamt = 0
  for (const [tabelle, was] of spuren) {
    const n = (await orakel(`select count(*)::text from public.${tabelle}`)).trim()
    const zahl = Number(n)
    if (Number.isFinite(zahl)) gesamt += zahl
    zeilen.push(`${tabelle.padEnd(30)} ${n.padStart(6)}   ${was}`)
  }
  return { gesamt, zeilen }
}

// ── Lauf ─────────────────────────────────────────────────────────────
async function main() {
  console.log('\n═══ Versandbereitschaft ═══\n')

  console.log('1) ZUGANG — Resend (nur lesend, es geht keine Mail raus)')
  const zugang = await pruefeZugang()
  for (const z of zugang.zeilen) console.log(`   ${z}`)
  console.log(`   → ${zugang.ok ? 'OK' : 'ROT'}\n`)

  console.log('2) SCHALTER — gelesen aus DIESER Umgebung, nicht aus Vercel')
  const schalter = pruefeSchalter()
  for (const z of schalter.zeilen) console.log(`   ${z}`)
  console.log()

  console.log('3) WIRKUNG — Zustellspuren in der Produktionsdatenbank')
  const wirkung = await pruefeWirkung()
  for (const z of wirkung.zeilen) console.log(`   ${z}`)
  console.log()

  console.log('═══ Befund ═══\n')

  if (!zugang.ok) {
    console.log('INTERNER FEHLER. Der Zugang selbst traegt nicht — das ist KEIN')
    console.log('externer Blocker, sondern etwas, das hier repariert gehoert.')
    console.log('Solange Schicht 1 rot ist, sagt die leere Zustellspur nichts')
    console.log('ueber fehlende Vercel-Variablen aus.\n')
    process.exit(1)
  }

  if (wirkung.gesamt > 0) {
    console.log(`Es ist Post rausgegangen (${wirkung.gesamt} Eintraege in den`)
    console.log('Zustellspuren). Die Begruendung „nie eine Mail versendet" aus der')
    console.log('COMPLETION-MATRIX ist damit ueberholt und gehoert nachgezogen.\n')
    process.exit(0)
  }

  console.log('Zugang steht, Domain verifiziert — und trotzdem null Zustellungen.')
  console.log('Damit ist EXTERNAL_BLOCKED die richtige Beschreibung: die Software')
  console.log('ist vollstaendig, es fehlt eine Einstellung ausserhalb des Repos.\n')
  if (schalter.fehlend.length > 0) {
    console.log('Hier fehlt bzw. steht ungueltig:')
    for (const n of schalter.fehlend) console.log(`   • ${n}`)
    console.log()
    console.log('ZU PRUEFEN IST ABER VERCEL, nicht diese Maschine. Dieses Skript')
    console.log('liest die lokale Umgebung; dass eine Variable hier fehlt, ist ein')
    console.log('Hinweis und kein Beweis fuer die Produktion. Der Beweis steht in')
    console.log('Schicht 3: die Spuren sind leer, obwohl der Zugang traegt.\n')
  } else {
    console.log('BEMERKENSWERT: hier sind alle Schalter gesetzt, und die Spuren')
    console.log('sind trotzdem leer. Dann liegt es NICHT (nur) an den Variablen —')
    console.log('entweder stehen sie in Vercel anders als hier, oder es laeuft')
    console.log('kein Cron. Das ist ein eigener Befund und keine Wartelage.\n')
  }
  process.exit(0)
}

main().catch(err => { console.error(err); process.exit(1) })
