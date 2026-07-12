#!/usr/bin/env node
/**
 * Bulk-IndexNow-Ping: meldet ALLE URLs aus der Live-Sitemap bei IndexNow an
 * (Bing, Yandex, Seznam, Naver). Läuft automatisch nach jedem main-Deploy
 * (deploy.sh Step 7) und manuell via `npm run indexnow:ping`.
 *
 * Plain-Node (.mjs) statt tsx: tsx ist nicht installiert, und der nohup-
 * Kontext von deploy.sh hat nur node/npm — kein npx-Download erwünscht.
 * Die Ping-Logik spiegelt lib/indexing.ts (dort für den App-Hot-Path).
 *
 * Voraussetzung: Deploy ist live (Key-File https://alltagsengel.care/<KEY>.txt
 * muss von den Suchmaschinen abrufbar sein — wird vorab geprüft).
 */

const HOST = 'alltagsengel.care'
// Öffentlicher Key (Protokoll-Design, kein Secret) — Quelle: lib/indexing.ts
const FALLBACK_KEY = '220086f2a9d279a78836a0b250338d81'
const SITEMAP_URL = `https://${HOST}/sitemap.xml`

async function main() {
  const key = process.env.INDEXNOW_KEY || FALLBACK_KEY

  // 1. Key-File live erreichbar? (sonst verwerfen Bing & Co. den Ping)
  const keyUrl = `https://${HOST}/${key}.txt`
  const keyRes = await fetch(keyUrl)
  const keyBody = (await keyRes.text()).trim()
  if (!keyRes.ok || keyBody !== key) {
    console.error(`✗ Key-File nicht live oder falscher Inhalt: ${keyUrl} (HTTP ${keyRes.status})`)
    console.error('  → Erst deployen, dann diesen Ping erneut ausführen.')
    process.exit(1)
  }
  console.log(`✓ Key-File live: ${keyUrl}`)

  // 2. Sitemap holen und URLs extrahieren
  const smRes = await fetch(SITEMAP_URL)
  if (!smRes.ok) {
    console.error(`✗ Sitemap nicht erreichbar: HTTP ${smRes.status}`)
    process.exit(1)
  }
  const xml = await smRes.text()
  const urls = [...new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]))]
  console.log(`✓ ${urls.length} URLs aus Sitemap gelesen`)

  // 3. IndexNow-Ping (ein Batch, Limit sind 10.000 URLs pro Call)
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: HOST, key, keyLocation: keyUrl, urlList: urls }),
  })
  if (res.ok) {
    console.log(`✓ IndexNow: ${urls.length} URLs eingereicht (HTTP ${res.status}) — ${new Date().toISOString()}`)
  } else {
    console.error(`✗ IndexNow fehlgeschlagen: HTTP ${res.status}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error('✗ IndexNow-Ping Fehler:', e)
  process.exit(1)
})
