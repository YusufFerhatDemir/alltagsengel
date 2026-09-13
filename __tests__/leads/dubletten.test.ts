/**
 * Dublettenerkennung.
 * @see lib/leads/dubletten.ts
 *
 * Die Fälle stammen aus dem Livebestand vom 13.09.2026: 50 Leads, darin
 * zwei Telefon- und zwei Namensdubletten, keine E-Mail-Dublette.
 */
import { describe, it, expect } from 'vitest'
import {
  MERKMAL_META, findeDubletten, betroffeneZeilen, dublettenVon,
  telefonSchluessel, nameSchluessel, type DublettenZeile,
} from '@/lib/leads/dubletten'

const z = (id: string, t: Partial<DublettenZeile> = {}): DublettenZeile =>
  ({ id, name: null, email: null, telefon: null, ...t })

describe('Telefonnormalisierung', () => {
  it('erkennt dieselbe Nummer in verschiedenen Schreibweisen', () => {
    const k = telefonSchluessel('06181 123456')
    expect(telefonSchluessel('+49 6181 123456')).toBe(k)
    expect(telefonSchluessel('0049-6181-123456')).toBe(k)
    expect(telefonSchluessel('06181/123456')).toBe(k)
    expect(telefonSchluessel('  06181 12 34 56 ')).toBe(k)
  })

  it('vergleicht Fragmente NICHT — sonst entstehen Treffer, die keine sind', () => {
    expect(telefonSchluessel('1234')).toBeNull()
    expect(telefonSchluessel('-')).toBeNull()
    expect(telefonSchluessel('')).toBeNull()
    expect(telefonSchluessel(null)).toBeNull()
  })

  it('unterscheidet echte verschiedene Nummern', () => {
    expect(telefonSchluessel('06181123456')).not.toBe(telefonSchluessel('06181123457'))
  })
})

describe('Namensnormalisierung', () => {
  it('Groß-/Kleinschreibung und Mehrfach-Leerzeichen zählen nicht', () => {
    expect(nameSchluessel('Erika  Müller')).toBe(nameSchluessel('erika müller'))
    expect(nameSchluessel('  Erika Müller ')).toBe('erika müller')
  })
  it('leer ergibt null, nicht den leeren String', () => {
    expect(nameSchluessel('   ')).toBeNull()
    expect(nameSchluessel(undefined)).toBeNull()
  })
})

describe('findeDubletten', () => {
  it('findet Gruppen je Merkmal', () => {
    const d = findeDubletten([
      z('1', { email: 'a@x.de', name: 'Erika Müller' }),
      z('2', { email: 'A@X.de', name: 'Erika Müller' }),
      z('3', { email: 'b@x.de', name: 'Hans Meier' }),
    ])
    expect(d.map(x => x.merkmal)).toEqual(['email', 'name'])
    expect(d[0].ids).toEqual(['1', '2'])
    expect(d[1].ids).toEqual(['1', '2'])
  })

  it('sortiert das stärkste Merkmal nach vorn', () => {
    const d = findeDubletten([
      z('1', { name: 'Gleich Name', telefon: '06181 111111', email: 'a@x.de' }),
      z('2', { name: 'Gleich Name', telefon: '+49 6181 111111', email: 'b@x.de' }),
    ])
    expect(d.map(x => x.merkmal)).toEqual(['telefon', 'name'])
    expect(MERKMAL_META.email.staerke).toBeGreaterThan(MERKMAL_META.telefon.staerke)
    expect(MERKMAL_META.telefon.staerke).toBeGreaterThan(MERKMAL_META.name.staerke)
  })

  it('ein Einzelfall ist keine Dublette', () => {
    expect(findeDubletten([z('1', { email: 'a@x.de' })])).toEqual([])
    expect(findeDubletten([])).toEqual([])
  })

  it('leere Merkmale gruppieren nicht — sonst wäre „kein Wert" eine Dublette', () => {
    // Der klassische Fehler: 40 Zeilen ohne Telefon landen in EINER Gruppe.
    const ohne = Array.from({ length: 40 }, (_, i) => z(`n${i}`, { telefon: '', email: null, name: '  ' }))
    expect(findeDubletten(ohne)).toEqual([])
  })

  it('drei gleiche Zeilen ergeben EINE Gruppe mit drei IDs', () => {
    const d = findeDubletten([
      z('1', { email: 'a@x.de' }), z('2', { email: 'a@x.de' }), z('3', { email: 'a@x.de' }),
    ])
    expect(d).toHaveLength(1)
    expect(d[0].ids).toEqual(['1', '2', '3'])
  })

  it('gibt den Rohwert nicht zurück, sondern den normalisierten Schlüssel', () => {
    const d = findeDubletten([z('1', { email: '  A@X.de ' }), z('2', { email: 'a@x.de' })])
    expect(d[0].schluessel).toBe('a@x.de')
  })
})

describe('Zählung', () => {
  const zeilen = [
    z('1', { email: 'a@x.de', name: 'Erika Müller', telefon: '06181 111111' }),
    z('2', { email: 'a@x.de', name: 'Erika Müller', telefon: '06181 111111' }),
    z('3', { name: 'Hans Meier' }),
  ]
  const d = findeDubletten(zeilen)

  it('zählt betroffene ZEILEN, nicht Gruppengrößen', () => {
    // Drei Gruppen (E-Mail, Telefon, Name) über dieselben zwei Zeilen.
    expect(d.length).toBe(3)
    expect(betroffeneZeilen(d)).toBe(2)
  })

  it('nennt zu einer Zeile alle Merkmale, auf denen der Verdacht beruht', () => {
    expect(dublettenVon(d, '1').map(x => x.merkmal).sort()).toEqual(['email', 'name', 'telefon'])
    expect(dublettenVon(d, '3')).toEqual([])
  })

  it('jedes Merkmal erklärt seine Verlässlichkeit', () => {
    for (const m of Object.values(MERKMAL_META)) {
      expect(m.hinweis.length).toBeGreaterThan(20)
    }
  })
})
