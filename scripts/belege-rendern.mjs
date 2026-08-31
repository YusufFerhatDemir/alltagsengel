#!/usr/bin/env node
/**
 * Baut aus den Rohdaten (docs/security/belege/roh) HTML-Belegseiten und
 * schiesst davon echte PNGs mit Playwright.
 *
 * Regel: die Seiten zeigen ausschliesslich Abfrageergebnisse. Keine Schluessel.
 */
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const ROH = 'docs/security/belege/roh'
const AUS = 'docs/security/belege'
const lies = (n) => JSON.parse(fs.readFileSync(path.join(ROH, n), 'utf8'))
const liesTxt = (n) => fs.readFileSync(path.join(ROH, n), 'utf8')
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
const berlin = (iso) => iso ? new Date(iso).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }) : '—'

const CSS = `
:root{--bg:#0f1419;--karte:#171e26;--rand:#2b3745;--text:#e6edf3;--matt:#8b98a5;
      --gruen:#3fb950;--rot:#f85149;--gelb:#d29922;--blau:#58a6ff}
*{box-sizing:border-box}
body{margin:0;padding:28px;background:var(--bg);color:var(--text);
     font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}
h1{font-size:20px;margin:0 0 4px;letter-spacing:.3px}
.kopf{border-bottom:2px solid var(--rand);padding-bottom:14px;margin-bottom:22px}
.kopf .meta{color:var(--matt);font-size:12px}
h2{font-size:15px;margin:26px 0 10px;color:var(--blau);
   border-left:3px solid var(--blau);padding-left:9px}
table{border-collapse:collapse;width:100%;margin-bottom:8px;background:var(--karte);
      border:1px solid var(--rand);border-radius:6px;overflow:hidden}
th,td{text-align:left;padding:7px 11px;border-bottom:1px solid var(--rand);
      vertical-align:top;font-size:12.5px;word-break:break-word}
th{background:#1e2733;color:var(--matt);font-weight:600;white-space:nowrap;width:210px}
tr:last-child td,tr:last-child th{border-bottom:none}
td.wert{color:var(--text)}
.null{color:var(--matt);font-style:italic}
.gruen{color:var(--gruen);font-weight:600}
.rot{color:var(--rot);font-weight:600}
.gelb{color:var(--gelb);font-weight:600}
.hinweis{background:#1d2430;border-left:3px solid var(--gelb);padding:11px 14px;
         margin:14px 0;border-radius:0 6px 6px 0;font-size:12.5px;color:#cbd5e0}
pre{background:var(--karte);border:1px solid var(--rand);border-radius:6px;
    padding:14px;font-size:12px;line-height:1.45;white-space:pre-wrap;margin:0}
.j{color:#a5d6ff;font-size:12px}
.fuss{margin-top:24px;padding-top:12px;border-top:1px solid var(--rand);
      color:var(--matt);font-size:11.5px}
`

