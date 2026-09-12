/**
 * Marketing Execution Engine — Zustandsmodell, Übergänge, Schreibsatz.
 * @see lib/marketing/engine.ts
 */
import { describe, it, expect } from 'vitest'
import {
  MARKETING_STUFEN, DB_STATUS_ERLAUBT, UEBERGAENGE, NOTIZ_MARKER,
  istMarketingStufe, dbStatusFuer, darfWechseln, stufeAusDbStatus,
  nachNotiz, ausNotiz, schreibsatzFuer, utmFuer, zielUrlMitUtm,
  type MarketingStueck, type MarketingStufe,
} from '@/lib/marketing/engine'

const JETZT = new Date('2026-09-12T12:00:00Z')

function stueck(teil: Partial<MarketingStueck> = {}): MarketingStueck {
  return { stufe: 'idee', projekt: 'Alltagsengel', plattform: 'Instagram', ...teil }
}

describe('Zustandsmodell', () => {
  it('sieben Stufen, jede auf einen vom CHECK erlaubten Status abgebildet', () => {
    expect(Object.keys(MARKETING_STUFEN)).toHaveLength(7)
    for (const stufe of Object.keys(MARKETING_STUFEN) as MarketingStufe[]) {
      expect(DB_STATUS_ERLAUBT, stufe).toContain(dbStatusFuer(stufe))
    }
  })

  it('jede Stufe hat Etikett und Aufgabe', () => {
    for (const [key, s] of Object.entries(MARKETING_STUFEN)) {
      expect(s.label.length, key).toBeGreaterThan(3)
      expect(s.aufgabe.length, key).toBeGreaterThan(8)
    }
  })

  it('istMarketingStufe erkennt nur echte Stufen', () => {
    expect(istMarketingStufe('review')).toBe(true)
    expect(istMarketingStufe('approved')).toBe(false)
    expect(istMarketingStufe(null)).toBe(false)
  })
})

describe('Übergänge', () => {
  it('der Weg führt über Review und Freigabe — kein Entwurf geht direkt raus', () => {
    expect(darfWechseln('entwurf', 'geplant')).toBe(false)
    expect(darfWechseln('entwurf', 'veroeffentlicht')).toBe(false)
    expect(darfWechseln('review', 'veroeffentlicht')).toBe(false)
    expect(darfWechseln('geplant', 'veroeffentlicht')).toBe(true)
  })

  it('der vollständige Weg ist gangbar', () => {
    const weg: MarketingStufe[] = ['idee', 'entwurf', 'review', 'freigegeben', 'geplant', 'veroeffentlicht']
    for (let i = 0; i < weg.length - 1; i++) {
      expect(darfWechseln(weg[i], weg[i + 1]), `${weg[i]} → ${weg[i + 1]}`).toBe(true)
    }
  })

  it('zurück ist möglich, wo es fachlich Sinn hat', () => {
    expect(darfWechseln('review', 'entwurf')).toBe(true)
    expect(darfWechseln('freigegeben', 'review')).toBe(true)
    expect(darfWechseln('geplant', 'freigegeben')).toBe(true)
  })

  it('verworfen ist aus jedem offenen Zustand erreichbar', () => {
    for (const von of ['idee', 'entwurf', 'review', 'freigegeben', 'geplant'] as MarketingStufe[]) {
      expect(darfWechseln(von, 'verworfen'), von).toBe(true)
    }
  })

  it('veröffentlicht ist ein Endzustand — was draußen war, war draußen', () => {
    expect(UEBERGAENGE.veroeffentlicht).toEqual([])
    for (const nach of Object.keys(MARKETING_STUFEN) as MarketingStufe[]) {
      expect(darfWechseln('veroeffentlicht', nach), nach).toBe(false)
    }
  })

  it('jedes Übergangsziel ist selbst eine gültige Stufe', () => {
    for (const [von, ziele] of Object.entries(UEBERGAENGE)) {
      for (const z of ziele) expect(istMarketingStufe(z), `${von} → ${z}`).toBe(true)
    }
  })
})

