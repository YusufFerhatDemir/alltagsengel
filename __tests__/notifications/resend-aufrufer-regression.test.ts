// ═══════════════════════════════════════════════════════════════════════
// Regression: kein ungeprueftes resend.emails.send() mehr
// ═══════════════════════════════════════════════════════════════════════
//
// BEFUND (24.08.2026). lib/notifications.ts war gegen alle vier
// Fehlerpfade des Providers gehaertet — Zeitlimit, `{ error }`,
// fehlende Nachrichten-ID, Ausnahme. Fuenf Routen sprachen das SDK
// aber direkt an und werteten das Ergebnis nicht aus:
//
//   app/api/kontakt/route.ts          Lead ging still verloren
//   app/api/coach/anfrage/route.ts    dito
//   app/api/newsletter/route.ts       Willkommensmail
//   app/api/drip/route.ts             Zaehler meldete Erfolge ohne Versand
//   app/api/cron/review-request/…     dito
//
// Das SDK wirft bei einer Ablehnung NICHT. `await resend.emails.send(…)`
// ohne Auswertung liest sich wie „ist raus", bedeutet aber nur „wurde
// versucht". Alle fuenf antworteten dem Aufrufer `success: true`.
//
// Dieser Test haelt zwei Regeln fest:
//   1. Ausserhalb der erlaubten Module wird das Resend-SDK nicht mehr
//      direkt eingebunden — Versand laeuft ueber sendRawEmail().
//   2. Wo das SDK doch benutzt wird, muss das Ergebnis ausgewertet
//      werden (`const { error } = await …` oder Zuweisung).
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const WURZEL = path.join(__dirname, '..', '..')

/**
 * Module, die das SDK direkt benutzen duerfen.
 *
 * Nur noch EINES: lib/notifications.ts ist der zentrale Versandweg.
 *
 * lib/emails/coach-bestellung.ts stand hier ebenfalls („eigener,
 * ebenfalls gepruefter Aufruf") — geprueft war er aber nur auf `error`.
 * Damit fehlten ihm drei der vier Haertungen des zentralen Wegs: kein
 * Zeitlimit (das SDK setzt keines, ein haengender Aufruf laeuft ohne Spur
 * in den Funktions-Timeout), Erfolg wurde OHNE Nachrichten-ID gemeldet
 * (die ID ist die Empfangsbestaetigung — ohne sie ist `true` eine
 * Behauptung), und der Statuscode ging verloren (422 dauerhaft vs.
 * 429/5xx voruebergehend). Seit dem Delta-Check Phase 4.5 laeuft das
 * Modul ueber sendRawEmail(); sein eigenes Layout bleibt dabei erhalten,
 * weil sendRawEmail — anders als sendEmailNotification — kein Template
 * drumherum legt.
 *
 * Diese Liste ist bewusst kurz zu halten: jeder weitere Eintrag ist ein
 * Versandweg, dessen Fehlerpfade einzeln nachgewiesen werden muessen.
 */
const ERLAUBT = [
  path.join('lib', 'notifications.ts'),
]

function tsDateien(verzeichnis: string, treffer: string[] = []): string[] {
  for (const eintrag of fs.readdirSync(verzeichnis, { withFileTypes: true })) {
    if (eintrag.name.startsWith('.') || eintrag.name === 'node_modules') continue
    const voll = path.join(verzeichnis, eintrag.name)
    if (eintrag.isDirectory()) tsDateien(voll, treffer)
    else if (/\.tsx?$/.test(eintrag.name)) treffer.push(voll)
  }
  return treffer
}

const dateien = [
  ...tsDateien(path.join(WURZEL, 'app')),
  ...tsDateien(path.join(WURZEL, 'lib')),
].filter(d => !ERLAUBT.some(e => d.endsWith(e)))

describe('Regression: Resend-Aufrufer', () => {
  it('bindet das SDK nur in den zentralen Versandmodulen ein', () => {
    const funde = dateien.filter(datei =>
      /from\s+['"]resend['"]/.test(fs.readFileSync(datei, 'utf-8'))
    ).map(d => path.relative(WURZEL, d))
    expect(funde).toEqual([])
  })

  it('wertet jedes resend.emails.send() aus, statt es nur abzuwarten', () => {
    const funde: string[] = []
    for (const datei of [
      ...tsDateien(path.join(WURZEL, 'app')),
      ...tsDateien(path.join(WURZEL, 'lib')),
    ]) {
      for (const zeile of fs.readFileSync(datei, 'utf-8').split('\n')) {
        const t = zeile.trim()
        if (t.startsWith('*') || t.startsWith('//')) continue
        // `await resend.emails.send(` ohne vorangehendes `=` ist der
        // ungepruefte Aufruf. Mit Zuweisung wird das Ergebnis irgendwo
        // ausgewertet — das prueft der Regelsatz oben nicht mit, dafuer
        // gibt es die Unit-Tests des jeweiligen Moduls.
        if (/^await\s+\w+\.emails\.send\(/.test(t)) {
          funde.push(`${path.relative(WURZEL, datei)}: ${t}`)
        }
      }
    }
    expect(funde).toEqual([])
  })

  it('prueft die Antwort der Resend-HTTP-Schnittstelle, wo sie direkt gerufen wird', () => {
    const funde: string[] = []
    for (const datei of [
      ...tsDateien(path.join(WURZEL, 'app')),
      ...tsDateien(path.join(WURZEL, 'lib')),
    ]) {
      const inhalt = fs.readFileSync(datei, 'utf-8')
      if (!inhalt.includes('api.resend.com/emails')) continue
      // fetch() wirft nur bei Netzfehlern — eine Ablehnung kommt als
      // Statuscode zurueck. Ohne Zuweisung kann sie niemand pruefen.
      if (/^\s*await fetch\('https:\/\/api\.resend\.com\/emails'/m.test(inhalt)) {
        funde.push(path.relative(WURZEL, datei))
      }
    }
    expect(funde).toEqual([])
  })
})
