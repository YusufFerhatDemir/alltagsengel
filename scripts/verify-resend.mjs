#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// Live-Pruefung des Resend-Zugangs — OHNE eine einzige Mail zu senden
// ═══════════════════════════════════════════════════════════════════════
//
// WARUM ES DAS BRAUCHT
// Ob der hinterlegte Schluessel gueltig ist, war bisher nur an einem
// echten Versand ablesbar — also erst dann, wenn eine Kundenmail schon
// haette rausgehen sollen. Deshalb galt der Punkt als extern blockiert.
//
// Dieses Skript fragt ausschliesslich LESEND ab:
//   GET /domains  → Schluessel gueltig? Ist alltagsengel.care verifiziert?
//
// Es verschickt nichts, aendert nichts und gibt den Schluessel nirgends
// aus. Rueckgabewert 0 = Zugang und Domain in Ordnung.
//
//   node scripts/verify-resend.mjs            (liest .env.local)
//   RESEND_API_KEY=... node scripts/verify-resend.mjs
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs'

const ERWARTETE_DOMAIN = 'alltagsengel.care'

function schluessel() {
  if (process.env.RESEND_API_KEY) return process.env.RESEND_API_KEY.trim()
  for (const datei of ['.env.local', '.env.production', '.env']) {
    try {
      const treffer = readFileSync(datei, 'utf8').match(/^RESEND_API_KEY=(.*)$/m)
      if (treffer) return treffer[1].trim().replace(/^["']|["']$/g, '')
    } catch { /* Datei fehlt — naechste probieren */ }
  }
  return null
}

const key = schluessel()
if (!key) {
  console.log('RESEND_API_KEY: nicht gesetzt — Zugang nicht pruefbar.')
  process.exit(2)
}
console.log(`RESEND_API_KEY: gesetzt (Praefix ${key.slice(0, 3)}, Laenge ${key.length}).`)

const antwort = await fetch('https://api.resend.com/domains', {
  headers: { Authorization: `Bearer ${key}` },
  signal: AbortSignal.timeout(15_000),
}).catch(err => ({ fehler: err }))

if (antwort.fehler) {
  console.log(`Netzwerkfehler: ${antwort.fehler.message} — Zugang NICHT verifiziert.`)
  process.exit(3)
}

console.log(`HTTP ${antwort.status}`)
if (antwort.status === 401 || antwort.status === 403) {
  console.log('Schluessel wird von Resend ABGELEHNT (ungueltig oder eingeschraenkt).')
  process.exit(1)
}
if (!antwort.ok) {
  console.log('Unerwartete Antwort — Zugang nicht abschliessend beurteilbar.')
  process.exit(3)
}

const koerper = await antwort.json()
const domains = koerper?.data ?? []
console.log(`Schluessel GUELTIG. ${domains.length} Domain(s) im Konto.`)
let treffer = null
for (const d of domains) {
  console.log(`  - ${d.name}: status=${d.status}, region=${d.region ?? '—'}`)
  if (d.name === ERWARTETE_DOMAIN) treffer = d
}
if (!treffer) {
  console.log(`FEHLT: ${ERWARTETE_DOMAIN} ist in diesem Konto nicht angelegt.`)
  process.exit(1)
}
if (treffer.status !== 'verified') {
  console.log(`${ERWARTETE_DOMAIN} ist NICHT verifiziert (status=${treffer.status}).`)
  process.exit(1)
}
console.log(`${ERWARTETE_DOMAIN} ist verifiziert — DKIM/SPF stehen.`)
process.exit(0)
