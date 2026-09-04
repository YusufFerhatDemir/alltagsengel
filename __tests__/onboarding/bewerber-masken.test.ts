/**
 * Bewerber-Onboarding — Masken und Zusammenfassung
 *
 * Die Komponenten selbst sind nicht testbar (keine DOM-Umgebung). Prüfbar
 * ist aber, ob Schrittfolge und Maskenzuordnung deckungsgleich sind — ein
 * fehlender Schlüssel ergäbe einen Formularschritt ohne Eingabefelder,
 * durch den niemand hindurchkäme.
 *
 * Und die Zusammenfassung: dort entscheidet sich, ob jemand seine eigenen
 * Angaben wiedererkennt oder `teilzeit_klein` liest.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SCHRITTFOLGEN } from '@/lib/onboarding/schritte'
import {
  baueBloecke, feldLabel, offenePflichtangaben, wertText,
} from '@/components/onboarding/bewerber/zusammenfassung'

/**
 * Die Maskenzuordnung steht in app/onboarding/bewerber/page.tsx. Sie hier
 * zu importieren hiesse, React im Node-Modus zu laden — deshalb wird die
 * Zuordnung aus der Quelle gelesen. Das prueft genau das, was zaehlt:
 * dass jeder Schluessel der Schrittfolge dort vorkommt.
 */
function zugeordneteSchluessel(): string[] {
  const quelle = readFileSync(
    join(process.cwd(), 'app', 'onboarding', 'bewerber', 'page.tsx'), 'utf8',
  )
  const block = quelle.slice(
    quelle.indexOf('const masken'),
    quelle.indexOf('return (', quelle.indexOf('const masken')),
  )
  return [...block.matchAll(/^\s{4}([a-z_]+):/gm)].map(m => m[1])
}

