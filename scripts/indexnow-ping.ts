/**
 * Bulk-IndexNow-Ping: meldet ALLE URLs aus der Live-Sitemap bei IndexNow an
 * (Bing, Yandex, Seznam, Naver). Einmalig nach größeren Content-Deployments
 * ausführen — beschleunigt die Indexierung neuer Seiten massiv.
 *
 * Nutzung:  npx tsx scripts/indexnow-ping.ts
 * Voraussetzung: Deploy ist live (Key-File https://alltagsengel.care/<KEY>.txt
 * muss von den Suchmaschinen abrufbar sein — wird vorab geprüft).
 */
import { notifyIndexers, INDEXNOW_FALLBACK_KEY } from '../lib/indexing'

const SITEMAP_URL = 'https://alltagsengel.care/sitemap.xml'

async function main() {
  const key = process.env.INDEXNOW_KEY || INDEXNOW_FALLBACK_KEY

  // 1. Key-File live erreichbar? (sonst verwerfen Bing & Co. den Ping)
  const keyUrl = `https://alltagsengel.care/${key}.txt`
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
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
  console.log(`✓ ${urls.length} URLs aus Sitemap gelesen`)

  // 3. IndexNow-Ping (ein Batch, Limit sind 10.000 URLs pro Call)
  const result = await notifyIndexers(urls)
  if (result.ok) {
    console.log(`✓ IndexNow: ${result.submitted} URLs eingereicht (HTTP ${result.status})`)
  } else {
    console.error(`✗ IndexNow fehlgeschlagen:`, result)
    process.exit(1)
  }
}

main()
