/**
 * Einbindung — die Stellen, an denen etwas still schiefgehen kann
 *
 * Diese Tests lesen Quelltext. Das ist normalerweise schwach (ein Grep
 * ist kein Test), hier aber der einzige Weg: das Repo hat keine
 * DOM-Testumgebung, und die Fehler, um die es geht, sind gerade KEINE
 * Logikfehler, sondern falsche Verdrahtung — eine Dashboard-Karte, die
 * Abläufe anlegt, oder eine überschriebene Route.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { SCHRITTFOLGEN } from '@/lib/onboarding/schritte'

const lies = (...teile: string[]) => readFileSync(join(process.cwd(), ...teile), 'utf8')

describe('Dashboard-Karten legen keine Abläufe an', () => {
  it('die Karte fragt mit anlegen=0', () => {
    // Sonst hätte jeder Dashboard-Besucher einen begonnenen Ablauf, den
    // er nie angefangen hat — der Erinnerungslauf schriebe ihn an.
    const quelle = lies('components', 'onboarding', 'FortschrittsKarteGeladen.tsx')
    expect(quelle).toContain('anlegen=0')
  })

  it('die Route kennt den Nur-Lesen-Modus', () => {
    const route = lies('app', 'api', 'onboarding', 'fortschritt', 'route.ts')
    expect(route).toContain("parameter.get('anlegen') !== '0'")
    expect(route).toContain('holeFortschritt')
  })

  it('ist in beiden Dashboards eingebunden', () => {
    for (const [bereich, typ] of [['kunde', 'kunde'], ['engel', 'bewerber']] as const) {
      const seite = lies('app', bereich, 'home', 'page.tsx')
      expect(seite, bereich).toContain('FortschrittsKarteGeladen')
      expect(seite, bereich).toContain(`typ="${typ}"`)
    }
  })
})

describe('Assistent ist in allen drei Abläufen eingebunden', () => {
  for (const ablauf of ['bewerber', 'kunde', 'angehoerige'] as const) {
    it(`in ${ablauf}`, () => {
      const seite = lies('app', 'onboarding', ablauf, 'page.tsx')
      expect(seite).toContain('OnboardingAssistent')
      // Ohne einen Weg zu Menschen wäre der Assistent eine Sackgasse.
      expect(seite).toContain('onMensch')
    })
  }
})

describe('Die Mandanten-Einrichtung bleibt unberührt', () => {
  it('app/onboarding/page.tsx ist weiterhin die B2B-Einrichtung', () => {
    // Sie zu überschreiben hieße, einen laufenden B2B-Weg abzuräumen,
    // um einen B2C-Weg zu eröffnen.
    const seite = lies('app', 'onboarding', 'page.tsx')
    expect(seite).toMatch(/IK|Organisation|ITSG/)
    expect(seite).not.toContain('SCHRITTFOLGEN')
  })

  it('der neue Einstieg liegt auf einer eigenen Route', () => {
    expect(existsSync(join(process.cwd(), 'app', 'onboarding', 'start', 'page.tsx'))).toBe(true)
  })
})

describe('Einstiegsseite', () => {
  const seite = lies('app', 'onboarding', 'start', 'page.tsx')

  it('führt in alle drei Abläufe', () => {
    for (const ablauf of ['kunde', 'bewerber', 'angehoerige']) {
      expect(seite).toContain(`/onboarding/${ablauf}`)
    }
  })

  it('hat große Tippflächen', () => {
    // Ein kleines Ziel ist auf dem Telefon der häufigste Abbruchgrund.
    expect(seite).toMatch(/minHeight: \d+/)
    const treffer = seite.match(/minHeight: (\d+)/)
    expect(Number(treffer?.[1] ?? 0)).toBeGreaterThanOrEqual(48)
  })
})

describe('Angehörigen-Ablauf', () => {
  it('hat für jeden Schritt eine Maske', () => {
    const seite = lies('app', 'onboarding', 'angehoerige', 'page.tsx')
    const block = seite.slice(seite.indexOf('const masken'), seite.indexOf('return (', seite.indexOf('const masken')))
    const zugeordnet = [...block.matchAll(/^\s{4}([a-z_]+):/gm)].map(m => m[1])
    for (const schritt of SCHRITTFOLGEN.angehoerige) {
      expect(zugeordnet).toContain(schritt.schluessel)
    }
  })

  it('sagt ausdrücklich, dass mit dem Absenden kein Zugang erteilt ist', () => {
    // Sonst wartet jemand auf Daten, die nicht kommen.
    const masken = lies('components', 'onboarding', 'angehoerige', 'index.tsx')
    expect(masken).toMatch(/noch nicht erteilt/)
  })

  it('reicht nichts bei /absenden ein', () => {
    // Die Route weist 'angehoerige' bewusst ab — der Ablauf endet mit
    // dem Abschluss, es entsteht keine Anfrage im Posteingang.
    const route = lies('app', 'api', 'onboarding', 'absenden', 'route.ts')
    expect(route).toContain("typ !== 'bewerber' && typ !== 'kunde'")
  })
})
