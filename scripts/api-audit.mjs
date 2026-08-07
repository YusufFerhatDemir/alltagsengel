#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// api-audit.mjs — jeden API-Endpunkt UNAUTHENTIFIZIERT anfahren
// ════════════════════════════════════════════════════════════════════
//
//   node scripts/api-audit.mjs [basis-url]
//   (Default: http://127.0.0.1:8080 — die Staging-App)
//
// Zweck: belegen, dass geschuetzte Endpunkte ohne Sitzung 401/403 liefern
// und dass KEIN Endpunkt mit 500 antwortet. Eine Textsuche nach
// „requireAdmin" reicht dafuer nicht — sie findet weder alle Guard-Namen
// noch beweist sie, dass der Guard auch greift.
//
// Bewertung je Antwort:
//   oeffentlich  → 2xx/4xx ist in Ordnung, 5xx ist ein Fehler
//   geschuetzt   → MUSS 401/403 sein (404/405 zaehlt auch, Route nicht erreichbar)
//   5xx          → immer ein Fehler
// ════════════════════════════════════════════════════════════════════

import { readdirSync, statSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const BASIS = process.argv[2] || 'http://127.0.0.1:8080'
const API_WURZEL = 'app/api'

/** Routen, die absichtlich ohne Anmeldung erreichbar sind. */
const OEFFENTLICH = new Set([
  '/api/expansion/status',        // Freischaltungsstatus, nur oeffentliche Felder
  '/api/expansion/waitlist',      // Lead-Erfassung (POST); GET ist admin-geschuetzt
  '/api/client-ip',
  '/api/newsletter',
  '/api/newsletter/unsubscribe',
  '/api/kontakt',
  '/api/lead-inquiry',
  '/api/beratung-chat',
  '/api/google-reviews',
  '/api/reviews',
  '/api/pricing',
  '/api/pricing/calculate',
  '/api/track',
  '/api/track-conversion',
  '/api/analytics/vitals',
  '/api/analytics/capi',
  '/api/auth/check-rate-limit',
  '/api/auth/send-reset',
  '/api/auth/send-welcome',
  '/api/visitor-alert',
  '/api/referral',
  '/api/user/delete/undo',        // Token im Link, kein Login moeglich
  '/api/stripe/webhook',          // Signaturpruefung statt Login
  '/api/whatsapp/webhook',        // Signaturpruefung statt Login
  '/api/sentry-example/api',
  '/api/notify-admin-registration',
  '/api/bookings/respond',        // Token-Link aus der E-Mail
  '/api/drip',
])

/** Cron-Routen: durch CRON_SECRET geschuetzt, 401 erwartet. */
const CRON = new Set(['/api/cron/drip', '/api/cron/indexnow', '/api/cron/review-request'])

function routenSammeln(dir, prefix = '/api') {
  const treffer = []
  for (const eintrag of readdirSync(dir)) {
    const pfad = join(dir, eintrag)
    if (statSync(pfad).isDirectory()) {
      treffer.push(...routenSammeln(pfad, `${prefix}/${eintrag}`))
    } else if (eintrag === 'route.ts') {
      const inhalt = readFileSync(pfad, 'utf8')
      const methoden = [...inhalt.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)/g)]
        .map(m => m[1])
      treffer.push({ pfad: prefix, methoden, datei: pfad })
    }
  }
  return treffer
}

/** [id]-Segmente durch einen Beispielwert ersetzen, sonst matcht die Route nicht. */
function konkret(pfad) {
  return pfad
    .replace('[bundesland]', 'hessen')
    .replace('[id]', '00000000-0000-4000-8000-000000000001')
    .replace('[verordnung_id]', '00000000-0000-4000-8000-000000000001')
    .replace('[source]', 'test')
    .replace(/\[[^\]]+\]/g, 'test')
}

const routen = routenSammeln(API_WURZEL).sort((a, b) => a.pfad.localeCompare(b.pfad))
const ergebnisse = []

for (const route of routen) {
  const url = BASIS + konkret(route.pfad)
  const oeffentlich = OEFFENTLICH.has(route.pfad)
  const cron = CRON.has(route.pfad)

  for (const methode of route.methoden) {
    let status = 0
    let text = ''
    try {
      const res = await fetch(url, {
        method: methode,
        headers: { 'Content-Type': 'application/json' },
        body: ['GET', 'HEAD'].includes(methode) ? undefined : '{}',
      })
      status = res.status
      text = (await res.text()).slice(0, 80).replace(/\s+/g, ' ')
    } catch (e) {
      status = -1
      text = String(e).slice(0, 80)
    }

    let bewertung
    if (status >= 500) {
      bewertung = 'FEHLER-5XX'
    } else if (oeffentlich || cron) {
      bewertung = 'OK'
    } else if ([401, 403, 404, 405].includes(status)) {
      bewertung = 'OK'
    } else if (status === 400 || status === 422 || status === 428) {
      // Eingabevalidierung VOR der Authpruefung: kein Datenabfluss, aber
      // die Reihenfolge ist unguenstig — wird als Hinweis gemeldet.
      bewertung = 'HINWEIS-VALIDIERUNG-VOR-AUTH'
    } else {
      bewertung = 'OFFEN-OHNE-AUTH'
    }

    ergebnisse.push({ methode, pfad: route.pfad, status, bewertung, text })
  }
}

const breite = Math.max(...ergebnisse.map(e => e.pfad.length))
for (const e of ergebnisse) {
  const marke = e.bewertung === 'OK' ? '  ' : '→ '
  console.log(
    `${marke}${e.methode.padEnd(6)} ${e.pfad.padEnd(breite)}  ${String(e.status).padStart(3)}  ${e.bewertung}`
  )
}

const zaehler = ergebnisse.reduce((a, e) => { a[e.bewertung] = (a[e.bewertung] || 0) + 1; return a }, {})
console.log('\n── Zusammenfassung ──')
console.log(`Routen: ${routen.length}, Aufrufe: ${ergebnisse.length}`)
for (const [k, v] of Object.entries(zaehler)) console.log(`  ${k}: ${v}`)

const schwer = ergebnisse.filter(e => e.bewertung === 'FEHLER-5XX' || e.bewertung === 'OFFEN-OHNE-AUTH')
if (schwer.length) {
  console.log('\n── Zu beheben ──')
  for (const e of schwer) console.log(`  ${e.methode} ${e.pfad} → ${e.status} ${e.text}`)
  process.exit(1)
}
console.log('\nKeine 5xx, keine ungeschuetzten Endpunkte.')
