#!/usr/bin/env node
/** Ruft die Admin-Sicherheitsansicht live auf und haelt fest, was passiert. */
import fs from 'node:fs'
import { chromium } from 'playwright'
const ZIEL = 'https://www.alltagsengel.care/admin/security/audit-log'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const spur = []
page.on('response', (r) => {
  if ([301, 302, 307, 308, 200, 403, 401].includes(r.status()) && r.request().resourceType() === 'document')
    spur.push({ status: r.status(), url: r.url() })
})
const antwort = await page.goto(ZIEL, { waitUntil: 'networkidle' })
// Cookie-Banner wegklicken — er liegt sonst ueber der Seite (bekannte Falle).
for (const t of ['Nur notwendige', 'Ablehnen', 'Alle ablehnen']) {
  const b = page.getByRole('button', { name: new RegExp(t, 'i') })
  if (await b.count()) { await b.first().click().catch(() => {}); break }
}
await page.waitForTimeout(800)
await page.screenshot({ path: 'docs/security/belege/beleg-6_admin-ansicht-live.png', fullPage: false })
const ergebnis = {
  angefordert: ZIEL,
  endstand_url: page.url(),
  endstand_status: antwort?.status(),
  dokumentspur: spur,
  titel: await page.title(),
}
fs.writeFileSync('docs/security/belege/roh/10_admin-aufruf.json', JSON.stringify(ergebnis, null, 2))
console.log(JSON.stringify(ergebnis, null, 2))
await browser.close()
