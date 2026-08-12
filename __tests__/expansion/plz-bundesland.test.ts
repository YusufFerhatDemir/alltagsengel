// ═══════════════════════════════════════════════════════════════
// PLZ → BUNDESLAND — Zuordnung und Fail-safe-Verhalten
// ═══════════════════════════════════════════════════════════════
// Der wichtigste Test ist nicht „ist die Zuordnung schön", sondern:
// Kann eine unklare PLZ jemals zu einer Kassenabrechnung führen?
// Antwort muss immer NEIN sein.
// ═══════════════════════════════════════════════════════════════

import { describe, expect, it } from 'vitest'
import {
  bundeslandCodeFuerPlz,
  bundeslandFuerPlz,
  eindeutigesBundeslandFuerPlz,
  isHessenPlz,
  normalizeBundesland,
  normalizePlz,
  resolvePlz,
} from '@/lib/expansion/plz-bundesland'
import { BUNDESLAND_CODES, istBundeslandCode } from '@/lib/expansion/types'

describe('normalizePlz / resolvePlz', () => {
  it('extrahiert die PLZ aus Freitext', () => {
    expect(normalizePlz('60311 Frankfurt am Main ')).toBe('60311')
    expect(normalizePlz('Frankfurt')).toBeNull()
    expect(normalizePlz('123')).toBeNull()
    expect(normalizePlz(null)).toBeNull()
  })

  it('bevorzugt postal_code vor dem location-Freitext', () => {
    expect(resolvePlz('60311', '65183 Wiesbaden')).toBe('60311')
    expect(resolvePlz(null, '65183 Wiesbaden')).toBe('65183')
    expect(resolvePlz(null, 'Usingen')).toBeNull()
  })
})

describe('Zuordnung der Landeshauptstädte', () => {
  const hauptstaedte: Array<[string, string]> = [
    ['70173', 'baden_wuerttemberg'],   // Stuttgart
    ['80331', 'bayern'],               // München
    ['10115', 'berlin'],               // Berlin
    ['14467', 'brandenburg'],          // Potsdam
    ['28195', 'bremen'],               // Bremen
    ['20095', 'hamburg'],              // Hamburg
    ['65183', 'hessen'],               // Wiesbaden
    ['19053', 'mecklenburg_vorpommern'], // Schwerin
    ['30159', 'niedersachsen'],        // Hannover
    ['40213', 'nordrhein_westfalen'],  // Düsseldorf
    ['55116', 'rheinland_pfalz'],      // Mainz
    ['66111', 'saarland'],             // Saarbrücken
    ['01067', 'sachsen'],              // Dresden
    ['39104', 'sachsen_anhalt'],       // Magdeburg
    ['24103', 'schleswig_holstein'],   // Kiel
    ['99084', 'thueringen'],           // Erfurt
  ]

  it.each(hauptstaedte)('%s → %s', (plz, erwartet) => {
    expect(bundeslandCodeFuerPlz(plz)).toBe(erwartet)
  })

  it('deckt alle 16 Bundesländer ab', () => {
    const getroffen = new Set(hauptstaedte.map(([, code]) => code))
    expect(getroffen.size).toBe(BUNDESLAND_CODES.length)
  })
})

