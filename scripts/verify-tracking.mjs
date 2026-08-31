#!/usr/bin/env node
/**
 * ÖFFNUNGS- UND KLICKTRACKING — wird gemessen, und darf es das?
 *
 * ── WARUM ZWEI SEITEN GEPRUEFT WERDEN ─────────────────────────────────────
 * Die Frage zerfaellt in zwei, und beide muessen „nein" ergeben, damit
 * nicht gemessen wird:
 *
 *   1. ENTSTEHT die Messung? Das entscheidet der Versanddienst. Baut
 *      Resend ein Zaehlpixel ein und schreibt Links um, dann entsteht der
 *      Datenpunkt beim Empfaenger — unabhaengig davon, was wir spaeter
 *      damit tun. Die Einstellung haengt an der DOMAIN
 *      (open_tracking / click_tracking) und laesst sich ueber die
 *      Sende-API nicht je Mail abschalten.
 *
 *   2. SPEICHERN wir sie? Das entscheiden wir, im Webhook. Fail-closed
 *      ueber MARKETING_TRACKING_ERLAUBT (lib/marketing/tracking.ts).
 *
 * Ein Schalter, der nur die zweite Seite betrifft, waere eine Beruhigung
 * ohne Deckung: die Person wuerde weiterhin gemessen, wir wuerden es nur
 * nicht aufschreiben. Deshalb liest dieser Lauf die Domain-Einstellung
 * bei Resend nach, statt sie anzunehmen.
 *
 * ── DIESER LAUF VERSCHICKT NICHTS ─────────────────────────────────────────
 * Er ruft ausschliesslich GET /domains der Resend-API auf — eine Abfrage
 * des eigenen Kontos. Keine Mail, kein Schreibvorgang.
 *
 * Aufruf:  npm run verify:tracking
 */

import { envWert } from './lib/supabase-keys.mjs'
import { trackingLage, trackingLageTransaktion } from '../lib/marketing/tracking.ts'

const ergebnisse = []
function pruefe(id, titel, bestanden, text) {
  ergebnisse.push({ id, bestanden })
  console.log(`\n[${id}] ${bestanden ? 'OK     ' : 'OFFEN  '} ${titel}`)
  for (const z of String(text).split('\n')) console.log(`  ${z}`)
}

console.log('═══════════════════════════════════════════════════════════════════')
console.log(' TRACKING — wird gemessen, und darf es das?')
console.log(` ${new Date().toISOString()}`)
console.log('═══════════════════════════════════════════════════════════════════')

// ── T1) Unsere Seite: speichern wir Oeffnungen? ───────────────────────
const lage = trackingLage()
pruefe('T1', 'Öffnungs- und Klickzeitpunkte werden nicht gespeichert',
  !lage.erlaubt,
  `MARKETING_TRACKING_ERLAUBT=${process.env.MARKETING_TRACKING_ERLAUBT ?? '(nicht gesetzt)'}\n`
  + `${lage.grund}\n`
  + 'Maßgeblich ist die Vercel-Umgebung, nicht diese Datei — dort steht die\n'
  + 'Variable für den Betrieb.')

// ── T2) Transaktionspost ──────────────────────────────────────────────
pruefe('T2', 'Transaktionspost wird nie gemessen',
  !trackingLageTransaktion().erlaubt,
  `${trackingLageTransaktion().grund}\n`
  + 'Ohne Schalter und ohne Ausnahme — der Webhook weist Öffnungs- und\n'
  + 'Klickereignisse für Rechnungen, Mahnungen und Sicherheitsmeldungen ab,\n'
  + 'bevor sie irgendwo landen.')

// ── T3) Die andere Seite: misst Resend ueberhaupt? ────────────────────
const KEY = envWert('RESEND_API_KEY')
if (!KEY) {
  pruefe('T3', 'Die Domain bei Resend misst keine Öffnungen und Klicks',
    false,
    'RESEND_API_KEY nicht verfügbar — die Domain-Einstellung ist von hier aus\n'
    + 'nicht prüfbar. Das ist KEIN Beleg dafür, dass nicht gemessen wird:\n'
    + 'ungeprüft heißt ungeprüft. Nachzusehen unter\n'
    + 'Resend → Domains → alltagsengel.care → Open/Click Tracking.')
} else {
  try {
    const res = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${KEY}` },
    })
    const j = await res.json()
    const domains = Array.isArray(j?.data) ? j.data : []

    if (!res.ok) {
      pruefe('T3', 'Die Domain bei Resend misst keine Öffnungen und Klicks',
        false, `Resend antwortete mit HTTP ${res.status}. Nicht prüfbar.`)
    } else if (domains.length === 0) {
      pruefe('T3', 'Die Domain bei Resend misst keine Öffnungen und Klicks',
        false, 'Keine Domain im Konto gefunden — nicht prüfbar.')
    } else {
      const messend = domains.filter(d => d.open_tracking === true || d.click_tracking === true)
      pruefe('T3', 'Die Domain bei Resend misst keine Öffnungen und Klicks',
        messend.length === 0,
        domains.map(d =>
          `${d.name}: open_tracking=${d.open_tracking} | click_tracking=${d.click_tracking} | status=${d.status}`,
        ).join('\n')
        + (messend.length === 0
          ? '\nEs wird gar nicht erst gemessen — kein Zählpixel, keine umgeschriebenen Links.'
          : '\nOFFEN: hier entsteht der Datenpunkt beim Empfänger, unabhängig davon,\n'
            + 'ob wir ihn speichern. Abzuschalten unter Resend → Domains → Settings.\n'
            + 'Unser Schalter allein verhindert nur die Aufbewahrung, nicht die Messung.'))
    }
  } catch (err) {
    pruefe('T3', 'Die Domain bei Resend misst keine Öffnungen und Klicks',
      false, `Abruf fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`)
  }
}

const offen = ergebnisse.filter(e => !e.bestanden)
console.log('\n═══════════════════════════════════════════════════════════════════')
console.log(` ${ergebnisse.length - offen.length} von ${ergebnisse.length} Pruefungen bestanden.`)
if (offen.length > 0) console.log(` OFFEN: ${offen.map(e => e.id).join(', ')}`)
console.log('═══════════════════════════════════════════════════════════════════')
process.exit(offen.length > 0 ? 1 : 0)