describe('schreibsatzFuer', () => {
  it('weist einen nicht vorgesehenen Übergang ab', () => {
    const r = schreibsatzFuer(stueck({ stufe: 'entwurf' }), 'veroeffentlicht', JETZT)
    expect(r.satz).toBeNull()
    expect(r.fehler).toMatch(/nicht vorgesehen/)
  })

  it('keine Freigabe ohne Caption', () => {
    const r = schreibsatzFuer(stueck({ stufe: 'review' }), 'freigegeben', JETZT)
    expect(r.fehler).toMatch(/Caption/)
  })

  it('keine Planung ohne Termin', () => {
    const r = schreibsatzFuer(stueck({ stufe: 'freigegeben', caption: 'Text' }), 'geplant', JETZT)
    expect(r.fehler).toMatch(/Termin/)
  })

  it('setzt den Zeitstempel beim Veröffentlichen — der DB-CHECK verlangt ihn', () => {
    const r = schreibsatzFuer(
      stueck({ stufe: 'geplant', caption: 'Text', datum: '2026-09-14' }), 'veroeffentlicht', JETZT)
    expect(r.fehler).toBeNull()
    expect(r.satz!.status).toBe('veroeffentlicht')
    expect(r.satz!.veroeffentlicht_am).toBe(JETZT.toISOString())
  })

  it('lässt den Zeitstempel bei jedem anderen Zustand leer', () => {
    const r = schreibsatzFuer(stueck({ stufe: 'idee' }), 'entwurf', JETZT)
    expect(r.satz!.veroeffentlicht_am).toBeNull()
    expect(r.satz!.status).toBe('offen')
  })

  it('die neue Stufe steht in der Notiz, die Felder bleiben erhalten', () => {
    const r = schreibsatzFuer(
      stueck({ stufe: 'review', caption: 'Hallo', hook: 'Aufhänger', kampagne: 'KW38' }), 'freigegeben', JETZT)
    const zurueck = ausNotiz(r.satz!.notiz, r.satz!.status)!
    expect(zurueck.stufe).toBe('freigegeben')
    expect(zurueck.caption).toBe('Hallo')
    expect(zurueck.hook).toBe('Aufhänger')
    expect(zurueck.kampagne).toBe('KW38')
  })
})

describe('Notiz — Nutzlast und Altbestand', () => {
  it('geht verlustfrei hin und zurück', () => {
    const s = stueck({ stufe: 'geplant', caption: 'C', datum: '2026-09-20', ergebnis: 'x' })
    expect(ausNotiz(nachNotiz(s), 'geplant')).toEqual(s)
  })

  it('Altbestand ohne Marker: Stufe aus dem Status, Notiz bleibt als Ergebnis erhalten', () => {
    const r = ausNotiz('Handnotiz aus dem Altbestand', 'geplant')!
    expect(r.stufe).toBe('freigegeben')
    expect(r.ergebnis).toBe('Handnotiz aus dem Altbestand')
  })

  it('kaputte Nutzlast wird nicht zum Absturz, sondern zum Altbestand', () => {
    const r = ausNotiz(NOTIZ_MARKER + '{kein json', 'offen')!
    expect(r.stufe).toBe('idee')
  })

  it('unbekannter Status ergibt null statt einer erfundenen Stufe', () => {
    expect(ausNotiz(null, 'irgendwas')).toBeNull()
    expect(stufeAusDbStatus(null)).toBeNull()
  })

  it('grobe → feine Stufe behauptet nie mehr als der Status sagt', () => {
    expect(stufeAusDbStatus('offen')).toBe('idee')
    expect(stufeAusDbStatus('geplant')).toBe('freigegeben')
  })
})

describe('UTM', () => {
  it('baut Quelle und Kampagne aus den Feldern', () => {
    expect(utmFuer({ plattform: 'Instagram', kampagne: 'KW 38 Recruiting' }))
      .toBe('utm_source=instagram&utm_medium=social&utm_campaign=kw-38-recruiting')
  })

  it('ohne Kampagne bleibt es nachvollziehbar statt leer', () => {
    expect(utmFuer({ plattform: 'LinkedIn' })).toContain('utm_campaign=ohne-kampagne')
  })

  it('Umlaute und Sonderzeichen werden zu Bindestrichen, keine Doppelten', () => {
    expect(utmFuer({ plattform: 'Facebook & Instagram', kampagne: 'Über—uns!' }))
      .toBe('utm_source=facebook-instagram&utm_medium=social&utm_campaign=ber-uns')
  })

  it('hängt an eine URL mit und ohne bestehende Parameter richtig an', () => {
    expect(zielUrlMitUtm('https://alltagsengel.care/engel-werden', { plattform: 'Instagram' }))
      .toContain('/engel-werden?utm_source=instagram')
    expect(zielUrlMitUtm('https://alltagsengel.care/x?a=1', { plattform: 'Instagram' }))
      .toContain('?a=1&utm_source=instagram')
  })
})