function seite(titel, untertitel, inhalt) {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8">
<title>${esc(titel)}</title><style>${CSS}</style></head><body>
<div class="kopf"><h1>${esc(titel)}</h1>
<div class="meta">${esc(untertitel)}</div></div>
${inhalt}
<div class="fuss">Erhoben am 31.08.2026 gegen die Produktionsdatenbank
(Projekt nnwyktkqibdjxgimjyuq) — nur lesend, ueber PostgREST mit dem
Dienstschluessel. Zugangsdaten erscheinen in keinem Beleg.</div>
</body></html>`
}

/** Ein Datensatz als senkrechte Spalte/Wert-Tabelle — so ist JEDE Spalte sichtbar. */
function satzTabelle(zeile) {
  const reihen = Object.entries(zeile).map(([k, v]) => {
    let dar
    if (v === null || v === undefined) dar = '<span class="null">NULL</span>'
    else if (typeof v === 'object') dar = `<span class="j">${esc(JSON.stringify(v, null, 2))}</span>`
    else if (/^\d{4}-\d\d-\d\dT/.test(String(v))) dar = `${esc(v)}<br><span class="null">= ${esc(berlin(v))} (Berlin)</span>`
    else dar = esc(v)
    return `<tr><th>${esc(k)}</th><td class="wert">${dar}</td></tr>`
  }).join('')
  return `<table>${reihen}</table>`
}

const seiten = []

// ── 1 · security_audit_log: die beiden Test-Alarm-Ereignisse ──────────────
{
  const ev = lies('01_audit_events.json').daten
  const meld = lies('02_audit_meldungen.json').daten
  const zust = lies('04_delivery_log.json').daten
  const teile = ev.map((e) => {
    const m = meld.find((x) => x.metadata?.bezug_ereignis === e.id)
    const z = zust.find((x) => x.vorgang_ref === e.id)
    const kette = `<div class="hinweis">Kette fuer <b>${esc(e.id.slice(0, 8))}</b>:
      Ereignis ${e.id ? '<span class="gruen">vorhanden</span>' : ''} &rarr;
      Meldezeile ${m ? `<span class="gruen">${esc(m.id)}</span>` : '<span class="rot">FEHLT</span>'} &rarr;
      Zustellbeleg ${z ? `<span class="gruen">${esc(z.provider_message_id)}</span>` : '<span class="rot">FEHLT — kein Eintrag in notification_delivery_log</span>'}</div>`
    return `<h2>Ereignis ${esc(e.id)}</h2>${satzTabelle(e)}${kette}`
  }).join('')
  seiten.push(['beleg-1_security-audit-log', seite(
    'security_audit_log — die beiden Test-Alarm-Ereignisse',
    'SELECT * FROM security_audit_log WHERE id IN (8dfd95d7…, cf56c43b…)  ·  HTTP 200, 2 Zeilen  ·  alle Spalten',
    teile)])
}

// ── 2 · Watchlist ─────────────────────────────────────────────────────────
{
  const w = lies('03_watchlist.json').daten[0]
  seiten.push(['beleg-2_watchlist-karakaya', seite(
    'security_watchlist — Eintrag Rukiye Karakaya',
    'SELECT * FROM security_watchlist WHERE id = 12db4b18-4b8b-4153-8752-b628d0e1ba12  ·  HTTP 200, 1 Zeile',
    `<h2>Watchlist-Eintrag</h2>${satzTabelle(w)}
     <div class="hinweis">Der Eintrag ist <span class="gruen">aktiv</span>,
     deckt <b>alle Ereignisse</b> ab und laeuft <b>ohne Sperrfrist</b> —
     jedes sicherheitsrelevante Ereignis dieses Kontos wird sofort an
     ${esc(w.melde_email)} gemeldet. Angelegt vom Superadmin
     ${esc(w.angelegt_von)}.</div>`)])
}

// ── 3 · Zustellung: DB-Beleg + Provider-Antwort ───────────────────────────
{
  const z = lies('04_delivery_log.json').daten
  const r = lies('08_resend.json')
  const tab = z.map((x) => `<h2>Zustellbeleg ${esc(x.id)}</h2>${satzTabelle(x)}`).join('')
  const prov = r.map((x) => `<h2>Provider-Antwort · ${esc(x.provider_message_id)}</h2>
    <table>
      <tr><th>Bezug</th><td class="wert">${esc(x.bezug)}</td></tr>
      <tr><th>HTTP</th><td class="wert"><span class="${x.http === 200 ? 'gruen' : 'rot'}">${x.http}</span></td></tr>
      <tr><th>last_event</th><td class="wert"><span class="${x.last_event === 'delivered' ? 'gruen' : 'gelb'}">${esc(x.last_event)}</span></td></tr>
      <tr><th>Empfaenger</th><td class="wert">${esc((x.to || []).join(', '))}</td></tr>
      <tr><th>Absender</th><td class="wert">${esc(x.from)}</td></tr>
      <tr><th>Betreff</th><td class="wert">${esc(x.subject)}</td></tr>
      <tr><th>created_at</th><td class="wert">${esc(x.created_at)}</td></tr>
    </table>`).join('')
  seiten.push(['beleg-3_zustellung-provider', seite(
    'Zustellnachweis — notification_delivery_log und Provider-Antwort',
    'SELECT * FROM notification_delivery_log  ·  GET https://api.resend.com/emails/{id}',
    `${tab}${prov}
     <div class="hinweis"><b>Der entscheidende Unterschied:</b> zum Ereignis
     <b>8dfd95d7</b> (13:42 Berlin) existiert <span class="rot">kein
     Zustellbeleg</span> — die Meldung ging raus, ohne eine Spur zu
     hinterlassen. Zum Ereignis <b>cf56c43b</b> (13:44 Berlin), nach dem
     P0-Fix, liegt ein vollstaendiger Beleg vor: Provider-ID
     13307e4c…, Status <span class="gruen">sent</span>, beim Provider
     <span class="gruen">delivered</span>. Das ist das Vorher/Nachher
     derselben Alarmkette im Abstand von zwei Minuten.</div>`)])
}

// ── 4 · Migrationsstand ───────────────────────────────────────────────────
{
  const t = liesTxt('07_migrationen.txt')
  const o = lies('05_migrationen_anzahl.json')
  seiten.push(['beleg-4_migrationsstand', seite(
    'Migrationsstand — live gegen Production gemessen',
    'npm run check:migrationen  ·  Objektpraesenz statt Versionsliste',
    `<div class="hinweis">Die Tabelle <b>supabase_migrations.schema_migrations</b>
     ist fuer den Dienstschluessel <span class="rot">nicht lesbar</span>:
     <code>${esc(o.wert)}</code>. Der Stand wird deshalb ueber die
     <b>Objektpraesenz</b> gemessen — fuer jede Migration wird geprueft, ob
     die Funktion / der Index / die Policy live wirklich existiert. Das ist
     das haertere Kriterium: es belegt Wirkung, nicht nur einen Eintrag.</div>
     <h2>Ausgabe des Laufs</h2><pre>${esc(t)}</pre>`)])
}

// ── 5 · DDL-Blocker ───────────────────────────────────────────────────────
{
  const t = liesTxt('06_ddl-rechte.txt')
  seiten.push(['beleg-5_ddl-blocker', seite(
    'DDL-Blocker — der Dienstschluessel darf kein Schema aendern',
    'node scripts/verify-ddl-rechte-live.mjs  ·  jede Probe endet mit RAISE EXCEPTION (Rollback)',
    `<pre>${esc(t)}</pre>
     <div class="hinweis">Gemessen, nicht vermutet: <b>current_user =
     service_role</b>, kein Mitglied von <code>postgres</code>, kein CREATE
     auf <code>public</code>. Alle vier DDL-Arten scheitern mit
     <span class="rot">SQLSTATE 42501</span>. Damit koennen die acht offenen
     Migrationen aus Beleg 4 <b>nicht</b> automatisiert angewendet werden —
     sie brauchen den Supabase-SQL-Editor als <code>postgres</code>.</div>`)])
}

fs.mkdirSync(AUS, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 })
for (const [name, html] of seiten) {
  const htmlPfad = path.join(ROH, `${name}.html`)
  fs.writeFileSync(htmlPfad, html)
  await page.goto('file://' + path.resolve(htmlPfad))
  await page.screenshot({ path: path.join(AUS, `${name}.png`), fullPage: true })
  console.log(`PNG  ${AUS}/${name}.png`)
}
await browser.close()
