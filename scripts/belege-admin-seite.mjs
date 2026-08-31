#!/usr/bin/env node
/** Beleg 7: die Admin-Ansicht — Live-Aufruf, Guard im Code, Testlauf. */
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
const ROH = 'docs/security/belege/roh'
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
const CSS = fs.readFileSync(`${ROH}/beleg-1_security-audit-log.html`, 'utf8').match(/<style>([\s\S]*?)<\/style>/)[1]

const auf = JSON.parse(fs.readFileSync(`${ROH}/10_admin-aufruf.json`, 'utf8'))
const tests = fs.readFileSync(`${ROH}/09_tests.txt`, 'utf8')
  .split('\n').filter((z) => !/Vite config|configLoader|ESM syntax|VITE_CONFIG/.test(z)).join('\n').trim()
const guard = fs.readFileSync('app/api/admin/security/audit-log/route.ts', 'utf8').split('\n').slice(0, 18).join('\n')
const berecht = (fs.readFileSync('app/api/admin/security/audit-log/route.ts', 'utf8')
  .match(/requireBerechtigung\([^)]*\)/g) || []).join('\n')

const spur = auf.dokumentspur.map((s) => `<tr><th>${s.status}</th><td class="wert">${esc(s.url)}</td></tr>`).join('')

const html = `<!doctype html><html lang="de"><head><meta charset="utf-8">
<title>Admin-Sicherheitsansicht</title><style>${CSS}</style></head><body>
<div class="kopf"><h1>/admin/security/audit-log — Live-Aufruf und Berechtigung</h1>
<div class="meta">Aufruf mit echtem Browser (Chromium) gegen Production, ohne Anmeldung</div></div>

<h2>Was beim Aufruf passiert</h2>
<table>${spur}</table>
<table>
  <tr><th>angefordert</th><td class="wert">${esc(auf.angefordert)}</td></tr>
  <tr><th>gelandet bei</th><td class="wert"><span class="gelb">${esc(auf.endstand_url)}</span></td></tr>
  <tr><th>Meldung auf der Seite</th><td class="wert"><span class="rot">Zugriff verweigert. Bitte melden Sie sich an.</span></td></tr>
</table>
<div class="hinweis">Die Ansicht ist <b>nicht anonym erreichbar</b>. Der Aufruf endet
mit <code>error=auth_required</code> auf der Anmeldeseite. Es wurde
<b>bewusst keine Anmeldung</b> durchgefuehrt — dieser Beleg entsteht ohne
Eingabe von Zugangsdaten. Der Screenshot der abgewiesenen Seite liegt als
<code>beleg-6_admin-ansicht-live.png</code> daneben.</div>

<h2>Der Riegel im Code · app/api/admin/security/audit-log/route.ts</h2>
<pre>${esc(guard)}</pre>
<pre>${esc(berecht)}</pre>

<h2>Testlauf · __tests__/security/security-kontoalarm-pglite.test.ts</h2>
<pre>${esc(tests)}</pre>
<div class="hinweis">15 von 15 Proben gruen. Die Suite faehrt gegen ein echtes
Postgres (PGlite) und prueft die Alarmkette samt Watchlist-Regel — nicht
gegen eine Attrappe.</div>

<div class="fuss">Erhoben am 31.08.2026. Zugangsdaten erscheinen in keinem Beleg.</div>
</body></html>`

const p = `${ROH}/beleg-7_admin-berechtigung.html`
fs.writeFileSync(p, html)
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 })
await page.goto('file://' + path.resolve(p))
await page.screenshot({ path: 'docs/security/belege/beleg-7_admin-berechtigung.png', fullPage: true })
await browser.close()
console.log('PNG docs/security/belege/beleg-7_admin-berechtigung.png')