describe('Maskenzuordnung', () => {
  it('deckt jeden Schritt der Bewerberfolge ab', () => {
    const zugeordnet = zugeordneteSchluessel()
    for (const schritt of SCHRITTFOLGEN.bewerber) {
      expect(zugeordnet).toContain(schritt.schluessel)
    }
  })

  it('ordnet keine Maske zu, die es im Ablauf nicht gibt', () => {
    // Eine verwaiste Maske ist ein Hinweis auf einen umbenannten
    // Schluessel — und der wuerde alte Antworten falsch zuordnen.
    const bekannt = SCHRITTFOLGEN.bewerber.map(s => s.schluessel)
    for (const schluessel of zugeordneteSchluessel()) {
      expect(bekannt).toContain(schluessel)
    }
  })

  it('hat für jeden Formularschritt eine eigene Komponentendatei', () => {
    const index = readFileSync(
      join(process.cwd(), 'components', 'onboarding', 'bewerber', 'index.ts'), 'utf8',
    )
    expect((index.match(/export \{ default as Schritt\d\d/g) ?? []).length)
      .toBe(SCHRITTFOLGEN.bewerber.length)
  })
})

describe('wertText', () => {
  it('macht Rohwerte lesbar', () => {
    expect(wertText('umfang', 'teilzeit_klein')).toBe('Kleine Teilzeit (etwa 10–20 Std./Woche)')
    expect(wertText('fuehrungszeugnis_status', 'beantrage_noch')).toBe('Wird noch beantragt')
    expect(wertText('deutsch_niveau', 'sehr_gut')).toBe('Sehr gut')
  })

  it('setzt beim Radius die Einheit dazu', () => {
    expect(wertText('radius_km', '15')).toBe('bis 15 km')
  })

  it('verbindet Listen zu einer Zeile', () => {
    expect(wertText('wochentage', ['mo', 'mi', 'sa'])).toBe('Montag, Mittwoch, Samstag')
  })

  it('zeigt Fehlendes als Strich statt es zu verstecken', () => {
    // Eine fehlende Angabe soll in der Pruefung sichtbar sein.
    expect(wertText('telefon', '')).toBe('—')
    expect(wertText('telefon', null)).toBe('—')
    expect(wertText('wochentage', [])).toBe('—')
  })

  it('laesst unbekannte Werte unveraendert stehen', () => {
    // Freitext (Name, Ort) darf nicht durch eine Abbildung verfaelscht werden.
    expect(wertText('stadt', 'Bad Homburg')).toBe('Bad Homburg')
    expect(wertText('vorname', 'Gut')).toBe('Gut')
  })

  it('beschriftet Felder auf Deutsch', () => {
    expect(feldLabel('geburtsdatum')).toBe('Geburtsdatum')
    expect(feldLabel('radius_km')).toBe('Einsatzradius')
    expect(feldLabel('unbekannt_xy')).toBe('unbekannt_xy')
  })
})

describe('baueBloecke', () => {
  const daten = {
    kontakt: { vorname: 'Erika', nachname: 'Müller', telefon: '069', email: 'e@m.de', geburtsdatum: '1980-01-01' },
    einsatzgebiet: { plz: '60313', stadt: 'Frankfurt', radius_km: '15' },
    fuehrerschein: { fuehrerschein: 'ja', fahrzeug: 'eigenes' },
  }

  it('zeigt nur Formularschritte', () => {
    const schluessel = baueBloecke(daten).map(b => b.schluessel)
    expect(schluessel).not.toContain('willkommen')
    expect(schluessel).not.toContain('zusammenfassung')
    expect(schluessel).not.toContain('absenden')
    expect(schluessel).toContain('kontakt')
  })

  it('nennt die Schrittnummer für den Korrektur-Knopf', () => {
    const block = baueBloecke(daten).find(b => b.schluessel === 'kontakt')
    // Willkommen ist Schritt 1, die Kontaktdaten sind Schritt 2.
    expect(block?.nummer).toBe(2)
  })

  it('zeigt auch freiwillig ergänzte Angaben', () => {
    // `fahrzeug` steht nicht in erwarteteAngaben — es darf in der
    // Pruefung trotzdem nicht fehlen.
    const block = baueBloecke(daten).find(b => b.schluessel === 'fuehrerschein')
    expect(block?.eintraege.map(e => e.feld)).toContain('fahrzeug')
  })

  it('kommt mit einem völlig leeren Stand zurecht', () => {
    const bloecke = baueBloecke({})
    expect(bloecke.length).toBeGreaterThan(0)
    expect(bloecke.every(b => b.eintraege.every(e => e.text === '—'))).toBe(true)
  })
})

describe('offenePflichtangaben', () => {
  it('meldet fehlende Pflichtangaben mit Klartext-Beschriftung', () => {
    const offen = offenePflichtangaben({ kontakt: { vorname: 'Erika' } })
    expect(offen).toContain('Nachname')
    expect(offen).toContain('E-Mail')
    expect(offen).not.toContain('Vorname')
  })

  it('zaehlt freiwillige Schritte nicht mit', () => {
    // Erfahrung und Unterlagen sind ueberspringbar.
    const offen = offenePflichtangaben({})
    expect(offen).not.toContain('Lebenslauf')
    expect(offen).not.toContain('Bisherige Tätigkeiten')
  })

  it('ist leer, wenn alle Pflichtangaben da sind', () => {
    expect(offenePflichtangaben({
      kontakt: { vorname: 'E', nachname: 'M', geburtsdatum: '1980-01-01', telefon: '069', email: 'e@m.de' },
      einsatzgebiet: { plz: '60313', stadt: 'Frankfurt', radius_km: '15' },
      fuehrerschein: { fuehrerschein: 'nein' },
      sprachen: { deutsch_niveau: 'gut' },
      verfuegbarkeit: { wochentage: ['mo'], zeitfenster: ['vormittag'] },
      stundenumfang: { umfang: 'minijob' },
      fuehrungszeugnis: { fuehrungszeugnis_status: 'beantrage_noch' },
    })).toEqual([])
  })
})
