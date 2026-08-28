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

/**
 * Fragt Resend nach den Domains des Kontos. NUR LESEND.
 *
 * Ausgelagert und exportiert, damit der rohe `Authorization: Bearer`-Header
 * an GENAU EINER Stelle im Repo steht. Er ist hier richtig — Resend
 * schreibt ihn vor, apiHeaders() aus scripts/lib/supabase-keys.mjs baut
 * Supabase-Header und waere an dieser Adresse schlicht falsch. Aber der
 * Scan in __tests__/security/supabase-key-migration.test.ts sucht nach dem
 * LITERAL und nicht nach dem Ziel, und jede weitere Datei mit diesem
 * Literal muesste in seine Ausnahmeliste. Eine Ausnahmeliste, die mit
 * jedem neuen Skript waechst, hoert irgendwann auf, ein Zaun zu sein —
 * deshalb importiert scripts/verify-versandbereitschaft.mjs diese Funktion,
 * statt den Aufruf zu wiederholen.
 *
 * @returns {Promise<{ok: boolean, grund: string, domains: Array<object>, status: number|null}>}
 */
export async function holeResendDomains(apiKey) {
  const antwort = await fetch('https://api.resend.com/domains', {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15_000),
  }).catch(err => ({ fehler: err }))

  if (antwort.fehler) {
    return { ok: false, grund: `Netzwerkfehler: ${antwort.fehler.message}`, domains: [], status: null }
  }
  if (antwort.status === 401 || antwort.status === 403) {
    return {
      ok: false,
      grund: `Schluessel wird von Resend abgelehnt (HTTP ${antwort.status}).`,
      domains: [], status: antwort.status,
    }
  }
  if (!antwort.ok) {
    return {
      ok: false, grund: `Unerwartete Antwort HTTP ${antwort.status}.`,
      domains: [], status: antwort.status,
    }
  }
  const koerper = await antwort.json()
  return { ok: true, grund: 'Schluessel gueltig.', domains: koerper?.data ?? [], status: antwort.status }
}

/** Liest RESEND_API_KEY aus Umgebung oder .env-Dateien. */
export { schluessel as resendSchluessel }

// Ab hier der eigenstaendige Lauf. Nur, wenn die Datei direkt aufgerufen
// wurde — sonst wuerde ein Import den ganzen Pruefer samt process.exit()
// mit ausfuehren.
const direktAufgerufen =
  process.argv[1] && process.argv[1].endsWith('verify-resend.mjs')

if (!direktAufgerufen) {
  // Als Modul geladen: nichts tun, nur die Funktionen bereitstellen.
} else {

const key = schluessel()
if (!key) {
  console.log('RESEND_API_KEY: nicht gesetzt — Zugang nicht pruefbar.')
  process.exit(2)
}
console.log(`RESEND_API_KEY: gesetzt (Praefix ${key.slice(0, 3)}, Laenge ${key.length}).`)

const ergebnis = await holeResendDomains(key)

console.log(`HTTP ${ergebnis.status ?? '—'}`)
if (!ergebnis.ok) {
  console.log(ergebnis.grund)
  process.exit(ergebnis.status === 401 || ergebnis.status === 403 ? 1 : 3)
}

const domains = ergebnis.domains
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

}