describe('Grenzfälle mit gepflegter 5-stelliger Ausnahme', () => {
  it('hessische Exklaven mit fremdem Präfix sind sicher Hessen', () => {
    for (const plz of ['55246', '55252', '68519', '68623', '69434', '69509']) {
      const treffer = bundeslandFuerPlz(plz)
      expect(treffer.code).toBe('hessen')
      expect(treffer.sicher).toBe(true)
      expect(treffer.quelle).toBe('ausnahme')
    }
  })

  it('nicht-hessische PLZ mit hessischem Präfix werden korrekt ausgeschlossen', () => {
    expect(bundeslandCodeFuerPlz('34346')).toBe('niedersachsen')  // Hann. Münden
    expect(bundeslandCodeFuerPlz('34414')).toBe('nordrhein_westfalen') // Warburg
    expect(bundeslandCodeFuerPlz('65582')).toBe('rheinland_pfalz') // Diez
  })

  it('Leitregionen, die eine Landesgrenze überschreiten, gelten als unsicher', () => {
    // Untermain: 630-636 Hessen, 637-639 Bayern — durch 3-stellige Regel sicher
    expect(bundeslandFuerPlz('63065')).toMatchObject({ code: 'hessen', sicher: true })
    expect(bundeslandFuerPlz('63739')).toMatchObject({ code: 'bayern', sicher: true })

    // Ohne 5-stellige Ausnahme bleibt die Region unsicher
    expect(bundeslandFuerPlz('21444').sicher).toBe(false)  // Winsen/Reinbek-Grenze
    expect(bundeslandFuerPlz('66822').sicher).toBe(false)  // Saarland/Pfalz-Grenze
  })
})

describe('Fail-safe: Kassenabrechnung nur bei eindeutiger Zuordnung', () => {
  it('unbekannte PLZ liefert null', () => {
    expect(bundeslandFuerPlz('11111').code).toBeNull()   // 11er nicht vergeben
    expect(bundeslandFuerPlz('05123').code).toBeNull()   // 05er nicht vergeben
    expect(bundeslandFuerPlz('43210').code).toBeNull()   // 43er nicht vergeben
    expect(bundeslandFuerPlz(null).code).toBeNull()
    expect(bundeslandFuerPlz('abc').code).toBeNull()
  })

  it('eindeutigesBundeslandFuerPlz verweigert Grenzregionen', () => {
    expect(eindeutigesBundeslandFuerPlz('60311')).toBe('hessen')
    expect(eindeutigesBundeslandFuerPlz('21444')).toBeNull()
    expect(eindeutigesBundeslandFuerPlz('66822')).toBeNull()
    expect(eindeutigesBundeslandFuerPlz(null)).toBeNull()
  })

  it('jede zurückgegebene Kennung ist ein gültiger Katalog-Code', () => {
    for (let n = 1000; n <= 99999; n += 137) {
      const plz = String(n).padStart(5, '0')
      const code = bundeslandCodeFuerPlz(plz)
      if (code !== null) expect(istBundeslandCode(code)).toBe(true)
    }
  })
})

describe('normalizeBundesland', () => {
  it('akzeptiert Klartext, Code, ISO und Kurzform', () => {
    expect(normalizeBundesland('Hessen')).toBe('hessen')
    expect(normalizeBundesland('hessen')).toBe('hessen')
    expect(normalizeBundesland('DE-HE')).toBe('hessen')
    expect(normalizeBundesland('HE')).toBe('hessen')
    expect(normalizeBundesland('Baden-Württemberg')).toBe('baden_wuerttemberg')
    expect(normalizeBundesland('baden_wuerttemberg')).toBe('baden_wuerttemberg')
    expect(normalizeBundesland('Nordrhein-Westfalen')).toBe('nordrhein_westfalen')
    expect(normalizeBundesland('Thüringen')).toBe('thueringen')
    expect(normalizeBundesland('Mecklenburg-Vorpommern')).toBe('mecklenburg_vorpommern')
  })

  it('liefert null statt zu raten', () => {
    expect(normalizeBundesland('Tirol')).toBeNull()
    expect(normalizeBundesland('')).toBeNull()
    expect(normalizeBundesland(null)).toBeNull()
    expect(normalizeBundesland('XX')).toBeNull()
  })
})

describe('Abwärtskompatibilität zu isHessenPlz', () => {
  it('behält das Verhalten der alten Hessen-Prüfung bei', () => {
    for (const plz of ['60311', '65933', '63065', '34117', '36037', '37269', '55246']) {
      expect(isHessenPlz(plz)).toBe(true)
    }
    for (const plz of ['55118', '63739', '36404', '34346', '65582', '99999', 'abc']) {
      expect(isHessenPlz(plz)).toBe(false)
    }
  })
})
