/**
 * Cookie-Einwilligung — Verdrahtung
 *
 * Quelltext-Prüfungen. Das ist normalerweise schwach, hier aber der
 * einzige Weg: das Repo hat keine DOM-Testumgebung, und die Fehler, um
 * die es geht, sind keine Logikfehler, sondern falsche Verdrahtung —
 * ein Pixel, das die falsche Kategorie prüft, oder ein Ereignis-Handler,
 * der auf einen Wert vergleicht, den es nicht mehr gibt.
 *
 * Genau so ein toter Handler war beim Umbau entstanden: der Vergleich
 * `detail === 'accepted'` blieb stehen, während das Ereignis seither den
 * vollständigen Zustand trägt. TypeScript sah das nicht (Vergleich auf
 * `any`), und der Pixel wäre nach der Zustimmung nie nachgeladen worden.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const lies = (...t: string[]) => readFileSync(join(process.cwd(), ...t), 'utf8')

const MARKETING_PIXEL = ['MetaPixel.tsx', 'TikTokPixel.tsx']

describe('Kein Tracker prüft mehr auf den alten Gesamtzustand', () => {
  for (const datei of [...MARKETING_PIXEL, 'GoogleTagManager.tsx', 'VisitorTracker.tsx']) {
    it(datei, () => {
      const quelle = lies('components', datei)
      // 'accepted' gibt es als Ereignis-Inhalt nicht mehr — ein Vergleich
      // darauf ist toter Code.
      expect(quelle).not.toMatch(/detail === 'accepted'/)
      expect(quelle).not.toMatch(/getCookieConsent\(\)/)
    })
  }
})

describe('Jeder Tracker hängt an seiner Kategorie', () => {
  for (const datei of MARKETING_PIXEL) {
    it(`${datei} an marketing`, () => {
      const quelle = lies('components', datei)
      expect(quelle).toMatch(/darf\([\s\S]{0,80}?'marketing'\)/)
      expect(quelle).not.toMatch(/'statistik'/)
    })
  }

  it('VisitorTracker an statistik', () => {
    // Reichweitenmessung. Vorher verlangte er die VOLLE Zustimmung — wer
    // nur der Statistik zugestimmt hatte, wurde nicht gezählt, obwohl er
    // genau dem zugestimmt hatte.
    const quelle = lies('components', 'VisitorTracker.tsx')
    expect(quelle).toMatch(/darf\([\s\S]{0,80}?'statistik'\)/)
  })

  it('GoogleTagManager überträgt beide Kategorien getrennt', () => {
    const quelle = lies('components', 'GoogleTagManager.tsx')
    expect(quelle).toContain('gtagEinwilligung')
    // Keine fest verdrahteten 'granted'-Werte mehr — die kämen sonst
    // auch bei reiner Statistik-Zustimmung durch.
    expect(quelle).not.toMatch(/'ad_storage':\s*'granted'/)
  })
})

describe('Widerruf wird aktiv übertragen', () => {
  it('der Consent-Mode wird auch bei Ablehnung aktualisiert', () => {
    // Ohne aktive Rücksetzung gälte nach einem Widerruf die frühere
    // Erlaubnis weiter.
    const quelle = lies('components', 'GoogleTagManager.tsx')
    expect(quelle).toMatch(/uebertrageConsent\(zustand\)/)
    expect(quelle).toMatch(/IMMER/)
  })

  it('der Banner meldet jede Entscheidung, nicht nur die Zustimmung', () => {
    const quelle = lies('components', 'CookieConsent.tsx')
    // uebernehmen() wird von allen drei Wegen aufgerufen.
    expect(quelle).toMatch(/nurNotwendig\(\)/)
    expect(quelle).toMatch(/alleAkzeptiert\(\)/)
    expect(quelle).toMatch(/auswahl\(\{ statistik, marketing \}\)/)
  })
})

describe('Gleiche Prominenz der beiden Hauptknöpfe', () => {
  const quelle = lies('components', 'CookieConsent.tsx')

  it('beide nutzen denselben Stil', () => {
    // Eine Einwilligung, die über eine gestalterische Schieflage zustande
    // kommt, ist keine freiwillige (Art. 4 Nr. 11 DSGVO). Ein gemeinsamer
    // Stil ist die einzige Form, die nicht wieder auseinanderdriftet.
    const treffer = quelle.match(/style=\{hauptKnopf\}/g) ?? []
    expect(treffer.length).toBe(2)
  })

  it('hat keinen Goldverlauf mehr auf nur einem Knopf', () => {
    expect(quelle).not.toMatch(/linear-gradient\(135deg, #C9963C/)
  })

  it('stellt das Ablehnen zuerst', () => {
    // Nur im JSX vergleichen: im Kopfkommentar stehen beide Beschriftungen
    // ebenfalls, dort in umgekehrter Reihenfolge.
    const jsx = quelle.slice(quelle.indexOf('style={hauptKnopf}'))
    expect(jsx.indexOf('Nur notwendige')).toBeLessThan(jsx.indexOf('Alle akzeptieren'))
  })

  it('wählt nichts vor', () => {
    // useState(false) für beide Kategorien — kein vorangekreuztes Kästchen.
    expect(quelle).toMatch(/useState\(false\)/)
    expect(quelle).not.toMatch(/useState\(true\)/)
  })
})

describe('Der Banner verdeckt nichts dauerhaft', () => {
  it('setzt eine Höhe, solange er sichtbar ist', () => {
    expect(lies('components', 'CookieConsent.tsx')).toContain('--ae-consent-hoehe')
  })

  it('die Seite hält den Platz frei', () => {
    // Auf einem iPhone 14 lagen die Absende-Knöpfe unter dem Banner.
    const css = lies('app', 'globals.css')
    expect(css).toContain('--ae-consent-hoehe')
    expect(css).toMatch(/padding-bottom: var\(--ae-consent-hoehe, 0\)/)
  })

  it('lässt ohne Banner keinen Rand stehen', () => {
    // Fallback 0, nicht ein fester Wert.
    expect(lies('app', 'globals.css')).toMatch(/var\(--ae-consent-hoehe, 0\)/)
  })
})

describe('Einstellungen sind später erreichbar', () => {
  it('der Footer trägt den Link', () => {
    expect(lies('components', 'SiteFooter.tsx')).toContain('CookieSettingsLink')
  })

  it('die Datenschutzerklärung trägt ihn auch', () => {
    expect(lies('app', 'datenschutz', 'page.tsx')).toContain('CookieSettingsLink')
  })

  it('der Link öffnet den Banner erneut', () => {
    expect(lies('components', 'CookieSettingsLink.tsx')).toContain('openCookieSettings')
    expect(lies('components', 'CookieConsent.tsx')).toContain('ae_open_cookie_settings')
  })
})

describe('Google-Ads-Code bleibt technisch erhalten', () => {
  const quelle = lies('components', 'GoogleTagManager.tsx')

  it('die Tag-IDs stehen weiterhin da', () => {
    // Anforderung 8: der Code darf bleiben, er wird nur nicht scharf
    // geschaltet. Ein Entfernen hätte die verifizierte Tag-Einrichtung
    // bei Google zerstört.
    expect(quelle).toMatch(/AW-\d+/)
    expect(quelle).toMatch(/GTM-\w+/)
  })

  it('der Default steht auf denied, bevor irgendein Tag lädt', () => {
    const layout = lies('app', 'layout.tsx')
    const defaultIdx = layout.indexOf("gtag('consent', 'default'")
    const tagIdx = layout.indexOf('<GoogleTagManager')
    expect(defaultIdx).toBeGreaterThan(-1)
    expect(defaultIdx).toBeLessThan(tagIdx)
    for (const schalter of ['ad_storage', 'ad_user_data', 'ad_personalization', 'analytics_storage']) {
      expect(layout).toMatch(new RegExp(`'${schalter}': 'denied'`))
    }
  })

  it('im DiPA-Bereich lädt gar nichts', () => {
    // Werbefreiheit und Tracker-Verbot nach DiPAV Anlage 2.
    expect(quelle).toContain("pathname.startsWith('/pflegecoach')")
  })
})
